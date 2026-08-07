/**
 * Cartão de uma frente (grupo macro do WBS) no Painel.
 *
 * Recebe o agregado JÁ CALCULADO por `montarIndicadoresPainel` — este
 * componente não faz conta nenhuma, só apresenta.
 */

import Link from 'next/link';
import type { AgregadoPercentual } from '@/lib/calculos';
import { ROTULOS_FAIXA_PROGRESSO } from '@/lib/calculos';
import { Card, ProgressBar } from '@/components/ui/primitives';
import { formatarInteiro, formatarPercentual } from '@/lib/ui/formato';

interface FrontCardProps {
  nome: string;
  grupoMacroId: string;
  agregado: AgregadoPercentual | undefined;
}

export function FrontCard({ nome, grupoMacroId, agregado }: FrontCardProps) {
  const percentual = agregado?.percentual ?? 0;
  const total = agregado?.totalAtividades ?? 0;

  return (
    <Card as="article" className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-titulo text-lg leading-tight text-vinho">{nome}</h3>
        <span className="numeros-tabulares text-lg font-semibold text-tinta">
          {formatarPercentual(percentual)}
        </span>
      </div>

      <ProgressBar percentual={percentual} label={`Percentual concluído — ${nome}`} />

      <p className="text-sm text-tinta-suave">
        {total > 0
          ? `${formatarInteiro(total)} atividade${total === 1 ? '' : 's'} · ${
              agregado ? ROTULOS_FAIXA_PROGRESSO[agregado.faixa] : '—'
            }`
          : 'Sem atividades importadas nesta frente'}
      </p>

      <Link
        href={`/cronograma?grupo=${encodeURIComponent(grupoMacroId)}`}
        className="mt-auto text-sm font-semibold text-ouro-escuro underline underline-offset-2 hover:text-vinho"
      >
        Ver atividades da frente
      </Link>
    </Card>
  );
}
