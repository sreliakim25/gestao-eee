/**
 * lib/concretagem/pedido.ts — Regras do pedido de concreto.
 *
 * REGRA DE NEGÓCIO CRÍTICA (CLAUDE.md, item 1):
 *   Pedido mínimo de concreto = 5 m³. Um pedido abaixo disso NUNCA passa
 *   silenciosamente: a UI precisa alertar e sugerir combinar com a sobra de
 *   outra etapa/frente antes de liberar o pedido.
 *
 * A constante `VOLUME_MINIMO_CONCRETO_M3` vem de `types/database.ts` (espelha a
 * constraint `concretagem_pedidos_volume_minimo` do banco) — não duplicar aqui.
 */

import { VOLUME_MINIMO_CONCRETO_M3 } from '@/types/database';
import { avaliarChecklist } from './checklist';
import { CAPACIDADE_CAMINHAO_M3 } from './plano';
import type {
  AlertaPedido,
  CalculoCaminhoes,
  OpcoesCombinacao,
  ParceiroCombinacao,
  PedidoConcretagem,
  SugestaoCombinacao,
  ValidacaoPedido,
} from './tipos';

export { VOLUME_MINIMO_CONCRETO_M3 };

/** Arredondamento em 2 casas, evitando ruído de ponto flutuante. */
function duasCasas(valor: number): number {
  return Number(valor.toFixed(2));
}

/* -------------------------------------------------------------------------- */
/* Caminhões e sobra                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Distribui o volume em caminhões de até `capacidadeM3` (padrão 14 m³),
 * enchendo cada caminhão ao máximo e deixando o resto na última carga —
 * é assim que o plano monta as remessas (23,5 m³ → 14 + 9,5).
 */
export function calcularCaminhoes(
  volumeM3: number,
  capacidadeM3: number = CAPACIDADE_CAMINHAO_M3,
): CalculoCaminhoes {
  if (!(volumeM3 > 0)) {
    return {
      volumeM3: duasCasas(Math.max(volumeM3, 0)),
      numCaminhoes: 0,
      cargasM3: [],
      ultimaCargaM3: 0,
      sobraCapacidadeM3: 0,
      ultimaCargaAbaixoDoMinimo: false,
    };
  }

  const numCaminhoes = Math.ceil(duasCasas(volumeM3) / capacidadeM3);
  const cargasM3: number[] = [];
  let restante = duasCasas(volumeM3);

  for (let i = 0; i < numCaminhoes; i += 1) {
    const carga = duasCasas(Math.min(capacidadeM3, restante));
    cargasM3.push(carga);
    restante = duasCasas(restante - carga);
  }

  const ultimaCargaM3 = cargasM3[cargasM3.length - 1] ?? 0;

  return {
    volumeM3: duasCasas(volumeM3),
    numCaminhoes,
    cargasM3,
    ultimaCargaM3,
    sobraCapacidadeM3: duasCasas(numCaminhoes * capacidadeM3 - volumeM3),
    ultimaCargaAbaixoDoMinimo: ultimaCargaM3 < VOLUME_MINIMO_CONCRETO_M3,
  };
}

/** Quanto falta para o pedido atingir o mínimo de 5 m³ (0 quando já atinge). */
export function faltaParaMinimoM3(volumeM3: number): number {
  return duasCasas(Math.max(0, VOLUME_MINIMO_CONCRETO_M3 - volumeM3));
}

/** True quando o volume está abaixo do pedido mínimo de 5 m³. */
export function abaixoDoMinimo(volumeM3: number): boolean {
  return volumeM3 < VOLUME_MINIMO_CONCRETO_M3;
}

/* -------------------------------------------------------------------------- */
/* Validação do pedido                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Valida um pedido antes de liberá-lo.
 *
 * `liberado = false` sempre que houver alerta de nível `bloqueio` — em especial
 * volume < 5 m³ sem combinação de sobra registrada.
 */
