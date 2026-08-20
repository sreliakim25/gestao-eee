/**
 * Grade de cartões de dispositivo dentro de uma UGB — passo 2 da navegação.
 *
 * Nenhum dispositivo é inventado: se a UGB não tiver nenhum `projetos.ugb_id`
 * apontando para ela, mostra o `EmptyState` honesto (regra 2 do plano
 * multi-dispositivo), nunca uma lista vazia silenciosa.
 */

import Link from 'next/link';
import type { Projeto } from '@/types/database';
import { Card, EmptyState } from '@/components/ui/primitives';

export function DispositivoGrid({ projetos }: { projetos: Projeto[] }) {
  if (projetos.length === 0) {
    return (
      <EmptyState
        title="Nenhum dispositivo cadastrado ainda nesta UGB"
        description="Assim que um dispositivo real for cadastrado para esta UGB, ele aparece aqui."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="grade-dispositivos">
      {projetos.map((projeto) => (
        // Hoje só existe um dispositivo real (E.E.E. Novo Mundo) e ele
        // continua nas rotas de módulo atuais — o link aponta para o Painel
        // de hoje até a Fase 3 escopar as rotas por dispositivo selecionado.
        <Link key={projeto.id} href="/" className="block">
          <Card
            as="article"
            className="flex h-full flex-col gap-2 transition-colors hover:border-ouro"
          >
            <h2 className="font-titulo text-lg leading-tight text-vinho">{projeto.nome}</h2>
            {projeto.cliente ? (
              <p className="text-sm text-tinta-suave">{projeto.cliente}</p>
            ) : null}
          </Card>
        </Link>
      ))}
    </div>
  );
}
