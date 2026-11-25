"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Textarea, cx } from "./ui";

export function Markdown({ children, className }: { children: string | null | undefined; className?: string }) {
  if (!children?.trim()) return <span className="text-sm text-ink-3">—</span>;
  return (
    <div className={cx("md text-sm", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

/** Editor de markdown com abas Escrever / Visualizar */
export function MarkdownEditor({ value, onChange, placeholder, rows = 8, disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; disabled?: boolean;
}) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-1 border-b border-line bg-surface-2 px-2 py-1">
        {(["edit", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cx("rounded-md px-2.5 py-1 text-xs font-bold", tab === t ? "bg-surface text-ink shadow-sm" : "text-ink-2")}
          >
            {t === "edit" ? "Escrever" : "Visualizar"}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-ink-3">Markdown: **negrito**, - listas, ## títulos</span>
      </div>
      {tab === "edit" ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className="rounded-none border-0 focus:ring-0 font-mono text-[13px]"
        />
      ) : (
        <div className="min-h-24 px-4 py-3">
          <Markdown>{value}</Markdown>
        </div>
      )}
    </div>
  );
}
