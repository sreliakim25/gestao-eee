/**
 * /login — entrada do app (Supabase Auth, e-mail + senha).
 *
 * Se já houver sessão válida, redireciona direto para a escolha de UGB
 * (`/ugbs`): o middleware já faz esse desvio pelo cookie, aqui é a
 * confirmação com o token validado.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LoginForm } from '@/components/auth/LoginForm';
import { getUsuarioAtual } from '@/lib/supabase/server';

export const metadata = {
  title: 'Entrar — EEE Novo Mundo',
};

interface LoginPageProps {
  searchParams: Promise<{ proximo?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { proximo } = await searchParams;

  let autenticado = false;
  try {
    autenticado = Boolean(await getUsuarioAtual());
  } catch {
    // Sem Supabase configurado a tela de login ainda precisa abrir.
    autenticado = false;
  }
  if (autenticado) redirect('/ugbs');

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-creme px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 border-l-4 border-ouro pl-4">
          <h1 className="font-titulo text-3xl text-vinho">E.E.E. Novo Mundo</h1>
          <p className="text-tinta-suave">
            Gestão de obra · Viana &amp; Moura Construções
          </p>
        </div>

        <div className="rounded-lg border border-borda bg-superficie p-5 shadow-sm">
          <LoginForm proximo={proximo} />

          <p className="mt-4 border-t border-borda pt-3 text-sm text-tinta-suave">
            Ainda não tem acesso?{' '}
            <Link href="/cadastro" className="text-ouro-escuro underline underline-offset-2">
              Criar acesso
            </Link>
            <br />
            <span className="text-xs">
              Um gestor precisa liberar antes de você conseguir entrar. Esqueceu a senha? Peça a
              um gestor para redefinir.
            </span>
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-tinta-suave">
          Estação Elevatória de Esgoto — escopo interno ao muro perimetral.
        </p>
      </div>
    </div>
  );
}
