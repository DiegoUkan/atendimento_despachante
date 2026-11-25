/**
 * O agente de atendimento: lê a conversa, monta o contexto, conversa com o
 * modelo usando ferramentas e grava a resposta (rascunho ou envio) + Raio-X.
 */
import type OpenAI from "openai";
import { resolveMode, type Mode } from "@despachante/shared";
import { db, downloadMedia, log, must, type Row } from "../db";
import { loadContext, type ConversationContext } from "./context";
import { describeImage, modelFor, toWhatsApp, transcribeAudio } from "./llm";
import { buildSystemPrompt, type KnowledgeRef } from "./prompt";
import { ATTENDANCE_TOOLS, executeTool, type ToolState } from "./tools";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ContentPart = OpenAI.Chat.Completions.ChatCompletionContentPart;

const MAX_STEPS = 8;
const MAX_INLINE_IMAGES = 3;

export type AttendanceOptions = {
  forceMode?: Mode;
  scenario?: boolean;     // execução de cenário de teste (sem trava de "supersedido")
  force?: boolean;        // processa mesmo sem mensagens novas
  suggest?: boolean;      // botão "Sugerir resposta": sempre gera rascunho (copiloto)
};

export type AttendanceResult = {
  status: "done" | "skipped" | "superseded" | "error";
  runId?: string;
  messages?: string[];
  reason?: string;
};

// ---------------------------------------------------------------------------
// Mídias: transcreve áudios e descreve imagens das mensagens novas
// ---------------------------------------------------------------------------
async function preprocessMedia(msgs: Row<"messages">[], supportsVision: boolean) {
  for (const m of msgs) {
    if (!m.media_path) continue;
    try {
      if (m.kind === "audio" && !m.transcript) {
        const { buffer, mime } = await downloadMedia(m.media_path);
        const text = await transcribeAudio(buffer, m.media_mime || mime, m.media_name || "audio.webm");
        m.transcript = text ?? "[não foi possível transcrever: configure um modelo de transcrição]";
        await db.from("messages").update({ transcript: m.transcript }).eq("id", m.id);
      }
      if (m.kind === "image" && !supportsVision && !m.media_description) {
        const { buffer, mime } = await downloadMedia(m.media_path);
        const desc = await describeImage(`data:${m.media_mime || mime};base64,${buffer.toString("base64")}`);
        if (desc) {
          m.media_description = desc;
          await db.from("messages").update({ media_description: desc }).eq("id", m.id);
        }
      }
    } catch (e) {
      log.warn("mídia", m.id, (e as Error).message);
    }
  }
}

// ---------------------------------------------------------------------------
// Histórico → mensagens do chat
// ---------------------------------------------------------------------------
async function buildHistory(history: Row<"messages">[], supportsVision: boolean, profiles: Map<string, string>): Promise<ChatMessage[]> {
  const imageIds = history.filter((m) => m.kind === "image" && m.media_path && m.direction === "in").slice(-MAX_INLINE_IMAGES).map((m) => m.id);
  const out: { role: "user" | "assistant"; parts: ContentPart[] }[] = [];

  for (const m of history) {
    const role = m.direction === "in" ? "user" : "assistant";
    const parts: ContentPart[] = [];
    let text = "";
    if (m.direction === "in") {
      if (m.kind === "audio") text = `[áudio transcrito] ${m.transcript ?? "(sem transcrição)"}`;
      else if (m.kind === "image") text = `[imagem id=${m.id}]${m.body ? ` legenda: ${m.body}` : ""}${m.media_description ? `\n(descrição: ${m.media_description})` : ""}`;
      else if (m.kind === "document") text = `[arquivo id=${m.id}: ${m.media_name ?? "documento"}]${m.body ? ` ${m.body}` : ""}`;
      else if (m.kind !== "text") text = `[${m.kind}]${m.body ? ` ${m.body}` : ""}`;
      else text = m.body;
    } else if (m.sender === "human") {
      text = `[mensagem enviada por ${profiles.get(m.sender_profile_id ?? "") ?? "atendente humano"}] ${m.body}`;
    } else if (m.sender === "system") {
      text = `[aviso automático do sistema] ${m.body}`;
    } else {
      text = m.body;
    }
    parts.push({ type: "text", text });

    if (supportsVision && imageIds.includes(m.id) && m.media_path) {
      try {
        const { buffer, mime } = await downloadMedia(m.media_path);
        parts.push({ type: "image_url", image_url: { url: `data:${m.media_mime || mime};base64,${buffer.toString("base64")}` } });
      } catch (e) {
        log.warn("imagem", m.id, (e as Error).message);
      }
    }

    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else out.push({ role, parts });
  }

  // alguns provedores exigem que a conversa comece pelo usuário
  while (out.length && out[0].role === "assistant") out.shift();
  // …e termine com o usuário (modelos recentes não aceitam "prefill" do assistente),
  // o que acontece quando um atendente respondeu por último ou na "Sugerir resposta"
  if (out.length && out[out.length - 1].role === "assistant") {
    out.push({
      role: "user",
      parts: [{ type: "text", text: "[nota interna do sistema: não há mensagem nova do cliente depois da última resposta. Avalie se é preciso enviar algo; se não for, finalize com a lista de mensagens vazia.]" }],
    });
  }

  return out.map((m) =>
    m.role === "user"
      ? ({ role: "user", content: m.parts.some((p) => p.type !== "text") ? m.parts : m.parts.map((p) => (p as { text: string }).text).join("\n") } as ChatMessage)
      : ({ role: "assistant", content: m.parts.map((p) => (p as { text?: string }).text ?? "").join("\n") } as ChatMessage),
  );
}

