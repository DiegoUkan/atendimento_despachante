/**
 * Entrada de mensagens vindas de canais reais (Evolution API, no futuro).
 * Identifica o cliente pelo telefone (com/sem 9º dígito), cria contato e
 * conversa única se necessário, guarda a mídia e grava a mensagem.
 * O gatilho do banco agenda a IA automaticamente.
 */
import { normalizePhone, phoneVariants } from "@despachante/shared";
import { randomUUID } from "node:crypto";
import { db, must } from "../db";

export type InboundPayload = {
  channelId: string;
  phone: string;
  pushName?: string | null;
  kind: "text" | "image" | "audio" | "video" | "document" | "sticker" | "location" | "other";
  body?: string;
  media?: { buffer: Buffer; mime: string; name?: string };
  externalId?: string;
};

export async function ingestInbound(p: InboundPayload) {
  const phone = normalizePhone(p.phone);
  if (!phone) throw new Error(`Telefone inválido: ${p.phone}`);

  // evita duplicidade quando o provedor reenvia o mesmo evento
  if (p.externalId) {
    const { data: dup } = await db.from("messages").select("id").eq("external_id", p.externalId).maybeSingle();
    if (dup) return { duplicated: true, messageId: dup.id };
  }

  const { data: found } = await db
    .from("contacts")
    .select("*")
    .in("phone", phoneVariants(phone))
    .eq("is_test", false)
    .limit(1)
    .maybeSingle();

  let contact = found;
  if (!contact) {
    contact = must(
      await db.from("contacts").insert({ phone, wa_name: p.pushName ?? null }).select("*").single(),
      "criar contato",
    );
  } else if (p.pushName && p.pushName !== contact.wa_name) {
    await db.from("contacts").update({ wa_name: p.pushName }).eq("id", contact.id);
  }

  let { data: conv } = await db.from("conversations").select("*").eq("contact_id", contact.id).maybeSingle();
  if (!conv) {
    conv = must(
      await db.from("conversations").insert({ contact_id: contact.id, last_channel_id: p.channelId }).select("*").single(),
      "criar conversa",
    );
  }

  let mediaPath: string | null = null;
  if (p.media) {
    const ext = (p.media.name?.split(".").pop() ?? p.media.mime.split("/")[1] ?? "bin").split(";")[0];
    mediaPath = `inbound/${conv.id}/${randomUUID()}.${ext}`;
    const up = await db.storage.from("media").upload(mediaPath, p.media.buffer, { contentType: p.media.mime });
    if (up.error) throw new Error(`Falha ao salvar mídia: ${up.error.message}`);
  }

  const msg = must(
    await db
      .from("messages")
      .insert({
        conversation_id: conv.id,
        channel_id: p.channelId,
        direction: "in",
        sender: "contact",
        kind: p.kind,
        body: p.body ?? "",
        media_path: mediaPath,
        media_mime: p.media?.mime ?? null,
        media_name: p.media?.name ?? null,
        external_id: p.externalId ?? null,
      })
      .select("id")
      .single(),
    "gravar mensagem",
  );
  return { duplicated: false, messageId: msg.id, conversationId: conv.id };
}
