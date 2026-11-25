-- =====================================================================
-- 002 · CRM: clientes, contatos, veículos · Serviços (processos) · Base de
--       conhecimento com histórico de versões · Casos
-- =====================================================================

-- ---------------------------------------------------------------------
-- Clientes (titulares: PF ou PJ)
-- ---------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'pf' check (kind in ('pf', 'pj')),
  name text not null,
  doc text,                                   -- CPF/CNPJ somente dígitos
  email text,
  city text,
  address text,
  tags text[] not null default '{}',
  team_notes_md text not null default '',     -- Notas da equipe (só humanos)
  ai_notes_md text not null default '',       -- Notas da IA
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clients_doc_unique on public.clients (doc, is_test) where doc is not null;
create index clients_name_trgm on public.clients using gin (public.f_unaccent(lower(name)) extensions.gin_trgm_ops);
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Contatos (quem conversa no WhatsApp) — identificados pelo telefone
-- ---------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  phone text not null,                        -- E.164 sem "+": 5541999998888
  wa_name text,                               -- nome do perfil do WhatsApp
  name text,                                  -- nome confirmado
  is_test boolean not null default false,
  blocked boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contacts_phone_unique on public.contacts (phone, is_test);
create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();

-- contato ≠ titular: a esposa resolve o carro do marido, o lojista fala por vários clientes
create table public.contact_clients (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  relation text not null default 'titular'
    check (relation in ('titular', 'familiar', 'conjuge', 'funcionario', 'lojista', 'procurador', 'outro')),
  verified boolean not null default false,    -- só vínculos verificados liberam dados do caso para a IA
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (contact_id, client_id)
);
create index contact_clients_client on public.contact_clients (client_id);

-- ---------------------------------------------------------------------
-- Veículos
-- ---------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  plate text,                                 -- normalizada: ABC1D23
  renavam text,
  chassis text,
  model text,
  year text,
  color text,
  notes text not null default '',
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vehicles_plate on public.vehicles (plate);
create index vehicles_client on public.vehicles (client_id);
create trigger vehicles_touch before update on public.vehicles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Serviços (processos) e sua estrutura
-- ---------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  emoji text not null default '📄',
  color text not null default '#2457F5',
  code_prefix text not null default 'CAS',
  short_description text not null default '',
  instructions_md text not null default '',
  mode_override text check (mode_override in ('auto', 'copilot', 'manual')),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger services_touch before update on public.services
  for each row execute function public.touch_updated_at();

create table public.service_stages (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  key text not null,
  name text not null,
  emoji text not null default '⚪',
  color text not null default '#94a3b8',
  sort_order int not null default 0,
  instructions_md text not null default '',
  waiting_on text check (waiting_on in ('client', 'office', 'detran', 'payment')),
  ai_can_advance boolean not null default false,   -- IA pode avançar sozinha a partir desta fase
  require_checklist boolean not null default false, -- IA só sai desta fase com dados/documentos obrigatórios completos
  notify_mode text not null default 'none' check (notify_mode in ('auto', 'approval', 'none')),
  notify_template text not null default '',
  mode_override text check (mode_override in ('auto', 'copilot', 'manual')),
  is_final boolean not null default false,
  is_canceled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, key)
);
create index service_stages_service on public.service_stages (service_id, sort_order);
create trigger service_stages_touch before update on public.service_stages
  for each row execute function public.touch_updated_at();

create table public.service_fields (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  key text not null,
  label text not null,
  type text not null default 'text' check (type in (
    'text', 'cpf', 'cnpj', 'cpf_cnpj', 'plate', 'renavam', 'chassis', 'date',
    'phone', 'email', 'money', 'number', 'select', 'boolean')),
  required boolean not null default true,
  options jsonb not null default '[]',
  ai_hint text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, key)
);
create trigger service_fields_touch before update on public.service_fields
  for each row execute function public.touch_updated_at();

create table public.service_documents (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  key text not null,
  label text not null,
  description text not null default '',
  required boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, key)
);
create trigger service_documents_touch before update on public.service_documents
  for each row execute function public.touch_updated_at();

