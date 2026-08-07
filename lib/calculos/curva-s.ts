/**
 * lib/calculos/curva-s.ts — agregação da Curva S (planejado x realizado).
 *
 * CONVENÇÃO DE SEMANA: cada ponto da série é identificado pela SEGUNDA-FEIRA da
 * semana ISO (campo `semana`, mesmo formato de `avancos_semanais.semana_referencia`,
 * que tem constraint `extract(isodow) = 1`), e representa a situação ao FIM
 * daquela semana — ou seja, medida no domingo (`fimSemana`). É assim que o
 * lançamento de produção funciona na obra: fecha-se a semana e registra-se o
 * acumulado.
 *
 * PLANEJADO: por padrão vem da progressão linear das datas do Smartsheet
 * (`fontePlanejado: 'datas'`), ponderada por duração — a mesma linha de base do
 * status de prazo. Com `fontePlanejado: 'avancos'`, usa a coluna
 * `percentual_planejado_acumulado` lançada em `avancos_semanais`, para quando o
 * planejamento semanal for repactuado fora das datas do cronograma.
 *
 * REALIZADO: vem de `avancos_semanais.percentual_realizado_acumulado`, com
 * carry-forward do último lançamento de cada atividade (semana sem lançamento
 * mantém o acumulado anterior, não zera). Semanas posteriores ao último
 * lançamento recebem `null` — a curva realizada PARA no presente, ela não é
 * extrapolada para o futuro.
 */

import {
  chaveSemana,
  domingoDaSemana,
  formatarDataISO,
  listarSemanas,
  paraDataUTC,
  segundaFeiraDaSemana,
  type DataEntrada,
} from './datas';
import { pesoAtividade } from './evolucao';
import { percentualPlanejadoAcumulado } from './prazo';
import {
  arredondar,
  filtrarAtividades,
  limitarPercentual,
  type AtividadeCalculo,
  type AvancoSemanalCalculo,
  type FiltrosAtividade,
  type OpcoesPonderacao,
} from './tipos';

/** Origem do planejado da curva. */
export type FontePlanejado = 'datas' | 'avancos';

export interface OpcoesCurvaS extends OpcoesPonderacao {
  /** Filtros por frente/grupo macro, elemento visual e caminho crítico. */
  filtros?: FiltrosAtividade;
  /**
   * Data "hoje" do relatório. Marca os pontos futuros (`eFutura`) e impede que
   * lançamentos com semana posterior à referência apareçam como realizado.
   * Sempre injetada — o motor nunca lê o relógio.
   */
  dataReferencia?: DataEntrada;
  /** Origem do planejado. Padrão: `'datas'`. */
  fontePlanejado?: FontePlanejado;
  /** Recorte opcional da janela do gráfico. */
  semanaInicial?: DataEntrada;
  semanaFinal?: DataEntrada;
}

/** Um ponto semanal da Curva S. */
export interface PontoCurvaS {
  /** Segunda-feira da semana ISO ('YYYY-MM-DD'). Chave do ponto. */
  semana: string;
  /** Domingo que fecha a semana ('YYYY-MM-DD'). Data de medição do ponto. */
  fimSemana: string;
  /** Planejado acumulado até o fim da semana, 0–100. */
  planejadoAcumulado: number;
  /** Avanço planejado só desta semana (derivada do acumulado), em p.p. */
  planejadoPeriodo: number;
  /** Realizado acumulado, 0–100. `null` = semana ainda sem lançamento. */
  realizadoAcumulado: number | null;
  /** Avanço realizado só desta semana, em p.p. `null` quando não há dado. */
  realizadoPeriodo: number | null;
  /** `true` quando a semana é posterior à `dataReferencia`. */
  eFutura: boolean;
}

/** Retorno de `agregarCurvaS`. */
export interface CurvaS {
  pontos: PontoCurvaS[];
  /** Atividades que sobraram após os filtros. */
  totalAtividades: number;
  /** Soma dos pesos (dias de duração, ou custo) das atividades filtradas. */
  pesoTotal: number;
  /** Atividades filtradas sem datas planejadas (fora da linha de base). */
  atividadesSemDatas: number;
  /** Última semana com lançamento de realizado, ou `null` se não houver nenhum. */
  ultimaSemanaComRealizado: string | null;
}

