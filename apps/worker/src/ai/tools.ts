/**
 * Ferramentas do atendimento. A IA nunca escreve no banco diretamente:
 * tudo passa por aqui, com validação e regras de negócio (ex.: não avançar
 * fase sem checklist, só enviar PIX após aceite do orçamento).
 */
import type OpenAI from "openai";
import {
  RELATION_LABELS, formatMoney, formatPhone, validateField, type CaseFields,
} from "@despachante/shared";
import { db, must, type Row } from "../db";
import { embed } from "./llm";
import { describeService, type KnowledgeRef } from "./prompt";
import { findServiceBySlug, loadCases, loadServiceFull, type CaseFull, type ConversationContext } from "./context";

export type ToolTrace = { name: string; args: unknown; result: unknown; ok: boolean; at: string };

export type FinalTurn = {
  mensagens: string[];
  justificativa: string;
  confianca: number;
};

export type ToolState = {
  ctx: ConversationContext;
  runId: string;
  knowledge: KnowledgeRef[];
  tools: ToolTrace[];
  extraMessages: string[];      // mensagens geradas pelo sistema (ex.: dados de pagamento)
  handoff: { motivo: string; resumo: string } | null;
  final: FinalTurn | null;
  activeCase: CaseFull | null;
  touchedServiceIds: Set<string>;
};

type ToolFn = (args: Record<string, any>, st: ToolState) => Promise<unknown>;

