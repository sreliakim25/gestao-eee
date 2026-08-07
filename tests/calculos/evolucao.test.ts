/**
 * Testes de lib/calculos/evolucao.ts — percentual de evolução física.
 *
 * Regressão principal: a carteira sintética de 317 atividades tem que devolver
 * 6% geral, 100% em Serviços Preliminares e 46% em Terraplenagem.
 */

import { describe, expect, it } from 'vitest';
import {
  faixaProgressoElemento,
  mediaPonderada,
  percentuaisPorElementoVisual,
  percentualEvolucaoGeral,
  percentualPorElementoVisual,
  percentualPorGrupoMacro,
  pesoAtividade,
  PESO_PADRAO_ATIVIDADE,
  resumirAtividades,
} from '@/lib/calculos';
import { criarAtividade, criarCarteiraEEE, ELEMENTOS, GRUPOS } from './fixtures';

describe('percentualEvolucaoGeral — regressão com os números reais do plano', () => {
  const carteira = criarCarteiraEEE();

  it('a carteira tem 317 atividades, 34 no caminho crítico', () => {
    const resumo = resumirAtividades(carteira);
    expect(resumo.total).toBe(317);
    expect(resumo.criticas).toBe(34);
    expect(resumo.semDatasPlanejadas).toBe(0);
  });

  it('REGRESSÃO: evolução geral = 6% em 05/08/2026', () => {
    expect(percentualEvolucaoGeral(carteira)).toBe(6);
  });

  it('REGRESSÃO: Serviços Preliminares = 100% e Terraplenagem = 46%', () => {
    const porGrupo = percentualPorGrupoMacro(carteira);
    expect(porGrupo[GRUPOS.preliminares].percentual).toBe(100);
    expect(porGrupo[GRUPOS.preliminares].faixa).toBe('concluido');
    expect(porGrupo[GRUPOS.terraplenagem].percentual).toBe(46);
    expect(porGrupo[GRUPOS.terraplenagem].faixa).toBe('em_andamento');
    expect(porGrupo[GRUPOS.civil].percentual).toBe(0);
    expect(porGrupo[GRUPOS.civil].faixa).toBe('nao_iniciado');
  });

  it('os pesos por grupo batem com a memória de cálculo da fixture', () => {
    const porGrupo = percentualPorGrupoMacro(carteira);
    expect(porGrupo[GRUPOS.preliminares].pesoTotal).toBe(24);
    expect(porGrupo[GRUPOS.terraplenagem].pesoTotal).toBe(300);
    expect(porGrupo[GRUPOS.terraplenagem].totalAtividades).toBe(25);
  });

  it('em 05/08/2026 nenhum elemento visual saiu do zero (Civil não começou)', () => {
    const porElemento = percentuaisPorElementoVisual(carteira);
    expect(Object.keys(porElemento).sort()).toEqual(
      [
        ELEMENTOS.camaraGrades,
        ELEMENTOS.casaComando,
        ELEMENTOS.muroPerimetral,
        ELEMENTOS.pocoUmido,
      ].sort(),
    );
    for (const agregado of Object.values(porElemento)) {
      expect(agregado.percentual).toBe(0);
      expect(agregado.faixa).toBe('nao_iniciado');
    }
  });

  it('aceita filtro por caminho crítico sem recalcular fórmula na UI', () => {
    const soCriticas = percentualEvolucaoGeral(carteira, {
      filtros: { apenasCaminhoCritico: true },
    });
    // 4 terraplenagens a 100% (peso 48) + 30 atividades a 0% (peso 275).
    expect(soCriticas).toBe(14.86);
    expect(resumirAtividades(carteira, { apenasCaminhoCritico: true }).total).toBe(34);
  });
});

describe('média ponderada — fórmula e bordas', () => {
  it('pondera por duração: atividade longa pesa mais que atividade curta', () => {
    const atividades = [
      criarAtividade({ id: 'a', duracao_dias: 30, percentual_concluido: 100 }),
      criarAtividade({ id: 'b', duracao_dias: 10, percentual_concluido: 0 }),
    ];
    // Média simples seria 50; ponderada por duração é 75.
    expect(percentualEvolucaoGeral(atividades)).toBe(75);
  });

  it('lista vazia devolve 0 e não divide por zero', () => {
    expect(percentualEvolucaoGeral([])).toBe(0);
    expect(mediaPonderada([])).toEqual({ percentual: 0, pesoTotal: 0, totalAtividades: 0 });
    expect(percentualPorGrupoMacro([])).toEqual({});
    expect(percentuaisPorElementoVisual([])).toEqual({});
  });

  it('duração 0, negativa ou nula recebe o peso padrão (1), não some da média', () => {
    expect(pesoAtividade(criarAtividade({ id: 'z', duracao_dias: 0 }))).toBe(
      PESO_PADRAO_ATIVIDADE,
    );
    expect(pesoAtividade(criarAtividade({ id: 'n', duracao_dias: null }))).toBe(
      PESO_PADRAO_ATIVIDADE,
    );
    expect(pesoAtividade(criarAtividade({ id: 'neg', duracao_dias: -5 }))).toBe(
      PESO_PADRAO_ATIVIDADE,
    );

    const atividades = [
      criarAtividade({ id: 'a', duracao_dias: 9, percentual_concluido: 100 }),
      criarAtividade({ id: 'b', duracao_dias: 0, percentual_concluido: 0 }),
    ];
    // Se o peso fosse 0 o resultado seria 100 (otimista demais); com peso 1 é 90.
    expect(percentualEvolucaoGeral(atividades)).toBe(90);
  });

  it('grampeia percentuais fora de 0–100 vindos de import sujo', () => {
    const atividades = [
      criarAtividade({ id: 'a', duracao_dias: 1, percentual_concluido: 150 }),
      criarAtividade({ id: 'b', duracao_dias: 1, percentual_concluido: -40 }),
    ];
    expect(percentualEvolucaoGeral(atividades)).toBe(50);
  });

  it('arredonda em 2 casas', () => {
    const atividades = [
      criarAtividade({ id: 'a', duracao_dias: 3, percentual_concluido: 100 }),
      criarAtividade({ id: 'b', duracao_dias: 4, percentual_concluido: 0 }),
    ];
    expect(percentualEvolucaoGeral(atividades)).toBe(42.86);
  });
});

