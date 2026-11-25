"use client";

import { BookOpen, History as HistoryIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Row } from "@despachante/shared";
import { KIND_INFO, KnowledgeEditor, type DocDraft } from "@/components/knowledge-editor";
import { Markdown } from "@/components/markdown";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Spinner, Tabs, cx } from "@/components/ui";
import { fullDate, timeAgo } from "@/lib/format";
import { useUrlParam } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

type Doc = Row<"knowledge_docs"> & { service: { name: string; emoji: string } | null; stage: { name: string } | null };

const TABLE_LABELS: Record<string, string> = {
  knowledge_docs: "Conhecimento",
  services: "Serviço",
  service_stages: "Fase",
  service_fields: "Dado",
  service_documents: "Documento",
  service_prices: "Preço",
  settings: "Configurações",
};

const SOURCE_LABELS: Record<string, string> = { manual: "manual", ensinar: "ensinado", correcao: "correção", seed: "inicial" };

export default function KnowledgePage() {
  const [tab, setTab] = useState<"base" | "historico">("base");
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("todos");
  const [kind, setKind] = useState("todos");
  const [editing, setEditing] = useState<DocDraft | null>(null);
  const [docParam, setDocParam] = useUrlParam("doc");
  const [embeddingsOn, setEmbeddingsOn] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase().from("knowledge_docs").select("*, service:services(name, emoji), stage:service_stages(name)").order("updated_at", { ascending: false });
    setDocs((data ?? []) as unknown as Doc[]);
    const { data: emb } = await supabase().from("ai_task_models").select("provider_id, model, enabled").eq("task", "embeddings").single();
    setEmbeddingsOn(!!(emb?.enabled && emb.provider_id && emb.model));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (docParam && docs) {
      const d = docs.find((x) => x.id === docParam);
      if (d) setEditing(d);
    }
  }, [docParam, docs]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return (docs ?? []).filter((d) => {
      if (scope !== "todos" && d.scope !== scope) return false;
      if (kind !== "todos" && d.kind !== kind) return false;
      return !s || d.title.toLowerCase().includes(s) || d.content_md.toLowerCase().includes(s);
    });
  }, [docs, search, scope, kind]);

  async function reembed() {
    const { error } = await supabase().rpc("enqueue_job", { p_type: "reembed_all", p_payload: {}, p_dedupe_key: "reembed_all" });
    if (error) toast.error(error.message);
    else toast.success("Recalculando a busca inteligente…");
  }

  const withEmbedding = (docs ?? []).filter((d) => d.embedding_model).length;

  return (
    <div className="mx-auto max-w-6xl p-8">
      <PageHeader
        icon={BookOpen}
        title="Base de conhecimento"
        subtitle="Tudo que a IA sabe além dos serviços: regras, informações, perguntas frequentes e lições aprendidas."
        actions={<Button onClick={() => setEditing({ scope: "global", kind: "regra", title: "", content_md: "", active: true })}>+ Novo conhecimento</Button>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: "base", label: "Base" }, { value: "historico", label: "Histórico de alterações" }]} />
        {tab === "base" && (
          <>
            <Input placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
            <Select value={scope} onChange={(e) => setScope(e.target.value)} className="w-44">
              <option value="todos">Todos os escopos</option>
              <option value="global">Global</option>
              <option value="service">Serviço</option>
              <option value="stage">Fase</option>
            </Select>
            <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-44">
              <option value="todos">Todos os tipos</option>
              {Object.entries(KIND_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <div className="ml-auto flex items-center gap-2 text-xs text-ink-2">
              {embeddingsOn ? (
                <>
                  <Badge tone="mint">busca inteligente ativa · {withEmbedding}/{docs?.length ?? 0}</Badge>
                  <Button size="xs" variant="ghost" onClick={reembed}>recalcular</Button>
                </>
              ) : (
                <Badge tone="neutral" title="Configure um modelo de embeddings em Configurações → IA">busca por palavras</Badge>
              )}
            </div>
          </>
        )}
      </div>

      {tab === "base" ? (
        !docs ? (
          <div className="grid place-items-center py-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={BookOpen} title="Nada encontrado" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((d) => (
              <Card key={d.id} className={cx("cursor-pointer p-5 transition hover:-translate-y-0.5 hover:border-brand", !d.active && "opacity-60")} onClick={() => { setEditing(d); setDocParam(d.id); }}>
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{KIND_INFO[d.kind]?.label}</span>
                  <span className="font-extrabold">{d.title}</span>
                </div>
                <div className="mb-3 flex flex-wrap gap-1">
                  {d.scope === "global" ? <Badge tone="brand">global</Badge> : <Badge tone="brand">{d.service?.name}{d.stage ? ` · ${d.stage.name}` : ""}</Badge>}
                  {d.always_include && <Badge tone="sun">sempre incluída</Badge>}
                  <Badge>{SOURCE_LABELS[d.source] ?? d.source}</Badge>
                  {!d.active && <Badge tone="coral">inativa</Badge>}
                </div>
                <div className="line-clamp-4 text-sm text-ink-2"><Markdown>{d.content_md}</Markdown></div>
                <div className="mt-2 text-[11px] text-ink-3">atualizado {timeAgo(d.updated_at)} atrás</div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <History />
      )}

      <KnowledgeEditor open={!!editing} doc={editing} onClose={() => { setEditing(null); setDocParam(null); }} onSaved={load} />
    </div>
  );
}

function History() {
  const [rows, setRows] = useState<(Row<"knowledge_versions"> & { who?: string })[] | null>(null);
  const load = useCallback(async () => {
    const sb = supabase();
    const { data } = await sb.from("knowledge_versions").select("*").order("created_at", { ascending: false }).limit(100);
    const { data: profiles } = await sb.from("profiles").select("id, full_name");
    const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    setRows((data ?? []).map((r) => ({ ...r, who: r.changed_by ? names.get(r.changed_by) : undefined })));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function restore(id: number) {
    if (!confirm("Restaurar esta versão? O conteúdo atual vira uma nova entrada no histórico (dá para desfazer).")) return;
    const { error } = await supabase().rpc("restore_version", { p_version_id: id });
    if (error) return toast.error(error.message);
    toast.success("Versão restaurada");
    void load();
  }

  if (!rows) return <div className="grid place-items-center py-16"><Spinner /></div>;
  if (!rows.length) return <EmptyState icon={HistoryIcon} title="Nenhuma alteração ainda" description="Toda mudança em serviços, fases, preços e conhecimento fica registrada aqui e pode ser desfeita." />;
  return (
    <Card className="divide-y divide-line">
      {rows.map((r) => {
        const snap = r.snapshot as Record<string, unknown>;
        const title = String(snap.title ?? snap.name ?? snap.label ?? (r.table_name === "settings" ? "Configurações" : r.row_id));
        return (
          <div key={r.id} className="flex items-center gap-3 px-5 py-3">
            <span className="w-36 shrink-0 text-xs font-bold text-ink-2">{TABLE_LABELS[r.table_name] ?? r.table_name}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{title}</div>
              <div className="text-xs text-ink-3">
                {r.op === "DELETE" ? "excluído" : "versão anterior a uma edição"} · {r.who ?? "IA / sistema"} · <span title={fullDate(r.created_at)}>{timeAgo(r.created_at)} atrás</span>
              </div>
            </div>
            <Button size="xs" variant="secondary" onClick={() => restore(r.id)}>Restaurar</Button>
          </div>
        );
      })}
    </Card>
  );
}
