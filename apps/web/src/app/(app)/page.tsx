"use client";

import { Check, ChevronRight, Hourglass, LayoutGrid, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { businessStatus, formatPhone, type BusinessHours, type Holiday, type Row } from "@despachante/shared";
import { Badge, Card, CardHeader, Dot, EmptyState, PageHeader, ProgressBar, Spinner, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { greeting, timeAgo } from "@/lib/format";
import { useRealtime, useThrottledCallback } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

type RecentCase = Row<"cases"> & { service: Row<"services">; stage: Row<"service_stages">; client: Row<"clients"> | null };

type Stats = {
  convToday: number;
  aiToday: number;
  autoSent: number;
  waitingHuman: (Row<"conversations"> & { contact: Row<"contacts"> })[];
  drafts: number;
  approvals: number;
  proposals: number;
  docsToValidate: number;
  openCases: number;
  detranCases: number;
  recent: RecentCase[];
  byService: { service: Row<"services">; stages: { stage: Row<"service_stages">; count: number }[]; total: number }[];
  setup: { ia: boolean; empresa: boolean; precos: boolean; teste: boolean; pix: boolean };
  badRuns: number;
};

function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function Dashboard() {
  const { profile, settings } = useApp();
  const [s, setS] = useState<Stats | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const today = startOfDay();
    const [conv, runs, sent, waiting, drafts, approvals, proposals, docs, cases, services, stages, taskModel, prices, simConvs, badRuns, recent] = await Promise.all([
      sb.from("conversations").select("id", { count: "exact", head: true }).gte("last_inbound_at", today).eq("is_test", false),
      sb.from("ai_runs").select("id", { count: "exact", head: true }).gte("created_at", today).eq("status", "done").eq("kind", "atendimento"),
      sb.from("messages").select("id", { count: "exact", head: true }).gte("created_at", today).eq("sender", "ai").eq("status", "sent"),
      sb.from("conversations").select("*, contact:contacts(*)").eq("status", "waiting_human").is("scenario_id", null).order("handoff_at", { ascending: false }).limit(6),
      sb.from("conversations").select("id", { count: "exact", head: true }).gt("pending_drafts", 0).is("scenario_id", null),
      sb.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      sb.from("knowledge_proposals").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      sb.from("case_documents").select("id", { count: "exact", head: true }).eq("status", "recebido"),
      sb.from("cases").select("service_id, stage_id").is("closed_at", null).eq("is_test", false),
      sb.from("services").select("*").eq("active", true).order("sort_order"),
      sb.from("service_stages").select("*").order("sort_order"),
      sb.from("ai_task_models").select("provider_id, model").eq("task", "atendimento").single(),
      sb.from("service_prices").select("id", { count: "exact", head: true }).eq("needs_review", true),
      sb.from("conversations").select("id", { count: "exact", head: true }).eq("is_test", true),
      sb.from("ai_runs").select("id", { count: "exact", head: true }).eq("rating", "ruim"),
      sb.from("cases").select("*, service:services(*), stage:service_stages(*), client:clients(*)").order("updated_at", { ascending: false }).limit(8),
    ]);
    const openCases = cases.data ?? [];
    const allStages = stages.data ?? [];
    const byService = (services.data ?? [])
      .map((service) => {
        const st = allStages.filter((x) => x.service_id === service.id && !x.is_final && !x.is_canceled);
        const list = st.map((stage) => ({ stage, count: openCases.filter((c) => c.stage_id === stage.id).length }));
        return { service, stages: list, total: list.reduce((a, b) => a + b.count, 0) };
      })
      .filter((x) => x.total > 0);
    const detranStageIds = new Set(allStages.filter((x) => x.waiting_on === "detran").map((x) => x.id));
    setS({
      convToday: conv.count ?? 0,
      aiToday: runs.count ?? 0,
      autoSent: sent.count ?? 0,
      waitingHuman: (waiting.data ?? []) as unknown as Stats["waitingHuman"],
      drafts: drafts.count ?? 0,
      approvals: approvals.count ?? 0,
      proposals: proposals.count ?? 0,
      docsToValidate: docs.count ?? 0,
      openCases: openCases.length,
      detranCases: openCases.filter((c) => detranStageIds.has(c.stage_id)).length,
      recent: (recent.data ?? []) as unknown as RecentCase[],
      byService,
      setup: {
        ia: !!(taskModel.data?.provider_id && taskModel.data?.model),
        empresa: settings.company_name !== "Seu Despachante",
        precos: (prices.count ?? 0) === 0,
        teste: (simConvs.count ?? 0) > 0,
        pix: !!settings.pix_key,
      },
      badRuns: badRuns.count ?? 0,
    });
  }, [settings.company_name, settings.pix_key]);

  useEffect(() => {
    void load();
  }, [load]);
  const reload = useThrottledCallback(() => void load(), 1500);
  useRealtime("conversations", reload);
  useRealtime("ai_runs", reload);

  const st = businessStatus(new Date(), settings.business_hours as BusinessHours, (settings.holidays as Holiday[]) ?? [], settings.timezone);

  if (!s) return <div className="grid h-screen place-items-center"><Spinner /></div>;

  const setupSteps = [
    { done: s.setup.ia, label: "Conectar a IA (URL, chave e modelo)", href: "/configuracoes?tab=ia" },
    { done: s.setup.empresa, label: "Preencher os dados da empresa", href: "/configuracoes?tab=empresa" },
    { done: s.setup.precos, label: "Revisar os preços de exemplo", href: "/servicos" },
    { done: s.setup.pix, label: "Cadastrar a chave PIX", href: "/configuracoes?tab=empresa" },
    { done: s.setup.teste, label: "Conversar com a IA no Simulador", href: "/simulador" },
  ];
  const setupDone = setupSteps.filter((x) => x.done).length;
  const minutesSaved = s.aiToday * 3;
  const firstName = profile.full_name.split(" ")[0];

  return (
    <div className="mx-auto max-w-7xl px-8 py-7">
      <PageHeader
        icon={LayoutGrid}
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        subtitle={
          s.aiToday > 0
            ? `${settings.assistant_name} tomou ${s.aiToday} decisões hoje, cerca de ${minutesSaved} min de atendimento poupados.`
            : `${settings.assistant_name} está pronta para atender.`
        }
        actions={
          <Badge tone={st.open ? "mint" : "neutral"}>
            {st.open ? "Aberto agora" : `Fechado${st.nextOpening ? ` · reabre ${st.nextOpening}` : ""}`}
          </Badge>
        }
      />

      {setupDone < setupSteps.length && (
        <Card className="mb-5">
          <div className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-3.5">
            <div className="flex-1">
              <div className="text-[15px] font-semibold">Configuração inicial</div>
              <div className="text-[13px] text-ink-2">{setupDone} de {setupSteps.length} passos concluídos</div>
            </div>
            <div className="w-48"><ProgressBar value={(setupDone / setupSteps.length) * 100} /></div>
          </div>
          <div className="grid divide-y divide-line md:grid-cols-5 md:divide-x md:divide-y-0">
            {setupSteps.map((x) => (
              <Link key={x.label} href={x.href} className="flex items-start gap-2.5 px-4 py-3 text-[13px] hover:bg-surface-2">
                <span className={cx("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border", x.done ? "border-mint bg-mint text-white" : "border-line-strong")}>
                  {x.done && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className={x.done ? "text-ink-3 line-through" : ""}>{x.label}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Conversas hoje" value={s.convToday} hint="clientes que escreveram hoje" />
        <Kpi label="Decisões da IA hoje" value={s.aiToday} hint={`${s.autoSent} respostas enviadas automaticamente`} />
        <Kpi label="Aguardando humano" value={s.waitingHuman.length} hint="conversas transferidas pela IA" href="/inbox" warn={s.waitingHuman.length > 0} />
        <Kpi label="Casos em andamento" value={s.openCases} hint={`${s.detranCases} no Detran`} href="/casos" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card>
          <CardHeader title="Pendências" subtitle="O que precisa de alguém da equipe" />
          <div className="divide-y divide-line">
            <Pending href="/inbox" label="Rascunhos da IA para aprovar" n={s.drafts} />
            <Pending href="/casos" label="Mudanças de fase pedidas pela IA" n={s.approvals} />
            <Pending href="/casos" label="Documentos para conferir" n={s.docsToValidate} />
            <Pending href="/ensinar" label="Propostas do Instrutor" n={s.proposals} />
            <Pending href="/ensinar" label="Respostas corrigidas" n={s.badRuns} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Aguardando atendimento humano" subtitle="Conversas que a IA passou para a equipe" actions={<Link href="/inbox" className="text-[13px] font-medium text-brand hover:underline">Ver todas</Link>} />
          {s.waitingHuman.length === 0 ? (
            <EmptyState icon={UserRound} title="Ninguém aguardando" description="Quando a IA transferir uma conversa, ela aparece aqui com o resumo do pedido." />
          ) : (
            <div className="divide-y divide-line">
              {s.waitingHuman.map((c) => (
                <Link key={c.id} href={`/inbox?c=${c.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold">{c.contact.name || c.contact.wa_name || formatPhone(c.contact.phone)}</span>
                      {c.is_test && <Badge tone="violet">teste</Badge>}
                      <span className="ml-auto text-xs text-ink-3">há {timeAgo(c.handoff_at)}</span>
                    </div>
                    <div className="text-[13px] text-ink-2">{c.handoff_reason}</div>
                    {c.handoff_summary && <div className="line-clamp-1 text-xs text-ink-3">{c.handoff_summary}</div>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Casos recentes" actions={<Link href="/casos" className="text-[13px] font-medium text-brand hover:underline">Abrir Kanban</Link>} />
          {s.recent.length === 0 ? (
            <EmptyState icon={Hourglass} title="Nenhum caso ainda" description="Os casos são abertos pela IA durante o atendimento ou manualmente em Casos." />
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="px-5 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Serviço</th>
                  <th className="px-3 py-2 font-medium">Fase</th>
                  <th className="px-5 py-2 text-right font-medium">Atualizado</th>
                </tr>
              </thead>
              <tbody>
                {s.recent.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-5 py-2">
                      <Link href={`/casos?s=${c.service_id}&id=${c.id}`} className="font-semibold hover:underline">{c.code}</Link>
                      {c.is_test && <Badge tone="violet" className="ml-2">teste</Badge>}
                    </td>
                    <td className="px-3 py-2">{c.client?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-2">{c.service.name}</td>
                    <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5"><Dot color={c.stage.color} />{c.stage.name}</span></td>
                    <td className="px-5 py-2 text-right text-ink-3">há {timeAgo(c.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {s.byService.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader title="Casos em andamento por fase" />
            <div className="grid gap-4 p-5 md:grid-cols-2">
              {s.byService.map(({ service, stages, total }) => (
                <Link key={service.id} href={`/casos?s=${service.id}`} className="rounded-lg border border-line p-4 transition hover:border-line-strong">
                  <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
                    <Dot color={service.color} /> {service.name}
                    <span className="ml-auto font-normal text-ink-3">{total}</span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-line">
                    {stages.filter((x) => x.count).map((x) => (
                      <div key={x.stage.id} style={{ width: `${(x.count / total) * 100}%`, background: x.stage.color }} title={`${x.stage.name}: ${x.count}`} />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {stages.filter((x) => x.count).map((x) => (
                      <span key={x.stage.id} className="text-xs text-ink-2">{x.stage.name} <b className="font-semibold">{x.count}</b></span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, href, warn }: { label: string; value: number; hint?: string; href?: string; warn?: boolean }) {
  const body = (
    <Card className="px-4 py-3.5 transition hover:border-line-strong">
      <div className="micro">{label}</div>
      <div className={cx("mt-1 text-2xl font-semibold tracking-tight", warn && "text-sun")}>{value}</div>
      {hint && <div className="text-xs text-ink-3">{hint}</div>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Pending({ href, label, n }: { href: string; label: string; n: number }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-5 py-2.5 text-[13px] hover:bg-surface-2">
      <span className="flex-1">{label}</span>
      <span className={cx("min-w-6 text-center font-semibold", n === 0 ? "text-ink-3" : "text-ink")}>{n}</span>
      <ChevronRight className="size-3.5 text-ink-3" />
    </Link>
  );
}
