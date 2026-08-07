/**
 * Cartão de uma etapa do plano de concretagem: volume por elemento, sequência
 * executiva e os pedidos daquela etapa (status, alertas, checklist e NF).
 */

import { calcularCaminhoes } from '@/lib/concretagem/pedido';
import type { EtapaPlano } from '@/lib/concretagem/tipos';
import type { PedidoComValidacao } from './dados';
import { ListaAlertas, SugestaoDeCombinacao } from './alerta-volume';
import { ChecklistPreConcretagem } from './checklist-pre-concretagem';
import { TrilhaStatus } from './trilha-status';
import { formatarData, formatarM3 } from './formatos';

export function CartaoEtapa({ etapa, pedidos }: { etapa: EtapaPlano; pedidos: readonly PedidoComValidacao[] }) {
  const caminhoes = calcularCaminhoes(etapa.volumeM3);
  const volumeDetalhado = etapa.elementos.reduce((soma, e) => soma + (e.volumeM3 ?? 0), 0);
  const semDetalhe = etapa.elementos.filter((e) => e.volumeM3 === null).length;

  return (
    <article className="rounded-lg border border-[#8B1A1A]/20 bg-white/70 shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-3 rounded-t-lg bg-[#8B1A1A] px-4 py-3 text-[#F0EAD8]">
        <h3 className="text-lg font-semibold">
          Etapa {etapa.etapa} — {etapa.titulo}
        </h3>
        <p className="text-sm">
          <span className="font-semibold">{formatarM3(etapa.volumeM3)}</span>
          {' · '}
          {caminhoes.numCaminhoes} caminhão(ões): {caminhoes.cargasM3.map((c) => formatarM3(c)).join(' + ')}
          {' · '}
          dias {etapa.diaInicio}–{etapa.diaFim}
        </p>
      </header>

      <div className="px-4 py-4">
        {etapa.exigeCombinacaoComOutraFrente ? (
          <p className="mb-3 rounded-md border-l-4 border-[#E8A020] bg-[#E8A020]/15 px-3 py-2 text-sm text-[#7A5410]">
            ⚠️ O plano já marca esta etapa para combinar com a sobra de outra frente antes de fechar o pedido.
          </p>
        ) : null}

        <h4 className="text-sm font-semibold text-[#8B1A1A]">Volume por elemento</h4>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#8B1A1A]/20 text-xs uppercase tracking-wide text-[#2B2118]/60">
                <th className="py-1 pr-3">Elemento</th>
                <th className="py-1 pr-3">Descrição</th>
                <th className="py-1 pr-3">Esp. (cm)</th>
                <th className="py-1 pr-3">Compr. (cm)</th>
                <th className="py-1 pr-3">Altura (m)</th>
                <th className="py-1 text-right">Volume</th>
              </tr>
            </thead>
            <tbody>
              {etapa.elementos.map((elemento) => (
                <tr key={elemento.codigo} className="border-b border-[#8B1A1A]/10 last:border-0">
                  <td className="py-1 pr-3 font-semibold text-[#2B2118]">
                    {elemento.codigo}
                    {elemento.segundaFase ? (
                      <span className="ml-2 rounded bg-[#E8A020]/25 px-1.5 py-0.5 text-[10px] uppercase text-[#7A5410]">
                        2ª fase
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-3 text-[#2B2118]/80">{elemento.descricao}</td>
                  <td className="py-1 pr-3">{elemento.espessuraCm ?? '—'}</td>
                  <td className="py-1 pr-3">{elemento.comprimentoCm ?? '—'}</td>
                  <td className="py-1 pr-3">
                    {elemento.alturaM !== null ? `${elemento.alturaAproximada ? '~' : ''}${elemento.alturaM}` : '—'}
                  </td>
                  <td className="py-1 text-right font-semibold">
                    {elemento.volumeM3 !== null ? formatarM3(elemento.volumeM3) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-[#2B2118]/60">
          Soma dos elementos detalhados no plano: {formatarM3(Number(volumeDetalhado.toFixed(2)))}.
          {semDetalhe > 0
            ? ` ${semDetalhe} elemento(s) sem volume individual no plano (o documento traz só o agregado da etapa) — não estimar.`
            : ''}
        </p>

        <h4 className="mt-4 text-sm font-semibold text-[#8B1A1A]">Sequência executiva</h4>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-[#2B2118]/85">
          {etapa.sequenciaExecutiva.map((passo) => (
            <li key={passo}>{passo}</li>
          ))}
        </ol>

        {etapa.observacoes?.length ? (
          <ul className="mt-3 space-y-1 text-xs text-[#2B2118]/70">
            {etapa.observacoes.map((obs) => (
              <li key={obs}>• {obs}</li>
            ))}
          </ul>
        ) : null}

        <h4 className="mt-5 text-sm font-semibold text-[#8B1A1A]">Pedidos desta etapa</h4>
        {pedidos.length === 0 ? (
          <p className="mt-1 text-sm text-[#2B2118]/60">
            Nenhum pedido registrado ainda. O planejamento acima é a referência do
            <span className="italic"> Plano de Execução da Concretagem</span>.
          </p>
        ) : (
          <ul className="mt-2 space-y-4">
            {pedidos.map(({ pedido, validacao, sugestao }) => (
              <li key={pedido.id} className="rounded-md border border-[#8B1A1A]/15 bg-[#F0EAD8]/60 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[#2B2118]">
                      {formatarM3(pedido.volumeM3)} · {validacao.caminhoes.numCaminhoes} caminhão(ões)
                      {pedido.combinadoComSobra ? (
                        <span className="ml-2 rounded bg-[#E8A020]/30 px-1.5 py-0.5 text-[10px] uppercase text-[#7A5410]">
                          combinado com sobra
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-[#2B2118]/70">
                      Elementos: {pedido.elementos.length > 0 ? pedido.elementos.join(', ') : '—'} · Previsto:{' '}
                      {formatarData(pedido.dataPrevista)} · Realizado: {formatarData(pedido.dataRealizada)}
                    </p>
                  </div>
                  <TrilhaStatus status={pedido.status} />
                </div>

                {/* Vínculo com a NF: concreto é COMPRA DIRETA da contratada,
                    faturada pela contratante — nunca entra na mão de obra do
                    contrato do terceirizado (ver /orcamento). */}
                <p className="mt-2 text-xs text-[#2B2118]/70">
                  <span className="font-semibold">Nota fiscal (compra direta):</span>{' '}
                  {pedido.notaFiscalRef ?? 'não informada'}
                </p>

                <ListaAlertas alertas={validacao.alertas} />
                {sugestao ? <SugestaoDeCombinacao sugestao={sugestao} /> : null}
                <ChecklistPreConcretagem checklist={pedido.checklist} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
