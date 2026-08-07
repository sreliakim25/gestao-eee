/**
 * Testes de lib/calculos/progresso.ts — faixa de progresso da Gestão Visual.
 *
 * Esta é a única regra que decide a cor do SVG e o rótulo da UI: se ela mudar,
 * elemento colorido e card do Painel divergem sem erro de compilação.
 */

import { describe, expect, it } from 'vitest';
import {
  faixaProgresso,
  LIMIAR_CONCLUSAO_PP,
  LIMIAR_INICIO_PP,
  limitarPercentual,
  rotuloFaixaProgresso,
} from '@/lib/calculos';

describe('faixaProgresso', () => {
  it('limiares estão exportados e espelham a view do banco', () => {
    expect(LIMIAR_INICIO_PP).toBe(0);
    expect(LIMIAR_CONCLUSAO_PP).toBe(100);
  });

  it('0% (ou menos) é nao_iniciado', () => {
    expect(faixaProgresso(0)).toBe('nao_iniciado');
    expect(faixaProgresso(-10)).toBe('nao_iniciado');
    expect(faixaProgresso(null)).toBe('nao_iniciado');
    expect(faixaProgresso(undefined)).toBe('nao_iniciado');
    expect(faixaProgresso(Number.NaN)).toBe('nao_iniciado');
  });

  it('qualquer valor entre 0 e 100 (exclusivo) é em_andamento', () => {
    expect(faixaProgresso(0.01)).toBe('em_andamento');
    expect(faixaProgresso(46)).toBe('em_andamento');
    expect(faixaProgresso(99.99)).toBe('em_andamento');
  });

  it('100% (ou mais) é concluido', () => {
    expect(faixaProgresso(100)).toBe('concluido');
    expect(faixaProgresso(120)).toBe('concluido');
  });

  it('tem rótulo em português para a UI', () => {
    expect(rotuloFaixaProgresso('nao_iniciado')).toBe('Não iniciado');
    expect(rotuloFaixaProgresso('em_andamento')).toBe('Em andamento');
    expect(rotuloFaixaProgresso('concluido')).toBe('Concluído');
  });
});

describe('limitarPercentual', () => {
  it('grampeia a faixa 0–100 e trata lixo', () => {
    expect(limitarPercentual(150)).toBe(100);
    expect(limitarPercentual(-3)).toBe(0);
    expect(limitarPercentual(46.5)).toBe(46.5);
    expect(limitarPercentual(null)).toBe(0);
    expect(limitarPercentual(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
