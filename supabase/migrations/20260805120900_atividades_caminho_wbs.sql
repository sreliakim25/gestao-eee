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
