"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MODE_INFO, formatPhone, normalizePhone, type Mode, type Row } from "@despachante/shared";
import { ContactPanel } from "@/components/contact-panel";
import { RunsPanel } from "@/components/raio-x";
import { Thread } from "@/components/thread";
import { Avatar, Badge, Button, Card, Field, Input, Select, Tabs, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { useRealtime } from "@/lib/hooks";
import { toWav } from "@/lib/audio";
import { uploadMedia } from "@/lib/media";
import { supabase } from "@/lib/supabase/client";

// contato conversa é 1:1 (contact_id único), então o Supabase devolve um objeto, não uma lista
type TestContact = Row<"contacts"> & { conversations: Row<"conversations"> | Row<"conversations">[] | null };
const convOf = (c?: TestContact) => (c ? (Array.isArray(c.conversations) ? c.conversations[0] : c.conversations) ?? null : null);

const IDEAS = [
  "Oi, boa tarde! Comprei um carro e quero passar pro meu nome",
  "Quanto custa pra licenciar minha moto?",
  "Minha CNH venceu, o que preciso fazer?",
  "A placa é ABC1D23 e o renavam 00639865755",
  "Meu nome é Ana Souza, CPF 529.982.247-25",
  "Pode mandar o PIX, aceito o orçamento",
  "Já saiu meu documento?",
  "Quero falar com uma pessoa",
];

function randomPhone() {
  return `41 9${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`;
}

export default function SimulatorPage() {
  const { channels, settings } = useApp();
  const simChannels = channels.filter((c) => c.active);
  const [contacts, setContacts] = useState<TestContact[]>([]);
  const [contactId, setContactId] = useState<string>("");
  const [channelId, setChannelId] = useState<string>(simChannels[0]?.id ?? "");
  const [conversation, setConversation] = useState<Row<"conversations"> | null>(null);
  const [newName, setNewName] = useState("Cliente Teste");
  const [newPhone, setNewPhone] = useState(randomPhone());
  const [panel, setPanel] = useState<"raiox" | "crm">("raiox");

  const loadContacts = useCallback(async () => {
    const { data } = await supabase()
      .from("contacts")
      .select("*, conversations!inner(*)")
      .eq("is_test", true)
      .is("conversations.scenario_id", null)
      .order("created_at", { ascending: false })
      .limit(50);
    const list = (data ?? []) as unknown as TestContact[];
    setContacts(list);
    return list;
  }, []);

  useEffect(() => {
    void loadContacts().then((list) => {
      if (list[0]) setContactId((cur) => cur || list[0].id);
    });
  }, [loadContacts]);

  useEffect(() => {
    setConversation(convOf(contacts.find((x) => x.id === contactId)));
  }, [contactId, contacts]);

  useRealtime(
    "conversations",
    (c) => setConversation((prev) => (prev && (c.new as Row<"conversations">).id === prev.id ? (c.new as Row<"conversations">) : prev)),
    conversation ? `id=eq.${conversation.id}` : undefined,
    !!conversation,
  );

  async function createContact() {
    const phone = normalizePhone(newPhone);
    if (!phone) return toast.error("Telefone inválido");
    const sb = supabase();
    let { data: contact } = await sb.from("contacts").select("*").eq("phone", phone).eq("is_test", true).maybeSingle();
    if (!contact) {
      const ins = await sb.from("contacts").insert({ phone, wa_name: newName.trim() || null, is_test: true }).select("*").single();
      if (ins.error) return toast.error(ins.error.message);
      contact = ins.data;
    }
    const { data: conv } = await sb.from("conversations").select("id").eq("contact_id", contact.id).maybeSingle();
    if (!conv) {
      const r = await sb.from("conversations").insert({ contact_id: contact.id, is_test: true, last_channel_id: channelId || null });
      if (r.error) return toast.error(r.error.message);
    }
    await loadContacts();
    setContactId(contact.id);
    setNewPhone(randomPhone());
    toast.success("Cliente de teste pronto! Mande uma mensagem");
  }

  async function resetConversation() {
    const c = contacts.find((x) => x.id === contactId);
    if (!c || !confirm("Apagar a conversa, os casos e os clientes de teste deste contato?")) return;
    const sb = supabase();
    const { data: links } = await sb.from("contact_clients").select("client_id").eq("contact_id", c.id);
    await sb.from("cases").delete().eq("contact_id", c.id);
    await sb.from("contacts").delete().eq("id", c.id);
    const ids = (links ?? []).map((l) => l.client_id);
    if (ids.length) await sb.from("clients").delete().in("id", ids).eq("is_test", true);
    const { data: contact } = await sb.from("contacts").insert({ phone: c.phone, wa_name: c.wa_name, is_test: true }).select("*").single();
    if (contact) await sb.from("conversations").insert({ contact_id: contact.id, is_test: true, last_channel_id: channelId || null });
    await loadContacts();
    if (contact) setContactId(contact.id);
    toast.success("Conversa zerada");
  }

  async function setMode(mode: string) {
    if (!conversation) return;
    await supabase().from("conversations").update({ mode: (mode || null) as Mode | null }).eq("id", conversation.id);
    setConversation({ ...conversation, mode: (mode || null) as Mode | null });
  }

  const contact = contacts.find((x) => x.id === contactId);
  const channel = simChannels.find((c) => c.id === channelId);

  return (
    <div className="flex h-screen gap-5 overflow-hidden p-5">
      {/* controles */}
      <div className="flex w-[300px] shrink-0 flex-col gap-4 overflow-y-auto">
        <div>
          <h1 className="text-2xl font-black">Simulador</h1>
          <p className="text-sm text-ink-2">Converse como se fosse o cliente. Passa pelo mesmo caminho do WhatsApp real.</p>
        </div>

        <Card className="space-y-3 p-4">
          <Field label="Quem está falando">
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              {!contacts.length && <option value="">— crie um cliente de teste —</option>}
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.wa_name || "Sem nome"} · {formatPhone(c.phone)}</option>
              ))}
            </Select>
          </Field>
          <details className="rounded-xl bg-surface-2 p-3">
            <summary className="cursor-pointer text-sm font-bold">+ Novo cliente de teste</summary>
            <div className="mt-3 space-y-2">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome no WhatsApp" />
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Telefone" />
              <Button size="sm" className="w-full" onClick={createContact}>Criar e conversar</Button>
            </div>
          </details>
          <Field label="Para qual número da empresa" hint="Teste a unificação: mande mensagens por números diferentes.">
            <Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              {simChannels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          {conversation && (
            <Field label="Modo da IA nesta conversa">
              <Select value={conversation.mode ?? ""} onChange={(e) => setMode(e.target.value)}>
                <option value="">Herdar ({MODE_INFO[settings.default_mode as Mode].label})</option>
                {(Object.keys(MODE_INFO) as Mode[]).map((m) => <option key={m} value={m}>{MODE_INFO[m].label}</option>)}
              </Select>
            </Field>
          )}
          {conversation && (
            <div className="flex gap-2">
              <Button size="sm" variant="sun" className="flex-1" onClick={() => supabase().rpc("run_job_now", { p_dedupe_key: `conv:${conversation.id}` })} title="Não esperar o agrupamento de mensagens">
                Responder já
              </Button>
              <Button size="sm" variant="secondary" onClick={resetConversation} title="Zerar a conversa de teste"></Button>
            </div>
          )}
          {conversation?.status === "waiting_human" && (
            <div className="rounded-lg border border-[#fde68a] bg-sun-soft p-2 text-xs text-sun">
              A IA transferiu para humano.{" "}
              <button className="underline" onClick={() => supabase().from("conversations").update({ status: "open", handoff_reason: null, handoff_summary: null }).eq("id", conversation.id)}>Devolver para IA</button>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-2 text-sm font-extrabold">Experimente</div>
          <div className="flex flex-wrap gap-1.5">
            {IDEAS.map((i) => (
              <button key={i} onClick={() => window.dispatchEvent(new CustomEvent("sim-fill", { detail: i }))} className="rounded-xl border border-line bg-surface-2 px-2.5 py-1.5 text-left text-xs font-semibold hover:border-brand hover:text-brand">
                {i}
              </button>
            ))}
          </div>
          <div className="mt-3 text-[11px] text-ink-3">
            Agrupamento no teste: {settings.test_debounce_seconds}s (no real: {settings.debounce_seconds}s). Ajuste em Configurações → Atendimento.
          </div>
        </Card>
      </div>

      {/* celular */}
      <div className="flex shrink-0 items-center justify-center">
        <div className="relative flex h-[min(760px,calc(100vh-40px))] w-[390px] flex-col overflow-hidden rounded-[44px] border-[8px] border-[#1f2937] bg-[#1f2937] shadow-[var(--shadow-pop)]">
          <div className="absolute left-1/2 top-1.5 z-10 h-5 w-28 -translate-x-1/2 rounded-full bg-ink" />
          <div className="flex items-center gap-3 bg-[#075e54] px-4 pb-3 pt-7 text-white">
            <Avatar name={settings.company_name} size={36} />
            <div className="min-w-0 leading-tight">
              <div className="truncate font-extrabold">{settings.company_name}</div>
              <div className="truncate text-[11px] text-white/75">{channel?.name ?? "—"} · online</div>
            </div>
          </div>
          {conversation ? (
            <>
              <Thread conversation={conversation} perspective="client" className="rounded-none" />
              <ClientComposer conversation={conversation} channelId={channelId} />
            </>
          ) : (
            <div className="wa-wallpaper grid flex-1 place-items-center p-6 text-center text-sm text-ink-2">
              Crie um cliente de teste ao lado para começar
            </div>
          )}
        </div>
      </div>

      {/* raio-x / crm */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center gap-3 border-b border-line p-3">
          <Tabs value={panel} onChange={setPanel} tabs={[{ value: "raiox", label: "Raio-X da IA" }, { value: "crm", label: "CRM ao vivo" }]} />
          {contact && <Badge tone="violet" className="ml-auto">dados de teste</Badge>}
        </div>
        <div className={cx("flex-1 overflow-y-auto p-4", panel === "crm" && "bg-bg")}>
          {!conversation || !contact ? (
            <div className="py-10 text-center text-sm text-ink-3">Comece uma conversa para ver as decisões da IA aqui.</div>
          ) : panel === "raiox" ? (
            <RunsPanel conversationId={conversation.id} />
          ) : (
            <ContactPanel contactId={contact.id} conversation={conversation} />
          )}
        </div>
      </div>
    </div>
  );
}

function ClientComposer({ conversation, channelId }: { conversation: Row<"conversations">; channelId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    const onFill = (e: Event) => setText((e as CustomEvent<string>).detail);
    window.addEventListener("sim-fill", onFill);
    return () => window.removeEventListener("sim-fill", onFill);
  }, []);

  async function send(kind: "text" | "image" | "audio" | "document", file?: Blob, name?: string) {
    const body = kind === "audio" ? "" : text.trim();
    if (kind === "text" && !body) return;
    // limpa na hora: quem digita rápido não "gruda" a próxima mensagem nesta
    if (kind !== "audio") setText("");
    setBusy(true);
    try {
      let media: { path: string; mime: string } | null = null;
      if (file) media = await uploadMedia(`sim/${conversation.id}`, file, name ?? "arquivo");
      const { error } = await supabase().from("messages").insert({
        conversation_id: conversation.id,
        channel_id: channelId || null,
        direction: "in",
        sender: "contact",
        kind,
        body,
        media_path: media?.path ?? null,
        media_mime: media?.mime ?? null,
        media_name: name ?? null,
      });
      if (error) throw new Error(error.message);
    } catch (e) {
      if (body) setText(body);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecord() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const raw = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        try {
          void send("audio", await toWav(raw), "audio.wav");
        } catch {
          void send("audio", raw, `audio.${(rec.mimeType || "audio/webm").includes("ogg") ? "ogg" : "webm"}`);
        }
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      toast.error("Não consegui acessar o microfone.");
    }
  }

  return (
    <div className="flex items-end gap-1.5 bg-[#f0f0f0] p-2">
      <label className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-lg hover:bg-black/5" title="Enviar foto/arquivo">
       
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void send(f.type.startsWith("image/") ? "image" : "document", f, f.name);
            e.target.value = "";
          }}
        />
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send("text");
          }
        }}
        rows={1}
        placeholder={recording ? "gravando… clique no microfone para enviar" : "Mensagem"}
        className="max-h-28 min-h-10 flex-1 resize-none rounded-3xl bg-white px-4 py-2.5 text-sm outline-none"
      />
      {text.trim() ? (
        <button onClick={() => send("text")} disabled={busy} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#00a884] text-white disabled:opacity-50" title="Enviar">
          ➤
        </button>
      ) : (
        <button onClick={toggleRecord} className={cx("grid size-10 shrink-0 place-items-center rounded-full text-white", recording ? "animate-pulse bg-coral" : "bg-[#00a884]")} title="Gravar áudio">
         
        </button>
      )}
    </div>
  );
}