describe('ponderação por custo (preparada para o futuro)', () => {
  const atividades = [
    criarAtividade({ id: 'barata-longa', duracao_dias: 30, percentual_concluido: 100 }),
    criarAtividade({ id: 'cara-curta', duracao_dias: 10, percentual_concluido: 0 }),
  ];

  it('trocando a base para custo, o resultado muda sem mudar a fórmula', () => {
    expect(percentualEvolucaoGeral(atividades)).toBe(75); // por duração
    expect(
      percentualEvolucaoGeral(atividades, {
        base: 'custo',
        custoPorAtividadeId: { 'barata-longa': 10_000, 'cara-curta': 90_000 },
      }),
    ).toBe(10);
  });

  it('atividade fora do mapa de custo cai no peso padrão', () => {
    expect(
      percentualEvolucaoGeral(atividades, {
        base: 'custo',
        custoPorAtividadeId: { 'barata-longa': 1 },
      }),
    ).toBe(50);
  });
});

describe('percentual por elemento visual (Gestão Visual)', () => {
  const atividades = [
    criarAtividade({
      id: 'p1',
      grupo_macro_id: GRUPOS.civil,
      elemento_visual_id: ELEMENTOS.pocoUmido,
      duracao_dias: 20,
      percentual_concluido: 100,
    }),
    criarAtividade({
      id: 'p2',
      grupo_macro_id: GRUPOS.civil,
      elemento_visual_id: ELEMENTOS.pocoUmido,
      duracao_dias: 5,
      percentual_concluido: 0,
    }),
    criarAtividade({
      id: 'c1',
      grupo_macro_id: GRUPOS.civil,
      elemento_visual_id: ELEMENTOS.casaComando,
      duracao_dias: 10,
      percentual_concluido: 100,
    }),
    criarAtividade({ id: 'sem-elemento', duracao_dias: 100, percentual_concluido: 0 }),
  ];

  it('considera só as atividades do elemento pedido', () => {
    expect(percentualPorElementoVisual(atividades, ELEMENTOS.pocoUmido)).toBe(80);
    expect(percentualPorElementoVisual(atividades, ELEMENTOS.casaComando)).toBe(100);
  });

  it('elemento sem atividade vinculada devolve 0 / nao_iniciado', () => {
    expect(percentualPorElementoVisual(atividades, ELEMENTOS.muroPerimetral)).toBe(0);
    expect(faixaProgressoElemento(atividades, ELEMENTOS.muroPerimetral)).toBe('nao_iniciado');
  });

  it('o mapa de elementos ignora atividades sem elemento visual', () => {
    const mapa = percentuaisPorElementoVisual(atividades);
    expect(Object.keys(mapa).sort()).toEqual(
      [ELEMENTOS.casaComando, ELEMENTOS.pocoUmido].sort(),
    );
    expect(mapa[ELEMENTOS.pocoUmido].percentual).toBe(80);
    expect(mapa[ELEMENTOS.pocoUmido].faixa).toBe('em_andamento');
    expect(mapa[ELEMENTOS.casaComando].faixa).toBe('concluido');
  });

  it('o mapa em lote concorda com a consulta individual (SVG e UI não divergem)', () => {
    const mapa = percentuaisPorElementoVisual(atividades);
    for (const [elementoId, agregado] of Object.entries(mapa)) {
      expect(agregado.percentual).toBe(percentualPorElementoVisual(atividades, elementoId));
      expect(agregado.faixa).toBe(faixaProgressoElemento(atividades, elementoId));
    }
  });
});

describe('resumirAtividades', () => {
  it('classifica concluídas, em andamento, não iniciadas e sem datas', () => {
    const atividades = [
      criarAtividade({
        id: 'a',
        percentual_concluido: 100,
        data_inicio_planejada: '2026-05-15',
        data_fim_planejada: '2026-05-16',
      }),
      criarAtividade({ id: 'b', percentual_concluido: 40 }),
      criarAtividade({ id: 'c', percentual_concluido: 0 }),
      criarAtividade({ id: 'd', percentual_concluido: 0, caminho_critico: true }),
    ];
    expect(resumirAtividades(atividades)).toEqual({
      total: 4,
      criticas: 1,
      concluidas: 1,
      emAndamento: 1,
      naoIniciadas: 2,
      semDatasPlanejadas: 3,
    });
  });

  it('lista vazia devolve tudo zerado', () => {
    expect(resumirAtividades([])).toEqual({
      total: 0,
      criticas: 0,
      concluidas: 0,
      emAndamento: 0,
      naoIniciadas: 0,
      semDatasPlanejadas: 0,
    });
  });
});
