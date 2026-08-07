'use client';

/**
 * Tabela de atividades do Cronograma.
 *
 * Recebe apenas a PÁGINA atual (o pai pagina antes de renderizar) — com 317
 * atividades, jogar tudo no DOM de uma vez trava celular de campo.
 * No mobile a tabela vira lista de cartões (sem rolagem horizontal infinita).
 */

import type { Atividade } from '@/types/database';
import { ProgressBar } from '@/components/ui/primitives';
import { formatarDataBR, formatarInteiro, formatarPercentual } from '@/lib/ui/formato';

interface ScheduleTableProps {
  atividades: readonly Atividade[];
  nomesGrupos: Readonly<Record<string, string>>;
  nomesElementos: Readonly<Record<string, string>>;
}

function EtiquetaCritica() {
  return (
    <span className="rounded bg-atrasado px-1.5 py-0.5 text-xs font-semibold text-creme">
      Crítica
    </span>
  );
}

export function ScheduleTable({
  atividades,
  nomesGrupos,
  nomesElementos,
}: ScheduleTableProps) {
  return (
    <>
      {/* Mobile: cartões */}
      <ul className="space-y-2 sm:hidden">
        {atividades.map((atividade) => (
          <li
            key={atividade.id}
            className="rounded-lg border border-borda bg-superficie p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-tinta">{atividade.nome}</p>
              {atividade.caminho_critico ? <EtiquetaCritica /> : null}
            </div>
            <p className="mt-1 text-sm text-tinta-suave">
              {nomesGrupos[atividade.grupo_macro_id] ?? 'Frente não identificada'}
              {atividade.elemento_visual_id
                ? ` · ${nomesElementos[atividade.elemento_visual_id] ?? 'Elemento'}`
                : ''}
            </p>
            <p className="numeros-tabulares mt-1 text-sm text-tinta-suave">
              {formatarDataBR(atividade.data_inicio_planejada)} →{' '}
              {formatarDataBR(atividade.data_fim_planejada)}
              {atividade.duracao_dias
                ? ` · ${formatarInteiro(atividade.duracao_dias)} d`
                : ''}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <ProgressBar
                percentual={atividade.percentual_concluido}
                label={`Concluído — ${atividade.nome}`}
              />
              <span className="numeros-tabulares shrink-0 text-sm font-semibold text-tinta">
                {formatarPercentual(atividade.percentual_concluido, 0)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: tabela */}
      <div className="hidden overflow-x-auto rounded-lg border border-borda sm:block">
        <table className="w-full border-collapse text-left text-[0.95rem]">
          <caption className="sr-only">
            Atividades do cronograma com datas planejadas, percentual concluído e
            criticidade
          </caption>
          <thead className="bg-vinho text-creme">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                Atividade
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Frente
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Elemento
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Início
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Fim
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Dur.
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Concluído
              </th>
            </tr>
          </thead>
          <tbody>
            {atividades.map((atividade, indice) => (
              <tr
                key={atividade.id}
                className={indice % 2 === 0 ? 'bg-superficie' : 'bg-creme-claro'}
              >
                <th scope="row" className="px-3 py-2 font-normal text-tinta">
                  <span className="flex items-center gap-2">
                    {atividade.nome}
                    {atividade.caminho_critico ? <EtiquetaCritica /> : null}
                  </span>
                </th>
                <td className="px-3 py-2 text-tinta-suave">
                  {nomesGrupos[atividade.grupo_macro_id] ?? '—'}
                </td>
                <td className="px-3 py-2 text-tinta-suave">
                  {atividade.elemento_visual_id
                    ? (nomesElementos[atividade.elemento_visual_id] ?? '—')
                    : '—'}
                </td>
                <td className="numeros-tabulares px-3 py-2 text-tinta-suave">
                  {formatarDataBR(atividade.data_inicio_planejada)}
                </td>
                <td className="numeros-tabulares px-3 py-2 text-tinta-suave">
                  {formatarDataBR(atividade.data_fim_planejada)}
                </td>
                <td className="numeros-tabulares px-3 py-2 text-right text-tinta-suave">
                  {atividade.duracao_dias ? formatarInteiro(atividade.duracao_dias) : '—'}
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <ProgressBar
                      percentual={atividade.percentual_concluido}
                      label={`Concluído — ${atividade.nome}`}
                    />
                    <span className="numeros-tabulares w-12 shrink-0 text-right font-semibold text-tinta">
                      {formatarPercentual(atividade.percentual_concluido, 0)}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
