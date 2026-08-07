'use client';

/**
 * Navegação dos módulos. Mobile-first: no celular vira uma faixa rolável
 * horizontal (a equipe abre o app em campo, de pé, com uma mão só).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { PerfilUsuarioEnum } from '@/types/database';
import { isActiveRoute, visibleModules } from './navigation';

interface MainNavProps {
  perfil: PerfilUsuarioEnum | null;
}

export function MainNav({ perfil }: MainNavProps) {
  const currentPath = usePathname() ?? '/';
  const modules = visibleModules(perfil);

  if (modules.length === 0) return null;

  return (
    <nav aria-label="Módulos do app" className="bg-vinho">
      <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 sm:px-4">
        {modules.map((modulo) => {
          const ativo = isActiveRoute(modulo.href, currentPath);
          return (
            <li key={modulo.href} className="shrink-0">
              <Link
                href={modulo.href}
                title={modulo.description}
                aria-current={ativo ? 'page' : undefined}
                className={[
                  'block rounded-t-md px-3 py-2 text-[0.95rem] whitespace-nowrap transition-colors',
                  ativo
                    ? 'bg-creme font-semibold text-vinho'
                    : 'text-creme hover:bg-vinho-escuro hover:text-ouro',
                ].join(' ')}
              >
                {modulo.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
