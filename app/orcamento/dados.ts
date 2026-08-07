import 'server-only';

/**
 * app/orcamento/dados.ts — Carregamento do orçado x medido do terceirizado.
 *
 * Lê a view `orcamento_resumo_categoria` (que já separa mão de obra de compra
 * direta) e os itens de compra direta, para listar o concreto explicitamente.
 * Não altera nada em `lib/supabase/`.
 */

import { createClient } from '@/lib/supabase/server';
import type { OrcamentoItem, OrcamentoResumoCategoria } from '@/types/database';
import { montarResumoCategorias, totalizarOrcamento, type ResumoCategoriaUI, type TotaisOrcamento } from './agregacao';

export interface DadosOrcamento {
  resumos: ResumoCategoriaUI[];
  totais: TotaisOrcamento;
  /** Itens marcados como compra direta (o concreto), para a seção dedicada. */
  itensCompraDireta: OrcamentoItem[];
  erroBanco: string | null;
}

export async function carregarDadosOrcamento(): Promise<DadosOrcamento> {
  let linhas: OrcamentoResumoCategoria[] = [];
  let itensCompraDireta: OrcamentoItem[] = [];
  let erroBanco: string | null = null;

  try {
    const supabase = await createClient();

    const { data: resumo, error: erroResumo } = await supabase
      .from('orcamento_resumo_categoria')
      .select('*');
    if (erroResumo) throw new Error(erroResumo.message);
    linhas = resumo ?? [];

    const { data: itens, error: erroItens } = await supabase
      .from('orcamento_itens')
      .select('*')
      .eq('eh_compra_direta', true)
      .order('item_codigo', { ascending: true });
    if (erroItens) throw new Error(erroItens.message);
    itensCompraDireta = itens ?? [];
  } catch (erro) {
    erroBanco = erro instanceof Error ? erro.message : 'Falha desconhecida ao consultar o banco.';
  }

  const resumos = montarResumoCategorias(linhas);
  return { resumos, totais: totalizarOrcamento(resumos), itensCompraDireta, erroBanco };
}
