/**
 * app/diario/loading.tsx — placeholder de carregamento do Diário de Obra.
 *
 * A página lê o projeto, o registro do dia e as fotos no Supabase Storage
 * antes de montar o formulário; este esqueleto (Server Component puro) evita
 * a tela congelada durante essas consultas.
 */

import { Card, PageHeadingSkeleton, Skeleton } from '@/components/ui/primitives';

export default function CarregandoDiario() {
  return (
    <>
      <PageHeadingSkeleton />

      <div aria-hidden="true" className="mb-4 flex items-center gap-2">
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-9" />
      </div>

      <div aria-hidden="true" className="space-y-5">
        <Card>
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="mt-3 h-24 w-full" />
        </Card>

        <Card>
          <Skeleton className="mb-3 h-5 w-40" />
          <div className="grid gap-3 sm:grid-cols-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </Card>
      </div>
    </>
  );
}
