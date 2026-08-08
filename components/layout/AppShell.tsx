'use client';

/**
 * Casca do app: cabeçalho + navegação + rodapé.
 *
 * Fica no layout raiz (e não em um route group) de propósito: assim os módulos
 * de outros agentes (`/gestao-visual`, `/concretagem`, `/orcamento`) herdam a
 * mesma casca sem precisar declarar nada. O login é a única exceção e é
 * detectado pelo pathname.
 */

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { PerfilUsuario } from '@/types/database';
import { MainNav } from './MainNav';
import { SignOutButton } from './SignOutButton';
import { PROFILE_LABELS } from './navigation';

interface AppShellProps {
  perfil: PerfilUsuario | null;
  /** E-mail do usuário autenticado (fallback quando `perfis.nome` está vazio). */
  emailUsuario: string | null;
  children: ReactNode;
}

/** Rotas que não recebem a casca. */
const ROTAS_SEM_CASCA = ['/login'];

export function AppShell({ perfil, emailUsuario, children }: AppShellProps) {
  const caminho = usePathname() ?? '/';
  const semCasca = ROTAS_SEM_CASCA.some(
    (rota) => caminho === rota || caminho.startsWith(`${rota}/`),
  );

  if (semCasca) {
    return <main className="flex min-h-dvh flex-col">{children}</main>;
  }

  const nomeExibido = perfil?.nome?.trim() || emailUsuario || null;

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-superficie focus:px-3 focus:py-2 focus:text-vinho"
      >
        Ir para o conteúdo
      </a>

      <header data-app-shell className="bg-vinho text-creme">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 pt-3 pb-2 sm:px-4">
          <div className="min-w-0">
            <p className="font-titulo text-lg leading-tight sm:text-xl">E.E.E. Novo Mundo</p>
            <p className="truncate text-sm text-creme/75">
              Gestão de obra · Viana &amp; Moura Construções
            </p>
          </div>

          {nomeExibido ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-right text-sm leading-tight sm:block">
                <span className="block">{nomeExibido}</span>
                {perfil ? (
                  <span className="text-creme/70">{PROFILE_LABELS[perfil.perfil]}</span>
                ) : null}
              </span>
              <SignOutButton />
            </div>
          ) : null}
        </div>
      </header>

      <MainNav perfil={perfil?.perfil ?? null} />

      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-3 py-5 sm:px-4">
        {children}
      </main>

      <footer data-app-shell className="border-t border-borda px-3 py-4 text-center text-sm text-tinta-suave">
        Escopo: tudo dentro do muro perimetral da elevatória. Cronograma sincronizado do
        Smartsheet.
      </footer>
    </div>
  );
}
