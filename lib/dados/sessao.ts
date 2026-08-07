import 'server-only';

/**
 * lib/dados/sessao.ts — verificação autoritativa de sessão nas páginas.
 *
 * O middleware faz o desvio barato (presença de cookie); aqui o token é
 * realmente validado contra o Supabase e o perfil (gestor/fiscal/campo) é
 * carregado para a renderização condicional. A última barreira continua sendo
 * a RLS do Postgres.
 */

import { redirect } from 'next/navigation';
import { getPerfilAtual, getUsuarioAtual } from '@/lib/supabase/server';
import type { PerfilUsuario, PerfilUsuarioEnum } from '@/types/database';

export interface SessaoApp {
  usuarioId: string;
  email: string | null;
  perfil: PerfilUsuario | null;
  /** Atalho para a renderização condicional. `campo` é o menor privilégio. */
  papel: PerfilUsuarioEnum;
}

/** Devolve a sessão atual ou redireciona para o login. */
export async function exigirSessao(): Promise<SessaoApp> {
  let sessao: SessaoApp | null = null;

  try {
    const usuario = await getUsuarioAtual();
    if (usuario) {
      const perfil = await getPerfilAtual();
      sessao = {
        usuarioId: usuario.id,
        email: usuario.email ?? null,
        perfil,
        papel: perfil?.perfil ?? 'campo',
      };
    }
  } catch {
    // Supabase indisponível ou não configurado: trata como não autenticado.
    sessao = null;
  }

  if (!sessao) redirect('/login');
  return sessao;
}
