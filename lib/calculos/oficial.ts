/**
 * lib/calculos/oficial.ts — qual número é o OFICIAL de evolução física.
 *
 * O Smartsheet é a fonte da verdade do cronograma, então o percentual exibido
 * tem que ser o dele. Mas ele e o app chegam a valores diferentes de forma
 * legítima, e vale registrar por quê:
 *
 *   - O Smartsheet faz rollup nível a nível, ponderando cada linha filha pela
 *     duração DA PRÓPRIA LINHA. A duração de uma linha-mãe é o intervalo entre
 *     o início mais cedo e o fim mais tarde dos filhos — e irmãos se sobrepõem
 *     no tempo, então ela NÃO é a soma das durações dos filhos.
 *   - O app pondera as atividades-folha pela duração de cada folha.
 *
 * Nos dados de 05/08/2026 isso dá 6% contra 3,26%. Nenhuma das duas contas está
 * errada; elas respondem a perguntas diferentes. A decisão do projeto é exibir
 * a do Smartsheet, e a implementação é IMPORTAR o valor que ele exporta em vez
 * de replicar a fórmula — replicar exigiria adivinhar o arredondamento (6,28
 * vira 0.06 no arquivo) e quebraria em silêncio se a Smartsheet mudasse a
 * regra.
 *
 * Quando o rollup não veio (import ainda não rodado, ou coluna vazia no
 * export), caímos no valor calculado e dizemos isso na `fonte` — a UI é
 * obrigada a sinalizar, para ninguém tomar decisão achando que está vendo o
 * número do Smartsheet.
 */

import { arredondar, limitarPercentual } from './tipos';

/** De onde veio o percentual exibido. */
export type FontePercentual = 'smartsheet' | 'calculado';

export interface PercentualOficial {
  /** Valor 0–100 a exibir. */
  valor: number;
  fonte: FontePercentual;
  /**
   * O valor calculado pelo app, sempre presente. Quando `fonte` é 'smartsheet'
   * serve para a UI mostrar a divergência lado a lado — é ela que revela que
   * 304 das 310 atividades estão sem apontamento.
   */
  calculado: number;
  /**
   * Diferença `valor − calculado` em pontos percentuais. Zero quando a fonte é
   * o próprio cálculo.
   */
  divergenciaPontosPercentuais: number;
}

/**
 * Resolve o percentual oficial.
 *
 * `rollupSmartsheet` vem de `projetos.percentual_smartsheet` (geral) ou
 * `grupos_macro.percentual_smartsheet` (frente). `null`/`undefined` significa
 * **sem apontamento**, não zero — por isso cai no calculado em vez de exibir 0.
 */
export function percentualOficial(
  rollupSmartsheet: number | null | undefined,
  percentualCalculado: number,
): PercentualOficial {
  const calculado = arredondar(limitarPercentual(percentualCalculado), 2);

  if (rollupSmartsheet === null || rollupSmartsheet === undefined || Number.isNaN(rollupSmartsheet)) {
    return {
      valor: calculado,
      fonte: 'calculado',
      calculado,
      divergenciaPontosPercentuais: 0,
    };
  }

  const valor = arredondar(limitarPercentual(rollupSmartsheet), 2);
  return {
    valor,
    fonte: 'smartsheet',
    calculado,
    divergenciaPontosPercentuais: arredondar(valor - calculado, 2),
  };
}

/**
 * Divergência relevante o bastante para a UI avisar. Abaixo disso é ruído de
 * arredondamento (o Smartsheet exporta o geral com 2 casas na fração).
 */
export const LIMIAR_DIVERGENCIA_PP = 1;

/** A UI deve destacar a divergência entre o número do Smartsheet e o calculado? */
export function divergenciaRelevante(oficial: PercentualOficial): boolean {
  return (
    oficial.fonte === 'smartsheet' &&
    Math.abs(oficial.divergenciaPontosPercentuais) >= LIMIAR_DIVERGENCIA_PP
  );
}
