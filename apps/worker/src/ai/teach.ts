/**
 * "Ensinar a IA": um instrutor que conversa com os donos/analistas e
 * PROPÕE alterações (com antes/depois). Nada é aplicado sem aprovação no painel.
 */
import type OpenAI from "openai";
import { FIELD_TYPE_LABELS, formatMoney } from "@despachante/shared";
import { db, getSettings, must, type Row } from "../db";
import { findServiceBySlug, loadServiceFull } from "./context";
import { modelFor } from "./llm";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]) =>
  ({ type: "function", function: { name, description, parameters: { type: "object", properties, required } } }) as const;

const SCOPE = { type: "string", enum: ["global", "servico", "fase"], description: "global = vale para todo atendimento; servico = só para um serviço; fase = só numa fase" };

export const TEACH_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  fn("listar_servicos", "Lista os serviços cadastrados (id, nome, fases).", {}, []),
  fn("ver_servico", "Mostra tudo de um serviço: instruções, fases (com instruções e flags), dados, documentos, preços e conhecimento.", { servico: { type: "string" } }, ["servico"]),
  fn("buscar_conhecimento", "Busca regras/FAQs/informações já cadastradas.", { pergunta: { type: "string" } }, ["pergunta"]),
  fn("ver_configuracoes", "Mostra textos da empresa: sobre, estilo extra, fora do horário, pagamento.", {}, []),
  fn("propor_regra", "Propõe CRIAR um item de conhecimento (regra, informação, FAQ ou lição).", {
    titulo: { type: "string" },
    conteudo_md: { type: "string", description: "Texto claro e direto, em markdown curto" },
    tipo: { type: "string", enum: ["regra", "info", "faq", "licao"] },
    escopo: SCOPE,
    servico: { type: "string", description: "id do serviço (se escopo servico/fase)" },
    fase: { type: "string", description: "chave da fase (se escopo fase)" },
    sempre_incluir: { type: "boolean", description: "Para regras globais importantes: entra em todo atendimento" },
    explicacao: { type: "string", description: "Para o humano: o que muda e por quê" },
  }, ["titulo", "conteudo_md", "tipo", "escopo", "explicacao"]),
  fn("propor_edicao_conhecimento", "Propõe EDITAR um item de conhecimento existente (use o id retornado nas buscas).", {
    doc_id: { type: "string" }, titulo: { type: "string" }, conteudo_md: { type: "string" }, explicacao: { type: "string" },
  }, ["doc_id", "conteudo_md", "explicacao"]),
  fn("propor_instrucoes_servico", "Propõe novo texto COMPLETO para as instruções de um serviço.", {
    servico: { type: "string" }, instrucoes_md: { type: "string" }, explicacao: { type: "string" },
  }, ["servico", "instrucoes_md", "explicacao"]),
  fn("propor_instrucoes_fase", "Propõe novo texto COMPLETO para as instruções de uma fase.", {
    servico: { type: "string" }, fase: { type: "string" }, instrucoes_md: { type: "string" }, explicacao: { type: "string" },
  }, ["servico", "fase", "instrucoes_md", "explicacao"]),
  fn("propor_config_fase", "Propõe mudar comportamento de uma fase (IA pode avançar, exige checklist, aviso ao cliente, mensagem de aviso).", {
    servico: { type: "string" }, fase: { type: "string" },
    ai_pode_avancar: { type: "boolean" }, exige_checklist: { type: "boolean" },
    aviso: { type: "string", enum: ["auto", "approval", "none"] },
    mensagem_aviso: { type: "string", description: "Template com {nome} {codigo} {servico} {fase} {placa} {empresa}" },
    explicacao: { type: "string" },
  }, ["servico", "fase", "explicacao"]),
  fn("propor_documento", "Propõe adicionar um documento ao checklist de um serviço.", {
    servico: { type: "string" }, rotulo: { type: "string" }, descricao: { type: "string" }, obrigatorio: { type: "boolean" }, explicacao: { type: "string" },
  }, ["servico", "rotulo", "explicacao"]),
  fn("propor_edicao_documento", "Propõe EDITAR um documento que já existe no checklist (rótulo, orientação ou obrigatoriedade).", {
    servico: { type: "string" }, documento: { type: "string", description: "chave ou rótulo atual do documento" },
    rotulo: { type: "string" }, descricao: { type: "string" }, obrigatorio: { type: "boolean" }, explicacao: { type: "string" },
  }, ["servico", "documento", "explicacao"]),
  fn("propor_edicao_campo", "Propõe EDITAR um dado que já existe no serviço (rótulo, dica, obrigatoriedade, opções).", {
    servico: { type: "string" }, campo: { type: "string", description: "chave ou rótulo atual do dado" },
    rotulo: { type: "string" }, dica: { type: "string" }, obrigatorio: { type: "boolean" },
    opcoes: { type: "array", items: { type: "string" } }, explicacao: { type: "string" },
  }, ["servico", "campo", "explicacao"]),
  fn("propor_campo", "Propõe adicionar um dado a ser coletado num serviço.", {
    servico: { type: "string" }, rotulo: { type: "string" },
    tipo: { type: "string", enum: Object.keys(FIELD_TYPE_LABELS) },
    obrigatorio: { type: "boolean" }, dica: { type: "string" },
    opcoes: { type: "array", items: { type: "string" } }, explicacao: { type: "string" },
  }, ["servico", "rotulo", "tipo", "explicacao"]),
  fn("propor_preco", "Propõe criar ou alterar um item da tabela de preços de um serviço (casado pelo rótulo).", {
    servico: { type: "string" }, rotulo: { type: "string" },
    valor: { type: ["number", "null"], description: "null = a confirmar" },
    tipo: { type: "string", enum: ["honorario", "taxa", "opcional"] }, observacao: { type: "string" }, explicacao: { type: "string" },
  }, ["servico", "rotulo", "explicacao"]),
  fn("propor_empresa", "Propõe alterar um texto da empresa.", {
    campo: { type: "string", enum: ["about_md", "persona_extra_md", "out_of_hours_md", "payment_notes"] },
    valor: { type: "string" }, explicacao: { type: "string" },
  }, ["campo", "valor", "explicacao"]),
];

