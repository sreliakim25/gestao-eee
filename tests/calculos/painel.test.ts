/**
 * Testes de lib/calculos/painel.ts — composição dos indicadores de topo.
 *
 * Este teste é o "contrato" do Painel: se ele passar, a UI só precisa exibir os
 * números, sem recalcular nada (regra do CLAUDE.md: nada de cálculo ad-hoc em
 * componente).
 */

import { describe, expect, it } from 'vitest';
import { montarIndicadoresPainel, percentualEvolucaoGeral, statusPrazo } from '@/lib/calculos';
import {
  criarCarteiraEEE,
  DATA_FIM_PROJETO,
  DATA_REFERENCIA,
  ELEMENTOS,
  GRUPOS,
} from './fixtures';

describe('montarIndicadoresPainel — snapshot de 05/08/2026', () => {
  const painel = montarIndicadoresPainel({
    atividades: criarCarteiraEEE(),
    dataReferencia: DATA_REFERENCIA,
    dataFimPlanejada: DATA_FIM_PROJETO,
  });

  it('REGRESSÃO: 6% geral, atrasado, 25 semanas restantes, 34 de 317 críticas', () => {
    expect(painel.percentualEvolucaoGeral).toBe(6);
    expect(painel.faixaProgressoGeral).toBe('em_andamento');
    expect(painel.prazo.status).toBe('atrasado');
    expect(painel.semanasRestantes).toBe(25);
    expect(painel.resumo.total).toBe(317);
    expect(painel.resumo.criticas).toBe(34);
  });

  it('traz os cards por frente já calculados', () => {
    expect(painel.porGrupoMacro[GRUPOS.preliminares].percentual).toBe(100);
    expect(painel.porGrupoMacro[GRUPOS.terraplenagem].percentual).toBe(46);
    expect(Object.keys(painel.porGrupoMacro)).toHaveLength(7);
  });

  it('traz o mapa de elementos visuais para o SVG', () => {
    expect(painel.porElementoVisual[ELEMENTOS.pocoUmido].faixa).toBe('nao_iniciado');
    expect(Object.keys(painel.porElementoVisual)).toHaveLength(4);
  });

  it('não diverge das funções individuais (fonte única de verdade)', () => {
    const carteira = criarCarteiraEEE();
    expect(painel.percentualEvolucaoGeral).toBe(percentualEvolucaoGeral(carteira));
    expect(painel.prazo).toEqual(statusPrazo(carteira, DATA_REFERENCIA));
  });

  it('respeita filtros e não quebra com carteira vazia', () => {
    const soCriticas = montarIndicadoresPainel({
      atividades: criarCarteiraEEE(),
      dataReferencia: DATA_REFERENCIA,
      dataFimPlanejada: DATA_FIM_PROJETO,
      filtros: { apenasCaminhoCritico: true },
    });
    expect(soCriticas.resumo.total).toBe(34);

    const vazio = montarIndicadoresPainel({
      atividades: [],
      dataReferencia: DATA_REFERENCIA,
      dataFimPlanejada: null,
    });
    expect(vazio.percentualEvolucaoGeral).toBe(0);
    expect(vazio.semanasRestantes).toBe(0);
    expect(vazio.prazo.status).toBe('no_prazo');
    expect(vazio.porGrupoMacro).toEqual({});
  });
});
