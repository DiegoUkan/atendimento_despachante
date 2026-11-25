"use client";

import { SquareKanban } from "lucide-react";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WAITING_ON_LABELS, type CaseFields, type Row } from "@despachante/shared";
import { CASE_SELECT, CaseDetail, checklistProgress, moveCaseStage, type CaseRow } from "@/components/case-detail";
import { NewCaseModal } from "@/components/contact-panel";
import { Plate } from "@/components/plate";
import { Badge, Button, Dot, Drawer, Input, PageHeader, ProgressBar, Spinner, Switch, cx } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { useRealtime, useThrottledCallback, useUrlParam } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

type Approval = Row<"approvals"> & { case: { code: string; service_id: string } | null };

export default function CasesPage() {
  const [services, setServices] = useState<Row<"services">[]>([]);
  const [serviceParam, setServiceParam] = useUrlParam("s");
  const [caseParam, setCaseParam] = useUrlParam("id");
  const [stages, setStages] = useState<Row<"service_stages">[]>([]);
  const [fields, setFields] = useState<Row<"service_fields">[]>([]);
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [docs, setDocs] = useState<Row<"case_documents">[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [search, setSearch] = useState("");
  const [showTests, setShowTests] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [newCase, setNewCase] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    void supabase().from("services").select("*").eq("active", true).order("sort_order").then(({ data }) => setServices(data ?? []));
  }, []);
  const serviceId = serviceParam ?? services[0]?.id ?? null;

  const load = useCallback(async () => {
    if (!serviceId) return;
    const sb = supabase();
    let q = sb.from("cases").select(CASE_SELECT).eq("service_id", serviceId).order("stage_changed_at", { ascending: false }).limit(500);
    if (!showTests) q = q.eq("is_test", false);
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    if (!showClosed) q = q.or(`closed_at.is.null,closed_at.gte.${since}`);
    const [st, fl, cs, all, ap] = await Promise.all([
      sb.from("service_stages").select("*").eq("service_id", serviceId).order("sort_order"),
      sb.from("service_fields").select("*").eq("service_id", serviceId),
      q,
      sb.from("cases").select("service_id").is("closed_at", null).eq("is_test", showTests ? true : false),
      sb.from("approvals").select("*, case:cases(code, service_id)").eq("status", "pendente").order("created_at"),
    ]);
    const list = (cs.data ?? []) as unknown as CaseRow[];
    setStages(st.data ?? []);
    setFields(fl.data ?? []);
    setCases(list);
    const c: Record<string, number> = {};
    for (const x of all.data ?? []) c[x.service_id] = (c[x.service_id] ?? 0) + 1;
    setCounts(c);
    setApprovals((ap.data ?? []) as unknown as Approval[]);
    if (list.length) {
      const { data: d } = await sb.from("case_documents").select("*").in("case_id", list.map((x) => x.id));
      setDocs(d ?? []);
    } else setDocs([]);
  }, [serviceId, showTests, showClosed]);

  useEffect(() => {
    setCases(null);
    void load();
  }, [load]);
  const reload = useThrottledCallback(() => void load(), 600);
  useRealtime("cases", reload);
  useRealtime("approvals", reload);
  useRealtime("case_documents", reload);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return cases ?? [];
    return (cases ?? []).filter((c) =>
      [c.code, c.client?.name, c.vehicle?.plate, c.title, c.contact?.phone].some((v) => v?.toLowerCase().includes(s.replace(/[^a-z0-9à-ú ]/gi, ""))),
    );
  }, [cases, search]);

  async function onDragEnd(e: DragEndEvent) {
    const caseId = String(e.active.id);
    const stageId = e.over ? String(e.over.id) : null;
    const c = cases?.find((x) => x.id === caseId);
    const stage = stages.find((s) => s.id === stageId);
    if (!c || !stage || c.stage_id === stage.id) return;
    if (stage.notify_mode === "auto" && !confirm(`Mover para “${stage.name}”? O cliente receberá o aviso automático da fase.`)) return;
    setCases((prev) => prev?.map((x) => (x.id === caseId ? { ...x, stage_id: stage.id, stage } : x)) ?? prev);
    await moveCaseStage(caseId, stage);
  }

  const visibleStages = stages.filter((s) => showClosed || !s.is_canceled);
  const pendingByCase = new Set(approvals.map((a) => a.case_id));

  return (
    <div className="flex h-screen flex-col p-6">
      <PageHeader
        icon={SquareKanban}
        title="Casos"
        subtitle="Arraste os cartões entre as fases. A fase define o que a IA pode fazer e quando o cliente é avisado."
        actions={
          <>
            <Input placeholder="Buscar código, cliente, placa…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
            <Switch checked={showClosed} onChange={setShowClosed} label={<span className="text-xs">Encerrados</span>} />
            <Switch checked={showTests} onChange={setShowTests} label={<span className="text-xs">Testes</span>} />
            <Button onClick={() => setNewCase(true)}>+ Novo caso</Button>
          </>
        }
      />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {services.map((s) => (
          <button
            key={s.id}
            onClick={() => setServiceParam(s.id)}
            className={cx(
              "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] transition",
              s.id === serviceId ? "border-line-strong bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.05)]" : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            <Dot color={s.color} /> {s.name}
            {counts[s.id] ? <span className="text-xs text-ink-3">{counts[s.id]}</span> : null}
          </button>
        ))}
      </div>

      {approvals.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border-2 border-violet/25 bg-violet-soft px-4 py-3">
          <span className="text-sm font-extrabold">A IA pediu {approvals.length} mudança(s) de fase:</span>
          {approvals.map((a) => (
            <button key={a.id} onClick={() => { if (a.case?.service_id) setServiceParam(a.case.service_id); setCaseParam(a.case_id); }} className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold shadow-sm hover:text-violet">
              {a.case?.code} → {(a.payload as { to: string }).to}
            </button>
          ))}
        </div>
      )}

      {!cases ? (
        <div className="grid flex-1 place-items-center"><Spinner /></div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
            {visibleStages.map((stage) => {
              const list = filtered.filter((c) => c.stage_id === stage.id);
              return (
                <Column key={stage.id} stage={stage} count={list.length}>
                  {list.map((c) => (
                    <CaseCard
                      key={c.id}
                      c={c}
                      progress={checklistProgress(c, fields, docs.filter((d) => d.case_id === c.id)).pct}
                      pending={pendingByCase.has(c.id)}
                      onOpen={() => setCaseParam(c.id)}
                    />
                  ))}
                </Column>
              );
            })}
          </div>
        </DndContext>
      )}

      <Drawer open={!!caseParam} onClose={() => setCaseParam(null)} title="Detalhes do caso" width="max-w-3xl">
        {caseParam && <CaseDetail caseId={caseParam} />}
      </Drawer>
      <NewCaseModal open={newCase} onClose={() => setNewCase(false)} onCreated={(id) => setCaseParam(id)} />
    </div>
  );
}

