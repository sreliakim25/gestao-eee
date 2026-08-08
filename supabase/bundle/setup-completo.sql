-- ============================================================================
-- Bundle gerado automaticamente: TODAS as migrations + seed, na ordem.
-- Cole no SQL Editor do Supabase e rode UMA vez, num projeto novo.
-- Gerado a partir de supabase/migrations/*.sql e supabase/seed.sql.
-- NÃO edite este arquivo: edite as migrations e gere de novo.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- 20260805120000_extensoes_enums_utilitarios.sql
-- ─────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 20260805120000 — Extensões, tipos enumerados e funções utilitárias
-- App de Gestão da Obra — EEE Novo Mundo (Viana & Moura Construções)
--
-- Escopo do banco: exclusivamente o que está dentro do muro perimetral da
-- elevatória. Redes externas (emissário final, rede coletora externa) NÃO são
-- modeladas aqui.
--
-- Migration idempotente: pode ser reaplicada sem erro.
-- =============================================================================

-- Geração de UUID (gen_random_uuid) — já vem no Postgres 13+ via pgcrypto.
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enum: perfil de usuário do app
--   gestor — engenharia/coordenação: leitura e escrita total
--   fiscal — fiscalização: leitura total + escrita em avanços, diário e fotos
--   campo  — equipe de campo: leitura total + escrita apenas nos registros
--            que ela mesma criou (diário, fotos, avanços)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'perfil_usuario') then
    create type public.perfil_usuario as enum ('gestor', 'fiscal', 'campo');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Enum: tipo do elemento visual da Gestão Visual (SVG hoje, IFC no futuro).
-- Os valores vêm dos projetos estruturais listados na seção 3 do plano.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_elemento_visual') then
    create type public.tipo_elemento_visual as enum (
      'poco_umido',
      'camara_grades',
      'casa_comando',
      'muro_perimetral',
      'pavimentacao',
      'caixa_comporta',
      'caixa_valvulas',
      'caixa_tanque_hidropneumatico',
      'caixa_medidor_vazao'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Enum: ciclo de vida do pedido de concreto (módulo de Concretagem).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_pedido_concretagem') then
    create type public.status_pedido_concretagem as enum (
      'planejado',
      'pedido',
      'confirmado',
      'concretado'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Enum: categorias reais da aba ORÇAMENTO do arquivo
-- "QUANTITATIVO ESTAÇÃO ELEVATÓRIA DE ESGOTO RL.xlsx" (7 categorias).
-- Não inventar categorias novas sem conferir a planilha.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'categoria_orcamento') then
    create type public.categoria_orcamento as enum (
      'servicos_preliminares',
      'estacao_elevatoria',
      'caixa_tanque_pneumatico',
      'casa_comando',
      'muro_externo',
      'sistema_diversos',
      'itens_omissos'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Função de trigger: mantém a coluna atualizado_em sempre com o horário
-- da última alteração da linha.
-- -----------------------------------------------------------------------------
create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

comment on function public.tocar_atualizado_em() is
  'Trigger BEFORE UPDATE: atualiza a coluna atualizado_em com now().';


-- ─────────────────────────────────────────────────────────────────────────
-- 20260805120100_perfis_auth.sql
-- ─────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 20260805120100 — Perfis de usuário ligados ao Supabase Auth
--
-- A tabela public.perfis espelha auth.users e guarda o papel do usuário no app.
-- É a base de TODAS as políticas de RLS das demais tabelas.
-- =============================================================================

create table if not exists public.perfis (
  -- Mesmo id de auth.users: 1:1 com a conta de autenticação.
  id           uuid primary key references auth.users (id) on delete cascade,
  nome         text not null default '',
  perfil       public.perfil_usuario not null default 'campo',
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table  public.perfis is
  'Perfil de acesso do usuário no app (gestor/fiscal/campo). 1:1 com auth.users.';
comment on column public.perfis.perfil is
  'Papel usado pelas políticas de RLS. Novo usuário entra como "campo" (menor privilégio).';

create index if not exists idx_perfis_perfil on public.perfis (perfil);

drop trigger if exists trg_perfis_atualizado_em on public.perfis;
create trigger trg_perfis_atualizado_em
  before update on public.perfis
  for each row execute function public.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- Criação automática do perfil no signup.
-- O papel pode vir de raw_user_meta_data->>'perfil' (definido pelo gestor ao
-- convidar alguém); qualquer valor inválido ou ausente cai em 'campo'.
-- -----------------------------------------------------------------------------
create or replace function public.criar_perfil_no_signup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  perfil_informado text;
  perfil_final public.perfil_usuario;
begin
  perfil_informado := new.raw_user_meta_data ->> 'perfil';

  if perfil_informado in ('gestor', 'fiscal', 'campo') then
    perfil_final := perfil_informado::public.perfil_usuario;
  else
    perfil_final := 'campo';
  end if;

  insert into public.perfis (id, nome, perfil)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1), ''),
    perfil_final
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.criar_perfil_no_signup() is
  'Trigger AFTER INSERT em auth.users: cria a linha correspondente em public.perfis.';

drop trigger if exists trg_criar_perfil_no_signup on auth.users;
create trigger trg_criar_perfil_no_signup
  after insert on auth.users
  for each row execute function public.criar_perfil_no_signup();

-- -----------------------------------------------------------------------------
-- Helpers de RLS.
--
-- IMPORTANTE: são SECURITY DEFINER com search_path fixo. Isso evita recursão
-- infinita de RLS (uma política de public.perfis que consultasse public.perfis
-- entraria em loop) e evita sequestro de search_path.
-- -----------------------------------------------------------------------------
create or replace function public.perfil_atual()
returns public.perfil_usuario
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.perfil from public.perfis p where p.id = auth.uid();
$$;

comment on function public.perfil_atual() is
  'Retorna o perfil (gestor/fiscal/campo) do usuário autenticado. NULL se não houver perfil.';

create or replace function public.eh_gestor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.perfil_atual() = 'gestor', false);
$$;

create or replace function public.eh_gestor_ou_fiscal()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.perfil_atual() in ('gestor', 'fiscal'), false);
$$;

-- Qualquer usuário com perfil cadastrado tem leitura ampla no app.
create or replace function public.eh_usuario_do_app()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.perfil_atual() is not null;
$$;

revoke all on function public.perfil_atual()        from public;
revoke all on function public.eh_gestor()           from public;
revoke all on function public.eh_gestor_ou_fiscal() from public;
revoke all on function public.eh_usuario_do_app()   from public;

grant execute on function public.perfil_atual()        to authenticated;
grant execute on function public.eh_gestor()           to authenticated;
grant execute on function public.eh_gestor_ou_fiscal() to authenticated;
grant execute on function public.eh_usuario_do_app()   to authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 20260805120200_projetos_grupos_elementos.sql
-- ─────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 20260805120200 — projetos, grupos_macro e elementos_visuais
-- =============================================================================

-- -----------------------------------------------------------------------------
-- projetos — uma linha por obra. Neste app, "E.E.E. - NOVO MUNDO".
-- A tabela existe para o app virar template das próximas elevatórias da VMC.
-- -----------------------------------------------------------------------------
create table if not exists public.projetos (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null,
  cliente                text,
  data_inicio_planejada  date,
  data_fim_planejada     date,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),
  constraint projetos_nome_unico unique (nome),
  constraint projetos_periodo_valido
    check (data_fim_planejada is null
           or data_inicio_planejada is null
           or data_fim_planejada >= data_inicio_planejada)
);

comment on table  public.projetos is
  'Obra gerenciada pelo app. Escopo: apenas o que está dentro do muro perimetral da elevatória.';
comment on column public.projetos.nome is
  'Nome do ramo do Smartsheet importado (ex.: "E.E.E. - NOVO MUNDO"). Chave natural de upsert.';

drop trigger if exists trg_projetos_atualizado_em on public.projetos;
create trigger trg_projetos_atualizado_em
  before update on public.projetos
  for each row execute function public.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- grupos_macro — os 7 grupos de nível 1 do WBS (seção 3 do plano).
-- -----------------------------------------------------------------------------
create table if not exists public.grupos_macro (
  id            uuid primary key default gen_random_uuid(),
  projeto_id    uuid not null references public.projetos (id) on delete cascade,
  nome          text not null,
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint grupos_macro_nome_unico unique (projeto_id, nome)
);

comment on table  public.grupos_macro is
  'Grupos macro (nível 1 do WBS do Smartsheet): Serviços Preliminares, Dragagem..., Drenagem..., Terraplenagem, Civil, Elétrica, Outros.';
comment on constraint grupos_macro_nome_unico on public.grupos_macro is
  'Chave estável de upsert do import do Smartsheet — o export .xlsx não traz ID externo.';

create index if not exists idx_grupos_macro_projeto on public.grupos_macro (projeto_id, ordem);

drop trigger if exists trg_grupos_macro_atualizado_em on public.grupos_macro;
create trigger trg_grupos_macro_atualizado_em
  before update on public.grupos_macro
  for each row execute function public.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- elementos_visuais — entidades físicas da elevatória usadas pela Gestão Visual.
--
-- DECISÃO DE MODELAGEM: o elemento visual é independente da tecnologia de
-- renderização. Hoje o app desenha SVG inline (svg_path_id aponta para o id do
-- <path>/<g> no arquivo em public/svg). Quando houver modelo IFC/REVIT, basta
-- popular ifc_global_id — o modelo de dados não muda.
--
-- percentual_concluido NÃO é coluna aqui: é derivado das atividades vinculadas
-- (ver migration 20260805120600 — view elementos_visuais_progresso).
-- -----------------------------------------------------------------------------
create table if not exists public.elementos_visuais (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  tipo          public.tipo_elemento_visual not null,
  svg_path_id   text not null,
  ifc_global_id text,
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint elementos_visuais_nome_unico unique (nome),
  constraint elementos_visuais_svg_path_id_unico unique (svg_path_id)
);

comment on table  public.elementos_visuais is
  'Elementos físicos da elevatória (poço úmido, câmara de grades, casa de comando, muro perimetral, pavimentação, caixas). Nada fora do muro perimetral.';
comment on column public.elementos_visuais.svg_path_id is
  'Id do nó no SVG de public/svg — ponte entre o banco e o desenho da Gestão Visual.';
comment on column public.elementos_visuais.ifc_global_id is
  'Reservado para o futuro viewer IFC. Nulo enquanto o modelo REVIT/IFC não estiver disponível.';

create index if not exists idx_elementos_visuais_tipo on public.elementos_visuais (tipo);

drop trigger if exists trg_elementos_visuais_atualizado_em on public.elementos_visuais;
create trigger trg_elementos_visuais_atualizado_em
  before update on public.elementos_visuais
  for each row execute function public.tocar_atualizado_em();


-- ─────────────────────────────────────────────────────────────────────────
-- 20260805120300_atividades_avancos.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- 20260805120400_diario_fotos.sql
-- ─────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 20260805120400 — diario_obra (RDO) e fotos_evidencia
-- =============================================================================

create table if not exists public.diario_obra (
  id                    uuid primary key default gen_random_uuid(),
  projeto_id            uuid not null references public.projetos (id) on delete cascade,
  data                  date not null,
  clima                 text,
  efetivo               jsonb not null default '{}'::jsonb,
  equipamentos          jsonb not null default '[]'::jsonb,
  atividades_executadas text,
  ocorrencias           text,
  autor_id              uuid references public.perfis (id) on delete set null,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),

  -- Um RDO por dia por obra.
  constraint diario_obra_data_unica unique (projeto_id, data)
);

comment on table  public.diario_obra is
  'Relatório Diário de Obra (RDO): clima, efetivo, equipamentos, atividades executadas e ocorrências.';
comment on column public.diario_obra.efetivo is
  'JSON com a composição da mão de obra do dia, ex.: {"pedreiro": 4, "servente": 6, "encarregado": 1}.';
comment on column public.diario_obra.equipamentos is
  'JSON com os equipamentos mobilizados no dia, ex.: [{"nome":"Escavadeira","horas":8}].';
comment on column public.diario_obra.autor_id is
  'Autor do RDO. Usado pela RLS: o perfil "campo" só edita os RDOs que ele mesmo criou.';

create index if not exists idx_diario_obra_data  on public.diario_obra (data desc);
create index if not exists idx_diario_obra_autor on public.diario_obra (autor_id);

drop trigger if exists trg_diario_obra_atualizado_em on public.diario_obra;
create trigger trg_diario_obra_atualizado_em
  before update on public.diario_obra
  for each row execute function public.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- fotos_evidencia — arquivos no Supabase Storage, referenciados por caminho.
-- Uma foto pode estar ligada a um RDO, a uma atividade e/ou a um elemento
-- visual — todos os vínculos são opcionais, mas ao menos um é obrigatório.
-- -----------------------------------------------------------------------------
create table if not exists public.fotos_evidencia (
  id                 uuid primary key default gen_random_uuid(),
  diario_obra_id     uuid references public.diario_obra (id) on delete cascade,
  atividade_id       uuid references public.atividades (id) on delete cascade,
  elemento_visual_id uuid references public.elementos_visuais (id) on delete cascade,
  storage_path       text not null,
  legenda            text,
  -- Coluna necessária para a RLS do perfil "campo" (só edita o que registrou).
  criado_por         uuid references public.perfis (id) on delete set null,
  criado_em          timestamptz not null default now(),

  constraint fotos_evidencia_storage_path_unico unique (storage_path),
  constraint fotos_evidencia_vinculo_obrigatorio
    check (diario_obra_id is not null
        or atividade_id is not null
        or elemento_visual_id is not null)
);

comment on table  public.fotos_evidencia is
  'Fotos de evidência armazenadas no bucket "fotos-obra" do Supabase Storage.';
comment on column public.fotos_evidencia.storage_path is
  'Caminho do objeto dentro do bucket (ex.: "2026/08/rdo-<uuid>/foto-01.jpg").';

create index if not exists idx_fotos_evidencia_diario    on public.fotos_evidencia (diario_obra_id);
create index if not exists idx_fotos_evidencia_atividade on public.fotos_evidencia (atividade_id);
create index if not exists idx_fotos_evidencia_elemento  on public.fotos_evidencia (elemento_visual_id);
create index if not exists idx_fotos_evidencia_autor     on public.fotos_evidencia (criado_por);


-- ─────────────────────────────────────────────────────────────────────────
-- 20260805120500_concretagem_orcamento.sql
-- ─────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 20260805120500 — concretagem_pedidos e orcamento_itens
--
-- Regras de negócio críticas (Plano_Execucao_Concretagem_EEE.docx e CLAUDE.md):
--   1) Pedido mínimo de concreto = 5 m³. Abaixo disso, só é aceito se o volume
--      tiver sido combinado com a sobra de outra etapa/frente.
--   2) Concreto é COMPRA DIRETA da contratada, faturado pela contratante —
--      nunca soma ao valor de mão de obra do contrato do terceirizado.
-- =============================================================================

create table if not exists public.concretagem_pedidos (
  id                 uuid primary key default gen_random_uuid(),
  -- Etapas 1 a 4 do plano de concretagem (lajes de fundo → paredes da câmara de
  -- grades → paredes altas do poço úmido + laje de tampa → acessórios/escadas).
  etapa              smallint not null,
  -- Elementos concretados nesta remessa, conforme o plano (texto livre curto).
  elementos          text[] not null default '{}'::text[],
  -- Vínculo opcional com a Gestão Visual (elemento predominante da remessa).
  elemento_visual_id uuid references public.elementos_visuais (id) on delete set null,
  volume_m3          numeric(10,2) not null,
  num_caminhoes      smallint,
  data_prevista      date,
  data_realizada     date,
  status             public.status_pedido_concretagem not null default 'planejado',
  -- Checklist técnico pré-concretagem (slump 60mm±10, cobrimento ≥5cm CAA IV,
  -- cura mínima 7 dias, desforma ≥14 dias, aditivo cristalizante, juntas tipo pente).
  checklist_json     jsonb not null default '{}'::jsonb,
  -- Referência da NF da compra direta do concreto (não entra em orcamento_itens
  -- como mão de obra — ver regra 2 no cabeçalho).
  nota_fiscal_ref    text,
  -- Marca que o volume abaixo de 5 m³ foi combinado com sobra de outra etapa.
  combinado_com_sobra boolean not null default false,
  observacoes        text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),

  constraint concretagem_pedidos_etapa_valida
    check (etapa between 1 and 4),
  constraint concretagem_pedidos_volume_positivo
    check (volume_m3 > 0),
  -- REGRA DE NEGÓCIO: pedido mínimo de 5 m³, salvo combinação de sobra.
  constraint concretagem_pedidos_volume_minimo
    check (volume_m3 >= 5 or combinado_com_sobra),
  constraint concretagem_pedidos_caminhoes_positivo
    check (num_caminhoes is null or num_caminhoes > 0),
  -- Só é "concretado" com data de realização registrada.
  constraint concretagem_pedidos_data_realizada_coerente
    check (status <> 'concretado' or data_realizada is not null)
);

comment on table  public.concretagem_pedidos is
  'Pedidos/remessas de concreto por etapa do Plano_Execucao_Concretagem_EEE.docx.';
comment on constraint concretagem_pedidos_volume_minimo on public.concretagem_pedidos is
  'Pedido mínimo de concreto = 5 m³. Volume menor só é aceito com combinado_com_sobra = true.';
comment on column public.concretagem_pedidos.combinado_com_sobra is
  'True quando o volume abaixo de 5 m³ foi combinado com a sobra de outra etapa/frente no mesmo caminhão.';
comment on column public.concretagem_pedidos.nota_fiscal_ref is
  'NF da compra direta do concreto. Valor de concreto NUNCA entra no contrato de mão de obra do terceirizado.';

create index if not exists idx_concretagem_pedidos_status   on public.concretagem_pedidos (status);
create index if not exists idx_concretagem_pedidos_etapa    on public.concretagem_pedidos (etapa);
create index if not exists idx_concretagem_pedidos_prevista on public.concretagem_pedidos (data_prevista);
create index if not exists idx_concretagem_pedidos_elemento on public.concretagem_pedidos (elemento_visual_id)
  where elemento_visual_id is not null;

drop trigger if exists trg_concretagem_pedidos_atualizado_em on public.concretagem_pedidos;
create trigger trg_concretagem_pedidos_atualizado_em
  before update on public.concretagem_pedidos
  for each row execute function public.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- orcamento_itens — proposta do terceirizado
-- ("QUANTITATIVO ESTAÇÃO ELEVATÓRIA DE ESGOTO RL.xlsx", aba ORÇAMENTO).
-- Nenhum valor é semeado aqui: tudo vem do import (Fase 6).
-- -----------------------------------------------------------------------------
create table if not exists public.orcamento_itens (
  id              uuid primary key default gen_random_uuid(),
  item_codigo     text not null,
  descricao       text not null,
  unidade         text,
  quantidade      numeric(14,4) not null default 0,
  preco_unitario  numeric(14,2) not null default 0,
  valor_total     numeric(14,2) not null default 0,
  categoria       public.categoria_orcamento not null,
  valor_medido    numeric(14,2) not null default 0,
  -- Derivado: evita percentual dessincronizado do valor medido.
  percentual_medido numeric(6,2)
    generated always as (
      case when valor_total > 0
           then round((valor_medido / valor_total) * 100, 2)
           else 0
      end
    ) stored,
  -- Concreto é COMPRA DIRETA (faturado pela contratante) e não pode ser somado
  -- ao valor de mão de obra do contrato do terceirizado.
  eh_compra_direta boolean not null default false,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  constraint orcamento_itens_codigo_unico unique (item_codigo),
  constraint orcamento_itens_quantidade_nao_negativa check (quantidade >= 0),
  constraint orcamento_itens_preco_nao_negativo     check (preco_unitario >= 0),
  constraint orcamento_itens_valor_total_nao_negativo check (valor_total >= 0),
  constraint orcamento_itens_medido_nao_negativo    check (valor_medido >= 0)
);

comment on table  public.orcamento_itens is
  'Itens da proposta do terceirizado (7 categorias, total contratado R$ 736.324,27 na versão importada).';
comment on column public.orcamento_itens.eh_compra_direta is
  'True para concreto e demais insumos de compra direta da contratada. Esses itens NÃO somam ao valor de mão de obra — sempre filtrar por eh_compra_direta = false ao totalizar o contrato.';
comment on column public.orcamento_itens.percentual_medido is
  'Coluna gerada: valor_medido / valor_total * 100.';

create index if not exists idx_orcamento_itens_categoria     on public.orcamento_itens (categoria);
create index if not exists idx_orcamento_itens_compra_direta on public.orcamento_itens (eh_compra_direta);

drop trigger if exists trg_orcamento_itens_atualizado_em on public.orcamento_itens;
create trigger trg_orcamento_itens_atualizado_em
  before update on public.orcamento_itens
  for each row execute function public.tocar_atualizado_em();


-- ─────────────────────────────────────────────────────────────────────────
-- 20260805120600_views_derivadas.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- 20260805120700_rls_politicas.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- 20260805120800_storage_fotos.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- 20260805120900_atividades_caminho_wbs.sql
-- ─────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 20260805120900 — Correção da chave de upsert das atividades e nome canônico
--                  dos grupos macro
--
-- MOTIVO (fato medido no dry-run de "Materiais/EEE - Novo Mundo.xlsx"):
-- o ramo "E.E.E. - NOVO MUNDO" tem 7 grupos macro e 310 atividades. O nome curto
-- da atividade se repete muito dentro do mesmo grupo — só em CIVIL, "Concretagem"
-- aparece 35x, "Formas" 27x e "Ferragem" 25x. Com a chave anterior
-- UNIQUE (grupo_macro_id, nome), as 310 atividades colapsavam em 159 chaves e o
-- import perdia 151 linhas em silêncio.
--
-- CORREÇÃO: a identidade da atividade passa a ser o CAMINHO WBS completo dentro
-- do grupo macro (único em 310/310), e a coluna `nome` volta a ser apenas o nome
-- curto exibido pela UI.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) atividades.caminho_wbs — nova identidade da linha.
-- -----------------------------------------------------------------------------
alter table public.atividades
  add column if not exists caminho_wbs text;

-- Backfill: até esta migration o importador gravava o caminho completo em `nome`
-- (contorno temporário). Aproveita esse conteúdo como caminho_wbs.
update public.atividades
   set caminho_wbs = nome
 where caminho_wbs is null;

-- `nome` volta a ser só o último segmento do caminho ("... > Concretagem").
-- Linhas que já estavam com o nome curto não têm ' > ' e ficam inalteradas.
update public.atividades
   set nome = regexp_replace(nome, '^.* > ', '')
 where nome like '% > %';

alter table public.atividades
  alter column caminho_wbs set not null;

comment on column public.atividades.caminho_wbs is
  'Caminho WBS completo da atividade dentro do grupo macro, segmentos unidos por " > " (ex.: "Elevatória de esgoto bruto > Fosso de sucção > Laje de fundo > Concretagem"). Identidade da linha no import.';
comment on column public.atividades.nome is
  'Nome curto da atividade (último segmento do caminho_wbs). É o que a UI exibe. NÃO é único dentro do grupo macro.';

-- -----------------------------------------------------------------------------
-- 2) Troca da chave de upsert.
-- -----------------------------------------------------------------------------
alter table public.atividades
  drop constraint if exists atividades_chave_upsert;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'atividades_chave_upsert_wbs'
  ) then
    alter table public.atividades
      add constraint atividades_chave_upsert_wbs unique (grupo_macro_id, caminho_wbs);
  end if;
end
$$;

comment on constraint atividades_chave_upsert_wbs on public.atividades is
  'Chave estável de upsert do import do Smartsheet: (grupo_macro_id, caminho_wbs). O export .xlsx não traz ID externo por linha, e o nome curto se repete (310 atividades colapsavam em 159 chaves). CONSEQUÊNCIA CONHECIDA: renomear um ancestral no Smartsheet muda o caminho de TODOS os descendentes, que entram como linhas novas e deixam as antigas órfãs — o script de import deve detectar e reportar órfãos, nunca silenciá-los.';

-- Índice de apoio à UI (Cronograma filtra por grupo e ordena/pesquisa por nome).
create index if not exists idx_atividades_grupo_nome on public.atividades (grupo_macro_id, nome);

-- -----------------------------------------------------------------------------
-- 3) grupos_macro.nome_smartsheet — elimina a camada de tradução do importador.
--
-- Os nomes de nível 1 no .xlsx estão em caixa alta e com pontuação própria
-- ("SERVIÇOS PRELIMINARES", "DRENAGEM - Canal e muro"), enquanto `nome` guarda o
-- rótulo legível usado na UI ("Serviços Preliminares", "Drenagem — Canal e muro").
-- Em vez de manter um mapa GRUPOS_MACRO_CANONICOS dentro do script de import,
-- a correspondência vira dado: o import casa por nome_smartsheet (string exata
-- do arquivo) e o app exibe `nome`.
-- -----------------------------------------------------------------------------
alter table public.grupos_macro
  add column if not exists nome_smartsheet text;

-- Backfill dos 7 grupos (strings exatas conferidas no .xlsx real).
update public.grupos_macro g
   set nome_smartsheet = m.nome_xlsx
  from (values
    ('Serviços Preliminares',                    'SERVIÇOS PRELIMINARES'),
    ('Dragagem e rebaixamento de cota do canal', 'DRAGAGEM E POSSÍVEL REBAIXAMENTO DE COTA DA LÂMINA DO CANAL'),
    ('Drenagem — Canal e muro',                  'DRENAGEM - Canal e muro'),
    ('Terraplenagem',                            'TERRAPLENAGEM'),
    ('Civil',                                    'CIVIL'),
    ('Elétrica',                                 'ELÉTRICA'),
    ('Outros',                                   'OUTROS')
  ) as m(nome_app, nome_xlsx)
 where g.nome = m.nome_app
   and g.nome_smartsheet is null;

-- Grupos criados fora do seed caem no próprio nome como fallback.
update public.grupos_macro
   set nome_smartsheet = nome
 where nome_smartsheet is null;

alter table public.grupos_macro
  alter column nome_smartsheet set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'grupos_macro_nome_smartsheet_unico'
  ) then
    alter table public.grupos_macro
      add constraint grupos_macro_nome_smartsheet_unico unique (projeto_id, nome_smartsheet);
  end if;
end
$$;

comment on column public.grupos_macro.nome_smartsheet is
  'Nome do grupo exatamente como aparece no nível 1 do ramo "E.E.E. - NOVO MUNDO" do .xlsx (ex.: "DRENAGEM - Canal e muro"). Chave de casamento do import.';
comment on constraint grupos_macro_nome_smartsheet_unico on public.grupos_macro is
  'Chave de upsert dos grupos macro no import: (projeto_id, nome_smartsheet). O rótulo legível fica em `nome`.';
comment on column public.grupos_macro.nome is
  'Rótulo legível exibido na UI (seção 3 do plano). Não é a chave usada pelo import.';


-- ─────────────────────────────────────────────────────────────────────────
-- 20260807100000_percentual_smartsheet.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- seed.sql
-- ─────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- seed.sql — Dados estruturais fixos da obra EEE Novo Mundo
--
-- Rodar depois das migrations:
--   supabase db reset          (aplica migrations + seed no ambiente local)
--   ou psql -f supabase/seed.sql
--
-- CONTÉM APENAS estrutura que não vem de planilha:
--   - o projeto
--   - os 7 grupos macro de nível 1 do WBS (seção 3 do plano)
--   - os 9 elementos visuais da Gestão Visual (seções 3 e 5 do plano)
--
-- NÃO CONTÉM atividades nem itens de orçamento: esses vêm obrigatoriamente do
-- import de "Materiais/EEE - Novo Mundo.xlsx" e de
-- "Materiais/QUANTITATIVO ESTAÇÃO ELEVATÓRIA DE ESGOTO RL.xlsx".
-- Nunca inventar dados de cronograma ou orçamento aqui.
--
-- Idempotente: pode ser reexecutado.
-- =============================================================================

-- Projeto. Datas do ramo "E.E.E. - NOVO MUNDO" no Smartsheet (15/05/2026 a 26/01/2027).
-- cliente fica nulo até ser confirmado com o usuário (não inventar contratante).
insert into public.projetos (nome, cliente, data_inicio_planejada, data_fim_planejada)
values ('E.E.E. - NOVO MUNDO', null, date '2026-05-15', date '2027-01-26')
on conflict (nome) do update
  set data_inicio_planejada = excluded.data_inicio_planejada,
      data_fim_planejada    = excluded.data_fim_planejada;

-- Os 7 grupos macro de nível 1 do WBS.
--   nome            = rótulo legível exibido na UI (tabela da seção 3 do plano)
--   nome_smartsheet = string exata do nível 1 no .xlsx (chave de casamento do import)
-- Manter as duas colunas aqui evita um mapa de tradução dentro do script de import.
insert into public.grupos_macro (projeto_id, nome, nome_smartsheet, ordem)
select p.id, g.nome, g.nome_smartsheet, g.ordem
from public.projetos p,
     (values
       ('Serviços Preliminares',                    'SERVIÇOS PRELIMINARES', 1),
       ('Dragagem e rebaixamento de cota do canal', 'DRAGAGEM E POSSÍVEL REBAIXAMENTO DE COTA DA LÂMINA DO CANAL', 2),
       ('Drenagem — Canal e muro',                  'DRENAGEM - Canal e muro', 3),
       ('Terraplenagem',                            'TERRAPLENAGEM', 4),
       ('Civil',                                    'CIVIL', 5),
       ('Elétrica',                                 'ELÉTRICA', 6),
       ('Outros',                                   'OUTROS', 7)
     ) as g(nome, nome_smartsheet, ordem)
where p.nome = 'E.E.E. - NOVO MUNDO'
on conflict (projeto_id, nome) do update
  set nome_smartsheet = excluded.nome_smartsheet,
      ordem           = excluded.ordem;

-- Elementos visuais da Gestão Visual (tudo dentro do muro perimetral).
-- svg_path_id = id do nó correspondente no SVG em public/svg (agente gestao-visual).
insert into public.elementos_visuais (nome, tipo, svg_path_id, ordem)
values
  ('Poço úmido',                    'poco_umido',                   'poco-umido',                   1),
  ('Câmara de grades',              'camara_grades',                'camara-grades',                2),
  ('Casa de comando',               'casa_comando',                 'casa-comando',                 3),
  ('Caixa de comporta',             'caixa_comporta',               'caixa-comporta',               4),
  ('Caixa de válvulas',             'caixa_valvulas',               'caixa-valvulas',               5),
  ('Caixa do tanque hidropneumático','caixa_tanque_hidropneumatico', 'caixa-tanque-hidropneumatico', 6),
  ('Caixa do medidor de vazão',     'caixa_medidor_vazao',          'caixa-medidor-vazao',          7),
  ('Pavimentação',                  'pavimentacao',                 'pavimentacao',                 8),
  ('Muro perimetral',               'muro_perimetral',              'muro-perimetral',              9)
on conflict (nome) do update
  set tipo        = excluded.tipo,
      svg_path_id = excluded.svg_path_id,
      ordem       = excluded.ordem;
