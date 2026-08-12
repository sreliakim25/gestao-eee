/**
 * middleware.ts — renovação da sessão do Supabase + porteiro das rotas.
 *
 * 1) `atualizarSessao()` (lib/supabase/middleware.ts) renova o token e grava os
 *    cookies na resposta. Sem isso o usuário sofre logout aleatório, porque
 *    Server Components não conseguem escrever cookies.
 * 2) Porteiro: sem cookie de sessão, qualquer rota do app redireciona para
 *    /login (guardando o destino em `?proximo=`); com sessão, /login redireciona
 *    para o Painel.
 *
 * IMPORTANTE: a checagem aqui é por presença de cookie — barata e suficiente
 * para o desvio de navegação. A verificação de verdade (token válido + perfil)
 * é feita em cada página com `exigirSessao()` (lib/dados/sessao.ts) e, no fim
 * da linha, pela RLS do Postgres. Middleware nunca é a única barreira.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { atualizarSessao } from '@/lib/supabase/middleware';

const ROTA_LOGIN = '/login';

/**
 * Rotas que NÃO são navegação de usuário e por isso não podem ser
 * redirecionadas para o login.
 *
 * `/api/cron/*` autentica por `CRON_SECRET`, não por sessão. Redirecioná-la
 * fazia o cron da Vercel receber 307 para /login e encerrar como sucesso — o
 * sync agendado simplesmente nunca rodaria, e sem erro nenhum no log.
 */
const PREFIXO_CRON = '/api/cron';

/** Demais rotas de API: respondem JSON, então recebem 401 em vez de redirect. */
const PREFIXO_API = '/api';

/** O @supabase/ssr grava a sessão em cookies `sb-<ref>-auth-token[.n]`. */
function temCookieDeSessao(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(({ name, value }) => name.startsWith('sb-') && name.includes('auth-token') && value);
}

export async function middleware(request: NextRequest) {
  let resposta: NextResponse;
  try {
    resposta = await atualizarSessao(request);
  } catch {
    // Ambiente sem variáveis do Supabase (build/preview): segue sem sessão em
    // vez de derrubar a aplicação inteira com erro 500.
    resposta = NextResponse.next({ request });
  }

  const { pathname, search } = request.nextUrl;
  const autenticado = temCookieDeSessao(request);
  const ehLogin = pathname === ROTA_LOGIN || pathname.startsWith(`${ROTA_LOGIN}/`);

  // O cron se autentica sozinho, no próprio route handler.
  if (pathname === PREFIXO_CRON || pathname.startsWith(`${PREFIXO_CRON}/`)) {
    return resposta;
  }

  // Cliente que chama fetch() espera JSON. Um 307 para /login devolveria HTML
  // e o `response.json()` estouraria com erro de parse, escondendo o 401 real.
  if (!autenticado && pathname.startsWith(`${PREFIXO_API}/`)) {
    return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  }

  if (!autenticado && !ehLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = ROTA_LOGIN;
    destino.search = '';
    destino.searchParams.set('proximo', `${pathname}${search}`);
    return redirecionarPreservandoCookies(destino, resposta);
  }

  if (autenticado && ehLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = '/';
    destino.search = '';
    return redirecionarPreservandoCookies(destino, resposta);
  }

  return resposta;
}

/** Redireciona sem perder os cookies renovados por `atualizarSessao`. */
function redirecionarPreservandoCookies(destino: URL, origem: NextResponse): NextResponse {
  const redirecionamento = NextResponse.redirect(destino);
  for (const cookie of origem.cookies.getAll()) {
    redirecionamento.cookies.set(cookie);
  }
  return redirecionamento;
}

export const config = {
  /**
   * Roda em tudo, menos assets estáticos, imagens otimizadas e favicon —
   * renovar sessão em cada .png é desperdício de função serverless.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|svg/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
