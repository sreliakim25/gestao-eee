/**
 * app/usuarios/loading.tsx — placeholder de carregamento da tela de Acessos.
 *
 * A página consulta a tabela `perfis` (via RLS do gestor) antes de montar a
 * lista; este esqueleto (Server Component puro) evita a tela congelada
 * durante essa consulta.
 */

import { Card, PageHeadingSkeleton, Skeleton } from '@/components/ui/primitives';

export default function CarregandoUsuarios() {
  return (
    <>
      <PageHeadingSkeleton />

      <Card className="mb-4" aria-hidden="true">
        <Skeleton className="h-4 w-full max-w-xl" />
      </Card>

      <Card aria-hidden="true">
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, indice) => (
            <Skeleton key={indice} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    </>
  );
}
