/**
 * Comportamento do módulo de Gestão Visual: mapeamento elemento → %, faixa
 * correta nas bordas (0% e 100%) e clique abrindo o detalhe das atividades.
 *
 * A asserção que mais importa aqui é a de que o percentual exibido é o MESMO
 * que `lib/calculos` produz — o SVG não pode contar uma história diferente do
 * Painel (regra 4 do CLAUDE.md).
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GestaoVisual, montarElementosRenderizaveis } from '@/components/gestao-visual';
import { percentuaisPorElementoVisual } from '@/lib/calculos';
import type { AtividadeGestaoVisual } from '@/components/gestao-visual';
import type { ElementoVisual } from '@/types/database';

/* -------------------------------------------------------------------------- */
/* Fixtures — sintéticas, não são dados reais da obra                          */
/* -------------------------------------------------------------------------- */

const ID_POCO = '11111111-1111-4111-8111-111111111111';
const ID_CASA = '22222222-2222-4222-8222-222222222222';
const ID_MURO = '33333333-3333-4333-8333-333333333333';

function elemento(
  id: string,
  nome: string,
  tipo: ElementoVisual['tipo'],
  svgPathId: string,
  ordem: number,
): ElementoVisual {
  return {
    id,
    nome,
    tipo,
    svg_path_id: svgPathId,
    ifc_global_id: null,
    ordem,
  } as ElementoVisual;
}

const ELEMENTOS: ElementoVisual[] = [
  elemento(ID_POCO, 'Poço úmido', 'poco_umido', 'poco-umido', 1),
  elemento(ID_CASA, 'Casa de comando', 'casa_comando', 'casa-comando', 3),
  elemento(ID_MURO, 'Muro perimetral', 'muro_perimetral', 'muro-perimetral', 9),
];

function atividade(
  nome: string,
  elementoVisualId: string | null,
  percentual: number,
  duracaoDias = 10,
): AtividadeGestaoVisual {
  return {
    nome,
    elemento_visual_id: elementoVisualId,
    percentual_concluido: percentual,
    duracao_dias: duracaoDias,
    data_inicio_planejada: '2026-05-15',
    data_fim_planejada: '2026-05-25',
    caminho_critico: false,
    grupo_macro_id: null,
  } as unknown as AtividadeGestaoVisual;
}

// Poço úmido: 0% e 0% → borda inferior (nao_iniciado)
// Casa de comando: 100% e 100% → borda superior (concluido)
// Muro perimetral: 40% e 60%, mesma duração → 50% (em_andamento)
const ATIVIDADES: AtividadeGestaoVisual[] = [
  atividade('Escavação do poço', ID_POCO, 0),
  atividade('Laje de fundo', ID_POCO, 0),
  atividade('Alvenaria', ID_CASA, 100),
  atividade('Cobertura', ID_CASA, 100),
  atividade('Fundação do muro', ID_MURO, 40),
  atividade('Elevação do muro', ID_MURO, 60),
  // Sem vínculo: precisa ser ignorada, não pode contaminar nenhum elemento.
  atividade('Mobilização de canteiro', null, 100),
];

/* -------------------------------------------------------------------------- */

describe('adaptador: elemento → percentual e faixa', () => {
  const renderizaveis = montarElementosRenderizaveis(ELEMENTOS, ATIVIDADES);

  it('respeita a ordem declarada em elementos_visuais.ordem', () => {
    expect(renderizaveis.map((item) => item.nome)).toEqual([
      'Poço úmido',
      'Casa de comando',
      'Muro perimetral',
    ]);
  });

  it('0% cai em nao_iniciado (borda inferior)', () => {
    const poco = renderizaveis.find((item) => item.id === ID_POCO)!;
    expect(poco.percentual).toBe(0);
    expect(poco.faixa).toBe('nao_iniciado');
  });

  it('100% cai em concluido (borda superior)', () => {
    const casa = renderizaveis.find((item) => item.id === ID_CASA)!;
    expect(casa.percentual).toBe(100);
    expect(casa.faixa).toBe('concluido');
  });

  it('valor intermediário cai em em_andamento e usa a média ponderada por duração', () => {
    const muro = renderizaveis.find((item) => item.id === ID_MURO)!;
    expect(muro.percentual).toBeCloseTo(50, 6);
    expect(muro.faixa).toBe('em_andamento');
  });

  it('o percentual exibido é exatamente o do motor de cálculo, sem recálculo local', () => {
    const doMotor = percentuaisPorElementoVisual(ATIVIDADES);
    for (const item of renderizaveis) {
      expect(item.percentual).toBe(doMotor[item.id]?.percentual ?? 0);
      expect(item.faixa).toBe(doMotor[item.id]?.faixa ?? 'nao_iniciado');
    }
  });

  it('atividade sem elemento_visual_id não contamina nenhum elemento', () => {
    const total = renderizaveis.reduce((soma, item) => soma + item.totalAtividades, 0);
    expect(total).toBe(6); // as 7 fixtures menos a sem vínculo
  });

  it('elemento sem atividade vinculada entra com 0% e é sinalizado, não escondido', () => {
    const semAtividades = montarElementosRenderizaveis(ELEMENTOS, []);
    for (const item of semAtividades) {
      expect(item.percentual).toBe(0);
      expect(item.faixa).toBe('nao_iniciado');
      expect(item.totalAtividades).toBe(0);
    }
  });
});

