/**
 * app/conta/loading.tsx — placeholder de carregamento de "Minha conta".
 *
 * Barato o suficiente para valer a pena: evita um flash de tela vazia entre
 * a navegação e a leitura da sessão. Server Component puro, sem dado nenhum.
 */

import { Card, PageHeadingSkeleton, Skeleton } from '@/components/ui/primitives';

export default function CarregandoConta() {
  return (
    <>
      <PageHeadingSkeleton />

      <Card className="mb-4" aria-hidden="true">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </Card>

      <Card aria-hidden="true">
        <Skeleton className="mb-3 h-5 w-32" />
        <Skeleton className="h-10 w-full max-w-sm" />
      </Card>
    </>
  );
}
