/**
 * Cenários de teste (regressão): roda uma conversa roteirizada pelo mesmo
 * agente de atendimento e pede a um modelo "avaliador" para conferir as
 * expectativas escritas em linguagem natural (DEVE / NÃO DEVE).
 */
import { randomInt } from "node:crypto";
import { normalizePlate } from "@despachante/shared";
import { db, must } from "./db";
import { runAttendance } from "./ai/agent";
import { findServiceBySlug } from "./ai/context";
import { modelFor, parseJsonLoose, tryModelFor } from "./ai/llm";

type Setup = { service_slug?: string; stage_key?: string; client_name?: string; plate?: string };
type Judge = { passou: boolean; criterios: { criterio: string; ok: boolean; comentario?: string }[]; resumo: string };

async function cleanupPrevious(scenarioId: string, previous: Record<string, unknown> | null) {
  const { data: convs } = await db.from("conversations").select("id, contact_id").eq("scenario_id", scenarioId);
  for (const c of convs ?? []) {
    await db.from("cases").delete().eq("conversation_id", c.id);
    await db.from("contacts").delete().eq("id", c.contact_id); // apaga conversa e mensagens em cascata
  }
  const clientIds = (previous?.created_client_ids as string[] | undefined) ?? [];
  if (clientIds.length) await db.from("clients").delete().in("id", clientIds).eq("is_test", true);
}

export async function runScenario(scenarioId: string) {
  const sc = must(await db.from("test_scenarios").select("*").eq("id", scenarioId).single(), "cenário");
  await db.from("test_scenarios").update({ last_status: "running", last_run_at: new Date().toISOString() }).eq("id", scenarioId);
  await cleanupPrevious(scenarioId, sc.last_result as Record<string, unknown> | null);

  const setup = (sc.setup ?? {}) as Setup;
  const channel = (await db.from("channels").select("id").eq("kind", "simulator").eq("active", true).order("created_at").limit(1).maybeSingle()).data;
  const phone = `55419${String(randomInt(10_000_000, 99_999_999))}`;
  const contact = must(
    await db.from("contacts").insert({ phone, wa_name: setup.client_name ?? "Cliente Teste", is_test: true }).select("*").single(),
    "contato de teste",
  );
  const conv = must(
    await db
      .from("conversations")
      .insert({ contact_id: contact.id, is_test: true, scenario_id: scenarioId, last_channel_id: channel?.id ?? null, mode: "auto" })
      .select("*")
      .single(),
    "conversa de teste",
  );

  const createdClientIds: string[] = [];
  if (setup.service_slug) {
    const service = await findServiceBySlug(setup.service_slug);
    if (!service) throw new Error(`Cenário: serviço "${setup.service_slug}" não existe`);
    const client = must(await db.from("clients").insert({ name: setup.client_name ?? "Cliente Teste", is_test: true }).select("*").single(), "cliente de teste");
    createdClientIds.push(client.id);
    await db.from("contact_clients").insert({ contact_id: contact.id, client_id: client.id, relation: "titular", verified: true, is_primary: true });
    const { data: stages } = await db.from("service_stages").select("*").eq("service_id", service.id).order("sort_order");
    const stage = stages?.find((s) => s.key === setup.stage_key) ?? stages?.[0];
    if (!stage) throw new Error("Serviço sem fases");
    let vehicleId: string | null = null;
    const plate = setup.plate ? normalizePlate(setup.plate) : null;
    if (plate) {
      vehicleId = must(await db.from("vehicles").insert({ plate, client_id: client.id, is_test: true }).select("id").single(), "veículo").id;
    }
    const kase = must(
      await db
        .from("cases")
        .insert({
          service_id: service.id, stage_id: stage.id, client_id: client.id, contact_id: contact.id, conversation_id: conv.id,
          vehicle_id: vehicleId, is_test: true, title: "Caso do cenário de teste",
          fields: (plate ? { placa: { value: plate, status: "validado", source: "human", updated_at: new Date().toISOString() } } : {}) as never,
        })
        .select("id")
        .single(),
      "caso de teste",
    );
    await db.from("conversations").update({ active_case_id: kase.id }).eq("id", conv.id);
  }

  const transcript: { de: "cliente" | "ia"; texto: string }[] = [];
  const runIds: string[] = [];
  const messages = Array.isArray(sc.client_messages) ? (sc.client_messages as string[]) : [];
  for (const text of messages) {
    await db.from("messages").insert({
      conversation_id: conv.id, channel_id: channel?.id ?? null, direction: "in", sender: "contact", kind: "text", body: text,
    });
    transcript.push({ de: "cliente", texto: text });
    const r = await runAttendance(conv.id, { forceMode: "auto", scenario: true });
    if (r.runId) runIds.push(r.runId);
    for (const t of r.messages ?? []) transcript.push({ de: "ia", texto: t });
  }

  const { data: runs } = runIds.length
    ? await db.from("ai_runs").select("id, tools, rationale, handoff, confidence").in("id", runIds)
    : { data: [] };
  const toolSummary = (runs ?? []).flatMap((r) =>
    ((r.tools ?? []) as { name: string; args: unknown; ok: boolean }[]).map((t) => `${t.name}(${JSON.stringify(t.args).slice(0, 200)}) → ${t.ok ? "ok" : "erro"}`),
  );
  const handoff = (runs ?? []).some((r) => r.handoff);

  const judgeModel = (await tryModelFor("ensinar")) ?? (await modelFor("atendimento"));
  const res = await judgeModel.client.chat.completions.create({
    model: judgeModel.model,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Você avalia atendimentos de uma assistente virtual de um despachante. Compare a conversa e as ações com as EXPECTATIVAS. " +
          "Cada linha das expectativas é um critério. Seja rigoroso mas justo. Responda SOMENTE com JSON no formato: " +
          '{"passou": boolean, "criterios": [{"criterio": string, "ok": boolean, "comentario": string}], "resumo": string}',
      },
      {
        role: "user",
        content: [
          `EXPECTATIVAS:\n${sc.expectations}`,
          `CONVERSA:\n${transcript.map((t) => `${t.de === "cliente" ? "Cliente" : "IA"}: ${t.texto}`).join("\n")}`,
          `AÇÕES DA IA (ferramentas):\n${toolSummary.join("\n") || "(nenhuma)"}`,
          `Transferiu para humano: ${handoff ? "sim" : "não"}`,
        ].join("\n\n"),
      },
    ],
  });
  const judge = parseJsonLoose<Judge>(res.choices[0]?.message?.content ?? "") ?? {
    passou: false,
    criterios: [],
    resumo: "O avaliador não devolveu um JSON válido.",
  };

  const result = { transcript, runs: runIds, tools: toolSummary, handoff, judge, conversation_id: conv.id, created_client_ids: createdClientIds };
  await db
    .from("test_scenarios")
    .update({ last_status: judge.passou ? "passou" : "falhou", last_result: result as never, last_run_at: new Date().toISOString() })
    .eq("id", scenarioId);
  return { passou: judge.passou };
}
