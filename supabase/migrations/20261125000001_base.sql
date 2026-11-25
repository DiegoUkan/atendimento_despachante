-- =====================================================================
-- 001 · Base: extensões, utilitários, equipe, configurações, IA, canais
-- =====================================================================

create extension if not exists vector with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- unaccent "imutável" para índices / colunas geradas
create or replace function public.f_unaccent(text) returns text
language sql immutable parallel safe strict
set search_path = public, extensions
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public
as $$ begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------
-- Equipe (perfis ligados ao auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  role text not null default 'analyst' check (role in ('owner', 'analyst')),
  active boolean not null default false,
  color text not null default '#2457F5',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- primeiro usuário vira dono; demais só entram ativos se criados pelo dono
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_first boolean;
begin
  select not exists (select 1 from public.profiles) into v_first;
  insert into public.profiles (id, full_name, email, role, active)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    case when v_first then 'owner' else coalesce(new.raw_app_meta_data ->> 'role', 'analyst') end,
    v_first or coalesce((new.raw_app_meta_data ->> 'invited')::boolean, false)
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and active) $$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'owner') $$;

create or replace function public.is_service_role() returns boolean
language sql stable set search_path = public
as $$ select coalesce(auth.jwt() ->> 'role', '') = 'service_role' $$;

-- ---------------------------------------------------------------------
-- Configurações gerais (linha única)
-- ---------------------------------------------------------------------
create table public.settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'Seu Despachante',
  company_city text not null default 'Campo Largo - PR',
  company_address text not null default '',
  company_phone text not null default '',
  about_md text not null default '',
  assistant_name text not null default 'Lia',
  assistant_emoji text not null default '🦉',
  persona jsonb not null default '{"formalidade": 45, "emojis": 30, "tamanho": 35, "calor": 75}',
  persona_extra_md text not null default '',
  default_mode text not null default 'copilot' check (default_mode in ('auto', 'copilot', 'manual')),
  debounce_seconds int not null default 8 check (debounce_seconds between 0 and 120),
  test_debounce_seconds int not null default 3 check (test_debounce_seconds between 0 and 120),
  confidence_threshold numeric not null default 0.55 check (confidence_threshold between 0 and 1),
  history_messages int not null default 30 check (history_messages between 5 and 100),
  business_hours jsonb not null default '{
    "0": [],
    "1": [["08:00", "12:00"], ["13:30", "18:00"]],
    "2": [["08:00", "12:00"], ["13:30", "18:00"]],
    "3": [["08:00", "12:00"], ["13:30", "18:00"]],
    "4": [["08:00", "12:00"], ["13:30", "18:00"]],
    "5": [["08:00", "12:00"], ["13:30", "18:00"]],
    "6": [["08:00", "12:00"]]
  }',
  holidays jsonb not null default '[]',
  timezone text not null default 'America/Sao_Paulo',
  out_of_hours_md text not null default '',
  pix_key text not null default '',
  pix_key_type text not null default '',
  pix_holder text not null default '',
  payment_notes text not null default '',
  onboarding_done boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();
insert into public.settings (id) values (1);

-- ---------------------------------------------------------------------
-- Provedores de IA (chave fica no Supabase Vault, nunca em texto puro)
-- ---------------------------------------------------------------------
create table public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_url text not null,
  secret_id uuid,
  key_hint text,
  models jsonb not null default '[]',
  last_test jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger ai_providers_touch before update on public.ai_providers
  for each row execute function public.touch_updated_at();

create table public.ai_task_models (
  task text primary key check (task in ('atendimento', 'ensinar', 'visao', 'transcricao', 'embeddings')),
  provider_id uuid references public.ai_providers(id) on delete set null,
  model text,
  temperature numeric not null default 0.4,
  supports_vision boolean not null default false,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger ai_task_models_touch before update on public.ai_task_models
  for each row execute function public.touch_updated_at();
insert into public.ai_task_models (task, temperature, supports_vision) values
  ('atendimento', 0.4, true),
  ('ensinar', 0.3, false),
  ('visao', 0.1, true),
  ('transcricao', 0, false),
  ('embeddings', 0, false);

create or replace function public.set_provider_key(p_provider_id uuid, p_key text) returns void
language plpgsql security definer set search_path = public
as $$
declare v_secret uuid;
begin
  if not (public.is_owner() or public.is_service_role()) then
    raise exception 'Apenas o dono pode alterar chaves de API';
  end if;
  if coalesce(trim(p_key), '') = '' then
    raise exception 'Chave vazia';
  end if;
  select secret_id into v_secret from public.ai_providers where id = p_provider_id;
  if not found then raise exception 'Provedor não encontrado'; end if;
  if v_secret is null then
    v_secret := vault.create_secret(trim(p_key), 'ai_provider_' || p_provider_id::text, 'Chave de API de provedor de IA');
  else
    perform vault.update_secret(v_secret, trim(p_key));
  end if;
  update public.ai_providers
     set secret_id = v_secret,
         key_hint = left(trim(p_key), 3) || '…' || right(trim(p_key), 4)
   where id = p_provider_id;
end $$;

create or replace function public.get_provider_key(p_provider_id uuid) returns text
language plpgsql security definer set search_path = public
as $$
declare v text;
begin
  if not public.is_service_role() then raise exception 'Acesso negado'; end if;
  select ds.decrypted_secret into v
    from vault.decrypted_secrets ds
    join public.ai_providers p on p.secret_id = ds.id
   where p.id = p_provider_id;
  return v;
end $$;

create or replace function public.on_ai_provider_deleted() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.secret_id is not null then
    delete from vault.secrets where id = old.secret_id;
  end if;
  return old;
end $$;
create trigger ai_providers_delete_secret after delete on public.ai_providers
  for each row execute function public.on_ai_provider_deleted();

-- ---------------------------------------------------------------------
-- Canais (números de WhatsApp). Agora: simulador. Depois: Evolution API.
-- ---------------------------------------------------------------------
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'simulator' check (kind in ('simulator', 'evolution')),
  phone text,
  emoji text not null default '📱',
  color text not null default '#2457F5',
  status text not null default 'connected' check (status in ('connected', 'disconnected', 'connecting')),
  mode_override text check (mode_override in ('auto', 'copilot', 'manual')),
  config jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger channels_touch before update on public.channels
  for each row execute function public.touch_updated_at();
