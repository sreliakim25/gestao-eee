/**
 * PATCH /api/usuarios — gestor libera acesso, muda papel ou bloqueia.
 *
 * Escreve com a SESSÃO DO GESTOR (não com a service role) de propósito: assim
 * a política de RLS `perfis_escrita_gestor` continua sendo a autoridade. Se
 * usássemos a service role, a RLS seria contornada e a checagem de permissão
 * passaria a viver só neste arquivo — uma segunda fonte da verdade, que é
 * exatamente o que a RLS existe para evitar.
 *
 * O banco ainda protege dois casos que a UI sozinha não garantiria: o trigger
 * `perfis_proteger_ultimo_gestor` impede deixar a obra sem nenhum gestor, e a
 * própria RLS recusa a escrita se quem chamou não for gestor.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPerfilAtual, getUsuarioAtual } from '@/lib/supabase/server';
import type { PerfilUsuarioEnum, PerfilUsuarioUpdate, StatusAcesso } from '@/types/database';

const PAPEIS: PerfilUsuarioEnum[] = ['gestor', 'fiscal', 'campo'];
const STATUS: StatusAcesso[] = ['pendente', 'ativo', 'bloqueado'];

export async function PATCH(request: Request) {
  const usuario = await getUsuarioAtual().catch(() => null);
  if (!usuario) {
    return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  }

  const perfilAtual = await getPerfilAtual().catch(() => null);
  if (perfilAtual?.perfil !== 'gestor' || perfilAtual.status !== 'ativo') {
    return NextResponse.json({ erro: 'Apenas gestores podem liberar acessos.' }, { status: 403 });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: 'Requisição inválida.' }, { status: 400 });
  }

  const { id, perfil, status } = (corpo ?? {}) as Record<string, unknown>;

  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ erro: 'Usuário não informado.' }, { status: 400 });
  }
  if (perfil !== undefined && !PAPEIS.includes(perfil as PerfilUsuarioEnum)) {
    return NextResponse.json({ erro: 'Perfil inválido.' }, { status: 400 });
  }
  if (status !== undefined && !STATUS.includes(status as StatusAcesso)) {
    return NextResponse.json({ erro: 'Status inválido.' }, { status: 400 });
  }
  if (id === usuario.id) {
    // Trava de bom senso: mesmo sendo gestor, mexer no próprio acesso pela
    // tela é o caminho mais fácil para se trancar para fora.
    return NextResponse.json(
      { erro: 'Você não pode alterar o próprio acesso por aqui.' },
      { status: 400 },
    );
  }

  // Tipado como o Update da tabela: `Record<string, unknown>` faz o
  // supabase-js recusar o payload por não conseguir provar as colunas.
  const alteracoes: PerfilUsuarioUpdate = {};
  if (perfil !== undefined) alteracoes.perfil = perfil as PerfilUsuarioEnum;
  if (status !== undefined) {
    alteracoes.status = status as StatusAcesso;
    if (status === 'ativo') {
      alteracoes.liberado_em = new Date().toISOString();
      alteracoes.liberado_por = usuario.id;
    }
  }
  if (Object.keys(alteracoes).length === 0) {
    return NextResponse.json({ erro: 'Nada para alterar.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from('perfis').update(alteracoes).eq('id', id);

  if (error) {
    // A mensagem do trigger do último gestor é informativa e pode ir para a
    // tela; o resto vira genérico.
    const ultimoGestor = /último gestor/i.test(error.message);
    console.error('[usuarios] falha ao atualizar perfil:', error.message);
    return NextResponse.json(
      {
        erro: ultimoGestor
          ? 'Não é possível remover o último gestor ativo do sistema.'
          : 'Não foi possível salvar a alteração.',
      },
      { status: ultimoGestor ? 409 : 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
