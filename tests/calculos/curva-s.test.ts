/**
 * Testes de lib/calculos/curva-s.ts — agregação planejado x realizado.
 *
 * Convenções verificadas aqui:
 *  - toda chave de semana é uma SEGUNDA-FEIRA (igual à constraint do banco);
 *  - o ponto da semana é medido no DOMINGO que a fecha;
 *  - o realizado tem carry-forward e para no último lançamento (não extrapola).
 */

import { describe, expect, it } from 'vitest';
import {
  agregarCurvaS,
  chaveSemana,
  pontoDaSemana,
  seriesCurvaS,
  paraDataUTC,
} from '@/lib/calculos';
import { criarAtividade, criarAvanco, criarCarteiraEEE, ELEMENTOS, GRUPOS } from './fixtures';

/** Duas atividades encadeadas, ambas com 14 dias (2 semanas cheias). */
const atividadeA = criarAtividade({
  id: 'A',
  grupo_macro_id: GRUPOS.terraplenagem,
  duracao_dias: 14,
  data_inicio_planejada: '2026-06-01', // segunda-feira
  data_fim_planejada: '2026-06-14',
  percentual_concluido: 100,
});

const atividadeB = criarAtividade({
  id: 'B',
  grupo_macro_id: GRUPOS.civil,
  elemento_visual_id: ELEMENTOS.pocoUmido,
  duracao_dias: 14,
  data_inicio_planejada: '2026-06-08',
  data_fim_planejada: '2026-06-21',
  percentual_concluido: 20,
});

const avancos = [
  criarAvanco({ atividade_id: 'A', semana_referencia: '2026-06-01', percentual_realizado_acumulado: 40 }),
  criarAvanco({ atividade_id: 'A', semana_referencia: '2026-06-08', percentual_realizado_acumulado: 100 }),
  criarAvanco({ atividade_id: 'B', semana_referencia: '2026-06-08', percentual_realizado_acumulado: 20 }),
];

describe('agregarCurvaS — grade semanal', () => {
  const curva = agregarCurvaS([atividadeA, atividadeB], avancos, {
    dataReferencia: '2026-06-10',
  });

  it('gera uma linha por semana ISO, sempre com chave na segunda-feira', () => {
    expect(curva.pontos.map((p) => p.semana)).toEqual([
      '2026-06-01',
      '2026-06-08',
      '2026-06-15',
    ]);
    for (const ponto of curva.pontos) {
      expect(paraDataUTC(ponto.semana)!.getUTCDay()).toBe(1); // segunda-feira
      expect(paraDataUTC(ponto.fimSemana)!.getUTCDay()).toBe(0); // domingo
      expect(chaveSemana(ponto.fimSemana)).toBe(ponto.semana);
    }
  });

  it('mede o planejado no fim da semana, ponderado por duração', () => {
    // Domingo 07/06: A 7/14 = 50%, B ainda não começou → (50*14 + 0*14)/28 = 25.
    expect(curva.pontos[0].planejadoAcumulado).toBe(25);
    // Domingo 14/06: A 100%, B 7/14 = 50% → 75.
    expect(curva.pontos[1].planejadoAcumulado).toBe(75);
    // Domingo 21/06: ambas 100%.
    expect(curva.pontos[2].planejadoAcumulado).toBe(100);
  });

  it('deriva o avanço do período a partir do acumulado', () => {
    expect(curva.pontos.map((p) => p.planejadoPeriodo)).toEqual([25, 50, 25]);
  });

  it('acumula o realizado com carry-forward do último lançamento', () => {
    // Semana 1: A 40%, B sem lançamento → 0 → (40*14)/28 = 20.
    expect(curva.pontos[0].realizadoAcumulado).toBe(20);
    // Semana 2: A 100%, B 20% → (100*14 + 20*14)/28 = 60.
    expect(curva.pontos[1].realizadoAcumulado).toBe(60);
    expect(curva.pontos.map((p) => p.realizadoPeriodo)).toEqual([20, 40, null]);
  });

  it('não extrapola o realizado para semanas sem lançamento', () => {
    expect(curva.pontos[2].realizadoAcumulado).toBeNull();
    expect(curva.ultimaSemanaComRealizado).toBe('2026-06-08');
  });

  it('marca as semanas posteriores à data de referência', () => {
    expect(curva.pontos.map((p) => p.eFutura)).toEqual([false, false, true]);
  });

  it('reporta metadados do recorte', () => {
    expect(curva.totalAtividades).toBe(2);
    expect(curva.pesoTotal).toBe(28);
    expect(curva.atividadesSemDatas).toBe(0);
  });
});

describe('agregarCurvaS — carry-forward em semana sem lançamento', () => {
  it('semana sem lançamento mantém o acumulado anterior, não zera', () => {
    const curva = agregarCurvaS(
      [atividadeA],
      [
        criarAvanco({
          atividade_id: 'A',
          semana_referencia: '2026-06-01',
          percentual_realizado_acumulado: 40,
        }),
        criarAvanco({
          atividade_id: 'A',
          semana_referencia: '2026-06-15',
          percentual_realizado_acumulado: 90,
        }),
      ],
      { semanaFinal: '2026-06-15' },
    );
    expect(curva.pontos.map((p) => p.realizadoAcumulado)).toEqual([40, 40, 90]);
  });
});

