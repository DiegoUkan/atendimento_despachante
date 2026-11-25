"use client";

import { CircleCheckBig } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { Row } from "@despachante/shared";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, cx } from "@/components/ui";
import { fullDate, timeAgo } from "@/lib/format";
import { useRealtime, useThrottledCallback } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

type Scenario = Row<"test_scenarios">;
type Result = {
  transcript?: { de: string; texto: string }[];
  tools?: string[];
  handoff?: boolean;
  judge?: { passou: boolean; criterios: { criterio: string; ok: boolean; comentario?: string }[]; resumo: string };
  error?: string;
};

const STATUS: Record<string, { label: string; tone: "mint" | "coral" | "brand" | "sun" | "neutral" }> = {
  passou: { label: "passou", tone: "mint" },
  falhou: { label: "falhou", tone: "coral" },
  running: { label: "rodando…", tone: "brand" },
  erro: { label: "erro", tone: "sun" },
};

export default function TestsPage() {
  const [rows, setRows] = useState<Scenario[] | null>(null);
  const [editing, setEditing] = useState<Partial<Scenario> | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase().from("test_scenarios").select("*").order("created_at");
    setRows(data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const reload = useThrottledCallback(() => void load(), 400);
  useRealtime("test_scenarios", reload);

  async function run(s: Scenario) {
    await supabase().from("test_scenarios").update({ last_status: "running" }).eq("id", s.id);
    const { error } = await supabase().rpc("enqueue_job", { p_type: "run_scenario", p_payload: { scenario_id: s.id }, p_dedupe_key: `scenario:${s.id}` });
    if (error) toast.error(error.message);
  }
  async function runAll() {
    for (const s of rows ?? []) await run(s);
    toast.success("Rodando todos os cenários… pode continuar usando o sistema.");
  }

  const passed = (rows ?? []).filter((r) => r.last_status === "passou").length;
  const ran = (rows ?? []).filter((r) => r.last_status === "passou" || r.last_status === "falhou").length;

  return (
    <div className="mx-auto max-w-5xl p-8">
      <PageHeader
        icon={CircleCheckBig}
        title="Cenários de teste"
        subtitle="Conversas roteirizadas com o que a IA DEVE e NÃO DEVE fazer. Rode depois de mudar instruções para ver se algo quebrou."
        actions={
          <>
            {ran > 0 && <Badge tone={passed === ran ? "mint" : "sun"} className="text-sm">{passed}/{ran} passando</Badge>}
            <Button variant="secondary" onClick={runAll} disabled={!rows?.length}>Rodar todos</Button>
            <Button onClick={() => setEditing({ name: "", description: "", client_messages: [""], expectations: "DEVE \nNÃO DEVE ", setup: {} })}>+ Novo cenário</Button>
          </>
        }
      />
      {!rows ? (
        <div className="grid place-items-center py-16"><Spinner /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={CircleCheckBig} title="Nenhum cenário" />
      ) : (
        <div className="space-y-3">
          {rows.map((s) => {
            const r = (s.last_result ?? {}) as Result;
            const st = s.last_status ? STATUS[s.last_status] : null;
            const msgs = (s.client_messages as string[]) ?? [];
            return (
              <Card key={s.id} className="overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold">{s.name}</span>
                      {st && <Badge tone={st.tone}>{st.label}</Badge>}
                    </div>
                    <div className="text-sm text-ink-2">{s.description || `${msgs.length} mensagem(ns) do cliente`}</div>
                    {s.last_run_at && <div className="text-[11px] text-ink-3" title={fullDate(s.last_run_at)}>rodado {timeAgo(s.last_run_at)} atrás</div>}
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)}></Button>
                  <Button size="sm" variant="secondary" onClick={() => run(s)} loading={s.last_status === "running"}>Rodar</Button>
                </div>
                {open === s.id && (
                  <div className="grid gap-4 border-t border-line bg-surface-2/50 p-5 md:grid-cols-2">
                    <div>
                      <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-ink-3">Conversa</div>
                      <div className="wa-wallpaper space-y-1.5 rounded-xl p-3">
                        {(r.transcript ?? msgs.map((m) => ({ de: "cliente", texto: m }))).map((t, i) => (
                          <div key={i} className={cx("flex", t.de === "cliente" ? "justify-end" : "justify-start")}>
                            <div className={cx("max-w-[85%] rounded-xl px-3 py-1.5 text-sm shadow-sm whitespace-pre-wrap", t.de === "cliente" ? "bg-wa-out" : "bg-white")}>{t.texto}</div>
                          </div>
                        ))}
                      </div>
                      {r.tools && r.tools.length > 0 && (
                        <div className="mt-3">
                          <div className="mb-1 text-xs font-extrabold uppercase tracking-wide text-ink-3">Ações</div>
                          <ul className="space-y-0.5 text-xs text-ink-2">{r.tools.map((t, i) => <li key={i} className="font-mono">{t}</li>)}</ul>
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-ink-3">Expectativas</div>
                      {r.judge ? (
                        <div className="space-y-2">
                          {r.judge.criterios.map((c, i) => (
                            <div key={i} className={cx("rounded-xl border px-3 py-2 text-sm", c.ok ? "border-mint/30 bg-mint-soft/50" : "border-coral/30 bg-coral-soft/50")}>
                              <div className="font-bold">{c.ok ? "" : ""} {c.criterio}</div>
                              {c.comentario && <div className="text-xs text-ink-2">{c.comentario}</div>}
                            </div>
                          ))}
                          <div className="rounded-xl bg-surface p-3 text-sm"><b>Resumo:</b> {r.judge.resumo}</div>
                        </div>
                      ) : r.error ? (
                        <div className="rounded-xl bg-coral-soft p-3 text-sm text-coral">{r.error}</div>
                      ) : (
                        <pre className="whitespace-pre-wrap rounded-xl bg-surface p-3 text-sm">{s.expectations}</pre>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <ScenarioEditor s={editing} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  );
}

function ScenarioEditor({ s, onClose, onSaved }: { s: Partial<Scenario> | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Scenario>>({});
  const [msgs, setMsgs] = useState<string[]>([""]);
  const [services, setServices] = useState<Row<"services">[]>([]);
  const [stages, setStages] = useState<Row<"service_stages">[]>([]);
  const setup = (f.setup ?? {}) as { service_slug?: string; stage_key?: string; client_name?: string; plate?: string };

  useEffect(() => {
    if (!s) return;
    setF(s);
    setMsgs(((s.client_messages as string[]) ?? [""]).length ? (s.client_messages as string[]) : [""]);
    void supabase().from("services").select("*").order("sort_order").then(({ data }) => setServices(data ?? []));
  }, [s]);
  useEffect(() => {
    const svc = services.find((x) => x.slug === setup.service_slug);
    if (!svc) return setStages([]);
    void supabase().from("service_stages").select("*").eq("service_id", svc.id).order("sort_order").then(({ data }) => setStages(data ?? []));
  }, [setup.service_slug, services]);

  async function save() {
    const payload = {
      name: f.name?.trim() || "Cenário",
      description: f.description ?? "",
      client_messages: msgs.map((m) => m.trim()).filter(Boolean),
      expectations: f.expectations ?? "",
      setup: (setup.service_slug ? setup : {}) as never,
    };
    const res = f.id ? await supabase().from("test_scenarios").update(payload).eq("id", f.id) : await supabase().from("test_scenarios").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Cenário salvo");
    onSaved();
    onClose();
  }

  return (
    <Modal
      open={!!s}
      onClose={onClose}
      size="lg"
      title={f.id ? "Editar cenário" : "Novo cenário"}
      footer={
        <>
          {f.id && <Button variant="ghost" className="mr-auto" onClick={async () => { if (confirm("Excluir cenário?")) { await supabase().from("test_scenarios").delete().eq("id", f.id!); onSaved(); onClose(); } }}>Excluir</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome"><Input value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Descrição"><Input value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        </div>
        <Field label="Mensagens do cliente (em ordem)">
          <div className="space-y-2">
            {msgs.map((m, i) => (
              <div key={i} className="flex gap-2">
                <Input value={m} onChange={(e) => setMsgs(msgs.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Mensagem ${i + 1}`} />
                <Button variant="ghost" onClick={() => setMsgs(msgs.filter((_, j) => j !== i))} disabled={msgs.length === 1}>×</Button>
              </div>
            ))}
            <Button size="xs" variant="secondary" onClick={() => setMsgs([...msgs, ""])}>+ mensagem</Button>
          </div>
        </Field>
        <Field label="Expectativas" hint="Uma por linha, começando com DEVE ou NÃO DEVE. Um modelo avaliador confere cada linha.">
          <Textarea rows={5} value={f.expectations ?? ""} onChange={(e) => setF({ ...f, expectations: e.target.value })} />
        </Field>
        <div className="rounded-xl bg-surface-2 p-4">
          <div className="mb-2 text-sm font-bold">Começar com um caso já aberto (opcional)</div>
          <div className="grid grid-cols-2 gap-3">
            <Select value={setup.service_slug ?? ""} onChange={(e) => setF({ ...f, setup: { ...setup, service_slug: e.target.value || undefined, stage_key: undefined } as never })}>
              <option value="">Sem caso</option>
              {services.map((x) => <option key={x.id} value={x.slug}>{x.name}</option>)}
            </Select>
            <Select value={setup.stage_key ?? ""} onChange={(e) => setF({ ...f, setup: { ...setup, stage_key: e.target.value || undefined } as never })} disabled={!setup.service_slug}>
              <option value="">Primeira fase</option>
              {stages.map((x) => <option key={x.id} value={x.key}>{x.name}</option>)}
            </Select>
            <Input placeholder="Nome do cliente" value={setup.client_name ?? ""} onChange={(e) => setF({ ...f, setup: { ...setup, client_name: e.target.value } as never })} disabled={!setup.service_slug} />
            <Input placeholder="Placa" value={setup.plate ?? ""} onChange={(e) => setF({ ...f, setup: { ...setup, plate: e.target.value } as never })} disabled={!setup.service_slug} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