function Column({ stage, count, children }: { stage: Row<"service_stages">; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div ref={setNodeRef} className={cx("flex w-72 shrink-0 flex-col rounded-2xl border bg-surface-2/70 transition", isOver ? "border-brand bg-brand-soft" : "border-line")}>
      <div className="rounded-t-2xl px-3 py-2.5" style={{ borderTop: `4px solid ${stage.color}` }}>
        <div className="flex items-center gap-2">
          <Dot color={stage.color} />
          <span className="flex-1 truncate text-sm font-extrabold">{stage.name}</span>
          <span className="rounded-full bg-surface px-2 text-xs font-black text-ink-2">{count}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {stage.waiting_on && <span className="text-[10px] font-bold text-ink-3">{WAITING_ON_LABELS[stage.waiting_on]?.label}</span>}
          {stage.ai_can_advance && <span className="text-[10px] font-bold text-violet" title="A IA pode avançar daqui">avança</span>}
          {stage.notify_mode !== "none" && <span className="text-[10px] font-bold text-mint" title="Cliente é avisado ao entrar">{stage.notify_mode === "auto" ? "avisa" : "aviso c/ aprovação"}</span>}
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">{children}</div>
    </div>
  );
}

function CaseCard({ c, progress, pending, onOpen }: { c: CaseRow; progress: number; pending: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const fields = (c.fields ?? {}) as CaseFields;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      className={cx(
        "cursor-grab rounded-xl border bg-surface p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing",
        isDragging ? "z-50 rotate-2 border-brand shadow-[var(--shadow-pop)]" : "border-line",
        pending && "ring-2 ring-violet/40",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-xs font-black text-ink-2">{c.code}</span>
        {c.is_test && <Badge tone="violet">teste</Badge>}
        {pending && <Badge tone="violet">IA pediu</Badge>}
        {c.last_change_actor === "ai" && !pending && <Badge tone="violet">IA moveu</Badge>}
        <span className="ml-auto text-[10px] text-ink-3" title="Tempo nesta fase">{timeAgo(c.stage_changed_at)}</span>
      </div>
      <div className="truncate text-sm font-extrabold">{c.client?.name ?? c.contact?.name ?? c.contact?.wa_name ?? "Sem cliente"}</div>
      {c.title && <div className="line-clamp-2 text-xs text-ink-2">{c.title}</div>}
      <div className="mt-2 flex items-center gap-2">
        <Plate plate={c.vehicle?.plate ?? fields.placa?.value} size="xs" />
        {c.quote_status !== "none" && <Badge tone={c.quote_status === "pago" ? "mint" : "sun"}>{c.quote_status}</Badge>}
      </div>
      <div className="mt-2"><ProgressBar value={progress} tone={progress === 100 ? "mint" : "brand"} /></div>
    </div>
  );
}
