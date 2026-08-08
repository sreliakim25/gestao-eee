/**
 * scripts/import/smartsheet-api.ts — leitura do cronograma pela API do Smartsheet.
 *
 * POR QUE ISTO EXISTE, se já havia o import do .xlsx
 *
 * 1. O .xlsx envelhece. Na primeira execução deste módulo, a planilha ao vivo
 *    já divergia do arquivo exportado: 7% contra 6%, e término planejado
 *    12/02/2027 contra 26/01/2027. Quem olhasse o app estaria decidindo com
 *    duas semanas de atraso no dado.
 * 2. A API entrega `rowId` — identificador estável e imutável de cada linha.
 *    O import por arquivo precisa usar o caminho WBS como chave, e por isso
 *    renomear uma atividade-pai no Smartsheet transforma todos os descendentes
 *    em órfãos. Com `rowId` esse problema deixa de existir.
 *
 * ESTRATÉGIA: converter as linhas da API para o MESMO formato `LinhaBruta` que
 * o leitor de .xlsx produz, e reaproveitar `interpretarLinhas` inteiro. As
 * regras de escopo, hierarquia, vínculo com elemento visual e detecção de
 * folha ficam num lugar só — se divergissem, os dois caminhos de import
 * passariam a contar histórias diferentes sem gerar erro nenhum.
 */

import type { LinhaBruta, ColunaSmartsheet } from './tipos';

/** Endpoint público da API v2 do Smartsheet. */
export const BASE_API_SMARTSHEET = 'https://api.smartsheet.com/2.0';

/**
 * Título da coluna no Smartsheet → chave interna.
 * Espelha o mapa de cabeçalhos do leitor de .xlsx: os títulos são os mesmos,
 * porque o export nasce da própria planilha.
 */
const COLUNA_POR_TITULO: Readonly<Record<string, ColunaSmartsheet>> = {
  'nível de hierarquia': 'nivel',
  predecessores: 'predecessores',
  '% concluída': 'percentualConcluida',
  atividade: 'atividade',
  duração: 'duracao',
  iniciar: 'iniciar',
  terminar: 'terminar',
  'está em caminho crítico?': 'caminhoCritico',
  'indicador de prazo de entrega': 'indicadorPrazo',
  folga: 'folga',
  'há pulmão?': 'haPulmao',
  sucessoras: 'sucessoras',
  recurso: 'recurso',
};

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

const TITULOS_NORMALIZADOS: Record<string, ColunaSmartsheet> = Object.fromEntries(
  Object.entries(COLUNA_POR_TITULO).map(([titulo, chave]) => [normalizar(titulo), chave]),
);

interface CelulaApi {
  columnId: number;
  value?: unknown;
  displayValue?: string;
}

interface LinhaApi {
  id: number;
  rowNumber: number;
  parentId?: number;
  cells: CelulaApi[];
}

interface RespostaSheet {
  name: string;
  modifiedAt: string;
  totalRowCount: number;
  columns: { id: number; title: string }[];
  rows: LinhaApi[];
}

export interface ResultadoApi {
  /** Linhas no mesmo formato do leitor de .xlsx — alimenta `interpretarLinhas`. */
  linhas: LinhaBruta[];
  /** rowNumber → rowId do Smartsheet. Chave de upsert estável. */
  rowIdPorLinha: Map<number, string>;
  /** rowNumber → rowId do pai, quando existe. Hierarquia autoritativa. */
  parentIdPorLinha: Map<number, string | null>;
  planilha: { nome: string; modificadaEm: string; totalLinhas: number };
}

/** Erro com mensagem tratada — nunca vaza o token nem o corpo cru da resposta. */
export class ErroSmartsheet extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ErroSmartsheet';
  }
}

/**
 * Busca a planilha e devolve as linhas já no formato do parser.
 *
 * `fetchImpl` é injetável para os testes não dependerem de rede.
 */
