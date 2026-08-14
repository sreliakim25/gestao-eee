-- ============================================================================
-- concretagem_pedidos.projeto_id e orcamento_itens.projeto_id
--
-- POR QUE
--
-- As duas tabelas eram globais. Concretagem e Orçamento ficam restritos à EEE
-- Novo Mundo por enquanto (ver projetos.modulo_concretagem_habilitado /
-- modulo_orcamento_habilitado, migration 20260813100100), mas o schema já
-- precisa saber a que dispositivo cada pedido/item pertence para o dia em que
-- outro dispositivo ganhar essas capacidades.
--
-- Backfill: como hoje só existe um projeto no banco e nenhuma das duas
-- tabelas tem outro jeito de inferir o dono, todo registro existente é
-- atribuído à EEE Novo Mundo — nenhuma query atual muda de resultado.
-- ============================================================================

alter table public.concretagem_pedidos
  add column if not exists projeto_id uuid references public.projetos (id) on delete cascade;

alter table public.orcamento_itens
  add column if not exists projeto_id uuid references public.projetos (id) on delete cascade;

update public.concretagem_pedidos
   set projeto_id = (select id from public.projetos where nome = 'E.E.E. - NOVO MUNDO')
 where projeto_id is null;

update public.orcamento_itens
   set projeto_id = (select id from public.projetos where nome = 'E.E.E. - NOVO MUNDO')
 where projeto_id is null;

alter table public.concretagem_pedidos
  alter column projeto_id set not null;

alter table public.orcamento_itens
  alter column projeto_id set not null;

comment on column public.concretagem_pedidos.projeto_id is
  'Dispositivo (projeto) a que o pedido de concreto pertence.';
comment on column public.orcamento_itens.projeto_id is
  'Dispositivo (projeto) a que o item de orçamento pertence.';

create index if not exists idx_concretagem_pedidos_projeto on public.concretagem_pedidos (projeto_id);
create index if not exists idx_orcamento_itens_projeto     on public.orcamento_itens (projeto_id);

-- -----------------------------------------------------------------------------
-- orcamento_itens: item_codigo deixa de ser único no banco inteiro e passa a
-- ser único por dispositivo (cada quantitativo importado tem sua própria
-- codificação de item).
-- -----------------------------------------------------------------------------
alter table public.orcamento_itens
  drop constraint if exists orcamento_itens_codigo_unico;

alter table public.orcamento_itens
  add constraint orcamento_itens_projeto_codigo_unico unique (projeto_id, item_codigo);

comment on constraint orcamento_itens_projeto_codigo_unico on public.orcamento_itens is
  'item_codigo único por dispositivo (antes era único no banco inteiro).';

-- -----------------------------------------------------------------------------
-- View orcamento_resumo_categoria passa a agrupar também por projeto_id.
--
-- projeto_id vai ao FINAL da lista de colunas de propósito: CREATE OR REPLACE
-- VIEW exige que as colunas já existentes mantenham nome e posição — só é
-- permitido ACRESCENTAR colunas ao final (senão o Postgres recusa o replace).
-- -----------------------------------------------------------------------------
create or replace view public.orcamento_resumo_categoria
with (security_invoker = on) as
select
  o.categoria,
  count(*)::integer as total_itens,
  coalesce(sum(o.valor_total)  filter (where not o.eh_compra_direta), 0)::numeric(14,2) as valor_mao_de_obra,
  coalesce(sum(o.valor_medido) filter (where not o.eh_compra_direta), 0)::numeric(14,2) as valor_medido_mao_de_obra,
  coalesce(sum(o.valor_total)  filter (where o.eh_compra_direta), 0)::numeric(14,2)     as valor_compra_direta,
  coalesce(sum(o.valor_medido) filter (where o.eh_compra_direta), 0)::numeric(14,2)     as valor_medido_compra_direta,
  o.projeto_id
from public.orcamento_itens o
group by o.categoria, o.projeto_id;

comment on view public.orcamento_resumo_categoria is
  'Orçado x medido por dispositivo e por categoria, com concreto (compra direta) segregado do valor de mão de obra.';
