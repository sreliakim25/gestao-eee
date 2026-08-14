/**
 * app/analise/loading.tsx — placeholder de carregamento da Análise IA.
 *
 * A página lê a sessão antes de decidir se mostra o painel de análise; este
 * esqueleto (Server Component puro, sem dado nenhum) evita a tela congelada
 * durante essa checagem.
 */

import { Card, PageHeadingSkeleton, Skeleton } from '@/components/ui/primitives';

export default function CarregandoAnalise() {
  return (
    <>
      <PageHeadingSkeleton />

      <Skeleton className="mb-4 h-4 w-full max-w-xl" />

      <Card aria-hidden="true">
        <Skeleton className="h-9 w-40" />
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </Card>
    </>
  );
}
