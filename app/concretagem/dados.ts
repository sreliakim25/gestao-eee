import 'server-only';

/**
 * app/concretagem/dados.ts — Carregamento dos dados do módulo de Concretagem.
 *
 * Consome `lib/supabase/server.ts` (entregue pelo `arquiteto-dados`) sem alterá-lo.
 * Quando o projeto Supabase ainda não estiver configurado, a tela cai no plano
 * de execução (`lib/concretagem/plano.ts`) em modo somente leitura, em vez de
 * quebrar — o plano é dado real do .docx, não um mock.
 */

import { createClient } from '@/lib/supabase/server';
import { paraPedidoDominio } from '@/lib/concretagem/mapeamento';
import { sugerirCombinacoesDeSobra, validarPedido } from '@/lib/concretagem/pedido';
import { ETAPAS_PLANO } from '@/lib/concretagem/plano';
import type {
  EtapaPlano,
  PedidoConcretagem,
  SugestaoCombinacao,
  ValidacaoPedido,
} from '@/lib/concretagem/tipos';

export interface PedidoComValidacao {
  pedido: PedidoConcretagem;
  validacao: ValidacaoPedido;
  sugestao: SugestaoCombinacao | null;
}

export interface DadosConcretagem {
  etapas: readonly EtapaPlano[];
  /** Pedidos por etapa (1..4). */
  pedidosPorEtapa: Map<number, PedidoComValidacao[]>;
  /** Mensagem de indisponibilidade do banco, quando houver. */
  erroBanco: string | null;
}

export async function carregarDadosConcretagem(): Promise<DadosConcretagem> {
  const pedidosPorEtapa = new Map<number, PedidoComValidacao[]>();
  for (const etapa of ETAPAS_PLANO) pedidosPorEtapa.set(etapa.etapa, []);

  let erroBanco: string | null = null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('concretagem_pedidos')
      .select('*')
      .order('etapa', { ascending: true })
      .order('data_prevista', { ascending: true, nullsFirst: false });

    if (error) throw new Error(error.message);

    const pedidos = (data ?? []).map(paraPedidoDominio);
    // Sugestões são calculadas sobre TODOS os pedidos: combinar sobra entre
    // etapas/frentes diferentes é justamente o objetivo da regra dos 5 m³.
    const sugestoes = sugerirCombinacoesDeSobra(pedidos);
    const sugestaoPorPedido = new Map(sugestoes.map((s) => [s.pedidoId, s]));

    for (const pedido of pedidos) {
      const lista = pedidosPorEtapa.get(pedido.etapa) ?? [];
      lista.push({
        pedido,
        validacao: validarPedido(pedido),
        sugestao: sugestaoPorPedido.get(pedido.id) ?? null,
      });
      pedidosPorEtapa.set(pedido.etapa, lista);
    }
  } catch (erro) {
    erroBanco = erro instanceof Error ? erro.message : 'Falha desconhecida ao consultar o banco.';
  }

  return { etapas: ETAPAS_PLANO, pedidosPorEtapa, erroBanco };
}
