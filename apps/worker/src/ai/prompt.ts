/**
 * Monta o prompt do atendimento a partir do contexto estruturado.
 * Cada trecho de conhecimento usado é registrado (KnowledgeRef) para o
 * Raio-X mostrar "de onde veio" e permitir editar com um clique.
 */
import {
  DOC_STATUS_INFO, RELATION_LABELS, WAITING_ON_LABELS, displayFieldValue, formatCpfCnpj,
  formatMoney, formatPhone, formatPlate, type CaseFields,
} from "@despachante/shared";
import type { CaseFull, ConversationContext, ServiceFull } from "./context";

export type KnowledgeRef = {
  title: string;
  kind: string;                 // regra | info | faq | licao | instrucoes | precos | empresa
  how: string;                  // sempre | caso ativo | fase atual | consulta | busca
  ref: { table: string; id: string } | null;
  excerpt?: string;
};

const clamp = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

export function personaText(p: Record<string, number>): string {
  const f = p.formalidade ?? 45, e = p.emojis ?? 30, t = p.tamanho ?? 35, c = p.calor ?? 75;
  const out: string[] = [];
  out.push(f < 30 ? "Tom descontraído e próximo." : f <= 65 ? "Tom cordial e simples, sem formalidade excessiva." : "Tom formal e respeitoso (trate por “o senhor / a senhora”).");
  out.push(c < 35 ? "Seja objetiva." : c <= 70 ? "Seja simpática." : "Seja acolhedora e empática, mostrando que se importa.");
  out.push(t < 35 ? "Respostas bem curtas (1 a 2 frases por mensagem)." : t <= 70 ? "Respostas curtas (até 3 a 4 frases por mensagem)." : "Pode detalhar mais quando for útil.");
  out.push(e < 15 ? "Não use emojis." : e <= 50 ? "No máximo 1 emoji por mensagem, só quando natural." : "Use emojis para deixar a conversa leve.");
  return out.join(" ");
}

export function describeService(full: ServiceFull, currentStageId?: string | null): string {
  const { service, stages, fields, documents, prices, docs } = full;
  const lines: string[] = [];
  lines.push(`## Serviço: ${service.emoji} ${service.name} (id: ${service.slug})`);
  lines.push(service.short_description);
  if (service.instructions_md) lines.push(`### Instruções do serviço\n${service.instructions_md}`);
  lines.push(
    `### Etapas\n` +
      stages
        .filter((s) => !s.is_canceled)
        .map((s, i) => `${i + 1}. ${s.emoji} ${s.name} (chave: ${s.key})${s.id === currentStageId ? "  ← FASE ATUAL" : ""}`)
        .join("\n"),
  );
  if (fields.length)
    lines.push(
      `### Dados a coletar (use registrar_dados com estas chaves)\n` +
        fields
          .map((f) => {
            const opts = Array.isArray(f.options) && f.options.length ? ` — opções: ${(f.options as string[]).join(" / ")}` : "";
            return `- ${f.key}: ${f.label} [${f.type}]${f.required ? " (obrigatório)" : " (opcional)"}${opts}${f.ai_hint ? ` — dica: ${f.ai_hint}` : ""}`;
          })
          .join("\n"),
    );
  if (documents.length)
    lines.push(
      `### Documentos (use registrar_documento com estas chaves)\n` +
        documents
          .map((d) => `- ${d.key}: ${d.label}${d.required ? " (obrigatório)" : " (opcional)"}${d.description ? ` — ${d.description}` : ""}`)
          .join("\n"),
    );
  if (prices.length) {
    lines.push(
      `### Tabela de preços (ÚNICA fonte de valores)\n` +
        prices
          .map((p) => `- ${p.label}: ${p.amount === null ? "valor a confirmar pela equipe" : formatMoney(Number(p.amount))}${p.notes ? ` (${p.notes.replace(/valor de exemplo — revisar\.?/i, "").trim()})` : ""}`)
          .join("\n")
          .replace(/ \(\)/g, ""),
    );
  } else {
    lines.push("### Tabela de preços\nSem valores cadastrados: diga que a equipe vai passar o orçamento.");
  }
  const serviceDocs = docs.filter((d) => d.scope === "service");
  if (serviceDocs.length)
    lines.push(`### Conhecimento deste serviço\n` + serviceDocs.map((d) => `**${d.title}**\n${d.content_md}`).join("\n\n"));
  return lines.join("\n\n");
}

