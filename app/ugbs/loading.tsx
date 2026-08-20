/**
 * app/ugbs/loading.tsx — placeholder de carregamento da escolha de UGB.
 *
 * A página lê sessão + UGBs + contagem de dispositivos antes de renderizar;
 * este esqueleto evita a tela congelada durante essas consultas. Server
 * Component puro — sem dado nenhum.
 */

import { Card, PageHeadingSkeleton, Skeleton } from '@/components/ui/primitives';

export default function CarregandoUgbs() {
  return (
    <>
      <PageHeadingSkeleton />

      <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, indice) => (
          <Card key={indice}>
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-10" />
            </div>
            <Skeleton className="mt-3 h-3 w-40" />
          </Card>
        ))}
      </div>
    </>
  );
}
