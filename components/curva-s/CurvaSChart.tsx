'use client';

/**
 * Curva S — planejado x realizado acumulado, por semana ISO.
 *
 * A agregação inteira vem de `agregarCurvaS`/`seriesCurvaS` (@/lib/calculos):
 * este componente só desenha. A curva realizada para no presente (pontos
 * futuros vêm `null` do motor e o Recharts simplesmente não os liga), o que é
 * proposital — realizado não se extrapola.
 */

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { agregarCurvaS, pontoDaSemana, seriesCurvaS } from '@/lib/calculos';
import type { Atividade, AvancoSemanal } from '@/types/database';
import { FilterBar, type OpcaoFiltro } from '@/components/filters/FilterBar';
import {
  FILTROS_INICIAIS,
  mondayOfWeek,
  toCalculationFilters,
  type ScheduleFilterState,
} from '@/components/filters/scheduleFilters';
import { Card, EmptyState } from '@/components/ui/primitives';
import {
  formatarDataBR,
  formatarDataCurta,
  formatarInteiro,
  formatarPercentual,
} from '@/lib/ui/formato';

interface CurvaSChartProps {
  atividades: readonly Atividade[];
  avancos: readonly AvancoSemanal[];
  grupos: readonly OpcaoFiltro[];
  elementos: readonly OpcaoFiltro[];
  /** Data "hoje" injetada pelo servidor. */
  dataReferencia: string;
}

export function CurvaSChart({
  atividades,
  avancos,
  grupos,
  elementos,
  dataReferencia,
}: CurvaSChartProps) {
  const [filtros, setFiltros] = useState<ScheduleFilterState>({ ...FILTROS_INICIAIS });

  const curva = useMemo(
    () =>
      agregarCurvaS(atividades, avancos, {
        filtros: toCalculationFilters(filtros),
        dataReferencia,
      }),
    [atividades, avancos, filtros, dataReferencia],
  );

  const series = useMemo(() => seriesCurvaS(curva), [curva]);
  const pontoAtual = useMemo(
    () => pontoDaSemana(curva, dataReferencia),
    [curva, dataReferencia],
  );
  const semanaAtual = mondayOfWeek(dataReferencia);

  return (
    <>
      <FilterBar
        grupos={grupos}
        elementos={elementos}
        valor={filtros}
        onChange={setFiltros}
        mostrarBusca={false}
        mostrarSemanaAtual={false}
        resumo={`${formatarInteiro(curva.totalAtividades)} atividades no recorte · ${formatarInteiro(
          series.length,
        )} semanas`}
      />

      {series.length === 0 ? (
        <EmptyState
          title="Sem série para este recorte"
          description="As atividades filtradas não têm datas planejadas nem lançamentos semanais, então não há curva a desenhar."
        />
      ) : (
        <>
          <Card>
            <h2 className="sr-only">Gráfico da Curva S</h2>
            <div className="h-[22rem] w-full sm:h-[26rem]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={series}
                  margin={{ top: 8, right: 12, bottom: 8, left: -12 }}
                >
                  <CartesianGrid stroke="var(--borda)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="semana"
                    tickFormatter={formatarDataCurta}
                    stroke="var(--tinta-suave)"
                    tick={{ fontSize: 12 }}
                    minTickGap={24}
                  />
                  <YAxis
                    domain={[0, 100]}
                    unit="%"
                    stroke="var(--tinta-suave)"
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    labelFormatter={(valor) => `Semana de ${formatarDataBR(String(valor))}`}
                    formatter={(valor, nome) => [
                      typeof valor === 'number'
                        ? formatarPercentual(valor)
                        : 'sem lançamento',
                      String(nome ?? ''),
                    ]}
                    contentStyle={{
                      backgroundColor: 'var(--superficie)',
                      border: '1px solid var(--borda)',
                      borderRadius: 6,
                      color: 'var(--tinta)',
                    }}
                  />
                  <Legend />
                  {semanaAtual ? (
                    <ReferenceLine
                      x={semanaAtual}
                      stroke="var(--ouro)"
                      strokeDasharray="4 4"
                      label={{ value: 'hoje', fill: 'var(--ouro-escuro)', fontSize: 12 }}
                    />
                  ) : null}
                  <Line
                    type="monotone"
                    dataKey="planejado"
                    name="Planejado acumulado"
                    stroke="var(--vinho)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="realizado"
                    name="Realizado acumulado"
                    stroke="var(--ouro-escuro)"
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <Card>
              <dt className="text-sm text-tinta-suave">Planejado nesta semana</dt>
              <dd className="numeros-tabulares font-titulo text-2xl text-vinho">
                {formatarPercentual(pontoAtual?.planejadoAcumulado ?? null)}
              </dd>
            </Card>
            <Card>
              <dt className="text-sm text-tinta-suave">Realizado lançado</dt>
              <dd className="numeros-tabulares font-titulo text-2xl text-vinho">
                {formatarPercentual(pontoAtual?.realizadoAcumulado ?? null)}
              </dd>
            </Card>
            <Card>
              <dt className="text-sm text-tinta-suave">Último lançamento</dt>
              <dd className="numeros-tabulares font-titulo text-2xl text-vinho">
                {curva.ultimaSemanaComRealizado
                  ? formatarDataBR(curva.ultimaSemanaComRealizado)
                  : '—'}
              </dd>
            </Card>
          </dl>

          {curva.ultimaSemanaComRealizado === null ? (
            <p className="mt-3 text-sm text-tinta-suave">
              Ainda não há avanço semanal registrado: a curva realizada só aparece depois
              do primeiro lançamento de produção.
            </p>
          ) : null}

          {curva.atividadesSemDatas > 0 ? (
            <p className="mt-2 text-sm text-tinta-suave">
              {formatarInteiro(curva.atividadesSemDatas)} atividade(s) do recorte estão
              fora da linha de base por não terem datas planejadas.
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