export function validarPedido(pedido: PedidoConcretagem): ValidacaoPedido {
  const alertas: AlertaPedido[] = [];
  const caminhoes = calcularCaminhoes(pedido.volumeM3);
  const checklist = avaliarChecklist(pedido.checklist ?? {});

  if (!(pedido.volumeM3 > 0)) {
    alertas.push({
      nivel: 'bloqueio',
      codigo: 'VOLUME_NAO_POSITIVO',
      mensagem: 'Volume do pedido precisa ser maior que zero.',
    });
  } else if (abaixoDoMinimo(pedido.volumeM3)) {
    if (pedido.combinadoComSobra) {
      alertas.push({
        nivel: 'info',
        codigo: 'VOLUME_ABAIXO_MINIMO_COMBINADO',
        mensagem:
          `Volume de ${duasCasas(pedido.volumeM3)} m³ está abaixo do mínimo de ${VOLUME_MINIMO_CONCRETO_M3} m³, ` +
          'mas foi marcado como combinado com a sobra de outra etapa/frente.',
      });
    } else {
      alertas.push({
        nivel: 'bloqueio',
        codigo: 'VOLUME_ABAIXO_MINIMO',
        mensagem:
          `Pedido de ${duasCasas(pedido.volumeM3)} m³ abaixo do mínimo de ${VOLUME_MINIMO_CONCRETO_M3} m³. ` +
          `Faltam ${faltaParaMinimoM3(pedido.volumeM3)} m³: combine com a sobra de outra etapa/frente ` +
          'antes de liberar o pedido.',
      });
    }
  } else if (caminhoes.ultimaCargaAbaixoDoMinimo) {
    alertas.push({
      nivel: 'atencao',
      codigo: 'ULTIMA_CARGA_ABAIXO_MINIMO',
      mensagem:
        `A última carga fica com ${caminhoes.ultimaCargaM3} m³, abaixo do mínimo de ` +
        `${VOLUME_MINIMO_CONCRETO_M3} m³ por caminhão. Combine essa fração com outra frente.`,
    });
  }

  if (pedido.status === 'concretado') {
    if (!pedido.dataRealizada) {
      alertas.push({
        nivel: 'bloqueio',
        codigo: 'SEM_DATA_REALIZADA',
        mensagem: 'Pedido marcado como concretado exige data de realização.',
      });
    }
    if (!checklist.completo) {
      alertas.push({
        nivel: 'bloqueio',
        codigo: 'CHECKLIST_INCOMPLETO',
        mensagem:
          `Checklist pré-concretagem incompleto (${checklist.marcadosObrigatorios}/${checklist.totalObrigatorios} itens).`,
      });
    }
    if (!pedido.notaFiscalRef) {
      alertas.push({
        nivel: 'atencao',
        codigo: 'SEM_NOTA_FISCAL',
        mensagem:
          'Sem referência de nota fiscal. O concreto é compra direta da contratada, faturada pela contratante — ' +
          'registre a NF para o acompanhamento financeiro.',
      });
    }
  }

  for (const { mensagem } of checklist.foraDeFaixa) {
    alertas.push({ nivel: 'bloqueio', codigo: 'CHECKLIST_FORA_DE_FAIXA', mensagem });
  }

  return {
    liberado: !alertas.some((a) => a.nivel === 'bloqueio'),
    alertas,
    caminhoes,
    checklist,
  };
}

/* -------------------------------------------------------------------------- */
/* Combinação de sobras entre etapas/frentes                                   */
/* -------------------------------------------------------------------------- */

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Distância em dias entre duas datas ISO (null quando falta alguma). */
function distanciaEmDias(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round(Math.abs(ta - tb) / MS_POR_DIA);
}

/** Pedidos que ainda podem ter o volume renegociado com a concreteira. */
function pedidoAindaCombinavel(pedido: PedidoConcretagem): boolean {
  return pedido.status === 'planejado' || pedido.status === 'pedido';
}

/**
 * Sugere, para cada pedido abaixo de 5 m³, com quais outros pedidos ele pode
 * ser combinado no mesmo caminhão até atingir o mínimo.
 *
 * Estratégia (determinística, para o teste não depender de ordem de objeto):
 *  1. Só entram parceiros ainda combináveis (planejado/pedido), dentro da
 *     janela de dias e que caibam na capacidade do caminhão.
 *  2. Ordena por proximidade de data, depois por menor volume, depois por id —
 *     assim o menor complemento suficiente é escolhido primeiro e a etapa
 *     vizinha tem prioridade sobre uma frente distante no tempo.
 *  3. Acumula parceiros até atingir os 5 m³ (ou esgotar candidatos).
 *
 * Não decide nada sozinho: devolve sugestão para o usuário confirmar na UI.
 */
