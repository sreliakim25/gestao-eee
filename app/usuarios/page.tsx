/**
 * /usuarios — o gestor libera acessos e define papéis.
 *
 * A leitura aqui usa a sessão do gestor, então quem chega sem ser gestor
 * simplesmente não recebe linha nenhuma da RLS. O `redirect` abaixo é para a
 * pessoa ver uma resposta clara em vez de uma lista vazia inexplicável.
 */

import { redirect } from 'next/navigation';
import { ListaUsuarios, type UsuarioLinha } from '@/components/usuarios/ListaUsuarios';
import { Alert, Card, PageHeading } from '@/components/ui/primitives';
import { exigirSessao } from '@/lib/dados/sessao';
import { createClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'Acessos — EEE Novo Mundo',
};

/** Pendentes primeiro: a tela é uma fila de trabalho. */
const ORDEM_STATUS: Record<string, number> = { pendente: 0, ativo: 1, bloqueado: 2 };

export default async function UsuariosPage() {
  const sessao = await exigirSessao();
  if (sessao.papel !== 'gestor') redirect('/');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('perfis')
    .select('id, nome, perfil, status')
    .order('nome');

  const usuarios: UsuarioLinha[] = [...(data ?? [])].sort(
    (a, b) =>
      (ORDEM_STATUS[a.status] ?? 9) - (ORDEM_STATUS[b.status] ?? 9) ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  );

  const pendentes = usuarios.filter((u) => u.status === 'pendente').length;

  return (
    <>
      <PageHeading
        title="Acessos"
        subtitle={
          pendentes > 0
            ? `${pendentes} pessoa(s) aguardando liberação`
            : 'Quem entra no app e com qual perfil'
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert tone="erro">Não foi possível carregar a lista de acessos.</Alert>
        </div>
      ) : null}

      <Card className="mb-4">
        <p className="text-sm text-tinta-suave">
          Qualquer pessoa pode criar uma conta em <strong>/cadastro</strong>, escolhendo a própria
          senha. A conta nasce sem acesso: ela só enxerga os dados da obra depois que você libera
          aqui — e o bloqueio é aplicado no banco, não só na tela.
        </p>
      </Card>

      <ListaUsuarios usuarios={usuarios} meuId={sessao.usuarioId} />
    </>
  );
}
