/**
 * app/loading.tsx — placeholder de carregamento do Painel.
 *
 * O Painel lê sessão (cookies) e agrega o cronograma inteiro antes de
 * renderizar, então não há cache/prerender possível. Sem este arquivo, a
 * troca para "/" fica com a tela congelada até o Server Component terminar;
 * com ele, o Next mostra este esqueleto instantaneamente durante o streaming.
 * Server Component puro — sem 'use client', sem dado nenhum.
 */

import { Card, MetricCardSkeleton, PageHeadingSkeleton, Skeleton } from '@/components/ui/primitives';

export default function CarregandoPainel() {
  return (
    <>
      <PageHeadingSkeleton />

      <section aria-hidden="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
      </section>

      <section aria-hidden="true" className="mt-7">
        <Skeleton className="mb-3 h-6 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, indice) => (
            <Card key={indice}>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-3 h-2 w-full" />
              <Skeleton className="mt-3 h-3 w-40" />
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
