/**
 * app/concretagem/page.tsx — Módulo de Concretagem (Fase 5).
 *
 * Base: `Materiais/Plano_Execucao_Concretagem_EEE.docx` — 4 etapas, volume por
 * elemento, sequência de caminhões e checklist técnico.
 *
 * Regras que esta tela materializa:
 *  - pedido mínimo de 5 m³, com alerta visual e sugestão de combinação de sobra;
 *  - status planejado → pedido → confirmado → concretado, sem pular etapa;
 *  - checklist pré-concretagem completo para marcar "concretado";
 *  - vínculo com a NF, lembrando que concreto é COMPRA DIRETA (não é mão de obra
 *    do contrato do terceirizado — ver /orcamento).
 *
 * O shell (layout, navegação, fontes, tema) é do agente `ui-modulos`.
 */

import { VOLUME_MINIMO_CONCRETO_M3 } from '@/types/database';
import {
  CAPACIDADE_CAMINHAO_M3,
  RESUMO_PEDIDO_CONCRETEIRAS,
  volumeTotalPlanejadoM3,
  VOLUME_TOTAL_CARIMBO_M3,
} from '@/lib/concretagem/plano';
import { carregarDadosConcretagem } from './dados';
import { CartaoEtapa } from './cartao-etapa';
import { formatarM3 } from './formatos';

export const metadata = {
  title: 'Concretagem — EEE Novo Mundo',
  description: 'Etapas, volumes, pedidos de concreto e checklist pré-concretagem da elevatória.',
};

export default async function PaginaConcretagem() {
  const { etapas, pedidosPorEtapa, erroBanco } = await carregarDadosConcretagem();
  const totalPedidos = [...pedidosPorEtapa.values()].reduce((soma, lista) => soma + lista.length, 0);
  const abaixoDoMinimo = [...pedidosPorEtapa.values()]
    .flat()
    .filter((p) => p.validacao.alertas.some((a) => a.codigo === 'VOLUME_ABAIXO_MINIMO')).length;

  return (
    <div className="mx-auto w-full max-w-5xl text-tinta">
      <header className="border-b-2 border-[#E8A020] pb-4">
        <p className="text-xs uppercase tracking-[0.2em] text-[#8B1A1A]">EEE Novo Mundo</p>
        <h1 className="mt-1 text-3xl font-bold text-[#8B1A1A]">Concretagem</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#2B2118]/80">
          Programação logística das 4 etapas de concretagem da elevatória, conforme o Plano de Execução
          da Concretagem (VMC/UDE). Volume total planejado de {formatarM3(volumeTotalPlanejadoM3())},
          calibrado sobre o Vce de {formatarM3(VOLUME_TOTAL_CARIMBO_M3)} do carimbo do projeto
          estrutural. Para medição e pagamento vale o memorial de cálculo oficial.
        </p>
      </header>

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Pedido mínimo" valor={`${VOLUME_MINIMO_CONCRETO_M3} m³`} nota="por caminhão" />
        <Indicador rotulo="Capacidade do caminhão" valor={`${CAPACIDADE_CAMINHAO_M3} m³`} nota="faixa 5–14 m³" />
        <Indicador
          rotulo="Pedidos abaixo do mínimo"
          valor={String(abaixoDoMinimo)}
          nota={abaixoDoMinimo > 0 ? 'combinar sobra antes de liberar' : 'nenhum bloqueio no momento'}
          destaque={abaixoDoMinimo > 0}
        />
      </section>

      {erroBanco ? (
        <p className="mt-5 rounded-md border-l-4 border-[#E8A020] bg-[#E8A020]/15 px-3 py-2 text-sm text-[#7A5410]">
          ⚠️ Não foi possível ler os pedidos no Supabase ({erroBanco}). A tela está exibindo apenas o
          planejamento do documento, em modo leitura.
        </p>
      ) : null}

      {!erroBanco && totalPedidos === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-[#8B1A1A]/30 px-3 py-2 text-sm text-[#2B2118]/70">
          Ainda não há pedidos de concreto registrados. As etapas abaixo vêm do plano de execução.
        </p>
      ) : null}

      <div className="mt-6 space-y-6">
        {etapas.map((etapa) => (
          <CartaoEtapa key={etapa.etapa} etapa={etapa} pedidos={pedidosPorEtapa.get(etapa.etapa) ?? []} />
        ))}
      </div>

      <section className="mt-8" aria-label="Resumo para pedido às concreteiras">
        <h2 className="text-xl font-bold text-[#8B1A1A]">Resumo para pedido às concreteiras</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-[#8B1A1A]/20">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#8B1A1A] text-[#F0EAD8]">
              <tr>
                <th className="px-3 py-2">Dia</th>
                <th className="px-3 py-2">Volume a pedir</th>
                <th className="px-3 py-2">Nº de caminhões</th>
              </tr>
            </thead>
            <tbody>
              {RESUMO_PEDIDO_CONCRETEIRAS.map((dia) => {
                const temFracaoPequena = dia.volumesM3.some((v) => v < VOLUME_MINIMO_CONCRETO_M3);
                return (
                  <tr key={dia.dia} className="border-b border-[#8B1A1A]/10 last:border-0 odd:bg-[#F0EAD8]/50">
                    <td className="px-3 py-2 font-semibold">{dia.dia}</td>
                    <td className="px-3 py-2">
                      {dia.volumesM3.length > 0 ? dia.volumesM3.map((v) => formatarM3(v)).join(' + ') : '—'}
                      {dia.nota ? (
                        <span className={`ml-2 text-xs ${temFracaoPequena ? 'font-semibold text-[#8B1A1A]' : 'text-[#2B2118]/60'}`}>
                          ({dia.nota})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{dia.numCaminhoes ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-[#2B2118]/60">
          O concreto é compra direta da contratada, faturado pela contratante — o valor não entra no
          contrato de mão de obra do terceirizado (ver o módulo de Orçamento).
        </p>
      </section>
    </div>
  );
}

function Indicador({
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
      <p className="text-2xl font-bold text-[#8B1A1A]">{valor}</p>
      <p className="text-xs text-[#2B2118]/70">{nota}</p>
    </div>
  );
}
