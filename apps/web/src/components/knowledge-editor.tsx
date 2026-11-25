"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Row } from "@despachante/shared";
import { supabase } from "@/lib/supabase/client";
import { MarkdownEditor } from "./markdown";
import { Button, Field, Input, Modal, Select, Switch } from "./ui";

export const KIND_INFO: Record<string, { label: string; emoji: string; hint: string }> = {
  regra: { label: "Regra", emoji: "", hint: "Algo que a IA deve sempre / nunca fazer" },
  info: { label: "Informação", emoji: "", hint: "Fatos: endereços, horários, procedimentos" },
  faq: { label: "Pergunta frequente", emoji: "", hint: "Pergunta comum e a resposta certa" },
  licao: { label: "Lição aprendida", emoji: "", hint: "Correção vinda de um erro real" },
};

export type DocDraft = Partial<Row<"knowledge_docs">>;

export function KnowledgeEditor({ open, onClose, doc, onSaved }: { open: boolean; onClose: () => void; doc: DocDraft | null; onSaved?: () => void }) {
  const [d, setD] = useState<DocDraft>({});
  const [services, setServices] = useState<Row<"services">[]>([]);
  const [stages, setStages] = useState<Row<"service_stages">[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setD(doc ?? { scope: "global", kind: "regra", title: "", content_md: "", active: true, always_include: false });
    void supabase().from("services").select("*").order("sort_order").then(({ data }) => setServices(data ?? []));
  }, [open, doc]);

  useEffect(() => {
    if (!d.service_id) return setStages([]);
    void supabase().from("service_stages").select("*").eq("service_id", d.service_id).order("sort_order").then(({ data }) => setStages(data ?? []));
  }, [d.service_id]);

  async function save() {
    if (!d.title?.trim()) return toast.error("Dê um título");
    setSaving(true);
    const payload = {
      scope: d.scope ?? "global",
      kind: d.kind ?? "regra",
      title: d.title.trim(),
      content_md: d.content_md ?? "",
      active: d.active ?? true,
      always_include: d.scope === "global" ? !!d.always_include : false,
      service_id: d.scope === "global" ? null : d.service_id ?? null,
      stage_id: d.scope === "stage" ? d.stage_id ?? null : null,
    };
    if (payload.scope !== "global" && !payload.service_id) {
      setSaving(false);
      return toast.error("Escolha o serviço");
    }
    if (payload.scope === "stage" && !payload.stage_id) {
      setSaving(false);
      return toast.error("Escolha a fase");
    }
    const sb = supabase();
    const res = d.id ? await sb.from("knowledge_docs").update(payload).eq("id", d.id) : await sb.from("knowledge_docs").insert({ ...payload, source: "manual" });
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success("Conhecimento salvo — a IA já usa na próxima resposta");
    onSaved?.();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={d.id ? "Editar conhecimento" : "Novo conhecimento"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save} loading={saving}>Salvar</Button></>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(KIND_INFO).map(([k, v]) => (
            <button key={k} type="button" onClick={() => setD({ ...d, kind: k })} className={`rounded-xl border-2 p-2.5 text-left transition ${d.kind === k ? "border-brand bg-brand-soft" : "border-line hover:border-brand/40"}`}>
              <div className="text-sm font-extrabold">{v.label}</div>
              <div className="text-[11px] text-ink-2">{v.hint}</div>
            </button>
          ))}
        </div>
        <Field label="Título"><Input value={d.title ?? ""} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Ex.: Sempre pedir o CRV frente e verso" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Vale para">
            <Select value={d.scope ?? "global"} onChange={(e) => setD({ ...d, scope: e.target.value })}>
              <option value="global">Todo atendimento</option>
              <option value="service">Um serviço</option>
              <option value="stage">Uma fase de um serviço</option>
            </Select>
          </Field>
          {d.scope !== "global" && (
            <Field label="Serviço">
              <Select value={d.service_id ?? ""} onChange={(e) => setD({ ...d, service_id: e.target.value || null, stage_id: null })}>
                <option value="">—</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}
          {d.scope === "stage" && (
            <Field label="Fase">
              <Select value={d.stage_id ?? ""} onChange={(e) => setD({ ...d, stage_id: e.target.value || null })}>
                <option value="">—</option>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <Field label="Conteúdo" hint="Escreva como uma orientação direta para a assistente. Markdown é aceito.">
          <MarkdownEditor value={d.content_md ?? ""} onChange={(v) => setD({ ...d, content_md: v })} rows={9} />
        </Field>
        <div className="flex flex-wrap gap-6">
          {d.scope === "global" && (
            <Switch checked={!!d.always_include} onChange={(v) => setD({ ...d, always_include: v })} label="Sempre incluir" description="Entra em todo atendimento (use para regras importantes). Se desligado, a IA busca quando precisar." />
          )}
          <Switch checked={d.active ?? true} onChange={(v) => setD({ ...d, active: v })} label="Ativo" />
        </div>
      </div>
    </Modal>
  );
}
