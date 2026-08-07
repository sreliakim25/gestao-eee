/**
 * REGRA DE NEGÓCIO CRÍTICA — pedido mínimo de concreto = 5 m³.
 *
 * "Se um pedido calculado ficar abaixo disso, a UI deve alertar e sugerir
 *  combinar com a sobra de outra etapa/frente antes de liberar o pedido —
 *  nunca deixar passar silenciosamente." (CLAUDE.md, item 1)
 */

import { describe, expect, it } from 'vitest';
import {
  abaixoDoMinimo,
  calcularCaminhoes,
  consolidarCombinacao,
  faltaParaMinimoM3,
  sugerirCombinacoesDeSobra,
  validarPedido,
  VOLUME_MINIMO_CONCRETO_M3,
} from '@/lib/concretagem/pedido';
import { CAPACIDADE_CAMINHAO_M3, ETAPAS_PLANO, volumeTotalPlanejadoM3 } from '@/lib/concretagem/plano';
import { checklistCompletoFixture, pedidoFixture } from './fixtures';

describe('constante do volume mínimo', () => {
  it('vale 5 m³ e vem de types/database.ts (espelha a constraint do banco)', () => {
    expect(VOLUME_MINIMO_CONCRETO_M3).toBe(5);
  });
});

describe('abaixoDoMinimo / faltaParaMinimoM3', () => {
  it.each([
    [4.99, true, 0.01],
    [4.5, true, 0.5],
    [3.5, true, 1.5],
    [0.19, true, 4.81],
    [5, false, 0],
    [5.01, false, 0],
    [23.5, false, 0],
  ])('volume %s → abaixo=%s, faltam %s m³', (volume, esperadoAbaixo, esperadoFalta) => {
    expect(abaixoDoMinimo(volume)).toBe(esperadoAbaixo);
    expect(faltaParaMinimoM3(volume)).toBe(esperadoFalta);
  });

  it('5 m³ exatos NÃO estão abaixo do mínimo (limite inclusivo, igual à constraint)', () => {
    expect(abaixoDoMinimo(VOLUME_MINIMO_CONCRETO_M3)).toBe(false);
  });
});

describe('validarPedido — bloqueio abaixo de 5 m³', () => {
  it('BLOQUEIA pedido de 4,5 m³ sem combinação e explica o que fazer', () => {
    const resultado = validarPedido(pedidoFixture({ volumeM3: 4.5 }));

    expect(resultado.liberado).toBe(false);
    const alerta = resultado.alertas.find((a) => a.codigo === 'VOLUME_ABAIXO_MINIMO');
    expect(alerta).toBeDefined();
    expect(alerta?.nivel).toBe('bloqueio');
    expect(alerta?.mensagem).toMatch(/5 m³/);
    expect(alerta?.mensagem).toMatch(/combine com a sobra de outra etapa\/frente/i);
  });

  it('NUNCA passa silenciosamente: sempre há alerta quando o volume é menor que 5 m³', () => {
    for (const volume of [0.11, 0.19, 1.96, 3.5, 4.5, 4.99]) {
      const semCombinar = validarPedido(pedidoFixture({ volumeM3: volume }));
      expect(semCombinar.liberado).toBe(false);
      expect(semCombinar.alertas.length).toBeGreaterThan(0);

      const combinado = validarPedido(pedidoFixture({ volumeM3: volume, combinadoComSobra: true }));
      expect(combinado.liberado).toBe(true);
      expect(combinado.alertas.some((a) => a.codigo === 'VOLUME_ABAIXO_MINIMO_COMBINADO')).toBe(true);
    }
  });

  it('libera pedido abaixo do mínimo quando a sobra já foi combinada, mas registra o info', () => {
    const resultado = validarPedido(pedidoFixture({ volumeM3: 4.5, combinadoComSobra: true }));
    expect(resultado.liberado).toBe(true);
    expect(resultado.alertas.map((a) => a.codigo)).toContain('VOLUME_ABAIXO_MINIMO_COMBINADO');
  });

  it('bloqueia volume zero ou negativo', () => {
    expect(validarPedido(pedidoFixture({ volumeM3: 0 })).liberado).toBe(false);
    expect(validarPedido(pedidoFixture({ volumeM3: -1 })).liberado).toBe(false);
    expect(validarPedido(pedidoFixture({ volumeM3: 0 })).alertas[0].codigo).toBe('VOLUME_NAO_POSITIVO');
  });

  it('alerta (atenção, sem bloquear) quando só a ÚLTIMA CARGA fica abaixo de 5 m³', () => {
    // Etapa 3 do plano: 31,5 m³ = 14 + 14 + 3,5 — a terceira carga é de 3,5 m³.
    const resultado = validarPedido(pedidoFixture({ etapa: 3, volumeM3: 31.5 }));
    expect(resultado.liberado).toBe(true);
    const alerta = resultado.alertas.find((a) => a.codigo === 'ULTIMA_CARGA_ABAIXO_MINIMO');
    expect(alerta?.nivel).toBe('atencao');
    expect(alerta?.mensagem).toMatch(/3\.5 m³/);
  });

  it('pedido dentro do mínimo e sem fração residual não gera alerta', () => {
    const resultado = validarPedido(pedidoFixture({ volumeM3: 14 }));
    expect(resultado.liberado).toBe(true);
    expect(resultado.alertas).toHaveLength(0);
  });
});

