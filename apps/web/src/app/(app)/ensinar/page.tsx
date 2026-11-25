"use client";

import { GraduationCap } from "lucide-react";
import { diffWords } from "diff";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Row } from "@despachante/shared";
import { TypingBubble } from "@/components/chat";
import { Markdown } from "@/components/markdown";
import { RunCard } from "@/components/raio-x";
import { Avatar, Badge, Button, Card, EmptyState, Spinner, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { timeAgo } from "@/lib/format";
import { useRealtime, useThrottledCallback, useUrlParam } from "@/lib/hooks";
import { applyProposal, rejectProposal } from "@/lib/proposals";
import { supabase } from "@/lib/supabase/client";

type Session = Row<"teach_sessions">;
type Msg = Row<"teach_messages">;
type Proposal = Row<"knowledge_proposals">;

const SUGGESTIONS = [
  "Sempre peça o CRV frente e verso quando for transferência",
  "O honorário da transferência agora é R$ 300,00",
  "Nosso endereço é Rua XV de Novembro, 123 - Centro, Campo Largo",
  "Não atendemos processos de veículos de outros estados",
  "Quando o cliente for lojista, seja mais direta e use menos emojis",
  "Na fase de vistoria, avise que precisa levar o veículo limpo",
];

const ACTION_LABEL: Record<string, string> = {
  "doc.create": "Novo conhecimento",
  "doc.update": "Editar conhecimento",
  "service.update": "Instruções do serviço",
  "stage.update": "Fase",
  "document.create": "Novo documento",
  "document.update": "Documento",
  "field.create": "Novo dado",
  "field.update": "Dado",
  "price.update": "Preço",
  "price.create": "Novo preço",
  "settings.update": "Empresa",
};

const FIELD_LABEL: Record<string, string> = {
  title: "Título", content_md: "Conteúdo", instructions_md: "Instruções", ai_can_advance: "IA pode avançar", require_checklist: "Exige checklist",
  notify_mode: "Aviso", notify_template: "Mensagem de aviso", amount: "Valor", label: "Rótulo", kind: "Tipo", notes: "Observação",
  description: "Descrição", required: "Obrigatório", type: "Tipo", ai_hint: "Dica", about_md: "Sobre a empresa", persona_extra_md: "Estilo",
  out_of_hours_md: "Fora do horário", payment_notes: "Pagamento", scope: "Escopo", always_include: "Sempre incluir", needs_review: "Revisar",
};

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function DiffView({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> }) {
  const keys = Object.keys(after).filter((k) => !["service_id", "stage_id", "key", "sort_order"].includes(k));
  return (
    <div className="space-y-2">
      {keys.map((k) => {
        const b = before?.[k];
        const a = after[k];
        const long = typeof a === "string" && (a.length > 60 || (typeof b === "string" && b.length > 60));
        return (
          <div key={k} className="text-sm">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-3">{FIELD_LABEL[k] ?? k}</div>
            {before && b !== undefined && long ? (
              <div className="whitespace-pre-wrap rounded-lg bg-surface-2 p-2 leading-relaxed">
                {diffWords(show(b), show(a)).map((part, i) => (
                  <span key={i} className={part.added ? "diff-add" : part.removed ? "diff-del" : ""}>{part.value}</span>
                ))}
              </div>
            ) : before && b !== undefined ? (
              <div><span className="diff-del px-1">{show(b)}</span> → <span className="diff-add px-1">{show(a)}</span></div>
            ) : (
              <div className="whitespace-pre-wrap rounded-lg bg-mint-soft/60 p-2">{show(a)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProposalCard({ p, fromCorrection }: { p: Proposal; fromCorrection: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Card className={cx("overflow-hidden", p.status === "pendente" ? "border-violet/40 ring-2 ring-violet/10" : "opacity-80")}>
      <div className="flex items-center gap-2 border-b border-line bg-violet-soft/50 px-4 py-2.5">
        <span className="text-xs font-extrabold text-violet">{ACTION_LABEL[p.action] ?? p.action}</span>
        <span className="truncate text-sm font-extrabold">{p.title}</span>
        <span className="ml-auto">
          {p.status === "aplicada" && <Badge tone="mint">✓ aplicada</Badge>}
          {p.status === "recusada" && <Badge>recusada</Badge>}
          {p.status === "erro" && <Badge tone="coral" title={p.error ?? ""}>erro</Badge>}
        </span>
      </div>
      <div className="space-y-3 p-4">
        {p.explanation && <div className="text-sm text-ink-2">{p.explanation}</div>}
        <DiffView before={p.before as Record<string, unknown> | null} after={p.after as Record<string, unknown>} />
        {p.status === "erro" && p.error && <div className="text-xs font-bold text-coral">{p.error}</div>}
        {(p.status === "pendente" || p.status === "erro") && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="success"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const err = await applyProposal(p, fromCorrection);
                setBusy(false);
                if (err) toast.error(err);
                else toast.success("Aprendido! A IA já usa isso na próxima resposta");
              }}
            >
              ✓ Aprovar e aplicar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => rejectProposal(p)}>Recusar</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function TeachPage() {
  const { settings, userId } = useApp();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [sid, setSid] = useUrlParam("s");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [contextRun, setContextRun] = useState<Row<"ai_runs"> | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    const { data } = await supabase().from("teach_sessions").select("*").order("updated_at", { ascending: false }).limit(50);
    setSessions(data ?? []);
  }, []);
  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const loadSession = useCallback(async () => {
    if (!sid) return;
    const sb = supabase();
    const [m, p, s] = await Promise.all([
      sb.from("teach_messages").select("*").eq("session_id", sid).order("created_at"),
      sb.from("knowledge_proposals").select("*").eq("session_id", sid).order("created_at"),
      sb.from("teach_sessions").select("*").eq("id", sid).single(),
    ]);
    setMessages(m.data ?? []);
    setProposals(p.data ?? []);
    if (s.data) setSessions((prev) => prev?.map((x) => (x.id === s.data!.id ? s.data! : x)) ?? prev);
    if (s.data?.context_run_id) {
      const { data: run } = await sb.from("ai_runs").select("*").eq("id", s.data.context_run_id).single();
      setContextRun(run);
    } else setContextRun(null);
  }, [sid]);
  useEffect(() => {
    setMessages([]);
    setProposals([]);
    void loadSession();
  }, [loadSession]);

  const reload = useThrottledCallback(() => void loadSession(), 250);
  const reloadSessions = useThrottledCallback(() => void loadSessions(), 800);
  useRealtime("teach_messages", reload, sid ? `session_id=eq.${sid}` : undefined, !!sid);
  useRealtime("knowledge_proposals", reload, sid ? `session_id=eq.${sid}` : undefined, !!sid);
  useRealtime("teach_sessions", reloadSessions);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, proposals.length]);

  const session = sessions?.find((s) => s.id === sid) ?? null;

  async function send(content: string) {
    if (!content.trim()) return;
    setSending(true);
    const sb = supabase();
    let sessionId = sid;
    if (!sessionId) {
      const { data, error } = await sb.from("teach_sessions").insert({ created_by: userId }).select("id").single();
      if (error || !data) {
        setSending(false);
        return toast.error(error?.message);
      }
      sessionId = data.id;
      setSid(sessionId);
      void loadSessions();
    }
    const { error } = await sb.from("teach_messages").insert({ session_id: sessionId, role: "user", content: content.trim(), author_id: userId });
    setSending(false);
    if (error) return toast.error(error.message);
    setText("");
  }

  // propostas agrupadas pela mensagem do usuário que as originou
  const byMessage = new Map<string, Proposal[]>();
  const orphan: Proposal[] = [];
  for (const p of proposals) {
    if (p.teach_message_id) byMessage.set(p.teach_message_id, [...(byMessage.get(p.teach_message_id) ?? []), p]);
    else orphan.push(p);
  }
  // exibe as propostas depois da resposta do instrutor que vem após a mensagem do usuário
  const rendered: React.ReactNode[] = [];
  let pendingFor: Proposal[] = [];
  messages.forEach((m) => {
    if (m.role === "user") {
      rendered.push(
        <div key={m.id} className="flex justify-end">
          <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-brand px-4 py-2.5 text-sm text-white shadow-sm whitespace-pre-wrap">{m.content}</div>
        </div>,
      );
      pendingFor = byMessage.get(m.id) ?? [];
    } else {
      rendered.push(
        <div key={m.id} className="flex gap-3">
          <Avatar tone="ai" icon={GraduationCap} size={30} />
          <div className="max-w-[80%] space-y-3">
            <div className="rounded-2xl rounded-tl-sm bg-surface px-4 py-2.5 shadow-sm"><Markdown>{m.content}</Markdown></div>
            {pendingFor.map((p) => <ProposalCard key={p.id} p={p} fromCorrection={!!session?.context_run_id} />)}
          </div>
        </div>,
      );
      pendingFor = [];
    }
  });
  const pendingCount = proposals.filter((p) => p.status === "pendente").length;

  return (
    <div className="flex h-screen">
      <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-surface">
        <div className="border-b border-line p-4">
          <h1 className="text-xl font-black">Ensinar a IA</h1>
          <p className="text-xs text-ink-2">Converse com o Instrutor. Ele propõe mudanças; você aprova.</p>
          <Button className="mt-3 w-full" onClick={() => { setSid(null); setMessages([]); setProposals([]); setContextRun(null); }}>+ Nova conversa</Button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {!sessions ? <div className="grid place-items-center py-6"><Spinner /></div> : sessions.map((s) => (
            <button key={s.id} onClick={() => setSid(s.id)} className={cx("w-full rounded-xl px-3 py-2.5 text-left transition", s.id === sid ? "bg-brand-soft" : "hover:bg-surface-2")}>
              <div className="flex items-center gap-1.5">
                {s.context_run_id && <Badge tone="coral">correção</Badge>}
                <span className="truncate text-sm font-bold">{s.title}</span>
                {s.status === "thinking" && <Spinner className="ml-auto size-3" />}
              </div>
              <div className="text-[11px] text-ink-3">{timeAgo(s.updated_at)} atrás</div>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-bg">
        <div className="flex items-center gap-3 border-b border-line bg-surface px-6 py-3">
          <Avatar tone="ai" icon={GraduationCap} size={34} />
          <div>
            <div className="font-extrabold">Instrutor da {settings.assistant_name}</div>
            <div className="text-xs text-ink-2">Tudo que for aprovado fica no histórico e pode ser desfeito em Conhecimento → Histórico.</div>
          </div>
          {pendingCount > 0 && <Badge tone="violet" className="ml-auto">{pendingCount} proposta(s) aguardando</Badge>}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl space-y-4">
            {contextRun && (
              <div className="rounded-2xl border border-coral/30 bg-coral-soft/40 p-4">
                <div className="mb-2 text-sm font-extrabold">Corrigindo este atendimento</div>
                <RunCard run={contextRun} />
                {contextRun.conversation_id && (
                  <Link href={`/inbox?c=${contextRun.conversation_id}`} className="mt-2 inline-block text-xs font-bold text-brand hover:underline">Abrir a conversa →</Link>
                )}
              </div>
            )}
            {!messages.length && !contextRun ? (
              <EmptyState
                icon={GraduationCap}
                title={`O que a ${settings.assistant_name} precisa aprender?`}
                description="Escreva do seu jeito, como se explicasse para um funcionário novo. O Instrutor transforma em regras, instruções de fase, preços ou documentos — e você aprova cada mudança."
                action={
                  <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => setText(s)} className="rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm font-semibold hover:border-brand hover:text-brand">{s}</button>
                    ))}
                  </div>
                }
              />
            ) : (
              rendered
            )}
            {orphan.length > 0 && <div className="space-y-3">{orphan.map((p) => <ProposalCard key={p.id} p={p} fromCorrection={!!session?.context_run_id} />)}</div>}
            {session?.status === "thinking" && <TypingBubble label="O Instrutor está pensando e consultando a base…" />}
            {session?.status === "error" && <div className="rounded-xl bg-coral-soft p-3 text-sm text-coral">{session.last_error}</div>}
            <div ref={bottom} />
          </div>
        </div>

        <div className="border-t border-line bg-surface p-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(text);
                }
              }}
              rows={2}
              placeholder="Ex.: Quando perguntarem sobre vistoria, diga que fazemos o agendamento e que leva uns 30 minutos…"
              className="max-h-48 min-h-12 flex-1 resize-none rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none focus:border-brand focus:bg-surface"
            />
            <Button size="lg" onClick={() => send(text)} loading={sending} disabled={!text.trim() || session?.status === "thinking"}>Ensinar</Button>
          </div>
        </div>
      </main>
    </div>
  );
}
