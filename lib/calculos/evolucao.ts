/**
 * lib/calculos/evolucao.ts — percentual de evolução física.
 *
 * FÓRMULA OFICIAL (média ponderada por duração):
 *
 *      % evolução = Σ (percentual_concluido_i × peso_i) / Σ peso_i
 *
 * onde `peso_i` é, por padrão, `duracao_dias` da atividade. Uma atividade de
 * 30 dias vale 30x mais que uma de 1 dia — média simples faria "limpeza final"
 * pesar o mesmo que "escavação do poço úmido".
 *
 * TROCA FUTURA PARA CUSTO: passe `{ base: 'custo', custoPorAtividadeId }`.
 * Nenhuma outra linha de código precisa mudar — a fórmula é a mesma, muda só a
 * origem do peso. Enquanto o orçamento do terceirizado não estiver amarrado
 * atividade a atividade, a base continua sendo duração.
 *
 * Bordas tratadas: lista vazia, duração nula/zero/negativa, percentual fora de
 * 0–100 e soma de pesos zero (nunca divide por zero — devolve 0).
 */

import type { FaixaProgresso } from '@/types/database';
import { faixaProgresso } from './progresso';
import {
  arredondar,
  filtrarAtividades,
  limitarPercentual,
  PESO_PADRAO_ATIVIDADE,
  type AgregadoPercentual,
  type AtividadeCalculo,
  type FiltrosAtividade,
  type OpcoesPonderacao,
} from './tipos';

/**
 * Peso de uma atividade na média ponderada.
 * Duração (ou custo) inválida cai em `PESO_PADRAO_ATIVIDADE` — ver justificativa
 * da constante em `tipos.ts`.
 */
export function pesoAtividade(
  atividade: AtividadeCalculo,
  opcoes: OpcoesPonderacao = {},
): number {
  const bruto =
    opcoes.base === 'custo'
      ? opcoes.custoPorAtividadeId?.[atividade.id]
      : atividade.duracao_dias;

  const numero = Number(bruto);
  if (!Number.isFinite(numero) || numero <= 0) return PESO_PADRAO_ATIVIDADE;
  return numero;
}

/** Resultado detalhado de uma média ponderada (útil para compor agregações). */
export interface ResultadoPonderado {
  percentual: number;
  pesoTotal: number;
  totalAtividades: number;
}

/**
 * Núcleo do cálculo: média ponderada crua, sem filtros e sem arredondamento
 * intermediário. Todas as demais funções deste arquivo passam por aqui.
 */
export function mediaPonderada(
  atividades: readonly AtividadeCalculo[],
  opcoes: OpcoesPonderacao = {},
): ResultadoPonderado {
  if (!Array.isArray(atividades) || atividades.length === 0) {
    return { percentual: 0, pesoTotal: 0, totalAtividades: 0 };
  }

  let somaPonderada = 0;
  let pesoTotal = 0;

  for (const atividade of atividades) {
    const peso = pesoAtividade(atividade, opcoes);
    somaPonderada += limitarPercentual(atividade.percentual_concluido) * peso;
    pesoTotal += peso;
  }

  // Divisão por zero só aconteceria com peso negativo somando zero; blindado.
  const percentual = pesoTotal > 0 ? somaPonderada / pesoTotal : 0;

  return {
    percentual: arredondar(percentual),
    pesoTotal: arredondar(pesoTotal),
    totalAtividades: atividades.length,
  };
}

/**
 * Percentual de evolução física geral do projeto (indicador de topo do Painel).
 * Aceita filtros para reaproveitar o mesmo número em recortes (ex.: só críticas).
 */
export function percentualEvolucaoGeral(
  atividades: readonly AtividadeCalculo[],
  opcoes: OpcoesPonderacao & { filtros?: FiltrosAtividade } = {},
): number {
  const alvo = filtrarAtividades(atividades, opcoes.filtros);
  return mediaPonderada(alvo, opcoes).percentual;
}

/** Monta o agregado completo (percentual + pesos + faixa) de uma lista. */
function montarAgregado(
  chave: string,
  atividades: readonly AtividadeCalculo[],
  opcoes: OpcoesPonderacao,
): AgregadoPercentual {
  const resultado = mediaPonderada(atividades, opcoes);
  return {
    chave,
    percentual: resultado.percentual,
    pesoTotal: resultado.pesoTotal,
    totalAtividades: resultado.totalAtividades,
    faixa: faixaProgresso(resultado.percentual),
  };
}

/**
 * Percentual por grupo macro (cards por frente do Painel: Terraplenagem,
 * Civil, Elétrica, ...). Devolve um mapa `grupo_macro_id → agregado`.
 */
