-- =====================================================================
-- 004 · Segurança (RLS), permissões de funções, Realtime e Storage
--   • Equipe ativa (profiles.active) lê e opera o sistema
--   • Dono: configurações, provedores de IA, canais e equipe
--   • Worker usa a service_role (ignora RLS)
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'settings', 'ai_providers', 'ai_task_models', 'channels',
    'clients', 'contacts', 'contact_clients', 'vehicles',
    'services', 'service_stages', 'service_fields', 'service_documents', 'service_prices',
    'knowledge_docs', 'knowledge_versions',
    'cases', 'case_documents', 'case_events',
    'conversations', 'messages', 'ai_runs', 'approvals',
    'teach_sessions', 'teach_messages', 'knowledge_proposals',
    'test_scenarios', 'jobs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- tabelas operacionais: equipe ativa lê e escreve
do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'contacts', 'contact_clients', 'vehicles',
    'services', 'service_stages', 'service_fields', 'service_documents', 'service_prices',
    'knowledge_docs',
    'cases', 'case_documents', 'case_events',
    'conversations', 'messages', 'ai_runs', 'approvals',
    'teach_sessions', 'teach_messages', 'knowledge_proposals',
    'test_scenarios'
  ] loop
    execute format('create policy "equipe le %1$s" on public.%1$I for select to authenticated using (public.is_staff())', t);
    execute format('create policy "equipe cria %1$s" on public.%1$I for insert to authenticated with check (public.is_staff())', t);
    execute format('create policy "equipe edita %1$s" on public.%1$I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t);
    execute format('create policy "equipe apaga %1$s" on public.%1$I for delete to authenticated using (public.is_staff())', t);
  end loop;
end $$;

-- leitura para a equipe, escrita só para o dono
do $$
declare t text;
begin
  foreach t in array array['settings', 'ai_providers', 'ai_task_models', 'channels'] loop
    execute format('create policy "equipe le %1$s" on public.%1$I for select to authenticated using (public.is_staff())', t);
    execute format('create policy "dono cria %1$s" on public.%1$I for insert to authenticated with check (public.is_owner())', t);
    execute format('create policy "dono edita %1$s" on public.%1$I for update to authenticated using (public.is_owner()) with check (public.is_owner())', t);
    execute format('create policy "dono apaga %1$s" on public.%1$I for delete to authenticated using (public.is_owner())', t);
  end loop;
end $$;

-- perfis
create policy "ve o proprio perfil ou equipe" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_staff());
create policy "dono edita perfis" on public.profiles
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- histórico e fila: só leitura para a equipe
create policy "equipe le versoes" on public.knowledge_versions
  for select to authenticated using (public.is_staff());
create policy "equipe le jobs" on public.jobs
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------
-- Funções: ninguém anônimo executa nada; worker-only fica restrito
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;

grant execute on function public.is_staff(), public.is_owner(), public.is_service_role(),
  public.f_unaccent(text) to authenticated;
grant execute on function public.set_provider_key(uuid, text) to authenticated;
grant execute on function public.restore_version(bigint) to authenticated;
grant execute on function public.enqueue_job(text, jsonb, text, numeric, int) to authenticated;
grant execute on function public.run_job_now(text) to authenticated;
grant execute on function public.search_knowledge(text, extensions.vector, text, uuid[], int) to authenticated;

revoke execute on function public.get_provider_key(uuid) from authenticated;
revoke execute on function public.claim_jobs(text, int, int) from authenticated;
revoke execute on function public.complete_job(bigint, jsonb) from authenticated;
revoke execute on function public.fail_job(bigint, text, int) from authenticated;

grant execute on all functions in schema public to service_role;

-- funções criadas no futuro também não ficam abertas ao público
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------
-- Realtime: o painel atualiza sozinho
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.conversations, public.messages, public.ai_runs, public.approvals,
  public.cases, public.case_documents, public.case_events,
  public.teach_sessions, public.teach_messages, public.knowledge_proposals,
  public.test_scenarios;

-- ---------------------------------------------------------------------
-- Storage: fotos de documentos, áudios, PDFs (bucket privado)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 26214400)
on conflict (id) do nothing;

create policy "equipe le media" on storage.objects
  for select to authenticated using (bucket_id = 'media' and public.is_staff());
create policy "equipe envia media" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_staff());
create policy "equipe edita media" on storage.objects
  for update to authenticated using (bucket_id = 'media' and public.is_staff());
create policy "equipe apaga media" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_staff());
