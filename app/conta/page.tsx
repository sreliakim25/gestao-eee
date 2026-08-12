/**
 * /conta — dados da própria conta e troca de senha.
 *
 * É para cá que o link de recuperação por e-mail aponta: o Supabase abre uma
 * sessão de recuperação e redireciona; sem esta tela, o link apenas logava a
 * pessoa sem nunca pedir a senha nova.
 */

import { TrocarSenha } from '@/components/auth/TrocarSenha';
import { Card, PageHeading } from '@/components/ui/primitives';
import { exigirSessao } from '@/lib/dados/sessao';
import { PROFILE_LABELS } from '@/components/layout/navigation';

export const metadata = {
  title: 'Minha conta — EEE Novo Mundo',
};

export default async function ContaPage() {
  const sessao = await exigirSessao();

  return (
    <>
      <PageHeading title="Minha conta" subtitle="Dados de acesso e senha" />

      <Card className="mb-4">
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-tinta-suave">E-mail</dt>
            <dd className="font-semibold text-tinta">{sessao.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-tinta-suave">Nome</dt>
            <dd className="font-semibold text-tinta">{sessao.perfil?.nome ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-tinta-suave">Perfil</dt>
            <dd className="font-semibold text-tinta">{PROFILE_LABELS[sessao.papel]}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-tinta-suave">
          O perfil define o que você enxerga e só pode ser alterado por um gestor.
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 font-titulo text-lg text-vinho">Trocar senha</h2>
        <TrocarSenha email={sessao.email} />
      </Card>
    </>
  );
}
