/**
 * Fixtures dos testes de concretagem.
 * Volumes e etapas seguem o Plano_Execucao_Concretagem_EEE.docx.
 */

import { criarChecklistVazio, ITENS_OBRIGATORIOS } from '@/lib/concretagem/checklist';
import type { EstadoChecklist, NumeroEtapa, PedidoConcretagem } from '@/lib/concretagem/tipos';
import type { StatusPedidoConcretagem } from '@/types/database';

/** Checklist com todos os itens obrigatórios marcados e valores dentro da faixa. */
export function checklistCompletoFixture(): EstadoChecklist {
  const estado = criarChecklistVazio();
  for (const item of ITENS_OBRIGATORIOS) {
    estado[item.id] = { marcado: true, valor: null, observacao: null, marcadoEm: '2026-08-05T10:00:00.000Z' };
  }
  estado.slump = { marcado: true, valor: 60, observacao: null, marcadoEm: '2026-08-05T10:00:00.000Z' };
  estado.cobrimento = { marcado: true, valor: 5, observacao: null, marcadoEm: '2026-08-05T10:00:00.000Z' };
  return estado;
}

/** Pedido de concretagem para teste, com defaults sensatos. */
export function pedidoFixture(sobrescritas: Partial<PedidoConcretagem> = {}): PedidoConcretagem {
  return {
    id: 'pedido-1',
    etapa: 1 as NumeroEtapa,
    elementos: ['LF1', 'LF2', 'LF4'],
    volumeM3: 23.5,
    dataPrevista: '2026-09-01',
    dataRealizada: null,
    status: 'planejado' as StatusPedidoConcretagem,
    combinadoComSobra: false,
    checklist: criarChecklistVazio(),
    notaFiscalRef: null,
    observacoes: null,
    ...sobrescritas,
  };
}
