/**
 * app/cronograma/loading.tsx — placeholder de carregamento do Cronograma.
 *
 * A página carrega de uma vez as ~300 atividades importadas do Smartsheet
 * mais o histórico diário; até isso terminar, o Next exibe este esqueleto
 * (Server Component puro, sem dado nenhum) em vez de travar a navegação.
 */

import { Card, PageHeadingSkeleton, Skeleton } from '@/components/ui/primitives';

export default function CarregandoCronograma() {
  return (
    <>
      <PageHeadingSkeleton />

      <div aria-hidden="true" className="mb-4 flex flex-wrap gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-28" />
      </div>

      <Card aria-hidden="true">
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, indice) => (
            <Skeleton key={indice} className="h-6 w-full" />
          ))}
        </div>
      </Card>

      <section aria-hidden="true" className="mt-7">
        <Skeleton className="mb-3 h-6 w-40" />
        <Card>
          <Skeleton className="h-40 w-full" />
        </Card>
      </section>
    </>
  );
}