const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Definições (JSON Schema) enviadas ao modelo
// ---------------------------------------------------------------------------
export const ATTENDANCE_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "consultar_servico",
      description: "Carrega detalhes de um serviço: instruções, etapas, dados e documentos necessários e TABELA DE PREÇOS. Use antes de explicar como funciona ou quanto custa.",
      parameters: {
        type: "object",
        properties: { servico: { type: "string", description: "id do serviço (ex.: transferencia, licenciamento, cnh)" } },
        required: ["servico"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_conhecimento",
      description: "Procura na base de conhecimento da empresa (FAQs, regras, informações). Use para dúvidas gerais que não estão no contexto.",
      parameters: {
        type: "object",
        properties: { pergunta: { type: "string", description: "A dúvida, em poucas palavras" } },
        required: ["pergunta"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "identificar_cliente",
      description: "Registra quem é o cliente (titular do serviço). Use quando a pessoa informar o nome e/ou CPF/CNPJ. Se falar em nome de outra pessoa, informe a relação.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome completo do titular" },
          cpf_cnpj: { type: "string", description: "CPF ou CNPJ do titular, se informado" },
          tipo: { type: "string", enum: ["pf", "pj"], description: "pf = pessoa física, pj = empresa" },
          relacao: { type: "string", enum: Object.keys(RELATION_LABELS), description: "Relação de quem está falando com o titular" },
        },
        required: ["nome"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "abrir_caso",
      description: "Abre um novo caso (processo) para o cliente num serviço. Ele começa na primeira fase com o checklist do serviço.",
      parameters: {
        type: "object",
        properties: {
          servico: { type: "string", description: "id do serviço" },
          resumo: { type: "string", description: "Resumo curto do pedido (ex.: 'Comprou Gol 2015, quer transferir')" },
        },
        required: ["servico"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "selecionar_caso",
      description: "Define qual caso está sendo tratado quando o contato tem mais de um.",
      parameters: { type: "object", properties: { codigo: { type: "string", description: "Código do caso, ex.: TRF-0003" } }, required: ["codigo"] },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_dados",
      description: "Salva dados informados pelo cliente no caso ativo, usando as chaves do serviço. Valida CPF, placa, Renavam etc. e devolve erros para você pedir de novo.",
      parameters: {
        type: "object",
        properties: {
          campos: {
            type: "object",
            description: "Objeto chave → valor. Ex.: {\"placa\": \"ABC1D23\", \"renavam\": \"01234567890\"}",
            additionalProperties: { type: "string" },
          },
        },
        required: ["campos"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_documento",
      description: "Marca um documento do checklist do caso ativo como recebido (a equipe confere depois).",
      parameters: {
        type: "object",
        properties: {
          documento: { type: "string", description: "Chave do documento no checklist" },
          mensagem_id: { type: "string", description: "id da mensagem com a imagem/arquivo, se houver" },
          observacao: { type: "string", description: "Observação curta (ex.: 'só a frente', 'foto escura')" },
          dados_extraidos: { type: "object", description: "Dados legíveis no documento, se houver", additionalProperties: { type: "string" } },
        },
        required: ["documento"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mudar_fase",
      description: "Avança o caso ativo para outra fase. Só funciona se a fase atual permitir e o checklist estiver completo; caso contrário vira pedido de aprovação para a equipe.",
      parameters: {
        type: "object",
        properties: {
          fase: { type: "string", description: "Chave da fase de destino" },
          motivo: { type: "string", description: "Por que avançar agora" },
        },
        required: ["fase", "motivo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_orcamento",
      description: "Registra o orçamento apresentado ao cliente (status 'enviado') ou o aceite do cliente (status 'aceito'). Use apenas valores da tabela.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["enviado", "aceito"] },
          itens: {
            type: "array",
            items: {
              type: "object",
              properties: { descricao: { type: "string" }, valor: { type: ["number", "null"] } },
              required: ["descricao"],
            },
          },
          total: { type: "number", description: "Total dos itens com valor conhecido" },
        },
        required: ["status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_dados_pagamento",
      description: "Anexa à resposta a mensagem oficial com a chave PIX da empresa. Só funciona após o aceite do orçamento.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_notas",
      description: "Atualiza SUAS notas (Notas da IA) com fatos úteis para próximos atendimentos (preferências, combinados, particularidades). Substitui o conteúdo anterior: mantenha o que ainda vale.",
      parameters: {
        type: "object",
        properties: {
          alvo: { type: "string", enum: ["caso", "cliente"] },
          conteudo_md: { type: "string", description: "Notas em markdown curto (tópicos)" },
        },
        required: ["alvo", "conteudo_md"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transferir_para_humano",
      description: "Passa a conversa para a equipe humana. Depois disso você para de responder até alguém devolver a conversa.",
      parameters: {
        type: "object",
        properties: {
          motivo: { type: "string", description: "Motivo da transferência" },
          resumo: { type: "string", description: "Resumo para o atendente: o que o cliente quer e o que já foi feito" },
        },
        required: ["motivo", "resumo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finalizar_turno",
      description: "OBRIGATÓRIO no fim: entrega as mensagens para o cliente, a justificativa das suas decisões (para a equipe) e sua confiança.",
      parameters: {
        type: "object",
        properties: {
          mensagens: { type: "array", items: { type: "string" }, description: "0 a 3 mensagens curtas para o cliente, em ordem" },
          justificativa: { type: "string", description: "Para a equipe: por que respondeu assim e por que usou (ou não) cada ferramenta. Cite as regras/instruções que seguiu." },
          confianca: { type: "number", description: "0 a 1: quão segura você está de que a resposta está correta e completa" },
        },
        required: ["mensagens", "justificativa", "confianca"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------
function requireCase(st: ToolState): CaseFull {
  if (!st.activeCase) throw new Error("Não há caso ativo. Use abrir_caso ou selecionar_caso primeiro.");
  return st.activeCase;
}

async function reloadActiveCase(st: ToolState, caseId: string) {
  const cases = await loadCases({
    contactId: st.ctx.contact.id,
    clientIds: st.ctx.links.filter((l) => l.verified).map((l) => l.client.id),
  });
  const found = cases.find((c) => c.id === caseId);
  if (found) {
    st.activeCase = found;
    st.ctx.cases = cases;
  }
}

async function caseEvent(st: ToolState, caseId: string, type: string, description: string, data: Record<string, unknown> = {}) {
  await db.from("case_events").insert({ case_id: caseId, type, actor: "ai", ai_run_id: st.runId, description, data: data as never });
}

async function ensurePrimaryClient(st: ToolState): Promise<Row<"clients">> {
  const verified = st.ctx.links.find((l) => l.is_primary && l.verified) ?? st.ctx.links.find((l) => l.verified);
  if (verified) return verified.client;
  const c = st.ctx.contact;
  const client = must(
    await db
      .from("clients")
      .insert({ name: c.name || c.wa_name || `Cliente ${formatPhone(c.phone)}`, is_test: c.is_test })
      .select("*")
      .single(),
    "criar cliente",
  );
  await db.from("contact_clients").insert({ contact_id: c.id, client_id: client.id, relation: "titular", verified: true, is_primary: true });
  st.ctx.links.push({ client, relation: "titular", verified: true, is_primary: true });
  return client;
}

function missingChecklist(c: CaseFull, full: Awaited<ReturnType<typeof loadServiceFull>>) {
  const fields = (c.fields ?? {}) as CaseFields;
  const missingFields = full.fields.filter((f) => f.required && !fields[f.key]?.value).map((f) => f.label);
  const missingDocs = c.documents
    .filter((d) => d.required && !["recebido", "validado"].includes(d.status))
    .map((d) => d.label);
  return { missingFields, missingDocs };
}

const handlers: Record<string, ToolFn> = {
  async consultar_servico({ servico }, st) {
    const sv = await findServiceBySlug(String(servico ?? ""));
    if (!sv) return { erro: `Serviço "${servico}" não encontrado. Serviços: ${st.ctx.catalog.map((s) => s.slug).join(", ")}` };
    const full = await loadServiceFull(sv.id);
    st.touchedServiceIds.add(sv.id);
    st.knowledge.push({ title: `Instruções: ${sv.name}`, kind: "instrucoes", how: "consulta", ref: { table: "services", id: sv.id } });
    st.knowledge.push({ title: `Preços: ${sv.name}`, kind: "precos", how: "consulta", ref: { table: "services", id: sv.id } });
    for (const d of full.docs.filter((d) => d.scope === "service"))
      st.knowledge.push({ title: d.title, kind: d.kind, how: "consulta", ref: { table: "knowledge_docs", id: d.id } });
    return describeService(full, st.activeCase?.service_id === sv.id ? st.activeCase.stage_id : null);
  },

  async buscar_conhecimento({ pergunta }, st) {
    const q = String(pergunta ?? "");
    let vector: number[] | null = null;
    let model: string | null = null;
    try {
      const e = await embed(q);
      if (e) ({ vector, model } = e);
    } catch {
      /* sem embeddings: busca por palavras */
    }
    const { data, error } = await db.rpc("search_knowledge", {
      p_query: q,
      p_embedding: vector ? (JSON.stringify(vector) as never) : undefined,
      p_model: model ?? undefined,
      p_limit: 5,
    });
    if (error) return { erro: error.message };
    // ts_rank costuma dar valores pequenos (0,01–0,1); similaridade semântica vai de 0 a 1
    const rows = (data ?? []).filter((r) => r.score > 0.01).slice(0, 4);
    for (const r of rows)
      st.knowledge.push({ title: r.title, kind: r.kind, how: "busca", ref: { table: "knowledge_docs", id: r.id }, excerpt: r.content_md.slice(0, 160) });
    if (!rows.length) return "Nada encontrado na base de conhecimento. Não invente: se for importante, transfira para a equipe.";
    return rows.map((r) => `**${r.title}**\n${r.content_md}`).join("\n\n");
  },

  async identificar_cliente({ nome, cpf_cnpj, tipo, relacao }, st) {
    const contact = st.ctx.contact;
    const name = String(nome ?? "").trim();
    if (!name) return { erro: "Nome vazio." };
    let doc: string | null = null;
    if (cpf_cnpj) {
      const v = validateField("cpf_cnpj", cpf_cnpj);
      if (!v.ok) return { erro: v.error };
      doc = v.value;
    }
    const kind = tipo === "pj" || doc?.length === 14 ? "pj" : "pf";
    const relation = RELATION_LABELS[String(relacao)] ? String(relacao) : "titular";

    if (doc) {
      const existing = (await db.from("clients").select("*").eq("doc", doc).eq("is_test", contact.is_test).maybeSingle()).data;
      if (existing) {
        const link = st.ctx.links.find((l) => l.client.id === existing.id);
        if (link) return { ok: true, cliente: existing.name, verificado: link.verified };
        // cliente já existia: vínculo novo fica pendente de verificação (segurança)
        await db.from("contact_clients").insert({ contact_id: contact.id, client_id: existing.id, relation, verified: false, is_primary: st.ctx.links.length === 0 });
        st.ctx.links.push({ client: existing, relation, verified: false, is_primary: st.ctx.links.length === 0 });
        return {
          ok: true,
          cliente: existing.name,
          verificado: false,
          aviso: "Este CPF/CNPJ já é cliente e este telefone ainda não estava vinculado. A equipe precisa verificar antes de você falar dos processos dele. Você pode seguir com dúvidas gerais.",
        };
      }
    }

    // atualiza o cliente principal (se ainda sem documento) ou cria um novo
    const primary = st.ctx.links.find((l) => l.is_primary && l.verified);
    if (primary && relation === "titular" && (!primary.client.doc || primary.client.doc === doc)) {
      const updated = must(
        await db.from("clients").update({ name, doc: doc ?? primary.client.doc, kind }).eq("id", primary.client.id).select("*").single(),
        "atualizar cliente",
      );
      primary.client = updated;
      if (!contact.name) await db.from("contacts").update({ name }).eq("id", contact.id);
      return { ok: true, cliente: updated.name, verificado: true };
    }
    const client = must(
      await db.from("clients").insert({ name, doc, kind, is_test: contact.is_test }).select("*").single(),
      "criar cliente",
    );
    const isPrimary = !st.ctx.links.some((l) => l.is_primary);
    await db.from("contact_clients").insert({ contact_id: contact.id, client_id: client.id, relation, verified: true, is_primary: isPrimary });
    st.ctx.links.push({ client, relation, verified: true, is_primary: isPrimary });
    if (relation === "titular" && !contact.name) await db.from("contacts").update({ name }).eq("id", contact.id);
    return { ok: true, cliente: client.name, verificado: true, relacao: RELATION_LABELS[relation] };
  },

  async abrir_caso({ servico, resumo }, st) {
    const sv = await findServiceBySlug(String(servico ?? ""));
    if (!sv) return { erro: `Serviço "${servico}" não encontrado.` };
    const client = await ensurePrimaryClient(st);
    const existing = st.ctx.cases.find((c) => c.service_id === sv.id && !c.closed_at && (c.client_id === client.id || c.contact_id === st.ctx.contact.id));
    if (existing) {
      st.activeCase = existing;
      await db.from("conversations").update({ active_case_id: existing.id }).eq("id", st.ctx.conversation.id);
      return { ok: true, aviso: `Já existe o caso ${existing.code} aberto para este serviço; ele foi selecionado.`, codigo: existing.code, fase: existing.stage.name };
    }
    const full = await loadServiceFull(sv.id);
    const first = full.stages.find((s) => !s.is_canceled && !s.is_final) ?? full.stages[0];
    if (!first) return { erro: "Serviço sem fases configuradas." };
    const created = must(
      await db
        .from("cases")
        .insert({
          service_id: sv.id,
          stage_id: first.id,
          client_id: client.id,
          contact_id: st.ctx.contact.id,
          conversation_id: st.ctx.conversation.id,
          title: String(resumo ?? "").slice(0, 200),
          is_test: st.ctx.contact.is_test,
          last_change_actor: "ai",
          last_change_run_id: st.runId,
        })
        .select("id, code")
        .single(),
      "abrir caso",
    );
    await db.from("conversations").update({ active_case_id: created.id }).eq("id", st.ctx.conversation.id);
    await reloadActiveCase(st, created.id);
    st.touchedServiceIds.add(sv.id);
    const c = st.activeCase!;
    const miss = missingChecklist(c, full);
    return {
      ok: true,
      codigo: created.code,
      fase: first.name,
      faltam_dados: miss.missingFields,
      faltam_documentos: miss.missingDocs,
      dica: "Peça os itens aos poucos (no máximo 2 por mensagem).",
    };
  },

  async selecionar_caso({ codigo }, st) {
    const c = st.ctx.cases.find((x) => x.code?.toLowerCase() === String(codigo ?? "").toLowerCase());
    if (!c) return { erro: `Caso ${codigo} não encontrado entre os casos deste contato.` };
    st.activeCase = c;
    await db.from("conversations").update({ active_case_id: c.id }).eq("id", st.ctx.conversation.id);
    return { ok: true, codigo: c.code, servico: c.service.name, fase: c.stage.name };
  },

  async registrar_dados({ campos }, st) {
    const c = requireCase(st);
    const full = await loadServiceFull(c.service_id);
    const fields = { ...((c.fields ?? {}) as CaseFields) };
    const saved: string[] = [];
    const errors: Record<string, string> = {};
    const vehiclePatch: Partial<Row<"vehicles">> = {};

    for (const [key, raw] of Object.entries((campos ?? {}) as Record<string, unknown>)) {
      const def = full.fields.find((f) => f.key === key);
      if (!def) {
        errors[key] = `Chave desconhecida. Chaves válidas: ${full.fields.map((f) => f.key).join(", ")}`;
        continue;
      }
      const v = validateField(def.type, raw, (def.options as string[]) ?? []);
      if (!v.ok) {
        errors[key] = v.error;
        continue;
      }
      fields[key] = { value: v.value, status: "preenchido", source: "ai", updated_at: now() };
      saved.push(def.label);
      if (def.type === "plate") vehiclePatch.plate = v.value;
      if (def.type === "renavam") vehiclePatch.renavam = v.value;
      if (def.type === "chassis") vehiclePatch.chassis = v.value;
      if (key === "modelo") vehiclePatch.model = v.value;
    }

    const patch: Partial<Row<"cases">> = { fields: fields as never };
    if (Object.keys(vehiclePatch).length) {
      if (c.vehicle_id) {
        await db.from("vehicles").update(vehiclePatch).eq("id", c.vehicle_id);
      } else {
        let vehicleId: string | null = null;
        if (vehiclePatch.plate) {
          const { data: v } = await db.from("vehicles").select("id").eq("plate", vehiclePatch.plate).eq("is_test", c.is_test).limit(1).maybeSingle();
          vehicleId = v?.id ?? null;
          if (vehicleId) await db.from("vehicles").update(vehiclePatch).eq("id", vehicleId);
        }
        if (!vehicleId) {
          vehicleId = must(
            await db.from("vehicles").insert({ ...vehiclePatch, client_id: c.client_id, is_test: c.is_test }).select("id").single(),
            "criar veículo",
          ).id;
        }
        patch.vehicle_id = vehicleId;
      }
    }
    if (saved.length) {
      await db.from("cases").update(patch).eq("id", c.id);
      await caseEvent(st, c.id, "dados", `IA registrou: ${saved.join(", ")}`, { campos: saved });
      await reloadActiveCase(st, c.id);
    }
    const miss = missingChecklist(st.activeCase!, full);
    return { salvos: saved, erros: errors, ainda_faltam_dados: miss.missingFields, ainda_faltam_documentos: miss.missingDocs };
  },

  async registrar_documento({ documento, mensagem_id, observacao, dados_extraidos }, st) {
    const c = requireCase(st);
    const doc = c.documents.find((d) => d.doc_key === documento);
    if (!doc) return { erro: `Documento "${documento}" não está no checklist. Chaves: ${c.documents.map((d) => d.doc_key).join(", ")}` };
    let msg: Pick<Row<"messages">, "id" | "media_path"> | null = null;
    if (mensagem_id) {
      msg = (await db.from("messages").select("id, media_path").eq("id", mensagem_id).eq("conversation_id", st.ctx.conversation.id).maybeSingle()).data;
    }
    if (!msg) {
      msg = (
        await db
          .from("messages")
          .select("id, media_path")
          .eq("conversation_id", st.ctx.conversation.id)
          .eq("direction", "in")
          .not("media_path", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data;
    }
    await db
      .from("case_documents")
      .update({
        status: doc.status === "validado" ? "validado" : "recebido",
        message_id: msg?.id ?? null,
        media_path: msg?.media_path ?? doc.media_path,
        extracted: (dados_extraidos ?? {}) as never,
        notes: String(observacao ?? ""),
      })
      .eq("id", doc.id);
    await caseEvent(st, c.id, "documento", `IA marcou como recebido: ${doc.label}`, { doc: doc.doc_key });
    await reloadActiveCase(st, c.id);
    const full = await loadServiceFull(c.service_id);
    const miss = missingChecklist(st.activeCase!, full);
    return { ok: true, documento: doc.label, ainda_faltam_dados: miss.missingFields, ainda_faltam_documentos: miss.missingDocs };
  },

  async mudar_fase({ fase, motivo }, st) {
    const c = requireCase(st);
    const full = await loadServiceFull(c.service_id);
    const current = full.stages.find((s) => s.id === c.stage_id)!;
    const target = full.stages.find((s) => s.key === fase);
    if (!target) return { erro: `Fase "${fase}" não existe. Fases: ${full.stages.map((s) => s.key).join(", ")}` };
    if (target.id === current.id) return { ok: true, aviso: "O caso já está nesta fase." };

    const reasons: string[] = [];
    if (!current.ai_can_advance) reasons.push(`a fase “${current.name}” não permite avanço pela IA`);
    if (target.sort_order < current.sort_order) reasons.push("voltar de fase exige a equipe");
    if (target.is_final || target.is_canceled) reasons.push("concluir/cancelar exige a equipe");
    if (current.require_checklist) {
      const miss = missingChecklist(c, full);
      if (miss.missingFields.length || miss.missingDocs.length)
        return { erro: "Checklist incompleto — não é possível avançar.", faltam_dados: miss.missingFields, faltam_documentos: miss.missingDocs };
    }

    if (reasons.length) {
      await db.from("approvals").insert({
        kind: "mudar_fase",
        case_id: c.id,
        conversation_id: st.ctx.conversation.id,
        ai_run_id: st.runId,
        payload: { from_stage_id: current.id, to_stage_id: target.id, from: current.name, to: target.name },
        reason: String(motivo ?? ""),
      });
      return { ok: false, pedido_de_aprovacao: true, motivo: `Pedido enviado para a equipe aprovar (${reasons.join("; ")}).` };
    }

    await db.from("cases").update({ stage_id: target.id, last_change_actor: "ai", last_change_run_id: st.runId }).eq("id", c.id);
    await reloadActiveCase(st, c.id);
    return { ok: true, nova_fase: target.name, instrucoes_da_nova_fase: target.instructions_md };
  },

  async registrar_orcamento({ status, itens, total }, st) {
    const c = requireCase(st);
    const quote = { ...((c.quote ?? {}) as Record<string, unknown>) };
    if (Array.isArray(itens)) quote.itens = itens;
    if (typeof total === "number") quote.total = total;
    if (status === "enviado") quote.enviado_em = now();
    if (status === "aceito") quote.aceito_em = now();
    const newStatus = status === "aceito" ? "aceito" : "enviado";
    await db.from("cases").update({ quote: quote as never, quote_status: newStatus }).eq("id", c.id);
    await caseEvent(st, c.id, "orcamento", newStatus === "aceito" ? "Cliente aceitou o orçamento" : "Orçamento apresentado ao cliente", quote);
    await reloadActiveCase(st, c.id);
    return { ok: true, status: newStatus };
  },

  async enviar_dados_pagamento(_args, st) {
    const c = requireCase(st);
    if (!["aceito", "pago"].includes(c.quote_status))
      return { erro: "O cliente ainda não aceitou o orçamento. Registre o aceite com registrar_orcamento antes." };
    const s = st.ctx.settings;
    if (!s.pix_key.trim()) return { erro: "A chave PIX não está configurada. Transfira para a equipe enviar os dados de pagamento." };
    const total = (c.quote as { total?: number })?.total;
    const lines = [
      "💳 *Dados para pagamento (PIX)*",
      `Chave${s.pix_key_type ? ` (${s.pix_key_type})` : ""}: ${s.pix_key}`,
      s.pix_holder ? `Favorecido: ${s.pix_holder}` : null,
      total ? `Valor: ${formatMoney(total)}` : null,
      `Referência: ${c.code}`,
      "",
      "Depois de pagar, é só enviar o comprovante aqui. 🙏",
    ].filter((l) => l !== null);
    st.extraMessages.push(lines.join("\n"));
    await caseEvent(st, c.id, "pagamento", "Dados de pagamento enviados ao cliente");
    return { ok: true, info: "A mensagem oficial com a chave PIX será anexada depois das suas mensagens. Não repita a chave." };
  },

  async atualizar_notas({ alvo, conteudo_md }, st) {
    const content = String(conteudo_md ?? "").slice(0, 4000);
    if (alvo === "caso") {
      const c = requireCase(st);
      await db.from("cases").update({ ai_notes_md: content }).eq("id", c.id);
      return { ok: true };
    }
    const client = await ensurePrimaryClient(st);
    await db.from("clients").update({ ai_notes_md: content }).eq("id", client.id);
    return { ok: true };
  },

  async transferir_para_humano({ motivo, resumo }, st) {
    st.handoff = { motivo: String(motivo ?? ""), resumo: String(resumo ?? "") };
    await db
      .from("conversations")
      .update({
        status: "waiting_human",
        handoff_reason: st.handoff.motivo,
        handoff_summary: st.handoff.resumo,
        handoff_at: now(),
      })
      .eq("id", st.ctx.conversation.id);
    if (st.activeCase) await caseEvent(st, st.activeCase.id, "humano", `Transferido para a equipe: ${st.handoff.motivo}`);
    return { ok: true, info: "Conversa transferida. Avise o cliente com gentileza que um atendente vai continuar." };
  },

  async finalizar_turno({ mensagens, justificativa, confianca }, st) {
    st.final = {
      mensagens: (Array.isArray(mensagens) ? mensagens : [String(mensagens ?? "")]).map(String).filter((m) => m.trim()).slice(0, 4),
      justificativa: String(justificativa ?? ""),
      confianca: Math.max(0, Math.min(1, Number(confianca ?? 0.5))),
    };
    return { ok: true };
  },
};

export async function executeTool(name: string, rawArgs: string, st: ToolState): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    const result = { erro: "Argumentos inválidos (JSON malformado)." };
    st.tools.push({ name, args: rawArgs, result, ok: false, at: now() });
    return JSON.stringify(result);
  }
  const fn = handlers[name];
  if (!fn) {
    const result = { erro: `Ferramenta desconhecida: ${name}` };
    st.tools.push({ name, args, result, ok: false, at: now() });
    return JSON.stringify(result);
  }
  try {
    const result = await fn(args, st);
    const ok = !(result && typeof result === "object" && "erro" in (result as object));
    if (name !== "finalizar_turno") st.tools.push({ name, args, result, ok, at: now() });
    return typeof result === "string" ? result : JSON.stringify(result);
  } catch (e) {
    const result = { erro: (e as Error).message };
    st.tools.push({ name, args, result, ok: false, at: now() });
    return JSON.stringify(result);
  }
}
