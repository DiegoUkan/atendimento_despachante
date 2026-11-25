-- =====================================================================
-- 009 · Primeiro acesso: a tela de login sabe se ainda não existe dono
-- =====================================================================
create or replace function public.needs_setup() returns boolean
language sql stable security definer set search_path = public
as $$ select not exists (select 1 from public.profiles) $$;

grant execute on function public.needs_setup() to anon, authenticated;
