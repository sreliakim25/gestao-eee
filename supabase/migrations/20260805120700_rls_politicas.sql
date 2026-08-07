-- =============================================================================
-- 20260805120700 — Row Level Security e políticas por perfil
--
-- Matriz de acesso (todos os perfis precisam estar autenticados e ter linha em
-- public.perfis — usuário anônimo não lê nada):
--
--   tabela                | gestor | fiscal              | campo
--   ----------------------|--------|---------------------|---------------------------
--   perfis                | tudo   | leitura do próprio  | leitura do próprio
--   projetos              | tudo   | leitura             | leitura
--   grupos_macro          | tudo   | leitura             | leitura
--   elementos_visuais     | tudo   | leitura             | leitura
--   atividades            | tudo   | leitura             | leitura
--   avancos_semanais      | tudo   | leitura + escrita   | leitura + escrita só do que registrou
--   diario_obra           | tudo   | leitura + escrita   | leitura + escrita só do que registrou
--   fotos_evidencia       | tudo   | leitura + escrita   | leitura + escrita só do que registrou
--   concretagem_pedidos   | tudo   | leitura             | leitura
--   orcamento_itens       | tudo   | leitura             | leitura
--
-- O script de import (scripts/import-smartsheet.ts) roda com service_role, que
-- ignora RLS por definição — a chave nunca vai para o client.
-- =============================================================================

alter table public.perfis              enable row level security;
alter table public.projetos            enable row level security;
alter table public.grupos_macro        enable row level security;
alter table public.elementos_visuais   enable row level security;
alter table public.atividades          enable row level security;
alter table public.avancos_semanais    enable row level security;
alter table public.diario_obra         enable row level security;
alter table public.fotos_evidencia     enable row level security;
alter table public.concretagem_pedidos enable row level security;
alter table public.orcamento_itens     enable row level security;

-- Sem RLS não há acesso: garante que anon não enxergue nada.
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;

-- -----------------------------------------------------------------------------
-- perfis
-- -----------------------------------------------------------------------------
drop policy if exists perfis_leitura_proprio on public.perfis;
create policy perfis_leitura_proprio on public.perfis
  for select to authenticated
  using (id = auth.uid() or public.eh_gestor());

drop policy if exists perfis_escrita_gestor on public.perfis;
create policy perfis_escrita_gestor on public.perfis
  for all to authenticated
  using (public.eh_gestor())
  with check (public.eh_gestor());

grant select, insert, update, delete on public.perfis to authenticated;

-- -----------------------------------------------------------------------------
-- Tabelas de leitura ampla / escrita só do gestor.
-- (projetos, grupos_macro, elementos_visuais, atividades, concretagem_pedidos,
--  orcamento_itens)
-- -----------------------------------------------------------------------------
do $$
declare
  nome_tabela text;
begin
  foreach nome_tabela in array array[
    'projetos', 'grupos_macro', 'elementos_visuais',
    'atividades', 'concretagem_pedidos', 'orcamento_itens'
  ]
  loop
    execute format('drop policy if exists %I on public.%I',
                   nome_tabela || '_leitura_app', nome_tabela);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.eh_usuario_do_app())',
      nome_tabela || '_leitura_app', nome_tabela);

    execute format('drop policy if exists %I on public.%I',
                   nome_tabela || '_escrita_gestor', nome_tabela);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.eh_gestor()) with check (public.eh_gestor())',
      nome_tabela || '_escrita_gestor', nome_tabela);

    execute format('grant select, insert, update, delete on public.%I to authenticated', nome_tabela);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- avancos_semanais — lançamento de produção
-- -----------------------------------------------------------------------------
drop policy if exists avancos_leitura_app on public.avancos_semanais;
create policy avancos_leitura_app on public.avancos_semanais
  for select to authenticated
  using (public.eh_usuario_do_app());

drop policy if exists avancos_insercao on public.avancos_semanais;
create policy avancos_insercao on public.avancos_semanais
  for insert to authenticated
  with check (
    public.eh_gestor_ou_fiscal()
    or (public.perfil_atual() = 'campo' and registrado_por = auth.uid())
  );

