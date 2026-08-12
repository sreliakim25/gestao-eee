/**
 * lib/calculos/periodos.ts — janela de execução de cada frente e desvio de plano.
 *
 * O Smartsheet não guarda uma data para o grupo macro em si que seja útil aqui:
 * a linha-mãe tem duração própria, mas o que interessa ao gestor é quando a
 * frente começa e quando termina de fato — ou seja, o menor início e o maior
 * término entre as atividades dela.
 *
 * A comparação com a linha de base é o que revela replanejamento. As datas
 * planejadas são sobrescritas a cada sync; a baseline é congelada por trigger
 * no banco (ver migration `20260811100000_linha_base_datas.sql`). Sem ela, uma
 * obra que escorrega duas semanas não deixa rastro nenhum na tela.
 */

import { diferencaEmDias, paraDataUTC } from './datas';
import { filtrarAtividades } from './tipos';
import type { AtividadeCalculo, FiltrosAtividade } from './tipos';

/** Desvio considerado ruído de arredondamento/ajuste fino de cronograma. */
export const LIMIAR_DESVIO_DIAS = 1;

export interface PeriodoFrente {
  /** Menor `data_inicio_planejada` da frente (ISO), ou null se nenhuma tem data. */
  inicio: string | null;
  /** Maior `data_fim_planejada` da frente (ISO), ou null. */
  fim: string | null;
  /** Mesmas datas na linha de base congelada. */
  inicioLinhaBase: string | null;
  fimLinhaBase: string | null;
  /**
   * Dias de desvio no término: positivo = terminando DEPOIS do previsto.
   * `null` quando falta uma das pontas para comparar.
   */
  desvioFimDias: number | null;
  /** Idem para o início. */
  desvioInicioDias: number | null;
  /** Quantas atividades da frente têm alguma data planejada. */
  atividadesComData: number;
}

/** Menor valor não-nulo de uma lista de datas ISO. */
function menorData(datas: readonly (string | null)[]): string | null {
  let menor: string | null = null;
  for (const data of datas) {
    if (!data) continue;
    if (menor === null || data < menor) menor = data;
  }
  return menor;
}

/** Maior valor não-nulo de uma lista de datas ISO. */
function maiorData(datas: readonly (string | null)[]): string | null {
  let maior: string | null = null;
  for (const data of datas) {
    if (!data) continue;
    if (maior === null || data > maior) maior = data;
  }
  return maior;
}

/** Diferença em dias entre duas datas ISO, ou null se faltar alguma. */
function desvioEmDias(vigente: string | null, linhaBase: string | null): number | null {
  if (!vigente || !linhaBase) return null;
  const a = paraDataUTC(linhaBase);
  const b = paraDataUTC(vigente);
  if (!a || !b) return null;
  return diferencaEmDias(a, b);
}

/**
 * Período de uma lista de atividades (já filtrada para uma frente).
 *
 * Comparação de datas ISO `yyyy-mm-dd` é feita como string de propósito: nesse
 * formato a ordem lexicográfica é a ordem cronológica, e assim não passamos por
 * `Date` — que introduziria fuso horário num dado que é dia de calendário.
 */
export function periodoDeAtividades(atividades: readonly AtividadeCalculo[]): PeriodoFrente {
  const inicio = menorData(atividades.map((a) => a.data_inicio_planejada));
  const fim = maiorData(atividades.map((a) => a.data_fim_planejada));
  const inicioLinhaBase = menorData(atividades.map((a) => a.data_inicio_linha_base ?? null));
  const fimLinhaBase = maiorData(atividades.map((a) => a.data_fim_linha_base ?? null));

  return {
    inicio,
    fim,
    inicioLinhaBase,
    fimLinhaBase,
    desvioInicioDias: desvioEmDias(inicio, inicioLinhaBase),
    desvioFimDias: desvioEmDias(fim, fimLinhaBase),
    atividadesComData: atividades.filter(
      (a) => a.data_inicio_planejada || a.data_fim_planejada,
    ).length,
  };
}

/** Período de cada grupo macro, indexado pelo id do grupo. */
export function periodosPorGrupoMacro(
  atividades: readonly AtividadeCalculo[],
  filtros?: FiltrosAtividade,
): Record<string, PeriodoFrente> {
  const alvo = filtrarAtividades(atividades, filtros);

  const porGrupo = new Map<string, AtividadeCalculo[]>();
  for (const atividade of alvo) {
    const chave = atividade.grupo_macro_id;
    if (!chave) continue;
    const lista = porGrupo.get(chave);
    if (lista) lista.push(atividade);
    else porGrupo.set(chave, [atividade]);
  }

  const resultado: Record<string, PeriodoFrente> = {};
  for (const [grupoId, lista] of porGrupo) {
    resultado[grupoId] = periodoDeAtividades(lista);
  }
  return resultado;
}

/** O desvio merece destaque na UI, ou é ajuste fino sem significado? */
export function desvioRelevante(dias: number | null): boolean {
  return dias !== null && Math.abs(dias) >= LIMIAR_DESVIO_DIAS;
}
