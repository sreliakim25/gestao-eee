-- ============================================================================
-- smartsheet_row_id — chave de upsert estável, vinda da API do Smartsheet
--
-- O PROBLEMA QUE ISTO RESOLVE
--
-- O import por .xlsx não tem identificador de linha: o export não traz um.
-- Por isso a chave passou a ser (grupo_macro_id, caminho_wbs). Funciona, mas é
-- frágil de um jeito específico e silencioso: renomear uma atividade-PAI no
-- Smartsheet muda o caminho de todos os descendentes de uma vez, e o import
-- seguinte enxerga N linhas novas + N órfãs em vez de N atualizações.
--
-- A API entrega `rowId`: numérico, imutável e estável a renomeações, mudança
-- de posição e reindentação. Com ele o vínculo deixa de depender do texto.
--
-- CONVIVÊNCIA DOS DOIS CAMINHOS
--
-- A coluna é NULLABLE de propósito: linhas gravadas pelo import de .xlsx não
-- têm rowId, e não podemos inventá-lo. O sync por API preenche o valor no
-- primeiro casamento por caminho_wbs, e a partir daí passa a usar o rowId.
-- Ou seja: a base migra sozinha, sem precisar apagar e reimportar.
-- ============================================================================

alter table public.atividades
  add column if not exists smartsheet_row_id text;

comment on column public.atividades.smartsheet_row_id is
  'rowId da linha na API do Smartsheet. Chave de upsert preferencial: estável a '
  'renomeações e mudanças de posição, ao contrário de caminho_wbs. NULL nas '
  'linhas que entraram pelo import de .xlsx; o sync por API preenche no primeiro '
  'casamento por caminho_wbs.';

-- Único quando presente. Índice parcial permite conviver com os NULLs do .xlsx.
create unique index if not exists atividades_smartsheet_row_id_key
  on public.atividades (smartsheet_row_id)
  where smartsheet_row_id is not null;

-- Rastreia de qual planilha veio o cronograma e quando foi o último sync.
alter table public.projetos
  add column if not exists smartsheet_sheet_id text,
  add column if not exists smartsheet_sincronizado_em timestamptz;

comment on column public.projetos.smartsheet_sheet_id is
  'Id numérico da planilha na API do Smartsheet. Serve para conferir que o app '
  'está lendo o cronograma certo — há mais de uma planilha com nome parecido na '
  'conta (ex.: "EEE - Novo Mundo" e "EEE - Novo Mundo - NOVO").';

comment on column public.projetos.smartsheet_sincronizado_em is
  'Último sync bem-sucedido pela API. A UI usa para avisar quando o dado está '
  'velho — foi exatamente esse o caso do primeiro import por .xlsx, que ficou '
  'duas semanas atrás do cronograma real.';
