/**
 * components/ui/primitives.tsx — peças visuais compartilhadas por todos os
 * módulos (inclusive os dos agentes de Gestão Visual e Concretagem/Orçamento).
 *
 * Sem 'use client': são componentes de apresentação puros, renderizáveis no
 * servidor. Usam apenas os tokens do tema definidos em `app/globals.css`.
 */

import type { ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/* Cabeçalho de página                                                        */
/* -------------------------------------------------------------------------- */

export function PageHeading({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-borda pb-3">
      <div className="min-w-0">
        <h1 className="font-titulo text-2xl text-vinho sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-tinta-suave">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Cartão                                                                     */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'article' | 'div';
}) {
  return (
    <Tag
      className={`rounded-lg border border-borda bg-superficie p-4 shadow-[0_1px_0_rgba(43,35,32,0.06)] ${className}`}
    >
      {children}
    </Tag>
  );
}

/** Cartão de indicador: rótulo pequeno + número grande + apoio. */
export function MetricCard({
  label,
  value,
  hint,
  accent = 'ouro',
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: 'ouro' | 'vinho' | 'adiantado' | 'no-prazo' | 'atrasado' | 'neutro';
  children?: ReactNode;
}) {
  const barras: Record<string, string> = {
    ouro: 'bg-ouro',
    vinho: 'bg-vinho',
    adiantado: 'bg-adiantado',
    'no-prazo': 'bg-no-prazo',
    atrasado: 'bg-atrasado',
    neutro: 'bg-neutro',
  };

  return (
    <Card className="relative overflow-hidden">
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1.5 ${barras[accent] ?? barras.ouro}`}
      />
      <div className="pl-2">
        <p className="text-sm tracking-wide text-tinta-suave uppercase">{label}</p>
        <p className="numeros-tabulares font-titulo mt-1 text-3xl text-vinho">{value}</p>
        {hint ? <p className="mt-1 text-sm text-tinta-suave">{hint}</p> : null}
        {children}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Barra de progresso                                                         */
/* -------------------------------------------------------------------------- */

export function ProgressBar({
  percentual,
  label,
}: {
  /** Já calculado por `@/lib/calculos` — este componente não calcula nada. */
  percentual: number;
  label?: string;
}) {
  const largura = Math.max(0, Math.min(100, Number.isFinite(percentual) ? percentual : 0));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(largura)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Percentual concluído'}
      className="h-2 w-full overflow-hidden rounded-full bg-creme"
    >
      <div className="h-full rounded-full bg-ouro" style={{ width: `${largura}%` }} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Estados vazios e avisos                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Estado vazio honesto: diz o que falta, sem inventar número nenhum.
 * Usado quando o banco ainda não tem dados ou a leitura falhou.
 */
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="text-center">
      <p className="font-titulo text-lg text-vinho">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-prose text-tinta-suave">{description}</p>
      ) : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </Card>
  );
}

export function Alert({
  tone = 'aviso',
  children,
}: {
  tone?: 'aviso' | 'erro' | 'sucesso';
  children: ReactNode;
}) {
  const estilos = {
    aviso: 'border-ouro bg-ouro/10 text-tinta',
    erro: 'border-atrasado bg-atrasado/10 text-atrasado',
    sucesso: 'border-adiantado bg-adiantado/10 text-adiantado',
  } as const;

  return (
    <p
      role={tone === 'erro' ? 'alert' : 'status'}
      className={`rounded-md border-l-4 px-3 py-2 text-sm ${estilos[tone]}`}
    >
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Esqueleto de carregamento                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Bloco cinza-creme pulsante usado nos `loading.tsx` de cada rota.
 *
 * Como toda página deste app lê a sessão via `cookies()` (nada de
 * cache/prerender possível), o Next só troca a tela quando o Server Component
 * termina — sem `loading.tsx`, a navegação fica congelada. Este componente é
 * só um espaço reservado visual: nunca representa um dado real, então não
 * precisa (e não deve) vir de `lib/calculos/`.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-creme ${className}`} />;
}

/** Cabeçalho de página em modo esqueleto — espelha o layout de `PageHeading`. */
export function PageHeadingSkeleton() {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-borda pb-3">
      <div className="min-w-0">
        <Skeleton className="h-7 w-56 sm:h-8" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-6 w-24" />
    </div>
  );
}

/** Cartão de indicador em modo esqueleto — espelha o layout de `MetricCard`. */
export function MetricCardSkeleton() {
  return (
    <Card className="relative overflow-hidden">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-16" />
      <Skeleton className="mt-2 h-3 w-32" />
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Etiqueta                                                                   */
/* -------------------------------------------------------------------------- */

export function Badge({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}
