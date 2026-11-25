/**
 * Acesso aos modelos via API compatível com OpenAI (ex.: newapi).
 * Cada tarefa (atendimento, ensinar, visão, transcrição, embeddings)
 * pode usar um provedor/modelo diferente — configurado no painel.
 */
import { spawn } from "node:child_process";
import OpenAI, { toFile } from "openai";
import { db, must, type Row } from "../db";

export type Task = "atendimento" | "ensinar" | "visao" | "transcricao" | "embeddings";

export class NotConfiguredError extends Error {
  constructor(public task: Task) {
    super(`Nenhum modelo configurado para "${task}". Configure em Configurações → Inteligência Artificial.`);
  }
}

type CachedClient = { client: OpenAI; at: number; provider: Row<"ai_providers"> };
const cache = new Map<string, CachedClient>();
const TTL = 60_000;

export async function clientForProvider(providerId: string): Promise<CachedClient> {
  const hit = cache.get(providerId);
  if (hit && Date.now() - hit.at < TTL) return hit;
  const provider = must(await db.from("ai_providers").select("*").eq("id", providerId).single(), "provedor de IA");
  const { data: key, error } = await db.rpc("get_provider_key", { p_provider_id: providerId });
  if (error) throw new Error(`Não consegui ler a chave do provedor: ${error.message}`);
  if (!key) throw new Error(`O provedor "${provider.name}" está sem chave de API.`);
  const client = new OpenAI({
    apiKey: key,
    baseURL: provider.base_url.replace(/\/+$/, ""),
    timeout: 120_000,
    maxRetries: 1,
  });
  const entry = { client, at: Date.now(), provider };
  cache.set(providerId, entry);
  return entry;
}

export type TaskModel = {
  client: OpenAI;
  model: string;
  temperature: number;
  supportsVision: boolean;
  providerName: string;
};

export async function modelFor(task: Task): Promise<TaskModel> {
  const cfg = must(await db.from("ai_task_models").select("*").eq("task", task).single(), `modelo de ${task}`);
  if (!cfg.enabled || !cfg.provider_id || !cfg.model) throw new NotConfiguredError(task);
  const { client, provider } = await clientForProvider(cfg.provider_id);
  return {
    client,
    model: cfg.model,
    temperature: Number(cfg.temperature ?? 0.4),
    supportsVision: cfg.supports_vision,
    providerName: provider.name,
  };
}

export async function tryModelFor(task: Task): Promise<TaskModel | null> {
  try {
    return await modelFor(task);
  } catch (e) {
    if (e instanceof NotConfiguredError) return null;
    throw e;
  }
}

// ffmpeg (presente na imagem Docker) converte ogg/opus do WhatsApp e webm do navegador em wav
let ffmpegAvailable: boolean | null = null;
function hasFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return Promise.resolve(ffmpegAvailable);
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", ["-version"]);
    p.on("error", () => resolve((ffmpegAvailable = false)));
    p.on("close", (code) => resolve((ffmpegAvailable = code === 0)));
  });
}

function convertToWav(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", "16000", "-f", "wav", "pipe:1"]);
    const chunks: Buffer[] = [];
    p.stdout.on("data", (c: Buffer) => chunks.push(c));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg saiu com código ${code}`))));
    p.stdin.end(input);
  });
}

async function audioForChat(buffer: Buffer, mime: string): Promise<{ data: string; format: string }> {
  if (/wav/i.test(mime)) return { data: buffer.toString("base64"), format: "wav" };
  if (/mpeg|mp3/i.test(mime)) return { data: buffer.toString("base64"), format: "mp3" };
  if (await hasFfmpeg()) return { data: (await convertToWav(buffer)).toString("base64"), format: "wav" };
  // sem ffmpeg: tenta no formato original (alguns provedores aceitam ogg/webm)
  return { data: buffer.toString("base64"), format: mime.split("/")[1]?.split(";")[0] ?? "ogg" };
}

/**
 * Transcreve áudio. Dois caminhos:
 *  1. modelos Whisper/"transcribe" → endpoint /audio/transcriptions
 *  2. modelos multimodais (ex.: Gemini) → áudio dentro da mensagem de chat
 */
export async function transcribeAudio(buffer: Buffer, mime: string, name = "audio.ogg"): Promise<string | null> {
  const m = await tryModelFor("transcricao");
  if (!m) return null;
  if (/whisper|transcri/i.test(m.model)) {
    try {
      const file = await toFile(buffer, name, { type: mime });
      const res = await m.client.audio.transcriptions.create({ file, model: m.model, language: "pt" });
      const text = (res as { text?: string }).text?.trim();
      if (text) return text;
    } catch {
      /* cai para o caminho multimodal */
    }
  }
  const audio = await audioForChat(buffer, mime);
  const res = await m.client.chat.completions.create({
    model: m.model,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Transcreva exatamente o áudio a seguir, em português do Brasil. Responda apenas com a transcrição, sem comentários. Se não houver fala, responda: [sem fala]" },
          { type: "input_audio", input_audio: audio as never },
        ],
      },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || null;
}

export async function embed(text: string): Promise<{ vector: number[]; model: string } | null> {
  const m = await tryModelFor("embeddings");
  if (!m) return null;
  const res = await m.client.embeddings.create({ model: m.model, input: text.slice(0, 8000) });
  const vector = res.data?.[0]?.embedding;
  return vector ? { vector, model: m.model } : null;
}

/** Descreve uma imagem quando o modelo de atendimento não enxerga imagens. */
export async function describeImage(dataUrl: string): Promise<string | null> {
  const m = await tryModelFor("visao");
  if (!m) return null;
  const res = await m.client.chat.completions.create({
    model: m.model,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "Você descreve imagens enviadas por clientes de um despachante (documentos de veículo, CNH, comprovantes). " +
          "Diga que tipo de documento é e transcreva os dados legíveis relevantes (nomes, CPF, placa, Renavam, datas). " +
          "Se não for um documento, descreva em uma frase. Responda em português, em no máximo 6 linhas.",
      },
      { role: "user", content: [{ type: "image_url", image_url: { url: dataUrl } }] },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || null;
}

/** Converte **negrito** markdown para *negrito* do WhatsApp e remove títulos. */
export function toWhatsApp(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "_$1_")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extrai JSON de uma resposta de modelo (aceita ```json ... ```). */
export function parseJsonLoose<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
