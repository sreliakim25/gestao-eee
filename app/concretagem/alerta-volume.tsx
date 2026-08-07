/**
 * Alerta visual do pedido mínimo de 5 m³.
 *
 * REGRA DE NEGÓCIO CRÍTICA: um pedido abaixo de 5 m³ nunca passa silenciosamente.
 * A tela mostra o bloqueio E a sugestão de combinação com a sobra de outra
 * etapa/frente, vinda de `sugerirCombinacoesDeSobra`.
 */

import { VOLUME_MINIMO_CONCRETO_M3 } from '@/types/database';
import type { AlertaPedido, SugestaoCombinacao } from '@/lib/concretagem/tipos';
import { formatarM3 } from './formatos';

const ESTILO_POR_NIVEL: Record<AlertaPedido['nivel'], string> = {
  bloqueio: 'border-[#8B1A1A] bg-[#8B1A1A]/10 text-[#8B1A1A]',
  atencao: 'border-[#E8A020] bg-[#E8A020]/15 text-[#7A5410]',
  info: 'border-[#8B1A1A]/25 bg-[#F0EAD8] text-[#2B2118]',
};

const ICONE_POR_NIVEL: Record<AlertaPedido['nivel'], string> = {
  bloqueio: '⛔',
  atencao: '⚠️',
  info: 'ℹ️',
};

export function ListaAlertas({ alertas }: { alertas: readonly AlertaPedido[] }) {
  if (alertas.length === 0) return null;

  return (
    <ul className="mt-3 space-y-2">
      {alertas.map((alerta) => (
        <li
          key={`${alerta.codigo}-${alerta.mensagem}`}
          data-codigo={alerta.codigo}
          className={`rounded-md border-l-4 px-3 py-2 text-sm ${ESTILO_POR_NIVEL[alerta.nivel]}`}
        >
          <span aria-hidden className="mr-2">
            {ICONE_POR_NIVEL[alerta.nivel]}
          </span>
          {alerta.mensagem}
        </li>
      ))}
    </ul>
  );
}

export function SugestaoDeCombinacao({ sugestao }: { sugestao: SugestaoCombinacao }) {
  return (
    <div
      data-teste="sugestao-combinacao"
      className="mt-3 rounded-md border border-dashed border-[#E8A020] bg-[#E8A020]/10 px-3 py-2 text-sm text-[#2B2118]"
    >
      <p className="font-semibold text-[#8B1A1A]">
        Sugestão para atingir o mínimo de {VOLUME_MINIMO_CONCRETO_M3} m³
      </p>
      <p className="mt-1">{sugestao.mensagem}</p>

      {sugestao.parceiros.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {sugestao.parceiros.map((parceiro) => (
            <li key={parceiro.id} className="flex flex-wrap gap-x-3 text-xs">
              <span className="font-semibold">Etapa {parceiro.etapa}</span>
              <span>{formatarM3(parceiro.volumeM3)}</span>
              <span>
                {parceiro.distanciaDias === null
                  ? 'sem data prevista'
                  : `${parceiro.distanciaDias} dia(s) de diferença`}
              </span>
            </li>
          ))}
          <li className="pt-1 text-xs font-semibold">
            Volume combinado: {formatarM3(sugestao.volumeCombinadoM3)}
            {sugestao.atingeMinimo ? ' — atinge o mínimo.' : ' — ainda abaixo do mínimo.'}
          </li>
        </ul>
      ) : null}
    </div>
  );
}
