/**
 * Trilha visual do status do pedido: planejado → pedido → confirmado → concretado.
 * A ordem é a da máquina de estados em `lib/concretagem/status.ts` — a UI apenas
 * desenha, nunca decide transição.
 */

import { nivelStatus, ORDEM_STATUS, ROTULOS_STATUS } from '@/lib/concretagem/status';
import type { StatusPedidoConcretagem } from '@/types/database';

export function TrilhaStatus({ status }: { status: StatusPedidoConcretagem }) {
  const atual = nivelStatus(status);

  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Status do pedido">
      {ORDEM_STATUS.map((etapa, indice) => {
        const alcancado = indice <= atual;
        return (
          <li key={etapa} className="flex items-center gap-1">
            <span
              aria-current={indice === atual ? 'step' : undefined}
              className={[
                'rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
                alcancado
                  ? 'bg-[#8B1A1A] text-[#F0EAD8]'
                  : 'border border-[#8B1A1A]/25 bg-transparent text-[#8B1A1A]/50',
              ].join(' ')}
            >
              {ROTULOS_STATUS[etapa]}
            </span>
            {indice < ORDEM_STATUS.length - 1 ? (
              <span aria-hidden className={alcancado && indice < atual ? 'text-[#E8A020]' : 'text-[#8B1A1A]/25'}>
                →
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
