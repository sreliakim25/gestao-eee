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