describe('calcularCaminhoes', () => {
  it.each([
    [23.5, 2, [14, 9.5]],
    [25.5, 2, [14, 11.5]],
    [31.5, 3, [14, 14, 3.5]],
    [4.5, 1, [4.5]],
  ])('etapa com %s m³ → %s caminhões %j (igual ao plano)', (volume, numEsperado, cargasEsperadas) => {
    const calculo = calcularCaminhoes(volume);
    expect(calculo.numCaminhoes).toBe(numEsperado);
    expect(calculo.cargasM3).toEqual(cargasEsperadas);
  });

  it('as 4 etapas do plano reproduzem exatamente as cargas previstas no documento', () => {
    for (const etapa of ETAPAS_PLANO) {
      const calculo = calcularCaminhoes(etapa.volumeM3);
      expect(calculo.cargasM3, `etapa ${etapa.etapa}`).toEqual([...etapa.cargasPrevistasM3]);
    }
  });

  it('calcula a sobra de capacidade contratada', () => {
    // 3 caminhões × 14 m³ = 42 m³ contratados para 31,5 m³ de concreto.
    expect(calcularCaminhoes(31.5).sobraCapacidadeM3).toBe(10.5);
    expect(calcularCaminhoes(28).sobraCapacidadeM3).toBe(0);
  });

  it('marca quando a última carga cai abaixo do mínimo', () => {
    expect(calcularCaminhoes(31.5).ultimaCargaAbaixoDoMinimo).toBe(true);
    expect(calcularCaminhoes(23.5).ultimaCargaAbaixoDoMinimo).toBe(false);
    expect(calcularCaminhoes(4.5).ultimaCargaAbaixoDoMinimo).toBe(true);
  });

  it('volume zero não gera caminhão', () => {
    const calculo = calcularCaminhoes(0);
    expect(calculo.numCaminhoes).toBe(0);
    expect(calculo.cargasM3).toEqual([]);
  });

  it('respeita a capacidade do caminhão do plano (14 m³)', () => {
    expect(CAPACIDADE_CAMINHAO_M3).toBe(14);
    for (const carga of calcularCaminhoes(85).cargasM3) {
      expect(carga).toBeLessThanOrEqual(CAPACIDADE_CAMINHAO_M3);
    }
  });
});