function dedupeKnowledge(list: KnowledgeRef[]): KnowledgeRef[] {
  const seen = new Set<string>();
  return list.filter((k) => {
    const key = `${k.title}|${k.ref?.table}|${k.ref?.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Execução principal
// ---------------------------------------------------------------------------
export async function runAttendance(conversationId: string, opts: AttendanceOptions = {}): Promise<AttendanceResult> {
  const snapshotAt = new Date().toISOString();
  const ctx: ConversationContext = await loadContext(conversationId);
  const conv = ctx.conversation;

  // mensagens novas do cliente desde a última execução
  let newQuery = db.from("messages").select("*").eq("conversation_id", conv.id).eq("direction", "in").order("created_at");
  if (conv.ai_processed_until) newQuery = newQuery.gt("created_at", conv.ai_processed_until);
  const newInbound = (await newQuery).data ?? [];
  if (!newInbound.length && !opts.force) return { status: "skipped", reason: "sem mensagens novas" };

  // modo efetivo
  const resolved = opts.suggest
    ? { mode: "copilot" as Mode, source: "sugestão pedida pela equipe" }
    : opts.forceMode
    ? { mode: opts.forceMode, source: "cenário de teste" }
    : resolveMode({
        conversation: conv,
        stage: ctx.activeCase?.stage,
        service: ctx.activeCase?.service,
        channel: ctx.channel,
        defaultMode: ctx.settings.default_mode,
      });

  if (!opts.scenario && !opts.suggest && (resolved.mode === "manual" || conv.status === "waiting_human")) {
    await db.from("conversations").update({ ai_processed_until: snapshotAt }).eq("id", conv.id);
    return { status: "skipped", reason: resolved.mode === "manual" ? "modo manual" : "aguardando humano" };
  }

  const run = must(
    await db
      .from("ai_runs")
      .insert({
        conversation_id: conv.id,
        kind: opts.scenario ? "cenario" : "atendimento",
        status: "running",
        mode: resolved.mode,
        mode_source: resolved.source,
        trigger_message_ids: newInbound.map((m) => m.id),
        case_id: ctx.activeCase?.id ?? null,
      })
      .select("id")
      .single(),
    "criar execução",
  );

  const started = Date.now();
  const st: ToolState = {
    ctx,
    runId: run.id,
    knowledge: [],
    tools: [],
    extraMessages: [],
    handoff: null,
    final: null,
    activeCase: ctx.activeCase,
    touchedServiceIds: new Set(),
  };
  let tokensIn = 0;
  let tokensOut = 0;
  let modelName = "";
  let providerName = "";

  try {
    const m = await modelFor("atendimento");
    modelName = m.model;
    providerName = m.providerName;

    await preprocessMedia(newInbound, m.supportsVision);

    const limit = ctx.settings.history_messages ?? 30;
    const historyRows = (
      await db
        .from("messages")
        .select("*")
        .eq("conversation_id", conv.id)
        .in("status", ["received", "sent", "queued", "sending"])
        .order("created_at", { ascending: false })
        .limit(limit)
    ).data ?? [];
    historyRows.reverse();
    // garante que as transcrições/descrições recém-feitas apareçam
    for (const h of historyRows) {
      const fresh = newInbound.find((n) => n.id === h.id);
      if (fresh) Object.assign(h, { transcript: fresh.transcript, media_description: fresh.media_description });
    }

    const humanIds = [...new Set(historyRows.map((h) => h.sender_profile_id).filter(Boolean))] as string[];
    const profiles = new Map<string, string>();
    if (humanIds.length) {
      const { data } = await db.from("profiles").select("id, full_name").in("id", humanIds);
      for (const p of data ?? []) profiles.set(p.id, p.full_name || "atendente");
    }

    const prompt = buildSystemPrompt(ctx);
    st.knowledge.push(...prompt.knowledge);
    const messages: ChatMessage[] = [
      { role: "system", content: prompt.text },
      ...(await buildHistory(historyRows, m.supportsVision, profiles)),
    ];

    for (let step = 0; step < MAX_STEPS && !st.final; step++) {
      const res = await m.client.chat.completions.create({
        model: m.model,
        temperature: m.temperature,
        messages,
        tools: ATTENDANCE_TOOLS,
        tool_choice: "auto",
      });
      tokensIn += res.usage?.prompt_tokens ?? 0;
      tokensOut += res.usage?.completion_tokens ?? 0;
      const msg = res.choices[0]?.message;
      if (!msg) break;
      const toolCalls = (msg.tool_calls ?? []).filter((t) => t.type === "function");

      if (toolCalls.length) {
        messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls } as ChatMessage);
        for (const tc of toolCalls) {
          if (tc.type !== "function") continue;
          const out = await executeTool(tc.function.name, tc.function.arguments, st);
          messages.push({ role: "tool", tool_call_id: tc.id, content: out });
        }
        continue;
      }

      // respondeu em texto puro, sem finalizar_turno
      if (msg.content?.trim()) {
        st.final = {
          mensagens: msg.content.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean).slice(0, 3),
          justificativa: "(o modelo respondeu sem chamar finalizar_turno — sem justificativa registrada)",
          confianca: 0.4,
        };
      }
      break;
    }

    if (!st.final) {
      st.final = { mensagens: [], justificativa: "Limite de passos atingido sem resposta final.", confianca: 0 };
    }

    // decide envio x rascunho
    const threshold = Number(ctx.settings.confidence_threshold ?? 0.55);
    let status: "queued" | "draft" = "draft";
    let held = false;
    if (resolved.mode === "auto") {
      if (opts.scenario || st.final.confianca >= threshold) status = "queued";
      else held = true;
    }

    // chegou mensagem nova do cliente enquanto pensávamos? descarta e deixa a próxima execução responder
    let superseded = false;
    if (!opts.scenario) {
      const { count } = await db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .eq("direction", "in")
        .gt("created_at", snapshotAt);
      superseded = (count ?? 0) > 0;
    }

    const texts = [...st.final.mensagens.map(toWhatsApp), ...st.extraMessages].filter((t) => t.trim());
    if (!superseded && texts.length) {
      // horário vem do banco (inserções em sequência = ordem garantida, sem depender do relógio do worker)
      const rows = texts.map((body) => ({
        conversation_id: conv.id,
        channel_id: conv.last_channel_id,
        direction: "out",
        sender: "ai",
        kind: "text",
        body,
        status,
        ai_run_id: run.id,
        case_id: st.activeCase?.id ?? null,
      }));
      for (const row of rows) {
        const ins = await db.from("messages").insert(row);
        if (ins.error) throw new Error(`gravar resposta: ${ins.error.message}`);
      }
    }

    await db
      .from("conversations")
      .update({ ai_processed_until: snapshotAt, active_case_id: st.activeCase?.id ?? conv.active_case_id })
      .eq("id", conv.id);

    await db
      .from("ai_runs")
      .update({
        status: superseded ? "superseded" : "done",
        case_id: st.activeCase?.id ?? null,
        service_id: st.activeCase?.service_id ?? [...st.touchedServiceIds][0] ?? null,
        stage_id: st.activeCase?.stage_id ?? null,
        rationale: st.final.justificativa,
        confidence: st.final.confianca,
        handoff: !!st.handoff,
        handoff_reason: st.handoff?.motivo ?? null,
        held_for_review: held,
        context: { sections: prompt.sections, system_prompt: prompt.text, history_count: historyRows.length } as never,
        knowledge: dedupeKnowledge(st.knowledge) as never,
        tools: st.tools as never,
        output: { mensagens: texts, status: superseded ? "descartado" : status } as never,
        model: modelName,
        provider: providerName,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        latency_ms: Date.now() - started,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    return { status: superseded ? "superseded" : "done", runId: run.id, messages: texts };
  } catch (e) {
    const message = (e as Error).message;
    await db
      .from("ai_runs")
      .update({
        status: "error",
        error: message,
        tools: st.tools as never,
        knowledge: dedupeKnowledge(st.knowledge) as never,
        model: modelName || null,
        provider: providerName || null,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        latency_ms: Date.now() - started,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    throw Object.assign(e as Error, { runId: run.id });
  }
}
