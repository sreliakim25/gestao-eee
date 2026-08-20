/**
 * lib/concretagem/mapeamento.ts — Ponte entre a Row do banco e o tipo do domínio.
 *
 * Mantém as regras puras (`pedido.ts`, `status.ts`) livres de qualquer detalhe
 * do schema. Não faz I/O.
 */

import type { ConcretagemPedido, ConcretagemPedidoInsert } from '@/types/database';
import { lerChecklist, serializarChecklist } from './checklist';
import type { NumeroEtapa, PedidoConcretagem } from './tipos';

/** Normaliza a etapa vinda do banco para 1..4 (constraint do banco garante a faixa). */
function normalizarEtapa(etapa: number): NumeroEtapa {
  const valor = Math.min(4, Math.max(1, Math.round(etapa)));
  return valor as NumeroEtapa;
}

/** Row de `concretagem_pedidos` → tipo do domínio. */
export function paraPedidoDominio(linha: ConcretagemPedido): PedidoConcretagem {
  return {
    id: linha.id,
    etapa: normalizarEtapa(linha.etapa),
    elementos: linha.elementos ?? [],
    volumeM3: Number(linha.volume_m3),
    dataPrevista: linha.data_prevista,
    dataRealizada: linha.data_realizada,
    status: linha.status,
    combinadoComSobra: linha.combinado_com_sobra,
    checklist: lerChecklist(linha.checklist_json),
    notaFiscalRef: linha.nota_fiscal_ref,
    observacoes: linha.observacoes,
  };
}

/**
 * Tipo do domínio → payload de escrita em `concretagem_pedidos`.
 *
 * `PedidoConcretagem` é um recorte das regras puras e não carrega o
 * dispositivo (projeto) a que o pedido pertence — por isso `projetoId` entra
 * como parâmetro explícito, vindo do contexto de quem chama (rota/página já
 * sabe qual projeto está ativo).
 */
export function paraPedidoInsert(pedido: PedidoConcretagem, projetoId: string): ConcretagemPedidoInsert {
  return {
    id: pedido.id,
    projeto_id: projetoId,
    etapa: pedido.etapa,
    elementos: [...pedido.elementos],
    volume_m3: pedido.volumeM3,
    data_prevista: pedido.dataPrevista,
    data_realizada: pedido.dataRealizada,
    status: pedido.status,
    checklist_json: serializarChecklist(pedido.checklist),
    nota_fiscal_ref: pedido.notaFiscalRef ?? null,
    combinado_com_sobra: pedido.combinadoComSobra,
    observacoes: pedido.observacoes ?? null,
  };
}
