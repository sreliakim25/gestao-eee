/**
 * Cartão de uma frente (grupo macro do WBS) no Painel.
 *
 * Recebe o agregado JÁ CALCULADO por `montarIndicadoresPainel` — este
 * componente não faz conta nenhuma, só apresenta.
 */

import Link from 'next/link';
import type { AgregadoPercentual, PeriodoFrente } from '@/lib/calculos';
import { ROTULOS_FAIXA_PROGRESSO, desvioRelevante } from '@/lib/calculos';
import { Card, ProgressBar } from '@/components/ui/primitives';
import { formatarDataCurta, formatarInteiro, formatarPercentual } from '@/lib/ui/formato';

interface FrontCardProps {
  nome: string;
  grupoMacroId: string;
  agregado: AgregadoPercentual | undefined;
  periodo: PeriodoFrente | undefined;
}

/** "12 dias depois" / "3 dias antes" — texto do desvio, sem jargão. */
function textoDesvio(dias: number): string {
  const absoluto = Math.abs(dias);
  const unidade = absoluto === 1 ? 'dia' : 'dias';
  return `${absoluto} ${unidade} ${dias > 0 ? 'depois' : 'antes'}`;
}

export function FrontCard({ nome, grupoMacroId, agregado, periodo }: FrontCardProps) {
  const percentual = agregado?.percentual ?? 0;
  const total = agregado?.totalAtividades ?? 0;

  const fimDesviado = desvioRelevante(periodo?.desvioFimDias ?? null);
  const inicioDesviado = desvioRelevante(periodo?.desvioInicioDias ?? null);

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

      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <Link
          href={`/cronograma?grupo=${encodeURIComponent(grupoMacroId)}`}
          className="text-sm font-semibold text-ouro-escuro underline underline-offset-2 hover:text-vinho"
        >
          Ver atividades
        </Link>

        {periodo?.inicio || periodo?.fim ? (
          <p className="text-right text-xs leading-tight text-tinta-suave">
            <span className="numeros-tabulares">
              {/* Um traço fino separa início e fim; sem rótulo, para não poluir. */}
              <span className={inicioDesviado ? 'font-semibold text-vinho' : undefined}>
                {formatarDataCurta(periodo.inicio)}
              </span>
              {' – '}
              <span className={fimDesviado ? 'font-semibold text-vinho' : undefined}>
                {formatarDataCurta(periodo.fim)}
              </span>
            </span>

            {/* O aviso só aparece quando há desvio: card sem replanejamento
                fica idêntico ao de antes, sem ruído visual. */}
            {fimDesviado && periodo.desvioFimDias !== null ? (
              <>
                <br />
                <span
                  className="font-semibold text-vinho"
                  title={`Linha de base: ${formatarDataCurta(periodo.fimLinhaBase)}`}
                >
                  <span aria-hidden="true">▲ </span>
                  {textoDesvio(periodo.desvioFimDias)}
                </span>
                {/* Texto completo só para leitor de tela — a versão visual é
                    curta de propósito. */}
                <span className="sr-only">
                  {' '}
                  em relação à linha de base, que previa término em{' '}
                  {formatarDataCurta(periodo.fimLinhaBase)}.
                </span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