export function sugerirCombinacoesDeSobra(
  pedidos: readonly PedidoConcretagem[],
  opcoes: OpcoesCombinacao = {},
): SugestaoCombinacao[] {
  const janelaDias = opcoes.janelaDias ?? 7;
  const capacidade = opcoes.capacidadeCaminhaoM3 ?? CAPACIDADE_CAMINHAO_M3;
  const aceitarSemData = opcoes.aceitarSemData ?? true;

  const deficitarios = pedidos
    .filter((p) => pedidoAindaCombinavel(p) && p.volumeM3 > 0 && abaixoDoMinimo(p.volumeM3))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

  return deficitarios.map((pedido) => {
    const candidatos: ParceiroCombinacao[] = pedidos
      .filter((outro) => outro.id !== pedido.id && pedidoAindaCombinavel(outro) && outro.volumeM3 > 0)
      .map((outro) => ({
        id: outro.id,
        etapa: outro.etapa,
        volumeM3: outro.volumeM3,
        dataPrevista: outro.dataPrevista,
        distanciaDias: distanciaEmDias(pedido.dataPrevista, outro.dataPrevista),
      }))
      .filter((c) => (c.distanciaDias === null ? aceitarSemData : c.distanciaDias <= janelaDias))
      .sort((a, b) => {
        const da = a.distanciaDias ?? Number.MAX_SAFE_INTEGER;
        const db = b.distanciaDias ?? Number.MAX_SAFE_INTEGER;
        if (da !== db) return da - db;
        if (a.volumeM3 !== b.volumeM3) return a.volumeM3 - b.volumeM3;
        return a.id.localeCompare(b.id);
      });

    const parceiros: ParceiroCombinacao[] = [];
    let volumeCombinadoM3 = pedido.volumeM3;

    for (const candidato of candidatos) {
      if (volumeCombinadoM3 >= VOLUME_MINIMO_CONCRETO_M3) break;
      // Um parceiro só entra se a soma ainda couber no caminhão.
      if (duasCasas(volumeCombinadoM3 + candidato.volumeM3) > capacidade) continue;
      parceiros.push(candidato);
      volumeCombinadoM3 = duasCasas(volumeCombinadoM3 + candidato.volumeM3);
    }

    const atingeMinimo = volumeCombinadoM3 >= VOLUME_MINIMO_CONCRETO_M3;
    const rotuloParceiros = parceiros.map((p) => `etapa ${p.etapa} (${p.volumeM3} m³)`).join(' + ');

    return {
      pedidoId: pedido.id,
      etapa: pedido.etapa,
      volumeM3: duasCasas(pedido.volumeM3),
      faltamM3: faltaParaMinimoM3(pedido.volumeM3),
      parceiros,
      volumeCombinadoM3,
      atingeMinimo,
      mensagem: atingeMinimo
        ? `Combine com ${rotuloParceiros} para chegar a ${volumeCombinadoM3} m³ e atingir o mínimo de ${VOLUME_MINIMO_CONCRETO_M3} m³.`
        : parceiros.length > 0
          ? `Mesmo combinando com ${rotuloParceiros} o volume chega apenas a ${volumeCombinadoM3} m³. ` +
            'Busque sobra em outra frente da obra (Novo Mundo, Moreiras ou Santa Cruz) antes de liberar o pedido.'
          : 'Nenhum pedido combinável na janela: busque sobra em outra frente da obra ' +
            '(Novo Mundo, Moreiras ou Santa Cruz) antes de liberar o pedido.',
    };
  });
}

/**
 * Aplica uma sugestão: devolve o pedido consolidado (volume somado, marcado
 * como combinado) e os ids que devem ser absorvidos. Função pura — quem grava
 * no banco é a camada de UI/servidor.
 */
export function consolidarCombinacao(
  pedido: PedidoConcretagem,
  sugestao: SugestaoCombinacao,
): { pedido: PedidoConcretagem; idsAbsorvidos: string[] } {
  if (sugestao.pedidoId !== pedido.id) {
    throw new Error('Sugestão de combinação não corresponde ao pedido informado.');
  }
  return {
    pedido: {
      ...pedido,
      volumeM3: sugestao.volumeCombinadoM3,
      combinadoComSobra: true,
      elementos: [...pedido.elementos],
    },
    idsAbsorvidos: sugestao.parceiros.map((p) => p.id),
  };
}
