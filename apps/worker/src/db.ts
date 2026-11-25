import { createClient } from "@supabase/supabase-js";
import type { Database, Row } from "@despachante/shared";
import { env } from "./env";

/** Cliente com service_role: ignora RLS. Só existe no worker. */
export const db = createClient<Database>(env.supabaseUrl, env.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type Db = typeof db;
export type { Row };

/** Lança erro amigável quando uma query do Supabase falha */
export function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null || res.data === undefined) throw new Error(`${what}: não encontrado`);
  return res.data as NonNullable<T>;
}

export async function getSettings(): Promise<Row<"settings">> {
  return must(await db.from("settings").select("*").eq("id", 1).single(), "configurações");
}

export async function downloadMedia(path: string): Promise<{ buffer: Buffer; mime: string }> {
  const { data, error } = await db.storage.from("media").download(path);
  if (error || !data) throw new Error(`Falha ao baixar mídia ${path}: ${error?.message}`);
  return { buffer: Buffer.from(await data.arrayBuffer()), mime: data.type || "application/octet-stream" };
}

export const log = {
  info: (...a: unknown[]) => console.log(new Date().toISOString(), "·", ...a),
  warn: (...a: unknown[]) => console.warn(new Date().toISOString(), "⚠", ...a),
  error: (...a: unknown[]) => console.error(new Date().toISOString(), "✖", ...a),
};