create table public.service_prices (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  label text not null,
  amount numeric(12, 2),                       -- null = "a confirmar pela equipe"
  kind text not null default 'honorario' check (kind in ('honorario', 'taxa', 'opcional')),
  notes text not null default '',
  needs_review boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger service_prices_touch before update on public.service_prices
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Base de conhecimento (regras, informações, FAQs, lições)
-- ---------------------------------------------------------------------
create table public.knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'global' check (scope in ('global', 'service', 'stage')),
  service_id uuid references public.services(id) on delete cascade,
  stage_id uuid references public.service_stages(id) on delete cascade,
  kind text not null default 'info' check (kind in ('info', 'regra', 'faq', 'licao')),
  title text not null,
  content_md text not null default '',
  always_include boolean not null default false,
  active boolean not null default true,
  source text not null default 'manual' check (source in ('manual', 'ensinar', 'correcao', 'seed')),
  embedding extensions.vector,
  embedding_model text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fts tsvector generated always as (
    to_tsvector('portuguese'::regconfig, public.f_unaccent(coalesce(title, '') || ' ' || coalesce(content_md, '')))
  ) stored,
  check (
    (scope = 'global' and service_id is null and stage_id is null) or
    (scope = 'service' and service_id is not null and stage_id is null) or
    (scope = 'stage' and stage_id is not null)
  )
);
create index knowledge_docs_fts on public.knowledge_docs using gin (fts);
create index knowledge_docs_scope on public.knowledge_docs (scope, service_id, stage_id);
create trigger knowledge_docs_touch before update on public.knowledge_docs
  for each row execute function public.touch_updated_at();

-- busca híbrida: palavras (sempre) + semântica (quando houver embeddings do mesmo modelo)
create or replace function public.search_knowledge(
  p_query text,
  p_embedding extensions.vector default null,
  p_model text default null,
  p_service_ids uuid[] default null,
  p_limit int default 6
) returns table (
  id uuid, title text, kind text, scope text, service_id uuid, stage_id uuid, content_md text, score real
)
language plpgsql stable security definer set search_path = public, extensions
as $$
declare v_tsq tsquery;
begin
  begin
    v_tsq := replace(plainto_tsquery('portuguese', public.f_unaccent(coalesce(p_query, '')))::text, '&', '|')::tsquery;
  exception when others then
    v_tsq := null;
  end;
  return query
  select d.id, d.title, d.kind, d.scope, d.service_id, d.stage_id, d.content_md,
         (case when p_embedding is not null and d.embedding is not null and d.embedding_model = p_model
               then (1 - (d.embedding <=> p_embedding))::real else 0::real end
          + case when v_tsq is not null then ts_rank(d.fts, v_tsq)::real else 0::real end) as score
    from public.knowledge_docs d
   where d.active
     and (p_service_ids is null or d.scope = 'global' or d.service_id = any (p_service_ids))
     and (
       (p_embedding is not null and d.embedding is not null and d.embedding_model = p_model)
       or (v_tsq is not null and d.fts @@ v_tsq)
     )
   order by score desc
   limit p_limit;
end $$;

