/**
 * app/ugbs/[id]/loading.tsx — placeholder de carregamento da escolha de
 * dispositivo dentro de uma UGB.
 *
 * Server Component puro — sem dado nenhum.
 */

import { Card, PageHeadingSkeleton, Skeleton } from '@/components/ui/primitives';

export default function CarregandoDispositivosDaUgb() {
  return (
    <>
      <PageHeadingSkeleton />

      <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, indice) => (
          <Card key={indice}>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-3 h-3 w-24" />
          </Card>
        ))}
      </div>
    </>
  );
}