const slugify = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

type Ctx = { sessionId: string; teachMessageId: string | null; proposals: string[] };

async function requireService(slug: unknown) {
  const sv = await findServiceBySlug(String(slug ?? ""));
  if (!sv) throw new Error(`Serviço "${slug}" não encontrado. Use listar_servicos.`);
  return sv;
}

async function requireStage(serviceId: string, key: unknown) {
  const { data } = await db.from("service_stages").select("*").eq("service_id", serviceId).eq("key", String(key ?? "")).maybeSingle();
  if (!data) throw new Error(`Fase "${key}" não encontrada neste serviço.`);
  return data;
}

async function propose(ctx: Ctx, p: {
  action: string; target_table?: string; target_id?: string | null; title: string; explanation: string;
  before?: unknown; after: unknown;
}) {
  const row = must(
    await db
      .from("knowledge_proposals")
      .insert({
        session_id: ctx.sessionId,
        teach_message_id: ctx.teachMessageId,
        action: p.action,
        target_table: p.target_table ?? null,
        target_id: p.target_id ?? null,
        title: p.title,
        explanation: p.explanation,
        before: (p.before ?? null) as never,
        after: p.after as never,
      })
      .select("id")
      .single(),
    "salvar proposta",
  );
  ctx.proposals.push(row.id);
  return { ok: true, proposta_id: row.id, info: "Proposta criada. Ela aparece como um card para o humano aprovar ou recusar." };
}

