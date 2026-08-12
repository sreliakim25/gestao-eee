'use client';

/**
 * Evolução do cronograma ao longo do tempo.
 *
 * Duas séries no mesmo gráfico, ambas vindas de `montarSerieHistorico`:
 *   - duração planejada da obra, em dias (eixo esquerdo);
 *   - percentual concluído (eixo direito).
 *
 * Por que estas duas juntas: a pergunta que o gestor faz é "o prazo está
 * crescendo mais rápido do que a obra anda?". Uma linha só não responde isso.
 *
 * O componente NÃO calcula nada — série e insights vêm de `@/lib/calculos`.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Insight, ResumoHistorico } from '@/lib/calculos';
import { Card } from '@/components/ui/primitives';
import { formatarDataCurta, formatarPercentual } from '@/lib/ui/formato';

interface Props {
  resumo: ResumoHistorico;
  insights: readonly Insight[];
}

const COR_DURACAO = '#8B1A1A';
const COR_PERCENTUAL = '#91620F';

/** Cores do aviso por tom — sem depender só de cor, o texto já diz tudo. */
const ESTILO_TOM: Record<Insight['tom'], string> = {
  atencao: 'border-l-[3px] border-vinho',
  bom: 'border-l-[3px] border-[#2F6B3A]',
  neutro: 'border-l-[3px] border-borda',
};

interface PontoTooltip {
  payload?: { data: string; duracaoDias: number | null; dataFim: string | null; percentual: number | null; criticas: number };
}

function TooltipHistorico({ active, payload }: { active?: boolean; payload?: PontoTooltip[] }) {
  if (!active || !payload?.length) return null;
  const ponto = payload[0]?.payload;
  if (!ponto) return null;

  return (
    <div className="rounded border border-borda bg-superficie px-3 py-2 text-sm shadow-sm">
      <p className="font-semibold text-tinta">{formatarDataCurta(ponto.data)}</p>
      <p className="text-tinta-suave">
        Término planejado: <strong className="text-tinta">{formatarDataCurta(ponto.dataFim)}</strong>
      </p>
      <p className="text-tinta-suave">
        Duração: <strong className="text-tinta">{ponto.duracaoDias ?? '—'} dias</strong>
      </p>
      <p className="text-tinta-suave">
        Concluído:{' '}
        <strong className="text-tinta">
          {ponto.percentual === null ? '—' : formatarPercentual(ponto.percentual)}
        </strong>
      </p>
      <p className="text-tinta-suave">
        Caminho crítico: <strong className="text-tinta">{ponto.criticas}</strong> atividades
      </p>
    </div>
  );
}

export function HistoricoCronograma({ resumo, insights }: Props) {
  const { pontos, primeiro } = resumo;

  return (
    <section aria-labelledby="historico-cronograma" className="mt-8">
      <h2
        id="historico-cronograma"
        className="mb-1 font-titulo text-xl leading-tight text-vinho"
      >
        Evolução do cronograma
      </h2>
      <p className="mb-3 text-sm text-tinta-suave">
        Como o prazo e o avanço se moveram desde o primeiro registro. Um ponto por dia de
        sincronização com o Smartsheet.
      </p>

      {pontos.length < 2 ? (
        <Card>
          <p className="text-sm text-tinta-suave">
            {pontos.length === 0
              ? 'Ainda não há registros. O gráfico aparece a partir do primeiro sync com o Smartsheet.'
              : 'Há apenas um registro. A trajetória aparece a partir do segundo dia de sync.'}
          </p>
        </Card>
      ) : (
        <Card>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pontos} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D8CCAE" />
                <XAxis
                  dataKey="data"
                  tickFormatter={(valor: string) => formatarDataCurta(valor)}
                  tick={{ fontSize: 12, fill: '#6A5C50' }}
                  stroke="#D8CCAE"
                />
                <YAxis
                  yAxisId="duracao"
                  tick={{ fontSize: 12, fill: '#6A5C50' }}
                  stroke="#D8CCAE"
                  label={{
                    value: 'dias de obra',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: 11, fill: '#6A5C50' },
                  }}
                  domain={['dataMin - 5', 'dataMax + 5']}
                />
                <YAxis
                  yAxisId="percentual"
                  orientation="right"
                  tick={{ fontSize: 12, fill: '#6A5C50' }}
                  stroke="#D8CCAE"
                  domain={[0, 100]}
                  unit="%"
                />
                <Tooltip content={<TooltipHistorico />} />

                {/* Referência: a duração no primeiro registro. Ver a linha subir
                    acima dela é o sinal visual de que o prazo cresceu. */}
                {primeiro?.duracaoDias != null ? (
                  <ReferenceLine
                    yAxisId="duracao"
                    y={primeiro.duracaoDias}
                    stroke={COR_DURACAO}
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                    label={{
                      value: `linha de base: ${primeiro.duracaoDias}d`,
                      position: 'insideBottomLeft',
                      style: { fontSize: 11, fill: '#6A5C50' },
                    }}
                  />
                ) : null}

                <Line
                  yAxisId="duracao"
                  type="stepAfter"
                  dataKey="duracaoDias"
                  name="Duração planejada (dias)"
                  stroke={COR_DURACAO}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
                <Line
                  yAxisId="percentual"
                  type="monotone"
                  dataKey="percentual"
                  name="Concluído (%)"
                  stroke={COR_PERCENTUAL}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Legenda escrita à mão: a do Recharts não deixa claro qual série usa
              qual eixo, e com dois eixos isso é o que mais confunde. */}
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-tinta-suave">
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-5"
                style={{ backgroundColor: COR_DURACAO }}
              />
              Duração planejada, em dias (eixo esquerdo)
            </li>
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-5 border-t-2 border-dashed"
                style={{ borderColor: COR_PERCENTUAL }}
              />
              Concluído, em % (eixo direito)
            </li>
          </ul>
        </Card>
      )}

      {insights.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {insights.map((insight) => (
            <p
              key={insight.codigo}
              className={`bg-superficie px-3 py-2 text-sm text-tinta ${ESTILO_TOM[insight.tom]}`}
            >
              {insight.texto}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
