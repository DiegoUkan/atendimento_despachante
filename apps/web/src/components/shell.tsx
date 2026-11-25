"use client";

import {
  BookOpen, CircleCheckBig, GraduationCap, Inbox, LayoutGrid, Layers, LogOut, Plug, Settings, Smartphone,
  SquareKanban, Users, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { MODE_INFO, businessStatus, type BusinessHours, type Holiday, type Mode } from "@despachante/shared";
import { AppProvider, useApp } from "@/lib/app-context";
import { useRealtime, useThrottledCallback } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";
import { Logo, Wordmark } from "./brand";
import { Button, Spinner, cx } from "./ui";

type Counts = { inbox: number; drafts: number; approvals: number; proposals: number };

const NAV: { section?: string; items: { href: string; label: string; icon: LucideIcon; badge?: keyof Counts | "inboxAll" }[] }[] = [
  {
    items: [
      { href: "/", label: "Painel", icon: LayoutGrid },
      { href: "/inbox", label: "Caixa de entrada", icon: Inbox, badge: "inboxAll" },
      { href: "/simulador", label: "Simulador", icon: Smartphone },
      { href: "/casos", label: "Casos", icon: SquareKanban, badge: "approvals" },
      { href: "/clientes", label: "Clientes", icon: Users },
    ],
  },
  {
    section: "Ensinar a IA",
    items: [
      { href: "/ensinar", label: "Ensinar", icon: GraduationCap, badge: "proposals" },
      { href: "/conhecimento", label: "Conhecimento", icon: BookOpen },
      { href: "/servicos", label: "Serviços", icon: Layers },
      { href: "/testes", label: "Testes", icon: CircleCheckBig },
    ],
  },
  {
    section: "Sistema",
    items: [
      { href: "/conexoes", label: "Conexões", icon: Plug },
      { href: "/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, settings } = useApp();
  const [counts, setCounts] = useState<Counts>({ inbox: 0, drafts: 0, approvals: 0, proposals: 0 });
  const [workerStale, setWorkerStale] = useState(false);

  const loadCounts = useCallback(async () => {
    const sb = supabase();
    const [w, d, a, p] = await Promise.all([
      sb.from("conversations").select("id", { count: "exact", head: true }).eq("status", "waiting_human").eq("is_test", false),
      sb.from("conversations").select("id", { count: "exact", head: true }).gt("pending_drafts", 0).is("scenario_id", null),
      sb.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      sb.from("knowledge_proposals").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    ]);
    setCounts({ inbox: w.count ?? 0, drafts: d.count ?? 0, approvals: a.count ?? 0, proposals: p.count ?? 0 });
  }, []);
  const throttled = useThrottledCallback(() => void loadCounts(), 800);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);
  useRealtime("conversations", throttled);
  useRealtime("approvals", throttled);
  useRealtime("knowledge_proposals", throttled);

  // worker vivo? se há tarefas vencidas há mais de 90s, provavelmente parou
  useEffect(() => {
    const check = async () => {
      const cutoff = new Date(Date.now() - 90_000).toISOString();
      const { count } = await supabase().from("jobs").select("id", { count: "exact", head: true }).eq("status", "pending").lt("run_at", cutoff);
      setWorkerStale((count ?? 0) > 0);
    };
    void check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, []);

  const status = businessStatus(new Date(), settings.business_hours as BusinessHours, (settings.holidays as Holiday[]) ?? [], settings.timezone);
  const mode = MODE_INFO[settings.default_mode as Mode];

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col bg-nav text-nav-ink">
      <div className="px-4 pb-4 pt-4">
        <Wordmark name={settings.company_name} />
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 pb-4">
        {NAV.map((group, gi) => (
          <div key={gi}>
            {group.section && <div className="px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#64748b]">{group.section}</div>}
            <div className="space-y-px">
              {group.items.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const badge = item.badge === "inboxAll" ? counts.inbox + counts.drafts : item.badge ? counts[item.badge] : 0;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cx(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors",
                      active ? "bg-nav-2 text-white shadow-[inset_2px_0_0_#60a5fa]" : "hover:bg-nav-2 hover:text-white",
                    )}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                    <span className="flex-1">{item.label}</span>
                    {badge > 0 && <span className="rounded-full bg-[#334155] px-1.5 text-[11px] text-[#e2e8f0]">{badge}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-nav-2 p-3">
        {workerStale && (
          <div className="rounded-lg border border-[#7f1d1d] bg-[#450a0a] px-2.5 py-2 text-xs text-[#fecaca]" title="Há tarefas esperando há mais de 90 segundos">
            O worker parece parado
          </div>
        )}
        <Link href="/configuracoes?tab=atendimento" className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-nav-2">
          <span className={cx("size-2 rounded-full", status.open ? "bg-[#22c55e]" : "bg-[#64748b]")} />
          <span className="text-white">{settings.assistant_name}</span>
          <span className="text-[#94a3b8]">· {mode?.label}</span>
          <span className="ml-auto text-[#64748b]">{status.open ? "aberto" : "fechado"}</span>
        </Link>
        <div className="flex items-center gap-2 px-1.5">
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-xs text-white">{profile.full_name || profile.email}</div>
            <div className="text-[11px] text-[#64748b]">{profile.role === "owner" ? "Dono" : "Analista"}</div>
          </div>
          <button
            className="rounded-md p-1.5 text-[#94a3b8] hover:bg-nav-2 hover:text-white"
            onClick={async () => {
              await supabase().auth.signOut();
              router.replace("/login");
              router.refresh();
            }}
            title="Sair"
          >
            <LogOut className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function Loading() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex items-center gap-2 text-sm text-ink-2">
        <Spinner className="size-4" /> Carregando…
      </div>
    </div>
  );
}

function Inactive({ email }: { email: string }) {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="max-w-md text-center">
        <div className="mb-4 flex justify-center"><span className="rounded-lg bg-nav p-0.5"><Logo /></span></div>
        <h1 className="text-lg font-semibold">Aguardando liberação</h1>
        <p className="mt-2 text-[13px] text-ink-2">
          A conta <b>{email}</b> existe, mas ainda não foi liberada. Peça para o dono da empresa ativar seu acesso em Configurações → Equipe.
        </p>
        <Button
          className="mt-5"
          variant="secondary"
          onClick={async () => {
            await supabase().auth.signOut();
            window.location.href = "/login";
          }}
        >
          Sair
        </Button>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <AppProvider fallback={<Loading />} inactive={(email) => <Inactive email={email} />}>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </AppProvider>
  );
}
