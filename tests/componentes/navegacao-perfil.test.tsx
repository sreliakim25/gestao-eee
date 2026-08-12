/**
 * Renderização condicional por perfil (gestor / fiscal / campo).
 *
 * A visibilidade dos módulos espelha a RLS: campo não precisa do módulo
 * financeiro. Se alguém adicionar um módulo sensível sem restringir o perfil,
 * este teste é o alarme.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MainNav } from '@/components/layout/MainNav';
import {
  APP_MODULES,
  canEditPlanning,
  canRegisterProduction,
  isActiveRoute,
  visibleModules,
} from '@/components/layout/navigation';

vi.mock('next/navigation', () => ({
  usePathname: () => '/cronograma',
}));

describe('navigation (regras de visibilidade)', () => {
  it('expõe os 11 módulos do app', () => {
    expect(APP_MODULES).toHaveLength(11);
    expect(APP_MODULES.map((modulo) => modulo.href)).toEqual([
      '/',
      '/cronograma',
      '/curva-s',
      '/lancamento',
      '/gestao-visual',
      '/diario',
      '/concretagem',
      '/orcamento',
      '/analise',
      '/usuarios',
      '/conta',
    ]);
  });

  it('gestor e fiscal enxergam tudo; campo não enxerga Orçamento nem Análise IA', () => {
    // Gestor vê tudo; fiscal não vê Acessos (só gestor libera).
    expect(visibleModules('gestor')).toHaveLength(11);
    expect(visibleModules('fiscal')).toHaveLength(10);
    expect(visibleModules('fiscal').map((m) => m.href)).not.toContain('/usuarios');
    const doCampo = visibleModules('campo').map((m) => m.href);
    expect(doCampo).not.toContain('/orcamento');
    expect(doCampo).not.toContain('/analise');
  });

  it('usuário sem perfil não enxerga módulo nenhum', () => {
    expect(visibleModules(null)).toHaveLength(0);
  });

  it('permissões de escrita seguem a RLS', () => {
    expect(canRegisterProduction('campo')).toBe(true);
    expect(canRegisterProduction(null)).toBe(false);
    expect(canEditPlanning('gestor')).toBe(true);
    expect(canEditPlanning('fiscal')).toBe(false);
  });

  it('rota ativa: raiz só casa exato, as demais casam por prefixo', () => {
    expect(isActiveRoute('/', '/')).toBe(true);
    expect(isActiveRoute('/', '/cronograma')).toBe(false);
    expect(isActiveRoute('/diario', '/diario')).toBe(true);
    expect(isActiveRoute('/diario', '/diario/2026-08-05')).toBe(true);
  });
});

describe('<MainNav /> por perfil', () => {
  it('gestor vê o link de Orçamento', () => {
    render(<MainNav perfil="gestor" />);
    expect(screen.getByRole('link', { name: 'Orçamento' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Análise IA' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(11);
  });

  it('campo não vê o link de Orçamento', () => {
    render(<MainNav perfil="campo" />);
    expect(screen.queryByRole('link', { name: 'Orçamento' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(8);
    // Os módulos de produção continuam disponíveis para a equipe de campo.
    expect(screen.getByRole('link', { name: 'Lançamento' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Diário de Obra' })).toBeInTheDocument();
  });

  it('sem perfil não renderiza navegação alguma', () => {
    const { container } = render(<MainNav perfil={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marca a rota atual com aria-current', () => {
    render(<MainNav perfil="fiscal" />);
    expect(screen.getByRole('link', { name: 'Cronograma' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Painel' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