export async function buscarPlanilha(
  token: string,
  sheetId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoApi> {
  if (!token) {
    throw new ErroSmartsheet(
      'Token do Smartsheet ausente. Defina SMARTSHEET_TOKEN em .env.local ' +
        '(Smartsheet → Personal Settings → API Access → Generate new access token).',
    );
  }
  if (!sheetId) {
    throw new ErroSmartsheet(
      'SMARTSHEET_SHEET_ID ausente. Rode `npm run smartsheet:listar` para descobrir o id.',
    );
  }

  const resposta = await fetchImpl(`${BASE_API_SMARTSHEET}/sheets/${sheetId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });

  if (!resposta.ok) {
    // Mensagem por status: o corpo da API pode conter detalhe de conta.
    const porStatus: Record<number, string> = {
      401: 'Token do Smartsheet inválido ou expirado. Gere outro em Personal Settings → API Access.',
      403: 'Token sem permissão para ler esta planilha. Confira o compartilhamento.',
      404: `Planilha ${sheetId} não encontrada. Confira o SMARTSHEET_SHEET_ID.`,
      429: 'Limite de requisições do Smartsheet atingido. Tente de novo em alguns minutos.',
    };
    throw new ErroSmartsheet(
      porStatus[resposta.status] ?? `Smartsheet respondeu HTTP ${resposta.status}.`,
      resposta.status,
    );
  }

  const sheet = (await resposta.json()) as RespostaSheet;
  return converterParaLinhasBrutas(sheet);
}

/**
 * Converte a resposta da API para `LinhaBruta[]`.
 *
 * Usa `cell.value` (cru) e NÃO `displayValue`: o cru vem no mesmo formato do
 * .xlsx (percentual como fração 0–1, data ISO), então os normalizadores já
 * testados do parser continuam valendo. `displayValue` traria "7%" e "100%",
 * que exigiriam um segundo conjunto de regras de parsing.
 */
export function converterParaLinhasBrutas(sheet: RespostaSheet): ResultadoApi {
  const chavePorColunaId = new Map<number, ColunaSmartsheet>();
  for (const coluna of sheet.columns) {
    const chave = TITULOS_NORMALIZADOS[normalizar(coluna.title)];
    if (chave && !chavePorColunaId.has(coluna.id)) chavePorColunaId.set(coluna.id, chave);
  }

  const obrigatorias: ColunaSmartsheet[] = ['nivel', 'atividade'];
  const presentes = new Set(chavePorColunaId.values());
  const faltando = obrigatorias.filter((c) => !presentes.has(c));
  if (faltando.length > 0) {
    throw new ErroSmartsheet(
      `A planilha "${sheet.name}" não tem as colunas obrigatórias: ${faltando.join(', ')}. ` +
        'O layout do cronograma mudou?',
    );
  }

  const rowIdPorLinha = new Map<number, string>();
  const parentIdPorLinha = new Map<number, string | null>();

  const linhas: LinhaBruta[] = sheet.rows.map((linha) => {
    const celulas = {} as Record<ColunaSmartsheet, unknown>;
    for (const celula of linha.cells) {
      const chave = chavePorColunaId.get(celula.columnId);
      if (!chave) continue;
      celulas[chave] = celula.value ?? null;
    }
    rowIdPorLinha.set(linha.rowNumber, String(linha.id));
    parentIdPorLinha.set(linha.rowNumber, linha.parentId ? String(linha.parentId) : null);
    return { linhaPlanilha: linha.rowNumber, celulas };
  });

  return {
    linhas,
    rowIdPorLinha,
    parentIdPorLinha,
    planilha: {
      nome: sheet.name,
      modificadaEm: sheet.modifiedAt,
      totalLinhas: sheet.totalRowCount,
    },
  };
}

/** Lista as planilhas visíveis ao token — para descobrir o SMARTSHEET_SHEET_ID. */
export async function listarPlanilhas(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; nome: string; modificadaEm: string }[]> {
  const resposta = await fetchImpl(`${BASE_API_SMARTSHEET}/sheets?includeAll=true`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!resposta.ok) {
    throw new ErroSmartsheet(`Smartsheet respondeu HTTP ${resposta.status} ao listar planilhas.`);
  }
  const corpo = (await resposta.json()) as {
    data?: { id: number; name: string; modifiedAt: string }[];
  };
  return (corpo.data ?? []).map((s) => ({
    id: String(s.id),
    nome: s.name,
    modificadaEm: s.modifiedAt,
  }));
}
