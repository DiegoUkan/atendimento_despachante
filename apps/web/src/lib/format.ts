import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 45_000) return "agora";
  return formatDistanceToNowStrict(d, { locale: ptBR, addSuffix: false })
    .replace(" minutos", " min").replace(" minuto", " min")
    .replace(" segundos", " s").replace(" horas", " h").replace(" hora", " h");
}

export function chatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "ontem";
  return format(d, "dd/MM");
}

export function fullDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return format(new Date(iso), "dd MMM", { locale: ptBR });
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
