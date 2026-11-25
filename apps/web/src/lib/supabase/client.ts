"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@despachante/shared";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** Cliente do navegador (usa a sessão do usuário; RLS aplica). */
export function supabase() {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
  }
  return client;
}

export type SB = ReturnType<typeof supabase>;
