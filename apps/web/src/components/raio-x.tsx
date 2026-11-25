"use client";

import {
  ArrowRight, BookOpen, CreditCard, FolderPlus, IdCard, MousePointerClick, NotebookPen, Paperclip, PencilLine, Receipt,
  ScanSearch, Search, UserRound, Wrench, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MODE_INFO, type Mode, type Row } from "@despachante/shared";
import { fullDate, timeAgo } from "@/lib/format";
import { useRealtime } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";
import { Badge, Button, Confidence, EmptyState, Modal, Spinner, Textarea, cx } from "./ui";

type Run = Row<"ai_runs">;
type ToolTrace = { name: string; args: unknown; result: unknown; ok: boolean; at: string };
type KnowledgeRef = { title: string; kind: string; how: string; ref: { table: string; id: string } | null; excerpt?: string };

export const TOOL_INFO: Record<string, { icon: LucideIcon; label: string }> = {
  consultar_servico: { icon: BookOpen, label: "Consultou um serviço" },
  buscar_conhecimento: { icon: Search, label: "Buscou na base de conhecimento" },
  identificar_cliente: { icon: IdCard, label: "Identificou o cliente" },
  abrir_caso: { icon: FolderPlus, label: "Abriu um caso" },
  selecionar_caso: { icon: MousePointerClick, label: "Selecionou um caso" },
  registrar_dados: { icon: PencilLine, label: "Registrou dados" },
  registrar_documento: { icon: Paperclip, label: "Registrou documento" },
  mudar_fase: { icon: ArrowRight, label: "Mudou / pediu mudança de fase" },
  registrar_orcamento: { icon: Receipt, label: "Registrou orçamento" },
  enviar_dados_pagamento: { icon: CreditCard, label: "Enviou dados de pagamento" },
  atualizar_notas: { icon: NotebookPen, label: "Atualizou as notas da IA" },
  transferir_para_humano: { icon: UserRound, label: "Transferiu para humano" },
};

const KIND_LABEL: Record<string, string> = {
  regra: "Regra", info: "Informação", faq: "FAQ", licao: "Lição", instrucoes: "Instruções", precos: "Preços", empresa: "Empresa",
};

function refHref(ref: KnowledgeRef["ref"]): string | null {
  if (!ref) return null;
  if (ref.table === "knowledge_docs") return `/conhecimento?doc=${ref.id}`;
  if (ref.table === "services") return `/servicos?s=${ref.id}`;
  if (ref.table === "service_stages") return `/servicos?stage=${ref.id}`;
  if (ref.table === "settings") return `/configuracoes`;
  return null;
}

function summarizeArgs(name: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  if (name === "registrar_dados" && a.campos) return Object.entries(a.campos as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join(" · ");
  if (name === "consultar_servico") return String(a.servico ?? "");
  if (name === "buscar_conhecimento") return `“${a.pergunta ?? ""}”`;
  if (name === "mudar_fase") return `→ ${a.fase} (${a.motivo ?? ""})`;
  if (name === "abrir_caso") return `${a.servico}${a.resumo ? ` — ${a.resumo}` : ""}`;
  if (name === "registrar_documento") return String(a.documento ?? "");
  if (name === "transferir_para_humano") return String(a.motivo ?? "");
  if (name === "identificar_cliente") return [a.nome, a.cpf_cnpj, a.relacao].filter(Boolean).join(" · ");
  if (name === "registrar_orcamento") return `${a.status}${a.total ? ` · R$ ${a.total}` : ""}`;
  return JSON.stringify(a).slice(0, 120);
}

function CorrectModal({ run, open, onClose }: { run: Run; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!text.trim()) return;
    setSaving(true);
    const sb = supabase();
    const { data: user } = await sb.auth.getUser();
    const { data: session, error } = await sb
      .from("teach_sessions")
      .insert({ title: `Correção: ${text.slice(0, 50)}`, created_by: user.user?.id, context_run_id: run.id })
      .select("id")
      .single();
    if (error || !session) {
      setSaving(false);
      toast.error(error?.message ?? "Erro ao criar a correção");
      return;
    }
    await sb.from("teach_messages").insert({ session_id: session.id, role: "user", content: text, author_id: user.user?.id });
    await sb.from("ai_runs").update({ rating: "ruim", feedback: text, teach_session_id: session.id }).eq("id", run.id);
    setSaving(false);
    onClose();
    toast.success("Correção enviada ao Instrutor");
    router.push(`/ensinar?s=${session.id}`);
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="O que estava errado?"
      subtitle="Explique como a IA deveria ter agido. O Instrutor vai propor a correção na base de conhecimento para não acontecer de novo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} loading={saving} disabled={!text.trim()}>Enviar para o Instrutor</Button>
        </>
      }
    >
      <Textarea
        autoFocus
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ex.: Ela deveria ter pedido o CRV frente e verso antes de falar do orçamento. E não pode dizer que a vistoria é no mesmo dia."
      />
    </Modal>
  );
}

