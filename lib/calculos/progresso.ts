/**
 * lib/calculos/progresso.ts — faixa de progresso.
 *
 * FONTE ÚNICA da regra que decide se algo está `nao_iniciado`, `em_andamento`
 * ou `concluido`. O SVG da Gestão Visual, os cards do Painel e a view
 * `elementos_visuais_progresso` do banco precisam concordar; se cada um
 * aplicasse o seu próprio `if`, um elemento apareceria cinza no SVG e amarelo
 * no card sem gerar nenhum erro de compilação.
 */

import type { FaixaProgresso } from '@/types/database';
import { limitarPercentual } from './tipos';

/**
 * Limiar de início: percentual **estritamente maior** que este valor já conta
 * como "em andamento". Espelha o `<= 0 then 'nao_iniciado'` da view SQL.
 */
export const LIMIAR_INICIO_PP = 0;

/**
 * Limiar de conclusão: percentual **maior ou igual** a este valor é
 * "concluido". Espelha o `>= 100 then 'concluido'` da view SQL.
 */
export const LIMIAR_CONCLUSAO_PP = 100;

/** Classifica um percentual (0–100) na faixa de progresso do app. */
export function faixaProgresso(percentual: number | null | undefined): FaixaProgresso {
  const valor = limitarPercentual(percentual);
  if (valor <= LIMIAR_INICIO_PP) return 'nao_iniciado';
  if (valor >= LIMIAR_CONCLUSAO_PP) return 'concluido';
  return 'em_andamento';
}

/** Rótulos em português para exibição na UI (evita string solta em componente). */
export const ROTULOS_FAIXA_PROGRESSO: Readonly<Record<FaixaProgresso, string>> = {
  nao_iniciado: 'Não iniciado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
};

/** Rótulo legível de uma faixa. */
export function rotuloFaixaProgresso(faixa: FaixaProgresso): string {
  return ROTULOS_FAIXA_PROGRESSO[faixa];
}
