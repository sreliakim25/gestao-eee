-- =============================================================================
-- 20260805120300 — atividades e avancos_semanais
--
-- Fonte da verdade do cronograma: Smartsheet, importado via
-- scripts/import-smartsheet.ts a partir de "Materiais/EEE - Novo Mundo.xlsx".
-- Nenhuma atividade é semeada aqui — tudo vem do import.
-- =============================================================================

create table if not exists public.atividades (
  id                    uuid primary key default gen_random_uuid(),
  grupo_macro_id        uuid not null references public.grupos_macro (id) on delete cascade,
  elemento_visual_id    uuid references public.elementos_visuais (id) on delete set null,

  wbs_nivel             smallint not null default 1,
  nome                  text not null,
  predecessores         text,
  duracao_dias          numeric(8,2),
  data_inicio_planejada date,
  data_fim_planejada    date,
  percentual_concluido  numeric(5,2) not null default 0,
  caminho_critico       boolean not null default false,
  folga_dias            numeric(8,2),
  recurso               text,

  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),

  -- CHAVE ESTÁVEL DE UPSERT DO IMPORT DO SMARTSHEET.
  -- O export .xlsx do Smartsheet não expõe um ID externo por linha, então a
  -- identidade da atividade é (grupo macro + nome da atividade). Consequência
  -- prática: renomear uma atividade no Smartsheet cria uma nova linha aqui e
  -- deixa a antiga órfã — o script de import deve tratar/reportar esse caso.
  constraint atividades_chave_upsert unique (grupo_macro_id, nome),

  constraint atividades_percentual_valido
    check (percentual_concluido >= 0 and percentual_concluido <= 100),
  constraint atividades_periodo_valido
    check (data_fim_planejada is null
           or data_inicio_planejada is null
           or data_fim_planejada >= data_inicio_planejada),
  constraint atividades_duracao_nao_negativa
    check (duracao_dias is null or duracao_dias >= 0)
);

comment on table  public.atividades is
  'Atividades do ramo "E.E.E. - NOVO MUNDO" do Smartsheet (~317 linhas). Datas e criticidade vêm prontas do Smartsheet — este app não roda CPM próprio.';
comment on constraint atividades_chave_upsert on public.atividades is
  'Chave estável de upsert: (grupo_macro_id, nome). O export do Smartsheet não tem ID externo.';
comment on column public.atividades.caminho_critico is
  'Coluna "Está em Caminho Crítico?" do Smartsheet. Snapshot 05/08/2026: 34 de 317 atividades críticas.';
comment on column public.atividades.elemento_visual_id is
  'Vínculo opcional com o elemento físico da Gestão Visual. Base do percentual derivado do elemento.';

-- Índices dos filtros reais da UI (Cronograma, Painel, Gestão Visual).
create index if not exists idx_atividades_grupo_macro     on public.atividades (grupo_macro_id);
create index if not exists idx_atividades_elemento_visual on public.atividades (elemento_visual_id)
  where elemento_visual_id is not null;
create index if not exists idx_atividades_caminho_critico on public.atividades (caminho_critico)
  where caminho_critico;
create index if not exists idx_atividades_data_inicio     on public.atividades (data_inicio_planejada);
create index if not exists idx_atividades_data_fim        on public.atividades (data_fim_planejada);
-- Filtro "semana atual": atividades cujo intervalo cruza a semana corrente.
create index if not exists idx_atividades_janela          on public.atividades (data_inicio_planejada, data_fim_planejada);

drop trigger if exists trg_atividades_atualizado_em on public.atividades;
create trigger trg_atividades_atualizado_em
  before update on public.atividades
  for each row execute function public.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- avancos_semanais — lançamento de produção semanal (alimenta a Curva S).
-- Uma linha por atividade por semana.
-- -----------------------------------------------------------------------------
create table if not exists public.avancos_semanais (
  id                                uuid primary key default gen_random_uuid(),
  atividade_id                      uuid not null references public.atividades (id) on delete cascade,
  semana_referencia                 date not null,
  percentual_planejado_acumulado    numeric(5,2) not null default 0,
  percentual_realizado_acumulado    numeric(5,2) not null default 0,
  observacoes                       text,
  registrado_em                     timestamptz not null default now(),
  registrado_por                    uuid references public.perfis (id) on delete set null,
  atualizado_em                     timestamptz not null default now(),

  constraint avancos_semanais_chave_unica unique (atividade_id, semana_referencia),
  constraint avancos_semanais_planejado_valido
    check (percentual_planejado_acumulado >= 0 and percentual_planejado_acumulado <= 100),
  constraint avancos_semanais_realizado_valido
    check (percentual_realizado_acumulado >= 0 and percentual_realizado_acumulado <= 100),
  -- A semana de referência é sempre a SEGUNDA-FEIRA da semana ISO. Normaliza a
  -- grade semanal da Curva S e evita duas linhas para a mesma semana.
  constraint avancos_semanais_segunda_feira
    check (extract(isodow from semana_referencia) = 1)
);

comment on table  public.avancos_semanais is
  'Avanço físico acumulado por atividade e por semana. Base da Curva S (planejado x realizado).';
comment on column public.avancos_semanais.semana_referencia is
  'Segunda-feira da semana ISO de referência (constraint avancos_semanais_segunda_feira).';
comment on column public.avancos_semanais.registrado_por is
  'Autor do lançamento. Usado pela RLS: o perfil "campo" só edita o que ele mesmo registrou.';

create index if not exists idx_avancos_semanais_atividade on public.avancos_semanais (atividade_id);
create index if not exists idx_avancos_semanais_semana    on public.avancos_semanais (semana_referencia);
create index if not exists idx_avancos_semanais_autor     on public.avancos_semanais (registrado_por);

drop trigger if exists trg_avancos_semanais_atualizado_em on public.avancos_semanais;
create trigger trg_avancos_semanais_atualizado_em
  before update on public.avancos_semanais
  for each row execute function public.tocar_atualizado_em();
