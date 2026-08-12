/**
 * /aguardando — a pessoa está autenticada, mas o acesso não foi liberado.
 *
 * Não usa `exigirSessao()` de propósito: aquela função redireciona para cá
 * quando o status não é `ativo`, e chamá-la aqui criaria um laço infinito.
 */

import Link from 'next/link';
import { SignOutButton } from '@/components/layout/SignOutButton';
import { getPerfilAtual, getUsuarioAtual } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Acesso aguardando liberação — EEE Novo Mundo',
};

export default async function AguardandoPage() {
  const usuario = await getUsuarioAtual().catch(() => null);
  if (!usuario) redirect('/login');

  const perfil = await getPerfilAtual().catch(() => null);
  // Já liberado enquanto a página estava aberta: manda para o app.
  if (perfil?.status === 'ativo') redirect('/');

  const bloqueado = perfil?.status === 'bloqueado';

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <h1 className="font-titulo text-2xl text-vinho">
        {bloqueado ? 'Acesso bloqueado' : 'Aguardando liberação'}
      </h1>

      <div className="mt-4 rounded border-l-[3px] border-ouro bg-superficie px-4 py-3">
        <p className="text-sm text-tinta">
          {bloqueado ? (
            <>
              Seu acesso a este app foi revogado. Se acredita que isso é um engano, procure o
              gestor da obra.
            </>
          ) : (
            <>
              Sua conta foi criada, mas ainda precisa ser liberada por um gestor da obra. Assim
              que isso acontecer, é só entrar de novo — a senha continua a mesma.
            </>
          )}
        </p>
        <p className="mt-2 text-xs text-tinta-suave">
          Conta: {usuario.email}
          {perfil?.nome ? ` · ${perfil.nome}` : ''}
        </p>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Link
          href="/aguardando"
          className="text-sm font-semibold text-ouro-escuro underline underline-offset-2"
        >
          Já fui liberado, verificar
        </Link>
        <SignOutButton />
      </div>
    </main>
  );
}
