-- =====================================================================
-- 010 · Botão "Testar" por tarefa de IA (Configurações → IA)
-- =====================================================================
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
    if p_type not in ('llm_test', 'task_test', 'run_scenario', 'reembed_all', 'process_conversation') then
      raise exception 'Tipo de tarefa não permitido: %', p_type;
    end if;
  end if;
  return public.enqueue_job_internal(p_type, p_payload, p_dedupe_key, p_delay_seconds, p_max_attempts);
end $$;
