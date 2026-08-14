/**
 * scripts/import-orcamento.ts — Import da aba ORÇAMENTO do quantitativo do
 * terceirizado para `orcamento_itens`.
 *
 * Dono: agente `concretagem-orcamento`.
 * Fonte: `Materiais/QUANTITATIVO ESTAÇÃO ELEVATÓRIA DE ESGOTO RL.xlsx`,
 * aba "ORÇAMENTO" (sintético, 7 categorias, total contratado R$ 736.324,27).
 *
 * Uso:
 *   npm run import:orcamento                 # dry-run (padrão): só imprime o diff
 *   npm run import:orcamento -- --apply      # grava no banco
 *   npm run import:orcamento -- --arquivo "outro.xlsx"
 *
 * Regras que este script respeita:
 *  - CONCRETO É COMPRA DIRETA da contratada, faturada pela contratante: os itens
 *    cuja observação diz "o concreto será tratado como compra direta" entram com
 *    `eh_compra_direta = true` e NUNCA somam ao valor de mão de obra do contrato.
 *  - Nunca inventa valor: célula vazia ou fórmula sem resultado em cache vira 0
 *    e é contabilizada no relatório.
 *  - Importa apenas as FOLHAS do orçamento sintético (itens sem subitem), senão
 *    os totalizadores (1., 2.1, 2.2...) dobrariam o somatório.
 *  - Idempotente: upsert por `(projeto_id, item_codigo)` (unique no banco desde
 *    que `orcamento_itens` ganhou `projeto_id` — cada dispositivo tem sua
 *    própria codificação de item) e payload determinístico. `valor_medido` NÃO
 *    é enviado, para não zerar a medição já lançada no app.
 *  - Confere o somatório contra R$ 736.324,27 e avisa EM DESTAQUE se divergir.
 *
 * Não usa a lib `xlsx` da npm (CVEs conhecidos) — usa `exceljs`, carregada
 * dinamicamente para manter as funções puras deste módulo testáveis sem I/O.
 */

import process from 'node:process';
import { config as carregarEnv } from 'dotenv';
import { CATEGORIA_POR_RAIZ, ORDEM_CATEGORIAS, ROTULO_CATEGORIA } from '@/app/orcamento/categorias';
import { NOME_PROJETO, buscarProjetoId } from '@/scripts/import/upsert';
import type { CategoriaOrcamento, OrcamentoItemInsert } from '@/types/database';

/* -------------------------------------------------------------------------- */
/* Constantes da planilha                                                      */
/* -------------------------------------------------------------------------- */

export const CAMINHO_PADRAO_XLSX = 'Materiais/QUANTITATIVO ESTAÇÃO ELEVATÓRIA DE ESGOTO RL.xlsx';
export const NOME_ABA_ORCAMENTO = 'ORÇAMENTO';

/**
 * Placeholder de `projeto_id` usado em dry-run (sem tocar no banco): o dry-run
 * deste script continua 100% offline (só lê o .xlsx), então não resolve o id
 * real via `buscarProjetoId`. NUNCA é gravado — a etapa de escrita nem roda em
 * dry-run — só existe para satisfazer o tipo do payload (`orcamento_itens.projeto_id`
 * é `NOT NULL`).
 */
export const PROJETO_ID_DRY_RUN = '00000000-0000-0000-0000-000000000000';

/** Total contratado do terceirizado, conforme a linha "TOTAL DO SERVIÇO:". */
export const TOTAL_CONTRATADO_ESPERADO = 736324.27;

/** Tolerância de conferência do total, em reais (arredondamento por item). */
export const TOLERANCIA_TOTAL_REAIS = 0.5;

/** Primeira linha de dados (a linha 9 é o cabeçalho ITEM/DESCRIÇÃO/...). */
const PRIMEIRA_LINHA_DADOS = 10;
/** Limite defensivo de varredura (a planilha declara 1.048.572 linhas vazias). */
const ULTIMA_LINHA_VARREDURA = 400;

/** Colunas (1-based) da aba ORÇAMENTO. */
export const COLUNAS = {
  item: 2,
  descricao: 3,
  unidade: 4,
  quantidade: 5,
  precoUnitario: 6,
  valorTotal: 7,
  observacoes: 8,
} as const;

// As 7 categorias (rótulo, ordem e mapa por raiz do código) moram em
// `app/orcamento/categorias.ts` — módulo puro compartilhado com a tela, para não
// haver duas listas de categoria no projeto.
export { CATEGORIA_POR_RAIZ, ORDEM_CATEGORIAS, ROTULO_CATEGORIA } from '@/app/orcamento/categorias';

