"use client";

import { Inbox, X, type LucideIcon } from "lucide-react";
import {
  forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------------------------------------------------------------------------
type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "sun";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white border border-brand hover:bg-[#1e40af]",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2",
  ghost: "text-ink-2 border border-transparent hover:bg-surface-2 hover:text-ink",
  danger: "bg-coral text-white border border-coral hover:brightness-110",
  success: "bg-mint text-white border border-mint hover:brightness-110",
  sun: "bg-brand-soft text-brand border border-[#c7d7fe] hover:bg-[#e2eaff]",
};
const SIZES = { xs: "h-6 px-2 text-xs gap-1", sm: "h-7 px-2.5 text-xs gap-1.5", md: "h-8 px-3 text-[13px] gap-1.5", lg: "h-10 px-4 text-sm gap-2" };

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; size?: keyof typeof SIZES; loading?: boolean; icon?: ReactNode;
}>(function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap [&_svg]:size-3.5",
        VARIANTS[variant], SIZES[size], className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-3.5" /> : icon}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block animate-spin rounded-full border-2 border-current border-t-transparent opacity-70", className ?? "size-5")} />;
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-2xl border border-line bg-surface", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon: Icon, actions, className }: {
  title: ReactNode; subtitle?: ReactNode; icon?: LucideIcon | string; actions?: ReactNode; className?: string;
}) {
  return (
    <div className={cx("flex items-start gap-3 border-b border-line px-5 py-3.5", className)}>
      {Icon && typeof Icon !== "string" && <Icon className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.75} />}
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold leading-tight">{title}</div>
        {subtitle && <div className="mt-0.5 text-[13px] text-ink-2">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "brand" | "sun" | "mint" | "coral" | "violet";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  brand: "bg-brand-soft text-brand border-[#c7d7fe]",
  sun: "bg-sun-soft text-sun border-[#fde68a]",
  mint: "bg-mint-soft text-mint border-[#bbf7d0]",
  coral: "bg-coral-soft text-coral border-[#fecaca]",
  violet: "bg-violet-soft text-violet border-[#ddd6fe]",
};
export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[11.5px] font-medium whitespace-nowrap [&_svg]:size-3", TONES[tone], className)}>
      {children}
    </span>
  );
}

/** bolinha de cor (fase, canal, status) */
export function Dot({ color, className }: { color?: string | null; className?: string }) {
  return <span className={cx("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color ?? "#9ca3af" }} />;
}

// ---------------------------------------------------------------------------
const fieldBase =
  "w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-3 outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/12 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(fieldBase, "h-8", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(fieldBase, "min-h-24 py-2 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(fieldBase, "h-8 cursor-pointer pr-7", className)} {...rest}>
      {children}
    </select>
  );
});

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean;
}) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-2.5", disabled && "pointer-events-none opacity-50")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-[18px] w-8 shrink-0 rounded-full transition", checked ? "bg-brand" : "bg-line-strong")}
      >
        <span className={cx("absolute top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-all", checked ? "left-4" : "left-0.5")} />
      </button>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-[13px] font-medium">{label}</span>}
          {description && <span className="block text-xs text-ink-2">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, left, right }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; left?: ReactNode; right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      {left && <span className="w-24 shrink-0 text-right text-xs text-ink-2">{left}</span>}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 flex-1 cursor-pointer" />
      {right && <span className="w-24 shrink-0 text-xs text-ink-2">{right}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function Tabs<T extends string>({ tabs, value, onChange, className }: {
  tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div className={cx("inline-flex gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cx(
            "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-[13px] font-medium transition",
            value === t.value ? "bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "text-ink-2 hover:text-ink",
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="text-[11px] text-ink-3">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgb(15_23_42/0.45)] p-4 pt-[8vh]" onMouseDown={onClose}>
        <div className={cx("pop-in w-full rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)]", width)} onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
            <div>
              <div className="text-base font-semibold">{title}</div>
              {subtitle && <div className="text-[13px] text-ink-2">{subtitle}</div>}
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Fechar"><X className="size-4" /></button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

export function Drawer({ open, onClose, title, subtitle, children, actions, width = "max-w-2xl" }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode; width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-40 bg-[rgb(15_23_42/0.35)]" onClick={onClose} />
      <aside className={cx("fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-bg shadow-[var(--shadow-pop)]", width)}>
        <div className="flex items-center gap-3 border-b border-line bg-surface px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">{title}</div>
            {subtitle && <div className="text-[13px] text-ink-2">{subtitle}</div>}
          </div>
          {actions}
          <button onClick={onClose} className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Fechar"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </Portal>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: {
  icon?: LucideIcon; emoji?: string; title: ReactNode; description?: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 grid size-10 place-items-center rounded-full border border-line bg-surface-2 text-ink-3">
        <Icon className="size-4.5" strokeWidth={1.75} />
      </div>
      <div className="text-sm font-semibold">{title}</div>
      {description && <div className="mt-1 max-w-sm text-[13px] text-ink-2">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Avatar({ name, size = 32, tone = "neutral", icon: Icon }: {
  name?: string | null; size?: number; tone?: "neutral" | "accent" | "ai"; icon?: LucideIcon; emoji?: string; color?: string;
}) {
  const initials = (name ?? "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
  const style = {
    neutral: "bg-surface-2 text-ink-2 border border-line",
    accent: "bg-brand text-white border border-brand",
    ai: "bg-violet-soft text-violet border border-[#ddd6fe]",
  }[tone];
  return (
    <span className={cx("inline-grid shrink-0 place-items-center rounded-full font-semibold", style)} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {Icon ? <Icon style={{ width: size * 0.45, height: size * 0.45 }} strokeWidth={1.75} /> : initials}
    </span>
  );
}

export function ProgressBar({ value, tone = "brand" }: { value: number; tone?: "brand" | "mint" | "sun" }) {
  const color = { brand: "bg-brand", mint: "bg-mint", sun: "bg-sun" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className={cx("h-full rounded-full transition-all", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function PageHeader({ icon: Icon, title, subtitle, actions }: { icon?: LucideIcon; emoji?: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-start gap-2.5">
        {Icon && <Icon className="mt-1 size-5 text-ink-3" strokeWidth={1.75} />}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-[13px] text-ink-2">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Confidence({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return null;
  const pct = Math.round(Number(value) * 100);
  const tone = pct >= 75 ? "mint" : pct >= 50 ? "sun" : "coral";
  return <Badge tone={tone} title="Confiança declarada pela IA">Confiança {pct}%</Badge>;
}
