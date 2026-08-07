/**
 * Tabela orçado x medido por categoria.
 *
 * As duas grandezas ficam em grupos de colunas separados e rotulados:
 *   "Mão de obra (contrato do terceirizado)" e "Concreto — compra direta".
 * Elas NUNCA são somadas em um único valor de contrato.
 */

import type { ResumoCategoriaUI, TotaisOrcamento } from './agregacao';
import { formatarPercentual, formatarReais } from '../concretagem/formatos';

function BarraPercentual({ valor }: { valor: number }) {
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#8B1A1A]/10">
      <div className="h-full bg-[#E8A020]" style={{ width: `${Math.min(100, Math.max(0, valor))}%` }} />
    </div>
  );
}

export function TabelaCategorias({
  resumos,
  totais,
}: {
  resumos: readonly ResumoCategoriaUI[];
  totais: TotaisOrcamento;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[#8B1A1A]/20">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead>
          <tr className="bg-[#8B1A1A] text-[#F0EAD8]">
            <th rowSpan={2} className="px-3 py-2 align-bottom">
              Categoria
            </th>
            <th colSpan={3} className="border-l border-[#F0EAD8]/30 px-3 py-2 text-center">
              Mão de obra — contrato do terceirizado
            </th>
            <th colSpan={3} className="border-l border-[#F0EAD8]/30 px-3 py-2 text-center">
              Concreto — compra direta (faturada pela contratante)
            </th>
          </tr>
          <tr className="bg-[#8B1A1A] text-xs text-[#F0EAD8]/90">
            <th className="border-l border-[#F0EAD8]/30 px-3 py-1 text-right">Orçado</th>
            <th className="px-3 py-1 text-right">Medido</th>
            <th className="px-3 py-1 text-right">%</th>
            <th className="border-l border-[#F0EAD8]/30 px-3 py-1 text-right">Orçado</th>
            <th className="px-3 py-1 text-right">Medido</th>
            <th className="px-3 py-1 text-right">%</th>
          </tr>
        </thead>

        <tbody>
          {resumos.map((r) => (
            <tr key={r.categoria} className="border-b border-[#8B1A1A]/10 odd:bg-[#F0EAD8]/50">
              <td className="px-3 py-2">
                <span className="font-semibold text-[#2B2118]">{r.rotulo}</span>
                <span className="ml-2 text-xs text-[#2B2118]/60">{r.totalItens} item(ns)</span>
              </td>
              <td className="border-l border-[#8B1A1A]/10 px-3 py-2 text-right">{formatarReais(r.maoDeObraOrcado)}</td>
              <td className="px-3 py-2 text-right">{formatarReais(r.maoDeObraMedido)}</td>
              <td className="px-3 py-2 text-right">
                {formatarPercentual(r.maoDeObraPercentual)}
                <BarraPercentual valor={r.maoDeObraPercentual} />
              </td>
              <td className="border-l border-[#8B1A1A]/10 px-3 py-2 text-right">
                {formatarReais(r.compraDiretaOrcado)}
              </td>
              <td className="px-3 py-2 text-right">{formatarReais(r.compraDiretaMedido)}</td>
              <td className="px-3 py-2 text-right">{formatarPercentual(r.compraDiretaPercentual)}</td>
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr className="border-t-2 border-[#E8A020] bg-[#F0EAD8] font-semibold text-[#8B1A1A]">
            <td className="px-3 py-2">Total</td>
            <td className="border-l border-[#8B1A1A]/10 px-3 py-2 text-right" data-teste="total-mao-de-obra">
              {formatarReais(totais.contratoMaoDeObraOrcado)}
            </td>
            <td className="px-3 py-2 text-right">{formatarReais(totais.contratoMaoDeObraMedido)}</td>
            <td className="px-3 py-2 text-right">{formatarPercentual(totais.contratoMaoDeObraPercentual)}</td>
            <td className="border-l border-[#8B1A1A]/10 px-3 py-2 text-right" data-teste="total-compra-direta">
              {formatarReais(totais.compraDiretaOrcado)}
            </td>
            <td className="px-3 py-2 text-right">{formatarReais(totais.compraDiretaMedido)}</td>
            <td className="px-3 py-2 text-right">{formatarPercentual(totais.compraDiretaPercentual)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
