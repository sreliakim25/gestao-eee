/**
 * lib/concretagem/status.ts — Máquina de estados do pedido de concretagem.
 *
 * REGRA DE NEGÓCIO CRÍTICA:
 *   planejado → pedido → confirmado → concretado, nessa ordem, sem pular etapa
 *   e sem retroceder. `concretado` exige data de realização (constraint
 *   `concretagem_pedidos_data_realizada_coerente`) E checklist pré-concretagem
 *   completo.
 */

import { VOLUME_MINIMO_CONCRETO_M3 } from '@/types/database';
import type { StatusPedidoConcretagem } from '@/types/database';
import { avaliarChecklist } from './checklist';
import type { ContextoTransicao, ResultadoTransicao } from './tipos';

/** Ordem oficial do fluxo. O índice no array é o "nível" do status. */
export const ORDEM_STATUS: readonly StatusPedidoConcretagem[] = [
  'planejado',
  'pedido',
  'confirmado',
  'concretado',
];

/** Transições permitidas a partir de cada status. */
export const TRANSICOES_VALIDAS: Readonly<Record<StatusPedidoConcretagem, readonly StatusPedidoConcretagem[]>> = {
  planejado: ['pedido'],
  pedido: ['confirmado'],
  confirmado: ['concretado'],
  concretado: [],
};

/** Rótulos para a UI. */
export const ROTULOS_STATUS: Readonly<Record<StatusPedidoConcretagem, string>> = {
  planejado: 'Planejado',
  pedido: 'Pedido feito',
  confirmado: 'Confirmado pela concreteira',
  concretado: 'Concretado',
};

/** Posição do status na ordem oficial (−1 se desconhecido). */
export function nivelStatus(status: StatusPedidoConcretagem): number {
  return ORDEM_STATUS.indexOf(status);
}

/** Próximo status do fluxo, ou null quando já é final. */
export function proximoStatus(status: StatusPedidoConcretagem): StatusPedidoConcretagem | null {
  return TRANSICOES_VALIDAS[status]?.[0] ?? null;
}

/** Checagem estrutural pura: a transição existe na máquina de estados? */
export function transicaoValida(
  de: StatusPedidoConcretagem,
  para: StatusPedidoConcretagem,
): boolean {
  return (TRANSICOES_VALIDAS[de] ?? []).includes(para);
}

/**
 * Valida uma transição, incluindo as pré-condições de `concretado`.
 *
 * O contexto é opcional só para permitir checagem estrutural isolada; ao mudar
 * para `concretado` sem contexto, a transição é negada (não se marca concretado
 * às cegas).
 */
export function validarTransicao(
  de: StatusPedidoConcretagem,
  para: StatusPedidoConcretagem,
  contexto: ContextoTransicao = {},
): ResultadoTransicao {
  const erros: { codigo: ResultadoTransicao['erros'][number]['codigo']; mensagem: string }[] = [];

  const nivelDe = nivelStatus(de);
  const nivelPara = nivelStatus(para);

  if (nivelDe === -1 || nivelPara === -1) {
    erros.push({
      codigo: 'TRANSICAO_INEXISTENTE',
      mensagem: `Status desconhecido na transição "${de}" → "${para}".`,
    });
    return { permitida: false, erros };
  }

  if (!transicaoValida(de, para)) {
    if (de === para) {
      erros.push({ codigo: 'MESMO_STATUS', mensagem: `O pedido já está em "${ROTULOS_STATUS[de]}".` });
    } else if (nivelPara < nivelDe) {
      erros.push({
        codigo: 'RETROCESSO',
        mensagem: `Não é permitido voltar de "${ROTULOS_STATUS[de]}" para "${ROTULOS_STATUS[para]}".`,
      });
    } else if (de === 'concretado') {
      erros.push({ codigo: 'STATUS_FINAL', mensagem: '"Concretado" é o status final do pedido.' });
    } else {
      erros.push({
        codigo: 'PULO_DE_ETAPA',
        mensagem:
          `Não é permitido pular etapa: de "${ROTULOS_STATUS[de]}" só se avança para ` +
          `"${ROTULOS_STATUS[proximoStatus(de) as StatusPedidoConcretagem]}".`,
      });
    }
    return { permitida: false, erros };
  }

  // A partir daqui a transição é estruturalmente válida — faltam as regras de negócio.
  if (para === 'pedido') {
    const volume = contexto.volumeM3;
    if (typeof volume === 'number' && volume < VOLUME_MINIMO_CONCRETO_M3 && contexto.combinadoComSobra !== true) {
      erros.push({
        codigo: 'VOLUME_ABAIXO_MINIMO',
        mensagem:
          `Pedido de ${volume} m³ abaixo do mínimo de ${VOLUME_MINIMO_CONCRETO_M3} m³. ` +
          'Combine com a sobra de outra etapa/frente antes de fazer o pedido.',
      });
    }
  }

  if (para === 'concretado') {
    if (!contexto.dataRealizada) {
      erros.push({
        codigo: 'SEM_DATA_REALIZADA',
        mensagem: 'Marcar como concretado exige a data de realização.',
      });
    }
    const checklist = avaliarChecklist(contexto.checklist ?? {});
    if (!checklist.completo) {
      const detalhe =
        checklist.foraDeFaixa.length > 0
          ? checklist.foraDeFaixa.map((f) => f.mensagem).join(' ')
          : `Pendentes: ${checklist.pendentes.map((p) => p.rotulo).join('; ')}.`;
      erros.push({
        codigo: 'CHECKLIST_INCOMPLETO',
        mensagem: `Checklist pré-concretagem incompleto (${checklist.marcadosObrigatorios}/${checklist.totalObrigatorios}). ${detalhe}`,
      });
    }
  }

  return { permitida: erros.length === 0, erros };
}
