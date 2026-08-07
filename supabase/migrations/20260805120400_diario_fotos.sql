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
