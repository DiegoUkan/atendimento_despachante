import { formatPlate } from "@despachante/shared";

/** Placa no padrão Mercosul, em versão discreta. */
export function Plate({ plate, size = "sm" }: { plate?: string | null; size?: "xs" | "sm" | "md" }) {
  if (!plate) return null;
  const s = { xs: "text-[10px]", sm: "text-[11px]", md: "text-xs" }[size];
  return (
    <span className={`inline-flex flex-col overflow-hidden rounded-[3px] border border-[#334155] bg-white font-mono leading-none ${s}`}>
      <span className="h-[3px] bg-[#1e3a8a]" />
      <span className="px-1.5 py-[2px] font-semibold tracking-[0.1em] text-ink">{formatPlate(plate)}</span>
    </span>
  );
}
