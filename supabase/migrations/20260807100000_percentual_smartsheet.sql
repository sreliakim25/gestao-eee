-- ============================================================================
-- Percentual oficial vindo do rollup do Smartsheet
--
-- POR QUE ESTA MIGRATION EXISTE
--
-- O Smartsheet calcula o % de uma linha-mãe ponderando cada filho pela duração
-- DA PRÓPRIA LINHA do filho, nível a nível. O app, até aqui, ponderava as 235
-- atividades-folha pela duração de cada folha. As duas contas são defensáveis e
-- dão números diferentes, porque a duração de uma linha-mãe é o intervalo entre
-- o início mais cedo e o fim mais tarde dos filhos — e irmãos se sobrepõem no
-- tempo, então ela NÃO é a soma das durações dos filhos.
--
-- Com os dados reais de 05/08/2026:
--   (100 × 2 + 46 × 55,5) / 438,5 = 6,28%  → o Smartsheet exporta 0.06
--   média ponderada das 235 folhas          = 3,26%
--
-- Decisão do usuário: o número exibido deve ser o mesmo do Smartsheet.
--
-- Optamos por IMPORTAR o valor que o Smartsheet já exporta, em vez de replicar
-- a fórmula dele. Replicar exigiria adivinhar a regra de arredondamento (6,28
-- vira 0.06 no arquivo) e quebraria em silêncio se a Smartsheet mudasse o
-- cálculo. Importar é exato por construção.
-- ============================================================================

-- Percentual da linha raiz do ramo "E.E.E. - NOVO MUNDO".
alter table public.projetos
  add column if not exists percentual_smartsheet numeric(5, 2)
    check (percentual_smartsheet is null or percentual_smartsheet between 0 and 100);

comment on column public.projetos.percentual_smartsheet is
  'Rollup da linha raiz do Smartsheet (0–100). É o percentual OFICIAL de evolução '
  'física exibido no Painel. NULL = ainda não importado; a UI cai no valor '
  'calculado por lib/calculos e sinaliza isso ao usuário.';

-- Percentual das linhas de nível 1 (as 7 frentes).
alter table public.grupos_macro
  add column if not exists percentual_smartsheet numeric(5, 2)
    check (percentual_smartsheet is null or percentual_smartsheet between 0 and 100);

comment on column public.grupos_macro.percentual_smartsheet is
  'Rollup da linha de nível 1 no Smartsheet (0–100). NULL quando a coluna vem '
  'vazia no export — o que acontece quando nenhuma atividade daquela frente tem '
  '"% Concluída" preenchida. NULL não significa zero: significa sem apontamento.';

-- Quando o rollup foi lido do arquivo. Serve para a UI dizer "posição em X"
-- e para detectar import velho.
alter table public.projetos
  add column if not exists percentual_smartsheet_em timestamptz;

comment on column public.projetos.percentual_smartsheet_em is
  'Momento do import que trouxe percentual_smartsheet. Permite avisar na tela '
  'quando o número oficial está defasado em relação aos lançamentos do app.';