describe('agregarCurvaS — filtros', () => {
  it('filtra por grupo macro (frente)', () => {
    const curva = agregarCurvaS([atividadeA, atividadeB], avancos, {
      filtros: { gruposMacroIds: [GRUPOS.terraplenagem] },
      dataReferencia: '2026-06-10',
    });
    expect(curva.totalAtividades).toBe(1);
    expect(curva.pontos.map((p) => p.semana)).toEqual(['2026-06-01', '2026-06-08']);
    expect(curva.pontos[0].planejadoAcumulado).toBe(50);
    expect(curva.pontos[1].planejadoAcumulado).toBe(100);
    expect(curva.pontos[1].realizadoAcumulado).toBe(100);
  });

  it('filtra por elemento visual', () => {
    const curva = agregarCurvaS([atividadeA, atividadeB], avancos, {
      filtros: { elementosVisuaisIds: [ELEMENTOS.pocoUmido] },
    });
    expect(curva.totalAtividades).toBe(1);
    expect(curva.pontos[0].semana).toBe('2026-06-08');
    expect(curva.pontos[0].realizadoAcumulado).toBe(20);
  });

  it('filtra por caminho crítico', () => {
    const carteira = criarCarteiraEEE();
    const curva = agregarCurvaS(carteira, [], {
      filtros: { apenasCaminhoCritico: true },
    });
    expect(curva.totalAtividades).toBe(34);
  });
});

describe('agregarCurvaS — planejado vindo dos lançamentos', () => {
  it('usa percentual_planejado_acumulado quando fontePlanejado = "avancos"', () => {
    const curva = agregarCurvaS(
      [atividadeA],
      [
        criarAvanco({
          atividade_id: 'A',
          semana_referencia: '2026-06-01',
          percentual_planejado_acumulado: 30,
          percentual_realizado_acumulado: 40,
        }),
        criarAvanco({
          atividade_id: 'A',
          semana_referencia: '2026-06-08',
          percentual_planejado_acumulado: 100,
          percentual_realizado_acumulado: 100,
        }),
      ],
      { fontePlanejado: 'avancos' },
    );
    expect(curva.pontos.map((p) => p.planejadoAcumulado)).toEqual([30, 100]);
  });
});

describe('agregarCurvaS — bordas', () => {
  it('sem atividades devolve curva vazia', () => {
    const curva = agregarCurvaS([], []);
    expect(curva.pontos).toEqual([]);
    expect(curva.totalAtividades).toBe(0);
    expect(curva.ultimaSemanaComRealizado).toBeNull();
  });

  it('sem lançamentos, o realizado é todo null', () => {
    const curva = agregarCurvaS([atividadeA], []);
    expect(curva.pontos.every((p) => p.realizadoAcumulado === null)).toBe(true);
    expect(curva.ultimaSemanaComRealizado).toBeNull();
  });

  it('atividades sem datas não geram grade, mas são reportadas', () => {
    const curva = agregarCurvaS([criarAtividade({ id: 'orfa', duracao_dias: 5 })], []);
    expect(curva.pontos).toEqual([]);
    expect(curva.totalAtividades).toBe(1);
    expect(curva.atividadesSemDatas).toBe(1);
  });

  it('ignora lançamentos de atividades fora do filtro e com semana inválida', () => {
    const curva = agregarCurvaS([atividadeA], [
      ...avancos,
      criarAvanco({ atividade_id: 'INEXISTENTE', semana_referencia: '2026-06-01', percentual_realizado_acumulado: 100 }),
      criarAvanco({ atividade_id: 'A', semana_referencia: 'sem-data', percentual_realizado_acumulado: 100 }),
    ]);
    expect(curva.pontos[0].realizadoAcumulado).toBe(40);
    expect(curva.pontos[1].realizadoAcumulado).toBe(100);
  });

  it('descarta lançamentos com semana posterior à data de referência', () => {
    const curva = agregarCurvaS([atividadeA], avancos, { dataReferencia: '2026-06-03' });
    expect(curva.ultimaSemanaComRealizado).toBe('2026-06-01');
    expect(curva.pontos[0].realizadoAcumulado).toBe(40);
    expect(curva.pontos[1].realizadoAcumulado).toBeNull();
  });

  it('percentuais fora de 0–100 nos lançamentos são grampeados', () => {
    const curva = agregarCurvaS([atividadeA], [
      criarAvanco({ atividade_id: 'A', semana_referencia: '2026-06-01', percentual_realizado_acumulado: 180 }),
    ]);
    expect(curva.pontos[0].realizadoAcumulado).toBe(100);
  });
});

describe('helpers da Curva S', () => {
  const curva = agregarCurvaS([atividadeA, atividadeB], avancos, {
    dataReferencia: '2026-06-10',
  });

  it('seriesCurvaS achata os pontos para o Recharts', () => {
    expect(seriesCurvaS(curva)).toEqual([
      { semana: '2026-06-01', planejado: 25, realizado: 20 },
      { semana: '2026-06-08', planejado: 75, realizado: 60 },
      { semana: '2026-06-15', planejado: 100, realizado: null },
    ]);
  });

  it('pontoDaSemana localiza pela semana de qualquer dia', () => {
    expect(pontoDaSemana(curva, '2026-06-10')?.semana).toBe('2026-06-08');
    expect(pontoDaSemana(curva, '2026-12-25')).toBeNull();
    expect(pontoDaSemana(curva, 'inválida')).toBeNull();
  });
});
