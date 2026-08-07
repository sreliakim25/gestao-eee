-- =============================================================================
-- 20260805120600 — Views e funções derivadas (progresso)
--
-- DECISÃO: percentual_concluido de elementos_visuais e de grupos_macro é
-- DERIVADO das atividades, nunca coluna persistida. Motivo: coluna gravada
-- dessincroniza a cada reimportação do Smartsheet e a cada lançamento de
-- produção, e o Painel/Gestão Visual passariam a mostrar números divergentes
-- do Cronograma. Aqui existe uma única fonte: public.atividades.
--
-- As views usam security_invoker = on: a RLS do usuário que consulta continua
-- valendo (a view não vira um bypass de política).
--
-- Observação para o agente motor-indicadores: estas views são conveniência de
-- leitura. Os cálculos oficiais de indicador/Curva S continuam em lib/calculos/.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Progresso por elemento visual (Gestão Visual).
-- percentual_concluido = média simples das atividades vinculadas (conforme
-- seção 4 do plano). percentual_ponderado_duracao é oferecido como alternativa
-- para o Painel, sem substituir a definição oficial.
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
  end as faixa_progresso
from public.elementos_visuais e
left join public.atividades a on a.elemento_visual_id = e.id
group by e.id;

comment on view public.elementos_visuais_progresso is
  'Elementos visuais com percentual derivado da média das atividades vinculadas. Fonte única do % da Gestão Visual.';

-- -----------------------------------------------------------------------------
-- Progresso por grupo macro (cards de frente do Painel).
-- -----------------------------------------------------------------------------
create or replace view public.grupos_macro_progresso
with (security_invoker = on) as
select
  g.id,
  g.projeto_id,
  g.nome,
  g.ordem,
  count(a.id)::integer as total_atividades,
  count(a.id) filter (where a.caminho_critico)::integer as atividades_criticas,
  coalesce(round(avg(a.percentual_concluido), 2), 0)::numeric(5,2) as percentual_concluido,
  coalesce(
    round(
      sum(a.percentual_concluido * coalesce(a.duracao_dias, 0))
        / nullif(sum(coalesce(a.duracao_dias, 0)), 0),
      2
    ),
    0
  )::numeric(5,2) as percentual_ponderado_duracao,
  min(a.data_inicio_planejada) as data_inicio_planejada,
  max(a.data_fim_planejada)    as data_fim_planejada
from public.grupos_macro g
left join public.atividades a on a.grupo_macro_id = g.id
group by g.id;

comment on view public.grupos_macro_progresso is
  'Agregado por grupo macro do WBS para os cards por frente do Painel.';

-- -----------------------------------------------------------------------------
-- Orçamento consolidado por categoria.
-- REGRA: valor de mão de obra do contrato do terceirizado NUNCA inclui itens
-- de compra direta (concreto). As duas colunas ficam explicitamente separadas.
-- -----------------------------------------------------------------------------
create or replace view public.orcamento_resumo_categoria
with (security_invoker = on) as
select
  o.categoria,
  count(*)::integer as total_itens,
  coalesce(sum(o.valor_total)  filter (where not o.eh_compra_direta), 0)::numeric(14,2) as valor_mao_de_obra,
  coalesce(sum(o.valor_medido) filter (where not o.eh_compra_direta), 0)::numeric(14,2) as valor_medido_mao_de_obra,
  coalesce(sum(o.valor_total)  filter (where o.eh_compra_direta), 0)::numeric(14,2)     as valor_compra_direta,
  coalesce(sum(o.valor_medido) filter (where o.eh_compra_direta), 0)::numeric(14,2)     as valor_medido_compra_direta
from public.orcamento_itens o
group by o.categoria;

comment on view public.orcamento_resumo_categoria is
  'Orçado x medido por categoria, com concreto (compra direta) segregado do valor de mão de obra.';

-- -----------------------------------------------------------------------------
-- Função de conveniência para o script de import e para consultas pontuais.
-- -----------------------------------------------------------------------------
create or replace function public.percentual_elemento(elemento_id uuid)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(round(avg(a.percentual_concluido), 2), 0)
  from public.atividades a
  where a.elemento_visual_id = elemento_id;
$$;

comment on function public.percentual_elemento(uuid) is
  'Percentual concluído derivado de um elemento visual (média simples das atividades vinculadas).';

grant execute on function public.percentual_elemento(uuid) to authenticated;
