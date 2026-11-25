"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RELATION_LABELS, formatCpfCnpj, formatPhone, type Row } from "@despachante/shared";
import { useRealtime, useThrottledCallback } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";
import { CASE_SELECT, CaseDetail, type CaseRow } from "./case-detail";
import { Plate } from "./plate";
import { Avatar, Badge, Button, Dot, Modal, Select, Spinner, cx } from "./ui";

type Link_ = { relation: string; verified: boolean; is_primary: boolean; client: Row<"clients"> };

export function NewCaseModal({ open, onClose, contactId, clientId, conversationId, isTest, onCreated }: {
  open: boolean; onClose: () => void; contactId?: string | null; clientId?: string | null; conversationId?: string | null; isTest?: boolean;
  onCreated?: (id: string) => void;
}) {
  const [services, setServices] = useState<Row<"services">[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickedClient, setPickedClient] = useState<Row<"clients"> | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [clientResults, setClientResults] = useState<Row<"clients">[]>([]);
  const pickClient = !contactId && !clientId;
  useEffect(() => {
    if (!open) return;
    setPickedClient(null);
    setClientSearch("");
    void supabase().from("services").select("*").eq("active", true).order("sort_order").then(({ data }) => {
      setServices(data ?? []);
      setServiceId(data?.[0]?.id ?? "");
    });
  }, [open]);
  useEffect(() => {
    if (!pickClient || clientSearch.trim().length < 2) {
      setClientResults([]);
      return;
    }
    const q = clientSearch.trim();
    const digits = q.replace(/\D/g, "");
    let query = supabase().from("clients").select("*").eq("is_test", false).limit(8);
    query = digits.length >= 3 ? query.or(`name.ilike.%${q}%,doc.ilike.%${digits}%`) : query.ilike("name", `%${q}%`);
    void query.then(({ data }) => setClientResults(data ?? []));
  }, [clientSearch, pickClient]);
  async function create() {
    if (pickClient && !pickedClient) return toast.error("Escolha o cliente");
    const finalClientId = clientId ?? pickedClient?.id ?? null;
    setSaving(true);
    const sb = supabase();
    const { data: first } = await sb.from("service_stages").select("id").eq("service_id", serviceId).eq("is_canceled", false).order("sort_order").limit(1).single();
    if (!first) {
      setSaving(false);
      return toast.error("Serviço sem fases");
    }
    const { data, error } = await sb
      .from("cases")
      .insert({ service_id: serviceId, stage_id: first.id, contact_id: contactId ?? null, client_id: finalClientId, conversation_id: conversationId ?? null, is_test: !!isTest, last_change_actor: "human" })
      .select("id, code")
      .single();
    setSaving(false);
    if (error || !data) return toast.error(error?.message ?? "Erro");
    if (conversationId) await sb.from("conversations").update({ active_case_id: data.id }).eq("id", conversationId);
    toast.success(`Caso ${data.code} aberto`);
    onCreated?.(data.id);
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title="Novo caso" size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={create} loading={saving} disabled={!serviceId}>Abrir caso</Button></>}>
      {pickClient && (
        <div className="mb-4">
          <div className="mb-1.5 text-sm font-bold">Cliente</div>
          {pickedClient ? (
            <div className="flex items-center justify-between rounded-xl bg-brand-soft px-3 py-2 text-sm font-bold">
              {pickedClient.name}
              <button className="text-xs text-ink-2 underline" onClick={() => setPickedClient(null)}>trocar</button>
            </div>
          ) : (
            <>
              <input
                className="h-10 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-brand"
                placeholder="Buscar por nome ou CPF/CNPJ…"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                autoFocus
              />
              <div className="mt-1 space-y-1">
                {clientResults.map((c) => (
                  <button key={c.id} onClick={() => setPickedClient(c)} className="block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-surface-2">
                    {c.name} {c.doc && <span className="text-ink-3">· {formatCpfCnpj(c.doc)}</span>}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-xs text-ink-3">Não achou? Cadastre em Clientes.</div>
            </>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {services.map((s) => (
          <button key={s.id} onClick={() => setServiceId(s.id)} className={cx("rounded-xl border-2 p-3 text-left text-sm font-bold transition", serviceId === s.id ? "border-brand bg-brand-soft" : "border-line hover:border-brand/40")}>
            <Dot color={s.color} className="mb-1.5" />
            {s.name}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function ContactPanel({ contactId, conversation }: { contactId: string; conversation?: Row<"conversations"> | null }) {
  const [contact, setContact] = useState<Row<"contacts"> | null>(null);
  const [links, setLinks] = useState<Link_[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newCase, setNewCase] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: c }, { data: l }] = await Promise.all([
      sb.from("contacts").select("*").eq("id", contactId).single(),
      sb.from("contact_clients").select("relation, verified, is_primary, client:clients(*)").eq("contact_id", contactId),
    ]);
    setContact(c);
    const ls = ((l ?? []) as unknown as Link_[]).filter((x) => x.client);
    setLinks(ls);
    const clientIds = ls.map((x) => x.client.id);
    const filters = [`contact_id.eq.${contactId}`];
    if (clientIds.length) filters.push(`client_id.in.(${clientIds.join(",")})`);
    const { data: cs } = await sb.from("cases").select(CASE_SELECT).or(filters.join(",")).order("updated_at", { ascending: false }).limit(20);
    setCases((cs ?? []) as unknown as CaseRow[]);
    setLoading(false);
  }, [contactId]);

  useEffect(() => {
    setLoading(true);
    setSelected(null);
    void load();
  }, [load]);
  const reload = useThrottledCallback(() => void load(), 500);
  useRealtime("cases", reload, `contact_id=eq.${contactId}`);

  useEffect(() => {
    if (selected) return;
    const preferred = cases.find((c) => c.id === conversation?.active_case_id) ?? cases.find((c) => !c.closed_at) ?? cases[0];
    if (preferred) setSelected(preferred.id);
  }, [cases, conversation?.active_case_id, selected]);

  if (loading || !contact) return <div className="grid place-items-center py-10"><Spinner /></div>;

  async function toggleVerified(l: Link_) {
    await supabase().from("contact_clients").update({ verified: !l.verified }).eq("contact_id", contactId).eq("client_id", l.client.id);
    toast.success(!l.verified ? "Vínculo verificado — a IA pode falar dos casos deste cliente" : "Vínculo marcado como não verificado");
    void load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar name={contact.name || contact.wa_name || contact.phone} size={44} />
        <div className="min-w-0">
          <div className="truncate font-extrabold">{contact.name || contact.wa_name || "Sem nome"}</div>
          <div className="text-sm text-ink-2">{formatPhone(contact.phone)}</div>
          {contact.wa_name && contact.name && contact.wa_name !== contact.name && <div className="text-xs text-ink-3">WhatsApp: {contact.wa_name}</div>}
        </div>
        {contact.is_test && <Badge tone="violet" className="ml-auto">teste</Badge>}
      </div>

      <div>
        <div className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-ink-3">Clientes vinculados</div>
        {links.length === 0 ? (
          <div className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-3">Ainda não identificado. A IA vincula quando o cliente se apresentar.</div>
        ) : (
          <div className="space-y-1.5">
            {links.map((l) => (
              <div key={l.client.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/clientes?id=${l.client.id}`} className="block truncate text-sm font-bold hover:underline">{l.client.name}</Link>
                  <div className="text-xs text-ink-2">
                    {RELATION_LABELS[l.relation]}{l.client.doc ? ` · ${formatCpfCnpj(l.client.doc)}` : ""}
                  </div>
                </div>
                <button onClick={() => toggleVerified(l)} title="Clique para alternar">
                  {l.verified ? <Badge tone="mint">verificado</Badge> : <Badge tone="sun">verificar</Badge>}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wide text-ink-3">Casos</span>
          <Button size="xs" variant="secondary" onClick={() => setNewCase(true)}>+ Novo caso</Button>
        </div>
        {cases.length > 1 && (
          <Select value={selected ?? ""} onChange={(e) => setSelected(e.target.value)} className="mb-3">
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.stage.name}{c.closed_at ? " (encerrado)" : ""}
              </option>
            ))}
          </Select>
        )}
        {cases.length === 1 && (
          <div className="mb-3 flex items-center gap-2 text-sm">
            <Plate plate={cases[0].vehicle?.plate} size="xs" />
          </div>
        )}
        {selected ? (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <CaseDetail caseId={selected} compact />
          </div>
        ) : (
          <div className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-3">Nenhum caso ainda.</div>
        )}
      </div>

      <NewCaseModal
        open={newCase}
        onClose={() => setNewCase(false)}
        contactId={contactId}
        clientId={links.find((l) => l.is_primary)?.client.id ?? links[0]?.client.id}
        conversationId={conversation?.id}
        isTest={contact.is_test}
        onCreated={(id) => { setSelected(id); void load(); }}
      />
    </div>
  );
}
