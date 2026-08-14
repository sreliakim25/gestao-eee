/**
 * app/curva-s/loading.tsx — placeholder de carregamento da Curva S.
 *
 * O gráfico planejado x realizado depende do cronograma inteiro mais os
 * avanços semanais; este esqueleto (Server Component puro) evita a tela
 * congelada enquanto essas consultas rodam no servidor.
 */

import { Card, PageHeadingSkeleton, Skeleton } from '@/components/ui/primitives';

export default function CarregandoCurvaS() {
  return (
    <>
      <PageHeadingSkeleton />

      <div aria-hidden="true" className="mb-4 flex flex-wrap gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>

      <Card aria-hidden="true">
        <Skeleton className="h-72 w-full sm:h-96" />
      </Card>
    </>
  );
}
