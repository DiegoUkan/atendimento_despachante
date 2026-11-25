/** Marca: monograma com as iniciais da empresa */
export function Logo({ size = 28, name = "Despachante" }: { size?: number; name?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "D";
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-lg bg-white font-semibold text-nav"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initials}
    </span>
  );
}

export function Wordmark({ name = "Despachante", subtitle = "Atendimento", dark = true }: { name?: string; subtitle?: string; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={dark ? "" : "rounded-lg ring-1 ring-line"}>
        <Logo name={name} />
      </span>
      <div className="min-w-0 leading-tight">
        <div className={`truncate text-sm font-semibold ${dark ? "text-white" : "text-ink"}`}>{name}</div>
        <div className={`text-[11px] ${dark ? "text-[#94a3b8]" : "text-ink-3"}`}>{subtitle}</div>
      </div>
    </div>
  );
}
