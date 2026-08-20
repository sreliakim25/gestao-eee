/**
 * Navegação UGB → dispositivo (Fase 2 do plano multi-dispositivo).
 *
 * `lib/dados/ugbs.ts` importa `server-only` (como todo o resto de
 * `lib/dados/`) e por isso não pode ser carregado num teste jsdom — mesmo
 * padrão já usado por `lib/dados/consultas.ts`, que também não tem teste
 * direto neste repositório. O que é testável e importa de verdade aqui é:
 *  1) o agrupamento puro de contagem de dispositivos por UGB
 *     (`contarDispositivosPorUgb`), com as 6 UGBs reais semeadas no banco;
 *  2) a apresentação (`UgbGrid`, `DispositivoGrid`), inclusive o caso de uma
 *     UGB sem nenhum dispositivo — que precisa mostrar o EmptyState honesto,
 *     nunca uma lista vazia silenciosa.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { contarDispositivosPorUgb, UgbGrid } from '@/components/ugbs/UgbGrid';
import { DispositivoGrid } from '@/components/ugbs/DispositivoGrid';
import type { Projeto, Ugb } from '@/types/database';

/* -------------------------------------------------------------------------- */
/* Fixtures — as 6 UGBs reais da migration 20260820100000_seed_ugbs_reais.sql  */
/* -------------------------------------------------------------------------- */

function ugb(id: string, nome: string, sigla: string, ordem: number): Ugb {
  return {
    id,
    nome,
    sigla,
    ordem,
    criado_em: '2026-08-20T10:00:00Z',
    atualizado_em: '2026-08-20T10:00:00Z',
  };
}

const ID_CARUARU = '11111111-1111-4111-8111-000000000001';
const ID_GARANHUNS = '11111111-1111-4111-8111-000000000002';
const ID_IGARASSU = '11111111-1111-4111-8111-000000000003';
const ID_SANTA_CRUZ = '11111111-1111-4111-8111-000000000004';
const ID_JABOATAO = '11111111-1111-4111-8111-000000000005';
const ID_SAO_LOURENCO = '11111111-1111-4111-8111-000000000006';

const UGBS: Ugb[] = [
  ugb(ID_CARUARU, 'Caruaru', 'CAR', 1),
  ugb(ID_GARANHUNS, 'Garanhuns', 'GAR', 2),
  ugb(ID_IGARASSU, 'Igarassu', 'IGA', 3),
  ugb(ID_SANTA_CRUZ, 'Santa Cruz', 'SCR', 4),
  ugb(ID_JABOATAO, 'Jaboatão dos Guararapes', 'JAB', 5),
  ugb(ID_SAO_LOURENCO, 'São Lourenço da Mata', 'SLM', 6),
];

// Só a EEE Novo Mundo existe hoje, atribuída à UGB Caruaru — as outras 5
// UGBs não têm nenhum projeto apontando para elas, de propósito (dado real
// ainda não existe, não é bug).
const PROJETOS: Array<Pick<Projeto, 'id' | 'ugb_id'>> = [
  { id: 'projeto-eee-novo-mundo', ugb_id: ID_CARUARU },
];

/* -------------------------------------------------------------------------- */

describe('contarDispositivosPorUgb (agrupamento puro)', () => {
  it('conta 1 dispositivo para Caruaru e 0 para as outras 5 UGBs reais', () => {
    const resultado = contarDispositivosPorUgb(UGBS, PROJETOS);

    expect(resultado).toHaveLength(6);

    const porNome = Object.fromEntries(
      resultado.map((item) => [item.ugb.nome, item.totalDispositivos]),
    );
    expect(porNome).toEqual({
      Caruaru: 1,
      Garanhuns: 0,
      Igarassu: 0,
      'Santa Cruz': 0,
      'Jaboatão dos Guararapes': 0,
      'São Lourenço da Mata': 0,
    });
  });

  it('preserva a ordem de entrada das UGBs (já ordenadas por `ordem` na consulta)', () => {
    const resultado = contarDispositivosPorUgb(UGBS, PROJETOS);
    expect(resultado.map((item) => item.ugb.nome)).toEqual([
      'Caruaru',
      'Garanhuns',
      'Igarassu',
      'Santa Cruz',
      'Jaboatão dos Guararapes',
      'São Lourenço da Mata',
    ]);
  });

  it('projeto com ugb_id nulo não é contado em UGB nenhuma', () => {
    const resultado = contarDispositivosPorUgb(UGBS, [
      ...PROJETOS,
      { id: 'projeto-sem-ugb', ugb_id: null },
    ]);
    const total = resultado.reduce((soma, item) => soma + item.totalDispositivos, 0);
    expect(total).toBe(1);
  });
});

describe('<UgbGrid /> — tela de escolha de UGB', () => {
  it('renderiza as 6 UGBs reais, cada uma com a contagem correta de dispositivos', () => {
    const ugbsComContagem = contarDispositivosPorUgb(UGBS, PROJETOS);
    render(<UgbGrid ugbs={ugbsComContagem} />);

    const grade = within(screen.getByTestId('grade-ugbs'));
    const cartoes = grade.getAllByRole('link');
    expect(cartoes).toHaveLength(6);

    const caruaru = grade.getByRole('link', { name: /Caruaru/ });
    expect(caruaru).toHaveTextContent('1 dispositivo');
    expect(caruaru).toHaveAttribute('href', `/ugbs/${ID_CARUARU}`);

    const garanhuns = grade.getByRole('link', { name: /Garanhuns/ });
    expect(garanhuns).toHaveTextContent('Nenhum dispositivo cadastrado ainda');
    expect(garanhuns).toHaveAttribute('href', `/ugbs/${ID_GARANHUNS}`);
  });

  it('mostra a sigla de cada UGB', () => {
    const ugbsComContagem = contarDispositivosPorUgb(UGBS, PROJETOS);
    render(<UgbGrid ugbs={ugbsComContagem} />);
    expect(screen.getByText('SLM')).toBeInTheDocument();
  });
});

describe('<DispositivoGrid /> — tela de escolha de dispositivo dentro da UGB', () => {
  it('UGB sem nenhum dispositivo mostra o EmptyState honesto, não uma lista vazia silenciosa', () => {
    render(<DispositivoGrid projetos={[]} />);

    expect(
      screen.getByText('Nenhum dispositivo cadastrado ainda nesta UGB'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('grade-dispositivos')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('UGB com dispositivo real renderiza um cartão linkando para o Painel de hoje', () => {
    const projeto = {
      id: 'projeto-eee-novo-mundo',
      nome: 'E.E.E. - NOVO MUNDO',
      cliente: 'Viana & Moura Construções',
    } as Projeto;

    render(<DispositivoGrid projetos={[projeto]} />);

    const link = screen.getByRole('link', { name: /E\.E\.E\. - NOVO MUNDO/ });
    expect(link).toHaveAttribute('href', '/');
    expect(link).toHaveTextContent('Viana & Moura Construções');
  });
});