describe('sugerirCombinacoesDeSobra — combinar antes de pedir abaixo do mínimo', () => {
  it('sugere combinar a etapa 4 (4,5 m³) com outro pedido pequeno da mesma janela', () => {
    const pedidos = [
      pedidoFixture({ id: 'a', etapa: 4, volumeM3: 4.5, dataPrevista: '2026-09-10' }),
      pedidoFixture({ id: 'b', etapa: 3, volumeM3: 3.5, dataPrevista: '2026-09-09' }),
    ];

    const sugestoes = sugerirCombinacoesDeSobra(pedidos);
    const daEtapa4 = sugestoes.find((s) => s.pedidoId === 'a');

    expect(daEtapa4?.faltamM3).toBe(0.5);
    expect(daEtapa4?.parceiros.map((p) => p.id)).toEqual(['b']);
    expect(daEtapa4?.volumeCombinadoM3).toBe(8);
    expect(daEtapa4?.atingeMinimo).toBe(true);
    expect(daEtapa4?.mensagem).toMatch(/atingir o mínimo de 5 m³/);
  });

  it('gera sugestão para TODO pedido abaixo do mínimo, não só para o primeiro', () => {
    const pedidos = [
      pedidoFixture({ id: 'a', etapa: 4, volumeM3: 4.5, dataPrevista: '2026-09-10' }),
      pedidoFixture({ id: 'b', etapa: 3, volumeM3: 3.5, dataPrevista: '2026-09-09' }),
      pedidoFixture({ id: 'c', etapa: 1, volumeM3: 23.5, dataPrevista: '2026-09-01' }),
    ];
    expect(sugerirCombinacoesDeSobra(pedidos).map((s) => s.pedidoId)).toEqual(['a', 'b']);
  });

  it('não sugere parceiro fora da janela de dias', () => {
    const pedidos = [
      pedidoFixture({ id: 'a', etapa: 4, volumeM3: 4.5, dataPrevista: '2026-09-10' }),
      pedidoFixture({ id: 'b', etapa: 1, volumeM3: 3.5, dataPrevista: '2026-11-30' }),
    ];
    const [sugestao] = sugerirCombinacoesDeSobra(pedidos, { janelaDias: 7 });
    expect(sugestao.parceiros).toHaveLength(0);
    expect(sugestao.atingeMinimo).toBe(false);
    expect(sugestao.mensagem).toMatch(/outra frente da obra/i);
  });

  it('não sugere parceiro que estouraria a capacidade do caminhão', () => {
    const pedidos = [
      pedidoFixture({ id: 'a', etapa: 4, volumeM3: 4.5, dataPrevista: '2026-09-10' }),
      pedidoFixture({ id: 'b', etapa: 1, volumeM3: 13.5, dataPrevista: '2026-09-10' }),
    ];
    const [sugestao] = sugerirCombinacoesDeSobra(pedidos);
    expect(sugestao.parceiros).toHaveLength(0);
    expect(sugestao.atingeMinimo).toBe(false);
  });

  it('ignora pedidos já confirmados ou concretados como parceiros', () => {
    const pedidos = [
      pedidoFixture({ id: 'a', etapa: 4, volumeM3: 4.5, dataPrevista: '2026-09-10' }),
      pedidoFixture({ id: 'b', etapa: 3, volumeM3: 3.5, dataPrevista: '2026-09-10', status: 'confirmado' }),
      pedidoFixture({
        id: 'c',
        etapa: 2,
        volumeM3: 3.5,
        dataPrevista: '2026-09-10',
        status: 'concretado',
        dataRealizada: '2026-09-10',
        checklist: checklistCompletoFixture(),
      }),
    ];
    const [sugestao] = sugerirCombinacoesDeSobra(pedidos);
    expect(sugestao.parceiros).toHaveLength(0);
  });

  it('não sugere combinação para pedido já confirmado (não dá mais para renegociar volume)', () => {
    const pedidos = [pedidoFixture({ id: 'a', etapa: 4, volumeM3: 4.5, status: 'confirmado' })];
    expect(sugerirCombinacoesDeSobra(pedidos)).toHaveLength(0);
  });

  it('acumula mais de um parceiro quando um só não fecha os 5 m³', () => {
    const pedidos = [
      pedidoFixture({ id: 'a', etapa: 4, volumeM3: 0.58, dataPrevista: '2026-09-10' }), // Par 12
      pedidoFixture({ id: 'b', etapa: 4, volumeM3: 0.11, dataPrevista: '2026-09-10' }), // Par 13
      pedidoFixture({ id: 'c', etapa: 4, volumeM3: 0.11, dataPrevista: '2026-09-10' }), // Par 14
      pedidoFixture({ id: 'd', etapa: 4, volumeM3: 1.96, dataPrevista: '2026-09-10' }), // Par 3
      pedidoFixture({ id: 'e', etapa: 1, volumeM3: 4.0, dataPrevista: '2026-09-10' }),
    ];
    const sugestao = sugerirCombinacoesDeSobra(pedidos).find((s) => s.pedidoId === 'a');
    expect(sugestao?.atingeMinimo).toBe(true);
    expect(sugestao?.volumeCombinadoM3).toBeGreaterThanOrEqual(5);
    expect(sugestao?.parceiros.length).toBeGreaterThan(1);
  });

  it('é determinística: mesma entrada, mesma saída', () => {
    const pedidos = [
      pedidoFixture({ id: 'a', etapa: 4, volumeM3: 4.5, dataPrevista: '2026-09-10' }),
      pedidoFixture({ id: 'b', etapa: 3, volumeM3: 1.0, dataPrevista: '2026-09-11' }),
      pedidoFixture({ id: 'c', etapa: 2, volumeM3: 0.6, dataPrevista: '2026-09-10' }),
    ];
    expect(sugerirCombinacoesDeSobra(pedidos)).toEqual(sugerirCombinacoesDeSobra(pedidos));
  });
});

