"use client";

import { Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MODE_INFO, type BusinessHours, type Holiday, type Mode, type Row } from "@despachante/shared";
import { createTeamMember, resetMemberPassword } from "@/app/actions/team";
import { MarkdownEditor } from "@/components/markdown";
import { Avatar, Badge, Button, Card, CardHeader, Field, Input, Modal, PageHeader, Select, Slider, Spinner, Switch, Tabs, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { fullDate } from "@/lib/format";
import { useUrlParam } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

type Tab = "empresa" | "assistente" | "atendimento" | "ia" | "equipe";

export default function SettingsPage() {
  const { isOwner } = useApp();
  const [tabParam, setTabParam] = useUrlParam("tab");
  const tab = (tabParam as Tab) || "empresa";
  return (
    <div className="mx-auto max-w-5xl p-8">
      <PageHeader icon={Settings} title="Configurações" subtitle={isOwner ? "Personalize a empresa, a assistente e a inteligência artificial." : "Somente o dono pode alterar as configurações."} />
      <Tabs
        value={tab}
        onChange={(v) => setTabParam(v)}
        className="mb-6 w-fit"
        tabs={[
          { value: "empresa", label: "Empresa" },
          { value: "assistente", label: "Assistente" },
          { value: "atendimento", label: "Atendimento" },
          { value: "ia", label: "Inteligência Artificial" },
          { value: "equipe", label: "Equipe" },
        ]}
      />
      {tab === "empresa" && <CompanyTab />}
      {tab === "assistente" && <AssistantTab />}
      {tab === "atendimento" && <AttendanceTab />}
      {tab === "ia" && <AiTab />}
      {tab === "equipe" && <TeamTab />}
    </div>
  );
}

function useSettingsForm() {
  const { settings, refreshSettings, isOwner } = useApp();
  const [f, setF] = useState(settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => setF(settings), [settings]);
  async function save(fields: (keyof Row<"settings">)[]) {
    setSaving(true);
    const patch = Object.fromEntries(fields.map((k) => [k, f[k]])) as Partial<Row<"settings">>;
    const { error } = await supabase().from("settings").update(patch).eq("id", 1);
    setSaving(false);
    if (error) return toast.error(error.message.includes("row-level") ? "Apenas o dono pode alterar." : error.message);
    toast.success("Configurações salvas");
    await refreshSettings();
  }
  return { f, setF, save, saving, isOwner };
}

// ---------------------------------------------------------------------------
function CompanyTab() {
  const { f, setF, save, saving, isOwner } = useSettingsForm();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon="" title="Dados da empresa" subtitle="A IA usa estas informações para se apresentar e responder." />
        <div className="grid grid-cols-2 gap-4 p-5">
          <Field label="Nome da empresa"><Input value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} /></Field>
          <Field label="Cidade"><Input value={f.company_city} onChange={(e) => setF({ ...f, company_city: e.target.value })} /></Field>
          <Field label="Endereço"><Input value={f.company_address} onChange={(e) => setF({ ...f, company_address: e.target.value })} /></Field>
          <Field label="Telefone fixo / outro contato"><Input value={f.company_phone} onChange={(e) => setF({ ...f, company_phone: e.target.value })} /></Field>
          <Field label="Sobre a empresa (o que a IA deve saber)" className="col-span-2">
            <MarkdownEditor value={f.about_md} onChange={(v) => setF({ ...f, about_md: v })} rows={8} />
          </Field>
        </div>
      </Card>
      <Card>
        <CardHeader icon="" title="Pagamento" subtitle="A chave PIX só é enviada pela IA depois que o cliente aceita o orçamento — sempre exatamente como está aqui." />
        <div className="grid grid-cols-3 gap-4 p-5">
          <Field label="Tipo da chave">
            <Select value={f.pix_key_type} onChange={(e) => setF({ ...f, pix_key_type: e.target.value })}>
              <option value="">—</option><option>CNPJ</option><option>CPF</option><option>E-mail</option><option>Telefone</option><option>Aleatória</option>
            </Select>
          </Field>
          <Field label="Chave PIX" className="col-span-2"><Input value={f.pix_key} onChange={(e) => setF({ ...f, pix_key: e.target.value })} /></Field>
          <Field label="Favorecido" className="col-span-3"><Input value={f.pix_holder} onChange={(e) => setF({ ...f, pix_holder: e.target.value })} placeholder="Nome que aparece no app do banco" /></Field>
          <Field label="Observações de pagamento" className="col-span-3"><Input value={f.payment_notes} onChange={(e) => setF({ ...f, payment_notes: e.target.value })} /></Field>
        </div>
      </Card>
      <div className="flex justify-end">
        <Button disabled={!isOwner} loading={saving} onClick={() => save(["company_name", "company_city", "company_address", "company_phone", "about_md", "pix_key_type", "pix_key", "pix_holder", "payment_notes"])}>Salvar</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function previewMessage(p: Record<string, number>, name: string) {
  const formal = (p.formalidade ?? 45) > 65;
  const casual = (p.formalidade ?? 45) < 30;
  const emoji = (p.emojis ?? 30) > 50 ? "" : (p.emojis ?? 30) >= 15 ? "" : "";
  const warm = (p.calor ?? 75) > 70;
  const long = (p.tamanho ?? 35) > 70;
  const hi = formal ? `Bom dia! Aqui é a ${name}, assistente virtual.` : casual ? `Oi! Aqui é a ${name}${emoji}` : `Olá! Sou a ${name}, assistente virtual.`;
  const body = formal
    ? "Para darmos andamento à transferência, o senhor poderia me informar a placa do veículo?"
    : casual
      ? "Bora resolver essa transferência? Me passa a placa do carro?"
      : "Para começar a transferência, pode me passar a placa do veículo?";
  const extra = warm ? (formal ? " Estou à disposição para ajudar no que precisar." : " Fico feliz em ajudar!") : "";
  const detail = long ? " Com ela já consigo verificar a situação e te explico o passo a passo com os documentos necessários." : "";
  return `${hi}${!casual ? emoji : ""} ${body}${detail}${extra}`;
}

function AssistantTab() {
  const { f, setF, save, saving, isOwner } = useSettingsForm();
  const persona = (f.persona ?? {}) as Record<string, number>;
  const setP = (k: string, v: number) => setF({ ...f, persona: { ...persona, [k]: v } });
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader icon="" title="Personalidade" subtitle="Como a assistente fala com os clientes." />
        <div className="space-y-5 p-5">
          <Field label="Nome da assistente" className="max-w-sm"><Input value={f.assistant_name} onChange={(e) => setF({ ...f, assistant_name: e.target.value })} /></Field>
          <div className="space-y-4 rounded-2xl bg-surface-2 p-4">
            <Slider value={persona.formalidade ?? 45} onChange={(v) => setP("formalidade", v)} left="Descontraída" right="Formal" />
            <Slider value={persona.calor ?? 75} onChange={(v) => setP("calor", v)} left="Objetiva" right="Acolhedora" />
            <Slider value={persona.tamanho ?? 35} onChange={(v) => setP("tamanho", v)} left="Curtinha" right="Detalhada" />
            <Slider value={persona.emojis ?? 30} onChange={(v) => setP("emojis", v)} left="Sem emojis" right="Muitos emojis" />
          </div>
          <Field label="Instruções extras de estilo" hint="Ex.: chame o cliente pelo primeiro nome; evite gírias; assine como 'Equipe Despachante X'.">
            <MarkdownEditor value={f.persona_extra_md} onChange={(v) => setF({ ...f, persona_extra_md: v })} rows={4} />
          </Field>
          <div className="flex justify-end">
            <Button disabled={!isOwner} loading={saving} onClick={() => save(["assistant_name", "assistant_emoji", "persona", "persona_extra_md"])}>Salvar</Button>
          </div>
        </div>
      </Card>
      <Card className="h-fit lg:col-span-2">
        <CardHeader icon="" title="Prévia do tom" subtitle="Exemplo aproximado" />
        <div className="wa-wallpaper space-y-2 rounded-b-2xl p-4">
          <div className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-wa-out px-3 py-2 text-sm shadow-sm">Oi, quero transferir um carro</div></div>
          <div className="flex justify-start"><div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm shadow-sm">{previewMessage(persona, f.assistant_name)}</div></div>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function AttendanceTab() {
  const { f, setF, save, saving, isOwner } = useSettingsForm();
  const hours = (f.business_hours ?? {}) as BusinessHours;
  const holidays = (f.holidays ?? []) as Holiday[];
  const setRanges = (d: number, ranges: [string, string][]) => setF({ ...f, business_hours: { ...hours, [String(d)]: ranges } });
  const [hDate, setHDate] = useState("");
  const [hName, setHName] = useState("");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon="" title="Modo padrão da IA" subtitle="Vale quando número, serviço, fase ou conversa não definem outro. Ordem: conversa › fase › serviço › número › padrão." />
        <div className="grid gap-3 p-5 md:grid-cols-3">
          {(Object.keys(MODE_INFO) as Mode[]).map((m) => (
            <button key={m} onClick={() => setF({ ...f, default_mode: m })} className={cx("rounded-2xl border-2 p-4 text-left transition", f.default_mode === m ? "border-brand bg-brand-soft" : "border-line hover:border-brand/40")}>
              <div className="font-extrabold">{MODE_INFO[m].label}</div>
              <div className="text-sm text-ink-2">{MODE_INFO[m].description}</div>
              {m === "copilot" && <Badge tone="mint" className="mt-2">recomendado no início</Badge>}
            </button>
          ))}
        </div>
        <div className="grid gap-6 border-t border-line p-5 md:grid-cols-2">
          <Field label={`Confiança mínima para enviar sozinha: ${Math.round(Number(f.confidence_threshold) * 100)}%`} hint="No modo automático, respostas abaixo disso viram rascunho para revisão.">
            <Slider value={Math.round(Number(f.confidence_threshold) * 100)} onChange={(v) => setF({ ...f, confidence_threshold: v / 100 })} min={0} max={100} />
          </Field>
          <Field label={`Mensagens de histórico lidas: ${f.history_messages}`} hint="Quantas mensagens anteriores a IA lê a cada resposta.">
            <Slider value={f.history_messages} onChange={(v) => setF({ ...f, history_messages: v })} min={5} max={80} />
          </Field>
          <Field label={`Agrupar mensagens (WhatsApp real): ${f.debounce_seconds}s`} hint="Espera o cliente parar de digitar antes de responder tudo junto.">
            <Slider value={f.debounce_seconds} onChange={(v) => setF({ ...f, debounce_seconds: v })} min={0} max={60} />
          </Field>
          <Field label={`Agrupar mensagens (Simulador): ${f.test_debounce_seconds}s`}>
            <Slider value={f.test_debounce_seconds} onChange={(v) => setF({ ...f, test_debounce_seconds: v })} min={0} max={30} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader icon="" title="Horário de atendimento" subtitle={`Fuso: ${f.timezone}. Fora do horário a IA continua atendendo, mas avisa que o andamento segue no próximo dia útil.`} />
        <div className="divide-y divide-line">
          {WEEKDAYS.map((w, d) => {
            const ranges = hours[String(d)] ?? [];
            return (
              <div key={d} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="w-24 font-bold">{w}</span>
                {ranges.length === 0 && <span className="text-sm text-ink-3">fechado</span>}
                {ranges.map(([a, b], i) => (
                  <span key={i} className="flex items-center gap-1">
                    <Input type="time" value={a} onChange={(e) => setRanges(d, ranges.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} className="h-8 w-28" />
                    –
                    <Input type="time" value={b} onChange={(e) => setRanges(d, ranges.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} className="h-8 w-28" />
                    <button onClick={() => setRanges(d, ranges.filter((_, j) => j !== i))} className="px-1 text-ink-3 hover:text-coral">×</button>
                  </span>
                ))}
                <Button size="xs" variant="ghost" onClick={() => setRanges(d, [...ranges, ["08:00", "12:00"]])}>+ período</Button>
              </div>
            );
          })}
        </div>
        <div className="border-t border-line p-5">
          <div className="mb-2 text-sm font-bold">Feriados</div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[...holidays].sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
              <span key={h.date + h.name} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-xs font-bold">
                {h.date.split("-").reverse().join("/")} · {h.name}
                <button onClick={() => setF({ ...f, holidays: holidays.filter((x) => x !== h) })} className="text-ink-3 hover:text-coral">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input type="date" value={hDate} onChange={(e) => setHDate(e.target.value)} className="w-44" />
            <Input value={hName} onChange={(e) => setHName(e.target.value)} placeholder="Nome (ex.: Aniversário de Campo Largo)" />
            <Button variant="secondary" onClick={() => { if (hDate && hName) { setF({ ...f, holidays: [...holidays, { date: hDate, name: hName }] }); setHDate(""); setHName(""); } }}>Adicionar</Button>
          </div>
        </div>
        <div className="border-t border-line p-5">
          <Field label="Como agir fora do horário">
            <MarkdownEditor value={f.out_of_hours_md} onChange={(v) => setF({ ...f, out_of_hours_md: v })} rows={3} />
          </Field>
        </div>
      </Card>
      <div className="flex justify-end">
        <Button disabled={!isOwner} loading={saving} onClick={() => save(["default_mode", "confidence_threshold", "history_messages", "debounce_seconds", "test_debounce_seconds", "business_hours", "holidays", "out_of_hours_md"])}>Salvar</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const TASKS: { task: string; emoji: string; label: string; description: string; chat: boolean }[] = [
  { task: "atendimento", emoji: "", label: "Atendimento", description: "Conversa com os clientes. Precisa suportar ferramentas (tool calling). Equilíbrio ideal: rápido e bom em seguir regras (ex.: Claude Sonnet).", chat: true },
  { task: "ensinar", emoji: "", label: "Instrutor e avaliador", description: "“Ensinar a IA” e correção dos cenários. Pouco uso: pode ser o modelo mais caprichado.", chat: true },
  { task: "visao", emoji: "", label: "Visão (reserva)", description: "Só é usado se o modelo de atendimento NÃO enxergar imagens.", chat: true },
  { task: "transcricao", emoji: "", label: "Transcrição de áudio", description: "Whisper/“transcribe” ou um modelo multimodal que aceite áudio (ex.: Gemini). Modelos GPT de chat e Claude não servem.", chat: false },
  { task: "embeddings", emoji: "", label: "Embeddings (opcional)", description: "Precisa ser um modelo de embeddings (ex.: text-embedding-3-small). Modelos de chat não servem. Sem ele, a busca por palavras funciona normalmente.", chat: false },
];

type TaskTestResult = { ok: boolean; info?: string; error?: string; latency_ms?: number };

type Provider = Row<"ai_providers">;

function AiTab() {
  const { isOwner } = useApp();
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [tasks, setTasks] = useState<Row<"ai_task_models">[]>([]);
  const [editing, setEditing] = useState<Partial<Provider> & { key?: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const [p, t] = await Promise.all([sb.from("ai_providers").select("*").order("created_at"), sb.from("ai_task_models").select("*")]);
    setProviders(p.data ?? []);
    setTasks(t.data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function saveProvider() {
    if (!editing?.name || !editing.base_url) return toast.error("Preencha nome e URL");
    const sb = supabase();
    const payload = { name: editing.name.trim(), base_url: editing.base_url.trim().replace(/\/+$/, "") };
    let id = editing.id;
    if (id) {
      const { error } = await sb.from("ai_providers").update(payload).eq("id", id);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await sb.from("ai_providers").insert(payload).select("id").single();
      if (error || !data) return toast.error(error?.message);
      id = data.id;
    }
    if (editing.key?.trim()) {
      const { error } = await sb.rpc("set_provider_key", { p_provider_id: id!, p_key: editing.key.trim() });
      if (error) return toast.error(error.message);
    }
    toast.success("Provedor salvo (a chave fica criptografada no Vault)");
    setEditing(null);
    await load();
    void test(id!);
  }

  async function test(providerId: string) {
    setTesting(providerId);
    const before = providers?.find((p) => p.id === providerId)?.last_test as { at?: string } | null;
    const chatModel = tasks.find((t) => t.task === "atendimento" && t.provider_id === providerId)?.model ?? undefined;
    const { error } = await supabase().rpc("enqueue_job", { p_type: "llm_test", p_payload: { provider_id: providerId, ...(chatModel ? { model: chatModel } : {}) } });
    if (error) {
      setTesting(null);
      return toast.error(error.message);
    }
    // o worker executa o teste; aguardamos o resultado
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const { data } = await supabase().from("ai_providers").select("*").eq("id", providerId).single();
      const lt = data?.last_test as { at?: string; ok?: boolean; error?: string; models_count?: number } | null;
      if (lt?.at && lt.at !== before?.at) {
        setTesting(null);
        await load();
        if (lt.ok) toast.success(`Conexão OK! ${lt.models_count ?? 0} modelos encontrados`);
        else toast.error(`Falhou: ${lt.error}`);
        return;
      }
    }
    setTesting(null);
    toast.error("O worker não respondeu. Ele está rodando?");
  }

  async function saveTask(t: Row<"ai_task_models">) {
    const { error } = await supabase().from("ai_task_models").update({ provider_id: t.provider_id, model: t.model, temperature: t.temperature, supports_vision: t.supports_vision, enabled: t.enabled }).eq("task", t.task);
    if (error) return toast.error(error.message.includes("row-level") ? "Apenas o dono pode alterar." : error.message);
    toast.success("Modelo salvo");
    if (t.task === "embeddings" && t.provider_id && t.model && t.enabled) {
      await supabase().rpc("enqueue_job", { p_type: "reembed_all", p_payload: {}, p_dedupe_key: "reembed_all" });
      toast.message("Recalculando a busca inteligente da base");
    }
    void load();
  }

  if (!providers) return <Spinner />;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          icon=""
          title="Provedores (API compatível com OpenAI)"
          subtitle="Use a URL do seu newapi (geralmente termina em /v1) e a chave. Pode cadastrar mais de um."
          actions={isOwner && <Button size="sm" onClick={() => setEditing({ name: "newapi", base_url: "https://" })}>+ Provedor</Button>}
        />
        {providers.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-2">Nenhum provedor ainda. Cadastre a URL e a chave do seu newapi para a IA funcionar.</div>
        ) : (
          <div className="divide-y divide-line">
            {providers.map((p) => {
              const lt = p.last_test as { ok?: boolean; error?: string; at?: string; models_count?: number; chat_reply?: string; latency_ms?: number } | null;
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold">{p.name}</div>
                    <div className="truncate text-sm text-ink-2">{p.base_url}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      {p.key_hint ? <Badge tone="mint">chave {p.key_hint}</Badge> : <Badge tone="coral">sem chave</Badge>}
                      {lt && (lt.ok ? <Badge tone="mint" title={fullDate(lt.at)}>✓ {lt.models_count} modelos · {lt.latency_ms}ms</Badge> : <Badge tone="coral" title={lt.error}>{lt.error?.slice(0, 60)}</Badge>)}
                      {lt?.chat_reply && <Badge tone="brand">respondeu “{lt.chat_reply.slice(0, 20)}”</Badge>}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => test(p.id)} loading={testing === p.id}>Testar conexão</Button>
                  {isOwner && <Button size="sm" variant="ghost" onClick={() => setEditing({ ...p, key: "" })}></Button>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader icon="" title="Qual modelo para cada tarefa" subtitle="Modelos mais baratos podem fazer tarefas simples. A lista vem do “Testar conexão”." />
        <div className="divide-y divide-line">
          {TASKS.map((meta) => {
            const t = tasks.find((x) => x.task === meta.task);
            if (!t) return null;
            return <TaskRow key={meta.task} meta={meta} t={t} providers={providers} onSave={saveTask} disabled={!isOwner} />;
          })}
        </div>
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Editar provedor" : "Novo provedor"}
        size="sm"
        footer={
          <>
            {editing?.id && (
              <Button variant="ghost" className="mr-auto" onClick={async () => { if (confirm("Excluir provedor (e sua chave)?")) { await supabase().from("ai_providers").delete().eq("id", editing.id!); setEditing(null); void load(); } }}></Button>
            )}
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveProvider}>Salvar e testar</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Nome"><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="URL base" hint="Ex.: https://newapi.seudominio.com/v1"><Input value={editing.base_url ?? ""} onChange={(e) => setEditing({ ...editing, base_url: e.target.value })} /></Field>
            <Field label="Chave de API" hint={editing.key_hint ? `Atual: ${editing.key_hint}. Deixe em branco para manter.` : "Fica guardada criptografada no Supabase Vault; o navegador nunca lê de volta."}>
              <Input type="password" value={editing.key ?? ""} onChange={(e) => setEditing({ ...editing, key: e.target.value })} autoComplete="off" />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

function TaskRow({ meta, t, providers, onSave, disabled }: { meta: (typeof TASKS)[number]; t: Row<"ai_task_models">; providers: Provider[]; onSave: (t: Row<"ai_task_models">) => void; disabled: boolean }) {
  const [f, setF] = useState(t);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TaskTestResult | null>(null);
  useEffect(() => setF(t), [t]);
  const models = ((providers.find((p) => p.id === f.provider_id)?.models ?? []) as string[]);
  const dirty = JSON.stringify(f) !== JSON.stringify(t);

  async function runTest() {
    setTesting(true);
    setResult(null);
    const { data: jobId, error } = await supabase().rpc("enqueue_job", { p_type: "task_test", p_payload: { task: t.task } });
    if (error || !jobId) {
      setTesting(false);
      return toast.error(error?.message ?? "Não consegui iniciar o teste");
    }
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const { data: job } = await supabase().from("jobs").select("status, result, last_error").eq("id", jobId).single();
      if (job && (job.status === "done" || job.status === "failed")) {
        setTesting(false);
        setResult((job.result as TaskTestResult) ?? { ok: false, error: job.last_error ?? "falhou" });
        return;
      }
    }
    setTesting(false);
    setResult({ ok: false, error: "O worker não respondeu. Ele está rodando?" });
  }
  return (
    <div className="grid grid-cols-12 items-end gap-3 px-5 py-4">
      <div className="col-span-12 md:col-span-4">
        <div className="font-extrabold">{meta.label}</div>
        <div className="text-xs text-ink-2">{meta.description}</div>
      </div>
      <Field label="Provedor" className="col-span-6 md:col-span-3">
        <Select value={f.provider_id ?? ""} onChange={(e) => setF({ ...f, provider_id: e.target.value || null })} disabled={disabled}>
          <option value="">— não usar —</option>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Modelo" className="col-span-6 md:col-span-3">
        <Input list={`models-${t.task}`} value={f.model ?? ""} onChange={(e) => setF({ ...f, model: e.target.value })} placeholder="nome do modelo" disabled={disabled} />
        <datalist id={`models-${t.task}`}>{models.map((m) => <option key={m} value={m} />)}</datalist>
      </Field>
      <div className="col-span-12 flex items-center justify-end gap-2 md:col-span-2">
        {dirty ? (
          <Button size="sm" onClick={() => onSave(f)}>Salvar</Button>
        ) : (
          t.provider_id && t.model && <Button size="sm" variant="secondary" onClick={runTest} loading={testing}>Testar</Button>
        )}
      </div>
      {result && (
        <div className={cx("col-span-12 rounded-xl px-3 py-2 text-sm md:col-start-5 md:col-span-8", result.ok ? "bg-mint-soft text-mint" : "bg-coral-soft text-coral")}>
          {result.ok ? "✓ " : ""}
          {result.ok ? result.info : result.error}
          {result.latency_ms ? <span className="ml-2 text-xs opacity-70">({(result.latency_ms / 1000).toFixed(1)}s)</span> : null}
        </div>
      )}
      {meta.chat && (
        <div className="col-span-12 flex flex-wrap items-center gap-6 md:col-start-5 md:col-span-8">
          <div className="flex w-64 items-center gap-2 text-xs font-bold text-ink-2">
            Temperatura {Number(f.temperature).toFixed(1)}
            <input type="range" min={0} max={1} step={0.1} value={Number(f.temperature)} onChange={(e) => setF({ ...f, temperature: Number(e.target.value) })} className="flex-1" disabled={disabled} />
          </div>
          {meta.task === "atendimento" && (
            <Switch checked={f.supports_vision} onChange={(v) => setF({ ...f, supports_vision: v })} label={<span className="text-xs">Este modelo enxerga imagens</span>} disabled={disabled} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function TeamTab() {
  const { isOwner, userId } = useApp();
  const [rows, setRows] = useState<Row<"profiles">[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "analyst" as "owner" | "analyst" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase().from("profiles").select("*").order("created_at");
    setRows(data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    setSaving(true);
    const res = await createTeamMember(form);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Pessoa adicionada! Envie o e-mail e a senha para ela.");
    setAdding(false);
    setForm({ name: "", email: "", password: "", role: "analyst" });
    void load();
  }

  async function update(id: string, patch: Partial<Row<"profiles">>) {
    const { error } = await supabase().from("profiles").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    void load();
  }

  if (!rows) return <Spinner />;
  return (
    <Card>
      <CardHeader icon="" title="Equipe" subtitle="Donos configuram tudo; analistas atendem, ensinam e gerenciam casos." actions={isOwner && <Button size="sm" onClick={() => setAdding(true)}>+ Adicionar pessoa</Button>} />
      <div className="divide-y divide-line">
        {rows.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <Avatar name={p.full_name || p.email} size={36} />
            <div className="min-w-0 flex-1">
              <div className="font-bold">{p.full_name || "—"} {p.id === userId && <span className="text-xs text-ink-3">(você)</span>}</div>
              <div className="text-sm text-ink-2">{p.email}</div>
            </div>
            <Select value={p.role} onChange={(e) => update(p.id, { role: e.target.value })} disabled={!isOwner || p.id === userId} className="h-9 w-36">
              <option value="owner">Dono</option>
              <option value="analyst">Analista</option>
            </Select>
            <Switch checked={p.active} onChange={(v) => update(p.id, { active: v })} disabled={!isOwner || p.id === userId} label={<span className="text-xs">{p.active ? "ativo" : "bloqueado"}</span>} />
            {isOwner && p.id !== userId && (
              <Button size="xs" variant="ghost" onClick={async () => {
                const pw = prompt("Nova senha (mín. 8 caracteres):");
                if (!pw) return;
                const r = await resetMemberPassword(p.id, pw);
                if (r.ok) toast.success("Senha alterada"); else toast.error(r.error);
              }}>senha</Button>
            )}
          </div>
        ))}
      </div>
      <Modal open={adding} onClose={() => setAdding(false)} title="Adicionar pessoa" size="sm" footer={<><Button variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button><Button onClick={add} loading={saving}>Adicionar</Button></>}>
        <div className="space-y-3">
          <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="E-mail"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Senha inicial" hint="Mínimo 8 caracteres."><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Papel">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "owner" | "analyst" })}>
              <option value="analyst">Analista</option>
              <option value="owner">Dono</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </Card>
  );
}
