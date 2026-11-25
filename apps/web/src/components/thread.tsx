"use client";

import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Row } from "@despachante/shared";
import { useApp } from "@/lib/app-context";
import { useRealtime } from "@/lib/hooks";
import { uploadMedia } from "@/lib/media";
import { supabase } from "@/lib/supabase/client";
import { DayDivider, MessageBubble, TypingBubble, type Message } from "./chat";
import { Button, Select, Spinner, cx } from "./ui";

function dayLabel(d: Date) {
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "d 'de' MMMM", { locale: ptBR });
}

export async function approveDraft(m: Message, body?: string) {
  const { error } = await supabase().from("messages").update({ status: "queued", ...(body !== undefined ? { body } : {}) }).eq("id", m.id).eq("status", "draft");
  if (error) toast.error(error.message);
}
export async function discardDraft(m: Message) {
  await supabase().from("messages").update({ status: "discarded" }).eq("id", m.id);
}

export function Thread({
  conversation, perspective = "company", onShowRun, focusMessageId, className,
}: {
  conversation: Row<"conversations">;
  perspective?: "company" | "client";
  onShowRun?: (runId: string) => void;
  focusMessageId?: string | null;
  className?: string;
}) {
  const { channels, settings } = useApp();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [thinking, setThinking] = useState(false);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const { data } = await sb.from("messages").select("*").eq("conversation_id", conversation.id).order("created_at", { ascending: true }).limit(300);
    setMessages(data ?? []);
    const { data: run } = await sb.from("ai_runs").select("id").eq("conversation_id", conversation.id).eq("status", "running").limit(1);
    setThinking(!!run?.length);
  }, [conversation.id]);

  useEffect(() => {
    setMessages(null);
    void load();
    void supabase().from("profiles").select("id, full_name").then(({ data }) => setProfiles(new Map((data ?? []).map((p) => [p.id, p.full_name]))));
  }, [load]);

  useRealtime(
    "messages",
    (c) => {
      const row = c.new as Message;
      setMessages((prev) => {
        if (!prev) return prev;
        if (c.eventType === "DELETE") return prev.filter((m) => m.id !== (c.old as Message).id);
        const idx = prev.findIndex((m) => m.id === row.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = row;
          return copy;
        }
        return [...prev, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
    },
    `conversation_id=eq.${conversation.id}`,
  );
  useRealtime(
    "ai_runs",
    (c) => setThinking((c.new as Row<"ai_runs">).status === "running"),
    `conversation_id=eq.${conversation.id}`,
  );

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages?.length, thinking]);

  const channelMap = new Map(channels.map((c) => [c.id, c]));
  const visible = (messages ?? []).filter((m) => m.status !== "discarded" || perspective === "company");
  // no simulador (visão do cliente) rascunhos aparecem só como "pendentes"
  const lastIn = [...visible].reverse().find((m) => m.direction === "in");
  const waiting =
    !thinking && lastIn && (!conversation.ai_processed_until || lastIn.created_at > conversation.ai_processed_until) &&
    conversation.status !== "waiting_human" && conversation.mode !== "manual";

  return (
    <div className={cx("wa-wallpaper flex-1 overflow-y-auto px-4 py-4", className)}>
      {!messages ? (
        <div className="grid h-full place-items-center"><Spinner /></div>
      ) : (
        <div className="space-y-1.5">
          {visible.map((m, i) => {
            const prev = visible[i - 1];
            const d = new Date(m.created_at);
            const showDay = !prev || !isSameDay(new Date(prev.created_at), d);
            const isDraftForClient = perspective === "client" && m.status === "draft";
            return (
              <div key={m.id}>
                {showDay && <DayDivider label={dayLabel(d)} />}
                {isDraftForClient ? (
                  <div className="flex justify-start">
                    <div className="max-w-[78%] rounded-xl border border-dashed border-[#c4b5fd] bg-[#fbfaff] px-3 py-2 text-[13px] text-ink-2">
                      <div className="text-[11px] font-medium text-violet">Rascunho da IA · o cliente ainda não vê</div>
                      <div className="whitespace-pre-wrap">{m.body}</div>
                      <div className="mt-1.5 flex gap-1">
                        <Button size="xs" variant="success" onClick={() => approveDraft(m)}>Aprovar</Button>
                        <Button size="xs" variant="ghost" onClick={() => discardDraft(m)}>Descartar</Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <MessageBubble
                    m={m}
                    perspective={perspective}
                    channel={m.channel_id ? channelMap.get(m.channel_id) : null}
                    senderName={m.sender_profile_id ? profiles.get(m.sender_profile_id) : null}
                    assistantName={settings.assistant_name}
                    onApprove={perspective === "company" ? (x) => approveDraft(x) : undefined}
                    onDiscard={perspective === "company" ? discardDraft : undefined}
                    onEdit={perspective === "company" ? (x, body) => approveDraft(x, body) : undefined}
                    onShowRun={onShowRun}
                    highlight={m.id === focusMessageId}
                  />
                )}
              </div>
            );
          })}
          {thinking && <TypingBubble label={`${settings.assistant_name} está pensando…`} />}
          {waiting && !thinking && <TypingBubble label="aguardando o cliente terminar de digitar…" />}
          <div ref={bottom} />
        </div>
      )}
    </div>
  );
}

/** Caixa de envio da equipe (resposta humana) */
export function HumanComposer({ conversation }: { conversation: Row<"conversations"> }) {
  const { channels, userId } = useApp();
  const [text, setText] = useState("");
  const [channelId, setChannelId] = useState(conversation.last_channel_id ?? channels[0]?.id ?? "");
  const [sending, setSending] = useState(false);
  useEffect(() => setChannelId(conversation.last_channel_id ?? channels[0]?.id ?? ""), [conversation.last_channel_id, channels]);

  async function send(file?: File) {
    const body = text.trim();
    if (!body && !file) return;
    setText("");
    setSending(true);
    try {
      let media: { path: string; mime: string } | null = null;
      if (file) media = await uploadMedia(`outbound/${conversation.id}`, file, file.name);
      const kind = file ? (file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : "document") : "text";
      const { error } = await supabase().from("messages").insert({
        conversation_id: conversation.id,
        channel_id: channelId || null,
        direction: "out",
        sender: "human",
        sender_profile_id: userId,
        kind,
        body,
        media_path: media?.path ?? null,
        media_mime: media?.mime ?? null,
        media_name: file?.name ?? null,
        status: "queued",
      });
      if (error) throw new Error(error.message);
    } catch (e) {
      setText(body);
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-line bg-surface p-3">
      <div className="flex items-end gap-2">
        <label className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl text-lg hover:bg-surface-2" title="Anexar arquivo">
         
          <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && void send(e.target.files[0])} />
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Responder como atendente… (Enter envia, Shift+Enter quebra linha)"
          className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-brand focus:bg-surface"
        />
        <Select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-48 shrink-0" title="Enviar pelo número">
          {channels.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Button onClick={() => send()} loading={sending} disabled={!text.trim()}>Enviar</Button>
      </div>
    </div>
  );
}