-- ---------------------------------------------------------------------
-- Histórico de versões (para desfazer qualquer alteração de conhecimento)
-- ---------------------------------------------------------------------
create table public.knowledge_versions (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text not null,
  op text not null,
  snapshot jsonb not null,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index knowledge_versions_row on public.knowledge_versions (table_name, row_id, created_at desc);

create or replace function public.log_version() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_old jsonb := to_jsonb(old) - 'embedding' - 'embedding_model' - 'fts' - 'updated_at';
begin
  if tg_op = 'UPDATE' then
    if v_old = (to_jsonb(new) - 'embedding' - 'embedding_model' - 'fts' - 'updated_at') then
      return new;
    end if;
  end if;
  insert into public.knowledge_versions (table_name, row_id, op, snapshot, changed_by)
  values (tg_table_name, old.id::text, tg_op, to_jsonb(old) - 'embedding' - 'fts', auth.uid());
  return coalesce(new, old);
end $$;

create trigger services_version before update or delete on public.services
  for each row execute function public.log_version();
create trigger service_stages_version before update or delete on public.service_stages
  for each row execute function public.log_version();
create trigger service_fields_version before update or delete on public.service_fields
  for each row execute function public.log_version();
create trigger service_documents_version before update or delete on public.service_documents
  for each row execute function public.log_version();
create trigger service_prices_version before update or delete on public.service_prices
  for each row execute function public.log_version();
create trigger knowledge_docs_version before update or delete on public.knowledge_docs
  for each row execute function public.log_version();
create trigger settings_version before update on public.settings
  for each row execute function public.log_version();

create or replace function public.restore_version(p_version_id bigint) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v record;
  v_set text;
  v_cols text;
  v_sel text;
  v_count int;
begin
  if not (public.is_staff() or public.is_service_role()) then raise exception 'Acesso negado'; end if;
  select * into v from public.knowledge_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada'; end if;
  if v.table_name not in ('services', 'service_stages', 'service_fields', 'service_documents',
                          'service_prices', 'knowledge_docs', 'settings') then
    raise exception 'Tabela não suportada';
  end if;

  select string_agg(format('%I = r.%I', column_name, column_name), ', '),
         string_agg(format('%I', column_name), ', '),
         string_agg(format('r.%I', column_name), ', ')
    into v_set, v_cols, v_sel
    from information_schema.columns
   where table_schema = 'public' and table_name = v.table_name
     and column_name not in ('id', 'created_at', 'updated_at', 'embedding', 'embedding_model', 'fts')
     and is_generated = 'NEVER';

  execute format(
    'update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.id = r.id',
    v.table_name, v_set, v.table_name) using v.snapshot;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    -- linha foi apagada: recria com o mesmo id
    execute format(
      'insert into public.%I (id, %s) select r.id, %s from jsonb_populate_record(null::public.%I, $1) r',
      v.table_name, v_cols, v_sel, v.table_name) using v.snapshot;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Casos (um processo de um cliente)
-- ---------------------------------------------------------------------
create sequence public.case_number_seq;

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  number int not null default nextval('public.case_number_seq'),
  code text,
  service_id uuid not null references public.services(id),
  stage_id uuid not null references public.service_stages(id),
  client_id uuid references public.clients(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  conversation_id uuid,
  assigned_to uuid references public.profiles(id) on delete set null,
  title text not null default '',
  fields jsonb not null default '{}',          -- {chave: {value, status, source, updated_at}}
  quote jsonb not null default '{}',           -- {itens:[], total, enviado_em, aceito_em}
  quote_status text not null default 'none' check (quote_status in ('none', 'enviado', 'aceito', 'pago')),
  team_notes_md text not null default '',
  ai_notes_md text not null default '',
  next_action text not null default '',
  due_at timestamptz,
  priority text not null default 'normal' check (priority in ('baixa', 'normal', 'alta', 'urgente')),
  last_change_actor text,                      -- 'ai' | 'human' | 'system' (quem mexeu por último na fase)
  last_change_run_id uuid,
  is_test boolean not null default false,
  opened_at timestamptz not null default now(),
  stage_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cases_service_stage on public.cases (service_id, stage_id);
create index cases_client on public.cases (client_id);
create index cases_contact on public.cases (contact_id);
create trigger cases_touch before update on public.cases
  for each row execute function public.touch_updated_at();

create table public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  doc_key text not null,
  label text not null,
  required boolean not null default true,
  status text not null default 'pendente' check (status in ('pendente', 'recebido', 'validado', 'recusado')),
  message_id uuid,
  media_path text,
  extracted jsonb not null default '{}',
  notes text not null default '',
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, doc_key)
);
create trigger case_documents_touch before update on public.case_documents
  for each row execute function public.touch_updated_at();

create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  type text not null,
  actor text not null default 'system' check (actor in ('ai', 'human', 'system', 'client')),
  actor_id uuid,
  ai_run_id uuid,
  description text not null default '',
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index case_events_case on public.case_events (case_id, created_at desc);

-- código legível (TRF-0001) + checklist de documentos do serviço
create or replace function public.on_case_before_insert() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.code is null then
    select code_prefix || '-' || lpad(new.number::text, 4, '0') into new.code
      from public.services where id = new.service_id;
  end if;
  if not exists (select 1 from public.service_stages where id = new.stage_id and service_id = new.service_id) then
    raise exception 'A fase não pertence a este serviço';
  end if;
  return new;
end $$;
create trigger cases_before_insert before insert on public.cases
  for each row execute function public.on_case_before_insert();

create or replace function public.on_case_after_insert() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.case_documents (case_id, doc_key, label, required)
  select new.id, d.key, d.label, d.required
    from public.service_documents d
   where d.service_id = new.service_id
   order by d.sort_order;
  insert into public.case_events (case_id, type, actor, actor_id, ai_run_id, description)
  values (new.id, 'criado',
          case when auth.uid() is not null then 'human' else coalesce(new.last_change_actor, 'system') end,
          auth.uid(), new.last_change_run_id, 'Caso aberto');
  return new;
end $$;
create trigger cases_after_insert after insert on public.cases
  for each row execute function public.on_case_after_insert();

create or replace function public.on_case_before_update() returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_stage record;
begin
  if new.stage_id is distinct from old.stage_id then
    select * into v_stage from public.service_stages where id = new.stage_id;
    if not found or v_stage.service_id <> new.service_id then
      raise exception 'A fase não pertence a este serviço';
    end if;
    new.stage_changed_at := now();
    if v_stage.is_final or v_stage.is_canceled then
      new.closed_at := coalesce(new.closed_at, now());
    else
      new.closed_at := null;
    end if;
  end if;
  return new;
end $$;
create trigger cases_before_update before update on public.cases
  for each row execute function public.on_case_before_update();
