/**
 * app/orcamento/page.tsx — Módulo de Orçamento / Terceirizado (Fase 6).
 *
 * Orçado x medido das 6 categorias do quantitativo do terceirizado + Itens
 * Omissos, a partir da view `orcamento_resumo_categoria`.
 *
 * REGRA DE NEGÓCIO CRÍTICA: o concreto é COMPRA DIRETA da contratada, faturada
 * pela contratante. Seu valor nunca é somado ao contrato de mão de obra do
 * terceirizado — a tela mostra as duas grandezas separadas e rotuladas.
 *
 * O shell (layout, navegação, fontes, tema) é do agente `ui-modulos`.
 */

import { carregarDadosOrcamento } from './dados';
import { saldoContrato } from './agregacao';
import { TabelaCategorias } from './tabela-categorias';
import { formatarPercentual, formatarReais } from '../concretagem/formatos';

export const metadata = {
  title: 'Orçamento / Terceirizado — EEE Novo Mundo',
  description: 'Orçado x medido do contrato do terceirizado, com o concreto de compra direta segregado.',
};

export default async function PaginaOrcamento() {
  const { resumos, totais, itensCompraDireta, erroBanco } = await carregarDadosOrcamento();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 text-[#2B2118]">
      <header className="border-b-2 border-[#E8A020] pb-4">
        <p className="text-xs uppercase tracking-[0.2em] text-[#8B1A1A]">EEE Novo Mundo</p>
        <h1 className="mt-1 text-3xl font-bold text-[#8B1A1A]">Orçamento / Terceirizado</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#2B2118]/80">
          Acompanhamento do contratado x medido das 6 categorias do quantitativo do terceirizado mais
          Itens Omissos. Fonte: <span className="italic">QUANTITATIVO ESTAÇÃO ELEVATÓRIA DE ESGOTO RL.xlsx</span>,
          aba ORÇAMENTO, importada por <code className="text-xs">npm run import:orcamento</code>.
        </p>
      </header>

      {erroBanco ? (
        <p className="mt-5 rounded-md border-l-4 border-[#E8A020] bg-[#E8A020]/15 px-3 py-2 text-sm text-[#7A5410]">
          ⚠️ Não foi possível ler o orçamento no Supabase ({erroBanco}). Os valores abaixo aparecem
          zerados até o import ser executado.
        </p>
      ) : null}

      <section className="mt-5 grid gap-3 md:grid-cols-3">
        <Cartao
          rotulo="Contrato do terceirizado (mão de obra)"
          valor={formatarReais(totais.contratoMaoDeObraOrcado)}
          nota={`Medido ${formatarReais(totais.contratoMaoDeObraMedido)} · ${formatarPercentual(
            totais.contratoMaoDeObraPercentual,
          )} · saldo ${formatarReais(saldoContrato(totais))}`}
          destaque
        />
        <Cartao
          rotulo="Concreto — compra direta"
          valor={formatarReais(totais.compraDiretaOrcado)}
          nota={`Medido ${formatarReais(totais.compraDiretaMedido)} · ${formatarPercentual(
            totais.compraDiretaPercentual,
          )} · FORA do contrato de mão de obra`}
        />
        <Cartao
          rotulo="Total da planilha (conferência)"
          valor={formatarReais(totais.totalPlanilha)}
          nota="Mão de obra + compra direta. Serve só para bater com a planilha — não é o valor a medir do terceirizado."
        />
      </section>

      <p className="mt-4 rounded-md border-l-4 border-[#8B1A1A] bg-[#8B1A1A]/10 px-3 py-2 text-sm text-[#8B1A1A]">
        <span className="font-semibold">Regra contratual:</span> o concreto é compra direta da
        contratada e faturado pela contratante. Esse valor é acompanhado à parte e{' '}
        <span className="font-semibold">nunca soma</span> ao valor de mão de obra do contrato do
        terceirizado.
      </p>

      <section className="mt-6" aria-label="Orçado x medido por categoria">
        <h2 className="mb-2 text-xl font-bold text-[#8B1A1A]">Orçado x medido por categoria</h2>
        <TabelaCategorias resumos={resumos} totais={totais} />
      </section>

      <section className="mt-8" aria-label="Itens de compra direta">
        <h2 className="text-xl font-bold text-[#8B1A1A]">Itens de compra direta (concreto)</h2>
        <p className="mt-1 text-sm text-[#2B2118]/70">
          Itens marcados com <code className="text-xs">eh_compra_direta</code> no import. A nota fiscal
          de cada remessa é registrada no módulo de Concretagem.
        </p>

        {itensCompraDireta.length === 0 ? (
          <p className="mt-2 rounded-md border border-dashed border-[#8B1A1A]/30 px-3 py-2 text-sm text-[#2B2118]/70">
            Nenhum item de compra direta carregado ainda.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-[#8B1A1A]/20">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#8B1A1A] text-[#F0EAD8]">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2 text-right">Qtd.</th>
                  <th className="px-3 py-2">Und.</th>
                  <th className="px-3 py-2 text-right">Preço unit.</th>
                  <th className="px-3 py-2 text-right">Orçado</th>
                  <th className="px-3 py-2 text-right">Medido</th>
                  <th className="px-3 py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {itensCompraDireta.map((item) => (
                  <tr key={item.id} className="border-b border-[#8B1A1A]/10 odd:bg-[#F0EAD8]/50">
                    <td className="px-3 py-2 font-semibold">{item.item_codigo}</td>
                    <td className="px-3 py-2">{item.descricao}</td>
                    <td className="px-3 py-2 text-right">{Number(item.quantidade).toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2">{item.unidade ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{formatarReais(Number(item.preco_unitario))}</td>
                    <td className="px-3 py-2 text-right">{formatarReais(Number(item.valor_total))}</td>
                    <td className="px-3 py-2 text-right">{formatarReais(Number(item.valor_medido))}</td>
                    <td className="px-3 py-2 text-right">{formatarPercentual(Number(item.percentual_medido))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Cartao({
  rotulo,
  valor,
  nota,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  nota: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={[
        'rounded-lg border px-4 py-3',
        destaque ? 'border-[#8B1A1A] bg-[#8B1A1A]/10' : 'border-[#8B1A1A]/20 bg-[#F0EAD8]/60',
      ].join(' ')}
    >
      <p className="text-xs uppercase tracking-wide text-[#2B2118]/60">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold text-[#8B1A1A]">{valor}</p>
      <p className="mt-1 text-xs text-[#2B2118]/70">{nota}</p>
    </div>
  );
}
