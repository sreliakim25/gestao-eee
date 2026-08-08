/**
 * O percentual exibido tem que ser o do Smartsheet. Estes testes travam a regra
 * e, principalmente, a distinção entre "sem apontamento" (null) e "zero".
 *
 * Números reais de 05/08/2026 usados como fixture:
 *   - rollup da raiz no Smartsheet: 6%
 *   - média ponderada das 235 folhas: 3,26%
 * Se alguém trocar a preferência por engano, a divergência de ~2,7 p.p. aparece.
 */

import { describe, expect, it } from 'vitest';
import {
  LIMIAR_DIVERGENCIA_PP,
  divergenciaRelevante,
  montarIndicadoresPainel,
  percentualOficial,
} from '@/lib/calculos';
import type { AtividadeCalculo } from '@/lib/calculos';

const ROLLUP_RAIZ_SMARTSHEET = 6;
const CALCULADO_PELAS_FOLHAS = 3.26;

describe('percentualOficial', () => {
  it('prefere o rollup do Smartsheet quando ele existe', () => {
    const oficial = percentualOficial(ROLLUP_RAIZ_SMARTSHEET, CALCULADO_PELAS_FOLHAS);
    expect(oficial.valor).toBe(6);
    expect(oficial.fonte).toBe('smartsheet');
  });

  it('preserva o valor calculado para a UI mostrar a divergência', () => {
    const oficial = percentualOficial(ROLLUP_RAIZ_SMARTSHEET, CALCULADO_PELAS_FOLHAS);
    expect(oficial.calculado).toBe(3.26);
    expect(oficial.divergenciaPontosPercentuais).toBeCloseTo(2.74, 2);
    expect(divergenciaRelevante(oficial)).toBe(true);
  });

  it('null é "sem apontamento", NÃO zero — cai no calculado', () => {
    const oficial = percentualOficial(null, 42);
    expect(oficial.valor).toBe(42);
    expect(oficial.fonte).toBe('calculado');
    // Nunca pode virar 0: isso faria uma frente sem apontamento parecer parada.
    expect(oficial.valor).not.toBe(0);
  });

  it('undefined também cai no calculado', () => {
    expect(percentualOficial(undefined, 42).fonte).toBe('calculado');
  });

  it('rollup zero é um valor legítimo e prevalece', () => {
    // Diferente de null: aqui o Smartsheet realmente diz 0%.
    const oficial = percentualOficial(0, 55);
    expect(oficial.valor).toBe(0);
    expect(oficial.fonte).toBe('smartsheet');
  });

  it('não sinaliza divergência quando ela é ruído de arredondamento', () => {
    // Terraplenagem: Smartsheet 46, cálculo 46,06.
    const oficial = percentualOficial(46, 46.06);
    expect(oficial.fonte).toBe('smartsheet');
    expect(Math.abs(oficial.divergenciaPontosPercentuais)).toBeLessThan(LIMIAR_DIVERGENCIA_PP);
    expect(divergenciaRelevante(oficial)).toBe(false);
  });

  it('limita percentuais fora da faixa em vez de propagar lixo', () => {
    expect(percentualOficial(140, 10).valor).toBe(100);
    expect(percentualOficial(-5, 10).valor).toBe(0);
  });

  it('NaN é tratado como ausência, não como número', () => {
    expect(percentualOficial(Number.NaN, 33).fonte).toBe('calculado');
    expect(percentualOficial(Number.NaN, 33).valor).toBe(33);
  });

  it('quando a fonte é o cálculo, não há divergência a reportar', () => {
    const oficial = percentualOficial(null, 33);
    expect(oficial.divergenciaPontosPercentuais).toBe(0);
    expect(divergenciaRelevante(oficial)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

const ID_TERRA = 'grp-terra';
const ID_CIVIL = 'grp-civil';

function atividade(grupo: string, pct: number, dur = 10): AtividadeCalculo {
  return {
    grupo_macro_id: grupo,
    elemento_visual_id: null,
    percentual_concluido: pct,
    duracao_dias: dur,
    data_inicio_planejada: '2026-05-15',
    data_fim_planejada: '2026-05-25',
    caminho_critico: false,
  } as AtividadeCalculo;
}

const ATIVIDADES = [
  atividade(ID_TERRA, 100),
  atividade(ID_TERRA, 0),
  atividade(ID_CIVIL, 0),
  atividade(ID_CIVIL, 0),
];

describe('montarIndicadoresPainel com rollup do Smartsheet', () => {
  it('o percentual de topo passa a ser o do Smartsheet, não o calculado', () => {
    const semRollup = montarIndicadoresPainel({
      atividades: ATIVIDADES,
      dataReferencia: '2026-08-05',
      dataFimPlanejada: '2027-01-26',
    });
    expect(semRollup.percentualEvolucaoGeral).toBe(25); // 1 de 4 concluída
    expect(semRollup.evolucaoGeral.fonte).toBe('calculado');

    const comRollup = montarIndicadoresPainel({
      atividades: ATIVIDADES,
      dataReferencia: '2026-08-05',
      dataFimPlanejada: '2027-01-26',
      rollupSmartsheetGeral: ROLLUP_RAIZ_SMARTSHEET,
    });
    expect(comRollup.percentualEvolucaoGeral).toBe(6);
    expect(comRollup.evolucaoGeral.fonte).toBe('smartsheet');
    expect(comRollup.evolucaoGeral.calculado).toBe(25);
  });

  it('a faixa de progresso segue o número oficial, não o calculado', () => {
    const indicadores = montarIndicadoresPainel({
      atividades: ATIVIDADES,
      dataReferencia: '2026-08-05',
      dataFimPlanejada: '2027-01-26',
      rollupSmartsheetGeral: 0,
    });
    // Calculado seria 25% (em andamento); o Smartsheet diz 0%.
    expect(indicadores.percentualEvolucaoGeral).toBe(0);
    expect(indicadores.faixaProgressoGeral).toBe('nao_iniciado');
  });

  it('resolve o oficial por frente, cada uma com sua própria procedência', () => {
    const indicadores = montarIndicadoresPainel({
      atividades: ATIVIDADES,
      dataReferencia: '2026-08-05',
      dataFimPlanejada: '2027-01-26',
      rollupSmartsheetPorGrupo: { [ID_TERRA]: 46, [ID_CIVIL]: null },
    });

    expect(indicadores.evolucaoPorGrupoMacro[ID_TERRA].valor).toBe(46);
    expect(indicadores.evolucaoPorGrupoMacro[ID_TERRA].fonte).toBe('smartsheet');

    // CIVIL sem rollup: cai no calculado (0%), sinalizado como calculado.
    expect(indicadores.evolucaoPorGrupoMacro[ID_CIVIL].fonte).toBe('calculado');
  });

  it('o agregado bruto por grupo continua disponível, sem substituição', () => {
    const indicadores = montarIndicadoresPainel({
      atividades: ATIVIDADES,
      dataReferencia: '2026-08-05',
      dataFimPlanejada: '2027-01-26',
      rollupSmartsheetPorGrupo: { [ID_TERRA]: 46 },
    });
    // porGrupoMacro segue sendo o cálculo puro — quem escolhe é a UI, via evolucaoPorGrupoMacro.
    expect(indicadores.porGrupoMacro[ID_TERRA].percentual).toBe(50);
    expect(indicadores.evolucaoPorGrupoMacro[ID_TERRA].valor).toBe(46);
  });
});
