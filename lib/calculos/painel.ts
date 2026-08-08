/**
 * lib/calculos/painel.ts — composição pronta dos indicadores de topo.
 *
 * Existe para que o Painel (e qualquer outro consumidor) monte a tela com UMA
 * chamada, sem recombinar fórmulas na camada de UI. Regra do projeto: Curva S e
 * % de evolução física nunca são calculados ad-hoc dentro de componente.
 */

import type { DataEntrada } from './datas';
import { semanasRestantes } from './datas';
import {
  percentualEvolucaoGeral,
  percentualPorGrupoMacro,
  percentuaisPorElementoVisual,
  resumirAtividades,
  type ResumoAtividades,
} from './evolucao';
import { faixaProgresso } from './progresso';
import { percentualOficial, type PercentualOficial } from './oficial';
import { statusPrazo, type AvaliacaoPrazo } from './prazo';
import type {
  AgregadoPercentual,
  AtividadeCalculo,
  FaixaProgresso,
  FiltrosAtividade,
  OpcoesPonderacao,
} from './tipos';

export interface EntradaPainel extends OpcoesPonderacao {
  atividades: readonly AtividadeCalculo[];
  /** Data "hoje" do relatório — sempre injetada. */
  dataReferencia: DataEntrada;
  /** Fim planejado do projeto (`projetos.data_fim_planejada`). */
  dataFimPlanejada: DataEntrada | null | undefined;
  filtros?: FiltrosAtividade;
  toleranciaPontosPercentuais?: number;
  /**
   * Rollup do Smartsheet para o projeto (`projetos.percentual_smartsheet`).
   * Quando presente, é ELE que vira o percentual oficial — ver `oficial.ts`.
   */
  rollupSmartsheetGeral?: number | null;
  /**
   * Rollup por grupo macro (`grupos_macro.percentual_smartsheet`), indexado
   * pelo id do grupo. Chave ausente ou valor nulo = sem apontamento.
   */
  rollupSmartsheetPorGrupo?: Readonly<Record<string, number | null>>;
}

export interface IndicadoresPainel {
  /**
   * Percentual exibido no topo. É o rollup do Smartsheet quando importado; se
   * não, o calculado. Confira `evolucaoGeral.fonte` antes de rotular a tela.
   */
  percentualEvolucaoGeral: number;
  /** O oficial com procedência e divergência — a UI precisa disso para avisar. */
  evolucaoGeral: PercentualOficial;
  /** Oficial por grupo macro, mesma regra, indexado pelo id do grupo. */
  evolucaoPorGrupoMacro: Record<string, PercentualOficial>;
  faixaProgressoGeral: FaixaProgresso;
  prazo: AvaliacaoPrazo;
  semanasRestantes: number;
  resumo: ResumoAtividades;
  porGrupoMacro: Record<string, AgregadoPercentual>;
  porElementoVisual: Record<string, AgregadoPercentual>;
}

/** Monta todos os indicadores de topo do Painel em uma passada. */
export function montarIndicadoresPainel(entrada: EntradaPainel): IndicadoresPainel {
  const {
    atividades,
    dataReferencia,
    dataFimPlanejada,
    filtros,
    toleranciaPontosPercentuais,
    ...ponderacao
  } = entrada;

  const geral = percentualEvolucaoGeral(atividades, { ...ponderacao, filtros });
  const oficialGeral = percentualOficial(entrada.rollupSmartsheetGeral, geral);

  const porGrupo = percentualPorGrupoMacro(atividades, { ...ponderacao, filtros });
  const rollupGrupos = entrada.rollupSmartsheetPorGrupo ?? {};
  const oficialPorGrupo: Record<string, PercentualOficial> = {};
  for (const [grupoId, agregado] of Object.entries(porGrupo)) {
    oficialPorGrupo[grupoId] = percentualOficial(rollupGrupos[grupoId], agregado.percentual);
  }

  return {
    // O número de topo é o oficial, não o calculado.
    percentualEvolucaoGeral: oficialGeral.valor,
    evolucaoGeral: oficialGeral,
    evolucaoPorGrupoMacro: oficialPorGrupo,
    faixaProgressoGeral: faixaProgresso(oficialGeral.valor),
    prazo: statusPrazo(atividades, dataReferencia, {
      ...ponderacao,
      filtros,
      toleranciaPontosPercentuais,
    }),
    semanasRestantes: semanasRestantes(dataReferencia, dataFimPlanejada),
    resumo: resumirAtividades(atividades, filtros),
    porGrupoMacro: porGrupo,
    porElementoVisual: percentuaisPorElementoVisual(atividades, {
      ...ponderacao,
      filtros,
    }),
  };
}
