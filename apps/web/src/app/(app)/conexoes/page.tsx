"use client";

import { Plug, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MODE_INFO, type Mode, type Row } from "@despachante/shared";
import { Badge, Button, Card, Dot, Field, Input, Modal, PageHeader, Select, Switch } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase/client";

const COLORS = ["#2457F5", "#16a34a", "#f59e0b", "#7c3aed", "#0ea5e9", "#f43f5e"];

export default function ConnectionsPage() {
  const { channels, refreshChannels, isOwner } = useApp();
  const [editing, setEditing] = useState<Partial<Row<"channels">> | null>(null);

  async function save(c: Partial<Row<"channels">>) {
    const payload = { name: c.name ?? "Novo número", phone: c.phone ?? null, emoji: c.emoji ?? "", color: c.color ?? "#2457F5", mode_override: c.mode_override ?? null, active: c.active ?? true, kind: c.kind ?? "simulator" };
    const res = c.id ? await supabase().from("channels").update(payload).eq("id", c.id) : await supabase().from("channels").insert(payload);
    if (res.error) return toast.error(res.error.message.includes("row-level") ? "Apenas o dono pode alterar conexões." : res.error.message);
    toast.success("Conexão salva");
    setEditing(null);
    void refreshChannels();
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <PageHeader
        icon={Plug}
        title="Conexões"
        subtitle="Os números de WhatsApp da empresa. Tudo chega numa caixa de entrada só, unificada por cliente."
        actions={isOwner && <Button onClick={() => setEditing({ kind: "simulator", emoji: "", color: "#2457F5", active: true })}>+ Adicionar número</Button>}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {channels.map((c) => (
          <Card key={c.id} className="p-5">
            <div className="flex items-start gap-4">
              <div className="grid size-10 place-items-center rounded-lg border border-line bg-surface-2"><Dot color={c.color} className="size-2.5" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-extrabold">{c.name}</span>
                  {!c.active && <Badge>inativo</Badge>}
                </div>
                <div className="text-sm text-ink-2">{c.phone ?? "—"}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.kind === "simulator" ? <Badge tone="violet">Simulador</Badge> : <Badge tone="mint">Evolution API</Badge>}
                  <Badge tone={c.status === "connected" ? "mint" : "coral"}>{c.status === "connected" ? "● conectado" : "● desconectado"}</Badge>
                  {c.mode_override && <Badge>{MODE_INFO[c.mode_override as Mode].label}</Badge>}
                </div>
              </div>
              {isOwner && <Button size="sm" variant="ghost" onClick={() => setEditing(c)}></Button>}
            </div>
          </Card>
        ))}

        <Card className="border-dashed p-5 opacity-90">
          <div className="flex items-start gap-4">
            <div className="grid size-10 place-items-center rounded-lg border border-line bg-surface-2 text-ink-3"><Smartphone className="size-4" strokeWidth={1.75} /></div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold">WhatsApp real (Evolution API)</span>
                <Badge tone="sun">em breve</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-2">
                Conecte os números de verdade lendo um QR Code. O worker já está preparado: cada número vira uma conexão como estas, e as mensagens entram pelo mesmo caminho que o Simulador usa hoje.
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-ink-3">
                <li>• URL da sua Evolution API + chave</li>
                <li>• Nome da instância por número</li>
                <li>• Webhook apontando para o worker (/webhooks/evolution)</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Editar conexão" : "Nova conexão"}
        size="sm"
        footer={
          <>
            {editing?.id && (
              <Button variant="ghost" className="mr-auto" onClick={async () => {
                if (!confirm("Excluir esta conexão? As mensagens antigas continuam no histórico.")) return;
                const { error } = await supabase().from("channels").delete().eq("id", editing.id!);
                if (error) return toast.error(error.message);
                setEditing(null);
                void refreshChannels();
              }}></Button>
            )}
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => editing && save(editing)}>Salvar</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Tipo">
              <Select value={editing.kind ?? "simulator"} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>
                <option value="simulator">Simulador (testes)</option>
                <option value="evolution" disabled>Evolution API (em breve)</option>
              </Select>
            </Field>
            <Field label="Nome"><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ex.: WhatsApp Recepção" /></Field>
            <Field label="Número (exibição)"><Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} placeholder="(41) 99999-0000" /></Field>
            <Field label="Cor">
              <div className="flex gap-1.5">{COLORS.map((c) => <button key={c} onClick={() => setEditing({ ...editing, color: c })} className={`size-8 rounded-full ${editing.color === c ? "ring-2 ring-brand/40 ring-offset-2" : ""}`} style={{ background: c }} />)}</div>
            </Field>
            <Field label="Modo da IA neste número" hint="Ex.: o número do financeiro sempre em copiloto.">
              <Select value={editing.mode_override ?? ""} onChange={(e) => setEditing({ ...editing, mode_override: e.target.value || null })}>
                <option value="">Herdar da empresa</option>
                {(Object.keys(MODE_INFO) as Mode[]).map((m) => <option key={m} value={m}>{MODE_INFO[m].label}</option>)}
              </Select>
            </Field>
            <Switch checked={editing.active ?? true} onChange={(v) => setEditing({ ...editing, active: v })} label="Ativo" />
          </div>
        )}
      </Modal>
    </div>
  );
}
