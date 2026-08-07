/**
 * components/cronograma/ganttGeometry.ts — geometria das barras do Gantt.
 *
 * Só posicionamento visual: a criticidade e as datas vêm prontas do banco
 * (Smartsheet), e este app não tem motor de CPM próprio. A aritmética de datas
 * é a do motor (`@/lib/calculos`), em UTC, para a barra não deslocar um dia
 * conforme o fuso do navegador.
 */

import { diferencaEmDias, paraDataUTC } from '@/lib/calculos';

export interface JanelaGantt {
  inicio: string;
  fim: string;
  /** Dias inclusivos entre início e fim da janela. */
  totalDias: number;
}

/** Menor início e maior fim de um conjunto de atividades. */
export function janelaDoConjunto(
  atividades: readonly {
    data_inicio_planejada: string | null;
    data_fim_planejada: string | null;
  }[],
): JanelaGantt | null {
  let inicio: string | null = null;
  let fim: string | null = null;

  for (const atividade of atividades) {
    const i = atividade.data_inicio_planejada?.slice(0, 10) ?? null;
    const f = atividade.data_fim_planejada?.slice(0, 10) ?? null;
    if (i && (!inicio || i < inicio)) inicio = i;
    if (f && (!fim || f > fim)) fim = f;
  }

  if (!inicio || !fim) return null;

  const dataInicio = paraDataUTC(inicio);
  const dataFim = paraDataUTC(fim);
  if (!dataInicio || !dataFim) return null;

  const totalDias = diferencaEmDias(dataInicio, dataFim) + 1;
  return { inicio, fim, totalDias: totalDias > 0 ? totalDias : 1 };
}

export interface BarraGantt {
  /** Deslocamento da barra, em % da largura da janela. */
  esquerdaPct: number;
  /** Largura da barra, em % da largura da janela. */
  larguraPct: number;
}

/**
 * Posição da barra de uma atividade dentro da janela.
 * Atividade sem datas devolve `null` — ela é exibida como "sem datas
 * planejadas", nunca como uma barra inventada no início do gráfico.
 */
export function barraDaAtividade(
  atividade: {
    data_inicio_planejada: string | null;
    data_fim_planejada: string | null;
  },
  janela: JanelaGantt,
): BarraGantt | null {
  const inicio = paraDataUTC(atividade.data_inicio_planejada);
  const fim = paraDataUTC(atividade.data_fim_planejada);
  const inicioJanela = paraDataUTC(janela.inicio);
  if (!inicio || !fim || !inicioJanela || janela.totalDias <= 0) return null;

  const deslocamentoDias = diferencaEmDias(inicioJanela, inicio);
  const duracaoDias = Math.max(1, diferencaEmDias(inicio, fim) + 1);

  const esquerdaPct = (deslocamentoDias / janela.totalDias) * 100;
  const larguraPct = (duracaoDias / janela.totalDias) * 100;

  return {
    esquerdaPct: Math.max(0, Math.min(100, esquerdaPct)),
    larguraPct: Math.max(0.8, Math.min(100 - Math.max(0, esquerdaPct), larguraPct)),
  };
}

/** Posição (%) de uma data de referência na janela — a linha do "hoje". */
export function marcadorDeData(data: string, janela: JanelaGantt): number | null {
  const referencia = paraDataUTC(data);
  const inicioJanela = paraDataUTC(janela.inicio);
  if (!referencia || !inicioJanela || janela.totalDias <= 0) return null;

  const posicao = (diferencaEmDias(inicioJanela, referencia) / janela.totalDias) * 100;
  if (posicao < 0 || posicao > 100) return null;
  return posicao;
}
