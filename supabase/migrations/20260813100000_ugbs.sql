-- ============================================================================
-- ugbs — Unidades de Gestão de Bacia da UDE (Unidade de Dispositivos Especiais
-- da Viana & Moura), agrupam os dispositivos (projetos) na navegação
-- pós-login (Caruaru, Garanhuns, SC...)
--
-- POR QUE
--
-- O app deixa de gerenciar uma obra só (EEE Novo Mundo) e passa a gerenciar
-- vários dispositivos da UDE. A navegação pós-login passa a ser
-- UGB → dispositivo → módulos. Esta migration cria só a tabela e o vínculo em
-- `projetos`; o preenchimento das UGBs reais e o backfill de
-- `projetos.ugb_id` para os novos dispositivos ficam para o seed de uma fase
-- futura (não são responsabilidade desta migration) — por isso a coluna nasce
-- NULLABLE de propósito, sem quebrar o único projeto que existe hoje.
-- ============================================================================

create table if not exists public.ugbs (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  sigla         text not null,
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint ugbs_nome_unico  unique (nome),
  constraint ugbs_sigla_unica unique (sigla)
);

comment on table public.ugbs is
  'Unidades de Gestão de Bacia da UDE — agrupam os dispositivos (projetos) na navegação pós-login (ex.: Caruaru, Garanhuns, SC).';
comment on column public.ugbs.sigla is
  'Sigla curta usada na navegação (ex.: "UGB-SC").';

drop trigger if exists trg_ugbs_atualizado_em on public.ugbs;
create trigger trg_ugbs_atualizado_em
  before update on public.ugbs
  for each row execute function public.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- projetos.ugb_id — a que UGB o dispositivo pertence. NULLABLE nesta migration:
-- o único projeto hoje (EEE Novo Mundo) continua funcionando sem UGB atribuída
-- até o seed multi-dispositivo de uma fase futura atribuir uma.
-- -----------------------------------------------------------------------------
alter table public.projetos
  add column if not exists ugb_id uuid references public.ugbs (id) on delete set null;

comment on column public.projetos.ugb_id is
  'UGB (Unidade de Gestão de Bacia) do dispositivo. NULL até o seed multi-dispositivo atribuir uma — nenhum projeto existente é afetado por essa ausência.';

create index if not exists idx_projetos_ugb on public.projetos (ugb_id);

-- -----------------------------------------------------------------------------
-- RLS: mesmo padrão já usado nas demais tabelas de leitura ampla / escrita
-- restrita ao gestor (eh_usuario_do_app / eh_gestor). Sem filtro por
-- usuário↔UGB — decisão já tomada (acesso continua liberado a qualquer
-- usuário ativo, só organizado por UGB na navegação).
-- -----------------------------------------------------------------------------
alter table public.ugbs enable row level security;

drop policy if exists ugbs_leitura_app on public.ugbs;
create policy ugbs_leitura_app on public.ugbs
  for select to authenticated
  using (public.eh_usuario_do_app());

drop policy if exists ugbs_escrita_gestor on public.ugbs;
create policy ugbs_escrita_gestor on public.ugbs
  for all to authenticated
  using (public.eh_gestor())
  with check (public.eh_gestor());

grant select, insert, update, delete on public.ugbs to authenticated;
