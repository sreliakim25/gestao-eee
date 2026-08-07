/**
 * Testes de lib/calculos/prazo.ts — linha de base planejada e status de prazo.
 *
 * Cobre a progressão linear entre as datas planejadas, a ponderação por duração
 * e o limiar de tolerância de ±2 p.p. (constante TOLERANCIA_STATUS_PRAZO_PP).
 */

import { describe, expect, it } from 'vitest';
import {
  classificarDesvioPrazo,
  percentualPlanejadoAcumulado,
  percentualPlanejadoAtividade,
  statusPrazo,
  statusPrazoPorSeries,
  TOLERANCIA_STATUS_PRAZO_PP,
} from '@/lib/calculos';
import { criarAtividade, criarCarteiraEEE, DATA_REFERENCIA, GRUPOS } from './fixtures';

/** Atividade de referência: 10 dias corridos, de 01/06 a 10/06 (inclusivo). */
const atividadeDezDias = criarAtividade({
  id: 'base',
  duracao_dias: 10,
  data_inicio_planejada: '2026-06-01',
  data_fim_planejada: '2026-06-10',
});

describe('percentualPlanejadoAtividade — progressão linear', () => {
  it('0% antes do início', () => {
    expect(percentualPlanejadoAtividade(atividadeDezDias, '2026-05-31')).toBe(0);
  });

  it('conta o dia de início como dia trabalhado (contagem inclusiva)', () => {
    expect(percentualPlanejadoAtividade(atividadeDezDias, '2026-06-01')).toBe(10);
    expect(percentualPlanejadoAtividade(atividadeDezDias, '2026-06-05')).toBe(50);
    expect(percentualPlanejadoAtividade(atividadeDezDias, '2026-06-09')).toBe(90);
  });

  it('100% no dia do fim e depois dele', () => {
    expect(percentualPlanejadoAtividade(atividadeDezDias, '2026-06-10')).toBe(100);
    expect(percentualPlanejadoAtividade(atividadeDezDias, '2026-12-31')).toBe(100);
  });

  it('atividade de um dia vira 100% a partir do início (sem divisão por zero)', () => {
    const marco = criarAtividade({
      id: 'marco',
      duracao_dias: 1,
      data_inicio_planejada: '2026-06-01',
      data_fim_planejada: '2026-06-01',
    });
    expect(percentualPlanejadoAtividade(marco, '2026-05-31')).toBe(0);
    expect(percentualPlanejadoAtividade(marco, '2026-06-01')).toBe(100);
  });

  it('datas invertidas não geram percentual negativo', () => {
    const invertida = criarAtividade({
      id: 'invertida',
      data_inicio_planejada: '2026-06-10',
      data_fim_planejada: '2026-06-01',
    });
    expect(percentualPlanejadoAtividade(invertida, '2026-06-15')).toBe(100);
    expect(percentualPlanejadoAtividade(invertida, '2026-06-05')).toBe(0);
  });

  it('atividade sem datas devolve null (fica fora da linha de base)', () => {
    expect(percentualPlanejadoAtividade(criarAtividade({ id: 'x' }), '2026-06-05')).toBeNull();
    expect(
      percentualPlanejadoAtividade(
        criarAtividade({ id: 'y', data_inicio_planejada: '2026-06-01' }),
        '2026-06-05',
      ),
    ).toBeNull();
  });
});

describe('percentualPlanejadoAcumulado — ponderado por duração', () => {
  it('pondera pelas durações, não pela quantidade de atividades', () => {
    const atividades = [
      criarAtividade({
        id: 'longa',
        duracao_dias: 30,
        data_inicio_planejada: '2026-06-01',
        data_fim_planejada: '2026-06-30',
      }),
      criarAtividade({
        id: 'curta',
        duracao_dias: 10,
        data_inicio_planejada: '2026-07-01',
        data_fim_planejada: '2026-07-10',
      }),
    ];
    // Em 30/06: longa 100%, curta 0% → 30*100 / 40 = 75.
    const linha = percentualPlanejadoAcumulado(atividades, '2026-06-30');
    expect(linha.percentual).toBe(75);
    expect(linha.pesoTotal).toBe(40);
    expect(linha.totalAtividades).toBe(2);
    expect(linha.atividadesSemDatas).toBe(0);
  });

  it('reporta (e exclui) atividades sem datas em vez de silenciá-las', () => {
    const linha = percentualPlanejadoAcumulado(
      [atividadeDezDias, criarAtividade({ id: 'orfa', duracao_dias: 90 })],
      '2026-06-10',
    );
    expect(linha.percentual).toBe(100); // a órfã não derruba a linha de base
    expect(linha.atividadesSemDatas).toBe(1);
    expect(linha.totalAtividades).toBe(1);
  });

  it('lista vazia devolve 0 sem dividir por zero', () => {
    expect(percentualPlanejadoAcumulado([], '2026-06-10').percentual).toBe(0);
  });

  it('aceita filtro por frente/grupo macro', () => {
    const carteira = criarCarteiraEEE();
    const soCivil = percentualPlanejadoAcumulado(carteira, DATA_REFERENCIA, {
      filtros: { gruposMacroIds: [GRUPOS.civil] },
    });
    expect(soCivil.percentual).toBe(0); // Civil só começa em 01/09/2026
    const soTerraplenagem = percentualPlanejadoAcumulado(carteira, DATA_REFERENCIA, {
      filtros: { gruposMacroIds: [GRUPOS.terraplenagem] },
    });
    expect(soTerraplenagem.percentual).toBe(100); // terminou em 12/06/2026
  });
});

