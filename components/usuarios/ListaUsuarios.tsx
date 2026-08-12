'use client';

/**
 * Liberação de acesso: lista de usuários com papel e status editáveis.
 *
 * Pendentes vêm primeiro porque são os que exigem ação — a lista é uma fila de
 * trabalho, não um cadastro para consulta.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PerfilUsuarioEnum, StatusAcesso } from '@/types/database';
import { PROFILE_LABELS } from '@/components/layout/navigation';

export interface UsuarioLinha {
  id: string;
  nome: string;
  perfil: PerfilUsuarioEnum;
  status: StatusAcesso;
}

const ROTULO_STATUS: Record<StatusAcesso, string> = {
  pendente: 'Aguardando liberação',
  ativo: 'Ativo',
  bloqueado: 'Bloqueado',
};

const ESTILO_STATUS: Record<StatusAcesso, string> = {
  pendente: 'border-ouro',
  ativo: 'border-[#2F6B3A]',
  bloqueado: 'border-vinho',
};

export function ListaUsuarios({
  usuarios,
  meuId,
}: {
  usuarios: readonly UsuarioLinha[];
  meuId: string;
}) {
  const router = useRouter();
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function alterar(id: string, alteracao: { perfil?: string; status?: string }) {
    setSalvandoId(id);
    setErro(null);
    try {
      const resposta = await fetch('/api/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...alteracao }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(typeof corpo?.erro === 'string' ? corpo.erro : 'Falha ao salvar.');
        return;
      }
      router.refresh();
    } catch {
      setErro('Não foi possível falar com o servidor.');
    } finally {
      setSalvandoId(null);
    }
  }

  if (usuarios.length === 0) {
    return <p className="text-sm text-tinta-suave">Nenhum usuário cadastrado ainda.</p>;
  }

  return (
    <div className="space-y-2">
      {erro ? (
        <p role="alert" className="text-sm font-semibold text-vinho">
          {erro}
        </p>
      ) : null}

      <ul className="space-y-2">
        {usuarios.map((usuario) => {
          const souEu = usuario.id === meuId;
          const ocupado = salvandoId === usuario.id;

          return (
            <li
              key={usuario.id}
              className={`rounded border-l-[3px] bg-superficie px-3 py-2 ${ESTILO_STATUS[usuario.status]}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-tinta">
                    {usuario.nome || '(sem nome)'}
                    {souEu ? <span className="text-tinta-suave"> · você</span> : null}
                  </p>
                  <p className="text-xs text-tinta-suave">
                    {ROTULO_STATUS[usuario.status]} · {PROFILE_LABELS[usuario.perfil]}
                  </p>
                </div>

                {souEu ? (
                  <p className="text-xs text-tinta-suave">
                    Seu próprio acesso não é editável aqui.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`perfil-${usuario.id}`}>
                      Perfil de {usuario.nome}
                    </label>
                    <select
                      id={`perfil-${usuario.id}`}
                      value={usuario.perfil}
                      disabled={ocupado}
                      onChange={(e) => alterar(usuario.id, { perfil: e.target.value })}
                      className="rounded border border-borda bg-white px-2 py-1 text-sm"
                    >
                      <option value="gestor">Gestor</option>
                      <option value="fiscal">Fiscal</option>
                      <option value="campo">Campo</option>
                    </select>

                    {usuario.status !== 'ativo' ? (
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => alterar(usuario.id, { status: 'ativo' })}
                        className="rounded bg-vinho px-3 py-1 text-sm font-semibold text-creme disabled:opacity-60"
                      >
                        {ocupado ? '…' : 'Liberar acesso'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => alterar(usuario.id, { status: 'bloqueado' })}
                        className="rounded border border-vinho px-3 py-1 text-sm font-semibold text-vinho disabled:opacity-60"
                      >
                        {ocupado ? '…' : 'Bloquear'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-tinta-suave">
        Bloquear não apaga a conta: preserva a autoria dos lançamentos e RDOs já registrados.
      </p>
    </div>
  );
}
