/**
 * lib/calculos/prazo.ts — linha de base planejada e status de prazo.
 *
 * LINHA DE BASE: o planejado acumulado numa data é obtido pela progressão
 * LINEAR de cada atividade entre `data_inicio_planejada` e `data_fim_planejada`,
 * ponderada pelo mesmo peso do percentual de evolução (duração por padrão):
 *
 *      planejado_i(d) = 0                                     se d < início
 *                     = 100                                   se d >= fim
 *                     = 100 × (d - início + 1) / (fim - início + 1)   caso contrário
 *
 *      planejado(d) = Σ (planejado_i(d) × peso_i) / Σ peso_i
 *
 * A contagem de dias é INCLUSIVA nas duas pontas (o dia de início já é um dia
 * de trabalho), coerente com `duracao_dias` do Smartsheet, onde uma atividade
 * de 15/05 a 15/05 tem duração 1.
 *
 * Atividade sem datas planejadas fica FORA da linha de base (não entra no
 * numerador nem no denominador) e é contada em `atividadesSemDatas` — silenciar
 * isso mascararia um import incompleto do Smartsheet.
 */

import { paraDataUTC, type DataEntrada, diferencaEmDias } from './datas';
import { pesoAtividade } from './evolucao';
import {
  arredondar,
  filtrarAtividades,
  limitarPercentual,
  type AtividadeCalculo,
  type FiltrosAtividade,
  type OpcoesPonderacao,
} from './tipos';

/** Status de prazo exibido no Painel. */
export type StatusPrazo = 'adiantado' | 'no_prazo' | 'atrasado';

/**
 * TOLERÂNCIA DO STATUS DE PRAZO, em pontos percentuais (p.p.).
 *
 * Desvio = realizado − planejado. Enquanto |desvio| <= 2 p.p. a obra é
 * considerada **no prazo**: abaixo disso o ruído de medição semanal (uma
 * atividade lançada com um dia de diferença) faria o card piscar entre
 * "adiantado" e "atrasado" sem significado gerencial.
 *
 * Constante exportada de propósito: qualquer discussão sobre calibrar a
 * tolerância se resolve aqui, e não escondida dentro de um `if`.
 */
export const TOLERANCIA_STATUS_PRAZO_PP = 2;

/**
 * Percentual planejado de UMA atividade numa data (progressão linear).
 * Retorna `null` quando a atividade não tem datas utilizáveis.
 * Datas invertidas (fim < início) são tratadas como atividade de 1 dia no
 * início — dado inconsistente não pode virar percentual negativo.
 */
export function percentualPlanejadoAtividade(
  atividade: AtividadeCalculo,
  dataReferencia: DataEntrada,
): number | null {
  const referencia = paraDataUTC(dataReferencia);
  const inicio = paraDataUTC(atividade.data_inicio_planejada);
  const fim = paraDataUTC(atividade.data_fim_planejada);
  if (!referencia || !inicio || !fim) return null;

  if (referencia.getTime() < inicio.getTime()) return 0;

  const duracaoInclusiva = diferencaEmDias(inicio, fim) + 1;
  if (duracaoInclusiva <= 1) {
    // Atividade de um dia (ou datas invertidas): 100% a partir do início.
    return 100;
  }

  if (referencia.getTime() >= fim.getTime()) return 100;

  const decorridos = diferencaEmDias(inicio, referencia) + 1;
  return limitarPercentual((decorridos / duracaoInclusiva) * 100);
}

/** Resultado da linha de base planejada em uma data. */
export interface LinhaBasePlanejada {
  /** Percentual planejado acumulado ponderado, 0–100. */
  percentual: number;
  /** Soma dos pesos considerados (só atividades com datas). */
  pesoTotal: number;
  /** Atividades que entraram no cálculo. */
  totalAtividades: number;
  /** Atividades descartadas por falta de datas planejadas. */
  atividadesSemDatas: number;
}

/**
 * Planejado acumulado do conjunto na data de referência.
 * Lista vazia ou 100% das atividades sem datas → 0 (nunca divide por zero).
 */
export function percentualPlanejadoAcumulado(
  atividades: readonly AtividadeCalculo[],
  dataReferencia: DataEntrada,
  opcoes: OpcoesPonderacao & { filtros?: FiltrosAtividade } = {},
): LinhaBasePlanejada {
  const alvo = filtrarAtividades(atividades, opcoes.filtros);

  let somaPonderada = 0;
  let pesoTotal = 0;
  let consideradas = 0;
  let semDatas = 0;

  for (const atividade of alvo) {
    const planejado = percentualPlanejadoAtividade(atividade, dataReferencia);
    if (planejado === null) {
      semDatas += 1;
      continue;
    }
    const peso = pesoAtividade(atividade, opcoes);
    somaPonderada += planejado * peso;
    pesoTotal += peso;
    consideradas += 1;
  }

  return {
    percentual: pesoTotal > 0 ? arredondar(somaPonderada / pesoTotal) : 0,
    pesoTotal: arredondar(pesoTotal),
    totalAtividades: consideradas,
    atividadesSemDatas: semDatas,
  };
}