export function percentualPorGrupoMacro(
  atividades: readonly AtividadeCalculo[],
  opcoes: OpcoesPonderacao & { filtros?: FiltrosAtividade } = {},
): Record<string, AgregadoPercentual> {
  const alvo = filtrarAtividades(atividades, opcoes.filtros);
  const porGrupo = new Map<string, AtividadeCalculo[]>();

  for (const atividade of alvo) {
    const lista = porGrupo.get(atividade.grupo_macro_id);
    if (lista) lista.push(atividade);
    else porGrupo.set(atividade.grupo_macro_id, [atividade]);
  }

  const saida: Record<string, AgregadoPercentual> = {};
  for (const [grupoId, lista] of porGrupo) {
    saida[grupoId] = montarAgregado(grupoId, lista, opcoes);
  }
  return saida;
}

/**
 * Percentual de um elemento visual específico (usado pela Gestão Visual para
 * colorir o SVG). Elemento sem atividade vinculada devolve 0 / `nao_iniciado`.
 *
 * NOTA: a view `elementos_visuais_progresso` do banco usa média SIMPLES como
 * definição "de leitura". Aqui a definição oficial do app é a ponderada, igual
 * à do Painel, para que o SVG e o indicador de topo não contem histórias
 * diferentes. A coluna `percentual_ponderado_duracao` da view reproduz isto.
 */
export function percentualPorElementoVisual(
  atividades: readonly AtividadeCalculo[],
  elementoVisualId: string,
  opcoes: OpcoesPonderacao = {},
): number {
  const alvo = (Array.isArray(atividades) ? atividades : []).filter(
    (atividade) => atividade.elemento_visual_id === elementoVisualId,
  );
  return mediaPonderada(alvo, opcoes).percentual;
}

/**
 * Mapa `elemento_visual_id → agregado` em uma única passada — o SVG precisa de
 * todos os elementos de uma vez, e chamar `percentualPorElementoVisual` em loop
 * seria O(n × elementos).
 */
export function percentuaisPorElementoVisual(
  atividades: readonly AtividadeCalculo[],
  opcoes: OpcoesPonderacao & { filtros?: FiltrosAtividade } = {},
): Record<string, AgregadoPercentual> {
  const alvo = filtrarAtividades(atividades, opcoes.filtros);
  const porElemento = new Map<string, AtividadeCalculo[]>();

  for (const atividade of alvo) {
    const elementoId = atividade.elemento_visual_id;
    if (!elementoId) continue; // atividade sem elemento não entra na Gestão Visual
    const lista = porElemento.get(elementoId);
    if (lista) lista.push(atividade);
    else porElemento.set(elementoId, [atividade]);
  }

  const saida: Record<string, AgregadoPercentual> = {};
  for (const [elementoId, lista] of porElemento) {
    saida[elementoId] = montarAgregado(elementoId, lista, opcoes);
  }
  return saida;
}

/** Faixa de progresso de um elemento visual — atalho para o SVG. */
export function faixaProgressoElemento(
  atividades: readonly AtividadeCalculo[],
  elementoVisualId: string,
  opcoes: OpcoesPonderacao = {},
): FaixaProgresso {
  return faixaProgresso(
    percentualPorElementoVisual(atividades, elementoVisualId, opcoes),
  );
}

/** Contagens da carteira de atividades, para os cards secundários do Painel. */
export interface ResumoAtividades {
  total: number;
  criticas: number;
  concluidas: number;
  emAndamento: number;
  naoIniciadas: number;
  /** Atividades sem data de início ou fim — ficam fora da linha de base. */
  semDatasPlanejadas: number;
}

/** Resume uma lista de atividades (aplica os mesmos filtros das demais funções). */
export function resumirAtividades(
  atividades: readonly AtividadeCalculo[],
  filtros?: FiltrosAtividade,
): ResumoAtividades {
  const alvo = filtrarAtividades(atividades, filtros);
  const resumo: ResumoAtividades = {
    total: alvo.length,
    criticas: 0,
    concluidas: 0,
    emAndamento: 0,
    naoIniciadas: 0,
    semDatasPlanejadas: 0,
  };

  for (const atividade of alvo) {
    if (atividade.caminho_critico) resumo.criticas += 1;
    if (!atividade.data_inicio_planejada || !atividade.data_fim_planejada) {
      resumo.semDatasPlanejadas += 1;
    }
    switch (faixaProgresso(atividade.percentual_concluido)) {
      case 'concluido':
        resumo.concluidas += 1;
        break;
      case 'em_andamento':
        resumo.emAndamento += 1;
        break;
      default:
        resumo.naoIniciadas += 1;
    }
  }

  return resumo;
}
