-- ============================================================================
-- projeto_planilhas_smartsheet — N:N entre dispositivo e planilha do Smartsheet
--
-- POR QUE
--
-- `projetos.smartsheet_sheet_id` só guarda UMA planilha por dispositivo. Isso
-- já se mostrou insuficiente: alguns dispositivos da UDE têm mais de uma
-- planilha relevante (ex.: RAP, REL, além da principal). Esta tabela permite
-- N planilhas por dispositivo, cada uma com um papel.
--
-- `projetos.smartsheet_sheet_id` / `smartsheet_sincronizado_em` CONTINUAM
-- existindo como legado — nenhuma leitura do app migra para esta tabela nesta
-- fase (fase futura cuida disso). Backfill aqui só copia o que já existe.
-- ============================================================================

create table if not exists public.projeto_planilhas_smartsheet (
  id                     uuid primary key default gen_random_uuid(),
  projeto_id             uuid not null references public.projetos (id) on delete cascade,
  sheet_id               text not null,
  papel                  text not null default 'principal',
  ativo                  boolean not null default true,
  ultimo_sincronizado_em timestamptz,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),

  constraint projeto_planilhas_smartsheet_sheet_id_unico unique (sheet_id)
);

comment on table public.projeto_planilhas_smartsheet is
  'Planilhas do Smartsheet vinculadas a cada dispositivo (N:N) — um dispositivo pode ter mais de uma planilha (ex.: principal, RAP, REL).';
comment on column public.projeto_planilhas_smartsheet.sheet_id is
  'Id numérico da planilha na API do Smartsheet. Único no banco inteiro: a mesma planilha não pode estar vinculada a dois dispositivos.';
comment on column public.projeto_planilhas_smartsheet.papel is
  'Papel da planilha para o dispositivo (ex.: "principal", "RAP", "REL"). "principal" dita o rollup de % e as datas do dispositivo.';
comment on column public.projeto_planilhas_smartsheet.ativo is
  'false = planilha não entra mais no sync automático, sem apagar o histórico do vínculo.';

create index if not exists idx_projeto_planilhas_smartsheet_projeto on public.projeto_planilhas_smartsheet (projeto_id);

drop trigger if exists trg_projeto_planilhas_smartsheet_atualizado_em on public.projeto_planilhas_smartsheet;
create trigger trg_projeto_planilhas_smartsheet_atualizado_em
  before update on public.projeto_planilhas_smartsheet
  for each row execute function public.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- Backfill a partir de projetos.smartsheet_sheet_id já existente.
-- -----------------------------------------------------------------------------
insert into public.projeto_planilhas_smartsheet (projeto_id, sheet_id, papel, ultimo_sincronizado_em)
select p.id, p.smartsheet_sheet_id, 'principal', p.smartsheet_sincronizado_em
from public.projetos p
where p.smartsheet_sheet_id is not null
on conflict (sheet_id) do nothing;

-- -----------------------------------------------------------------------------
-- projetos.smartsheet_sheet_id / smartsheet_sincronizado_em ficam como legado
-- documentado — nenhuma leitura muda nesta fase.
-- -----------------------------------------------------------------------------
comment on column public.projetos.smartsheet_sheet_id is
  'LEGADO: id da planilha principal na API do Smartsheet. Substituído por projeto_planilhas_smartsheet (papel = ''principal''), mantido até uma fase futura migrar as leituras que ainda dependem desta coluna.';
comment on column public.projetos.smartsheet_sincronizado_em is
  'LEGADO: último sync bem-sucedido da planilha principal. Substituído por projeto_planilhas_smartsheet.ultimo_sincronizado_em, mantido até uma fase futura migrar as leituras que ainda dependem desta coluna.';

-- -----------------------------------------------------------------------------
-- RLS: mesmo padrão já usado nas demais tabelas de leitura ampla / escrita
-- restrita ao gestor.
-- -----------------------------------------------------------------------------
alter table public.projeto_planilhas_smartsheet enable row level security;

drop policy if exists projeto_planilhas_smartsheet_leitura_app on public.projeto_planilhas_smartsheet;
create policy projeto_planilhas_smartsheet_leitura_app on public.projeto_planilhas_smartsheet
  for select to authenticated
  using (public.eh_usuario_do_app());

drop policy if exists projeto_planilhas_smartsheet_escrita_gestor on public.projeto_planilhas_smartsheet;
create policy projeto_planilhas_smartsheet_escrita_gestor on public.projeto_planilhas_smartsheet
  for all to authenticated
  using (public.eh_gestor())
  with check (public.eh_gestor());

grant select, insert, update, delete on public.projeto_planilhas_smartsheet to authenticated;
