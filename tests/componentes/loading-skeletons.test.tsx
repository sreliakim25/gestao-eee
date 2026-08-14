/**
 * Esqueletos de carregamento (`loading.tsx` de cada rota).
 *
 * Sem `loading.tsx`, a navegação entre módulos fica com a tela congelada até
 * o Server Component terminar sessão + queries — este teste garante que os
 * primitivos de esqueleto usados por todas as rotas continuam renderizando
 * sem quebrar (e sem depender de nenhum dado real).
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import {
  MetricCardSkeleton,
  PageHeadingSkeleton,
  Skeleton,
} from '@/components/ui/primitives';

describe('primitivos de esqueleto (loading.tsx)', () => {
  it('Skeleton renderiza um bloco pulsante decorativo', () => {
    const { container } = render(<Skeleton className="h-4 w-4" />);
    const bloco = container.firstElementChild;
    expect(bloco).toHaveAttribute('aria-hidden', 'true');
    expect(bloco).toHaveClass('animate-pulse');
  });

  it('PageHeadingSkeleton e MetricCardSkeleton renderizam sem dado nenhum', () => {
    const { container } = render(
      <>
        <PageHeadingSkeleton />
        <MetricCardSkeleton />
      </>,
    );
    // Nenhum texto real deve aparecer: são só blocos visuais.
    expect(container).not.toHaveTextContent(/\d/);
  });
});
