import 'server-only';

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 *
 * Um client novo por request (nunca compartilhar entre requests).
 * Continua usando a anon key + sessão do usuário, então a RLS permanece ativa.
 */

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PerfilUsuario } from '@/types/database';
import { getSupabaseAnonKey, getSupabaseUrl } from './env';

export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components não podem escrever cookies. A renovação do token
          // é feita pelo middleware (lib/supabase/middleware.ts), então ignorar
          // aqui é seguro.
        }
      },
    },
  });
}

/** Usuário autenticado da request atual (null se não houver sessão válida). */
export async function getUsuarioAtual() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Perfil do usuário autenticado (gestor/fiscal/campo).
 * Retorna null se não houver sessão ou se a linha em `perfis` ainda não existir.
 */
export async function getPerfilAtual(): Promise<PerfilUsuario | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from('perfis').select('*').eq('id', user.id).maybeSingle();
  return data ?? null;
}
