"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DOC_STATUS_INFO, NOTIFY_MODE_INFO, WAITING_ON_LABELS, displayFieldValue, validateField,
  type CaseFields, type Row,
} from "@despachante/shared";
import { fullDate, timeAgo } from "@/lib/format";
import { useRealtime, useThrottledCallback } from "@/lib/hooks";
import { signedUrl, uploadMedia } from "@/lib/media";
import { supabase } from "@/lib/supabase/client";
import { Markdown, MarkdownEditor } from "./markdown";
import { Plate } from "./plate";
import { Badge, Button, Dot, Input, ProgressBar, Select, Spinner, Tabs, cx } from "./ui";

export type CaseRow = Row<"cases"> & {
  service: Row<"services">;
  stage: Row<"service_stages">;
  client: Row<"clients"> | null;
  contact: Row<"contacts"> | null;
  vehicle: Row<"vehicles"> | null;
};

type Bundle = {
  c: CaseRow;
  stages: Row<"service_stages">[];
  fields: Row<"service_fields">[];
  docs: Row<"case_documents">[];
  events: Row<"case_events">[];
  approvals: Row<"approvals">[];
};

export const CASE_SELECT = "*, service:services(*), stage:service_stages(*), client:clients(*), contact:contacts(*), vehicle:vehicles(*)";

export function checklistProgress(c: Pick<Row<"cases">, "fields">, fields: Pick<Row<"service_fields">, "key" | "required">[], docs: Pick<Row<"case_documents">, "status" | "required">[]) {
  const f = (c.fields ?? {}) as CaseFields;
  const reqFields = fields.filter((x) => x.required);
  const reqDocs = docs.filter((d) => d.required);
  const total = reqFields.length + reqDocs.length;
  const done = reqFields.filter((x) => f[x.key]?.value).length + reqDocs.filter((d) => d.status === "recebido" || d.status === "validado").length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 100 };
}

const ACTOR_LABEL: Record<string, string> = { ai: "IA", human: "Equipe", system: "Sistema", client: "Cliente" };
const DOC_DOT: Record<string, string> = { pendente: "#d1d5db", recebido: "#1d4ed8", validado: "#15803d", recusado: "#b91c1c" };

export async function moveCaseStage(caseId: string, stage: Row<"service_stages">) {
  const { error } = await supabase().from("cases").update({ stage_id: stage.id, last_change_actor: "human" }).eq("id", caseId);
  if (error) {
    toast.error(error.message);
    return false;
  }
  toast.success(
    `Fase: $${stage.name}` + (stage.notify_mode === "auto" ? " · cliente será avisado" : stage.notify_mode === "approval" ? " · aviso aguardando aprovação" : ""),
  );
  return true;
}