describe('statusPrazo — limiar de tolerância', () => {
  /** Monta duas atividades de 10 dias com o realizado informado. */
  const cenario = (realizado: number) => [
    criarAtividade({
      id: 'a',
      duracao_dias: 10,
      data_inicio_planejada: '2026-06-01',
      data_fim_planejada: '2026-06-10',
      percentual_concluido: realizado,
    }),
    criarAtividade({
      id: 'b',
      duracao_dias: 10,
      data_inicio_planejada: '2026-06-01',
      data_fim_planejada: '2026-06-10',
      percentual_concluido: realizado,
    }),
  ];

  it('a tolerância padrão é ±2 p.p. e está exportada', () => {
    expect(TOLERANCIA_STATUS_PRAZO_PP).toBe(2);
  });

  it('desvio dentro de ±2 p.p. é "no prazo"', () => {
    // Em 05/06 o planejado é 50%.
    expect(statusPrazo(cenario(50), '2026-06-05').status).toBe('no_prazo');
    expect(statusPrazo(cenario(52), '2026-06-05').status).toBe('no_prazo'); // exatamente +2
    expect(statusPrazo(cenario(48), '2026-06-05').status).toBe('no_prazo'); // exatamente -2
  });

  it('acima da tolerância é adiantado; abaixo é atrasado', () => {
    const adiantado = statusPrazo(cenario(60), '2026-06-05');
    expect(adiantado.status).toBe('adiantado');
    expect(adiantado.percentualPlanejado).toBe(50);
    expect(adiantado.percentualRealizado).toBe(60);
    expect(adiantado.desvioPontosPercentuais).toBe(10);
    expect(adiantado.toleranciaPontosPercentuais).toBe(2);

    expect(statusPrazo(cenario(47), '2026-06-05').status).toBe('atrasado');
    expect(statusPrazo(cenario(53), '2026-06-05').status).toBe('adiantado');
  });

  it('permite sobrescrever a tolerância', () => {
    expect(
      statusPrazo(cenario(45), '2026-06-05', { toleranciaPontosPercentuais: 10 }).status,
    ).toBe('no_prazo');
  });

  it('lista vazia é "no prazo" com tudo zerado (não quebra o Painel)', () => {
    const avaliacao = statusPrazo([], '2026-06-05');
    expect(avaliacao.status).toBe('no_prazo');
    expect(avaliacao.percentualPlanejado).toBe(0);
    expect(avaliacao.percentualRealizado).toBe(0);
  });

  it('REGRESSÃO 05/08/2026: 6% realizado x 18,3% planejado → atrasado', () => {
    const avaliacao = statusPrazo(criarCarteiraEEE(), DATA_REFERENCIA);
    expect(avaliacao.percentualRealizado).toBe(6);
    expect(avaliacao.percentualPlanejado).toBe(18.3);
    expect(avaliacao.desvioPontosPercentuais).toBe(-12.3);
    expect(avaliacao.status).toBe('atrasado');
    expect(avaliacao.atividadesSemDatas).toBe(0);
  });
});

describe('classificarDesvioPrazo', () => {
  it('classifica nas três faixas e trata valores não finitos', () => {
    expect(classificarDesvioPrazo(0)).toBe('no_prazo');
    expect(classificarDesvioPrazo(2)).toBe('no_prazo');
    expect(classificarDesvioPrazo(2.01)).toBe('adiantado');
    expect(classificarDesvioPrazo(-2)).toBe('no_prazo');
    expect(classificarDesvioPrazo(-2.01)).toBe('atrasado');
    expect(classificarDesvioPrazo(Number.NaN)).toBe('no_prazo');
  });
});

describe('statusPrazoPorSeries — comparação a partir da Curva S já montada', () => {
  const planejada = [
    { semana: '2026-06-01', valor: 20 },
    { semana: '2026-06-08', valor: 50 },
    { semana: '2026-06-15', valor: 80 },
  ];

  it('usa o último ponto até a data de referência, ignorando o futuro', () => {
    const avaliacao = statusPrazoPorSeries(
      '2026-06-10',
      planejada,
      [
        { semana: '2026-06-01', valor: 15 },
        { semana: '2026-06-08', valor: 40 },
        { semana: '2026-06-15', valor: 95 },
      ],
    );
    expect(avaliacao.percentualPlanejado).toBe(50);
    expect(avaliacao.percentualRealizado).toBe(40);
    expect(avaliacao.status).toBe('atrasado');
  });

  it('série realizada vazia ou só com null vira 0', () => {
    const avaliacao = statusPrazoPorSeries('2026-06-10', planejada, [
      { semana: '2026-06-01', valor: null },
    ]);
    expect(avaliacao.percentualRealizado).toBe(0);
    expect(avaliacao.status).toBe('atrasado');
    expect(statusPrazoPorSeries('2026-06-10', [], []).status).toBe('no_prazo');
  });
});