const CURVA_VAZIA: CurvaS = {
  pontos: [],
  totalAtividades: 0,
  pesoTotal: 0,
  atividadesSemDatas: 0,
  ultimaSemanaComRealizado: null,
};

/**
 * Agrega a Curva S: séries acumuladas de planejado e realizado por semana ISO.
 *
 * Bordas: sem atividades → curva vazia; sem avanços → realizado todo `null`;
 * atividades sem datas não entram na linha de base (são reportadas em
 * `atividadesSemDatas`); pesos zerados nunca causam divisão por zero.
 */
export function agregarCurvaS(
  atividades: readonly AtividadeCalculo[],
  avancos: readonly AvancoSemanalCalculo[] = [],
  opcoes: OpcoesCurvaS = {},
): CurvaS {
  const alvo = filtrarAtividades(atividades, opcoes.filtros);
  if (alvo.length === 0) return { ...CURVA_VAZIA };

  const idsAlvo = new Set(alvo.map((atividade) => atividade.id));
  const avancosAlvo = (Array.isArray(avancos) ? avancos : []).filter((avanco) =>
    idsAlvo.has(avanco.atividade_id),
  );

  // ---------------------------------------------------------------------------
  // 1. Janela de semanas do gráfico.
  // ---------------------------------------------------------------------------
  const datas: Date[] = [];
  let atividadesSemDatas = 0;
  for (const atividade of alvo) {
    const inicio = paraDataUTC(atividade.data_inicio_planejada);
    const fim = paraDataUTC(atividade.data_fim_planejada);
    if (!inicio || !fim) atividadesSemDatas += 1;
    if (inicio) datas.push(inicio);
    if (fim) datas.push(fim);
  }
  for (const avanco of avancosAlvo) {
    const semana = paraDataUTC(avanco.semana_referencia);
    if (semana) datas.push(semana);
  }
  if (datas.length === 0) {
    return { ...CURVA_VAZIA, totalAtividades: alvo.length, atividadesSemDatas };
  }

  const tempos = datas.map((data) => data.getTime());
  let inicioJanela = new Date(Math.min(...tempos));
  let fimJanela = new Date(Math.max(...tempos));

  const inicioForcado = paraDataUTC(opcoes.semanaInicial);
  const fimForcado = paraDataUTC(opcoes.semanaFinal);
  if (inicioForcado) inicioJanela = inicioForcado;
  if (fimForcado) fimJanela = fimForcado;
  if (fimJanela.getTime() < inicioJanela.getTime()) {
    return { ...CURVA_VAZIA, totalAtividades: alvo.length, atividadesSemDatas };
  }

  const semanas = listarSemanas(inicioJanela, fimJanela);

  // ---------------------------------------------------------------------------
  // 2. Índice dos avanços: atividade → semana → percentuais.
  // ---------------------------------------------------------------------------
  const referencia = paraDataUTC(opcoes.dataReferencia);
  const semanaReferencia = referencia ? segundaFeiraDaSemana(referencia) : null;

  const porAtividade = new Map<string, Map<string, AvancoSemanalCalculo>>();
  let ultimaSemanaComRealizado: string | null = null;

  for (const avanco of avancosAlvo) {
    const semana = chaveSemana(avanco.semana_referencia);
    if (!semana) continue; // lançamento com data inválida é ignorado, não quebra a curva
    if (semanaReferencia) {
      const dataSemana = paraDataUTC(semana);
      if (dataSemana && dataSemana.getTime() > semanaReferencia.getTime()) continue;
    }
    let mapa = porAtividade.get(avanco.atividade_id);
    if (!mapa) {
      mapa = new Map<string, AvancoSemanalCalculo>();
      porAtividade.set(avanco.atividade_id, mapa);
    }
    mapa.set(semana, avanco);
    if (!ultimaSemanaComRealizado || semana > ultimaSemanaComRealizado) {
      ultimaSemanaComRealizado = semana;
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Série semanal.
  // ---------------------------------------------------------------------------
  const usarAvancosNoPlanejado = opcoes.fontePlanejado === 'avancos';

  // Estado de carry-forward por atividade (último acumulado conhecido).
  const ultimoRealizado = new Map<string, number>();
  const ultimoPlanejadoLancado = new Map<string, number>();

  let pesoTotal = 0;
  for (const atividade of alvo) pesoTotal += pesoAtividade(atividade, opcoes);

  const pontos: PontoCurvaS[] = [];
  let planejadoAnterior = 0;
  let realizadoAnterior: number | null = null;

  for (const semana of semanas) {
    const chave = formatarDataISO(semana);
    const fimSemana = domingoDaSemana(semana);
    const eFutura = semanaReferencia
      ? semana.getTime() > semanaReferencia.getTime()
      : false;

    // --- planejado ---------------------------------------------------------
    let planejadoAcumulado: number;
    if (usarAvancosNoPlanejado) {
      let soma = 0;
      let peso = 0;
      for (const atividade of alvo) {
        const lancamento = porAtividade.get(atividade.id)?.get(chave);
        if (lancamento) {
          ultimoPlanejadoLancado.set(
            atividade.id,
            limitarPercentual(lancamento.percentual_planejado_acumulado),
          );
        }
        const pesoAtual = pesoAtividade(atividade, opcoes);
        soma += (ultimoPlanejadoLancado.get(atividade.id) ?? 0) * pesoAtual;
        peso += pesoAtual;
      }
      planejadoAcumulado = peso > 0 ? arredondar(soma / peso) : 0;
    } else {
      // Medido no domingo: o ponto representa o fim da semana.
      planejadoAcumulado = percentualPlanejadoAcumulado(alvo, fimSemana, opcoes).percentual;
    }

    // --- realizado ---------------------------------------------------------
    let realizadoAcumulado: number | null = null;
    const dentroDoHistorico =
      ultimaSemanaComRealizado !== null && chave <= ultimaSemanaComRealizado;

    if (dentroDoHistorico) {
      let soma = 0;
      let peso = 0;
      for (const atividade of alvo) {
        const lancamento = porAtividade.get(atividade.id)?.get(chave);
        if (lancamento) {
          ultimoRealizado.set(
            atividade.id,
            limitarPercentual(lancamento.percentual_realizado_acumulado),
          );
        }
        const pesoAtual = pesoAtividade(atividade, opcoes);
        soma += (ultimoRealizado.get(atividade.id) ?? 0) * pesoAtual;
        peso += pesoAtual;
      }
      realizadoAcumulado = peso > 0 ? arredondar(soma / peso) : 0;
    }

    pontos.push({
      semana: chave,
      fimSemana: formatarDataISO(fimSemana),
      planejadoAcumulado,
      planejadoPeriodo: arredondar(planejadoAcumulado - planejadoAnterior),
      realizadoAcumulado,
      realizadoPeriodo:
        realizadoAcumulado === null
          ? null
          : arredondar(realizadoAcumulado - (realizadoAnterior ?? 0)),
      eFutura,
    });

    planejadoAnterior = planejadoAcumulado;
    if (realizadoAcumulado !== null) realizadoAnterior = realizadoAcumulado;
  }

  return {
    pontos,
    totalAtividades: alvo.length,
    pesoTotal: arredondar(pesoTotal),
    atividadesSemDatas,
    ultimaSemanaComRealizado,
  };
}

/**
 * Séries no formato "achatado" que o Recharts consome direto
 * (`{ semana, planejado, realizado }`), sem a UI ter que remapear nada.
 */
export function seriesCurvaS(curva: CurvaS): {
  semana: string;
  planejado: number;
  realizado: number | null;
}[] {
  return curva.pontos.map((ponto) => ({
    semana: ponto.semana,
    planejado: ponto.planejadoAcumulado,
    realizado: ponto.realizadoAcumulado,
  }));
}

/** Ponto da curva correspondente à semana de uma data qualquer. */
export function pontoDaSemana(curva: CurvaS, data: DataEntrada): PontoCurvaS | null {
  const chave = chaveSemana(data);
  if (!chave) return null;
  return curva.pontos.find((ponto) => ponto.semana === chave) ?? null;
}
