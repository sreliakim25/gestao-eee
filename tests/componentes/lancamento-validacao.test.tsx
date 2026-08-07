/**
 * Validação do Lançamento de Produção.
 *
 * A regra que mais importa aqui é a `semana_referencia` ser SEMPRE segunda-feira
 * (constraint `avancos_semanais_segunda_feira`): sem esta validação o usuário só
 * descobriria o problema por um erro cru do Postgres, em campo.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ProductionEntryForm } from '@/components/lancamento/ProductionEntryForm';
import {
  VALORES_INICIAIS,
  ehSegundaFeira,
  segundaDaSemanaDe,
  validarLancamento,
} from '@/components/lancamento/validation';
import { ATIVIDADES, DATA_REFERENCIA, GRUPOS, SEGUNDA_DA_SEMANA } from './fixtures';

const upsertMock = vi.fn(async () => ({ error: null }));
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/lancamento',
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ upsert: upsertMock }),
  }),
}));

beforeEach(() => {
  upsertMock.mockClear();
  refreshMock.mockClear();
});

describe('validarLancamento', () => {
  it('exige atividade, semana e percentual realizado', () => {
    const resultado = validarLancamento({ ...VALORES_INICIAIS });
    expect(resultado.valido).toBe(false);
    expect(resultado.payload).toBeNull();
    expect(resultado.erros.atividadeId).toBeDefined();
    expect(resultado.erros.semanaReferencia).toBeDefined();
    expect(resultado.erros.percentualRealizado).toBeDefined();
  });

  it('recusa semana que não é segunda-feira e sugere a segunda correta', () => {
    const resultado = validarLancamento({
      ...VALORES_INICIAIS,
      atividadeId: 'a1',
      semanaReferencia: DATA_REFERENCIA, // quarta-feira
      percentualRealizado: '40',
    });
    expect(resultado.valido).toBe(false);
    expect(resultado.erros.semanaReferencia).toContain(SEGUNDA_DA_SEMANA);
  });

  it('recusa percentual fora de 0–100', () => {
    const acima = validarLancamento({
      ...VALORES_INICIAIS,
      atividadeId: 'a1',
      semanaReferencia: SEGUNDA_DA_SEMANA,
      percentualRealizado: '140',
    });
    expect(acima.erros.percentualRealizado).toBeDefined();

    const negativo = validarLancamento({
      ...VALORES_INICIAIS,
      atividadeId: 'a1',
      semanaReferencia: SEGUNDA_DA_SEMANA,
      percentualRealizado: '-3',
    });
    expect(negativo.erros.percentualRealizado).toBeDefined();
  });

  it('aceita lançamento válido e monta o payload do banco', () => {
    const resultado = validarLancamento({
      atividadeId: 'a1',
      semanaReferencia: SEGUNDA_DA_SEMANA,
      percentualRealizado: '42,5',
      percentualPlanejado: '',
      observacoes: '  chuva na quinta  ',
    });

    expect(resultado.valido).toBe(true);
    expect(resultado.payload).toEqual({
      atividade_id: 'a1',
      semana_referencia: SEGUNDA_DA_SEMANA,
      percentual_realizado_acumulado: 42.5,
      percentual_planejado_acumulado: 0,
      observacoes: 'chuva na quinta',
    });
  });

  it('reconhece segunda-feira e deriva a segunda de qualquer data', () => {
    expect(ehSegundaFeira(SEGUNDA_DA_SEMANA)).toBe(true);
    expect(ehSegundaFeira(DATA_REFERENCIA)).toBe(false);
    expect(segundaDaSemanaDe(DATA_REFERENCIA)).toBe(SEGUNDA_DA_SEMANA);
    expect(segundaDaSemanaDe('data-invalida')).toBe('');
  });
});

describe('<ProductionEntryForm />', () => {
  function renderizar(podeRegistrar = true) {
    return render(
      <ProductionEntryForm
        atividades={ATIVIDADES}
        grupos={GRUPOS}
        dataReferencia={DATA_REFERENCIA}
        usuarioId="usuario-1"
        podeRegistrar={podeRegistrar}
      />,
    );
  }

  it('abre já com a segunda-feira da semana corrente', () => {
    renderizar();
    expect(
      screen.getByLabelText('Semana de referência (segunda-feira)'),
    ).toHaveValue(SEGUNDA_DA_SEMANA);
  });

  it('não chama o banco quando o formulário está incompleto', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole('button', { name: 'Registrar avanço' }));

    expect(await screen.findByText('Selecione a atividade.')).toBeInTheDocument();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('grava o avanço com a semana em segunda-feira e o autor do registro', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.selectOptions(screen.getByLabelText('Atividade'), 'a1');
    await usuario.type(screen.getByLabelText('Realizado acumulado (%)'), '60');
    await usuario.click(screen.getByRole('button', { name: 'Registrar avanço' }));

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [payload, opcoes] = upsertMock.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(payload).toMatchObject({
      atividade_id: 'a1',
      semana_referencia: SEGUNDA_DA_SEMANA,
      percentual_realizado_acumulado: 60,
      registrado_por: 'usuario-1',
    });
    expect(opcoes).toEqual({ onConflict: 'atividade_id,semana_referencia' });
    expect(refreshMock).toHaveBeenCalled();
  });

  it('bloqueia o envio para perfil sem permissão de escrita', () => {
    renderizar(false);
    expect(screen.getByRole('button', { name: 'Registrar avanço' })).toBeDisabled();
    expect(
      screen.getByText(/não tem permissão para registrar avanço/i),
    ).toBeInTheDocument();
  });
});
