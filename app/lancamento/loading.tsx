/**
 * app/lancamento/loading.tsx — placeholder de carregamento do Lançamento de
 * produção.
 *
 * A página carrega o cronograma e os últimos avanços antes de montar o
 * formulário; este esqueleto (Server Component puro) evita a tela congelada
 * enquanto isso acontece no servidor.
 */

import { Card, PageHeadingSkeleton, Skeleton } from '@/components/ui/primitives';

export default function CarregandoLancamento() {
  return (
    <>
      <PageHeadingSkeleton />

      <Card aria-hidden="true">
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="mt-4 h-9 w-32" />
      </Card>

      <section aria-hidden="true" className="mt-7">
        <Skeleton className="mb-3 h-6 w-40" />
        <Card>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, indice) => (
              <Skeleton key={indice} className="h-6 w-full" />
            ))}
          </div>
        </Card>
      </section>
    </>
  );
}
