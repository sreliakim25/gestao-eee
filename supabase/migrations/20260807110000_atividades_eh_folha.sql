-- ============================================================================
-- atividades.eh_folha — separa folha de linha-mãe do WBS
--
-- POR QUE
--
-- Das 310 atividades importadas, 235 são folhas e 75 são linhas-mãe (níveis
-- intermediários do WBS: "Elevatória de esgoto bruto", "Fosso de sucção"...).
-- Uma linha-mãe não é trabalho: é o agrupamento do trabalho dos filhos.
--
-- Somar as duas coisas na mesma média é dupla contagem, e o efeito é grande
-- porque a duração de uma linha-mãe é o intervalo entre o início mais cedo e o
-- fim mais tarde dos filhos — quase sempre um peso enorme, com "% Concluída"
-- vazia. Nos dados de 05/08/2026 isso derruba o percentual calculado de 3,26%
-- (só folhas) para 0,93% (folhas + mães).
--
-- Com esta coluna o motor de indicadores passa a agregar apenas folhas, que é
-- o denominador correto.
--
-- Default `true`: linha sem informação de hierarquia é tratada como folha, que
-- é o caso conservador — ela conta, em vez de sumir silenciosamente do cálculo.
-- ============================================================================

alter table public.atividades
  add column if not exists eh_folha boolean not null default true;

comment on column public.atividades.eh_folha is
  'true = folha do WBS (trabalho real). false = linha-mãe, que só agrupa os '
  'filhos e NÃO deve entrar em média de evolução física — contá-la junto com '
  'os filhos é dupla contagem. Preenchida pelo import a partir da hierarquia '
  'do Smartsheet.';

-- Índice parcial: praticamente toda agregação filtra por folha.
create index if not exists atividades_eh_folha_idx
  on public.atividades (grupo_macro_id)
  where eh_folha;
