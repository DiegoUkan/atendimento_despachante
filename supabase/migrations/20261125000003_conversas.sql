-- =====================================================================
-- 003 · Conversas, mensagens, Raio-X da IA, aprovações, ensino,
--       cenários de teste e fila de tarefas (jobs) no Postgres
-- =====================================================================

-- ---------------------------------------------------------------------
-- Conversas: UMA por contato, unificando todos os números da empresa
-- ---------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null unique references public.contacts(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'waiting_human', 'closed')),
  mode text check (mode in ('auto', 'copilot', 'manual')),     -- null = herda
  assigned_to uuid references public.profiles(id) on delete set null,
  last_channel_id uuid references public.channels(id) on delete set null,
  active_case_id uuid references public.cases(id) on delete set null,
  last_message_at timestamptz,
  last_message_preview text,
  last_inbound_at timestamptz,
  unread_count int not null default 0,
  pending_drafts int not null default 0,
  handoff_reason text,
  handoff_summary text,
  handoff_at timestamptz,
  ai_processed_until timestamptz,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_last on public.conversations (last_message_at desc nulls last);
create trigger conversations_touch before update on public.conversations
  for each row execute function public.touch_updated_at();

alter table public.cases
  add constraint cases_conversation_fk foreign key (conversation_id)
  references public.conversations(id) on delete set null;

