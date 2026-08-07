/**
 * Resumo e validação do parse contra os números reais já conhecidos da obra.
 *
 * ATENÇÃO — fronteira de responsabilidade: os agregados calculados aqui são
 * apenas CONFERÊNCIA DE IMPORT (sanity check do arquivo lido). Os indicadores
 * oficiais do app (% de evolução física, Curva S, status de prazo) são do
 * agente `motor-indicadores`, em `lib/calculos/`, e nunca devem ser derivados
 * deste módulo.
 */

import type { ResultadoParse } from './tipos';

/**
 * Números de referência do snapshot de 05/08/2026 (seção 1 do plano de
 * execução). Servem de alarme de regressão: se o export mudar de forma
 * inesperada, o script grita em vez de importar dados errados em silêncio.
 */
export const NUMEROS_ESPERADOS = {
  /** Total de linhas do ramo, incluindo os 7 grupos macro de nível 1. */
  linhasNoRamo: 317,
  gruposMacro: 7,
  /** 317 linhas − 7 grupos macro. */
  atividades: 310,
  atividadesCaminhoCritico: 34,
  dataInicio: '2026-05-15',
  dataFim: '2027-01-26',
  /** Rollup do próprio Smartsheet na linha raiz do ramo. */
  percentualGeral: 6,
} as const;

export interface ResumoImport {
  totalGrupos: number;
  totalAtividades: number;
  totalLinhasNoRamo: number;
  linhasForaDeEscopo: number;
  linhasVaziasIgnoradas: number;
  atividadesCriticas: number;
  atividadesFolha: number;
  /** Rollup do Smartsheet na linha raiz (referência oficial dos "6%"). */
  percentualRaizSmartsheet: number | null;
  /** Conferência: média simples de todas as atividades importadas. */
  percentualMediaSimples: number;
  /** Conferência: média das folhas ponderada por duração. */
  percentualPonderadoFolhas: number;
  dataMinimaInicio: string | null;
  dataMaximaFim: string | null;
  atividadesComElementoVisual: number;
  taxaVinculoElemento: number;
  vinculosPorTipo: Record<string, number>;
  atividadesSemDuracao: number;
  atividadesSemDataInicio: number;
  porGrupo: {
    nome: string;
    atividades: number;
    criticas: number;
    percentualMediaSimples: number;
  }[];
  /** Divergências contra `NUMEROS_ESPERADOS` — vazio = tudo bate. */
  divergencias: string[];
}

function arredondar(valor: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round(valor * f) / f;
}

export function montarResumo(resultado: ResultadoParse): ResumoImport {
  const { grupos, atividades } = resultado;

  const criticas = atividades.filter((a) => a.caminhoCritico).length;
  const folhas = atividades.filter((a) => a.ehFolha);

  const mediaSimples =
    atividades.length > 0
      ? atividades.reduce((s, a) => s + a.percentualConcluido, 0) / atividades.length
      : 0;

  let numerador = 0;
  let denominador = 0;
  for (const f of folhas) {
    const duracao = f.duracaoDias ?? 0;
    numerador += duracao * f.percentualConcluido;
    denominador += duracao;
  }

  const inicios = atividades.map((a) => a.dataInicioPlanejada).filter((d): d is string => !!d);
  const fins = atividades.map((a) => a.dataFimPlanejada).filter((d): d is string => !!d);
  // Datas em ISO `yyyy-mm-dd` ordenam corretamente por comparação de string.
  const dataMinimaInicio = inicios.length ? inicios.slice().sort()[0] : null;
  const dataMaximaFim = fins.length ? fins.slice().sort().at(-1)! : null;

  const vinculosPorTipo: Record<string, number> = {};
  for (const a of atividades) {
    if (!a.tipoElementoVisual) continue;
    vinculosPorTipo[a.tipoElementoVisual] = (vinculosPorTipo[a.tipoElementoVisual] ?? 0) + 1;
  }
  const comElemento = atividades.filter((a) => a.tipoElementoVisual !== null).length;

  const porGrupo = grupos.map((g) => {
    // Agrupa pela string crua do .xlsx, que é a chave de casamento do import.
    const doGrupo = atividades.filter((a) => a.grupoMacroSmartsheet === g.nomeSmartsheet);
    return {
      nome: g.nomeSmartsheet,
      atividades: doGrupo.length,
      criticas: doGrupo.filter((a) => a.caminhoCritico).length,
      percentualMediaSimples: doGrupo.length
        ? arredondar(doGrupo.reduce((s, a) => s + a.percentualConcluido, 0) / doGrupo.length, 1)
        : 0,
    };
  });

  const totalLinhasNoRamo = grupos.length + atividades.length;
  const divergencias: string[] = [];
  const conferir = (rotulo: string, obtido: unknown, esperado: unknown) => {
    if (obtido !== esperado) {
      divergencias.push(`${rotulo}: obtido ${String(obtido)}, esperado ${String(esperado)}`);
    }
  };
  conferir('linhas no ramo', totalLinhasNoRamo, NUMEROS_ESPERADOS.linhasNoRamo);
  conferir('grupos macro', grupos.length, NUMEROS_ESPERADOS.gruposMacro);
  conferir('atividades', atividades.length, NUMEROS_ESPERADOS.atividades);
  conferir('atividades em caminho crítico', criticas, NUMEROS_ESPERADOS.atividadesCaminhoCritico);
  conferir('data mínima de início', dataMinimaInicio, NUMEROS_ESPERADOS.dataInicio);
  conferir('data máxima de término', dataMaximaFim, NUMEROS_ESPERADOS.dataFim);
  conferir(
    '% geral (rollup do Smartsheet na raiz)',
    resultado.raiz.percentualConcluido,
    NUMEROS_ESPERADOS.percentualGeral,
  );

  return {
    totalGrupos: grupos.length,
    totalAtividades: atividades.length,
    totalLinhasNoRamo,
    linhasForaDeEscopo: resultado.linhasForaDeEscopo,
    linhasVaziasIgnoradas: resultado.linhasVaziasIgnoradas,
    atividadesCriticas: criticas,
    atividadesFolha: folhas.length,
    percentualRaizSmartsheet: resultado.raiz.percentualConcluido,
    percentualMediaSimples: arredondar(mediaSimples),
    percentualPonderadoFolhas: denominador ? arredondar(numerador / denominador) : 0,
    dataMinimaInicio,
    dataMaximaFim,
    atividadesComElementoVisual: comElemento,
    taxaVinculoElemento: atividades.length
      ? arredondar((comElemento / atividades.length) * 100, 1)
      : 0,
    vinculosPorTipo,
    atividadesSemDuracao: atividades.filter((a) => a.duracaoDias === null).length,
    atividadesSemDataInicio: atividades.filter((a) => a.dataInicioPlanejada === null).length,
    porGrupo,
    divergencias,
  };
}
