/**
 * scripts/import/xlsx.ts — leitura do .xlsx exportado do Smartsheet.
 *
 * Isolado do parser de propósito: `parser.ts` é interpretação pura e passou a
 * ser usado também pelo app (rota de sincronização). Se o ExcelJS continuasse
 * importado lá, uma biblioteca de planilha de vários megabytes entraria no
 * bundle do servidor Next só para interpretar linhas que vieram da API.
 *
 * Aqui mora tudo que toca arquivo; o resto do import não sabe que .xlsx existe.
 */

import ExcelJS from 'exceljs';
import {
  CABECALHOS,
  COLUNAS_OBRIGATORIAS,
  interpretarLinhas,
} from './parser';
import { normalizarTexto } from './mapeamento-elementos';
import type { ColunaSmartsheet, LinhaBruta, ResultadoParse } from './tipos';

/** Extrai o valor "útil" de uma célula do exceljs (desembrulha fórmula/rich text/hyperlink). */
function valorDaCelula(valor: ExcelJS.CellValue): unknown {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === 'object') {
    const obj = valor as unknown as Record<string, unknown>;
    if ('result' in obj) return obj.result ?? null; // fórmula
    if ('text' in obj && typeof obj.text === 'string') return obj.text; // hyperlink
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return (obj.richText as { text: string }[]).map((p) => p.text).join('');
    }
    if ('error' in obj) return null;
  }
  return valor;
}


/**
 * Lê a primeira planilha do .xlsx e devolve as linhas cruas indexadas por
 * nome de coluna. Lança erro claro se o arquivo não tiver o cabeçalho esperado.
 */
export async function lerLinhasBrutas(caminhoArquivo: string): Promise<LinhaBruta[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(caminhoArquivo);

  // A aba do cronograma é a primeira; a aba "Comments" do export é ignorada.
  const planilha = workbook.worksheets[0];
  if (!planilha) {
    throw new Error(`Arquivo "${caminhoArquivo}" não tem nenhuma planilha legível.`);
  }

  // Mapeia cabeçalho → índice de coluna.
  const indicePorColuna = new Map<ColunaSmartsheet, number>();
  const linhaCabecalho = planilha.getRow(1);
  for (let c = 1; c <= planilha.columnCount; c++) {
    const bruto = valorDaCelula(linhaCabecalho.getCell(c).value);
    if (typeof bruto !== 'string') continue;
    const chave = CABECALHOS[normalizarTexto(bruto)];
    if (chave && !indicePorColuna.has(chave)) indicePorColuna.set(chave, c);
  }

  const faltando = COLUNAS_OBRIGATORIAS.filter((c) => !indicePorColuna.has(c));
  if (faltando.length > 0) {
    throw new Error(
      `Cabeçalho inesperado em "${caminhoArquivo}". Colunas obrigatórias não encontradas: ` +
        `${faltando.join(', ')}. Confira se o export do Smartsheet mudou de formato.`,
    );
  }

  const linhas: LinhaBruta[] = [];
  for (let r = 2; r <= planilha.rowCount; r++) {
    const linha = planilha.getRow(r);
    const celulas = {} as Record<ColunaSmartsheet, unknown>;
    for (const [chave, indice] of indicePorColuna) {
      celulas[chave] = valorDaCelula(linha.getCell(indice).value);
    }
    linhas.push({ linhaPlanilha: r, celulas });
  }
  return linhas;
}

/** Atalho: lê o arquivo e já interpreta. */
export async function parsearCronograma(caminhoArquivo: string): Promise<ResultadoParse> {
  return interpretarLinhas(await lerLinhasBrutas(caminhoArquivo));
}
