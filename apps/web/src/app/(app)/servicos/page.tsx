"use client";

import { Layers } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  FIELD_TYPE_LABELS, MODE_INFO, NOTIFY_MODE_INFO, TEMPLATE_VARIABLES, WAITING_ON_LABELS, formatMoney, renderTemplate,
  type Mode, type Row,
} from "@despachante/shared";
import { KIND_INFO, KnowledgeEditor, type DocDraft } from "@/components/knowledge-editor";
import { MarkdownEditor } from "@/components/markdown";
import { Badge, Button, Card, Dot, EmptyState, Field, Input, Select, Spinner, Switch, Tabs, Textarea, cx } from "@/components/ui";
import { useUrlParam } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

const slugify = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || `item_${Date.now()}`;

const COLORS = ["#2457F5", "#16a34a", "#f59e0b", "#8b5cf6", "#0ea5e9", "#ef4444", "#64748b", "#0891b2", "#db2777"];

type Tab = "geral" | "fases" | "dados" | "documentos" | "precos" | "conhecimento";

export default function ServicesPage() {
  const [services, setServices] = useState<Row<"services">[] | null>(null);
  const [selected, setSelected] = useUrlParam("s");
  const [stageParam, setStageParam] = useUrlParam("stage");
  const [tab, setTab] = useState<Tab>("geral");

  const load = useCallback(async () => {
    const { data } = await supabase().from("services").select("*").order("sort_order");
    setServices(data ?? []);
    return data ?? [];
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // link vindo do Raio-X: ?stage=<id>
  useEffect(() => {
    if (!stageParam) return;
    void supabase().from("service_stages").select("service_id").eq("id", stageParam).single().then(({ data }) => {
      if (data) {
        setSelected(data.service_id);
        setTab("fases");
      }
    });
  }, [stageParam, setSelected]);

  useEffect(() => {
    if (!selected && services?.length) setSelected(services[0].id);
  }, [services, selected, setSelected]);

  async function createService() {
    const name = prompt("Nome do novo serviço:");
    if (!name?.trim()) return;
    const sb = supabase();
    const { data, error } = await sb
      .from("services")
      .insert({ name: name.trim(), slug: slugify(name).replace(/_/g, "-"), code_prefix: name.trim().slice(0, 3).toUpperCase(), sort_order: (services?.length ?? 0) + 1 })
      .select("*")
      .single();
    if (error || !data) return toast.error(error?.message);
    const defaults = [
      { key: "triagem", name: "Triagem", emoji: "", color: "#64748b", ai_can_advance: true },
      { key: "coleta", name: "Coleta de documentos", emoji: "", color: "#2457F5", ai_can_advance: true, require_checklist: true, waiting_on: "client" },
      { key: "orcamento", name: "Orçamento e pagamento", emoji: "", color: "#f59e0b", waiting_on: "payment" },
      { key: "andamento", name: "Em andamento", emoji: "", color: "#0ea5e9", waiting_on: "detran", notify_mode: "auto", notify_template: "{nome}, o processo {codigo} está em andamento! Avisamos assim que concluir." },
      { key: "concluido", name: "Concluído", emoji: "", color: "#16a34a", is_final: true, notify_mode: "auto", notify_template: "{nome}, o processo {codigo} foi concluído!" },
      { key: "cancelado", name: "Cancelado", emoji: "", color: "#ef4444", is_canceled: true },
    ];
    await sb.from("service_stages").insert(defaults.map((s, i) => ({ ...s, service_id: data.id, sort_order: i + 1 })));
    await load();
    setSelected(data.id);
    setTab("geral");
    toast.success("Serviço criado com fases padrão. Personalize à vontade!");
  }

  const current = services?.find((s) => s.id === selected) ?? null;

  return (
    <div className="flex h-screen">
      <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-surface">
        <div className="border-b border-line p-4">
          <h1 className="text-xl font-black">Serviços</h1>
          <p className="text-xs text-ink-2">Cada serviço é um processo com fases, dados, documentos e preços.</p>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {!services ? <div className="grid place-items-center py-6"><Spinner /></div> : services.map((s) => (
            <button
              key={s.id}
              onClick={() => { setSelected(s.id); setStageParam(null); }}
              className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition", s.id === selected ? "bg-brand-soft" : "hover:bg-surface-2", !s.active && "opacity-50")}
            >
              <Dot color={s.color} className="size-2.5" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-extrabold">{s.name}</div>
                <div className="text-[11px] text-ink-3">{s.code_prefix} · {s.active ? "ativo" : "inativo"}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="border-t border-line p-3">
          <Button className="w-full" variant="secondary" onClick={createService}>+ Novo serviço</Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto p-8">
        {!current ? (
          <EmptyState icon={Layers} title="Escolha um serviço" />
        ) : (
          <div className="mx-auto max-w-4xl">
            <div className="mb-5 flex items-center gap-3">
              <Dot color={current.color} className="size-3" />
              <div>
                <h2 className="text-2xl font-black">{current.name}</h2>
                <p className="text-sm text-ink-2">{current.short_description}</p>
              </div>
            </div>
            <Tabs
              value={tab}
              onChange={setTab}
              className="mb-5"
              tabs={[
                { value: "geral", label: "Geral" },
                { value: "fases", label: "Fases" },
                { value: "dados", label: "Dados" },
                { value: "documentos", label: "Documentos" },
                { value: "precos", label: "Preços" },
                { value: "conhecimento", label: "Conhecimento" },
              ]}
            />
            {tab === "geral" && <GeneralTab key={current.id} s={current} onSaved={load} />}
            {tab === "fases" && <StagesTab key={current.id} serviceId={current.id} focusStage={stageParam} />}
            {tab === "dados" && <FieldsTab key={current.id} serviceId={current.id} />}
            {tab === "documentos" && <DocumentsTab key={current.id} serviceId={current.id} />}
            {tab === "precos" && <PricesTab key={current.id} serviceId={current.id} />}
            {tab === "conhecimento" && <KnowledgeTab key={current.id} serviceId={current.id} />}
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
function GeneralTab({ s, onSaved }: { s: Row<"services">; onSaved: () => void }) {
  const [f, setF] = useState(s);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const { error } = await supabase()
      .from("services")
      .update({ name: f.name, emoji: f.emoji, color: f.color, code_prefix: f.code_prefix.toUpperCase(), short_description: f.short_description, instructions_md: f.instructions_md, mode_override: f.mode_override, active: f.active })
      .eq("id", s.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Serviço salvo");
    onSaved();
  }
  return (
    <Card className="space-y-5 p-6">
      <div className="grid grid-cols-3 gap-4">
        <Field label="Nome" className="col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Prefixo do código" hint="Ex.: TRF → TRF-0001"><Input value={f.code_prefix} maxLength={5} onChange={(e) => setF({ ...f, code_prefix: e.target.value })} /></Field>
      </div>
      <Field label="Descrição curta" hint="A IA usa isto para reconhecer quando o cliente quer este serviço.">
        <Input value={f.short_description} onChange={(e) => setF({ ...f, short_description: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Cor">
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setF({ ...f, color: c })} className={cx("size-8 rounded-full", f.color === c && "ring-2 ring-offset-2 ring-brand/30")} style={{ background: c }} />
            ))}
          </div>
        </Field>
      </div>
      <Field label="Modo da IA neste serviço" hint="Sobrescreve o padrão da empresa e do número. Fases e conversas podem sobrescrever este.">
        <Select value={f.mode_override ?? ""} onChange={(e) => setF({ ...f, mode_override: e.target.value || null })}>
          <option value="">Herdar</option>
          {(Object.keys(MODE_INFO) as Mode[]).map((m) => <option key={m} value={m}>{MODE_INFO[m].label}</option>)}
        </Select>
      </Field>
      <Field label="Instruções para a IA" hint="Como conduzir este serviço: o que perguntar, pontos de atenção, o que nunca dizer.">
        <MarkdownEditor value={f.instructions_md} onChange={(v) => setF({ ...f, instructions_md: v })} rows={14} />
      </Field>
      <div className="flex items-center justify-between">
        <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Serviço ativo" description="Inativo: a IA não oferece e não aparece no Kanban." />
        <Button onClick={save} loading={saving}>Salvar</Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function StagesTab({ serviceId, focusStage }: { serviceId: string; focusStage: string | null }) {
  const [stages, setStages] = useState<Row<"service_stages">[] | null>(null);
  const [open, setOpen] = useState<string | null>(focusStage);
  const load = useCallback(async () => {
    const { data } = await supabase().from("service_stages").select("*").eq("service_id", serviceId).order("sort_order");
    setStages(data ?? []);
  }, [serviceId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setOpen(focusStage), [focusStage]);

  async function move(i: number, dir: -1 | 1) {
    if (!stages) return;
    const a = stages[i], b = stages[i + dir];
    if (!a || !b) return;
    await Promise.all([
      supabase().from("service_stages").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase().from("service_stages").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    void load();
  }
  async function add() {
    const name = prompt("Nome da nova fase:");
    if (!name?.trim() || !stages) return;
    const last = Math.max(0, ...stages.map((s) => s.sort_order));
    const { data, error } = await supabase().from("service_stages").insert({ service_id: serviceId, key: slugify(name), name: name.trim(), sort_order: last + 1 }).select("id").single();
    if (error) return toast.error(error.message);
    await load();
    setOpen(data?.id ?? null);
  }

  if (!stages) return <Spinner />;
  return (
    <div className="space-y-2">
      <div className="mb-3 rounded-lg border border-line bg-surface-2 p-3 text-[13px] text-ink-2">
        A <b>fase</b> é a parte estruturada do caso: ela decide o que a IA pode fazer, se pode avançar sozinha e quando o cliente recebe aviso. Assim o sistema não depende só do texto das notas.
      </div>
      {stages.map((s, i) => (
        <StageCard key={s.id} s={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} onMove={(d) => move(i, d)} onSaved={load} first={i === 0} last={i === stages.length - 1} />
      ))}
      <Button variant="secondary" onClick={add}>+ Adicionar fase</Button>
    </div>
  );
}

function StageCard({ s, open, onToggle, onMove, onSaved, first, last }: {
  s: Row<"service_stages">; open: boolean; onToggle: () => void; onMove: (d: -1 | 1) => void; onSaved: () => void; first: boolean; last: boolean;
}) {
  const [f, setF] = useState(s);
  const [saving, setSaving] = useState(false);
  useEffect(() => setF(s), [s]);
  async function save() {
    setSaving(true);
    const { error } = await supabase().from("service_stages").update({
      name: f.name, key: f.key, emoji: f.emoji, color: f.color, instructions_md: f.instructions_md, waiting_on: f.waiting_on,
      ai_can_advance: f.ai_can_advance, require_checklist: f.require_checklist, notify_mode: f.notify_mode, notify_template: f.notify_template,
      mode_override: f.mode_override, is_final: f.is_final, is_canceled: f.is_canceled,
    }).eq("id", s.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Fase salva");
    onSaved();
  }
  async function remove() {
    const { count } = await supabase().from("cases").select("id", { count: "exact", head: true }).eq("stage_id", s.id);
    if (count) return toast.error(`Há ${count} caso(s) nesta fase. Mova-os antes de excluir.`);
    if (!confirm(`Excluir a fase “${s.name}”?`)) return;
    await supabase().from("service_stages").delete().eq("id", s.id);
    onSaved();
  }
  const preview = renderTemplate(f.notify_template, { nome: "Ana", codigo: "TRF-0042", servico: "Transferência", fase: f.name, placa: "ABC-1D23", empresa: "Despachante" });

  return (
    <Card className={cx("overflow-hidden", open && "ring-2 ring-brand/30")}>
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderLeft: `5px solid ${s.color}` }}>
        <div className="flex flex-col">
          <button disabled={first} onClick={() => onMove(-1)} className="text-xs text-ink-3 hover:text-ink disabled:opacity-20">▲</button>
          <button disabled={last} onClick={() => onMove(1)} className="text-xs text-ink-3 hover:text-ink disabled:opacity-20">▼</button>
        </div>
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Dot color={s.color} />
          <span className="font-extrabold">{s.name}</span>
          <span className="text-xs text-ink-3">({s.key})</span>
          <span className="ml-2 flex flex-wrap gap-1">
            {s.ai_can_advance && <Badge tone="violet">IA avança</Badge>}
            {s.require_checklist && <Badge tone="brand">exige checklist</Badge>}
            {s.notify_mode !== "none" && <Badge tone="mint">{s.notify_mode === "auto" ? "avisa" : "aviso c/ aprovação"}</Badge>}
            {s.mode_override && <Badge tone="neutral">{MODE_INFO[s.mode_override as Mode].label}</Badge>}
            {s.is_final && <Badge tone="mint">final</Badge>}
            {s.is_canceled && <Badge tone="coral">cancelamento</Badge>}
          </span>
        </button>
        <span className="text-ink-3">{open ? "▴" : "▾"}</span>
      </div>
      {open && (
        <div className="space-y-4 border-t border-line p-5">
          <div className="grid grid-cols-4 gap-3">
            <Field label="Nome" className="col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Cor"><Input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="p-1" /></Field>
            <Field label="Chave" hint="Usada pela IA. Evite mudar."><Input value={f.key} onChange={(e) => setF({ ...f, key: slugify(e.target.value) })} /></Field>
            <Field label="Aguardando quem?">
              <Select value={f.waiting_on ?? ""} onChange={(e) => setF({ ...f, waiting_on: e.target.value || null })}>
                <option value="">—</option>
                {Object.entries(WAITING_ON_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Field>
            <Field label="Modo da IA nesta fase" className="col-span-2">
              <Select value={f.mode_override ?? ""} onChange={(e) => setF({ ...f, mode_override: e.target.value || null })}>
                <option value="">Herdar do serviço</option>
                {(Object.keys(MODE_INFO) as Mode[]).map((m) => <option key={m} value={m}>{MODE_INFO[m].label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Instruções para a IA nesta fase" hint="O que a IA pode/não pode dizer e fazer enquanto o caso está aqui.">
            <MarkdownEditor value={f.instructions_md} onChange={(v) => setF({ ...f, instructions_md: v })} rows={5} />
          </Field>
          <div className="grid grid-cols-2 gap-4 rounded-xl bg-surface-2 p-4">
            <Switch checked={f.ai_can_advance} onChange={(v) => setF({ ...f, ai_can_advance: v })} label="IA pode avançar daqui" description="Senão, a IA só pede aprovação para mudar de fase." />
            <Switch checked={f.require_checklist} onChange={(v) => setF({ ...f, require_checklist: v })} label="Exige checklist completo" description="Dados e documentos obrigatórios recebidos antes de sair." />
            <Switch checked={f.is_final} onChange={(v) => setF({ ...f, is_final: v, is_canceled: v ? false : f.is_canceled })} label="Fase final (concluído)" />
            <Switch checked={f.is_canceled} onChange={(v) => setF({ ...f, is_canceled: v, is_final: v ? false : f.is_final })} label="Fase de cancelamento" />
          </div>
          <div className="space-y-2 rounded-xl border border-line p-4">
            <Field label="Aviso ao cliente quando o caso entra nesta fase">
              <Select value={f.notify_mode} onChange={(e) => setF({ ...f, notify_mode: e.target.value })}>
                {Object.entries(NOTIFY_MODE_INFO).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.description}</option>)}
              </Select>
            </Field>
            {f.notify_mode !== "none" && (
              <>
                <Textarea value={f.notify_template} onChange={(e) => setF({ ...f, notify_template: e.target.value })} rows={3} placeholder="Olá {nome}! O processo {codigo}..." />
                <div className="flex flex-wrap gap-1">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <button key={v.key} type="button" title={v.description} onClick={() => setF({ ...f, notify_template: `${f.notify_template}{${v.key}}` })} className="rounded-md bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand">
                      {`{${v.key}}`}
                    </button>
                  ))}
                </div>
                {f.notify_template && (
                  <div className="rounded-xl bg-wa-out px-3 py-2 text-sm">
                    <div className="mb-0.5 text-[10px] font-bold text-ink-3">PRÉVIA</div>
                    {preview}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={remove}>Excluir fase</Button>
            <Button onClick={save} loading={saving}>Salvar fase</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
function FieldsTab({ serviceId }: { serviceId: string }) {
  const [rows, setRows] = useState<Row<"service_fields">[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase().from("service_fields").select("*").eq("service_id", serviceId).order("sort_order");
    setRows(data ?? []);
  }, [serviceId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function add() {
    const label = prompt("Nome do dado (ex.: Placa, CPF do comprador):");
    if (!label?.trim()) return;
    const { error } = await supabase().from("service_fields").insert({ service_id: serviceId, key: slugify(label), label: label.trim(), sort_order: (rows?.length ?? 0) + 1 });
    if (error) toast.error(error.message);
    void load();
  }
  if (!rows) return <Spinner />;
  return (
    <div className="space-y-2">
      <p className="mb-2 text-sm text-ink-2">Dados que a IA coleta e <b>valida</b> (CPF, placa, Renavam etc.). Ficam estruturados no caso, não só no texto.</p>
      {rows.map((r) => <FieldRow key={r.id} r={r} onSaved={load} />)}
      <Button variant="secondary" onClick={add}>+ Adicionar dado</Button>
    </div>
  );
}

function FieldRow({ r, onSaved }: { r: Row<"service_fields">; onSaved: () => void }) {
  const [f, setF] = useState({ ...r, optionsText: ((r.options as string[]) ?? []).join(", ") });
  const dirty = JSON.stringify({ ...r, optionsText: ((r.options as string[]) ?? []).join(", ") }) !== JSON.stringify(f);
  async function save() {
    const { error } = await supabase().from("service_fields").update({
      label: f.label, key: f.key, type: f.type, required: f.required, ai_hint: f.ai_hint,
      options: f.optionsText.split(",").map((o) => o.trim()).filter(Boolean),
    }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Dado salvo");
    onSaved();
  }
  return (
    <Card className="grid grid-cols-12 items-end gap-2 p-3">
      <Field label="Rótulo" className="col-span-3"><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
      <Field label="Chave" className="col-span-2"><Input value={f.key} onChange={(e) => setF({ ...f, key: slugify(e.target.value) })} /></Field>
      <Field label="Tipo" className="col-span-2">
        <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      <Field label="Dica para a IA" className="col-span-3"><Input value={f.ai_hint} onChange={(e) => setF({ ...f, ai_hint: e.target.value })} /></Field>
      <div className="col-span-2 flex items-center justify-end gap-1 pb-1">
        <Switch checked={f.required} onChange={(v) => setF({ ...f, required: v })} label={<span className="text-xs">Obrig.</span>} />
      </div>
      {f.type === "select" && (
        <Field label="Opções (separadas por vírgula)" className="col-span-12"><Input value={f.optionsText} onChange={(e) => setF({ ...f, optionsText: e.target.value })} /></Field>
      )}
      <div className="col-span-12 flex justify-end gap-2">
        <Button size="xs" variant="ghost" onClick={async () => { if (confirm(`Excluir “${r.label}”?`)) { await supabase().from("service_fields").delete().eq("id", r.id); onSaved(); } }}>Excluir</Button>
        {dirty && <Button size="xs" onClick={save}>Salvar</Button>}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function DocumentsTab({ serviceId }: { serviceId: string }) {
  const [rows, setRows] = useState<Row<"service_documents">[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase().from("service_documents").select("*").eq("service_id", serviceId).order("sort_order");
    setRows(data ?? []);
  }, [serviceId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function add() {
    const label = prompt("Nome do documento:");
    if (!label?.trim()) return;
    await supabase().from("service_documents").insert({ service_id: serviceId, key: slugify(label), label: label.trim(), sort_order: (rows?.length ?? 0) + 1 });
    void load();
  }
  if (!rows) return <Spinner />;
  return (
    <div className="space-y-2">
      <p className="mb-2 text-sm text-ink-2">Checklist de documentos. Cada caso novo recebe esta lista; a IA marca como recebido e a equipe valida.</p>
      {rows.map((r) => <DocRow key={r.id} r={r} onSaved={load} />)}
      <Button variant="secondary" onClick={add}>+ Adicionar documento</Button>
    </div>
  );
}

function DocRow({ r, onSaved }: { r: Row<"service_documents">; onSaved: () => void }) {
  const [f, setF] = useState(r);
  const dirty = JSON.stringify(r) !== JSON.stringify(f);
  return (
    <Card className="grid grid-cols-12 items-end gap-2 p-3">
      <Field label="Documento" className="col-span-4"><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
      <Field label="Orientação para o cliente" className="col-span-5"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ex.: frente e verso, legível" /></Field>
      <div className="col-span-3 flex items-center justify-end gap-2 pb-1">
        <Switch checked={f.required} onChange={(v) => setF({ ...f, required: v })} label={<span className="text-xs">Obrig.</span>} />
        <Button size="xs" variant="ghost" onClick={async () => { if (confirm(`Excluir “${r.label}”?`)) { await supabase().from("service_documents").delete().eq("id", r.id); onSaved(); } }}></Button>
        {dirty && <Button size="xs" onClick={async () => { const { error } = await supabase().from("service_documents").update({ label: f.label, description: f.description, required: f.required }).eq("id", r.id); if (error) toast.error(error.message); else { toast.success("Salvo"); onSaved(); } }}>Salvar</Button>}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function PricesTab({ serviceId }: { serviceId: string }) {
  const [rows, setRows] = useState<Row<"service_prices">[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase().from("service_prices").select("*").eq("service_id", serviceId).order("sort_order");
    setRows(data ?? []);
  }, [serviceId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!rows) return <Spinner />;
  return (
    <div className="space-y-2">
      <div className="mb-3 rounded-lg border border-line bg-surface-2 p-3 text-[13px] text-ink-2">
        A IA <b>só</b> informa valores desta tabela. Deixe o valor em branco para “a confirmar pela equipe”.
        {rows.some((r) => r.needs_review) && <div className="mt-1 font-medium text-sun">Há valores de exemplo para revisar (marcados abaixo).</div>}
      </div>
      {rows.map((r) => <PriceRow key={r.id} r={r} onSaved={load} />)}
      <Button variant="secondary" onClick={async () => { await supabase().from("service_prices").insert({ service_id: serviceId, label: "Novo item", sort_order: rows.length + 1 }); void load(); }}>+ Adicionar item</Button>
    </div>
  );
}

function PriceRow({ r, onSaved }: { r: Row<"service_prices">; onSaved: () => void }) {
  const [f, setF] = useState({ ...r, amountText: r.amount === null ? "" : String(r.amount).replace(".", ",") });
  async function save() {
    const amount = f.amountText.trim() ? Number(f.amountText.replace(/\./g, "").replace(",", ".")) : null;
    if (amount !== null && !Number.isFinite(amount)) return toast.error("Valor inválido");
    const { error } = await supabase().from("service_prices").update({ label: f.label, amount, kind: f.kind, notes: f.notes, active: f.active, needs_review: false }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Preço salvo");
    onSaved();
  }
  return (
    <Card className={cx("grid grid-cols-12 items-end gap-2 p-3", r.needs_review && "ring-2 ring-sun")}>
      <Field label="Item" className="col-span-4"><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
      <Field label="Valor (R$)" className="col-span-2"><Input value={f.amountText} onChange={(e) => setF({ ...f, amountText: e.target.value })} placeholder="a confirmar" /></Field>
      <Field label="Tipo" className="col-span-2">
        <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          <option value="honorario">Honorário</option><option value="taxa">Taxa</option><option value="opcional">Opcional</option>
        </Select>
      </Field>
      <Field label="Observação" className="col-span-4"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <div className="col-span-12 flex items-center justify-between">
        <div className="text-xs text-ink-3">
          {r.needs_review ? <Badge tone="sun">valor de exemplo — revise e salve</Badge> : <>Atual: {formatMoney(r.amount === null ? null : Number(r.amount))}</>}
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label={<span className="text-xs">Ativo</span>} />
          <Button size="xs" variant="ghost" onClick={async () => { if (confirm("Excluir item?")) { await supabase().from("service_prices").delete().eq("id", r.id); onSaved(); } }}></Button>
          <Button size="xs" onClick={save}>Salvar</Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function KnowledgeTab({ serviceId }: { serviceId: string }) {
  const [rows, setRows] = useState<(Row<"knowledge_docs"> & { stage: { name: string } | null })[] | null>(null);
  const [editing, setEditing] = useState<DocDraft | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase().from("knowledge_docs").select("*, stage:service_stages(name)").eq("service_id", serviceId).order("created_at");
    setRows((data ?? []) as unknown as typeof rows);
  }, [serviceId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!rows) return <Spinner />;
  return (
    <div className="space-y-2">
      <p className="mb-2 text-sm text-ink-2">Regras, FAQs e lições específicas deste serviço (ou de uma fase dele). Entram no contexto sempre que o caso for deste serviço.</p>
      {rows.length === 0 && <EmptyState title="Nada específico ainda" description="Use o “Ensinar a IA” ou adicione aqui." />}
      {rows.map((d) => (
        <Card key={d.id} className="cursor-pointer p-4 hover:border-brand" onClick={() => setEditing(d)}>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{KIND_INFO[d.kind]?.label}</span>
            <b>{d.title}</b>
            {d.stage && <Badge tone="brand">{d.stage.name}</Badge>}
            {!d.active && <Badge>inativo</Badge>}
          </div>
          <div className="mt-1 line-clamp-2 text-sm text-ink-2">{d.content_md}</div>
        </Card>
      ))}
      <Button variant="secondary" onClick={() => setEditing({ scope: "service", service_id: serviceId, kind: "regra", title: "", content_md: "", active: true })}>+ Novo conhecimento</Button>
      <KnowledgeEditor open={!!editing} doc={editing} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  );
}
