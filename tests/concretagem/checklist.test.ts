/**
 * Checklist técnico pré-concretagem (seção 3 do Plano_Execucao_Concretagem_EEE.docx).
 * Um pedido só pode ser marcado "concretado" com o checklist completo.
 */

import { describe, expect, it } from 'vitest';
import {
  AGREGADO_GRAUDO_MAXIMO_MM,
  avaliarChecklist,
  buscarItemChecklist,
  checklistCompleto,
  cobrimentoAtende,
  COBRIMENTO_NOMINAL_MINIMO_CM,
  conferirValorMedido,
  criarChecklistVazio,
  CURA_MINIMA_DIAS,
  DESFORMA_MINIMA_DIAS,
  FAIXA_SLUMP_MM,
  ITENS_CHECKLIST,
  ITENS_OBRIGATORIOS,
  lerChecklist,
  marcarItem,
  serializarChecklist,
  slumpDentroDaFaixa,
  SLUMP_ALVO_MM,
  SLUMP_TOLERANCIA_MM,
} from '@/lib/concretagem/checklist';
import { paraPedidoDominio, paraPedidoInsert } from '@/lib/concretagem/mapeamento';
import type { ConcretagemPedido } from '@/types/database';
import { checklistCompletoFixture, pedidoFixture } from './fixtures';

describe('parâmetros técnicos do plano', () => {
  it('slump 60 mm ± 10 mm', () => {
    expect(SLUMP_ALVO_MM).toBe(60);
    expect(SLUMP_TOLERANCIA_MM).toBe(10);
    expect(FAIXA_SLUMP_MM).toEqual({ minimo: 50, maximo: 70 });
  });

  it('cobrimento nominal ≥ 5 cm (CAA IV), agregado ≤ 25 mm, cura 7 dias, desforma 14 dias', () => {
    expect(COBRIMENTO_NOMINAL_MINIMO_CM).toBe(5);
    expect(AGREGADO_GRAUDO_MAXIMO_MM).toBe(25);
    expect(CURA_MINIMA_DIAS).toBe(7);
    expect(DESFORMA_MINIMA_DIAS).toBe(14);
  });
});

describe('itens do checklist', () => {
  it('são 8 itens tipados, 7 obrigatórios e 1 condicional', () => {
    expect(ITENS_CHECKLIST).toHaveLength(8);
    expect(ITENS_OBRIGATORIOS).toHaveLength(7);
    expect(ITENS_CHECKLIST.find((i) => !i.obrigatorio)?.id).toBe('furos_recompostos');
  });

  it('cobre os 8 pontos da seção 3 do plano', () => {
    expect(ITENS_CHECKLIST.map((i) => i.id)).toEqual([
      'slump',
      'cobrimento',
      'forma_travada',
      'aditivo_cristalizante',
      'agregado_graudo',
      'cura_7_dias',
      'desforma_14_dias',
      'furos_recompostos',
    ]);
  });

  it('cita a NBR 14931:2023 na forma travada e na desforma', () => {
    expect(buscarItemChecklist('forma_travada').referencia).toMatch(/NBR 14931/);
    expect(buscarItemChecklist('desforma_14_dias').referencia).toMatch(/NBR 14931/);
  });

  it('rejeita id inexistente', () => {
    // @ts-expect-error id fora do union, de propósito
    expect(() => buscarItemChecklist('inventado')).toThrow();
  });
});

describe('valores medidos em campo', () => {
  it.each([
    [50, true],
    [60, true],
    [70, true],
    [49, false],
    [71, false],
  ])('slump de %s mm → dentro da faixa = %s', (mm, esperado) => {
    expect(slumpDentroDaFaixa(mm)).toBe(esperado);
  });

  it('slump fora da faixa manda rejeitar a carga', () => {
    expect(conferirValorMedido('slump', 85)).toMatch(/rejeitar a carga/i);
    expect(conferirValorMedido('slump', 60)).toBeNull();
  });

  it('cobrimento abaixo de 5 cm reprova (CAA IV)', () => {
    expect(cobrimentoAtende(4.9)).toBe(false);
    expect(cobrimentoAtende(5)).toBe(true);
    expect(conferirValorMedido('cobrimento', 3)).toMatch(/CAA IV/);
  });

  it('cura abaixo de 7 dias e desforma antes de 14 dias reprovam', () => {
    expect(conferirValorMedido('cura_7_dias', 5)).toMatch(/7 dias/);
    expect(conferirValorMedido('desforma_14_dias', 10)).toMatch(/14 dias/);
    expect(conferirValorMedido('desforma_14_dias', 14)).toBeNull();
  });

  it('agregado graúdo acima de 25 mm reprova', () => {
    expect(conferirValorMedido('agregado_graudo', 32)).toMatch(/25 mm/);
    expect(conferirValorMedido('agregado_graudo', 19)).toBeNull();
  });
});

