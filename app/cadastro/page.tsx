/**
 * /cadastro — a pessoa cria a própria conta.
 *
 * Criar conta não dá acesso: o perfil nasce pendente e um gestor libera.
 * A tela diz isso antes do envio, para ninguém achar que vai entrar e depois
 * bater numa parede sem explicação.
 */

import Link from 'next/link';
import { FormularioCadastro } from '@/components/auth/FormularioCadastro';

export const metadata = {
  title: 'Criar acesso — EEE Novo Mundo',
};

export default function CadastroPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <h1 className="font-titulo text-2xl text-vinho">Criar acesso</h1>
      <p className="mt-1 mb-5 text-sm text-tinta-suave">
        Gestão de obra · E.E.E. Novo Mundo
      </p>

      <FormularioCadastro />

      <p className="mt-5 text-sm text-tinta-suave">
        Já tem acesso?{' '}
        <Link href="/login" className="text-ouro-escuro underline underline-offset-2">
          Entrar
        </Link>
      </p>
    </main>
  );
}
