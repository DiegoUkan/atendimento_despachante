-- =====================================================================
-- 007 · Separa a fila interna (usada pelos gatilhos) da RPC do painel
--   enqueue_job_internal → sem checagens, não exposta à API
--   enqueue_job          → RPC com checagem de equipe + tipos permitidos
-- =====================================================================

create or replace function public.enqueue_job_internal(
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
revoke execute on function public.enqueue_job_internal(text, jsonb, text, numeric, int) from public, anon, authenticated;
grant execute on function public.enqueue_job_internal(text, jsonb, text, numeric, int) to service_role;

create or replace function public.enqueue_job(
  p_type text,
  p_payload jsonb default '{}',
  p_dedupe_key text default null,
  p_delay_seconds numeric default 0,
  p_max_attempts int default 3
) returns bigint
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_service_role() then
    if not public.is_staff() then
      raise exception 'Acesso negado';
    end if;
    if p_type not in ('llm_test', 'run_scenario', 'reembed_all', 'process_conversation') then
      raise exception 'Tipo de tarefa não permitido: %', p_type;
    end if;
  end if;
  return public.enqueue_job_internal(p_type, p_payload, p_dedupe_key, p_delay_seconds, p_max_attempts);
end $$;

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
    perform public.enqueue_job_internal('process_conversation',
      jsonb_build_object('conversation_id', new.conversation_id),
      'conv:' || new.conversation_id::text, coalesce(v_delay, 8));
  elsif new.status = 'queued' then
    perform public.enqueue_job_internal('send_messages',
      jsonb_build_object('conversation_id', new.conversation_id),
      'send:' || new.conversation_id::text, 0, 5);
  end if;
  return new;
end $$;

create or replace function public.on_message_status_changed() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.direction = 'out' and new.status = 'queued' then
      perform public.enqueue_job_internal('send_messages',
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
    perform public.enqueue_job_internal('case_stage_changed',
      jsonb_build_object('case_id', new.id, 'from_stage', old.stage_id, 'to_stage', new.stage_id, 'actor', v_actor),
      null, 0);
  end if;
  return new;
end $$;

create or replace function public.on_teach_message_inserted() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role = 'user' then
    update public.teach_sessions set status = 'thinking', last_error = null where id = new.session_id;
    perform public.enqueue_job_internal('teach_reply', jsonb_build_object('session_id', new.session_id),
      'teach:' || new.session_id::text, 0, 2);
  end if;
  return new;
end $$;

create or replace function public.on_knowledge_changed() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.title is distinct from old.title or new.content_md is distinct from old.content_md then
    perform public.enqueue_job_internal('embed_knowledge', jsonb_build_object('doc_id', new.id),
      'embed:' || new.id::text, 2, 2);
  end if;
  return new;
end $$;

revoke execute on function
  public.on_message_inserted(), public.on_message_status_changed(), public.on_case_stage_changed(),
  public.on_teach_message_inserted(), public.on_knowledge_changed()
from public, anon, authenticated;
