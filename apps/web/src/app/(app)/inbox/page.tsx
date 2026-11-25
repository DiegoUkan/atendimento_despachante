"use client";

import { Inbox, MessagesSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MODE_INFO, formatPhone, type Mode, type Row } from "@despachante/shared";
import { ContactPanel } from "@/components/contact-panel";
import { RunsPanel } from "@/components/raio-x";
import { HumanComposer, Thread } from "@/components/thread";
import { Avatar, Badge, Button, EmptyState, Input, Select, Spinner, Switch, Tabs, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { chatTime } from "@/lib/format";
import { useRealtime, useThrottledCallback, useUrlParam } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

type Conv = Row<"conversations"> & { contact: Row<"contacts"> };
type Filter = "todas" | "humano" | "rascunhos" | "abertas" | "encerradas";

export default function InboxPage() {
  const { channels, settings, userId } = useApp();
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [filter, setFilter] = useState<Filter>("todas");
  const [search, setSearch] = useState("");
  const [showTests, setShowTests] = useState(false);
  const [selectedId, setSelectedId] = useUrlParam("c");
  const [panel, setPanel] = useState<"cliente" | "raiox">("cliente");
  const [focusRun, setFocusRun] = useState<string | null>(null);

  const load = useCallback(async () => {
    let q = supabase().from("conversations").select("*, contact:contacts(*)").is("scenario_id", null).order("last_message_at", { ascending: false, nullsFirst: false }).limit(200);
    if (!showTests) q = q.eq("is_test", false);
    const { data } = await q;
    setConvs((data ?? []) as unknown as Conv[]);
  }, [showTests]);
  useEffect(() => {
    void load();
  }, [load]);
  const reload = useThrottledCallback(() => void load(), 500);
  useRealtime("conversations", reload);

  const counts = useMemo(() => {
    const list = convs ?? [];
    return {
      humano: list.filter((c) => c.status === "waiting_human").length,
      rascunhos: list.filter((c) => c.pending_drafts > 0).length,
    };
  }, [convs]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (convs ?? []).filter((c) => {
      if (filter === "humano" && c.status !== "waiting_human") return false;
      if (filter === "rascunhos" && c.pending_drafts === 0) return false;
      if (filter === "abertas" && c.status === "closed") return false;
      if (filter === "encerradas" && c.status !== "closed") return false;
      if (!s) return true;
      return [c.contact.name, c.contact.wa_name, c.contact.phone, c.last_message_preview].some((v) => v?.toLowerCase().includes(s));
    });
  }, [convs, filter, search]);

  const selected = convs?.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (selected && selected.unread_count > 0) void supabase().from("conversations").update({ unread_count: 0 }).eq("id", selected.id);
  }, [selected]);

  const channelMap = new Map(channels.map((c) => [c.id, c]));

  async function update(patch: Partial<Row<"conversations">>, msg?: string) {
    if (!selected) return;
    const { error } = await supabase().from("conversations").update(patch).eq("id", selected.id);
    if (error) toast.error(error.message);
    else if (msg) toast.success(msg);
    void load();
  }

  async function askAi() {
    if (!selected) return;
    const { error } = await supabase().rpc("enqueue_job", {
      p_type: "process_conversation",
      p_payload: { conversation_id: selected.id, force: true, suggest: true },
      p_dedupe_key: `conv:${selected.id}`,
      p_delay_seconds: 0,
    });
    if (error) toast.error(error.message);
    else toast.success(`${settings.assistant_name} vai sugerir uma resposta`);
  }

  return (
    <div className="flex h-screen">
      {/* lista */}
      <section className="flex w-[340px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="space-y-3 border-b border-line p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-black">Conversas</h1>
            <Switch checked={showTests} onChange={setShowTests} label={<span className="text-xs">testes</span>} />
          </div>
          <Input placeholder="Buscar nome, telefone, mensagem…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["todas", "Todas", 0],
                ["humano", "Humano", counts.humano],
                ["rascunhos", "Rascunhos", counts.rascunhos],
                ["abertas", "Abertas", 0],
                ["encerradas", "Encerradas", 0],
              ] as [Filter, string, number][]
            ).map(([v, l, n]) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={cx("rounded-md border px-2 py-0.5 text-xs transition", filter === v ? "border-line bg-surface-2 font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink")}
              >
                {l}{n > 0 && <span className="ml-1 text-ink-3">· {n}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!convs ? (
            <div className="grid place-items-center py-10"><Spinner /></div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Inbox} title="Nada por aqui" description={convs.length ? "Nenhuma conversa neste filtro." : "Quando os clientes mandarem mensagem (ou você testar no Simulador), as conversas aparecem aqui."} />
          ) : (
            filtered.map((c) => {
              const ch = c.last_channel_id ? channelMap.get(c.last_channel_id) : null;
              const name = c.contact.name || c.contact.wa_name || formatPhone(c.contact.phone);
              return (
                <button
                  key={c.id}
                  onClick={() => { setSelectedId(c.id); setFocusRun(null); }}
                  className={cx("flex w-full gap-3 border-b border-line/70 px-4 py-3 text-left transition", c.id === selectedId ? "bg-brand-soft" : "hover:bg-surface-2")}
                >
                  <Avatar name={name} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-extrabold">{name}</span>
                      {c.is_test && <Badge tone="violet">teste</Badge>}
                      <span className="ml-auto shrink-0 text-[11px] text-ink-3">{chatTime(c.last_message_at)}</span>
                    </div>
                    <div className="truncate text-sm text-ink-2">{c.last_message_preview ?? "—"}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {ch && <span className="rounded-md bg-surface-2 px-1.5 text-[10px] font-bold text-ink-2">{ch.name}</span>}
                      {c.status === "waiting_human" && <Badge tone="sun">humano</Badge>}
                      {c.pending_drafts > 0 && <Badge tone="violet">{c.pending_drafts}</Badge>}
                      {c.mode && <span className="text-[10.5px] text-ink-3" title="Modo definido nesta conversa">{MODE_INFO[c.mode as Mode].label}</span>}
                      {c.unread_count > 0 && <span className="ml-auto rounded-full bg-mint px-1.5 text-[11px] font-black text-white">{c.unread_count}</span>}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* conversa */}
      <section className="flex min-w-0 flex-1 flex-col">
        {!selected ? (
          <div className="grid flex-1 place-items-center">
            <EmptyState icon={MessagesSquare} title="Escolha uma conversa" description="Todas as conversas de todos os números aparecem unificadas por cliente." />
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-5 py-3">
              <Avatar name={selected.contact.name || selected.contact.wa_name || selected.contact.phone} size={40} />
              <div className="min-w-0">
                <div className="truncate font-extrabold">{selected.contact.name || selected.contact.wa_name || "Sem nome"}</div>
                <div className="text-xs text-ink-2">{formatPhone(selected.contact.phone)}</div>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Select
                  value={selected.mode ?? ""}
                  onChange={(e) => update({ mode: (e.target.value || null) as Mode | null }, "Modo atualizado")}
                  className="h-9 w-56"
                  title="Modo da IA nesta conversa"
                >
                  <option value="">Herdar ({MODE_INFO[settings.default_mode as Mode].label} por padrão)</option>
                  {(Object.keys(MODE_INFO) as Mode[]).map((m) => <option key={m} value={m}>{MODE_INFO[m].label} — {MODE_INFO[m].description}</option>)}
                </Select>
                <Button size="sm" variant="secondary" onClick={askAi} title="Gera um rascunho de resposta agora">Sugerir resposta</Button>
                {selected.status !== "closed" ? (
                  <Button size="sm" variant="ghost" onClick={() => update({ status: "closed" }, "Conversa encerrada")}>Encerrar</Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => update({ status: "open" }, "Conversa reaberta")}>Reabrir</Button>
                )}
              </div>
            </header>

            {selected.status === "waiting_human" && (
              <div className="flex flex-wrap items-center gap-3 border-b border-sun/40 bg-sun-soft px-5 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-extrabold">Aguardando atendimento humano{selected.handoff_reason ? `: ${selected.handoff_reason}` : ""}</div>
                  {selected.handoff_summary && <div className="text-ink-2">{selected.handoff_summary}</div>}
                </div>
                <Button size="sm" variant="primary" onClick={() => update({ status: "open", assigned_to: userId, mode: "manual" }, "Você assumiu a conversa — a IA fica em silêncio")}>
                  Assumir
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await update({ status: "open", mode: null, handoff_reason: null, handoff_summary: null }, "Conversa devolvida para a IA");
                  }}
                >
                  Devolver para IA
                </Button>
              </div>
            )}
            {selected.mode === "manual" && selected.status !== "waiting_human" && (
              <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-5 py-2 text-sm">
                Modo manual: a IA não responde nesta conversa.
                <button className="font-bold text-brand hover:underline" onClick={() => update({ mode: null }, "IA reativada nesta conversa")}>Reativar IA</button>
              </div>
            )}

            <Thread conversation={selected} onShowRun={(id) => { setFocusRun(id); setPanel("raiox"); }} />
            <HumanComposer conversation={selected} />
          </>
        )}
      </section>

      {/* painel lateral */}
      {selected && (
        <aside className="flex w-[420px] shrink-0 flex-col border-l border-line bg-bg">
          <div className="border-b border-line bg-surface p-3">
            <Tabs value={panel} onChange={setPanel} tabs={[{ value: "cliente", label: "Cliente & casos" }, { value: "raiox", label: "Raio-X da IA" }]} className="w-full" />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {panel === "cliente" ? <ContactPanel contactId={selected.contact_id} conversation={selected} /> : <RunsPanel conversationId={selected.id} focusRunId={focusRun} />}
          </div>
        </aside>
      )}
    </div>
  );
}