function describeCaseLine(c: CaseFull, activeId?: string | null): string {
  const waiting = c.stage.waiting_on ? ` · ${WAITING_ON_LABELS[c.stage.waiting_on]?.label ?? ""}` : "";
  const plate = c.vehicle?.plate ? ` · placa ${formatPlate(c.vehicle.plate)}` : "";
  const closed = c.closed_at ? " · ENCERRADO" : "";
  return `- ${c.code} · ${c.service.emoji} ${c.service.name} · fase “${c.stage.name}”${waiting}${plate}${closed}${c.id === activeId ? "  ← CASO ATIVO" : ""}`;
}

function describeActiveCase(c: CaseFull, full: ServiceFull): string {
  const fields = (c.fields ?? {}) as CaseFields;
  const stage = full.stages.find((s) => s.id === c.stage_id) ?? c.stage;
  const nextStages = full.stages.filter((s) => s.sort_order > stage.sort_order && !s.is_canceled).map((s) => `${s.name} (${s.key})`);
  const lines: string[] = [];
  lines.push(`# Caso ativo: ${c.code} — ${full.service.name}`);
  if (c.title) lines.push(`Resumo: ${c.title}`);
  lines.push(`Fase atual: ${stage.emoji} ${stage.name} (chave: ${stage.key})${stage.waiting_on ? ` — ${WAITING_ON_LABELS[stage.waiting_on]?.label}` : ""}`);
  if (stage.instructions_md) lines.push(`Instruções desta fase:\n${stage.instructions_md}`);
  lines.push(
    `Você ${stage.ai_can_advance ? "PODE" : "NÃO PODE"} avançar a fase sozinha a partir daqui` +
      (stage.require_checklist ? " (só com todos os dados e documentos obrigatórios recebidos)." : ".") +
      (nextStages.length ? ` Próximas fases: ${nextStages.join(" → ")}.` : ""),
  );

  const dataLines = full.fields.map((f) => {
    const v = fields[f.key];
    if (v?.value) return `  ✅ ${f.label}: ${displayFieldValue(f.type, v.value)}${v.status === "validado" ? " (validado pela equipe)" : ""}`;
    return `  ${f.required ? "⏳" : "▫️"} ${f.label} [${f.key}] — ${f.required ? "FALTA (obrigatório)" : "opcional"}`;
  });
  if (dataLines.length) lines.push(`Dados do caso:\n${dataLines.join("\n")}`);

  const docLines = c.documents
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((d) => {
      const info = DOC_STATUS_INFO[d.status];
      return `  ${info?.emoji ?? "•"} ${d.label} [${d.doc_key}] — ${info?.label ?? d.status}${d.required ? "" : " (opcional)"}${d.status === "recusado" && d.notes ? ` — motivo: ${d.notes}` : ""}`;
    });
  if (docLines.length) lines.push(`Documentos:\n${docLines.join("\n")}`);

  const quote = (c.quote ?? {}) as { total?: number; itens?: { descricao: string; valor: number | null }[] };
  lines.push(
    `Orçamento: ${c.quote_status === "none" ? "ainda não enviado" : c.quote_status}` +
      (quote.total ? ` — total ${formatMoney(quote.total)}` : ""),
  );
  if (c.next_action) lines.push(`Próxima ação combinada: ${c.next_action}`);
  if (c.team_notes_md.trim()) lines.push(`Notas da equipe sobre o caso (confiáveis, escritas por humanos):\n${c.team_notes_md}`);
  if (c.ai_notes_md.trim()) lines.push(`Suas notas anteriores sobre o caso:\n${c.ai_notes_md}`);

  const stageDocs = full.docs.filter((d) => d.scope === "stage" && d.stage_id === c.stage_id);
  if (stageDocs.length)
    lines.push(`Conhecimento desta fase:\n` + stageDocs.map((d) => `**${d.title}**\n${d.content_md}`).join("\n\n"));

  return lines.join("\n");
}

