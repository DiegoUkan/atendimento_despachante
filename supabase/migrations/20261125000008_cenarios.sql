-- =====================================================================
-- 008 · Conversas geradas por cenários de teste ficam marcadas:
--       o worker não as processa pela fila normal (o cenário conduz).
-- =====================================================================
alter table public.conversations
  add column scenario_id uuid references public.test_scenarios(id) on delete cascade;
create index conversations_scenario on public.conversations (scenario_id) where scenario_id is not null;
