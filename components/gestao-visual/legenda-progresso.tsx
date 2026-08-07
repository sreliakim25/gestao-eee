/**
 * components/gestao-visual/legenda-progresso.tsx — legenda das faixas.
 *
 * A amostra de cada faixa repete a textura usada no desenho e vem acompanhada
 * do nome da faixa, da descrição da textura e do critério numérico. Assim a
 * planta continua legível para quem imprime em preto-e-branco ou não distingue
 * ouro de vermelho.
 *
 * Os limiares exibidos vêm de `LIMIAR_INICIO_PP` / `LIMIAR_CONCLUSAO_PP`
 * (`lib/calculos`) — a legenda não pode dizer uma regra e o SVG aplicar outra.
 */

import {
  LIMIAR_CONCLUSAO_PP,
  LIMIAR_INICIO_PP,
  ROTULOS_FAIXA_PROGRESSO,
} from '@/lib/calculos';
import type { FaixaProgresso } from '@/types/database';
import { ESTILO_POR_FAIXA, OURO, CREME } from './paleta';

/** Critério em texto de cada faixa, derivado dos limiares oficiais. */
const CRITERIO_POR_FAIXA: Readonly<Record<FaixaProgresso, string>> = {
  nao_iniciado: `${LIMIAR_INICIO_PP}%`,
  em_andamento: `entre ${LIMIAR_INICIO_PP}% e ${LIMIAR_CONCLUSAO_PP}%`,
  concluido: `${LIMIAR_CONCLUSAO_PP}%`,
};

const ORDEM_FAIXAS: readonly FaixaProgresso[] = [
  'nao_iniciado',
  'em_andamento',
  'concluido',
];

/**
 * Amostra 24×16 desenhada com formas explícitas (e não com `url(#pattern)`)
 * para que a legenda seja autossuficiente e não dependa dos `<defs>` da planta
 * — ids duplicados no mesmo documento dariam resultado indefinido.
 */
function Amostra({ faixa }: { faixa: FaixaProgresso }) {
  const estilo = ESTILO_POR_FAIXA[faixa];
  return (
    <svg
      width={24}
      height={16}
      viewBox="0 0 24 16"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <rect
        x={0.6}
        y={0.6}
        width={22.8}
        height={14.8}
        fill={estilo.corBase}
        stroke={estilo.corTraco}
        strokeWidth={1.2}
      />
      {faixa === 'em_andamento' ? (
        <g stroke={estilo.corTraco} strokeWidth={2} opacity={0.55}>
          <path d="M-2,6 L6,-2 M2,14 L14,2 M10,16 L22,4 M18,18 L26,10" />
        </g>
      ) : null}
      {faixa === 'concluido' ? (
        <g fill={CREME} opacity={0.75}>
          <circle cx={5} cy={5} r={1.4} />
          <circle cx={12} cy={11} r={1.4} />
          <circle cx={19} cy={5} r={1.4} />
          <circle cx={5} cy={12} r={1.4} />
          <circle cx={19} cy={12} r={1.4} />
        </g>
      ) : null}
    </svg>
  );
}

export function LegendaProgresso({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6E6455]">
        Legenda — faixa de progresso
      </h2>
      <ul className="flex flex-wrap gap-x-6 gap-y-2" data-testid="legenda-faixas">
        {ORDEM_FAIXAS.map((faixa) => (
          <li key={faixa} className="flex items-center gap-2 text-sm">
            <Amostra faixa={faixa} />
            <span>
              <span className="font-semibold">{ROTULOS_FAIXA_PROGRESSO[faixa]}</span>{' '}
              <span className="text-[#6E6455]">
                ({CRITERIO_POR_FAIXA[faixa]} · {ESTILO_POR_FAIXA[faixa].textura})
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-[#6E6455]">
        Cada elemento também exibe o percentual em número — a faixa nunca é
        comunicada apenas pela cor.{' '}
        <span style={{ color: OURO }} aria-hidden="true">
          ◆
        </span>
      </p>
    </div>
  );
}
