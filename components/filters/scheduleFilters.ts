/**
 * components/filters/scheduleFilters.ts — estado e aplicação dos filtros
 * compartilhados pelo Cronograma e pela Curva S.
 *
 * Os filtros de frente/elemento/criticidade são delegados a `filtrarAtividades`
 * de `@/lib/calculos` (mesma semântica usada pelos indicadores). O único filtro
 * que mora aqui é o de "semana atual", que é recorte de exibição, não fórmula —
 * e mesmo ele usa a aritmética de datas do motor, nunca `Date` local.
 */

import {
  domingoDaSemana,
  filtrarAtividades,
  formatarDataISO,
  paraDataUTC,
  segundaFeiraDaSemana,
  type AtividadeCalculo,
  type FiltrosAtividade,
} from '@/lib/calculos';

/** Estado dos filtros na tela (o que os controles da barra manipulam). */
export interface ScheduleFilterState {
  /** Id do grupo macro (frente/disciplina). `''` = todas. */
  grupoMacroId: string;
  /** Id do elemento estrutural. `''` = todos. */
  elementoVisualId: string;
  /** Só atividades do caminho crítico. */
  apenasCriticas: boolean;
  /** Só atividades cuja janela planejada cruza a semana atual. */
  apenasSemanaAtual: boolean;
  /** Busca livre pelo nome da atividade. */
  busca: string;
}

export const FILTROS_INICIAIS: ScheduleFilterState = {
  grupoMacroId: '',
  elementoVisualId: '',
  apenasCriticas: false,
  apenasSemanaAtual: false,
  busca: '',
};

/** Converte o estado da tela nos filtros aceitos pelo motor de cálculo. */
export function toCalculationFilters(estado: ScheduleFilterState): FiltrosAtividade {
  return {
    gruposMacroIds: estado.grupoMacroId ? [estado.grupoMacroId] : undefined,
    elementosVisuaisIds: estado.elementoVisualId ? [estado.elementoVisualId] : undefined,
    apenasCaminhoCritico: estado.apenasCriticas || undefined,
  };
}

/** Segunda-feira da semana de uma data ('YYYY-MM-DD'), ou `null` se inválida. */
export function mondayOfWeek(dataReferencia: string): string | null {
  const data = paraDataUTC(dataReferencia);
  if (!data) return null;
  return formatarDataISO(segundaFeiraDaSemana(data));
}

/** Domingo que fecha a semana de uma segunda-feira ('YYYY-MM-DD'). */
export function sundayOfWeek(segunda: string): string | null {
  const data = paraDataUTC(segunda);
  if (!data) return null;
  return formatarDataISO(domingoDaSemana(data));
}

/**
 * A janela planejada da atividade cruza a semana da segunda informada?
 * Atividade sem datas responde `false` — sem datas não dá para afirmar que ela
 * está na semana, e inventar isso encheria a tela de falso positivo.
 */
export function matchesWeek(
  atividade: Pick<AtividadeCalculo, 'data_inicio_planejada' | 'data_fim_planejada'>,
  segunda: string,
): boolean {
  const inicio = atividade.data_inicio_planejada;
  const fim = atividade.data_fim_planejada;
  if (!inicio || !fim) return false;

  const domingo = sundayOfWeek(segunda);
  if (!domingo) return false;

  // Datas 'YYYY-MM-DD' comparam corretamente como texto.
  return inicio.slice(0, 10) <= domingo && fim.slice(0, 10) >= segunda;
}

/** Normaliza texto para busca (sem acento, minúsculo). */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // tira os diacríticos separados pelo NFD
    .toLowerCase()
    .trim();
}

/**
 * Aplica todos os filtros da tela a uma lista de atividades.
 * `dataReferencia` é sempre injetada — nenhum componente lê o relógio sozinho.
 */
export function applyScheduleFilters<
  T extends AtividadeCalculo & { nome?: string },
>(atividades: readonly T[], estado: ScheduleFilterState, dataReferencia: string): T[] {
  let resultado = filtrarAtividades(atividades, toCalculationFilters(estado));

  if (estado.apenasSemanaAtual) {
    const segunda = mondayOfWeek(dataReferencia);
    resultado = segunda
      ? resultado.filter((atividade) => matchesWeek(atividade, segunda))
      : [];
  }

  const busca = normalizarTexto(estado.busca ?? '');
  if (busca) {
    resultado = resultado.filter((atividade) =>
      normalizarTexto(atividade.nome ?? '').includes(busca),
    );
  }

  return resultado;
}

/** Quantos filtros estão ativos (para o rótulo "limpar filtros"). */
export function countActiveFilters(estado: ScheduleFilterState): number {
  return [
    Boolean(estado.grupoMacroId),
    Boolean(estado.elementoVisualId),
    estado.apenasCriticas,
    estado.apenasSemanaAtual,
    Boolean(estado.busca.trim()),
  ].filter(Boolean).length;
}