/* -------------------------------------------------------------------------- */
/* Tipos                                                                       */
/* -------------------------------------------------------------------------- */

/** Linha crua lida da planilha, antes de qualquer regra. */
export interface LinhaOrcamento {
  linhaPlanilha: number;
  /** Código normalizado, sem ponto final: "2", "2.2", "2.2.2.1". */
  itemCodigo: string;
  descricao: string;
  unidade: string | null;
  quantidade: number;
  precoUnitario: number;
  valorTotal: number;
  observacoes: string;
  /** True para as linhas de cabeçalho de categoria ("1.", "2." ...). */
  ehCabecalhoCategoria: boolean;
}

export interface ResultadoParse {
  linhas: LinhaOrcamento[];
  /** Total lido da linha "TOTAL DO SERVIÇO:" (null se não encontrada). */
  totalDaPlanilha: number | null;
  /** Totais declarados nos cabeçalhos de cada categoria. */
  totaisDeclaradosPorCategoria: Partial<Record<CategoriaOrcamento, number>>;
}

export interface ResultadoMontagem {
  itens: OrcamentoItemInsert[];
  /** Linhas descartadas por serem totalizadoras (têm subitens). */
  agregadoras: LinhaOrcamento[];
  /** Linhas ignoradas por não terem descrição (ex.: itens omissos em branco). */
  semDescricao: LinhaOrcamento[];
  /** Códigos duplicados na planilha, renomeados para caber no unique do banco. */
  duplicados: { itemCodigo: string; codigoFinal: string; descricao: string; linhaPlanilha: number }[];
  avisos: string[];
}

export interface TotaisConferencia {
  /** Soma de TODOS os itens (mão de obra + compra direta) = total do contrato. */
  totalGeral: number;
  /** Soma dos itens que NÃO são compra direta — o valor de mão de obra. */
  totalMaoDeObra: number;
  /** Soma dos itens de compra direta (concreto). */
  totalCompraDireta: number;
  porCategoria: Record<CategoriaOrcamento, { total: number; maoDeObra: number; compraDireta: number; itens: number }>;
}

/* -------------------------------------------------------------------------- */
/* Funções puras — leitura de célula                                           */
/* -------------------------------------------------------------------------- */

/**
 * Texto de uma célula do exceljs.
 * Trata fórmula com resultado em cache, richText e valores nulos.
 */
export function textoDaCelula(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (valor instanceof Date) return valor.toISOString();

  if (typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      return (obj.richText as { text?: string }[]).map((t) => t.text ?? '').join('').trim();
    }
    if ('result' in obj) return textoDaCelula(obj.result);
    if ('text' in obj) return textoDaCelula(obj.text);
  }
  return '';
}

/**
 * Número de uma célula.
 * Fórmula sem resultado em cache (shared formula não avaliada) vira 0 — nunca
 * se inventa valor a partir de quantidade × preço.
 */
