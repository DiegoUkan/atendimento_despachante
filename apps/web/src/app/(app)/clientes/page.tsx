"use client";

import { Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  RELATION_LABELS, formatCpfCnpj, formatPhone, normalizePhone, normalizePlate, validateField, type Row,
} from "@despachante/shared";
import { Markdown, MarkdownEditor } from "@/components/markdown";
import { Plate } from "@/components/plate";
import { Avatar, Badge, Button, Card, Dot, Drawer, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Switch } from "@/components/ui";
import { shortDate } from "@/lib/format";
import { useDebounced, useUrlParam } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

type ClientRow = Row<"clients"> & {
  contact_clients: { relation: string; verified: boolean; contact: Row<"contacts"> | null }[];
  vehicles: Row<"vehicles">[];
  cases: { id: string; closed_at: string | null }[];
};

export default function ClientsPage() {
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [showTests, setShowTests] = useState(false);
  const [selected, setSelected] = useUrlParam("id");
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search, 300);

  const load = useCallback(async () => {
    let query = supabase()
      .from("clients")
      .select("*, contact_clients(relation, verified, contact:contacts(*)), vehicles(*), cases(id, closed_at)")
      .eq("is_test", showTests)
      .order("updated_at", { ascending: false })
      .limit(200);
    const s = q.trim();
    if (s) {
      const digits = s.replace(/\D/g, "");
      query = digits.length >= 3 ? query.or(`name.ilike.%${s}%,doc.ilike.%${digits}%`) : query.ilike("name", `%${s}%`);
    }
    const { data } = await query;
    let list = (data ?? []) as unknown as ClientRow[];
    // busca por placa ou telefone
    if (s && !list.length) {
      const plate = normalizePlate(s);
      const phone = s.replace(/\D/g, "");
      const [{ data: vs }, { data: cs }] = await Promise.all([
        plate.length >= 3 ? supabase().from("vehicles").select("client_id").ilike("plate", `%${plate}%`) : Promise.resolve({ data: [] as { client_id: string | null }[] }),
        phone.length >= 4 ? supabase().from("contacts").select("contact_clients(client_id)").ilike("phone", `%${phone}%`) : Promise.resolve({ data: [] as { contact_clients: { client_id: string }[] }[] }),
      ]);
      const ids = new Set<string>([
        ...(vs ?? []).map((v) => v.client_id).filter(Boolean) as string[],
        ...((cs ?? []) as { contact_clients: { client_id: string }[] }[]).flatMap((c) => c.contact_clients.map((x) => x.client_id)),
      ]);
      if (ids.size) {
        const { data: more } = await supabase().from("clients").select("*, contact_clients(relation, verified, contact:contacts(*)), vehicles(*), cases(id, closed_at)").in("id", [...ids]);
        list = (more ?? []) as unknown as ClientRow[];
      }
    }
    setRows(list);
  }, [q, showTests]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-7xl p-8">
      <PageHeader
        icon={Users}
        title="Clientes"
        subtitle="Titulares dos serviços (pessoa física ou empresa), com telefones, veículos e casos."
        actions={
          <>
            <Input placeholder="Nome, CPF/CNPJ, placa ou telefone…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72" />
            <Switch checked={showTests} onChange={setShowTests} label={<span className="text-xs">Testes</span>} />
            <Button onClick={() => setCreating(true)}>+ Novo cliente</Button>
          </>
        }
      />
      <Card>
        {!rows ? (
          <div className="grid place-items-center py-16"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum cliente encontrado" description="Os clientes são criados automaticamente quando a IA identifica alguém, ou manualmente aqui." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-3">
                <th className="px-5 py-3">Cliente</th>
                <th className="px-3 py-3">Documento</th>
                <th className="px-3 py-3">Telefones</th>
                <th className="px-3 py-3">Veículos</th>
                <th className="px-3 py-3">Casos</th>
                <th className="px-5 py-3 text-right">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const open = c.cases.filter((x) => !x.closed_at).length;
                return (
                  <tr key={c.id} onClick={() => setSelected(c.id)} className="cursor-pointer border-b border-line/60 transition hover:bg-surface-2">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.name} size={34} />
                        <div>
                          <div className="font-extrabold">{c.name}</div>
                          <div className="text-xs text-ink-3">{c.kind === "pj" ? "Empresa" : "Pessoa física"}{c.tags.length ? ` · ${c.tags.join(", ")}` : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-ink-2">{c.doc ? formatCpfCnpj(c.doc) : "—"}</td>
                    <td className="px-3 py-3">
                      {c.contact_clients.filter((l) => l.contact).map((l) => (
                        <div key={l.contact!.id} className="text-xs">{formatPhone(l.contact!.phone)} {!l.verified && <span title="vínculo não verificado" className="text-sun">· não verificado</span>}</div>
                      ))}
                    </td>
                    <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{c.vehicles.slice(0, 3).map((v) => <Plate key={v.id} plate={v.plate} size="xs" />)}</div></td>
                    <td className="px-3 py-3">{open ? <Badge tone="brand">{open} em andamento</Badge> : <span className="text-ink-3">{c.cases.length || "—"}</span>}</td>
                    <td className="px-5 py-3 text-right text-xs text-ink-3">{shortDate(c.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Cliente" width="max-w-2xl">
        {selected && <ClientDetail id={selected} onChanged={load} />}
      </Drawer>
      <NewClientModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => { void load(); setSelected(id); }} />
    </div>
  );
}

function NewClientModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("pf");
  const [doc, setDoc] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    let docValue: string | null = null;
    if (doc.trim()) {
      const v = validateField("cpf_cnpj", doc);
      if (!v.ok) return toast.error(v.error);
      docValue = v.value;
    }
    setSaving(true);
    const sb = supabase();
    const { data, error } = await sb.from("clients").insert({ name: name.trim(), kind, doc: docValue }).select("id").single();
    if (error || !data) {
      setSaving(false);
      return toast.error(error?.message.includes("duplicate") ? "Já existe um cliente com esse CPF/CNPJ." : error?.message);
    }
    const p = normalizePhone(phone);
    if (p) {
      let { data: contact } = await sb.from("contacts").select("id").eq("phone", p).eq("is_test", false).maybeSingle();
      if (!contact) contact = (await sb.from("contacts").insert({ phone: p, name: name.trim() }).select("id").single()).data;
      if (contact) await sb.from("contact_clients").insert({ contact_id: contact.id, client_id: data.id, relation: "titular", verified: true, is_primary: true });
    }
    setSaving(false);
    setName(""); setDoc(""); setPhone("");
    onClose();
    onCreated(data.id);
  }
  return (
    <Modal open={open} onClose={onClose} title="Novo cliente" size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save} loading={saving} disabled={!name.trim()}>Salvar</Button></>}>
      <div className="space-y-3">
        <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo"><Select value={kind} onChange={(e) => setKind(e.target.value)}><option value="pf">Pessoa física</option><option value="pj">Empresa</option></Select></Field>
          <Field label="CPF/CNPJ"><Input value={doc} onChange={(e) => setDoc(e.target.value)} /></Field>
        </div>
        <Field label="WhatsApp" hint="Opcional. A conversa desse número fica ligada ao cliente."><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(41) 99999-8888" /></Field>
      </div>
    </Modal>
  );
}

function ClientDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [c, setC] = useState<Row<"clients"> | null>(null);
  const [links, setLinks] = useState<{ relation: string; verified: boolean; is_primary: boolean; contact: Row<"contacts"> }[]>([]);
  const [vehicles, setVehicles] = useState<Row<"vehicles">[]>([]);
  const [cases, setCases] = useState<(Row<"cases"> & { service: Row<"services">; stage: Row<"service_stages"> })[]>([]);
  const [newPhone, setNewPhone] = useState("");
  const [newPlate, setNewPlate] = useState("");

  const load = useCallback(async () => {
    const sb = supabase();
    const [cl, ln, vh, cs] = await Promise.all([
      sb.from("clients").select("*").eq("id", id).single(),
      sb.from("contact_clients").select("relation, verified, is_primary, contact:contacts(*)").eq("client_id", id),
      sb.from("vehicles").select("*").eq("client_id", id).order("created_at"),
      sb.from("cases").select("*, service:services(*), stage:service_stages(*)").eq("client_id", id).order("created_at", { ascending: false }),
    ]);
    setC(cl.data);
    setLinks(((ln.data ?? []) as unknown as typeof links).filter((l) => l.contact));
    setVehicles(vh.data ?? []);
    setCases((cs.data ?? []) as unknown as typeof cases);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!c) return <div className="grid place-items-center py-16"><Spinner /></div>;

  async function save(patch: Partial<Row<"clients">>) {
    const { error } = await supabase().from("clients").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Salvo");
    void load();
    onChanged();
  }

  async function addPhone() {
    const p = normalizePhone(newPhone);
    if (!p) return toast.error("Telefone inválido");
    const sb = supabase();
    let { data: contact } = await sb.from("contacts").select("id").eq("phone", p).eq("is_test", c!.is_test).maybeSingle();
    if (!contact) contact = (await sb.from("contacts").insert({ phone: p, is_test: c!.is_test }).select("id").single()).data;
    if (!contact) return;
    const { error } = await sb.from("contact_clients").insert({ contact_id: contact.id, client_id: id, relation: "titular", verified: true, is_primary: links.length === 0 });
    if (error) return toast.error(error.message.includes("duplicate") ? "Esse telefone já está vinculado." : error.message);
    setNewPhone("");
    void load();
  }

  async function addVehicle() {
    const v = validateField("plate", newPlate);
    if (!v.ok) return toast.error(v.error);
    await supabase().from("vehicles").insert({ plate: v.value, client_id: id, is_test: c!.is_test });
    setNewPlate("");
    void load();
  }

  return (
    <div className="space-y-6">
      <ClientForm c={c} onSave={save} />

      <section>
        <h3 className="mb-2 font-extrabold">Telefones (contatos)</h3>
        <div className="space-y-1.5">
          {links.map((l) => (
            <div key={l.contact.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">{formatPhone(l.contact.phone)}</div>
                <div className="text-xs text-ink-3">{l.contact.wa_name ?? l.contact.name ?? ""}</div>
              </div>
              <Select
                value={l.relation}
                className="h-8 w-40"
                onChange={async (e) => { await supabase().from("contact_clients").update({ relation: e.target.value }).eq("contact_id", l.contact.id).eq("client_id", id); void load(); }}
              >
                {Object.entries(RELATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
              <button onClick={async () => { await supabase().from("contact_clients").update({ verified: !l.verified }).eq("contact_id", l.contact.id).eq("client_id", id); void load(); }}>
                {l.verified ? <Badge tone="mint">verificado</Badge> : <Badge tone="sun">verificar</Badge>}
              </button>
              <button className="text-ink-3 hover:text-coral" title="Desvincular" onClick={async () => { await supabase().from("contact_clients").delete().eq("contact_id", l.contact.id).eq("client_id", id); void load(); }}>×</button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Adicionar telefone…" />
            <Button variant="secondary" onClick={addPhone}>Adicionar</Button>
          </div>
          <p className="text-xs text-ink-3">Vínculo não verificado = a IA não revela dados dos casos deste cliente para esse telefone.</p>
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-extrabold">Veículos</h3>
        <div className="space-y-1.5">
          {vehicles.map((v) => (
            <div key={v.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2">
              <Plate plate={v.plate} />
              <div className="flex-1 text-xs text-ink-2">{[v.model, v.year, v.renavam && `Renavam ${v.renavam}`].filter(Boolean).join(" · ") || "—"}</div>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={newPlate} onChange={(e) => setNewPlate(e.target.value)} placeholder="Placa (ABC1D23)" />
            <Button variant="secondary" onClick={addVehicle}>Adicionar</Button>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-extrabold">Casos</h3>
        {cases.length === 0 ? (
          <div className="text-sm text-ink-3">Nenhum caso.</div>
        ) : (
          <div className="space-y-1.5">
            {cases.map((k) => (
              <Link key={k.id} href={`/casos?s=${k.service_id}&id=${k.id}`} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm hover:border-brand">
                <Dot color={k.service.color} />
                <b>{k.code}</b>
                <span className="text-ink-2">{k.service.name}</span>
                <span className="ml-auto rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: k.stage.color }}>{k.stage.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <ClientNotes c={c} onSave={save} />
    </div>
  );
}

function ClientForm({ c, onSave }: { c: Row<"clients">; onSave: (p: Partial<Row<"clients">>) => void }) {
  const [f, setF] = useState({ name: c.name, kind: c.kind, doc: c.doc ? formatCpfCnpj(c.doc) : "", email: c.email ?? "", city: c.city ?? "", address: c.address ?? "", tags: c.tags.join(", ") });
  function submit() {
    let doc: string | null = null;
    if (f.doc.trim()) {
      const v = validateField("cpf_cnpj", f.doc);
      if (!v.ok) return toast.error(v.error);
      doc = v.value;
    }
    onSave({ name: f.name.trim(), kind: f.kind, doc, email: f.email || null, city: f.city || null, address: f.address || null, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean) });
  }
  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome" className="col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Tipo"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="pf">Pessoa física</option><option value="pj">Empresa</option></Select></Field>
        <Field label="CPF/CNPJ"><Input value={f.doc} onChange={(e) => setF({ ...f, doc: e.target.value })} /></Field>
        <Field label="E-mail"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Cidade"><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
        <Field label="Endereço" className="col-span-2"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="Etiquetas" hint="Separadas por vírgula. Ex.: lojista, VIP" className="col-span-2"><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
      </div>
      <Button onClick={submit}>Salvar dados</Button>
    </section>
  );
}

function ClientNotes({ c, onSave }: { c: Row<"clients">; onSave: (p: Partial<Row<"clients">>) => void }) {
  const [team, setTeam] = useState(c.team_notes_md);
  return (
    <section className="space-y-3">
      <h3 className="font-extrabold">Notas do cliente</h3>
      <div>
        <div className="mb-1 text-sm font-bold">Notas da equipe</div>
        <MarkdownEditor value={team} onChange={setTeam} rows={5} placeholder="Ex.: Lojista da Av. Brasil. Sempre manda os documentos pelo número do financeiro." />
        <Button className="mt-2" variant="secondary" onClick={() => onSave({ team_notes_md: team })}>Salvar notas</Button>
      </div>
      <div className="rounded-xl border border-dashed border-violet/40 bg-violet-soft/40 p-3">
        <div className="mb-1 text-sm font-bold">Notas da IA</div>
        <Markdown>{c.ai_notes_md}</Markdown>
      </div>
    </section>
  );
}
