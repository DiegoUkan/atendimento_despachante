"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase/client";

const cache = new Map<string, { url: string; at: number }>();
const TTL = 50 * 60 * 1000;

/** URL assinada (bucket privado) com cache em memória */
export async function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL) return hit.url;
  const { data } = await supabase().storage.from("media").createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, at: Date.now() });
  return data.signedUrl;
}

export function useSignedUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(path ? cache.get(path)?.url ?? null : null);
  useEffect(() => {
    let alive = true;
    if (!path) return;
    void signedUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

export async function uploadMedia(folder: string, file: Blob, name: string): Promise<{ path: string; mime: string }> {
  const ext = (name.split(".").pop() || file.type.split("/")[1] || "bin").split(";")[0];
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase().storage.from("media").upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return { path, mime: file.type || "application/octet-stream" };
}
