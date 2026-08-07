/**
 * REGRA DE NEGÓCIO CRÍTICA — status do pedido de concretagem:
 * planejado → pedido → confirmado → concretado, nessa ordem, sem pular etapa.
 * "concretado" exige data de realização E checklist pré-concretagem completo.
 */

import { describe, expect, it } from 'vitest';
import {
  nivelStatus,
  ORDEM_STATUS,
  proximoStatus,
  transicaoValida,
  TRANSICOES_VALIDAS,
  validarTransicao,
} from '@/lib/concretagem/status';
import { criarChecklistVazio, marcarItem } from '@/lib/concretagem/checklist';
import type { StatusPedidoConcretagem } from '@/types/database';
import { checklistCompletoFixture } from './fixtures';

const TODOS: readonly StatusPedidoConcretagem[] = ['planejado', 'pedido', 'confirmado', 'concretado'];

describe('ordem oficial do fluxo', () => {
  it('é planejado → pedido → confirmado → concretado', () => {
    expect(ORDEM_STATUS).toEqual(['planejado', 'pedido', 'confirmado', 'concretado']);
    expect(nivelStatus('planejado')).toBe(0);
    expect(nivelStatus('concretado')).toBe(3);
  });

  it('cada status tem no máximo um sucessor', () => {
    for (const status of TODOS) {
      expect(TRANSICOES_VALIDAS[status].length).toBeLessThanOrEqual(1);
    }
    expect(proximoStatus('planejado')).toBe('pedido');
    expect(proximoStatus('pedido')).toBe('confirmado');
    expect(proximoStatus('confirmado')).toBe('concretado');
    expect(proximoStatus('concretado')).toBeNull();
  });
});

describe('transicaoValida — matriz completa 4×4', () => {
  const permitidas = new Set(['planejado>pedido', 'pedido>confirmado', 'confirmado>concretado']);

  it.each(TODOS.flatMap((de) => TODOS.map((para) => [de, para] as const)))(
    '%s → %s',
    (de, para) => {
      expect(transicaoValida(de, para)).toBe(permitidas.has(`${de}>${para}`));
    },
  );
});

describe('transições inválidas', () => {
  it('não deixa pular etapa (planejado → confirmado)', () => {
    const resultado = validarTransicao('planejado', 'confirmado');
    expect(resultado.permitida).toBe(false);
    expect(resultado.erros[0].codigo).toBe('PULO_DE_ETAPA');
    expect(resultado.erros[0].mensagem).toMatch(/Pedido feito/);
  });

  it('não deixa pular direto de planejado para concretado', () => {
    const resultado = validarTransicao('planejado', 'concretado', {
      dataRealizada: '2026-09-10',
      checklist: checklistCompletoFixture(),
    });
    expect(resultado.permitida).toBe(false);
    expect(resultado.erros[0].codigo).toBe('PULO_DE_ETAPA');
  });

  it('não deixa pular de pedido para concretado', () => {
    expect(validarTransicao('pedido', 'concretado').erros[0].codigo).toBe('PULO_DE_ETAPA');
  });

  it('não deixa retroceder', () => {
    expect(validarTransicao('confirmado', 'pedido').erros[0].codigo).toBe('RETROCESSO');
    expect(validarTransicao('concretado', 'planejado').erros[0].codigo).toBe('RETROCESSO');
    expect(validarTransicao('pedido', 'planejado').permitida).toBe(false);
  });

  it('não aceita transição para o mesmo status', () => {
    for (const status of TODOS) {
      const resultado = validarTransicao(status, status);
      expect(resultado.permitida).toBe(false);
      expect(resultado.erros[0].codigo).toBe(status === 'concretado' ? 'MESMO_STATUS' : 'MESMO_STATUS');
    }
  });

  it('concretado é status final', () => {
    for (const para of TODOS) {
      expect(validarTransicao('concretado', para).permitida).toBe(false);
    }
  });
});

