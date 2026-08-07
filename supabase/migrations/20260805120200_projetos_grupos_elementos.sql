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
