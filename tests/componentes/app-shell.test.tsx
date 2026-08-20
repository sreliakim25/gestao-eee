/**
 * Casca do app (`AppShell`) — item de navegação "Trocar dispositivo".
 *
 * Cobre a única alteração feita no AppShell pela Fase 2 do plano
 * multi-dispositivo: com a navegação agora começando pela escolha de UGB
 * (`/ugbs`), precisa existir um jeito descoberto de voltar a ela de dentro de
 * qualquer módulo.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AppShell } from '@/components/layout/AppShell';
import type { PerfilUsuario } from '@/types/database';

vi.mock('next/navigation', () => ({
  usePathname: () => '/cronograma',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const PERFIL_ATIVO: PerfilUsuario = {
  id: 'usuario-1',
  nome: 'Fiscal de Obra',
  perfil: 'fiscal',
  status: 'ativo',
  liberado_em: '2026-01-01T00:00:00Z',
  liberado_por: null,
  criado_em: '2026-01-01T00:00:00Z',
  atualizado_em: '2026-01-01T00:00:00Z',
};

describe('<AppShell /> — link "Trocar dispositivo"', () => {
  it('usuário com acesso liberado enxerga o link de volta para /ugbs', () => {
    render(
      <AppShell perfil={PERFIL_ATIVO} emailUsuario="fiscal@vmc.com.br">
        <p>Conteúdo do módulo</p>
      </AppShell>,
    );

    const link = screen.getByRole('link', { name: 'Trocar dispositivo' });
    expect(link).toHaveAttribute('href', '/ugbs');
  });

  it('usuário sem acesso liberado não enxerga a casca (nem o link)', () => {
    const perfilPendente: PerfilUsuario = { ...PERFIL_ATIVO, status: 'pendente' };
    render(
      <AppShell perfil={perfilPendente} emailUsuario="novo@vmc.com.br">
        <p>Conteúdo do módulo</p>
      </AppShell>,
    );

    expect(screen.queryByRole('link', { name: 'Trocar dispositivo' })).not.toBeInTheDocument();
  });
});
