/**
 * REGRA DE NEGÓCIO CRÍTICA (CLAUDE.md, item 2):
 *   Concreto é COMPRA DIRETA da contratada, faturada pela contratante — nunca
 *   soma ao valor de mão de obra do contrato do terceirizado.
 *
 * Este arquivo trava a agregação da tela `/orcamento` (app/orcamento/agregacao.ts).
 */

import { describe, expect, it } from 'vitest';
import {
  montarResumoCategorias,
  saldoContrato,
  totalizarOrcamento,
} from '@/app/orcamento/agregacao';
import { ORDEM_CATEGORIAS, ROTULO_CATEGORIA } from '@/app/orcamento/categorias';
import type { OrcamentoResumoCategoria } from '@/types/database';

/** Id fictício: só para satisfazer o tipo da view (`projeto_id` é coluna real desde a migration multi-dispositivo). */
const PROJETO_ID_TESTE = '00000000-0000-4000-8000-000000000099';

/** Linhas da view `orcamento_resumo_categoria` com os valores reais do import. */
const VIEW_REAL: OrcamentoResumoCategoria[] = [
  {
    categoria: 'servicos_preliminares',
    total_itens: 4,
    valor_mao_de_obra: 52983,
    valor_medido_mao_de_obra: 52983,
    valor_compra_direta: 0,
    valor_medido_compra_direta: 0,
    projeto_id: PROJETO_ID_TESTE,
  },
  {
    categoria: 'estacao_elevatoria',
    total_itens: 88,
    valor_mao_de_obra: 309509.48,
    valor_medido_mao_de_obra: 0,
    valor_compra_direta: 76446,
    valor_medido_compra_direta: 0,
    projeto_id: PROJETO_ID_TESTE,
  },
  {
    categoria: 'caixa_tanque_pneumatico',
    total_itens: 26,
    valor_mao_de_obra: 19177.4,
    valor_medido_mao_de_obra: 0,
    valor_compra_direta: 3298,
    valor_medido_compra_direta: 0,
    projeto_id: PROJETO_ID_TESTE,
  },
  {
    categoria: 'casa_comando',
    total_itens: 62,
    valor_mao_de_obra: 84029.36,
    valor_medido_mao_de_obra: 0,
    valor_compra_direta: 10500.29,
    valor_medido_compra_direta: 0,
    projeto_id: PROJETO_ID_TESTE,
  },
  {
    categoria: 'muro_externo',
    total_itens: 17,
    valor_mao_de_obra: 132401.12,
    valor_medido_mao_de_obra: 0,
    valor_compra_direta: 14624.25,
    valor_medido_compra_direta: 0,
    projeto_id: PROJETO_ID_TESTE,
  },
  {
    categoria: 'sistema_diversos',
    total_itens: 8,
    valor_mao_de_obra: 33955.35,
    valor_medido_mao_de_obra: 0,
    valor_compra_direta: 0,
    valor_medido_compra_direta: 0,
    projeto_id: PROJETO_ID_TESTE,
  },
];

describe('as 7 categorias do quantitativo', () => {
  it('sempre aparecem, na ordem da planilha, mesmo sem item lançado', () => {
    const resumos = montarResumoCategorias([]);
    expect(resumos.map((r) => r.categoria)).toEqual(ORDEM_CATEGORIAS);
    expect(resumos).toHaveLength(7);
  });

  it('são as 6 do terceirizado + Itens Omissos, com os rótulos da planilha', () => {
    expect(ORDEM_CATEGORIAS.map((c) => ROTULO_CATEGORIA[c])).toEqual([
      'Serviços Preliminares',
      'Estação Elevatória de Esgoto',
      'Caixa do Tanque Pneumático',
      'Casa de Comando',
      'Muro Externo',
      'Sistema Diversos',
      'Itens Omissos',
    ]);
  });

  it('categoria ausente na view entra zerada, sem NaN', () => {
    const omissos = montarResumoCategorias(VIEW_REAL).find((r) => r.categoria === 'itens_omissos');
    expect(omissos).toMatchObject({
      maoDeObraOrcado: 0,
      maoDeObraMedido: 0,
      maoDeObraPercentual: 0,
      compraDiretaOrcado: 0,
      totalItens: 0,
    });
  });
});