export function CaseDetail({ caseId, compact = false }: { caseId: string; compact?: boolean }) {
  const [b, setB] = useState<Bundle | null>(null);
  const [tab, setTab] = useState<"checklist" | "notas" | "historico">("checklist");

  const load = useCallback(async () => {
    const sb = supabase();
    const { data: c } = await sb.from("cases").select(CASE_SELECT).eq("id", caseId).single();
    if (!c) return;
    const cr = c as unknown as CaseRow;
    const [stages, fields, docs, events, approvals] = await Promise.all([
      sb.from("service_stages").select("*").eq("service_id", cr.service_id).order("sort_order"),
      sb.from("service_fields").select("*").eq("service_id", cr.service_id).order("sort_order"),
      sb.from("case_documents").select("*").eq("case_id", caseId).order("created_at"),
      sb.from("case_events").select("*").eq("case_id", caseId).order("created_at", { ascending: false }).limit(50),
      sb.from("approvals").select("*").eq("case_id", caseId).eq("status", "pendente").order("created_at"),
    ]);
    setB({ c: cr, stages: stages.data ?? [], fields: fields.data ?? [], docs: docs.data ?? [], events: events.data ?? [], approvals: approvals.data ?? [] });
  }, [caseId]);

  useEffect(() => {
    setB(null);
    void load();
  }, [load]);
  const reload = useThrottledCallback(() => void load(), 300);
  useRealtime("cases", reload, `id=eq.${caseId}`);
  useRealtime("case_documents", reload, `case_id=eq.${caseId}`);
  useRealtime("case_events", reload, `case_id=eq.${caseId}`);
  useRealtime("approvals", reload, `case_id=eq.${caseId}`);

  if (!b) return <div className="grid place-items-center py-10"><Spinner /></div>;
  const { c, stages, fields, docs, events, approvals } = b;
  const progress = checklistProgress(c, fields, docs);
  const visibleStages = stages.filter((s) => !s.is_canceled);
  const current = stages.find((s) => s.id === c.stage_id);

  async function decideApproval(a: Row<"approvals">, approve: boolean) {
    const sb = supabase();
    const { data: user } = await sb.auth.getUser();
    if (approve) {
      const to = stages.find((s) => s.id === (a.payload as { to_stage_id: string }).to_stage_id);
      if (to) await moveCaseStage(c.id, to);
    }
    await sb.from("approvals").update({ status: approve ? "aprovado" : "recusado", decided_by: user.user?.id, decided_at: new Date().toISOString() }).eq("id", a.id);
  }

  return (
    <div className="space-y-4">
      {/* cabeçalho */}
      <div className="flex flex-wrap items-center gap-2">
        <Dot color={c.service.color} />
        <span className="font-semibold">{c.code}</span>
        <span className="text-sm text-ink-2">{c.service.name}</span>
        <Plate plate={c.vehicle?.plate} size="xs" />
        {current?.waiting_on && <Badge tone="sun">{WAITING_ON_LABELS[current.waiting_on]?.label}</Badge>}
        {c.is_test && <Badge tone="violet">teste</Badge>}
        {c.conversation_id && !compact && (
          <Link href={`/inbox?c=${c.conversation_id}`} className="ml-auto text-xs font-bold text-brand hover:underline">Abrir conversa</Link>
        )}
      </div>
      {c.title && <div className="text-sm text-ink-2">{c.title}</div>}
      {c.client && (
        <div className="text-sm">
          <Link href={`/clientes?id=${c.client.id}`} className="font-bold hover:underline">{c.client.name}</Link>
        </div>
      )}

      {/* fases */}
      {compact ? (
        <Select value={c.stage_id} onChange={(e) => { const s = stages.find((x) => x.id === e.target.value); if (s) void moveCaseStage(c.id, s); }}>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {visibleStages.map((s, i) => {
            const passed = current && s.sort_order < current.sort_order;
            const isCurrent = s.id === c.stage_id;
            return (
              <button
                key={s.id}
                onClick={() => !isCurrent && void moveCaseStage(c.id, s)}
                title={`${NOTIFY_MODE_INFO[s.notify_mode]?.label ?? ""}${s.ai_can_advance ? " · IA pode avançar daqui" : ""}`}
                className={cx(
                  "flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition",
                  isCurrent ? "border-brand bg-brand text-white" : passed ? "border-[#bbf7d0] bg-mint-soft text-mint" : "border-line bg-surface text-ink-2 hover:border-brand hover:text-brand",
                )}
                
              >
                {passed ? "✓" : `${i + 1}.`} {s.name}
              </button>
            );
          })}
          {stages.filter((s) => s.is_canceled).map((s) => (
            <button key={s.id} onClick={() => s.id !== c.stage_id && confirm("Cancelar este caso?") && void moveCaseStage(c.id, s)} className={cx("rounded-md border px-2 py-0.5 text-xs font-medium", s.id === c.stage_id ? "border-coral bg-coral text-white" : "border-line text-ink-3 hover:text-coral")}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {approvals.map((a) => (
        <div key={a.id} className="rounded-lg border border-[#ddd6fe] bg-violet-soft p-3 text-[13px]">
          <div className="font-bold">A IA pediu para mover para “{(a.payload as { to: string }).to}”</div>
          {a.reason && <div className="mt-0.5 text-ink-2">{a.reason}</div>}
          <div className="mt-2 flex gap-2">
            <Button size="xs" variant="success" onClick={() => decideApproval(a, true)}>Aprovar</Button>
            <Button size="xs" variant="secondary" onClick={() => decideApproval(a, false)}>Recusar</Button>
          </div>
        </div>
      ))}

      <div>
        <div className="mb-1 flex justify-between text-xs font-bold text-ink-2">
          <span>Checklist obrigatório</span>
          <span>{progress.done}/{progress.total}</span>
        </div>
        <ProgressBar value={progress.pct} tone={progress.pct === 100 ? "mint" : "brand"} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "checklist", label: "Checklist" },
          { value: "notas", label: "Notas" },
          { value: "historico", label: "Histórico", count: events.length },
        ]}
      />

      {tab === "checklist" && <Checklist c={c} fields={fields} docs={docs} />}
      {tab === "notas" && <Notes c={c} />}
      {tab === "historico" && (
        <ol className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="flex gap-2 text-sm">
              <span className="mt-px w-14 shrink-0 text-[11px] font-medium text-ink-3">{ACTOR_LABEL[e.actor] ?? e.actor}</span>
              <div className="min-w-0 flex-1">
                <div>{e.description}</div>
                <div className="text-[11px] text-ink-3" title={fullDate(e.created_at)}>{timeAgo(e.created_at)} atrás</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Checklist({ c, fields, docs }: { c: CaseRow; fields: Row<"service_fields">[]; docs: Row<"case_documents">[] }) {
  const values = (c.fields ?? {}) as CaseFields;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function saveField(f: Row<"service_fields">, raw: string) {
    const v = validateField(f.type, raw, (f.options as string[]) ?? []);
    if (!v.ok) {
      toast.error(v.error);
      return;
    }
    const next = { ...values, [f.key]: { value: v.value, status: "validado", source: "human", updated_at: new Date().toISOString() } };
    const patch: Partial<Row<"cases">> = { fields: next as never };
    const { error } = await supabase().from("cases").update(patch).eq("id", c.id);
    if (error) return toast.error(error.message);
    if (f.type === "plate" && c.vehicle_id) await supabase().from("vehicles").update({ plate: v.value }).eq("id", c.vehicle_id);
    await supabase().from("case_events").insert({ case_id: c.id, type: "dados", actor: "human", description: `Equipe validou: ${f.label}` });
    setEditing(null);
  }

  async function validateAi(f: Row<"service_fields">) {
    const cur = values[f.key];
    if (!cur) return;
    await supabase().from("cases").update({ fields: { ...values, [f.key]: { ...cur, status: "validado" } } as never }).eq("id", c.id);
  }

  async function setDocStatus(d: Row<"case_documents">, status: string, notes?: string) {
    const { data: user } = await supabase().auth.getUser();
    await supabase().from("case_documents").update({ status, notes: notes ?? d.notes, updated_by: user.user?.id }).eq("id", d.id);
    await supabase().from("case_events").insert({ case_id: c.id, type: "documento", actor: "human", description: `$${d.label}: ${DOC_STATUS_INFO[status]?.label}${notes ? ` (${notes})` : ""}` });
  }

  async function uploadDoc(d: Row<"case_documents">, file: File) {
    try {
      const up = await uploadMedia(`cases/${c.id}`, file, file.name);
      await supabase().from("case_documents").update({ media_path: up.path, status: "recebido" }).eq("id", d.id);
      toast.success("Arquivo anexado");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="micro mb-2">Dados</div>
        <div className="divide-y divide-line rounded-xl border border-line bg-surface">
          {fields.map((f) => {
            const v = values[f.key];
            return (
              <div key={f.key} className="flex items-center gap-2 px-3 py-2">
                <span className="flex w-4 justify-center" title={v?.value ? (v.status === "validado" ? "Validado pela equipe" : "Preenchido pela IA") : f.required ? "Falta (obrigatório)" : "Opcional"}>
                  <Dot color={v?.value ? (v.status === "validado" ? "#15803d" : "#1d4ed8") : f.required ? "#f59e0b" : "#d1d5db"} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-ink-2">{f.label}{!f.required && " (opcional)"}</div>
                  {editing === f.key ? (
                    <form className="mt-1 flex gap-1" onSubmit={(e) => { e.preventDefault(); void saveField(f, draft); }}>
                      {f.type === "select" ? (
                        <Select value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8">
                          <option value="">—</option>
                          {((f.options as string[]) ?? []).map((o) => <option key={o}>{o}</option>)}
                        </Select>
                      ) : (
                        <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8" autoFocus />
                      )}
                      <Button size="xs" type="submit">Salvar</Button>
                      <Button size="xs" variant="ghost" type="button" onClick={() => setEditing(null)}>×</Button>
                    </form>
                  ) : (
                    <div className={cx("truncate text-sm", !v?.value && "text-ink-3")}>{v?.value ? displayFieldValue(f.type, v.value) : "não informado"}</div>
                  )}
                </div>
                {editing !== f.key && (
                  <div className="flex shrink-0 gap-1">
                    {v?.value && v.status !== "validado" && <Button size="xs" variant="secondary" onClick={() => validateAi(f)} title="Conferido">✓</Button>}
                    <Button size="xs" variant="ghost" onClick={() => { setDraft(v?.value ? displayFieldValue(f.type, v.value) : ""); setEditing(f.key); }}></Button>
                  </div>
                )}
              </div>
            );
          })}
          {!fields.length && <div className="px-3 py-3 text-sm text-ink-3">Este serviço não tem dados configurados.</div>}
        </div>
      </div>

      <div>
        <div className="micro mb-2">Documentos</div>
        <div className="divide-y divide-line rounded-xl border border-line bg-surface">
          {docs.map((d) => {
            const info = DOC_STATUS_INFO[d.status];
            return (
              <div key={d.id} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="flex w-4 justify-center"><Dot color={DOC_DOT[d.status]} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{d.label}{!d.required && <span className="font-normal text-ink-3"> (opcional)</span>}</div>
                    <div className="text-xs text-ink-2">{info?.label}{d.notes ? ` · ${d.notes}` : ""}</div>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {d.media_path && (
                      <Button size="xs" variant="ghost" onClick={async () => { const u = await signedUrl(d.media_path!); if (u) window.open(u, "_blank"); }}></Button>
                    )}
                    {d.status !== "validado" && <Button size="xs" variant="secondary" onClick={() => setDocStatus(d, "validado")}>Validar</Button>}
                    {d.status !== "recusado" && d.status !== "pendente" && (
                      <Button size="xs" variant="ghost" onClick={() => { const r = prompt("Motivo da recusa (a IA vai pedir de novo ao cliente):"); if (r !== null) void setDocStatus(d, "recusado", r); }}></Button>
                    )}
                    <label className="inline-flex h-7 cursor-pointer items-center rounded-xl px-2 text-xs font-bold text-ink-2 hover:bg-surface-2" title="Anexar arquivo">
                     
                      <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadDoc(d, e.target.files[0])} />
                    </label>
                  </div>
                </div>
                {d.extracted && Object.keys(d.extracted as object).length > 0 && (
                  <div className="ml-7 mt-1 text-[11px] text-ink-3">
                    leu: {Object.entries(d.extracted as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                  </div>
                )}
              </div>
            );
          })}
          {!docs.length && <div className="px-3 py-3 text-sm text-ink-3">Sem documentos no checklist.</div>}
        </div>
      </div>

      <QuoteBox c={c} />
    </div>
  );
}

function QuoteBox({ c }: { c: CaseRow }) {
  const quote = (c.quote ?? {}) as { total?: number; itens?: { descricao: string; valor: number | null }[] };
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <span className="micro">Orçamento</span>
        <Select
          value={c.quote_status}
          onChange={async (e) => {
            await supabase().from("cases").update({ quote_status: e.target.value }).eq("id", c.id);
            await supabase().from("case_events").insert({ case_id: c.id, type: "orcamento", actor: "human", description: `Orçamento: ${e.target.value}` });
          }}
          className="ml-auto h-8 w-40"
        >
          <option value="none">Não enviado</option>
          <option value="enviado">Enviado</option>
          <option value="aceito">Aceito</option>
          <option value="pago">Pago</option>
        </Select>
      </div>
      {quote.itens?.length ? (
        <ul className="mt-2 space-y-0.5 text-sm">
          {quote.itens.map((i, idx) => (
            <li key={idx} className="flex justify-between"><span>{i.descricao}</span><span className="font-bold">{i.valor === null ? "a confirmar" : `R$ ${Number(i.valor).toFixed(2)}`}</span></li>
          ))}
        </ul>
      ) : null}
      {quote.total ? <div className="mt-1 text-right text-[13px] font-semibold">Total: R$ {Number(quote.total).toFixed(2)}</div> : null}
    </div>
  );
}

function Notes({ c }: { c: CaseRow }) {
  const [team, setTeam] = useState(c.team_notes_md);
  const [next, setNext] = useState(c.next_action);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setTeam(c.team_notes_md);
    setNext(c.next_action);
  }, [c.team_notes_md, c.next_action]);
  async function save() {
    setSaving(true);
    const { error } = await supabase().from("cases").update({ team_notes_md: team, next_action: next }).eq("id", c.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Notas salvas");
  }
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-sm font-bold">Notas da equipe <span className="font-normal text-ink-3">(a IA lê e confia nelas)</span></div>
        <MarkdownEditor value={team} onChange={setTeam} rows={6} placeholder="Ex.: Débitos consultados em 20/11: IPVA R$ 812,40 + 1 multa R$ 130,16. Cliente prefere áudio." />
      </div>
      <div>
        <div className="mb-1 text-sm font-bold">Próxima ação</div>
        <Input value={next} onChange={(e) => setNext(e.target.value)} placeholder="Ex.: Ligar para o Detran na segunda" />
      </div>
      <Button onClick={save} loading={saving}>Salvar notas</Button>
      <div className="rounded-lg border border-dashed border-[#ddd6fe] bg-violet-soft/40 p-3">
        <div className="mb-1 flex items-center gap-2 text-sm font-bold">
          Notas da IA
          {c.ai_notes_md && (
            <button className="ml-auto text-xs font-bold text-ink-3 hover:text-coral" onClick={async () => { await supabase().from("cases").update({ ai_notes_md: "" }).eq("id", c.id); }}>
              limpar
            </button>
          )}
        </div>
        <Markdown>{c.ai_notes_md}</Markdown>
      </div>
    </div>
  );
}
