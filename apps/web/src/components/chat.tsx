"use client";

import { AlertTriangle, Check, CheckCheck, Clock, FileText, Pencil, ScanSearch, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Row } from "@despachante/shared";
import { chatTime } from "@/lib/format";
import { useSignedUrl } from "@/lib/media";
import { Button, Textarea, cx } from "./ui";

export type Message = Row<"messages">;

function StatusIcon({ status }: { status: string }) {
  const cls = "size-3.5";
  if (status === "sent") return <CheckCheck className={cx(cls, "text-[#3b82f6]")} aria-label="Enviada" />;
  if (status === "queued" || status === "sending") return <Clock className={cls} aria-label="Na fila de envio" />;
  if (status === "failed") return <AlertTriangle className={cx(cls, "text-coral")} aria-label="Falhou" />;
  if (status === "discarded") return <Trash2 className={cls} aria-label="Descartada" />;
  if (status === "draft") return <Pencil className={cls} aria-label="Rascunho" />;
  return <Check className={cls} />;
}

function Media({ m }: { m: Message }) {
  const url = useSignedUrl(m.media_path);
  if (!m.media_path) return null;
  if (m.kind === "image")
    return url ? (
      <a href={url} target="_blank" rel="noreferrer" className="mb-1 block overflow-hidden rounded-lg border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={m.media_name ?? "imagem"} className="max-h-60 w-full object-cover" />
      </a>
    ) : (
      <div className="mb-1 grid h-32 place-items-center rounded-lg bg-surface-2 text-xs text-ink-3">carregando imagem…</div>
    );
  if (m.kind === "audio")
    return (
      <div className="mb-1">
        {url ? <audio controls src={url} className="h-9 w-56 max-w-full" /> : <div className="text-xs text-ink-3">Áudio</div>}
        {m.transcript && <div className="mt-1 text-xs italic text-ink-2">“{m.transcript}”</div>}
      </div>
    );
  return (
    <a href={url ?? "#"} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] font-medium">
      <FileText className="size-4 text-ink-3" /> {m.media_name ?? "arquivo"}
    </a>
  );
}

/** Renderiza *negrito* e _itálico_ do WhatsApp */
function WaText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        /^\*[^*]+\*$/.test(p) ? <b key={i} className="font-semibold">{p.slice(1, -1)}</b> : /^_[^_]+_$/.test(p) ? <i key={i}>{p.slice(1, -1)}</i> : <span key={i}>{p}</span>,
      )}
    </span>
  );
}

export function MessageBubble({
  m, perspective = "company", channel, senderName, assistantName = "IA", onApprove, onDiscard, onEdit, onShowRun, highlight,
}: {
  m: Message;
  perspective?: "company" | "client";
  channel?: Row<"channels"> | null;
  senderName?: string | null;
  assistantName?: string;
  assistantEmoji?: string;
  onApprove?: (m: Message) => void;
  onDiscard?: (m: Message) => void;
  onEdit?: (m: Message, body: string) => void;
  onShowRun?: (runId: string) => void;
  highlight?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const fromCompany = m.direction === "out";
  const right = perspective === "company" ? fromCompany : !fromCompany;
  const isDraft = m.status === "draft";
  const label =
    m.sender === "ai" ? `${assistantName} (IA)` : m.sender === "human" ? senderName ?? "Atendente" : m.sender === "system" ? "Aviso automático" : null;

  return (
    <div className={cx("flex", right ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "pop-in relative max-w-[78%] rounded-xl border px-3 py-2 text-[13.5px]",
          isDraft ? "border-dashed border-[#c4b5fd] bg-[#fbfaff]" : right ? "border-[#d3e9dd] bg-wa-out" : "border-line bg-wa-in",
          m.status === "failed" && "border-[#fecaca]",
          m.status === "discarded" && "opacity-50",
          highlight && "ring-2 ring-brand/40",
        )}
      >
        {fromCompany && label && perspective === "company" && (
          <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-2">
            {isDraft && <span className="rounded border border-[#ddd6fe] bg-violet-soft px-1 text-violet">Rascunho</span>}
            {label}
            {m.ai_run_id && onShowRun && (
              <button onClick={() => onShowRun(m.ai_run_id!)} className="ml-1 inline-flex items-center gap-0.5 text-ink-3 hover:text-violet" title="Ver o Raio-X desta resposta">
                <ScanSearch className="size-3" /> Raio-X
              </button>
            )}
          </div>
        )}
        <Media m={m} />
        {editing ? (
          <div className="space-y-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} className="bg-white" />
            <div className="flex justify-end gap-1">
              <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
              <Button size="xs" onClick={() => { onEdit?.(m, draft); setEditing(false); }}>Salvar e enviar</Button>
            </div>
          </div>
        ) : (
          m.body && (m.kind === "text" || m.body.trim()) && <WaText text={m.body} />
        )}
        {m.kind === "image" && m.media_description && perspective === "company" && (
          <div className="mt-1 text-[11px] italic text-ink-3">Leitura da IA: {m.media_description.slice(0, 160)}</div>
        )}
        <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[10.5px] text-ink-3">
          {channel && perspective === "company" && <span>{channel.name}</span>}
          <span>{chatTime(m.created_at)}</span>
          {fromCompany && <StatusIcon status={m.status} />}
        </div>
        {m.status === "failed" && m.error && <div className="mt-1 text-[11px] font-medium text-coral">{m.error}</div>}
        {isDraft && (onApprove || onDiscard) && !editing && (
          <div className="mt-2 flex flex-wrap gap-1">
            {onApprove && <Button size="xs" onClick={() => onApprove(m)}>Aprovar e enviar</Button>}
            {onEdit && <Button size="xs" variant="secondary" onClick={() => { setDraft(m.body); setEditing(true); }}>Editar</Button>}
            {onDiscard && <Button size="xs" variant="ghost" onClick={() => onDiscard(m)}>Descartar</Button>}
          </div>
        )}
      </div>
    </div>
  );
}

export function TypingBubble({ right = false, label = "digitando" }: { right?: boolean; label?: string }) {
  return (
    <div className={cx("flex", right ? "justify-end" : "justify-start")}>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-wa-in px-3 py-2">
        <span className="flex gap-1">
          <span className="typing-dot size-1.5 rounded-full bg-ink-3" />
          <span className="typing-dot size-1.5 rounded-full bg-ink-3" />
          <span className="typing-dot size-1.5 rounded-full bg-ink-3" />
        </span>
        <span className="text-[11px] text-ink-3">{label}</span>
      </div>
    </div>
  );
}

export function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-2 flex justify-center">
      <span className="rounded-md border border-line bg-surface px-2.5 py-0.5 text-[11px] text-ink-2">{label}</span>
    </div>
  );
}
