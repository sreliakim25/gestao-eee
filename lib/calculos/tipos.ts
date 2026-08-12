/**
 * lib/calculos/tipos.ts — contratos de entrada do motor de indicadores.
 *
 * As funções de cálculo recebem apenas o subconjunto de colunas de que
 * precisam (tipos estruturais). Isso permite que:
 *  - as linhas reais do Supabase (`Atividade`, `AvancoSemanal`) sejam aceitas
 *    diretamente, sem conversão;
 *  - os testes montem fixtures enxutas sem precisar preencher `criado_em` etc.
 *
 * Nenhum arquivo de `lib/calculos/` importa `lib/supabase/` — o motor é puro,
 * recebe dados já carregados e devolve números/objetos.
 */

import type { Atividade, AvancoSemanal, FaixaProgresso } from '@/types/database';

/** Colunas de `atividades` usadas pelos cálculos. */
export type AtividadeCalculo = Pick<
  Atividade,
  | 'id'
  | 'grupo_macro_id'
  | 'elemento_visual_id'
  | 'duracao_dias'
  | 'data_inicio_planejada'
  | 'data_fim_planejada'
  | 'percentual_concluido'
  | 'caminho_critico'
> &
  // Opcional para não quebrar fixtures antigas: quando ausente, a atividade é
  // tratada como folha (caso conservador — ela conta em vez de sumir).
  Partial<Pick<Atividade, 'eh_folha' | 'data_inicio_linha_base' | 'data_fim_linha_base'>>;

/** Colunas de `avancos_semanais` usadas pelos cálculos. */
export type AvancoSemanalCalculo = Pick<
  AvancoSemanal,
  | 'atividade_id'
  | 'semana_referencia'
  | 'percentual_planejado_acumulado'
  | 'percentual_realizado_acumulado'
>;

/** Base de ponderação do percentual de evolução física. */
export type BasePonderacao = 'duracao' | 'custo';

/**
 * Peso atribuído a uma atividade sem base de ponderação utilizável
 * (duração nula/zero/negativa, ou custo ausente no mapa).
 *
 * DECISÃO: 1 (equivale a "1 dia"), e não 0. Com peso 0 a atividade sumiria da
 * média e o percentual geral ficaria otimista — uma atividade sem duração
 * cadastrada no Smartsheet continuaria "não atrapalhando" o indicador. Com peso
 * 1 ela pesa pouco, mas existe.
 */
export const PESO_PADRAO_ATIVIDADE = 1;

/** Opções de ponderação do percentual de evolução física. */
export interface OpcoesPonderacao {
  /**
   * `'duracao'` (padrão) usa `duracao_dias`.
   * `'custo'` está preparado para o futuro: exige `custoPorAtividadeId`.
   */
  base?: BasePonderacao;
  /**
   * Mapa `atividade.id → custo` (R$ ou qualquer unidade monetária consistente).
   * Só é lido quando `base === 'custo'`. Atividade ausente do mapa recebe
   * `PESO_PADRAO_ATIVIDADE`.
   */
  custoPorAtividadeId?: Readonly<Record<string, number>>;
}

/** Filtros aceitos por todas as agregações (Curva S, Painel, Gestão Visual). */
export interface FiltrosAtividade {
  /** Restringe a estes grupos macro (frentes/disciplinas do WBS). */
  gruposMacroIds?: readonly string[];
  /** Restringe a estes elementos visuais. */
  elementosVisuaisIds?: readonly string[];
  /** Só atividades marcadas como caminho crítico no Smartsheet. */
  apenasCaminhoCritico?: boolean;
  /** Só atividades vinculadas a algum elemento visual. */
  apenasComElementoVisual?: boolean;
  /**
   * Inclui as linhas-mãe do WBS na agregação. Padrão: `false`.
   *
   * Uma linha-mãe não é trabalho, é o agrupamento do trabalho dos filhos —
   * somar as duas na mesma média é dupla contagem. Nos dados reais isso muda
   * o percentual calculado de 3,26% (só folhas) para 0,93% (folhas + mães).
   * Só ative para inspecionar a hierarquia crua.
   */
  incluirLinhasMae?: boolean;
}

/** Resultado de uma agregação de percentual (geral, por grupo ou por elemento). */
export interface AgregadoPercentual {
  /** Chave do agrupamento (id do grupo macro / do elemento visual). */
  chave: string;
  /** Percentual ponderado, 0–100, arredondado em 2 casas. */
  percentual: number;
  /** Soma dos pesos usados (dias de duração, ou custo). */
  pesoTotal: number;
  /** Quantidade de atividades consideradas. */
  totalAtividades: number;
  /** Faixa de progresso derivada do percentual (mesma regra do SVG). */
  faixa: FaixaProgresso;
}

export type { FaixaProgresso };

/**
 * Normaliza um percentual para a faixa 0–100.
 * Valores nulos, `NaN` ou fora da faixa são grampeados (o banco já tem check
 * constraint, mas dados vindos do import podem chegar sujos antes do upsert).
 */
export function limitarPercentual(valor: number | null | undefined): number {
  if (valor === null || valor === undefined) return 0;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  if (numero < 0) return 0;
  if (numero > 100) return 100;
  return numero;
}

/** Arredonda para `casas` decimais evitando lixo de ponto flutuante. */
export function arredondar(valor: number, casas = 2): number {
  if (!Number.isFinite(valor)) return 0;
  const fator = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * fator) / fator;
}

/** Aplica os filtros de frente/elemento/criticidade a uma lista de atividades. */
export function filtrarAtividades<T extends AtividadeCalculo>(
  atividades: readonly T[],
  filtros?: FiltrosAtividade,
): T[] {
  if (!Array.isArray(atividades)) return [];
  // Linhas-mãe ficam fora por padrão, com ou sem outros filtros. `eh_folha`
  // ausente = folha (fixtures antigas e bases importadas antes da coluna).
  const somenteFolhas = (lista: readonly T[]) =>
    filtros?.incluirLinhasMae ? [...lista] : lista.filter((a) => a.eh_folha !== false);

  if (!filtros) return somenteFolhas(atividades);

  const grupos = filtros.gruposMacroIds?.length ? new Set(filtros.gruposMacroIds) : null;
  const elementos = filtros.elementosVisuaisIds?.length
    ? new Set(filtros.elementosVisuaisIds)
    : null;

  return somenteFolhas(atividades).filter((atividade) => {
    if (grupos && !grupos.has(atividade.grupo_macro_id)) return false;
    if (elementos) {
      if (!atividade.elemento_visual_id) return false;
      if (!elementos.has(atividade.elemento_visual_id)) return false;
    }
    if (filtros.apenasCaminhoCritico && !atividade.caminho_critico) return false;
    if (filtros.apenasComElementoVisual && !atividade.elemento_visual_id) return false;
    return true;
  });
}
