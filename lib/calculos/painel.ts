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
}

export interface IndicadoresPainel {
  percentualEvolucaoGeral: number;
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

  return {
    percentualEvolucaoGeral: geral,
    faixaProgressoGeral: faixaProgresso(geral),
    prazo: statusPrazo(atividades, dataReferencia, {
      ...ponderacao,
      filtros,
      toleranciaPontosPercentuais,
    }),
    semanasRestantes: semanasRestantes(dataReferencia, dataFimPlanejada),
    resumo: resumirAtividades(atividades, filtros),
    porGrupoMacro: percentualPorGrupoMacro(atividades, { ...ponderacao, filtros }),
    porElementoVisual: percentuaisPorElementoVisual(atividades, {
      ...ponderacao,
      filtros,
    }),
  };
}
