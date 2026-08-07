-- =============================================================================
-- 20260805120800 — Bucket privado de fotos da obra (Supabase Storage)
--
-- Bucket "fotos-obra": privado, acessado por signed URL. As linhas de
-- public.fotos_evidencia guardam o storage_path do objeto.
--
-- Em alguns ambientes o papel que aplica a migration não é dono de
-- storage.objects; por isso a criação das policies está protegida por
-- tratamento de exceção — se falhar, as políticas devem ser criadas pelo
-- painel do Supabase (Storage > Policies) com as mesmas regras.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('fotos-obra', 'fotos-obra', false)
on conflict (id) do nothing;

do $$
begin
  -- Leitura: qualquer usuário do app.
  execute $sql$drop policy if exists fotos_obra_leitura on storage.objects$sql$;
  execute $sql$
    create policy fotos_obra_leitura on storage.objects
      for select to authenticated
      using (bucket_id = 'fotos-obra' and public.eh_usuario_do_app())
  $sql$;

  -- Upload: qualquer usuário do app (gestor, fiscal e campo registram evidência).
  execute $sql$drop policy if exists fotos_obra_upload on storage.objects$sql$;
  execute $sql$
    create policy fotos_obra_upload on storage.objects
      for insert to authenticated
      with check (bucket_id = 'fotos-obra' and public.eh_usuario_do_app())
  $sql$;

  -- Alteração/remoção do objeto: gestor/fiscal, ou o próprio autor do upload.
  execute $sql$drop policy if exists fotos_obra_atualizacao on storage.objects$sql$;
  execute $sql$
    create policy fotos_obra_atualizacao on storage.objects
      for update to authenticated
      using (bucket_id = 'fotos-obra' and (public.eh_gestor_ou_fiscal() or owner = auth.uid()))
      with check (bucket_id = 'fotos-obra' and (public.eh_gestor_ou_fiscal() or owner = auth.uid()))
  $sql$;

  execute $sql$drop policy if exists fotos_obra_exclusao on storage.objects$sql$;
  execute $sql$
    create policy fotos_obra_exclusao on storage.objects
      for delete to authenticated
      using (bucket_id = 'fotos-obra' and (public.eh_gestor_ou_fiscal() or owner = auth.uid()))
  $sql$;
exception
  when insufficient_privilege then
    raise notice 'Sem privilégio para criar policies em storage.objects — criar manualmente no painel do Supabase.';
end
$$;
