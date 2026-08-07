'use client';

/**
 * Gantt simplificado: uma barra por atividade dentro da janela do conjunto
 * filtrado, com marcador da data de referência.
 *
 * Não há motor de CPM aqui — as datas e o `caminho_critico` vêm prontos do
 * banco (importados do Smartsheet). Renderiza só a página atual, pelo mesmo
 * motivo da tabela.
 */

import type { Atividade } from '@/types/database';
import { formatarDataBR, formatarPercentual } from '@/lib/ui/formato';
import { barraDaAtividade, janelaDoConjunto, marcadorDeData } from './ganttGeometry';

interface SimpleGanttProps {
  atividades: readonly Atividade[];
  /** Data "hoje" — injetada pela página, nunca lida do relógio aqui. */
  dataReferencia: string;
}

export function SimpleGantt({ atividades, dataReferencia }: SimpleGanttProps) {
  const janela = janelaDoConjunto(atividades);

  if (!janela) {
    return (
      <p className="rounded-lg border border-borda bg-superficie p-4 text-tinta-suave">
        As atividades selecionadas não têm datas planejadas — sem datas não há barra a
        desenhar.
      </p>
    );
  }

  const posicaoHoje = marcadorDeData(dataReferencia, janela);

  return (
    <div className="rounded-lg border border-borda bg-superficie p-3">
      <p className="mb-2 text-sm text-tinta-suave">
        Janela exibida: {formatarDataBR(janela.inicio)} a {formatarDataBR(janela.fim)}
        {posicaoHoje !== null ? ` · linha dourada = ${formatarDataBR(dataReferencia)}` : ''}
      </p>

      <ul className="space-y-1.5">
        {atividades.map((atividade) => {
          const barra = barraDaAtividade(atividade, janela);
          return (
            <li key={atividade.id} className="grid grid-cols-[1fr] gap-1 sm:grid-cols-[16rem_1fr] sm:items-center sm:gap-3">
              <span className="truncate text-sm text-tinta" title={atividade.nome}>
                {atividade.caminho_critico ? (
                  <span aria-label="caminho crítico" className="mr-1 text-atrasado">
                    ●
                  </span>
                ) : null}
                {atividade.nome}
              </span>

              <span className="relative block h-5 rounded bg-creme">
                {posicaoHoje !== null ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 w-px bg-ouro"
                    style={{ left: `${posicaoHoje}%` }}
                  />
                ) : null}

                {barra ? (
                  <span
                    className={`absolute inset-y-0 rounded ${
                      atividade.caminho_critico ? 'bg-atrasado/70' : 'bg-vinho/45'
                    }`}
                    style={{ left: `${barra.esquerdaPct}%`, width: `${barra.larguraPct}%` }}
                    title={`${formatarDataBR(atividade.data_inicio_planejada)} → ${formatarDataBR(
                      atividade.data_fim_planejada,
                    )} · ${formatarPercentual(atividade.percentual_concluido, 0)}`}
                  >
                    {/* Trecho concluído, sobre a barra planejada. */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 rounded-l bg-vinho"
                      style={{
                        width: `${Math.max(0, Math.min(100, atividade.percentual_concluido))}%`,
                      }}
                    />
                  </span>
                ) : (
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-xs text-tinta-suave">
                    sem datas planejadas
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
