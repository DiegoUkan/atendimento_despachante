/**
 * Um handler por tipo de tarefa da fila (tabela jobs).
 */
import { firstName, formatPlate, renderTemplate, type CaseFields } from "@despachante/shared";
import { db, getSettings, log, must, type Row } from "./db";
import { adapterFor } from "./channels";
import { runAttendance } from "./ai/agent";
import { runTeachReply } from "./ai/teach";
import { clientForProvider, embed, modelFor, NotConfiguredError, transcribeAudio, type Task } from "./ai/llm";
import { runScenario } from "./scenarios";

export type Job = Row<"jobs">;
export class NonRetryableError extends Error {}

type OpenAIContent = string | Record<string, unknown>[];
// imagem 8x8 azul, para testar visão
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGNQCf+KFTEMLQkAvpVcAf8ZTpcAAAAASUVORK5CYII=";
const PING_TOOL = {
  type: "function" as const,
  function: {
    name: "registrar_dados",
    description: "Registra dados do caso",
    parameters: { type: "object", properties: { placa: { type: "string" } }, required: ["placa"] },
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const handlers: Record<string, (job: Job) => Promise<unknown>> = {
  // ---------------------------------------------------------------------
  async process_conversation(job) {
    const conversationId = (job.payload as { conversation_id: string }).conversation_id;
    const { data: conv } = await db.from("conversations").select("id, scenario_id").eq("id", conversationId).maybeSingle();
    if (!conv) return { skipped: "conversa não existe" };
    if (conv.scenario_id) return { skipped: "conversa de cenário de teste" };
    try {
      const p = job.payload as { force?: boolean; suggest?: boolean };
      return await runAttendance(conversationId, { force: p.force, suggest: p.suggest });
    } catch (e) {
      if (e instanceof NotConfiguredError) throw new NonRetryableError(e.message);
      throw e;
    }
  },

  // ---------------------------------------------------------------------
  async send_messages(job) {
    const conversationId = (job.payload as { conversation_id: string }).conversation_id;
    const conv = must(await db.from("conversations").select("*, contact:contacts(phone)").eq("id", conversationId).single(), "conversa");
    const queued = (await db.from("messages").select("*").eq("conversation_id", conversationId).eq("status", "queued").order("created_at")).data ?? [];
    const channels = new Map<string, Row<"channels">>();
    let sent = 0;
    for (const [i, msg] of queued.entries()) {
      const channelId = msg.channel_id ?? conv.last_channel_id;
      let channel = channelId ? channels.get(channelId) : undefined;
      if (channelId && !channel) {
        channel = (await db.from("channels").select("*").eq("id", channelId).maybeSingle()).data ?? undefined;
        if (channel) channels.set(channelId, channel);
      }
      // pausa curta entre mensagens: parece "digitando" e evita rajadas
      if (i > 0) await sleep(Math.min(2500, 500 + msg.body.length * 12));
      await db.from("messages").update({ status: "sending" }).eq("id", msg.id);
      const phone = (conv as unknown as { contact: { phone: string } }).contact.phone;
      const res = channel
        ? await adapterFor(channel).send(channel, phone, msg)
        : ({ ok: false, error: "Conversa sem número de WhatsApp de origem." } as const);
      if (res.ok) {
        await db.from("messages").update({ status: "sent", sent_at: new Date().toISOString(), external_id: res.externalId ?? null, channel_id: channelId }).eq("id", msg.id);
        sent++;
      } else {
        await db.from("messages").update({ status: "failed", error: res.error }).eq("id", msg.id);
      }
    }
    return { sent, total: queued.length };
  },

  // ---------------------------------------------------------------------
  async case_stage_changed(job) {
    const p = job.payload as { case_id: string; to_stage: string; actor: string };
    // a IA já conversa com o cliente quando ela mesma avança a fase
    if (p.actor === "ai") return { skipped: "mudança feita pela IA" };
    const c = must(
      await db.from("cases").select("*, service:services(*), stage:service_stages(*), client:clients(*), contact:contacts(*), vehicle:vehicles(*)").eq("id", p.case_id).single(),
      "caso",
    ) as unknown as Row<"cases"> & {
      service: Row<"services">; stage: Row<"service_stages">; client: Row<"clients"> | null; contact: Row<"contacts"> | null; vehicle: Row<"vehicles"> | null;
    };
    if (c.stage_id !== p.to_stage) return { skipped: "fase mudou de novo" };
    const stage = c.stage;
    if (stage.notify_mode === "none" || !stage.notify_template.trim()) return { skipped: "fase sem aviso" };
    if (!c.contact_id) return { skipped: "caso sem contato" };

    let conv = (await db.from("conversations").select("*").eq("contact_id", c.contact_id).maybeSingle()).data;
    if (!conv) {
      conv = must(await db.from("conversations").insert({ contact_id: c.contact_id, is_test: c.is_test }).select("*").single(), "conversa");
    }
    let channelId = conv.last_channel_id;
    if (!channelId) {
      channelId = (await db.from("channels").select("id").eq("active", true).order("created_at").limit(1).maybeSingle()).data?.id ?? null;
    }
    const settings = await getSettings();
    const fields = (c.fields ?? {}) as CaseFields;
    const body = renderTemplate(stage.notify_template, {
      nome: firstName(c.contact?.name || c.client?.name || c.contact?.wa_name),
      codigo: c.code,
      servico: c.service.name,
      fase: stage.name,
      placa: formatPlate(c.vehicle?.plate ?? fields.placa?.value ?? ""),
      empresa: settings.company_name,
    });
    await db.from("messages").insert({
      conversation_id: conv.id,
      channel_id: channelId,
      direction: "out",
      sender: "system",
      kind: "text",
      body,
      status: stage.notify_mode === "auto" ? "queued" : "draft",
      case_id: c.id,
    });
    await db.from("case_events").insert({
      case_id: c.id,
      type: "aviso",
      actor: "system",
      description: stage.notify_mode === "auto" ? `Aviso de fase enviado ao cliente` : `Aviso de fase aguardando aprovação`,
      data: { fase: stage.name },
    });
    return { notified: stage.notify_mode };
  },

  // ---------------------------------------------------------------------
  async teach_reply(job) {
    const sessionId = (job.payload as { session_id: string }).session_id;
    try {
      return await runTeachReply(sessionId);
    } catch (e) {
      const msg = e instanceof NotConfiguredError ? e.message : `Erro: ${(e as Error).message}`;
      await db.from("teach_sessions").update({ status: "error", last_error: msg }).eq("id", sessionId);
      if (e instanceof NotConfiguredError) throw new NonRetryableError(e.message);
      throw e;
    }
  },

  // ---------------------------------------------------------------------
  async embed_knowledge(job) {
    const docId = (job.payload as { doc_id: string }).doc_id;
    const doc = (await db.from("knowledge_docs").select("id, title, content_md").eq("id", docId).maybeSingle()).data;
    if (!doc) return { skipped: "documento removido" };
    let e: Awaited<ReturnType<typeof embed>>;
    try {
      e = await embed(`${doc.title}\n\n${doc.content_md}`);
    } catch (err) {
      // modelo de embeddings errado/indisponível: não adianta tentar de novo
      throw new NonRetryableError(`Embeddings falharam (confira o modelo em Configurações → IA): ${(err as Error).message}`);
    }
    if (!e) return { skipped: "embeddings não configurados" };
    await db.from("knowledge_docs").update({ embedding: JSON.stringify(e.vector) as never, embedding_model: e.model }).eq("id", doc.id);
    return { model: e.model, dims: e.vector.length };
  },

  async reembed_all() {
    const { data } = await db.from("knowledge_docs").select("id").eq("active", true);
    for (const d of data ?? []) {
      await db.rpc("enqueue_job_internal", { p_type: "embed_knowledge", p_payload: { doc_id: d.id }, p_dedupe_key: `embed:${d.id}`, p_delay_seconds: 0 });
    }
    return { queued: data?.length ?? 0 };
  },

  // ---------------------------------------------------------------------
  async llm_test(job) {
    const p = job.payload as { provider_id: string; model?: string };
    const started = Date.now();
    const result: Record<string, unknown> = { at: new Date().toISOString() };
    try {
      const { client } = await clientForProvider(p.provider_id);
      const list = await client.models.list();
      const models = list.data.map((m) => m.id).sort();
      result.ok = true;
      result.models_count = models.length;
      await db.from("ai_providers").update({ models: models as never }).eq("id", p.provider_id);
      if (p.model) {
        const chat = await client.chat.completions.create({
          model: p.model,
          messages: [{ role: "user", content: "Responda apenas com a palavra: ok" }],
          max_tokens: 10,
        });
        result.chat_model = p.model;
        result.chat_reply = chat.choices[0]?.message?.content ?? "";
      }
    } catch (e) {
      result.ok = false;
      result.error = (e as Error).message;
    }
    result.latency_ms = Date.now() - started;
    await db.from("ai_providers").update({ last_test: result as never }).eq("id", p.provider_id);
    return result;
  },

  // ---------------------------------------------------------------------
  /** Botão "Testar" de cada tarefa em Configurações → IA */
  async task_test(job) {
    const task = (job.payload as { task: Task }).task;
    const t0 = Date.now();
    const done = (r: Record<string, unknown>) => ({ ...r, task, latency_ms: Date.now() - t0 });
    try {
      if (task === "embeddings") {
        const e = await embed("teste de busca na base de conhecimento");
        return done(e ? { ok: true, info: `vetor com ${e.vector.length} dimensões` } : { ok: false, error: "não configurado" });
      }
      if (task === "transcricao") {
        // 1 s de silêncio em WAV 16 kHz: o modelo deve responder sem erro
        const samples = 16000;
        const wav = Buffer.alloc(44 + samples * 2);
        wav.write("RIFF", 0); wav.writeUInt32LE(36 + samples * 2, 4); wav.write("WAVE", 8); wav.write("fmt ", 12);
        wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24);
        wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
        const text = await transcribeAudio(wav, "audio/wav", "teste.wav");
        return done(text !== null ? { ok: true, info: `respondeu: “${text.slice(0, 60)}”` } : { ok: false, error: "não configurado" });
      }
      const m = await modelFor(task);
      const content: OpenAIContent =
        task === "visao"
          ? [{ type: "text", text: "Que cor predomina nesta imagem? Responda em uma palavra." }, { type: "image_url", image_url: { url: TINY_PNG } }]
          : "Registre a placa ABC1D23 usando a ferramenta e depois diga ok.";
      const res = await m.client.chat.completions.create({
        model: m.model,
        temperature: 0,
        messages: [{ role: "user", content: content as never }],
        ...(task === "visao" ? {} : { tools: [PING_TOOL], tool_choice: "auto" as const }),
      });
      const msg = res.choices[0]?.message;
      const toolCalled = !!msg?.tool_calls?.length;
      if (task === "visao") return done({ ok: true, info: `respondeu: “${(msg?.content ?? "").slice(0, 40)}”` });
      return done(
        toolCalled
          ? { ok: true, info: "suporta ferramentas (tool calling) ✓" }
          : { ok: false, error: "o modelo respondeu, mas NÃO chamou a ferramenta — ele não serve para o atendimento" },
      );
    } catch (e) {
      return done({ ok: false, error: (e as Error).message.slice(0, 300) });
    }
  },

  // ---------------------------------------------------------------------
  async run_scenario(job) {
    const scenarioId = (job.payload as { scenario_id: string }).scenario_id;
    try {
      return await runScenario(scenarioId);
    } catch (e) {
      await db.from("test_scenarios").update({ last_status: "erro", last_result: { error: (e as Error).message } as never, last_run_at: new Date().toISOString() }).eq("id", scenarioId);
      throw new NonRetryableError((e as Error).message);
    }
  },
};

export async function cleanupOldJobs() {
  const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const { error } = await db.from("jobs").delete().in("status", ["done", "failed"]).lt("updated_at", cutoff);
  if (error) log.warn("limpeza de jobs:", error.message);
}
