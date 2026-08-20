/**
 * Grade de cartões de UGB — passo 1 da navegação UGB → dispositivo → módulos.
 *
 * Separado da página (Server Component que lê o Supabase via `lib/dados/ugbs`,
 * que importa `server-only` e por isso não pode ser carregado em teste) para
 * que a apresentação — inclusive a contagem de dispositivos por UGB — seja
 * testável isoladamente com fixtures, no mesmo padrão de
 * `components/gestao-visual` (adaptador puro + componente exportados juntos).
 */

import Link from 'next/link';
import type { Projeto, Ugb } from '@/types/database';
import { Badge, Card } from '@/components/ui/primitives';
import { pluralizar } from '@/lib/ui/formato';

export interface UgbComContagem {
  ugb: Ugb;
  /** Quantos `projetos.ugb_id` apontam para esta UGB. */
  totalDispositivos: number;
}

/**
 * Agrupa a contagem de dispositivos por UGB em memória — recebe o resultado
 * de UMA consulta em `projetos` (id, ugb_id); nada de consulta por UGB.
 */
export function contarDispositivosPorUgb(
  ugbs: Ugb[],
  projetos: Pick<Projeto, 'id' | 'ugb_id'>[],
): UgbComContagem[] {
  const contagemPorUgb = new Map<string, number>();
  for (const projeto of projetos) {
    if (!projeto.ugb_id) continue;
    contagemPorUgb.set(projeto.ugb_id, (contagemPorUgb.get(projeto.ugb_id) ?? 0) + 1);
  }

  return ugbs.map((ugb) => ({
    ugb,
    totalDispositivos: contagemPorUgb.get(ugb.id) ?? 0,
  }));
}

export function UgbGrid({ ugbs }: { ugbs: UgbComContagem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="grade-ugbs">
      {ugbs.map(({ ugb, totalDispositivos }) => (
        <Link key={ugb.id} href={`/ugbs/${ugb.id}`} className="block">
          <Card
            as="article"
            className="flex h-full flex-col gap-2 transition-colors hover:border-ouro"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-titulo text-lg leading-tight text-vinho">{ugb.nome}</h2>
              <Badge className="bg-creme text-vinho">{ugb.sigla}</Badge>
            </div>
            <p className="mt-auto text-sm text-tinta-suave">
              {totalDispositivos > 0
                ? pluralizar(totalDispositivos, 'dispositivo', 'dispositivos')
                : 'Nenhum dispositivo cadastrado ainda'}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
