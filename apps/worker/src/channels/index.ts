/**
 * Adaptadores de canal. Cada número de WhatsApp é um "channel".
 *
 *  - simulator: usado pelo Simulador do painel. "Enviar" = marcar como enviado
 *    (o painel mostra a mensagem no celular de mentira em tempo real).
 *  - evolution: integração com a Evolution API (a fazer). A interface já está
 *    pronta: implementar `send` e o webhook em `ingest.ts`.
 */
import type { Row } from "../db";

export type OutgoingMessage = Pick<Row<"messages">, "id" | "kind" | "body" | "media_path" | "media_mime" | "media_name">;

export type SendResult = { ok: true; externalId?: string } | { ok: false; error: string; retryable?: boolean };

export interface ChannelAdapter {
  kind: string;
  send(channel: Row<"channels">, to: string, message: OutgoingMessage): Promise<SendResult>;
}

const simulator: ChannelAdapter = {
  kind: "simulator",
  async send() {
    return { ok: true, externalId: `sim-${Date.now()}` };
  },
};

const evolution: ChannelAdapter = {
  kind: "evolution",
  async send() {
    // TODO(Evolution): POST {baseUrl}/message/sendText/{instance} com apikey do channel.config
    return { ok: false, error: "Integração com a Evolution API ainda não foi ativada.", retryable: false };
  },
};

const adapters: Record<string, ChannelAdapter> = { simulator, evolution };

export function adapterFor(channel: Row<"channels"> | null | undefined): ChannelAdapter {
  return adapters[channel?.kind ?? "simulator"] ?? simulator;
}