describe('avaliarChecklist', () => {
  it('checklist vazio: incompleto, 0% e 7 pendências', () => {
    const avaliacao = avaliarChecklist(criarChecklistVazio());
    expect(avaliacao.completo).toBe(false);
    expect(avaliacao.percentual).toBe(0);
    expect(avaliacao.pendentes).toHaveLength(7);
  });

  it('checklist com todos os obrigatórios marcados fica completo', () => {
    const avaliacao = avaliarChecklist(checklistCompletoFixture());
    expect(avaliacao.completo).toBe(true);
    expect(avaliacao.percentual).toBe(100);
    expect(avaliacao.marcadosObrigatorios).toBe(7);
  });

  it('o item condicional não trava a conclusão', () => {
    const estado = checklistCompletoFixture();
    expect(estado.furos_recompostos?.marcado).toBeFalsy();
    expect(checklistCompleto(estado)).toBe(true);
  });

  it('valor medido fora de faixa derruba o "completo" mesmo com tudo marcado', () => {
    const comCobrimentoRuim = marcarItem(checklistCompletoFixture(), 'cobrimento', { marcado: true, valor: 3 });
    const avaliacao = avaliarChecklist(comCobrimentoRuim);
    expect(avaliacao.completo).toBe(false);
    expect(avaliacao.pendentes).toHaveLength(0);
    expect(avaliacao.foraDeFaixa).toHaveLength(1);
  });

  it('percentual reflete o avanço parcial', () => {
    let estado = criarChecklistVazio();
    estado = marcarItem(estado, 'slump', { marcado: true, valor: 60 });
    estado = marcarItem(estado, 'cobrimento', { marcado: true, valor: 5 });
    expect(avaliarChecklist(estado).percentual).toBe(29); // 2/7
  });
});

describe('serialização do checklist_json', () => {
  it('ida e volta preserva marcações e valores', () => {
    const estado = checklistCompletoFixture();
    expect(lerChecklist(serializarChecklist(estado))).toEqual(estado);
  });

  it('jsonb vazio ou inválido vira checklist zerado, sem quebrar', () => {
    expect(checklistCompleto(lerChecklist(null))).toBe(false);
    expect(checklistCompleto(lerChecklist({}))).toBe(false);
    expect(checklistCompleto(lerChecklist([1, 2, 3]))).toBe(false);
    expect(checklistCompleto(lerChecklist('texto'))).toBe(false);
  });

  it('aceita o formato legado de booleano puro', () => {
    const estado = lerChecklist({ slump: true, cobrimento: false });
    expect(estado.slump?.marcado).toBe(true);
    expect(estado.cobrimento?.marcado).toBe(false);
  });

  it('ignora chave desconhecida sem quebrar', () => {
    expect(() => lerChecklist({ chave_inventada: { marcado: true } })).not.toThrow();
  });
});

describe('mapeamento Row ↔ domínio', () => {
  it('converte a Row do banco preservando as regras', () => {
    const linha: ConcretagemPedido = {
      id: 'p1',
      projeto_id: '00000000-0000-4000-8000-000000000099',
      etapa: 3,
      elementos: ['Par 4', 'Par 5'],
      elemento_visual_id: null,
      volume_m3: 31.5,
      num_caminhoes: 3,
      data_prevista: '2026-09-05',
      data_realizada: null,
      status: 'confirmado',
      checklist_json: serializarChecklist(checklistCompletoFixture()),
      nota_fiscal_ref: 'NF-1234',
      combinado_com_sobra: false,
      observacoes: null,
      criado_em: '2026-08-05T00:00:00Z',
      atualizado_em: '2026-08-05T00:00:00Z',
    };

    const pedido = paraPedidoDominio(linha);
    expect(pedido.etapa).toBe(3);
    expect(pedido.volumeM3).toBe(31.5);
    expect(checklistCompleto(pedido.checklist)).toBe(true);
  });

  it('o payload de escrita reflete o domínio', () => {
    const insert = paraPedidoInsert(
      pedidoFixture({ volumeM3: 4.5, combinadoComSobra: true }),
      '00000000-0000-4000-8000-000000000099',
    );
    expect(insert.projeto_id).toBe('00000000-0000-4000-8000-000000000099');
    expect(insert.volume_m3).toBe(4.5);
    expect(insert.combinado_com_sobra).toBe(true);
    expect(insert.status).toBe('planejado');
  });
});
