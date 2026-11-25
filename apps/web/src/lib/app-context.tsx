"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Row } from "@despachante/shared";
import { supabase } from "./supabase/client";

type AppState = {
  userId: string;
  profile: Row<"profiles">;
  settings: Row<"settings">;
  channels: Row<"channels">[];
  isOwner: boolean;
  refreshSettings: () => Promise<void>;
  refreshChannels: () => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp fora do AppProvider");
  return v;
}

type Status = { kind: "loading" } | { kind: "inactive"; email: string } | { kind: "error"; message: string } | { kind: "ready"; state: Omit<AppState, "refreshSettings" | "refreshChannels"> };

export function AppProvider({ children, fallback, inactive }: {
  children: ReactNode;
  fallback: ReactNode;
  inactive: (email: string) => ReactNode;
}) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  const load = useCallback(async () => {
    const sb = supabase();
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) {
      window.location.href = "/login";
      return;
    }
    const { data: profile } = await sb.from("profiles").select("*").eq("id", auth.user.id).maybeSingle();
    if (!profile || !profile.active) {
      setStatus({ kind: "inactive", email: auth.user.email ?? "" });
      return;
    }
    const [{ data: settings, error }, { data: channels }] = await Promise.all([
      sb.from("settings").select("*").eq("id", 1).single(),
      sb.from("channels").select("*").order("created_at"),
    ]);
    if (error || !settings) {
      setStatus({ kind: "error", message: error?.message ?? "Configurações não encontradas" });
      return;
    }
    setStatus({
      kind: "ready",
      state: { userId: auth.user.id, profile, settings, channels: channels ?? [], isOwner: profile.role === "owner" },
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshSettings = useCallback(async () => {
    const { data } = await supabase().from("settings").select("*").eq("id", 1).single();
    if (data) setStatus((s) => (s.kind === "ready" ? { ...s, state: { ...s.state, settings: data } } : s));
  }, []);

  const refreshChannels = useCallback(async () => {
    const { data } = await supabase().from("channels").select("*").order("created_at");
    setStatus((s) => (s.kind === "ready" ? { ...s, state: { ...s.state, channels: data ?? [] } } : s));
  }, []);

  if (status.kind === "loading") return <>{fallback}</>;
  if (status.kind === "inactive") return <>{inactive(status.email)}</>;
  if (status.kind === "error")
    return <div className="p-10 text-center text-coral">Erro ao carregar: {status.message}</div>;
  return <Ctx.Provider value={{ ...status.state, refreshSettings, refreshChannels }}>{children}</Ctx.Provider>;
}
