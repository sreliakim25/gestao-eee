/**
 * Formatação compartilhada pelas telas de Concretagem e Orçamento.
 *
 * TODO(ui-modulos): trocar as cores em valor arbitrário do Tailwind pelas CSS
 * custom properties da identidade visual quando o shell do app definir
 * `--cor-creme` (#F0EAD8), `--cor-vermelho` (#8B1A1A) e `--cor-ouro` (#E8A020).
 */

/** Paleta da identidade visual VMC/RochaDev. */
export const CORES = {
  creme: '#F0EAD8',
  vermelho: '#8B1A1A',
  ouro: '#E8A020',
  tinta: '#2B2118',
} as const;

/** R$ 736.324,27 */
export function formatarReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** 23,5 m³ */
export function formatarM3(valor: number): string {
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} m³`;
}

/** 42,7% */
export function formatarPercentual(valor: number): string {
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

/** 05/08/2026 — a data vem como `date` do Postgres (YYYY-MM-DD), sem fuso. */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  if (!ano || !mes || !dia) return '—';
  return `${dia}/${mes}/${ano}`;
}