/** Avaliação completa de prazo — tudo que o card do Painel precisa. */
export interface AvaliacaoPrazo {
  status: StatusPrazo;
  /** Percentual realizado ponderado (mesma fórmula do % de evolução). */
  percentualRealizado: number;
  /** Percentual planejado ponderado na data de referência. */
  percentualPlanejado: number;
  /** realizado − planejado, em pontos percentuais. Negativo = atraso. */
  desvioPontosPercentuais: number;
  /** Tolerância aplicada, ecoada para a UI poder explicar o número. */
  toleranciaPontosPercentuais: number;
  /** Atividades sem datas planejadas (linha de base incompleta). */
  atividadesSemDatas: number;
}

/**
 * Classifica um desvio (realizado − planejado, em p.p.) em status de prazo.
 * Função separada para que a Curva S e o Painel apliquem exatamente o mesmo
 * critério.
 */
export function classificarDesvioPrazo(
  desvioPontosPercentuais: number,
  tolerancia: number = TOLERANCIA_STATUS_PRAZO_PP,
): StatusPrazo {
  if (!Number.isFinite(desvioPontosPercentuais)) return 'no_prazo';
  const limite = Math.abs(tolerancia);
  if (desvioPontosPercentuais > limite) return 'adiantado';
  if (desvioPontosPercentuais < -limite) return 'atrasado';
  return 'no_prazo';
}

/**
 * Status de prazo do conjunto de atividades na data de referência.
 * A data de referência é SEMPRE parâmetro — nada de `new Date()` aqui dentro.
 */
export function statusPrazo(
  atividades: readonly AtividadeCalculo[],
  dataReferencia: DataEntrada,
  opcoes: OpcoesPonderacao & {
    filtros?: FiltrosAtividade;
    /** Sobrescreve a tolerância padrão de ±2 p.p. */
    toleranciaPontosPercentuais?: number;
  } = {},
): AvaliacaoPrazo {
  const alvo = filtrarAtividades(atividades, opcoes.filtros);
  const planejado = percentualPlanejadoAcumulado(alvo, dataReferencia, opcoes);

  // Realizado: média ponderada do percentual_concluido, restrita às atividades
  // que têm linha de base — comparar universos diferentes daria desvio falso.
  let somaRealizada = 0;
  let pesoTotal = 0;
  for (const atividade of alvo) {
    if (percentualPlanejadoAtividade(atividade, dataReferencia) === null) continue;
    const peso = pesoAtividade(atividade, opcoes);
    somaRealizada += limitarPercentual(atividade.percentual_concluido) * peso;
    pesoTotal += peso;
  }
  const percentualRealizado = pesoTotal > 0 ? arredondar(somaRealizada / pesoTotal) : 0;

  const tolerancia = opcoes.toleranciaPontosPercentuais ?? TOLERANCIA_STATUS_PRAZO_PP;
  const desvio = arredondar(percentualRealizado - planejado.percentual);

  return {
    status: classificarDesvioPrazo(desvio, tolerancia),
    percentualRealizado,
    percentualPlanejado: planejado.percentual,
    desvioPontosPercentuais: desvio,
    toleranciaPontosPercentuais: tolerancia,
    atividadesSemDatas: planejado.atividadesSemDatas,
  };
}

/**
 * Variante que compara duas séries já prontas (as da Curva S) na data de
 * referência, em vez de recalcular a partir das atividades. Útil quando a UI
 * já tem a curva em mãos e quer o status coerente com o gráfico exibido.
 *
 * Usa o último ponto de cada série cuja semana seja <= data de referência.
 */
export function statusPrazoPorSeries(
  dataReferencia: DataEntrada,
  curvaPlanejada: readonly { semana: string; valor: number }[],
  curvaRealizada: readonly { semana: string; valor: number | null }[],
  tolerancia: number = TOLERANCIA_STATUS_PRAZO_PP,
): AvaliacaoPrazo {
  const referencia = paraDataUTC(dataReferencia);

  const ultimoValor = <T extends { semana: string }>(
    serie: readonly T[],
    leitor: (ponto: T) => number | null,
  ): number => {
    if (!Array.isArray(serie) || serie.length === 0 || !referencia) return 0;
    let valor = 0;
    for (const ponto of serie) {
      const semana = paraDataUTC(ponto.semana);
      if (!semana || semana.getTime() > referencia.getTime()) continue;
      const lido = leitor(ponto);
      if (lido !== null && Number.isFinite(lido)) valor = limitarPercentual(lido);
    }
    return arredondar(valor);
  };

  const percentualPlanejado = ultimoValor(curvaPlanejada, (p) => p.valor);
  const percentualRealizado = ultimoValor(curvaRealizada, (p) => p.valor);
  const desvio = arredondar(percentualRealizado - percentualPlanejado);

  return {
    status: classificarDesvioPrazo(desvio, tolerancia),
    percentualRealizado,
    percentualPlanejado,
    desvioPontosPercentuais: desvio,
    toleranciaPontosPercentuais: tolerancia,
    atividadesSemDatas: 0,
  };
}