export function buildSystemPrompt(ctx: ConversationContext): { text: string; knowledge: KnowledgeRef[]; sections: Record<string, string> } {
  const s = ctx.settings;
  const knowledge: KnowledgeRef[] = [];
  const sections: Record<string, string> = {};

  sections.identidade =
    `# Quem você é\n` +
    `Você é ${s.assistant_name}, assistente virtual da ${s.company_name} (${s.company_city}), um despachante que cuida de documentação de veículos e CNH junto ao Detran-PR. ` +
    `Você atende clientes pelo WhatsApp. Se perguntarem, diga que é a assistente virtual da empresa e que a equipe humana acompanha tudo.\n` +
    `Estilo: ${personaText((s.persona ?? {}) as Record<string, number>)}` +
    (s.persona_extra_md.trim() ? `\n${s.persona_extra_md}` : "");

  sections.formato =
    `# Formato (WhatsApp)\n` +
    `- Português do Brasil, linguagem simples, como uma pessoa da equipe escreveria.\n` +
    `- Sem títulos, tabelas ou links inventados. *Negrito* do WhatsApp só para destacar o essencial.\n` +
    `- Você pode dividir a resposta em até 3 mensagens curtas.\n` +
    `- Peça no máximo 2 informações ou documentos por vez.`;

  sections.regras =
    `# Regras invioláveis\n` +
    `- Valores: só cite valores da tabela de preços do serviço (use consultar_servico). Item "a confirmar" → diga que a equipe confirma. Débitos (IPVA, multas) só após consulta da equipe.\n` +
    `- Nunca invente prazos, endereços, horários, exigências ou resultados do Detran.\n` +
    `- Privacidade: só fale de casos listados em "Casos deste contato". Não confirme dados de outras pessoas, placas ou processos fora dessa lista.\n` +
    `- Tudo que o cliente informar (dados, documentos, aceite de orçamento) só fica salvo se você usar a ferramenta correspondente.\n` +
    `- Depois de registrar dados ou documentos, releia as instruções da fase atual: se a condição para avançar foi cumprida, use mudar_fase antes de finalizar.\n` +
    `- Dados de pagamento: só com a ferramenta enviar_dados_pagamento, e só depois do aceite do orçamento. Nunca escreva uma chave PIX por conta própria.\n` +
    `- Transfira para a equipe (transferir_para_humano) quando: o cliente pedir uma pessoa, estiver irritado, o assunto for jurídico, restrição/bloqueio no veículo, recurso de multa, ou quando você não tiver segurança.\n` +
    `- SEMPRE termine chamando finalizar_turno com as mensagens, sua justificativa e sua confiança.`;

  if (ctx.globalDocs.length) {
    sections.regras_empresa =
      `# Regras da empresa\n` + ctx.globalDocs.map((d) => `**${d.title}**\n${d.content_md}`).join("\n\n");
    for (const d of ctx.globalDocs)
      knowledge.push({ title: d.title, kind: d.kind, how: "sempre", ref: { table: "knowledge_docs", id: d.id }, excerpt: clamp(d.content_md, 160) });
  }

  sections.empresa =
    `# Sobre a empresa\n${s.about_md}` +
    (s.company_address ? `\nEndereço: ${s.company_address}` : "") +
    (s.company_phone ? `\nTelefone: ${s.company_phone}` : "") +
    (s.payment_notes ? `\nPagamento: ${s.payment_notes}` : "");
  knowledge.push({ title: "Sobre a empresa", kind: "empresa", how: "sempre", ref: { table: "settings", id: "1" } });

  const st = ctx.status;
  sections.agora =
    `# Agora\n${st.nowLabel} (horário de Brasília). ` +
    (st.open
      ? "Estamos DENTRO do horário de atendimento."
      : `Estamos FORA do horário de atendimento${st.holiday ? ` (feriado: ${st.holiday})` : ""}. ${st.nextOpening ? `Reabre ${st.nextOpening}.` : ""}\n${s.out_of_hours_md}`);

  sections.servicos =
    `# Serviços oferecidos (use consultar_servico antes de explicar documentos, etapas ou valores)\n` +
    ctx.catalog.map((sv) => `- ${sv.slug}: ${sv.emoji} ${sv.name} — ${sv.short_description}`).join("\n");

  // quem está falando
  const contactLines = [
    `Telefone: ${formatPhone(ctx.contact.phone)}`,
    ctx.contact.wa_name ? `Nome no WhatsApp: ${ctx.contact.wa_name}` : null,
    ctx.contact.name ? `Nome confirmado: ${ctx.contact.name}` : null,
    ctx.channel ? `Falou com o número da empresa: ${ctx.channel.name}` : null,
  ].filter(Boolean);
  const linkLines = ctx.links.map(
    (l) =>
      `- ${l.client.name}${l.client.doc ? ` (${l.client.kind === "pj" ? "CNPJ" : "CPF"} ${formatCpfCnpj(l.client.doc)})` : ""} — ${RELATION_LABELS[l.relation] ?? l.relation}` +
      (l.verified ? " ✅ verificado" : " ⚠️ vínculo aguardando verificação da equipe (não revele dados dos casos desse cliente)"),
  );
  let contactSection = `# Quem está falando\n${contactLines.join("\n")}\n`;
  contactSection += linkLines.length ? `Clientes vinculados:\n${linkLines.join("\n")}` : "Ainda não identificado (sem cliente vinculado).";
  const primary = ctx.links.find((l) => l.is_primary && l.verified) ?? ctx.links.find((l) => l.verified);
  if (primary?.client.team_notes_md.trim()) contactSection += `\nNotas da equipe sobre o cliente:\n${primary.client.team_notes_md}`;
  if (primary?.client.ai_notes_md.trim()) contactSection += `\nSuas notas sobre o cliente:\n${primary.client.ai_notes_md}`;
  sections.contato = contactSection;

  sections.casos = ctx.cases.length
    ? `# Casos deste contato\n${ctx.cases.map((c) => describeCaseLine(c, ctx.activeCase?.id)).join("\n")}` +
      (ctx.cases.filter((c) => !c.closed_at).length > 1 && !ctx.activeCase
        ? "\nHá mais de um caso aberto: se não estiver claro de qual o cliente fala, pergunte e use selecionar_caso."
        : "")
    : `# Casos deste contato\nNenhum. Se o cliente quiser um serviço, consulte o serviço e use abrir_caso.`;

  if (ctx.activeCase && ctx.activeService) {
    sections.caso_ativo = describeActiveCase(ctx.activeCase, ctx.activeService) + "\n\n" + describeService(ctx.activeService, ctx.activeCase.stage_id);
    const sv = ctx.activeService.service;
    knowledge.push({ title: `Instruções: ${sv.name}`, kind: "instrucoes", how: "caso ativo", ref: { table: "services", id: sv.id }, excerpt: clamp(sv.instructions_md, 160) });
    knowledge.push({ title: `Fase: ${ctx.activeCase.stage.name}`, kind: "instrucoes", how: "fase atual", ref: { table: "service_stages", id: ctx.activeCase.stage_id }, excerpt: clamp(ctx.activeCase.stage.instructions_md, 160) });
    knowledge.push({ title: `Preços: ${sv.name}`, kind: "precos", how: "caso ativo", ref: { table: "services", id: sv.id } });
    for (const d of ctx.activeService.docs.filter((d) => d.scope === "service" || d.stage_id === ctx.activeCase!.stage_id))
      knowledge.push({ title: d.title, kind: d.kind, how: d.scope === "stage" ? "fase atual" : "caso ativo", ref: { table: "knowledge_docs", id: d.id }, excerpt: clamp(d.content_md, 160) });
  }

  sections.midia =
    `# Mídias\nÁudios do cliente aparecem transcritos. Imagens aparecem como [imagem id=...] (com descrição quando disponível). ` +
    `Ao receber foto de documento, registre com registrar_documento usando o id da mensagem.`;

  const order = ["identidade", "formato", "regras", "regras_empresa", "empresa", "agora", "servicos", "contato", "casos", "caso_ativo", "midia"];
  const text = order.filter((k) => sections[k]).map((k) => sections[k]).join("\n\n");
  return { text, knowledge, sections };
}