-- ---------------------------------------------------------------------
-- Raio-X: cada execução da IA com o "porquê" de cada decisão
-- ---------------------------------------------------------------------
create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  kind text not null default 'atendimento' check (kind in ('atendimento', 'ensinar', 'notificacao', 'cenario')),
  status text not null default 'running' check (status in ('running', 'done', 'error', 'superseded', 'skipped')),
  mode text,
  mode_source text,
  trigger_message_ids uuid[] not null default '{}',
  case_id uuid references public.cases(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  stage_id uuid references public.service_stages(id) on delete set null,
  rationale text,
  confidence numeric,
  handoff boolean not null default false,
  handoff_reason text,
  held_for_review boolean not null default false,   -- baixa confiança: virou rascunho
  context jsonb not null default '{}',
  knowledge jsonb not null default '[]',
  tools jsonb not null default '[]',
  output jsonb not null default '{}',
  model text,
  provider text,
  tokens_in int,
  tokens_out int,
  latency_ms int,
  error text,
  rating text check (rating in ('bom', 'ruim')),
  feedback text,
  teach_session_id uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index ai_runs_conversation on public.ai_runs (conversation_id, created_at desc);

-- ---------------------------------------------------------------------
-- Mensagens
-- ---------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  direction text not null check (direction in ('in', 'out')),
  sender text not null check (sender in ('contact', 'ai', 'human', 'system')),
  sender_profile_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'text'
    check (kind in ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'other')),
  body text not null default '',
  media_path text,
  media_mime text,
  media_name text,
  transcript text,
  media_description text,
  status text not null default 'received'
    check (status in ('received', 'draft', 'queued', 'sending', 'sent', 'failed', 'discarded')),
  error text,
  external_id text,
  ai_run_id uuid references public.ai_runs(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index messages_conversation on public.messages (conversation_id, created_at);
create index messages_drafts on public.messages (conversation_id) where status = 'draft';
create index messages_external on public.messages (external_id) where external_id is not null;

-- ---------------------------------------------------------------------
-- Aprovações (ex.: IA sugeriu mudar de fase mas a fase exige humano)
-- ---------------------------------------------------------------------
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('mudar_fase')),
  case_id uuid references public.cases(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  ai_run_id uuid references public.ai_runs(id) on delete set null,
  payload jsonb not null default '{}',
  reason text not null default '',
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index approvals_pending on public.approvals (created_at desc) where status = 'pendente';

-- ---------------------------------------------------------------------
-- Ensinar a IA: conversas com o "instrutor" que propõe alterações
-- ---------------------------------------------------------------------
create table public.teach_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Nova conversa',
  created_by uuid references public.profiles(id) on delete set null,
  context_run_id uuid references public.ai_runs(id) on delete set null,
  status text not null default 'idle' check (status in ('idle', 'thinking', 'error')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger teach_sessions_touch before update on public.teach_sessions
  for each row execute function public.touch_updated_at();

alter table public.ai_runs
  add constraint ai_runs_teach_fk foreign key (teach_session_id)
  references public.teach_sessions(id) on delete set null;

create table public.teach_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.teach_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  author_id uuid references public.profiles(id) on delete set null,
  ai_run_id uuid references public.ai_runs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index teach_messages_session on public.teach_messages (session_id, created_at);

create table public.knowledge_proposals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.teach_sessions(id) on delete cascade,
  teach_message_id uuid references public.teach_messages(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  title text not null default '',
  explanation text not null default '',
  before jsonb,
  after jsonb not null default '{}',
  status text not null default 'pendente' check (status in ('pendente', 'aplicada', 'recusada', 'erro')),
  error text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index knowledge_proposals_session on public.knowledge_proposals (session_id, created_at);

-- ---------------------------------------------------------------------
-- Cenários de teste (regressão): conversas roteirizadas + expectativa
-- ---------------------------------------------------------------------
create table public.test_scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  client_messages jsonb not null default '[]',    -- ["oi", "quero transferir meu carro", ...]
  expectations text not null default '',          -- o que a IA DEVE / NÃO DEVE fazer
  setup jsonb not null default '{}',              -- {service_slug, stage_key} para começar com um caso aberto
  last_status text check (last_status in ('running', 'passou', 'falhou', 'erro')),
  last_result jsonb,
  last_run_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger test_scenarios_touch before update on public.test_scenarios
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- Fila de tarefas no próprio Postgres (sem Redis)
--   • dedupe_key + run_at  → agrupamento de mensagens (debounce)
--   • só 1 job "running" por dedupe_key → uma conversa por vez
--   • locked_until         → recupera tarefas de um worker que caiu
-- =====================================================================
create table public.jobs (
  id bigint generated always as identity primary key,
  type text not null,
  payload jsonb not null default '{}',
  dedupe_key text,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 3,
  locked_by text,
  locked_until timestamptz,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index jobs_dedupe_pending on public.jobs (dedupe_key) where status = 'pending';
create index jobs_ready on public.jobs (run_at) where status = 'pending';
create index jobs_running_key on public.jobs (dedupe_key) where status = 'running';
create index jobs_cleanup on public.jobs (updated_at) where status in ('done', 'failed');

create or replace function public.enqueue_job(
  p_type text,
  p_payload jsonb default '{}',
  p_dedupe_key text default null,
  p_delay_seconds numeric default 0,
  p_max_attempts int default 3
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_id bigint;
  v_run timestamptz := now() + make_interval(secs => greatest(p_delay_seconds, 0));
  v_max_wait numeric := greatest(p_delay_seconds * 4, 30);
begin
  -- chamadas pela API exigem equipe ou service_role; gatilhos/migrações (sem JWT) passam
  if auth.jwt() is not null and not (public.is_staff() or public.is_service_role()) then
    raise exception 'Acesso negado';
  end if;
  if p_dedupe_key is null then
    insert into public.jobs (type, payload, run_at, max_attempts)
    values (p_type, p_payload, v_run, p_max_attempts)
    returning id into v_id;
  else
    insert into public.jobs (type, payload, dedupe_key, run_at, max_attempts)
    values (p_type, p_payload, p_dedupe_key, v_run, p_max_attempts)
    on conflict (dedupe_key) where status = 'pending'
    do update set
      -- empurra o horário (debounce), mas nunca espera mais que v_max_wait desde o 1º pedido
      run_at = least(excluded.run_at, public.jobs.created_at + make_interval(secs => v_max_wait)),
      payload = public.jobs.payload || excluded.payload,
      updated_at = now()
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- antecipa um job agrupado (botão "responder agora" do simulador)
create or replace function public.run_job_now(p_dedupe_key text) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (public.is_staff() or public.is_service_role()) then raise exception 'Acesso negado'; end if;
  update public.jobs set run_at = now(), updated_at = now()
   where dedupe_key = p_dedupe_key and status = 'pending';
end $$;

create or replace function public.claim_jobs(p_worker text, p_limit int default 5, p_lock_seconds int default 180)
returns setof public.jobs
language plpgsql security definer set search_path = public
as $$
begin
  if auth.jwt() is not null and not public.is_service_role() then
    raise exception 'Acesso negado';
  end if;

  -- recupera tarefas travadas (worker caiu no meio)
  update public.jobs s
     set status = case
           when s.dedupe_key is not null and exists (
             select 1 from public.jobs p where p.dedupe_key = s.dedupe_key and p.status = 'pending')
           then 'failed' else 'pending' end,
         last_error = 'Trava expirada (worker reiniciou?)',
         locked_by = null,
         updated_at = now()
   where s.status = 'running' and s.locked_until < now();

  return query
  with ready as (
    select j.id
      from public.jobs j
     where j.status = 'pending'
       and j.run_at <= now()
       and (j.dedupe_key is null or not exists (
             select 1 from public.jobs r where r.dedupe_key = j.dedupe_key and r.status = 'running'))
     order by j.run_at
     limit p_limit
     for update skip locked
  )
  update public.jobs j
     set status = 'running',
         locked_by = p_worker,
         locked_until = now() + make_interval(secs => p_lock_seconds),
         attempts = j.attempts + 1,
         updated_at = now()
    from ready
   where j.id = ready.id
  returning j.*;
end $$;

create or replace function public.complete_job(p_id bigint, p_result jsonb default null) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_service_role() then raise exception 'Acesso negado'; end if;
  update public.jobs set status = 'done', result = p_result, locked_by = null, updated_at = now()
   where id = p_id;
end $$;

create or replace function public.fail_job(p_id bigint, p_error text, p_retry_in_seconds int default 15) returns void
language plpgsql security definer set search_path = public
as $$
declare v public.jobs;
begin
  if not public.is_service_role() then raise exception 'Acesso negado'; end if;
  select * into v from public.jobs where id = p_id for update;
  if not found then return; end if;
  if v.attempts >= v.max_attempts
     or (v.dedupe_key is not null and exists (
          select 1 from public.jobs p where p.dedupe_key = v.dedupe_key and p.status = 'pending' and p.id <> v.id)) then
    update public.jobs set status = 'failed', last_error = p_error, locked_by = null, updated_at = now() where id = p_id;
  else
    update public.jobs
       set status = 'pending', last_error = p_error, locked_by = null,
           run_at = now() + make_interval(secs => p_retry_in_seconds * v.attempts),
           updated_at = now()
     where id = p_id;
  end if;
end $$;

-- =====================================================================
-- Gatilhos que conectam tudo
-- =====================================================================

-- nova mensagem → atualiza conversa; se é do cliente → agenda a IA (com debounce)
create or replace function public.on_message_inserted() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_conv public.conversations;
  v_delay int;
begin
  if new.status = 'draft' then
    update public.conversations
       set pending_drafts = (select count(*) from public.messages where conversation_id = new.conversation_id and status = 'draft')
     where id = new.conversation_id;
    return new;
  end if;

  update public.conversations set
    last_message_at = new.created_at,
    last_message_preview = left(case when new.body <> '' then new.body else '[' || new.kind || ']' end, 160),
    last_inbound_at = case when new.direction = 'in' then new.created_at else last_inbound_at end,
    last_channel_id = case when new.direction = 'in' and new.channel_id is not null then new.channel_id else last_channel_id end,
    unread_count = case when new.direction = 'in' then unread_count + 1 else unread_count end,
    status = case when status = 'closed' and new.direction = 'in' then 'open' else status end
  where id = new.conversation_id
  returning * into v_conv;

  if new.direction = 'in' then
    update public.contacts set last_seen_at = new.created_at where id = v_conv.contact_id;
    select case when v_conv.is_test then test_debounce_seconds else debounce_seconds end
      into v_delay from public.settings where id = 1;
    perform public.enqueue_job('process_conversation',
      jsonb_build_object('conversation_id', new.conversation_id),
      'conv:' || new.conversation_id::text, coalesce(v_delay, 8));
  elsif new.status = 'queued' then
    perform public.enqueue_job('send_messages',
      jsonb_build_object('conversation_id', new.conversation_id),
      'send:' || new.conversation_id::text, 0, 5);
  end if;
  return new;
end $$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.on_message_inserted();

-- rascunho aprovado → entra na fila de envio
create or replace function public.on_message_status_changed() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.direction = 'out' and new.status = 'queued' then
      perform public.enqueue_job('send_messages',
        jsonb_build_object('conversation_id', new.conversation_id),
        'send:' || new.conversation_id::text, 0, 5);
      if old.status = 'draft' then
        update public.conversations set
          last_message_at = now(),
          last_message_preview = left(case when new.body <> '' then new.body else '[' || new.kind || ']' end, 160)
        where id = new.conversation_id;
      end if;
    end if;
    if old.status = 'draft' or new.status = 'draft' then
      update public.conversations
         set pending_drafts = (select count(*) from public.messages where conversation_id = new.conversation_id and status = 'draft')
       where id = new.conversation_id;
    end if;
  end if;
  return new;
end $$;
create trigger messages_after_update after update of status on public.messages
  for each row execute function public.on_message_status_changed();

-- mudança de fase → linha do tempo + tarefa de aviso ao cliente
create or replace function public.on_case_stage_changed() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_from text;
  v_to text;
  v_actor text := case when auth.uid() is not null then 'human' else coalesce(new.last_change_actor, 'system') end;
begin
  if new.stage_id is distinct from old.stage_id then
    select name into v_from from public.service_stages where id = old.stage_id;
    select name into v_to from public.service_stages where id = new.stage_id;
    insert into public.case_events (case_id, type, actor, actor_id, ai_run_id, description, data)
    values (new.id, 'fase', v_actor, auth.uid(),
            case when v_actor = 'ai' then new.last_change_run_id end,
            'Fase: ' || coalesce(v_from, '?') || ' → ' || coalesce(v_to, '?'),
            jsonb_build_object('from', old.stage_id, 'to', new.stage_id));
    perform public.enqueue_job('case_stage_changed',
      jsonb_build_object('case_id', new.id, 'from_stage', old.stage_id, 'to_stage', new.stage_id, 'actor', v_actor),
      null, 0);
  end if;
  return new;
end $$;
create trigger cases_stage_changed after update of stage_id on public.cases
  for each row execute function public.on_case_stage_changed();

-- mensagem no "Ensinar a IA" → agenda resposta do instrutor
create or replace function public.on_teach_message_inserted() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role = 'user' then
    update public.teach_sessions set status = 'thinking', last_error = null where id = new.session_id;
    perform public.enqueue_job('teach_reply', jsonb_build_object('session_id', new.session_id),
      'teach:' || new.session_id::text, 0, 2);
  end if;
  return new;
end $$;
create trigger teach_messages_after_insert after insert on public.teach_messages
  for each row execute function public.on_teach_message_inserted();

-- conhecimento alterado → recalcula embedding (o worker ignora se não houver modelo configurado)
create or replace function public.on_knowledge_changed() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.title is distinct from old.title or new.content_md is distinct from old.content_md then
    perform public.enqueue_job('embed_knowledge', jsonb_build_object('doc_id', new.id),
      'embed:' || new.id::text, 2, 2);
  end if;
  return new;
end $$;
create trigger knowledge_docs_embed after insert or update of title, content_md on public.knowledge_docs
  for each row execute function public.on_knowledge_changed();