drop policy if exists avancos_atualizacao on public.avancos_semanais;
create policy avancos_atualizacao on public.avancos_semanais
  for update to authenticated
  using (
    public.eh_gestor_ou_fiscal()
    or (public.perfil_atual() = 'campo' and registrado_por = auth.uid())
  )
  with check (
    public.eh_gestor_ou_fiscal()
    or (public.perfil_atual() = 'campo' and registrado_por = auth.uid())
  );

drop policy if exists avancos_exclusao on public.avancos_semanais;
create policy avancos_exclusao on public.avancos_semanais
  for delete to authenticated
  using (
    public.eh_gestor_ou_fiscal()
    or (public.perfil_atual() = 'campo' and registrado_por = auth.uid())
  );

grant select, insert, update, delete on public.avancos_semanais to authenticated;

-- -----------------------------------------------------------------------------
-- diario_obra — RDO
-- -----------------------------------------------------------------------------
drop policy if exists diario_leitura_app on public.diario_obra;
create policy diario_leitura_app on public.diario_obra
  for select to authenticated
  using (public.eh_usuario_do_app());

drop policy if exists diario_insercao on public.diario_obra;
create policy diario_insercao on public.diario_obra
  for insert to authenticated
  with check (
    public.eh_gestor_ou_fiscal()
    or (public.perfil_atual() = 'campo' and autor_id = auth.uid())
  );

drop policy if exists diario_atualizacao on public.diario_obra;
create policy diario_atualizacao on public.diario_obra
  for update to authenticated
  using (
    public.eh_gestor_ou_fiscal()
    or (public.perfil_atual() = 'campo' and autor_id = auth.uid())
  )
  with check (
    public.eh_gestor_ou_fiscal()
    or (public.perfil_atual() = 'campo' and autor_id = auth.uid())
  );

drop policy if exists diario_exclusao on public.diario_obra;
create policy diario_exclusao on public.diario_obra
  for delete to authenticated
  using (
    public.eh_gestor_ou_fiscal()
    or (public.perfil_atual() = 'campo' and autor_id = auth.uid())
  );

grant select, insert, update, delete on public.diario_obra to authenticated;

-- -----------------------------------------------------------------------------
-- fotos_evidencia
-- -----------------------------------------------------------------------------
drop policy if exists fotos_leitura_app on public.fotos_evidencia;
create policy fotos_leitura_app on public.fotos_evidencia
  for select to authenticated
  using (public.eh_usuario_do_app());

drop policy if exists fotos_insercao on public.fotos_evidencia;
create policy fotos_insercao on public.fotos_evidencia
  for insert to authenticated
  with check (
    public.eh_gestor_ou_fiscal()
    or (public.perfil_atual() = 'campo' and criado_por = auth.uid())
  );

drop policy if exists fotos_atualizacao on public.fotos_evidencia;
create policy fotos_atualizacao on public.fotos_evidencia
  for update to authenticated
  using (
    public.eh_gestor_ou_fiscal()
    or (public.perfil_atual() = 'campo' and criado_por = auth.uid())
  )
  with check (
    public.eh_gestor_ou_fiscal()
    or (public.perfil_atual() = 'campo' and criado_por = auth.uid())
  );

drop policy if exists fotos_exclusao on public.fotos_evidencia;
create policy fotos_exclusao on public.fotos_evidencia
  for delete to authenticated
  using (
    public.eh_gestor_ou_fiscal()
    or (public.perfil_atual() = 'campo' and criado_por = auth.uid())
  );

grant select, insert, update, delete on public.fotos_evidencia to authenticated;

-- -----------------------------------------------------------------------------
-- Views derivadas: leitura para usuários autenticados (security_invoker = on,
-- então a RLS das tabelas de base continua sendo aplicada).
-- -----------------------------------------------------------------------------
grant select on public.elementos_visuais_progresso to authenticated;
grant select on public.grupos_macro_progresso      to authenticated;
grant select on public.orcamento_resumo_categoria  to authenticated;
