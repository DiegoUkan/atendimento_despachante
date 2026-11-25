-- =====================================================================
-- 006 · Ajustes apontados pelo Security Advisor
-- =====================================================================

-- funções de gatilho não devem ser chamáveis pela API
revoke execute on function
  public.handle_new_user(),
  public.log_version(),
  public.on_ai_provider_deleted(),
  public.on_case_after_insert(),
  public.on_case_before_insert(),
  public.on_case_before_update(),
  public.on_case_stage_changed(),
  public.on_knowledge_changed(),
  public.on_message_inserted(),
  public.on_message_status_changed(),
  public.on_teach_message_inserted(),
  public.touch_updated_at()
from authenticated;

-- busca respeita o RLS de quem chama (worker usa service_role)
alter function public.search_knowledge(text, extensions.vector, text, uuid[], int) security invoker;

-- o painel só pode enfileirar tipos de tarefa conhecidos
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
  if auth.jwt() is not null and not public.is_service_role() then
    if not public.is_staff() then
      raise exception 'Acesso negado';
    end if;
    if p_type not in ('llm_test', 'run_scenario', 'reembed_all', 'process_conversation') then
      raise exception 'Tipo de tarefa não permitido: %', p_type;
    end if;
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
      run_at = least(excluded.run_at, public.jobs.created_at + make_interval(secs => v_max_wait)),
      payload = public.jobs.payload || excluded.payload,
      updated_at = now()
    returning id into v_id;
  end if;
  return v_id;
end $$;