const handlers: Record<string, (a: Record<string, any>, ctx: Ctx) => Promise<unknown>> = {
  async listar_servicos() {
    const { data } = await db.from("services").select("slug, name, emoji, active, service_stages(key, name, sort_order)").order("sort_order");
    return (data ?? []).map((s: any) => ({
      id: s.slug, nome: `${s.emoji} ${s.name}`, ativo: s.active,
      fases: (s.service_stages ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((f: any) => `${f.key} (${f.name})`),
    }));
  },
  async ver_servico({ servico }) {
    const sv = await requireService(servico);
    const full = await loadServiceFull(sv.id);
    return {
      id: sv.slug, nome: sv.name, descricao: sv.short_description, instrucoes_md: sv.instructions_md,
      fases: full.stages.map((s) => ({
        chave: s.key, nome: s.name, instrucoes_md: s.instructions_md, ia_pode_avancar: s.ai_can_advance,
        exige_checklist: s.require_checklist, aviso: s.notify_mode, mensagem_aviso: s.notify_template, final: s.is_final, cancelado: s.is_canceled,
      })),
      dados: full.fields.map((f) => ({ chave: f.key, rotulo: f.label, tipo: f.type, obrigatorio: f.required, dica: f.ai_hint })),
      documentos: full.documents.map((d) => ({ chave: d.key, rotulo: d.label, descricao: d.description, obrigatorio: d.required })),
      precos: full.prices.map((p) => ({ rotulo: p.label, valor: p.amount === null ? "a confirmar" : formatMoney(Number(p.amount)), tipo: p.kind, obs: p.notes })),
      conhecimento: full.docs.map((d) => ({ id: d.id, titulo: d.title, tipo: d.kind, escopo: d.scope, conteudo: d.content_md })),
    };
  },
  async buscar_conhecimento({ pergunta }) {
    const { data, error } = await db.rpc("search_knowledge", { p_query: String(pergunta ?? ""), p_limit: 8 });
    if (error) return { erro: error.message };
    if (!data?.length) {
      const { data: all } = await db.from("knowledge_docs").select("id, title, kind, scope").eq("active", true).limit(40);
      return { nada_encontrado: true, itens_existentes: all };
    }
    return data.map((d) => ({ id: d.id, titulo: d.title, tipo: d.kind, escopo: d.scope, conteudo: d.content_md }));
  },
  async ver_configuracoes() {
    const s = await getSettings();
    return { about_md: s.about_md, persona_extra_md: s.persona_extra_md, out_of_hours_md: s.out_of_hours_md, payment_notes: s.payment_notes, assistente: s.assistant_name };
  },

  async propor_regra(a, ctx) {
    let service_id: string | null = null;
    let stage_id: string | null = null;
    let scope = "global";
    if (a.escopo === "servico" || a.escopo === "fase") {
      const sv = await requireService(a.servico);
      service_id = sv.id;
      scope = "service";
      if (a.escopo === "fase") {
        stage_id = (await requireStage(sv.id, a.fase)).id;
        scope = "stage";
      }
    }
    return propose(ctx, {
      action: "doc.create",
      target_table: "knowledge_docs",
      title: `Nova ${a.tipo ?? "regra"}: ${a.titulo}`,
      explanation: String(a.explicacao ?? ""),
      after: {
        scope, service_id, stage_id, kind: a.tipo ?? "regra", title: a.titulo, content_md: a.conteudo_md,
        always_include: scope === "global" ? Boolean(a.sempre_incluir) : false,
      },
    });
  },
  async propor_edicao_conhecimento(a, ctx) {
    const doc = must(await db.from("knowledge_docs").select("*").eq("id", String(a.doc_id)).single(), "item de conhecimento");
    return propose(ctx, {
      action: "doc.update", target_table: "knowledge_docs", target_id: doc.id,
      title: `Editar: ${doc.title}`, explanation: String(a.explicacao ?? ""),
      before: { title: doc.title, content_md: doc.content_md },
      after: { title: a.titulo ?? doc.title, content_md: a.conteudo_md },
    });
  },
  async propor_instrucoes_servico(a, ctx) {
    const sv = await requireService(a.servico);
    return propose(ctx, {
      action: "service.update", target_table: "services", target_id: sv.id,
      title: `Instruções do serviço ${sv.name}`, explanation: String(a.explicacao ?? ""),
      before: { instructions_md: sv.instructions_md }, after: { instructions_md: a.instrucoes_md },
    });
  },
  async propor_instrucoes_fase(a, ctx) {
    const sv = await requireService(a.servico);
    const stg = await requireStage(sv.id, a.fase);
    return propose(ctx, {
      action: "stage.update", target_table: "service_stages", target_id: stg.id,
      title: `Instruções da fase “${stg.name}” (${sv.name})`, explanation: String(a.explicacao ?? ""),
      before: { instructions_md: stg.instructions_md }, after: { instructions_md: a.instrucoes_md },
    });
  },
  async propor_config_fase(a, ctx) {
    const sv = await requireService(a.servico);
    const stg = await requireStage(sv.id, a.fase);
    const after: Partial<Row<"service_stages">> = {};
    const before: Partial<Row<"service_stages">> = {};
    if (typeof a.ai_pode_avancar === "boolean") { after.ai_can_advance = a.ai_pode_avancar; before.ai_can_advance = stg.ai_can_advance; }
    if (typeof a.exige_checklist === "boolean") { after.require_checklist = a.exige_checklist; before.require_checklist = stg.require_checklist; }
    if (a.aviso) { after.notify_mode = a.aviso; before.notify_mode = stg.notify_mode; }
    if (typeof a.mensagem_aviso === "string") { after.notify_template = a.mensagem_aviso; before.notify_template = stg.notify_template; }
    if (!Object.keys(after).length) return { erro: "Nenhuma mudança informada." };
    return propose(ctx, {
      action: "stage.update", target_table: "service_stages", target_id: stg.id,
      title: `Configuração da fase “${stg.name}” (${sv.name})`, explanation: String(a.explicacao ?? ""), before, after,
    });
  },
  async propor_documento(a, ctx) {
    const sv = await requireService(a.servico);
    return propose(ctx, {
      action: "document.create", target_table: "service_documents",
      title: `Novo documento em ${sv.name}: ${a.rotulo}`, explanation: String(a.explicacao ?? ""),
      after: { service_id: sv.id, key: slugify(a.rotulo), label: a.rotulo, description: a.descricao ?? "", required: a.obrigatorio ?? true },
    });
  },
  async propor_edicao_documento(a, ctx) {
    const sv = await requireService(a.servico);
    const { data: docs } = await db.from("service_documents").select("*").eq("service_id", sv.id);
    const q = String(a.documento ?? "").toLowerCase();
    const doc = docs?.find((d) => d.key === q) ?? docs?.find((d) => d.label.toLowerCase() === q) ?? docs?.find((d) => d.label.toLowerCase().includes(q));
    if (!doc) return { erro: `Documento "${a.documento}" não encontrado. Existentes: ${(docs ?? []).map((d) => d.label).join(", ")}` };
    const before: Partial<Row<"service_documents">> = {};
    const after: Partial<Row<"service_documents">> = {};
    if (typeof a.rotulo === "string") { before.label = doc.label; after.label = a.rotulo; }
    if (typeof a.descricao === "string") { before.description = doc.description; after.description = a.descricao; }
    if (typeof a.obrigatorio === "boolean") { before.required = doc.required; after.required = a.obrigatorio; }
    if (!Object.keys(after).length) return { erro: "Nenhuma mudança informada." };
    return propose(ctx, {
      action: "document.update", target_table: "service_documents", target_id: doc.id,
      title: `Documento “${doc.label}” (${sv.name})`, explanation: String(a.explicacao ?? ""), before, after,
    });
  },
  async propor_edicao_campo(a, ctx) {
    const sv = await requireService(a.servico);
    const { data: fields } = await db.from("service_fields").select("*").eq("service_id", sv.id);
    const q = String(a.campo ?? "").toLowerCase();
    const field = fields?.find((f) => f.key === q) ?? fields?.find((f) => f.label.toLowerCase() === q) ?? fields?.find((f) => f.label.toLowerCase().includes(q));
    if (!field) return { erro: `Dado "${a.campo}" não encontrado. Existentes: ${(fields ?? []).map((f) => f.label).join(", ")}` };
    const before: Partial<Row<"service_fields">> = {};
    const after: Partial<Row<"service_fields">> = {};
    if (typeof a.rotulo === "string") { before.label = field.label; after.label = a.rotulo; }
    if (typeof a.dica === "string") { before.ai_hint = field.ai_hint; after.ai_hint = a.dica; }
    if (typeof a.obrigatorio === "boolean") { before.required = field.required; after.required = a.obrigatorio; }
    if (Array.isArray(a.opcoes)) { before.options = field.options; after.options = a.opcoes; }
    if (!Object.keys(after).length) return { erro: "Nenhuma mudança informada." };
    return propose(ctx, {
      action: "field.update", target_table: "service_fields", target_id: field.id,
      title: `Dado “${field.label}” (${sv.name})`, explanation: String(a.explicacao ?? ""), before, after,
    });
  },
  async propor_campo(a, ctx) {
    const sv = await requireService(a.servico);
    return propose(ctx, {
      action: "field.create", target_table: "service_fields",
      title: `Novo dado em ${sv.name}: ${a.rotulo}`, explanation: String(a.explicacao ?? ""),
      after: {
        service_id: sv.id, key: slugify(a.rotulo), label: a.rotulo, type: a.tipo ?? "text",
        required: a.obrigatorio ?? true, ai_hint: a.dica ?? "", options: Array.isArray(a.opcoes) ? a.opcoes : [],
      },
    });
  },
  async propor_preco(a, ctx) {
    const sv = await requireService(a.servico);
    const { data: prices } = await db.from("service_prices").select("*").eq("service_id", sv.id);
    const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
    const existing = prices?.find((p) => norm(p.label) === norm(String(a.rotulo)));
    const amount = a.valor === null || a.valor === undefined ? null : Number(a.valor);
    if (existing) {
      return propose(ctx, {
        action: "price.update", target_table: "service_prices", target_id: existing.id,
        title: `Preço em ${sv.name}: ${existing.label}`, explanation: String(a.explicacao ?? ""),
        before: { label: existing.label, amount: existing.amount, kind: existing.kind, notes: existing.notes },
        after: { label: existing.label, amount, kind: a.tipo ?? existing.kind, notes: a.observacao ?? existing.notes, needs_review: false },
      });
    }
    return propose(ctx, {
      action: "price.create", target_table: "service_prices",
      title: `Novo preço em ${sv.name}: ${a.rotulo}`, explanation: String(a.explicacao ?? ""),
      after: { service_id: sv.id, label: a.rotulo, amount, kind: a.tipo ?? "honorario", notes: a.observacao ?? "" },
    });
  },
  async propor_empresa(a, ctx) {
    const s = await getSettings();
    const field = String(a.campo) as "about_md" | "persona_extra_md" | "out_of_hours_md" | "payment_notes";
    const labels = { about_md: "Sobre a empresa", persona_extra_md: "Estilo da assistente", out_of_hours_md: "Fora do horário", payment_notes: "Pagamento" };
    return propose(ctx, {
      action: "settings.update", target_table: "settings", target_id: null,
      title: labels[field] ?? field, explanation: String(a.explicacao ?? ""),
      before: { [field]: s[field] }, after: { [field]: a.valor },
    });
  },
};

async function runContextBlock(runId: string): Promise<string> {
  const run = (await db.from("ai_runs").select("*").eq("id", runId).maybeSingle()).data;
  if (!run) return "";
  const msgs = run.conversation_id
    ? ((await db.from("messages").select("direction, sender, body, transcript, created_at").eq("conversation_id", run.conversation_id).lte("created_at", run.finished_at ?? run.created_at).order("created_at", { ascending: false }).limit(12)).data ?? []).reverse()
    : [];
  const output = (run.output ?? {}) as { mensagens?: string[] };
  return [
    "# Atendimento que está sendo corrigido",
    "Conversa (mais recentes no fim):",
    ...msgs.map((m) => `${m.direction === "in" ? "Cliente" : m.sender === "human" ? "Atendente" : "IA"}: ${m.transcript ?? m.body}`),
    "",
    `Resposta da IA nessa execução: ${(output.mensagens ?? []).join(" / ") || "(nenhuma)"}`,
    `Justificativa da IA: ${run.rationale ?? "-"}`,
    `Confiança: ${run.confidence ?? "-"} · Modo: ${run.mode ?? "-"}`,
    `Ferramentas usadas: ${JSON.stringify(run.tools).slice(0, 2500)}`,
    `Conhecimento usado: ${JSON.stringify(run.knowledge).slice(0, 2000)}`,
  ].join("\n");
}

export async function runTeachReply(sessionId: string) {
  const session = must(await db.from("teach_sessions").select("*").eq("id", sessionId).single(), "sessão de ensino");
  const settings = await getSettings();
  const history = (await db.from("teach_messages").select("*").eq("session_id", sessionId).order("created_at")).data ?? [];
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const m = await modelFor("ensinar");

  const { data: services } = await db.from("services").select("slug, name").eq("active", true).order("sort_order");
  const { data: globals } = await db.from("knowledge_docs").select("id, title, kind").eq("scope", "global").eq("active", true);

  const system = [
    `Você é o Instrutor do sistema de atendimento da ${settings.company_name}, um despachante em ${settings.company_city}.`,
    `Seu papel: ajudar os donos e analistas a ENSINAR a assistente virtual "${settings.assistant_name}", que atende clientes no WhatsApp.`,
    "",
    "Como trabalhar:",
    "- Converse em português, de forma simples e amigável. Seja breve.",
    "- Entenda o que a pessoa quer ensinar. Se estiver ambíguo, pergunte (ex.: vale para todos os serviços ou só um?).",
    "- Antes de propor, consulte o que já existe (ver_servico, buscar_conhecimento) para não duplicar nem contradizer.",
    "- Proponha mudanças PEQUENAS e no LUGAR CERTO: regra global (vale sempre), instrução do serviço, instrução/configuração da fase, documento, dado, preço ou texto da empresa.",
    "- Use as ferramentas propor_* — cada uma vira um card com antes/depois para o humano aprovar. Nunca diga que já aplicou.",
    "- Ao editar instruções, envie o texto COMPLETO novo (mantendo o que já estava bom).",
    "- Escreva instruções como orientações diretas para a assistente (ex.: 'Sempre peça o CRV frente e verso').",
    "- Depois de propor, resuma em 1-3 frases o que propôs e por quê.",
    "",
    `Serviços: ${(services ?? []).map((s) => `${s.slug} (${s.name})`).join(", ")}`,
    `Conhecimento global existente: ${(globals ?? []).map((g) => `${g.title} [${g.kind}]`).join("; ") || "nenhum"}`,
  ].join("\n");

  const messages: ChatMessage[] = [{ role: "system", content: system }];
  if (session.context_run_id) {
    const block = await runContextBlock(session.context_run_id);
    if (block) messages.push({ role: "system", content: block + "\n\nO humano vai explicar o que estava errado. Proponha a correção na base para que não se repita." });
  }
  for (const h of history) messages.push({ role: h.role as "user" | "assistant", content: h.content });

  const ctx: Ctx = { sessionId, teachMessageId: lastUser?.id ?? null, proposals: [] };
  let finalText = "";
  let tokensIn = 0, tokensOut = 0;
  for (let step = 0; step < 8; step++) {
    const res = await m.client.chat.completions.create({ model: m.model, temperature: m.temperature, messages, tools: TEACH_TOOLS, tool_choice: "auto" });
    tokensIn += res.usage?.prompt_tokens ?? 0;
    tokensOut += res.usage?.completion_tokens ?? 0;
    const msg = res.choices[0]?.message;
    if (!msg) break;
    const calls = (msg.tool_calls ?? []).filter((t) => t.type === "function");
    if (!calls.length) {
      finalText = msg.content?.trim() ?? "";
      break;
    }
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls } as ChatMessage);
    for (const tc of calls) {
      if (tc.type !== "function") continue;
      let out: unknown;
      try {
        const args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        const h = handlers[tc.function.name];
        out = h ? await h(args, ctx) : { erro: "ferramenta desconhecida" };
      } catch (e) {
        out = { erro: (e as Error).message };
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content: typeof out === "string" ? out : JSON.stringify(out) });
    }
  }
  if (!finalText) finalText = ctx.proposals.length ? "Preparei as propostas acima. É só aprovar o que fizer sentido. 👍" : "Não consegui concluir. Pode reformular?";

  await db.from("teach_messages").insert({ session_id: sessionId, role: "assistant", content: finalText });
  const title = session.title === "Nova conversa" && lastUser ? lastUser.content.slice(0, 60) : session.title;
  await db.from("teach_sessions").update({ status: "idle", title }).eq("id", sessionId);
  return { proposals: ctx.proposals.length, tokensIn, tokensOut };
}
