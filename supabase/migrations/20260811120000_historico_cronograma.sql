-- ============================================================================
-- historico_cronograma — registro diário do estado do cronograma
--
-- POR QUE
--
-- A linha de base responde "o plano mudou?". Ela não responde "COMO mudou ao
-- longo do tempo?" — se o término escorregou de uma vez ou foi cedendo semana
-- a semana, se o prazo para de crescer depois de um replanejamento, se o
-- avanço acompanha o alongamento. Para isso é preciso guardar o estado a cada
-- dia, e não só as duas pontas.
--
-- Um registro por projeto por dia. Rodar o sync várias vezes no mesmo dia
-- atualiza a linha do dia em vez de criar outra: o que interessa é a série
-- diária, não cada execução.
--
-- Guardamos valores JÁ AGREGADOS em vez de recalcular depois a partir das
-- atividades. Motivo: `atividades` guarda só o estado atual — reconstruir o
-- passado a partir dela é impossível. Este histórico é o único lugar onde a
-- trajetória existe.
-- ============================================================================

create table if not exists public.historico_cronograma (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos (id) on delete cascade,

  -- Dia a que o registro se refere (não o instante da coleta).
  data_referencia date not null,

  -- Estado do plano vigente naquele dia.
  data_inicio_planejada date,
  data_fim_planejada date,
  /**
   * Duração corrida entre início e término planejados, em dias.
   * Coluna gerada: não pode divergir das datas que a originaram.
   */
  duracao_dias integer generated always as (
    case
      when data_inicio_planejada is null or data_fim_planejada is null then null
      else (data_fim_planejada - data_inicio_planejada) + 1
    end
  ) stored,

  -- Percentual oficial (rollup do Smartsheet) naquele dia.
  percentual_smartsheet numeric(5, 2)
    check (percentual_smartsheet is null or percentual_smartsheet between 0 and 100),

  total_atividades integer not null default 0 check (total_atividades >= 0),
  atividades_criticas integer not null default 0 check (atividades_criticas >= 0),
  atividades_concluidas integer not null default 0 check (atividades_concluidas >= 0),

  /** De onde veio o registro: 'sync' (API), 'import' (.xlsx) ou 'manual'. */
  origem text not null default 'sync' check (origem in ('sync', 'import', 'manual')),

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint historico_cronograma_dia_unico unique (projeto_id, data_referencia)
);

comment on table public.historico_cronograma is
  'Um registro por dia do estado do cronograma. É a única fonte da trajetória: '
  'atividades guarda só o estado atual, então sem esta tabela não há como '
  'reconstruir como o prazo evoluiu.';

comment on column public.historico_cronograma.data_referencia is
  'Dia a que o registro se refere. Único por projeto — reexecutar o sync no '
  'mesmo dia atualiza a linha em vez de duplicar.';

comment on column public.historico_cronograma.duracao_dias is
  'Duração corrida planejada, inclusiva nas duas pontas (igual à contagem do '
  'Smartsheet). Coluna gerada para não poder divergir das datas.';

create index if not exists historico_cronograma_projeto_data_idx
  on public.historico_cronograma (projeto_id, data_referencia desc);

create trigger historico_cronograma_atualizado_em
  before update on public.historico_cronograma
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- RLS: leitura para qualquer perfil do app; escrita só gestor (e service role,
-- que é quem o script de sync usa e ignora RLS por definição).
-- ---------------------------------------------------------------------------
alter table public.historico_cronograma enable row level security;

drop policy if exists historico_cronograma_leitura on public.historico_cronograma;
create policy historico_cronograma_leitura
  on public.historico_cronograma
  for select
  using (public.eh_usuario_do_app());

drop policy if exists historico_cronograma_escrita on public.historico_cronograma;
create policy historico_cronograma_escrita
  on public.historico_cronograma
  for all
  using (public.eh_gestor())
  with check (public.eh_gestor());