describe('consolidarCombinacao', () => {
  it('gera pedido consolidado acima do mínimo e marcado como combinado', () => {
    const pedido = pedidoFixture({ id: 'a', etapa: 4, volumeM3: 4.5, dataPrevista: '2026-09-10' });
    const outro = pedidoFixture({ id: 'b', etapa: 3, volumeM3: 3.5, dataPrevista: '2026-09-10' });
    const [sugestao] = sugerirCombinacoesDeSobra([pedido, outro]);

    const { pedido: consolidado, idsAbsorvidos } = consolidarCombinacao(pedido, sugestao);

    expect(consolidado.volumeM3).toBe(8);
    expect(consolidado.combinadoComSobra).toBe(true);
    expect(idsAbsorvidos).toEqual(['b']);
    expect(validarPedido(consolidado).liberado).toBe(true);
  });

  it('recusa sugestão de outro pedido', () => {
    const pedido = pedidoFixture({ id: 'a', volumeM3: 4.5 });
    const outro = pedidoFixture({ id: 'b', volumeM3: 4.5 });
    const [sugestao] = sugerirCombinacoesDeSobra([outro]);
    expect(() => consolidarCombinacao(pedido, sugestao)).toThrow(/não corresponde/i);
  });
});

describe('plano de concretagem — números do .docx', () => {
  it('tem exatamente as 4 etapas com os volumes do documento', () => {
    expect(ETAPAS_PLANO.map((e) => [e.etapa, e.volumeM3])).toEqual([
      [1, 23.5],
      [2, 25.5],
      [3, 31.5],
      [4, 4.5],
    ]);
  });

  it('soma 85,0 m³, coerente com o Vce de 84,94 m³ do carimbo (arredondamento do plano)', () => {
    expect(volumeTotalPlanejadoM3()).toBe(85);
  });

  it('etapas 3 e 4 já vêm marcadas como "combinar com outra frente"', () => {
    expect(ETAPAS_PLANO.filter((e) => e.exigeCombinacaoComOutraFrente).map((e) => e.etapa)).toEqual([3, 4]);
  });
});
