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
import type { PerfilUsuario, PerfilUsuarioEnum, StatusAcesso } from '@/types/database';

export interface SessaoApp {
  usuarioId: string;
  email: string | null;
  perfil: PerfilUsuario | null;
  /** Atalho para a renderização condicional. `campo` é o menor privilégio. */
  papel: PerfilUsuarioEnum;
  /** Liberação de acesso. Só `ativo` enxerga o app. */
  status: StatusAcesso;
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
        status: perfil?.status ?? 'pendente',
      };
    }
  } catch {
    // Supabase indisponível ou não configurado: trata como não autenticado.
    sessao = null;
  }

  if (!sessao) redirect('/login');

  // Cadastro feito, acesso ainda não liberado (ou revogado): a pessoa está
  // autenticada, mas não entra no app. A RLS já a impediria de ler qualquer
  // coisa; este desvio existe para ela ver uma explicação em vez de telas
  // vazias sem motivo aparente.
  if (sessao.status !== 'ativo') redirect('/aguardando');

  return sessao;
}
