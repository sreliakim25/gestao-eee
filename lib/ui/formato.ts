/**
 * lib/ui/formato.ts — formatação e rótulos da interface.
 *
 * Só apresentação: nenhum cálculo de indicador mora aqui (esses vivem em
 * `@/lib/calculos`). Datas do Postgres chegam como 'YYYY-MM-DD' e são
 * formatadas sem passar pelo `Date` local, para a obra não "andar um dia"
 * entre o navegador em America/Recife e a Vercel em UTC.
 */

import type { StatusPrazo } from '@/lib/calculos';

/** Fuso da obra — usado só para descobrir que dia é "hoje" para o usuário. */
export const FUSO_OBRA = 'America/Recife';

/** Data de hoje no fuso da obra, em 'YYYY-MM-DD'. */
export function dataDeHojeISO(agora: Date = new Date()): string {
  // 'en-CA' produz exatamente YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_OBRA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

/** 'YYYY-MM-DD' → 'DD/MM/AAAA'. Valor inválido vira travessão. */
export function formatarDataBR(valor: string | null | undefined): string {
  if (!valor) return '—';
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (!partes) return '—';
  return `${partes[3]}/${partes[2]}/${partes[1]}`;
}

/** 'YYYY-MM-DD' → 'DD/MM' (eixos e barras do Gantt, onde o ano é redundante). */
export function formatarDataCurta(valor: string | null | undefined): string {
  const completa = formatarDataBR(valor);
  return completa === '—' ? completa : completa.slice(0, 5);
}

/** Percentual já calculado pelo motor → texto ('6,2%'). */
export function formatarPercentual(valor: number | null | undefined, casas = 1): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return `${valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}%`;
}

/** Número inteiro com separador de milhar. */
export function formatarInteiro(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return Math.round(valor).toLocaleString('pt-BR');
}

/** Rótulo do status de prazo para a UI. */
export const ROTULOS_STATUS_PRAZO: Record<StatusPrazo, string> = {
  adiantado: 'Adiantado',
  no_prazo: 'No prazo',
  atrasado: 'Atrasado',
};

/** Classes Tailwind (tokens do tema) por status de prazo. */
export const CLASSES_STATUS_PRAZO: Record<StatusPrazo, string> = {
  adiantado: 'bg-adiantado text-creme',
  no_prazo: 'bg-no-prazo text-creme',
  atrasado: 'bg-atrasado text-creme',
};

/** Desvio em p.p. com sinal explícito ('+3,1 p.p.' / '−12,4 p.p.'). */
export function formatarDesvioPP(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  const absoluto = Math.abs(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const sinal = valor > 0 ? '+' : valor < 0 ? '−' : '';
  return `${sinal}${absoluto} p.p.`;
}

/** Plural simples ('1 semana' / '25 semanas'). */
export function pluralizar(quantidade: number, singular: string, plural: string): string {
  return `${formatarInteiro(quantidade)} ${quantidade === 1 ? singular : plural}`;
}