describe('separação concreto x mão de obra', () => {
  it('mantém as duas grandezas em campos distintos por categoria', () => {
    const elevatoria = montarResumoCategorias(VIEW_REAL).find((r) => r.categoria === 'estacao_elevatoria');
    expect(elevatoria?.maoDeObraOrcado).toBe(309509.48);
    expect(elevatoria?.compraDiretaOrcado).toBe(76446);
    // O valor de mão de obra NÃO absorve o concreto.
    expect(elevatoria?.maoDeObraOrcado).not.toBe(309509.48 + 76446);
  });

  it('o valor do CONTRATO do terceirizado soma apenas a mão de obra', () => {
    const totais = totalizarOrcamento(montarResumoCategorias(VIEW_REAL));

    expect(totais.contratoMaoDeObraOrcado).toBe(632055.71);
    expect(totais.compraDiretaOrcado).toBe(104868.54);
    expect(totais.totalPlanilha).toBe(736924.25);

    // A regra em uma linha: contrato ≠ total, e a diferença é exatamente o concreto.
    expect(totais.contratoMaoDeObraOrcado).not.toBe(totais.totalPlanilha);
    expect(totais.totalPlanilha - totais.contratoMaoDeObraOrcado).toBeCloseTo(totais.compraDiretaOrcado, 2);
  });

  it('medir concreto NÃO altera o percentual medido da mão de obra', () => {
    const semMedicaoDeConcreto = totalizarOrcamento(montarResumoCategorias(VIEW_REAL));

    const comConcretoTodoMedido = totalizarOrcamento(
      montarResumoCategorias(
        VIEW_REAL.map((linha) => ({
          ...linha,
          valor_medido_compra_direta: linha.valor_compra_direta,
        })),
      ),
    );

    expect(comConcretoTodoMedido.contratoMaoDeObraMedido).toBe(semMedicaoDeConcreto.contratoMaoDeObraMedido);
    expect(comConcretoTodoMedido.contratoMaoDeObraPercentual).toBe(
      semMedicaoDeConcreto.contratoMaoDeObraPercentual,
    );
    expect(comConcretoTodoMedido.compraDiretaPercentual).toBe(100);
  });

  it('percentual de cada coluna é calculado contra a sua própria base', () => {
    const [resumo] = montarResumoCategorias([
      {
        categoria: 'casa_comando',
        total_itens: 2,
        valor_mao_de_obra: 1000,
        valor_medido_mao_de_obra: 250,
        valor_compra_direta: 500,
        valor_medido_compra_direta: 500,
        projeto_id: PROJETO_ID_TESTE,
      },
    ]).filter((r) => r.categoria === 'casa_comando');

    expect(resumo.maoDeObraPercentual).toBe(25);
    expect(resumo.compraDiretaPercentual).toBe(100);
  });

  it('não divide por zero quando a categoria não tem orçado', () => {
    const totais = totalizarOrcamento(montarResumoCategorias([]));
    expect(totais.contratoMaoDeObraPercentual).toBe(0);
    expect(totais.compraDiretaPercentual).toBe(0);
    expect(Number.isNaN(totais.contratoMaoDeObraPercentual)).toBe(false);
  });
});

describe('saldo do contrato', () => {
  it('é calculado só sobre a mão de obra', () => {
    const totais = totalizarOrcamento(
      montarResumoCategorias([
        {
          categoria: 'muro_externo',
          total_itens: 3,
          valor_mao_de_obra: 100000,
          valor_medido_mao_de_obra: 40000,
          valor_compra_direta: 20000,
          valor_medido_compra_direta: 20000,
          projeto_id: PROJETO_ID_TESTE,
        },
      ]),
    );
    expect(saldoContrato(totais)).toBe(60000);
    expect(totais.contratoMaoDeObraPercentual).toBe(40);
  });
});
