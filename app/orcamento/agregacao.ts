/**
 * app/orcamento/agregacao.ts — Agregação do orçado x medido do terceirizado.
 *
 * Módulo puro (sem I/O, sem React), consumindo a view `orcamento_resumo_categoria`
 * do banco, que já separa `valor_mao_de_obra` de `valor_compra_direta`.
 *
 * REGRA DE NEGÓCIO CRÍTICA (CLAUDE.md, item 2):
 *   O concreto é COMPRA DIRETA da contratada, faturada pela contratante.
 *   O valor do concreto NUNCA é somado ao valor de mão de obra do contrato do
 *   terceirizado. São duas grandezas distintas, exibidas em colunas separadas
 *   e explicitamente rotuladas.
 *
 * Aqui não se calcula percentual de evolução FÍSICA da obra — isso é de
 * `lib/calculos/` (dono: `motor-indicadores`). O percentual desta tela é
 * financeiro: medido ÷ orçado do contrato.
 */

import type { CategoriaOrcamento, OrcamentoResumoCategoria } from '@/types/database';
import { ORDEM_CATEGORIAS, ROTULO_CATEGORIA } from './categorias';

/** Linha da tabela de orçado x medido, por categoria. */
export interface ResumoCategoriaUI {
  categoria: CategoriaOrcamento;
  rotulo: string;
  totalItens: number;
  /** Contrato do terceirizado (mão de obra). */
  maoDeObraOrcado: number;
  maoDeObraMedido: number;
  maoDeObraPercentual: number;
  /** Concreto — compra direta da contratada, faturada pela contratante. */
  compraDiretaOrcado: number;
  compraDiretaMedido: number;
  compraDiretaPercentual: number;
}

/** Totais de rodapé, com as duas grandezas sempre separadas. */
export interface TotaisOrcamento {
  /** Valor do CONTRATO do terceirizado = só mão de obra. */
  contratoMaoDeObraOrcado: number;
  contratoMaoDeObraMedido: number;
  contratoMaoDeObraPercentual: number;
  /** Compra direta (concreto) — fora do contrato de mão de obra. */
  compraDiretaOrcado: number;
  compraDiretaMedido: number;
  compraDiretaPercentual: number;
  /** Soma das duas colunas. Só existe para conferência com a planilha. */
  totalPlanilha: number;
}

function duasCasas(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function percentual(medido: number, orcado: number): number {
  if (!(orcado > 0)) return 0;
  return duasCasas((medido / orcado) * 100);
}

/**
 * Monta as 7 linhas da tabela a partir da view, sempre na ordem da planilha e
 * incluindo categorias sem item (para a tela não "esconder" um bloco vazio).
 */
export function montarResumoCategorias(
  linhas: readonly OrcamentoResumoCategoria[],
): ResumoCategoriaUI[] {
  const porCategoria = new Map(linhas.map((l) => [l.categoria, l]));

  return ORDEM_CATEGORIAS.map((categoria) => {
    const linha = porCategoria.get(categoria);
    const maoDeObraOrcado = duasCasas(Number(linha?.valor_mao_de_obra ?? 0));
    const maoDeObraMedido = duasCasas(Number(linha?.valor_medido_mao_de_obra ?? 0));
    const compraDiretaOrcado = duasCasas(Number(linha?.valor_compra_direta ?? 0));
    const compraDiretaMedido = duasCasas(Number(linha?.valor_medido_compra_direta ?? 0));

    return {
      categoria,
      rotulo: ROTULO_CATEGORIA[categoria],
      totalItens: Number(linha?.total_itens ?? 0),
      maoDeObraOrcado,
      maoDeObraMedido,
      maoDeObraPercentual: percentual(maoDeObraMedido, maoDeObraOrcado),
      compraDiretaOrcado,
      compraDiretaMedido,
      compraDiretaPercentual: percentual(compraDiretaMedido, compraDiretaOrcado),
    };
  });
}

/**
 * Totaliza o contrato.
 *
 * `contratoMaoDeObraOrcado` é o número que vale para o terceirizado: soma apenas
 * a coluna de mão de obra. O concreto de compra direta fica em campo próprio e
 * jamais é adicionado a esse total.
 */
export function totalizarOrcamento(resumos: readonly ResumoCategoriaUI[]): TotaisOrcamento {
  let contratoMaoDeObraOrcado = 0;
  let contratoMaoDeObraMedido = 0;
  let compraDiretaOrcado = 0;
  let compraDiretaMedido = 0;

  for (const r of resumos) {
    contratoMaoDeObraOrcado = duasCasas(contratoMaoDeObraOrcado + r.maoDeObraOrcado);
    contratoMaoDeObraMedido = duasCasas(contratoMaoDeObraMedido + r.maoDeObraMedido);
    compraDiretaOrcado = duasCasas(compraDiretaOrcado + r.compraDiretaOrcado);
    compraDiretaMedido = duasCasas(compraDiretaMedido + r.compraDiretaMedido);
  }

  return {
    contratoMaoDeObraOrcado,
    contratoMaoDeObraMedido,
    contratoMaoDeObraPercentual: percentual(contratoMaoDeObraMedido, contratoMaoDeObraOrcado),
    compraDiretaOrcado,
    compraDiretaMedido,
    compraDiretaPercentual: percentual(compraDiretaMedido, compraDiretaOrcado),
    // Conferência com o "TOTAL DO SERVIÇO" da planilha. NÃO é o valor do
    // contrato de mão de obra e não deve ser usado para medir o terceirizado.
    totalPlanilha: duasCasas(contratoMaoDeObraOrcado + compraDiretaOrcado),
  };
}

/** Saldo a medir do contrato de mão de obra. */
export function saldoContrato(totais: TotaisOrcamento): number {
  return duasCasas(totais.contratoMaoDeObraOrcado - totais.contratoMaoDeObraMedido);
}
