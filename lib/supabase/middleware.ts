/**
 * Helper de sessão para o middleware do Next.js.
 *
 * Server Components não conseguem escrever cookies, então a renovação do token
 * do Supabase precisa acontecer aqui, no middleware, gravando os cookies na
 * resposta. Sem isso o usuário sofre logout aleatório.
 *
 * Uso (arquivo middleware.ts na raiz — pertence ao agente ui-modulos):
 *
 *   import { atualizarSessao } from '@/lib/supabase/middleware';
 *   export async function middleware(request: NextRequest) {
 *     return atualizarSessao(request);
 *   }
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';
import { getSupabaseAnonKey, getSupabaseUrl } from './env';

export async function atualizarSessao(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Cabeçalhos anti-cache exigidos pelo @supabase/ssr ao gravar cookies de
        // autenticação (evita um CDN servir a sessão de um usuário para outro).
        for (const [chave, valor] of Object.entries(headers ?? {})) {
          response.headers.set(chave, valor);
        }
      },
    },
  });

  // IMPORTANTE: chamar getUser() aqui — é o que dispara o refresh do token.
  await supabase.auth.getUser();

  return response;
}
