/**
 * Regras de domínio compartilhadas entre painel e worker:
 * rótulos, resolução de modo de atendimento, horário comercial e templates.
 */

export type Mode = "auto" | "copilot" | "manual";

export const MODE_INFO: Record<Mode, { label: string; emoji: string; description: string }> = {
  auto: { label: "Automático", emoji: "⚡", description: "A IA responde sozinha" },
  copilot: { label: "Copiloto", emoji: "🤝", description: "A IA sugere, um humano aprova" },
  manual: { label: "Manual", emoji: "✋", description: "A IA fica em silêncio" },
};

export const WAITING_ON_LABELS: Record<string, { label: string; emoji: string }> = {
  client: { label: "Aguardando cliente", emoji: "🙋" },
  office: { label: "Com a equipe", emoji: "🧑‍💼" },
  detran: { label: "No Detran", emoji: "🏛️" },
  payment: { label: "Aguardando pagamento", emoji: "💸" },
};

export const RELATION_LABELS: Record<string, string> = {
  titular: "Titular",
  familiar: "Familiar",
  conjuge: "Cônjuge",
  funcionario: "Funcionário",
  lojista: "Lojista / revenda",
  procurador: "Procurador",
  outro: "Outro",
};

export const DOC_STATUS_INFO: Record<string, { label: string; emoji: string; tone: string }> = {
  pendente: { label: "Pendente", emoji: "⏳", tone: "muted" },
  recebido: { label: "Recebido", emoji: "📩", tone: "info" },
  validado: { label: "Validado", emoji: "✅", tone: "success" },
  recusado: { label: "Recusado", emoji: "⚠️", tone: "danger" },
};

export const CONVERSATION_STATUS_INFO: Record<string, { label: string; emoji: string }> = {
  open: { label: "Aberta", emoji: "💬" },
  waiting_human: { label: "Aguardando humano", emoji: "🙋" },
  closed: { label: "Encerrada", emoji: "📦" },
};

export const NOTIFY_MODE_INFO: Record<string, { label: string; description: string }> = {
  auto: { label: "Avisar automaticamente", description: "Envia a mensagem da fase sozinho" },
  approval: { label: "Avisar com aprovação", description: "Cria um rascunho para alguém aprovar" },
  none: { label: "Não avisar", description: "O cliente não recebe mensagem" },
};

// ---------------------------------------------------------------------------
// Modo efetivo: conversa > fase > serviço > número (canal) > padrão da empresa
// ---------------------------------------------------------------------------
export function resolveMode(input: {
  conversation?: { mode?: string | null } | null;
  stage?: { mode_override?: string | null; name?: string } | null;
  service?: { mode_override?: string | null; name?: string } | null;
  channel?: { mode_override?: string | null; name?: string } | null;
  defaultMode: string;
}): { mode: Mode; source: string } {
  const { conversation, stage, service, channel, defaultMode } = input;
  if (conversation?.mode) return { mode: conversation.mode as Mode, source: "definido nesta conversa" };
  if (stage?.mode_override) return { mode: stage.mode_override as Mode, source: `fase “${stage.name ?? "?"}”` };
  if (service?.mode_override) return { mode: service.mode_override as Mode, source: `serviço “${service.name ?? "?"}”` };
  if (channel?.mode_override) return { mode: channel.mode_override as Mode, source: `número “${channel.name ?? "?"}”` };
  return { mode: (defaultMode as Mode) || "copilot", source: "padrão da empresa" };
}

// ---------------------------------------------------------------------------
// Horário comercial (fuso da empresa, feriados)
// ---------------------------------------------------------------------------
export type BusinessHours = Record<string, [string, string][]>;
export type Holiday = { date: string; name: string };

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = get("hour") === "24" ? "00" : get("hour");
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    hm: `${hour}:${get("minute")}`,
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

export type OpenStatus = {
  open: boolean;
  holiday?: string;
  nowLabel: string;            // "terça, 14:32"
  nextOpening?: string;        // "amanhã (quarta) às 08:00"
  todayRanges: [string, string][];
};

export function businessStatus(
  date: Date,
  hours: BusinessHours,
  holidays: Holiday[] = [],
  timeZone = "America/Sao_Paulo",
): OpenStatus {
  const now = zonedParts(date, timeZone);
  const holiday = holidays.find((h) => h.date === now.ymd);
  const todayRanges = holiday ? [] : hours[String(now.weekday)] ?? [];
  const open = todayRanges.some(([a, b]) => now.hm >= a && now.hm < b);
  const nowLabel = `${WEEKDAYS[now.weekday]}, ${now.hm}`;
  if (open) return { open, holiday: holiday?.name, nowLabel, todayRanges };

  // procura a próxima abertura nos próximos 14 dias
  for (let i = 0; i < 14; i++) {
    const day = new Date(date.getTime() + i * 86_400_000);
    const p = zonedParts(day, timeZone);
    if (holidays.some((h) => h.date === p.ymd)) continue;
    const ranges = hours[String(p.weekday)] ?? [];
    for (const [a] of ranges) {
      if (i === 0 && a <= now.hm) continue;
      const when = i === 0 ? "hoje" : i === 1 ? `amanhã (${WEEKDAYS[p.weekday]})` : `${WEEKDAYS[p.weekday]} (${p.ymd.slice(8, 10)}/${p.ymd.slice(5, 7)})`;
      return { open, holiday: holiday?.name, nowLabel, nextOpening: `${when} às ${a}`, todayRanges };
    }
  }
  return { open, holiday: holiday?.name, nowLabel, todayRanges };
}

// ---------------------------------------------------------------------------
// Templates de aviso: "Olá {nome}! O processo {codigo}..."
// ---------------------------------------------------------------------------
export const TEMPLATE_VARIABLES = [
  { key: "nome", description: "Primeiro nome do cliente" },
  { key: "codigo", description: "Código do caso (ex.: TRF-0012)" },
  { key: "servico", description: "Nome do serviço" },
  { key: "fase", description: "Nome da nova fase" },
  { key: "placa", description: "Placa do veículo" },
  { key: "empresa", description: "Nome da empresa" },
];

export function renderTemplate(template: string, vars: Record<string, string | null | undefined>): string {
  const EMPTY = "\u0000";
  return template
    .replace(/\{(\w+)\}/g, (_, k: string) => {
      const v = vars[k];
      return v === undefined || v === null || v === "" ? EMPTY : String(v);
    })
    // "(placa {placa})" com placa vazia → some o trecho inteiro
    .replace(/\s*\([^()]*\u0000[^()]*\)/g, "")
    .replace(/\u0000/g, "")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** campos do caso: {chave: {value, status, source, updated_at}} */
export type CaseFieldValue = {
  value: string;
  status: "preenchido" | "validado";
  source: "ai" | "human";
  updated_at: string;
};
export type CaseFields = Record<string, CaseFieldValue>;
