-- ============================================================================
-- Seed real das UGBs da UDE + atribuição do dispositivo existente (EEE Novo
-- Mundo) à sua UGB
--
-- POR QUE
--
-- A migration `20260813100000_ugbs.sql` criou a tabela `ugbs` vazia e a
-- coluna `projetos.ugb_id` nullable, deixando o preenchimento real para uma
-- fase seguinte (Fase 1 do `docs/PLANO_MULTI_DISPOSITIVO_UDE.md`). Esta
-- migration faz esse preenchimento com as 6 UGBs confirmadas pelo usuário e
-- cruzadas com a planilha oficial `Macroplano UDE.xlsx` (aba "MACROPLANO UDE
-- NOVA DIVISÂO"), na ordem em que aparecem na planilha.
--
-- O único projeto existente hoje, `E.E.E. - NOVO MUNDO`, é atribuído à UGB
-- Caruaru — confirmado pelo usuário. As demais UGBs ficam sem dispositivo
-- (nenhum projeto novo é inventado aqui; a planilha lista loteamentos dentro
-- de cada UGB, mas eles não são EEEs modeladas neste app — ver seção 6 do
-- plano).
--
-- Idempotente: `on conflict (nome) do nothing` no insert das UGBs e o filtro
-- `ugb_id is null` no update do projeto fazem esta migration não quebrar nem
-- duplicar nada se rodada mais de uma vez.
-- ============================================================================

insert into public.ugbs (nome, sigla, ordem) values
  ('Caruaru',                     'CA', 1),
  ('Garanhuns',                   'GA', 2),
  ('Igarassu',                    'IG', 3),
  ('Santa Cruz',                  'SC', 4),
  ('Jaboatão dos Guararapes',     'JG', 5),
  ('São Lourenço da Mata',        'SL', 6)
on conflict (nome) do nothing;

update public.projetos
   set ugb_id = (select id from public.ugbs where nome = 'Caruaru')
 where nome = 'E.E.E. - NOVO MUNDO'
   and ugb_id is null;