export function numeroDaCelula(valor: unknown): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  if (valor === null || valor === undefined) return 0;

  if (typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    if ('result' in obj) return numeroDaCelula(obj.result);
    return 0;
  }
  if (typeof valor === 'string') {
    const limpo = valor.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const n = Number(limpo);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Normaliza o código do item: "2." → "2"; "  2.2.1 " → "2.2.1". */
export function normalizarCodigo(bruto: string): string {
  return bruto.trim().replace(/\s+/g, '').replace(/\.+$/, '');
}

/** Reais com 2 casas (a coluna do banco é numeric(14,2)). */
export function arredondarReais(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/* Funções puras — regras do orçamento                                         */
/* -------------------------------------------------------------------------- */

/** Categoria a partir da raiz do código ("2.2.1" → estacao_elevatoria). */
export function categoriaPorCodigo(itemCodigo: string): CategoriaOrcamento | null {
  const raiz = normalizarCodigo(itemCodigo).split('.')[0];
  return CATEGORIA_POR_RAIZ[raiz] ?? null;
}

/** Linha de cabeçalho de categoria: código sem ponto interno ("1", "2"...). */
export function ehCabecalhoDeCategoria(itemCodigo: string): boolean {
  return /^\d+$/.test(normalizarCodigo(itemCodigo));
}

/**
 * REGRA DE NEGÓCIO CRÍTICA — concreto é compra direta.
 *
 * A observação do orçamento marca esses itens com a frase:
 *   "Considerar o custo de mão de obra e o concreto será tratado como compra
 *    direta (a contratada é responsável pela compra e a contratante irá faturar
 *    a nota)".
 * Esses itens entram com `eh_compra_direta = true` e ficam fora do valor de mão
 * de obra do contrato do terceirizado.
 */
export function ehCompraDireta(observacoes: string): boolean {
  return /compra\s+direta/i.test(observacoes ?? '');
}

/** `pai` é ancestral de `filho` no WBS do orçamento? ("2.2" é ancestral de "2.2.1"). */
export function ehAncestral(pai: string, filho: string): boolean {
  return filho !== pai && filho.startsWith(`${pai}.`);
}

/**
 * Separa folhas de agregadoras.
 * Só as folhas viram itens: somar um totalizador junto com seus filhos dobraria
 * o valor do contrato.
 */
export function separarFolhas(linhas: readonly LinhaOrcamento[]): {
  folhas: LinhaOrcamento[];
  agregadoras: LinhaOrcamento[];
} {
  const codigos = linhas.map((l) => l.itemCodigo);
  const folhas: LinhaOrcamento[] = [];
  const agregadoras: LinhaOrcamento[] = [];

  for (const linha of linhas) {
    const temFilho = codigos.some((c) => ehAncestral(linha.itemCodigo, c));
    if (temFilho || linha.ehCabecalhoCategoria) agregadoras.push(linha);
    else folhas.push(linha);
  }
  return { folhas, agregadoras };
}

/**
 * Monta os itens para o banco.
 *
 * Determinístico (mesma planilha + mesmo `projetoId` → mesmo payload, mesma
 * ordem), o que garante a idempotência do upsert.
 *
 * `projetoId` é obrigatório desde que `orcamento_itens.projeto_id` passou a
 * existir (migration `20260813100400_concretagem_orcamento_projeto.sql`):
 * este quantitativo é só da EEE Novo Mundo por enquanto, mas a função em si
 * não sabe disso — quem decide o dispositivo é o chamador (`main()` abaixo).
 */
export function montarItens(linhas: readonly LinhaOrcamento[], projetoId: string): ResultadoMontagem {
  const { folhas, agregadoras } = separarFolhas(linhas);
  const avisos: string[] = [];
  const semDescricao: LinhaOrcamento[] = [];
  const duplicados: ResultadoMontagem['duplicados'] = [];
  const itens: OrcamentoItemInsert[] = [];
  const usados = new Map<string, number>();

  for (const linha of folhas) {
    if (!linha.descricao) {
      semDescricao.push(linha);
      continue;
    }

    const categoria = categoriaPorCodigo(linha.itemCodigo);
    if (!categoria) {
      avisos.push(
        `Linha ${linha.linhaPlanilha}: código "${linha.itemCodigo}" não mapeia para nenhuma das 7 categorias — item ignorado.`,
      );
      continue;
    }

    // O banco tem UNIQUE (item_codigo). A planilha repete alguns códigos
    // (ex.: "4.4.7" aparece em duas linhas). Desambigua de forma determinística
    // e reporta, em vez de perder a linha silenciosamente.
    const ocorrencia = (usados.get(linha.itemCodigo) ?? 0) + 1;
    usados.set(linha.itemCodigo, ocorrencia);
    const codigoFinal = ocorrencia === 1 ? linha.itemCodigo : `${linha.itemCodigo}#${ocorrencia}`;
    if (ocorrencia > 1) {
      duplicados.push({
        itemCodigo: linha.itemCodigo,
        codigoFinal,
        descricao: linha.descricao,
        linhaPlanilha: linha.linhaPlanilha,
      });
    }

    itens.push({
      projeto_id: projetoId,
      item_codigo: codigoFinal,
      descricao: linha.descricao,
      unidade: linha.unidade,
      quantidade: Number(linha.quantidade.toFixed(4)),
      preco_unitario: arredondarReais(linha.precoUnitario),
      valor_total: arredondarReais(linha.valorTotal),
      categoria,
      eh_compra_direta: ehCompraDireta(linha.observacoes),
      // `valor_medido` fica de fora de propósito: o upsert não pode zerar a
      // medição já lançada no app.
    });
  }

  const semValor = itens.filter((i) => i.valor_total === 0).length;
  if (semValor > 0) {
    avisos.push(
      `${semValor} item(ns) com valor_total = 0 (fórmula sem resultado em cache ou preço em branco na planilha).`,
    );
  }

  return { itens, agregadoras, semDescricao, duplicados, avisos };
}

/** Totais para conferência — separa mão de obra de compra direta. */
export function calcularTotais(itens: readonly OrcamentoItemInsert[]): TotaisConferencia {
  const porCategoria = Object.fromEntries(
    ORDEM_CATEGORIAS.map((c) => [c, { total: 0, maoDeObra: 0, compraDireta: 0, itens: 0 }]),
  ) as TotaisConferencia['porCategoria'];

  let totalGeral = 0;
  let totalMaoDeObra = 0;
  let totalCompraDireta = 0;

  for (const item of itens) {
    const valor = item.valor_total ?? 0;
    const alvo = porCategoria[item.categoria];
    alvo.itens += 1;
    alvo.total = arredondarReais(alvo.total + valor);
    totalGeral = arredondarReais(totalGeral + valor);

    if (item.eh_compra_direta) {
      alvo.compraDireta = arredondarReais(alvo.compraDireta + valor);
      totalCompraDireta = arredondarReais(totalCompraDireta + valor);
    } else {
      alvo.maoDeObra = arredondarReais(alvo.maoDeObra + valor);
      totalMaoDeObra = arredondarReais(totalMaoDeObra + valor);
    }
  }

  return { totalGeral, totalMaoDeObra, totalCompraDireta, porCategoria };
}

/** Confere o somatório importado contra o total oficial da planilha. */
export function conferirTotal(
  totalCalculado: number,
  esperado: number = TOTAL_CONTRATADO_ESPERADO,
  tolerancia: number = TOLERANCIA_TOTAL_REAIS,
): { bate: boolean; diferenca: number; esperado: number; calculado: number } {
  const diferenca = arredondarReais(totalCalculado - esperado);
  return { bate: Math.abs(diferenca) <= tolerancia, diferenca, esperado, calculado: totalCalculado };
}

/* -------------------------------------------------------------------------- */
/* Leitura do .xlsx (I/O isolado)                                              */
/* -------------------------------------------------------------------------- */

/** Interface mínima da planilha, para permitir teste com dublê. */
export interface PlanilhaLike {
  getRow(numero: number): { getCell(coluna: number): { value: unknown } };
}

/**
 * Extrai as linhas da aba ORÇAMENTO.
 *
 * Varre um intervalo fixo de linhas em vez de usar `eachRow`: a aba declara mais
 * de 1 milhão de linhas vazias e a varredura completa levaria minutos.
 */
export function extrairLinhas(planilha: PlanilhaLike): ResultadoParse {
  const linhas: LinhaOrcamento[] = [];
  const totaisDeclaradosPorCategoria: Partial<Record<CategoriaOrcamento, number>> = {};
  let totalDaPlanilha: number | null = null;

  for (let r = PRIMEIRA_LINHA_DADOS; r <= ULTIMA_LINHA_VARREDURA; r += 1) {
    const linha = planilha.getRow(r);
    const rotuloTotal = textoDaCelula(linha.getCell(COLUNAS.precoUnitario).value);
    if (/TOTAL DO SERVI/i.test(rotuloTotal)) {
      totalDaPlanilha = arredondarReais(numeroDaCelula(linha.getCell(COLUNAS.valorTotal).value));
      break;
    }

    const itemCodigo = normalizarCodigo(textoDaCelula(linha.getCell(COLUNAS.item).value));
    if (!itemCodigo) continue;
    if (!/^\d+(\.\d+)*$/.test(itemCodigo)) continue;

    const unidadeBruta = textoDaCelula(linha.getCell(COLUNAS.unidade).value);
    const registro: LinhaOrcamento = {
      linhaPlanilha: r,
      itemCodigo,
      descricao: textoDaCelula(linha.getCell(COLUNAS.descricao).value),
      unidade: unidadeBruta ? unidadeBruta : null,
      quantidade: numeroDaCelula(linha.getCell(COLUNAS.quantidade).value),
      precoUnitario: numeroDaCelula(linha.getCell(COLUNAS.precoUnitario).value),
      valorTotal: numeroDaCelula(linha.getCell(COLUNAS.valorTotal).value),
      observacoes: textoDaCelula(linha.getCell(COLUNAS.observacoes).value),
      ehCabecalhoCategoria: ehCabecalhoDeCategoria(itemCodigo),
    };
    linhas.push(registro);

    if (registro.ehCabecalhoCategoria) {
      const categoria = categoriaPorCodigo(registro.itemCodigo);
      if (categoria) totaisDeclaradosPorCategoria[categoria] = arredondarReais(registro.valorTotal);
    }
  }

  return { linhas, totalDaPlanilha, totaisDeclaradosPorCategoria };
}

/** Abre o .xlsx e devolve as linhas da aba ORÇAMENTO. */
export async function lerPlanilhaOrcamento(caminho: string): Promise<ResultadoParse> {
  // Import dinâmico: mantém as funções puras deste módulo utilizáveis sem
  // carregar o exceljs (que é pesado e só faz sentido no Node).
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(caminho);

  const planilha = workbook.getWorksheet(NOME_ABA_ORCAMENTO);
  if (!planilha) {
    const nomes = workbook.worksheets.map((w) => w.name).join(', ');
    throw new Error(`Aba "${NOME_ABA_ORCAMENTO}" não encontrada em "${caminho}". Abas disponíveis: ${nomes}.`);
  }
  return extrairLinhas(planilha as unknown as PlanilhaLike);
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                         */
/* -------------------------------------------------------------------------- */

export interface OpcoesImport {
  arquivo: string;
  /** true = não escreve nada no banco. Padrão do script. */
  dryRun: boolean;
}

export function lerOpcoes(argv: readonly string[]): OpcoesImport {
  const args = [...argv];
  const indiceArquivo = args.findIndex((a) => a === '--arquivo' || a.startsWith('--arquivo='));

  let arquivo = process.env.ORCAMENTO_XLSX_PATH || CAMINHO_PADRAO_XLSX;
  if (indiceArquivo !== -1) {
    const bruto = args[indiceArquivo];
    arquivo = bruto.includes('=') ? bruto.split('=').slice(1).join('=') : (args[indiceArquivo + 1] ?? arquivo);
  }

  // Escrita só com --apply explícito; --dry-run é o padrão.
  return { arquivo, dryRun: !args.includes('--apply') };
}

const LARGURA = 78;
const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const titulo = (t: string) => console.log(`\n${'─'.repeat(LARGURA)}\n${t}\n${'─'.repeat(LARGURA)}`);
const destaque = (t: string) => console.log(`\n${'█'.repeat(LARGURA)}\n  ${t}\n${'█'.repeat(LARGURA)}`);

export function imprimirRelatorio(
  parse: ResultadoParse,
  montagem: ResultadoMontagem,
  totais: TotaisConferencia,
): void {
  titulo('PARSE DA ABA ORÇAMENTO');
  console.log(`  Linhas de item lidas.................. ${parse.linhas.length}`);
  console.log(`  Folhas importáveis.................... ${montagem.itens.length}`);
  console.log(`  Totalizadoras descartadas............. ${montagem.agregadoras.length}`);
  console.log(`  Linhas sem descrição ignoradas........ ${montagem.semDescricao.length}`);
  console.log(`  Total lido da planilha................ ${parse.totalDaPlanilha !== null ? reais(parse.totalDaPlanilha) : '—'}`);

  titulo('ORÇADO POR CATEGORIA — mão de obra x compra direta (concreto)');
  console.log(`  ${'Categoria'.padEnd(32)} ${'Mão de obra'.padStart(15)} ${'Compra direta'.padStart(15)} ${'Total'.padStart(15)}`);
  for (const categoria of ORDEM_CATEGORIAS) {
    const c = totais.porCategoria[categoria];
    console.log(
      `  ${ROTULO_CATEGORIA[categoria].padEnd(32)} ${reais(c.maoDeObra).padStart(15)} ` +
        `${reais(c.compraDireta).padStart(15)} ${reais(c.total).padStart(15)}`,
    );
  }
  console.log(`  ${'—'.repeat(LARGURA - 4)}`);
  console.log(
    `  ${'TOTAL'.padEnd(32)} ${reais(totais.totalMaoDeObra).padStart(15)} ` +
      `${reais(totais.totalCompraDireta).padStart(15)} ${reais(totais.totalGeral).padStart(15)}`,
  );
  console.log(
    '\n  Regra de negócio: o concreto é COMPRA DIRETA da contratada, faturada pela\n' +
      '  contratante. A coluna "Compra direta" NUNCA soma ao valor de mão de obra do\n' +
      '  contrato do terceirizado.',
  );

  if (montagem.duplicados.length > 0) {
    titulo('CÓDIGOS DUPLICADOS NA PLANILHA (renomeados para caber no UNIQUE do banco)');
    for (const d of montagem.duplicados) {
      console.log(`  linha ${d.linhaPlanilha}: "${d.itemCodigo}" → "${d.codigoFinal}" — ${d.descricao.slice(0, 60)}`);
    }
  }

  if (montagem.avisos.length > 0) {
    titulo('AVISOS');
    for (const aviso of montagem.avisos) console.log(`  • ${aviso}`);
  }

  const conferencia = conferirTotal(totais.totalGeral);
  if (conferencia.bate) {
    titulo('CONFERÊNCIA DO TOTAL');
    console.log(`  OK: ${reais(conferencia.calculado)} bate com o total contratado ${reais(conferencia.esperado)}.`);
  } else {
    destaque(
      `DIVERGÊNCIA NO TOTAL: importado ${reais(conferencia.calculado)} x esperado ` +
        `${reais(conferencia.esperado)} (diferença ${reais(conferencia.diferenca)}). ` +
        'NÃO aplique o import sem conferir a planilha.',
    );
  }

  // Confere cada categoria contra o total declarado no cabeçalho do bloco.
  // Quando divergem, o problema está na FÓRMULA da planilha (faixa de SUM que
  // não cobre todos os subitens), não no import: a soma das folhas é a correta.
  const divergentes = ORDEM_CATEGORIAS.map((categoria) => {
    const declarado = parse.totaisDeclaradosPorCategoria[categoria];
    if (declarado === undefined) return null;
    const diferenca = arredondarReais(totais.porCategoria[categoria].total - declarado);
    return Math.abs(diferenca) > TOLERANCIA_TOTAL_REAIS ? { categoria, declarado, diferenca } : null;
  }).filter((d): d is { categoria: CategoriaOrcamento; declarado: number; diferenca: number } => d !== null);

  if (divergentes.length > 0) {
    destaque('CATEGORIAS COM SOMA DE FOLHAS DIFERENTE DO TOTALIZADOR DA PLANILHA');
    for (const d of divergentes) {
      console.log(
        `  ${ROTULO_CATEGORIA[d.categoria].padEnd(32)} folhas ${reais(totais.porCategoria[d.categoria].total)} ` +
          `x totalizador ${reais(d.declarado)} (diferença ${reais(d.diferenca)})`,
      );
    }
    console.log(
      '\n  O totalizador do bloco é uma fórmula da própria planilha. Quando a faixa do\n' +
        '  SUM não cobre todos os subitens, o total oficial fica menor que a soma real\n' +
        '  dos serviços. Conferir com o autor do orçamento antes de fechar a medição.',
    );
  }
}

async function main(): Promise<void> {
  carregarEnv({ path: '.env.local', quiet: true });
  carregarEnv({ quiet: true });

  const opcoes = lerOpcoes(process.argv.slice(2));
  console.log(`\nArquivo: ${opcoes.arquivo}`);
  console.log(`Modo:    ${opcoes.dryRun ? 'DRY-RUN (nada é gravado)' : 'APPLY (grava no banco)'}`);

  const parse = await lerPlanilhaOrcamento(opcoes.arquivo);

  // Em dry-run não tocamos no banco (mantém o script 100% offline, só com o
  // .xlsx): o projeto_id é o placeholder acima, nunca gravado. Em apply,
  // resolve o id real do dispositivo antes de montar o payload.
  let projetoId = PROJETO_ID_DRY_RUN;
  if (!opcoes.dryRun) {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    projetoId = await buscarProjetoId(createAdminClient(), NOME_PROJETO);
  }

  const montagem = montarItens(parse.linhas, projetoId);
  const totais = calcularTotais(montagem.itens);
  imprimirRelatorio(parse, montagem, totais);

  if (opcoes.dryRun) {
    console.log('\nDry-run concluído. Rode novamente com --apply para gravar em orcamento_itens.\n');
    return;
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('orcamento_itens')
    .upsert(montagem.itens, { onConflict: 'projeto_id,item_codigo' });

  if (error) {
    destaque(`FALHA AO GRAVAR: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n${montagem.itens.length} itens gravados em orcamento_itens (upsert por projeto_id+item_codigo).\n`);
}

// Executa só quando chamado pela CLI (o módulo é importado pelos testes).
const chamadoDiretamente =
  typeof process !== 'undefined' && process.argv[1]?.includes('import-orcamento');
if (chamadoDiretamente) {
  main().catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  });
}
