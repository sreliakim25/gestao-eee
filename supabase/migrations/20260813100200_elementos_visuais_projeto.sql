-- ============================================================================
-- elementos_visuais.projeto_id — a Gestão Visual deixa de ser global
--
-- POR QUE
--
-- `elementos_visuais` era global (um único conjunto de 9 elementos para "a
-- obra"). Com o app virando multi-dispositivo, cada dispositivo pode ter (ou
-- não) sua própria planta. `nome` e `svg_path_id` deixam de poder ser únicos
-- no banco inteiro e passam a ser únicos POR PROJETO — dois dispositivos
-- diferentes podem ambos ter um elemento "Casa de comando" com svg_path_id
-- "casa-comando" sem colidir.
--
-- Backfill: como hoje só existe um projeto no banco (EEE Novo Mundo), todo
-- elemento visual existente pertence a ele — nenhuma query atual muda de
-- resultado.
-- ============================================================================

alter table public.elementos_visuais
  add column if not exists projeto_id uuid references public.projetos (id) on delete cascade;

update public.elementos_visuais
   set projeto_id = (select id from public.projetos where nome = 'E.E.E. - NOVO MUNDO')
 where projeto_id is null;

alter table public.elementos_visuais
  alter column projeto_id set not null;

comment on column public.elementos_visuais.projeto_id is
  'Dispositivo (projeto) a que o elemento visual pertence. Chave da Gestão Visual passar a ser multi-dispositivo.';

create index if not exists idx_elementos_visuais_projeto on public.elementos_visuais (projeto_id);

-- -----------------------------------------------------------------------------
-- Troca das UNIQUE globais por UNIQUE por projeto.
-- -----------------------------------------------------------------------------
alter table public.elementos_visuais
  drop constraint if exists elementos_visuais_nome_unico,
  drop constraint if exists elementos_visuais_svg_path_id_unico;

alter table public.elementos_visuais
  add constraint elementos_visuais_projeto_nome_unico unique (projeto_id, nome),
  add constraint elementos_visuais_projeto_svg_path_id_unico unique (projeto_id, svg_path_id);

comment on constraint elementos_visuais_projeto_nome_unico on public.elementos_visuais is
  'Nome único por dispositivo (antes era único no banco inteiro).';
comment on constraint elementos_visuais_projeto_svg_path_id_unico on public.elementos_visuais is
  'svg_path_id único por dispositivo — cada planta tem sua própria numeração de nós.';

-- -----------------------------------------------------------------------------
-- View elementos_visuais_progresso passa a expor projeto_id, para os módulos
-- de leitura filtrarem por dispositivo atual.
--
-- projeto_id vai ao FINAL da lista de colunas de propósito: CREATE OR REPLACE
-- VIEW exige que as colunas já existentes mantenham nome e posição — só é
-- permitido ACRESCENTAR colunas ao final (senão o Postgres recusa o replace).
-- -----------------------------------------------------------------------------
create or replace view public.elementos_visuais_progresso
with (security_invoker = on) as
select
  e.id,
  e.nome,
  e.tipo,
  e.svg_path_id,
  e.ifc_global_id,
  e.ordem,
  count(a.id)::integer as total_atividades,
  count(a.id) filter (where a.percentual_concluido >= 100)::integer as atividades_concluidas,
  coalesce(round(avg(a.percentual_concluido), 2), 0)::numeric(5,2) as percentual_concluido,
  coalesce(
    round(
      sum(a.percentual_concluido * coalesce(a.duracao_dias, 0))
        / nullif(sum(coalesce(a.duracao_dias, 0)), 0),
      2
    ),
    0
  )::numeric(5,2) as percentual_ponderado_duracao,
  -- Faixa usada para colorir o SVG.
  case
    when coalesce(avg(a.percentual_concluido), 0) <= 0   then 'nao_iniciado'
    when coalesce(avg(a.percentual_concluido), 0) >= 100 then 'concluido'
    else 'em_andamento'
  end as faixa_progresso,
  e.projeto_id
from public.elementos_visuais e
left join public.atividades a on a.elemento_visual_id = e.id
group by e.id;

comment on view public.elementos_visuais_progresso is
  'Elementos visuais (por dispositivo) com percentual derivado da média das atividades vinculadas. Fonte única do % da Gestão Visual.';
