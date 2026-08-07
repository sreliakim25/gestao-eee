/**
 * Filtros do Cronograma: semana atual, caminho crítico e frente/elemento.
 *
 * Cobre as duas camadas: as funções puras de filtro (`scheduleFilters`) e a
 * interação real na tela (`ScheduleView`), que é onde uma regressão de filtro
 * apareceria para o usuário.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ScheduleView } from '@/components/cronograma/ScheduleView';
import {
  FILTROS_INICIAIS,
  applyScheduleFilters,
  matchesWeek,
  mondayOfWeek,
  sundayOfWeek,
} from '@/components/filters/scheduleFilters';
import {
  ATIVIDADES,
  ATIVIDADE_CIVIL_FORA_DA_SEMANA,
  ATIVIDADE_CIVIL_SEM_DATAS,
  DATA_REFERENCIA,
  ELEMENTOS,
  GRUPOS,
  GRUPO_CIVIL,
  SEGUNDA_DA_SEMANA,
} from './fixtures';

// O Gantt e a tabela usam apenas props; a navegação não é exercitada aqui.
vi.mock('next/navigation', () => ({
  usePathname: () => '/cronograma',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

describe('scheduleFilters (funções puras)', () => {
  it('deriva a segunda e o domingo da semana ISO da data de referência', () => {
    expect(mondayOfWeek(DATA_REFERENCIA)).toBe(SEGUNDA_DA_SEMANA);
    expect(sundayOfWeek(SEGUNDA_DA_SEMANA)).toBe('2026-08-09');
  });

  it('considera na semana a atividade cuja janela cruza segunda–domingo', () => {
    expect(
      matchesWeek(
        { data_inicio_planejada: '2026-07-20', data_fim_planejada: '2026-08-04' },
        SEGUNDA_DA_SEMANA,
      ),
    ).toBe(true);
    expect(
      matchesWeek(
        { data_inicio_planejada: '2026-08-10', data_fim_planejada: '2026-08-12' },
        SEGUNDA_DA_SEMANA,
      ),
    ).toBe(false);
  });

  it('deixa fora da semana atual a atividade sem datas (não inventa presença)', () => {
    expect(matchesWeek(ATIVIDADE_CIVIL_SEM_DATAS, SEGUNDA_DA_SEMANA)).toBe(false);
  });

  it('combina frente + caminho crítico', () => {
    const resultado = applyScheduleFilters(
      ATIVIDADES,
      { ...FILTROS_INICIAIS, grupoMacroId: GRUPO_CIVIL, apenasCriticas: true },
      DATA_REFERENCIA,
    );
    expect(resultado.map((a) => a.id)).toEqual([ATIVIDADE_CIVIL_SEM_DATAS.id]);
  });

  it('busca por nome ignorando acento e caixa', () => {
    const resultado = applyScheduleFilters(
      ATIVIDADES,
      { ...FILTROS_INICIAIS, busca: 'ESCAVACAO' },
      DATA_REFERENCIA,
    );
    expect(resultado).toHaveLength(1);
    expect(resultado[0].nome).toContain('Escavação');
  });
});

describe('<ScheduleView /> — filtros na tela', () => {
  function renderizar() {
    return render(
      <ScheduleView
        atividades={ATIVIDADES}
        grupos={GRUPOS}
        elementos={ELEMENTOS}
        dataReferencia={DATA_REFERENCIA}
      />,
    );
  }

  it('lista todas as atividades importadas antes de qualquer filtro', () => {
    renderizar();
    // Cada atividade aparece na lista mobile e na tabela desktop.
    expect(screen.getAllByText('Escavação do poço úmido').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Muro perimetral em blocos').length).toBeGreaterThan(0);
    expect(screen.getByText(/4 de 4 atividades/)).toBeInTheDocument();
  });

  it('filtra somente o caminho crítico', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByLabelText('Somente caminho crítico'));

    expect(screen.getAllByText('Escavação do poço úmido').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Braço giratório do poço').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Marcação de obra')).toHaveLength(0);
    expect(screen.getByText(/2 de 4 atividades/)).toBeInTheDocument();
  });

  it('filtra somente a semana atual', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByLabelText('Somente a semana atual'));

    expect(screen.getAllByText('Escavação do poço úmido').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Marcação de obra').length).toBeGreaterThan(0);
    expect(
      screen.queryAllByText(ATIVIDADE_CIVIL_FORA_DA_SEMANA.nome),
    ).toHaveLength(0);
  });

  it('filtra por frente (grupo macro)', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.selectOptions(screen.getByLabelText('Frente / disciplina'), GRUPO_CIVIL);

    expect(screen.getAllByText('Muro perimetral em blocos').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Escavação do poço úmido')).toHaveLength(0);
    expect(screen.getByText(/2 de 4 atividades/)).toBeInTheDocument();
  });

  it('combina semana atual + caminho crítico', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByLabelText('Somente caminho crítico'));
    await usuario.click(screen.getByLabelText('Somente a semana atual'));

    expect(screen.getByText(/1 de 4 atividades/)).toBeInTheDocument();
    expect(screen.getAllByText('Escavação do poço úmido').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Braço giratório do poço')).toHaveLength(0);
  });

  it('mostra estado vazio honesto quando o recorte não tem atividade', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(screen.getByLabelText('Buscar atividade'), 'emissário final');

    expect(screen.getByText('Nenhuma atividade para este recorte')).toBeInTheDocument();
  });

  it('limpa todos os filtros de uma vez', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByLabelText('Somente caminho crítico'));
    await usuario.click(screen.getByRole('button', { name: /Limpar filtros/ }));

    expect(screen.getByText(/4 de 4 atividades/)).toBeInTheDocument();
  });

  it('alterna para o Gantt simplificado mantendo o recorte', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByLabelText('Somente a semana atual'));
    await usuario.click(screen.getByRole('button', { name: 'Gantt simplificado' }));

    expect(screen.getByText(/Janela exibida/)).toBeInTheDocument();
    expect(screen.getByText('Escavação do poço úmido')).toBeInTheDocument();
  });
});
