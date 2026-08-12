/**
 * lib/calculos/historico.ts — trajetória do cronograma ao longo do tempo.
 *
 * Trabalha sobre `historico_cronograma`, que é o único lugar onde o passado
 * existe: `atividades` guarda apenas o estado atual, então nenhuma consulta a
 * ela reconstrói como o prazo evoluiu.
 *
 * Todas as funções aqui são puras e recebem a série já carregada. Os textos de
 * insight também nascem aqui, e não no componente — um insight é uma leitura
 * de números, e leitura de número é cálculo. Se ficasse na UI, uma segunda tela
 * poderia descrever a mesma série de outro jeito sem ninguém perceber.
 */

import { diferencaEmDias, paraDataUTC } from './datas';
import { arredondar } from './tipos';

/** Uma linha de `historico_cronograma`, no mínimo necessário aos cálculos. */
export interface RegistroHistorico {
  data_referencia: string;
  data_inicio_planejada: string | null;
  data_fim_planejada: string | null;
  duracao_dias: number | null;
  percentual_smartsheet: number | null;
  total_atividades: number;
  atividades_criticas: number;
  atividades_concluidas: number;
}

/** Ponto pronto para o gráfico. */
export interface PontoHistorico {
  /** Dia do registro (ISO). Eixo X. */
  data: string;
  /** Duração corrida planejada, em dias. */
  duracaoDias: number | null;
  /** Término planejado naquele dia (ISO) — vai no tooltip. */
  dataFim: string | null;
  /** Percentual oficial concluído. */
  percentual: number | null;
  /** Dias de desvio do término contra o PRIMEIRO registro da série. */
  desvioTerminoDias: number | null;
  /** Atividades no caminho crítico naquele dia. */
  criticas: number;
}

export interface ResumoHistorico {
  pontos: PontoHistorico[];
  /** Primeiro e último registro, para os textos comparativos. */
  primeiro: PontoHistorico | null;
  ultimo: PontoHistorico | null;
  /** Dias acrescentados à duração entre o primeiro e o último registro. */
  variacaoDuracaoDias: number | null;
  /** Dias que o término andou (positivo = para frente). */
  variacaoTerminoDias: number | null;
  /** Pontos percentuais de avanço no período. */
  variacaoPercentualPP: number | null;
  /** Quantos dias de calendário a série cobre. */
  diasCobertos: number | null;
}

function diasEntre(de: string | null, para: string | null): number | null {
  if (!de || !para) return null;
  const a = paraDataUTC(de);
  const b = paraDataUTC(para);
  if (!a || !b) return null;
  return diferencaEmDias(a, b);
}

/**
 * Ordena, normaliza e calcula o desvio de cada ponto contra o primeiro
 * registro da série — que é a referência mais honesta aqui: é o estado mais
 * antigo que o app efetivamente observou.
 */
export function montarSerieHistorico(
  registros: readonly RegistroHistorico[],
): ResumoHistorico {
  const ordenados = [...registros]
    .filter((r) => Boolean(r.data_referencia))
    .sort((a, b) => a.data_referencia.localeCompare(b.data_referencia));

  if (ordenados.length === 0) {
    return {
      pontos: [],
      primeiro: null,
      ultimo: null,
      variacaoDuracaoDias: null,
      variacaoTerminoDias: null,
      variacaoPercentualPP: null,
      diasCobertos: null,
    };
  }

  const terminoInicial = ordenados[0].data_fim_planejada;

  const pontos: PontoHistorico[] = ordenados.map((registro) => ({
    data: registro.data_referencia,
    duracaoDias: registro.duracao_dias,
    dataFim: registro.data_fim_planejada,
    percentual: registro.percentual_smartsheet,
    desvioTerminoDias: diasEntre(terminoInicial, registro.data_fim_planejada),
    criticas: registro.atividades_criticas,
  }));

  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];

  const variacaoDuracaoDias =
    primeiro.duracaoDias !== null && ultimo.duracaoDias !== null
      ? ultimo.duracaoDias - primeiro.duracaoDias
      : null;

  const variacaoPercentualPP =
    primeiro.percentual !== null && ultimo.percentual !== null
      ? arredondar(ultimo.percentual - primeiro.percentual, 2)
      : null;

  return {
    pontos,
    primeiro,
    ultimo,
    variacaoDuracaoDias,
    variacaoTerminoDias: ultimo.desvioTerminoDias,
    variacaoPercentualPP,
    diasCobertos: diasEntre(primeiro.data, ultimo.data),
  };
}

/* -------------------------------------------------------------------------- */
/* Insights                                                                   */
/* -------------------------------------------------------------------------- */

export type TomInsight = 'neutro' | 'atencao' | 'bom';

export interface Insight {
  /** Chave estável, para teste e para a UI escolher ícone sem casar texto. */
  codigo:
    | 'serie_curta'
    | 'prazo_estavel'
    | 'prazo_alongou'
    | 'prazo_encurtou'
    | 'avanco_vs_prazo'
    | 'criticas_variaram'
    | 'ritmo_de_escorregamento';
  texto: string;
  tom: TomInsight;
}