export function RunCard({ run, defaultOpen = false, highlight = false }: { run: Run; defaultOpen?: boolean; highlight?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [showPrompt, setShowPrompt] = useState(false);
  const [correct, setCorrect] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tools = (run.tools ?? []) as ToolTrace[];
  const knowledge = (run.knowledge ?? []) as KnowledgeRef[];
  const output = (run.output ?? {}) as { mensagens?: string[]; status?: string };
  const context = (run.context ?? {}) as { system_prompt?: string; sections?: Record<string, string> };
  const mode = MODE_INFO[(run.mode ?? "copilot") as Mode];

  useEffect(() => {
    if (highlight) {
      setOpen(true);
      ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [highlight]);

  const statusBadge =
    run.status === "running" ? <Badge tone="brand"><Spinner className="size-3" /> pensando…</Badge>
    : run.status === "error" ? <Badge tone="coral">erro</Badge>
    : run.status === "superseded" ? <Badge tone="neutral" title="Chegou mensagem nova antes de enviar; a próxima execução respondeu tudo junto">descartada</Badge>
    : <Badge tone="mint">concluída</Badge>;

  async function rateGood() {
    await supabase().from("ai_runs").update({ rating: "bom" }).eq("id", run.id);
    toast.success("Valeu!");
  }

  return (
    <div ref={ref} className={cx("rounded-2xl border bg-surface transition", highlight ? "border-violet ring-2 ring-violet/15" : "border-line")}>
      <button className="flex w-full items-start gap-3 px-4 py-3 text-left" onClick={() => setOpen((o) => !o)}>
        <ScanSearch className="mt-0.5 size-4 shrink-0 text-violet" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {statusBadge}
            {run.status !== "running" && <Confidence value={run.confidence} />}
            {mode && <Badge tone="neutral" title={`Modo vindo de: ${run.mode_source}`}>{mode.label}</Badge>}
            {run.handoff && <Badge tone="sun">transferiu</Badge>}
            {run.held_for_review && <Badge tone="coral" title="Confiança abaixo do mínimo: a resposta virou rascunho">segurou p/ revisão</Badge>}
            {run.rating === "bom" && <Badge tone="mint">aprovada</Badge>}
            {run.rating === "ruim" && <Badge tone="coral">corrigida</Badge>}
          </div>
          <div className="mt-1 line-clamp-2 text-sm text-ink-2">
            {run.status === "error" ? run.error : run.rationale ?? (run.status === "running" ? "Lendo a conversa e decidindo…" : "")}
          </div>
          <div className="mt-1 text-[11px] text-ink-3" title={fullDate(run.created_at)}>
            {timeAgo(run.created_at)} atrás{run.latency_ms ? ` · ${(run.latency_ms / 1000).toFixed(1)}s` : ""}{run.model ? ` · ${run.model}` : ""}
            {run.tokens_in ? ` · ${run.tokens_in + (run.tokens_out ?? 0)} tokens` : ""}
          </div>
        </div>
        <span className="text-ink-3">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          {run.status === "error" && (
            <div className="rounded-xl bg-coral-soft p-3 text-sm text-coral">
              <b>Erro:</b> {run.error}
              {run.error?.includes("Configure") && (
                <div className="mt-2">
                  <Link href="/configuracoes?tab=ia" className="font-bold underline">Abrir configuração de IA →</Link>
                </div>
              )}
            </div>
          )}

          {run.rationale && (
            <div className="rounded-lg border border-line bg-surface-2 p-3">
              <div className="micro mb-1">Por que agi assim</div>
              <div className="whitespace-pre-wrap text-sm">{run.rationale}</div>
              <div className="mt-2 text-[11px] text-ink-2">
                Modo {mode?.label} — definido por: <b>{run.mode_source}</b>
              </div>
              {run.handoff_reason && <div className="mt-1 text-[11px] text-ink-2">Motivo da transferência: <b>{run.handoff_reason}</b></div>}
            </div>
          )}

          {output.mensagens && output.mensagens.length > 0 && (
            <div>
              <div className="micro mb-1.5">Resposta ({output.status === "queued" ? "enviada" : output.status === "draft" ? "rascunho" : output.status})</div>
              <div className="space-y-1">
                {output.mensagens.map((m, i) => (
                  <div key={i} className="rounded-lg bg-wa-out px-3 py-1.5 text-sm whitespace-pre-wrap">{m}</div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="micro mb-1.5">Ações ({tools.length})</div>
            {tools.length === 0 ? (
              <div className="text-sm text-ink-3">Nenhuma ação no sistema — só conversou.</div>
            ) : (
              <ol className="space-y-1.5">
                {tools.map((t, i) => (
                  <ToolRow key={i} t={t} />
                ))}
              </ol>
            )}
          </div>

          <div>
            <div className="micro mb-1.5">Conhecimento usado ({knowledge.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {knowledge.map((k, i) => {
                const href = refHref(k.ref);
                const chip = (
                  <span className={cx("inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs font-bold", href && "hover:border-brand hover:text-brand")} title={k.excerpt}>
                    <span className="text-ink-3">{KIND_LABEL[k.kind] ?? k.kind}:</span> {k.title}
                    <span className="font-semibold text-ink-3">· {k.how}</span>
                  </span>
                );
                return href ? <Link key={i} href={href} title="Abrir para editar">{chip}</Link> : <span key={i}>{chip}</span>;
              })}
            </div>
          </div>

          {context.system_prompt && (
            <div>
              <button className="text-xs font-bold text-brand hover:underline" onClick={() => setShowPrompt((s) => !s)}>
                {showPrompt ? "Esconder o contexto" : "Ver exatamente o que a IA leu (contexto enviado)"}
              </button>
              {showPrompt && (
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-nav p-3 text-[11px] leading-relaxed text-nav-ink">{context.system_prompt}</pre>
              )}
            </div>
          )}

          {run.status !== "running" && run.kind !== "cenario" && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <span className="text-xs font-bold text-ink-2">Essa decisão foi boa?</span>
              <Button size="xs" variant="secondary" onClick={rateGood}>Sim</Button>
              <Button size="xs" variant="secondary" onClick={() => setCorrect(true)}>Corrigir</Button>
              {run.teach_session_id && (
                <Link href={`/ensinar?s=${run.teach_session_id}`} className="text-xs font-bold text-brand hover:underline">Ver correção →</Link>
              )}
            </div>
          )}
        </div>
      )}
      <CorrectModal run={run} open={correct} onClose={() => setCorrect(false)} />
    </div>
  );
}

function ToolRow({ t }: { t: ToolTrace }) {
  const [open, setOpen] = useState(false);
  const info = TOOL_INFO[t.name] ?? { icon: Wrench, label: t.name };
  const Icon = info.icon;
  const resultText = typeof t.result === "string" ? t.result : JSON.stringify(t.result, null, 2);
  return (
    <li className={cx("rounded-lg border px-3 py-2", t.ok ? "border-line" : "border-[#fecaca] bg-coral-soft/50")}>
      <button className="flex w-full items-start gap-2 text-left" onClick={() => setOpen((o) => !o)}>
        <Icon className="mt-0.5 size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">
          <span className="text-[13px] font-medium">{info.label}</span>
          {!t.ok && <span className="ml-1 text-xs font-bold text-coral">(não deu certo)</span>}
          <span className="block truncate text-xs text-ink-2">{summarizeArgs(t.name, t.args)}</span>
        </span>
        <span className="text-xs text-ink-3">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <pre className="max-h-48 overflow-auto rounded-lg bg-surface-2 p-2 text-[11px]">{JSON.stringify(t.args, null, 2)}</pre>
          <pre className="max-h-48 overflow-auto rounded-lg bg-surface-2 p-2 text-[11px] whitespace-pre-wrap">{resultText}</pre>
        </div>
      )}
    </li>
  );
}

/** Lista de execuções (Raio-X) de uma conversa, em tempo real */
export function RunsPanel({ conversationId, focusRunId }: { conversationId: string; focusRunId?: string | null }) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase().from("ai_runs").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(30);
    setRuns(data ?? []);
  }, [conversationId]);
  useEffect(() => {
    setRuns(null);
    void load();
  }, [load]);
  useRealtime(
    "ai_runs",
    (c) => {
      const row = c.new as Run;
      setRuns((prev) => {
        if (!prev) return prev;
        const idx = prev.findIndex((r) => r.id === row.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = row;
          return copy;
        }
        return [row, ...prev];
      });
    },
    `conversation_id=eq.${conversationId}`,
  );

  if (!runs) return <div className="grid place-items-center py-10"><Spinner /></div>;
  if (!runs.length)
    return <EmptyState icon={ScanSearch} title="Nenhuma decisão ainda" description="Quando a IA responder, cada decisão aparece aqui com o porquê, as ações e o conhecimento usado." />;
  return (
    <div className="space-y-2">
      {runs.map((r, i) => (
        <RunCard key={r.id} run={r} defaultOpen={i === 0 && !focusRunId} highlight={r.id === focusRunId} />
      ))}
    </div>
  );
}
