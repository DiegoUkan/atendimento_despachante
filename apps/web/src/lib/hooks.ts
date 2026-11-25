"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase/client";

type Change = { eventType: "INSERT" | "UPDATE" | "DELETE"; new: Record<string, unknown>; old: Record<string, unknown> };

/**
 * Escuta mudanças em tempo real numa tabela (respeita o RLS do usuário).
 * `filter` segue a sintaxe do Realtime: "conversation_id=eq.<uuid>".
 */
export function useRealtime(table: string, onChange: (c: Change) => void, filter?: string, enabled = true) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled) return;
    const sb = supabase();
    const name = `rt-${table}-${filter ?? "all"}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = sb
      .channel(name)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        (payload: Change) => cb.current(payload),
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [table, filter, enabled]);
}

/** Carrega dados com estado de loading/erro e permite recarregar. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    try {
      const d = await loaderRef.current();
      setData(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, setData, loading, error, reload };
}

/** Lê/escreve um parâmetro da URL sem depender de useSearchParams. */
export function useUrlParam(key: string): [string | null, (v: string | null) => void] {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    setValue(new URLSearchParams(window.location.search).get(key));
  }, [key]);
  const set = useCallback(
    (v: string | null) => {
      const url = new URL(window.location.href);
      if (v) url.searchParams.set(key, v);
      else url.searchParams.delete(key);
      window.history.replaceState(null, "", url.toString());
      setValue(v);
    },
    [key],
  );
  return [value, set];
}

/** Debounce simples para buscas */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Throttle para recarregar listas quando chegam muitos eventos de realtime */
export function useThrottledCallback(fn: () => void, ms = 400) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  return useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      fnRef.current();
    }, ms);
  }, [ms]);
}