/** Plural sem gambiarra de template. */
function dias(n: number): string {
  const abs = Math.abs(n);
  return `${abs} ${abs === 1 ? 'dia' : 'dias'}`;
}

function formatarBR(iso: string | null): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * Gera as leituras da série.
 *
 * Deliberadamente conservador: nada de projeção de término ("no ritmo atual a
 * obra acaba em X"). Com dois ou três pontos qualquer extrapolação é chute com
 * cara de número, e num painel de obra isso vira decisão errada.
 */
export function gerarInsights(resumo: ResumoHistorico): Insight[] {
  const insights: Insight[] = [];
  const { pontos, primeiro, ultimo } = resumo;

  if (pontos.length < 2 || !primeiro || !ultimo) {
    insights.push({
      codigo: 'serie_curta',
      tom: 'neutro',
      texto:
        pontos.length === 0
          ? 'Ainda não há registros de cronograma. Rode o sync com o Smartsheet para começar a série.'
          : 'Só há um registro até agora. A partir do segundo dia de sync o gráfico mostra a trajetória.',
    });
    return insights;
  }

  // --- prazo ---------------------------------------------------------------
  const desvio = resumo.variacaoTerminoDias;
  if (desvio === null) {
    insights.push({
      codigo: 'prazo_estavel',
      tom: 'neutro',
      texto: 'Sem data de término registrada em algum dos extremos — não dá para medir o desvio.',
    });
  } else if (desvio === 0) {
    insights.push({
      codigo: 'prazo_estavel',
      tom: 'bom',
      texto: `O término planejado não se moveu desde ${formatarBR(primeiro.data)}: segue em ${formatarBR(ultimo.dataFim)}.`,
    });
  } else if (desvio > 0) {
    insights.push({
      codigo: 'prazo_alongou',
      tom: 'atencao',
      texto: `O término planejado andou ${dias(desvio)} para frente desde ${formatarBR(primeiro.data)} — de ${formatarBR(primeiro.dataFim)} para ${formatarBR(ultimo.dataFim)}.`,
    });
  } else {
    insights.push({
      codigo: 'prazo_encurtou',
      tom: 'bom',
      texto: `O término planejado foi antecipado em ${dias(desvio)} — de ${formatarBR(primeiro.dataFim)} para ${formatarBR(ultimo.dataFim)}.`,
    });
  }

  // --- avanço contra alongamento ------------------------------------------
  if (resumo.variacaoPercentualPP !== null && desvio !== null) {
    const avanco = resumo.variacaoPercentualPP;
    if (desvio > 0 && avanco <= 0) {
      insights.push({
        codigo: 'avanco_vs_prazo',
        tom: 'atencao',
        texto: `No mesmo período o avanço físico não subiu (${avanco.toLocaleString('pt-BR')} p.p.) enquanto o prazo cresceu ${dias(desvio)}.`,
      });
    } else if (desvio > 0 && avanco > 0) {
      insights.push({
        codigo: 'avanco_vs_prazo',
        tom: 'neutro',
        texto: `A obra avançou ${avanco.toLocaleString('pt-BR')} p.p. no período, mas o prazo também cresceu ${dias(desvio)}.`,
      });
    } else if (avanco > 0) {
      insights.push({
        codigo: 'avanco_vs_prazo',
        tom: 'bom',
        texto: `A obra avançou ${avanco.toLocaleString('pt-BR')} p.p. sem alongar o prazo.`,
      });
    }
  }

  // --- ritmo de escorregamento --------------------------------------------
  // Só faz sentido com janela suficiente; abaixo disso o número oscila demais.
  if (desvio !== null && desvio > 0 && resumo.diasCobertos !== null && resumo.diasCobertos >= 7) {
    const porSemana = arredondar((desvio / resumo.diasCobertos) * 7, 1);
    if (porSemana >= 0.5) {
      insights.push({
        codigo: 'ritmo_de_escorregamento',
        tom: 'atencao',
        texto: `Nos ${dias(resumo.diasCobertos)} cobertos, o término cedeu em média ${porSemana.toLocaleString('pt-BR')} dia(s) por semana.`,
      });
    }
  }

  // --- caminho crítico -----------------------------------------------------
  const variacaoCriticas = ultimo.criticas - primeiro.criticas;
  if (variacaoCriticas !== 0) {
    insights.push({
      codigo: 'criticas_variaram',
      tom: variacaoCriticas > 0 ? 'atencao' : 'bom',
      texto:
        variacaoCriticas > 0
          ? `O caminho crítico ganhou ${variacaoCriticas} atividade(s): de ${primeiro.criticas} para ${ultimo.criticas}.`
          : `O caminho crítico perdeu ${Math.abs(variacaoCriticas)} atividade(s): de ${primeiro.criticas} para ${ultimo.criticas}.`,
    });
  }

  return insights;
}