/**
 * Cada elemento tem DOIS alvos, de propósito: a forma no desenho e a linha da
 * lista textual (o caminho de leitura para leitor de tela). Os testes abaixo
 * distinguem os dois — os seletores são deliberadamente específicos, porque um
 * seletor frouxo aqui casaria com ambos e esconderia qual dos caminhos quebrou.
 */
describe('interação da planta', () => {
  /** Alvo dentro do desenho: identificado pela descrição acessível completa. */
  function alvoNoDesenho(nome: string) {
    return screen.getByRole('button', {
      name: new RegExp(`^${nome}: .+ concluído`, 'i'),
    });
  }

  /** Alvo na lista textual de conferência. */
  function alvoNaLista(nome: string) {
    return within(screen.getByTestId('lista-elementos')).getByRole('button', {
      name: new RegExp(nome, 'i'),
    });
  }

  it('a lista textual expõe um alvo por elemento, com nome e percentual', () => {
    render(<GestaoVisual elementos={ELEMENTOS} atividades={ATIVIDADES} />);

    const lista = within(screen.getByTestId('lista-elementos'));
    expect(lista.getAllByRole('button')).toHaveLength(3);
    expect(alvoNaLista('Muro perimetral')).toHaveTextContent('50%');
    expect(alvoNaLista('Casa de comando')).toHaveTextContent('100%');
  });

  it('a descrição acessível do desenho traz nome, percentual, faixa e nº de atividades', () => {
    render(<GestaoVisual elementos={ELEMENTOS} atividades={ATIVIDADES} />);

    expect(alvoNoDesenho('Casa de comando')).toHaveAccessibleName(
      'Casa de comando: 100% concluído — Concluído (2 atividades vinculadas)',
    );
  });

  it('clicar no desenho abre o detalhe só com as atividades daquele elemento', async () => {
    const usuario = userEvent.setup();
    render(<GestaoVisual elementos={ELEMENTOS} atividades={ATIVIDADES} />);

    await usuario.click(alvoNoDesenho('Muro perimetral'));

    const detalhe = await screen.findByRole('dialog');
    expect(within(detalhe).getByText(/Fundação do muro/i)).toBeInTheDocument();
    expect(within(detalhe).getByText(/Elevação do muro/i)).toBeInTheDocument();
    // Atividade de outro elemento não pode vazar para o detalhe.
    expect(within(detalhe).queryByText(/Alvenaria/i)).not.toBeInTheDocument();
  });

  it('a lista abre exatamente o mesmo detalhe que o desenho', async () => {
    const usuario = userEvent.setup();
    render(<GestaoVisual elementos={ELEMENTOS} atividades={ATIVIDADES} />);

    await usuario.click(alvoNaLista('Muro perimetral'));

    const detalhe = await screen.findByRole('dialog');
    expect(within(detalhe).getByText(/Fundação do muro/i)).toBeInTheDocument();
  });

  it('o elemento do desenho é acionável por teclado, não só por mouse', async () => {
    const usuario = userEvent.setup();
    render(<GestaoVisual elementos={ELEMENTOS} atividades={ATIVIDADES} />);

    const alvo = alvoNoDesenho('Casa de comando');
    alvo.focus();
    expect(alvo).toHaveFocus();

    await usuario.keyboard('{Enter}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
