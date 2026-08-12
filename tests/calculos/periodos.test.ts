/**
 * Janela de execução por frente e desvio de linha de base.
 *
 * A fixture usa o desvio real desta obra: o término da elevatória passou de
 * 26/01/2027 (linha de base) para 12/02/2027 (plano vigente) — 17 dias.
 */

import { describe, expect, it } from 'vitest';
import {
  LIMIAR_DESVIO_DIAS,
  desvioRelevante,
  montarIndicadoresPainel,
  periodoDeAtividades,
  periodosPorGrupoMacro,
} from '@/lib/calculos';
import type { AtividadeCalculo } from '@/lib/calculos';

const CIVIL = 'grp-civil';
const TERRA = 'grp-terra';

function atividade(
  grupo: string,
  inicio: string | null,
  fim: string | null,
  base?: { inicio: string | null; fim: string | null },
): AtividadeCalculo {
  return {
    grupo_macro_id: grupo,
    elemento_visual_id: null,
    percentual_concluido: 0,
    duracao_dias: 10,
    data_inicio_planejada: inicio,
    data_fim_planejada: fim,
    data_inicio_linha_base: base ? base.inicio : inicio,
    data_fim_linha_base: base ? base.fim : fim,
    caminho_critico: false,
  } as AtividadeCalculo;
}

describe('periodoDeAtividades', () => {
  it('usa o menor início e o maior término da frente', () => {
    const periodo = periodoDeAtividades([
      atividade(CIVIL, '2026-06-01', '2026-08-30'),
      atividade(CIVIL, '2026-05-15', '2026-07-10'),
      atividade(CIVIL, '2026-09-01', '2027-02-12'),
    ]);
    expect(periodo.inicio).toBe('2026-05-15');
    expect(periodo.fim).toBe('2027-02-12');
  });

  it('detecta o atraso real da obra: 26/01 → 12/02, 17 dias', () => {
    const periodo = periodoDeAtividades([
      atividade(CIVIL, '2026-05-15', '2027-02-12', {
        inicio: '2026-05-15',
        fim: '2027-01-26',
      }),
    ]);
    expect(periodo.fimLinhaBase).toBe('2027-01-26');
    expect(periodo.desvioFimDias).toBe(17);
    expect(desvioRelevante(periodo.desvioFimDias)).toBe(true);
  });

  it('desvio negativo significa adiantamento', () => {
    const periodo = periodoDeAtividades([
      atividade(CIVIL, '2026-05-15', '2026-12-20', {
        inicio: '2026-05-15',
        fim: '2027-01-26',
      }),
    ]);
    expect(periodo.desvioFimDias).toBeLessThan(0);
    expect(desvioRelevante(periodo.desvioFimDias)).toBe(true);
  });

  it('sem desvio, nada a destacar', () => {
    const periodo = periodoDeAtividades([atividade(CIVIL, '2026-05-15', '2027-01-26')]);
    expect(periodo.desvioFimDias).toBe(0);
    expect(desvioRelevante(periodo.desvioFimDias)).toBe(false);
  });

  it('ignora atividades sem data em vez de tratá-las como hoje', () => {
    const periodo = periodoDeAtividades([
      atividade(CIVIL, null, null),
      atividade(CIVIL, '2026-06-01', '2026-08-30'),
    ]);
    expect(periodo.inicio).toBe('2026-06-01');
    expect(periodo.fim).toBe('2026-08-30');
    expect(periodo.atividadesComData).toBe(1);
  });

  it('frente inteira sem datas devolve null, não uma data inventada', () => {
    const periodo = periodoDeAtividades([atividade(CIVIL, null, null)]);
    expect(periodo.inicio).toBeNull();
    expect(periodo.fim).toBeNull();
    expect(periodo.desvioFimDias).toBeNull();
    expect(desvioRelevante(periodo.desvioFimDias)).toBe(false);
  });

  it('lista vazia não quebra', () => {
    const periodo = periodoDeAtividades([]);
    expect(periodo.inicio).toBeNull();
    expect(periodo.atividadesComData).toBe(0);
  });

  it('sem linha de base não há desvio a alegar', () => {
    const semBase = {
      ...atividade(CIVIL, '2026-05-15', '2027-02-12'),
      data_inicio_linha_base: null,
      data_fim_linha_base: null,
    } as AtividadeCalculo;
    const periodo = periodoDeAtividades([semBase]);
    expect(periodo.desvioFimDias).toBeNull();
    expect(desvioRelevante(periodo.desvioFimDias)).toBe(false);
  });

  it('o limiar evita marcar ajuste fino como replanejamento', () => {
    expect(LIMIAR_DESVIO_DIAS).toBeGreaterThan(0);
    expect(desvioRelevante(0)).toBe(false);
    expect(desvioRelevante(LIMIAR_DESVIO_DIAS)).toBe(true);
  });
});

describe('periodosPorGrupoMacro', () => {
  const ATIVIDADES = [
    atividade(TERRA, '2026-05-15', '2026-07-10'),
    atividade(CIVIL, '2026-06-01', '2027-02-12', {
      inicio: '2026-06-01',
      fim: '2027-01-26',
    }),
  ];

  it('separa as frentes e calcula o desvio de cada uma', () => {
    const periodos = periodosPorGrupoMacro(ATIVIDADES);
    expect(periodos[TERRA].desvioFimDias).toBe(0);
    expect(periodos[CIVIL].desvioFimDias).toBe(17);
  });

  it('entra no retorno de montarIndicadoresPainel', () => {
    const indicadores = montarIndicadoresPainel({
      atividades: ATIVIDADES,
      dataReferencia: '2026-08-11',
      dataFimPlanejada: '2027-02-12',
    });
    expect(indicadores.periodosPorGrupoMacro[CIVIL].fim).toBe('2027-02-12');
    expect(indicadores.periodosPorGrupoMacro[CIVIL].fimLinhaBase).toBe('2027-01-26');
  });

  it('linhas-mãe não distorcem a janela da frente', () => {
    // A linha-mãe abrange todo o intervalo dos filhos; ela é excluída das
    // agregações, mas a janela precisa continuar correta mesmo assim.
    const comMae = [
      { ...atividade(CIVIL, '2026-06-01', '2027-02-12'), eh_folha: false } as AtividadeCalculo,
      atividade(CIVIL, '2026-06-01', '2026-09-30'),
    ];
    const periodos = periodosPorGrupoMacro(comMae);
    expect(periodos[CIVIL].fim).toBe('2026-09-30');
  });
});