describe('transição para "pedido" — trava do volume mínimo', () => {
  it('bloqueia pedido de 4,5 m³ sem combinação de sobra', () => {
    const resultado = validarTransicao('planejado', 'pedido', { volumeM3: 4.5, combinadoComSobra: false });
    expect(resultado.permitida).toBe(false);
    expect(resultado.erros[0].codigo).toBe('VOLUME_ABAIXO_MINIMO');
    expect(resultado.erros[0].mensagem).toMatch(/combine com a sobra/i);
  });

  it('permite quando a sobra foi combinada', () => {
    expect(validarTransicao('planejado', 'pedido', { volumeM3: 4.5, combinadoComSobra: true }).permitida).toBe(true);
  });

  it('permite com volume igual ou acima do mínimo', () => {
    expect(validarTransicao('planejado', 'pedido', { volumeM3: 5 }).permitida).toBe(true);
    expect(validarTransicao('planejado', 'pedido', { volumeM3: 23.5 }).permitida).toBe(true);
  });
});

describe('transição para "concretado" — data + checklist', () => {
  it('exige data de realização', () => {
    const resultado = validarTransicao('confirmado', 'concretado', {
      checklist: checklistCompletoFixture(),
    });
    expect(resultado.permitida).toBe(false);
    expect(resultado.erros.map((e) => e.codigo)).toContain('SEM_DATA_REALIZADA');
  });

  it('exige checklist pré-concretagem completo', () => {
    const resultado = validarTransicao('confirmado', 'concretado', {
      dataRealizada: '2026-09-10',
      checklist: criarChecklistVazio(),
    });
    expect(resultado.permitida).toBe(false);
    expect(resultado.erros.map((e) => e.codigo)).toContain('CHECKLIST_INCOMPLETO');
  });

  it('bloqueia com um único item obrigatório pendente', () => {
    const quaseCompleto = { ...checklistCompletoFixture() };
    quaseCompleto.aditivo_cristalizante = { marcado: false };
    const resultado = validarTransicao('confirmado', 'concretado', {
      dataRealizada: '2026-09-10',
      checklist: quaseCompleto,
    });
    expect(resultado.permitida).toBe(false);
    expect(resultado.erros[0].mensagem).toMatch(/cristalizante/i);
  });

  it('bloqueia quando o slump medido está fora da faixa, mesmo com tudo marcado', () => {
    const comSlumpRuim = marcarItem(checklistCompletoFixture(), 'slump', { marcado: true, valor: 85 });
    const resultado = validarTransicao('confirmado', 'concretado', {
      dataRealizada: '2026-09-10',
      checklist: comSlumpRuim,
    });
    expect(resultado.permitida).toBe(false);
    expect(resultado.erros[0].mensagem).toMatch(/rejeitar a carga/i);
  });

  it('sem contexto, não marca concretado às cegas', () => {
    expect(validarTransicao('confirmado', 'concretado').permitida).toBe(false);
  });

  it('permite com data e checklist completos', () => {
    const resultado = validarTransicao('confirmado', 'concretado', {
      dataRealizada: '2026-09-10',
      checklist: checklistCompletoFixture(),
    });
    expect(resultado.permitida).toBe(true);
    expect(resultado.erros).toHaveLength(0);
  });
});

describe('fluxo feliz completo', () => {
  it('percorre os 4 status sem pular nenhum', () => {
    const contexto = { dataRealizada: '2026-09-10', checklist: checklistCompletoFixture(), volumeM3: 23.5 };
    let status: StatusPedidoConcretagem = 'planejado';

    for (const esperado of ['pedido', 'confirmado', 'concretado'] as StatusPedidoConcretagem[]) {
      const proximo = proximoStatus(status);
      expect(proximo).toBe(esperado);
      expect(validarTransicao(status, proximo as StatusPedidoConcretagem, contexto).permitida).toBe(true);
      status = proximo as StatusPedidoConcretagem;
    }
    expect(status).toBe('concretado');
    expect(proximoStatus(status)).toBeNull();
  });
});
