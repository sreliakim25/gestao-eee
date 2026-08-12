/**
 * Trajetória do cronograma e insights.
 *
 * A fixture usa os dois registros reais da obra:
 *   05/08/2026 — término 26/01/2027, 257 dias, 6%, 34 críticas
 *   12/08/2026 — término 12/02/2027, 274 dias, 7%, 38 críticas
 */

import { describe, expect, it } from 'vitest';
import { gerarInsights, montarSerieHistorico } from '@/lib/calculos';
import type { RegistroHistorico } from '@/lib/calculos';

function registro(parcial: Partial<RegistroHistorico>): RegistroHistorico {
  return {
    data_referencia: '2026-08-05',
    data_inicio_planejada: '2026-05-15',
    data_fim_planejada: '2027-01-26',
    duracao_dias: 257,
    percentual_smartsheet: 6,
    total_atividades: 235,
    atividades_criticas: 34,
    atividades_concluidas: 5,
    ...parcial,
  };
}

const REAIS: RegistroHistorico[] = [
  registro({}),
  registro({
    data_referencia: '2026-08-12',
    data_fim_planejada: '2027-02-12',
    duracao_dias: 274,
    percentual_smartsheet: 7,
    atividades_criticas: 38,
  }),
];

describe('montarSerieHistorico', () => {
  it('ordena por data mesmo recebendo fora de ordem', () => {
    const resumo = montarSerieHistorico([REAIS[1], REAIS[0]]);
    expect(resumo.pontos.map((p) => p.data)).toEqual(['2026-08-05', '2026-08-12']);
  });

  it('mede o desvio de término contra o primeiro registro', () => {
    const resumo = montarSerieHistorico(REAIS);
    expect(resumo.pontos[0].desvioTerminoDias).toBe(0);
    expect(resumo.pontos[1].desvioTerminoDias).toBe(17);
    expect(resumo.variacaoTerminoDias).toBe(17);
  });

  it('mede o alongamento da duração e o avanço', () => {
    const resumo = montarSerieHistorico(REAIS);
    expect(resumo.variacaoDuracaoDias).toBe(17);
    expect(resumo.variacaoPercentualPP).toBe(1);
    expect(resumo.diasCobertos).toBe(7);
  });

  it('série vazia devolve tudo nulo em vez de quebrar', () => {
    const resumo = montarSerieHistorico([]);
    expect(resumo.pontos).toEqual([]);
    expect(resumo.primeiro).toBeNull();
    expect(resumo.variacaoTerminoDias).toBeNull();
  });

  it('registro sem data de término não inventa desvio', () => {
    const resumo = montarSerieHistorico([
      registro({ data_fim_planejada: null }),
      registro({ data_referencia: '2026-08-12' }),
    ]);
    expect(resumo.pontos[0].desvioTerminoDias).toBeNull();
    expect(resumo.pontos[1].desvioTerminoDias).toBeNull();
  });
});

describe('gerarInsights', () => {
  it('avisa quando não há série suficiente', () => {
    expect(gerarInsights(montarSerieHistorico([]))[0].codigo).toBe('serie_curta');
    expect(gerarInsights(montarSerieHistorico([registro({})]))[0].codigo).toBe('serie_curta');
  });

  it('relata o alongamento do prazo com as duas datas', () => {
    const insights = gerarInsights(montarSerieHistorico(REAIS));
    const prazo = insights.find((i) => i.codigo === 'prazo_alongou');
    expect(prazo).toBeDefined();
    expect(prazo!.tom).toBe('atencao');
    expect(prazo!.texto).toContain('17 dias');
    expect(prazo!.texto).toContain('26/01/2027');
    expect(prazo!.texto).toContain('12/02/2027');
  });

  it('reconhece prazo estável como notícia boa', () => {
    const insights = gerarInsights(
      montarSerieHistorico([registro({}), registro({ data_referencia: '2026-08-12' })]),
    );
    const prazo = insights.find((i) => i.codigo === 'prazo_estavel');
    expect(prazo?.tom).toBe('bom');
  });

  it('reconhece antecipação', () => {
    const insights = gerarInsights(
      montarSerieHistorico([
        registro({}),
        registro({ data_referencia: '2026-08-12', data_fim_planejada: '2027-01-10' }),
      ]),
    );
    expect(insights.find((i) => i.codigo === 'prazo_encurtou')?.tom).toBe('bom');
  });

  it('confronta avanço com alongamento de prazo', () => {
    const insights = gerarInsights(montarSerieHistorico(REAIS));
    const confronto = insights.find((i) => i.codigo === 'avanco_vs_prazo');
    expect(confronto?.texto).toContain('1 p.p.');
    expect(confronto?.texto).toContain('17 dias');
  });

  it('marca como atenção quando o prazo cresce sem avanço nenhum', () => {
    const insights = gerarInsights(
      montarSerieHistorico([
        registro({}),
        registro({
          data_referencia: '2026-08-12',
          data_fim_planejada: '2027-02-12',
          percentual_smartsheet: 6,
        }),
      ]),
    );
    expect(insights.find((i) => i.codigo === 'avanco_vs_prazo')?.tom).toBe('atencao');
  });

  it('reporta variação do caminho crítico', () => {
    const insights = gerarInsights(montarSerieHistorico(REAIS));
    const criticas = insights.find((i) => i.codigo === 'criticas_variaram');
    expect(criticas?.texto).toContain('de 34 para 38');
    expect(criticas?.tom).toBe('atencao');
  });

  it('calcula ritmo de escorregamento só com janela suficiente', () => {
    // 7 dias cobertos, 17 de desvio → ~17 dias por semana.
    const comJanela = gerarInsights(montarSerieHistorico(REAIS));
    expect(comJanela.find((i) => i.codigo === 'ritmo_de_escorregamento')).toBeDefined();

    // 2 dias cobertos: janela curta demais, não reporta ritmo.
    const semJanela = gerarInsights(
      montarSerieHistorico([
        registro({}),
        registro({ data_referencia: '2026-08-07', data_fim_planejada: '2027-02-12' }),
      ]),
    );
    expect(semJanela.find((i) => i.codigo === 'ritmo_de_escorregamento')).toBeUndefined();
  });

  it('não projeta data de término', () => {
    // Extrapolar com 2 ou 3 pontos é chute com cara de número. Se algum dia
    // alguém adicionar projeção, este teste obriga a decisão a ser consciente.
    const textos = gerarInsights(montarSerieHistorico(REAIS)).map((i) => i.texto).join(' ');
    expect(textos).not.toMatch(/previs[ãa]o de t[ée]rmino|termina em|acabar[áa] em/i);
  });
});
