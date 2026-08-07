/**
 * app/orcamento/categorias.ts — As 7 categorias da aba ORÇAMENTO.
 *
 * Módulo puro (sem dependência de React, Supabase ou Node): é a fonte única de
 * rótulo e ordem, usada tanto pela tela quanto por `scripts/import-orcamento.ts`.
 *
 * São as 6 categorias do quantitativo do terceirizado mais "Itens Omissos",
 * na mesma ordem da planilha e do enum `categoria_orcamento` do banco.
 */

import type { CategoriaOrcamento } from '@/types/database';

export const ORDEM_CATEGORIAS: readonly CategoriaOrcamento[] = [
  'servicos_preliminares',
  'estacao_elevatoria',
  'caixa_tanque_pneumatico',
  'casa_comando',
  'muro_externo',
  'sistema_diversos',
  'itens_omissos',
];

export const ROTULO_CATEGORIA: Readonly<Record<CategoriaOrcamento, string>> = {
  servicos_preliminares: 'Serviços Preliminares',
  estacao_elevatoria: 'Estação Elevatória de Esgoto',
  caixa_tanque_pneumatico: 'Caixa do Tanque Pneumático',
  casa_comando: 'Casa de Comando',
  muro_externo: 'Muro Externo',
  sistema_diversos: 'Sistema Diversos',
  itens_omissos: 'Itens Omissos',
};

/** Categoria pela raiz do código do item ("2.2.1" → estacao_elevatoria). */
export const CATEGORIA_POR_RAIZ: Readonly<Record<string, CategoriaOrcamento>> = {
  '1': 'servicos_preliminares',
  '2': 'estacao_elevatoria',
  '3': 'caixa_tanque_pneumatico',
  '4': 'casa_comando',
  '5': 'muro_externo',
  '6': 'sistema_diversos',
  '7': 'itens_omissos',
};
