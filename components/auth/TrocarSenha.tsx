'use client';

/**
 * Troca da própria senha.
 *
 * É também o destino do link de recuperação por e-mail. O Supabase, ao abrir
 * aquele link, cria uma sessão de recuperação e manda a pessoa para o site —
 * era exatamente isso que fazia o link "entrar direto sem pedir senha nova":
 * o app não tinha nenhuma tela para completar a troca. Agora tem.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const TAMANHO_MINIMO_SENHA = 8;

export function TrocarSenha({ email }: { email: string | null }) {
  const router = useRouter();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setOk(false);

    if (senha !== confirmacao) {
      setErro('As duas senhas não são iguais.');
      return;
    }
    if (senha.length < TAMANHO_MINIMO_SENHA) {
      setErro(`A senha precisa ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
      return;
    }

    setSalvando(true);
    const { error } = await createClient().auth.updateUser({ password: senha });
    setSalvando(false);

    if (error) {
      // Mensagem do Supabase é em inglês; traduzimos as duas mais comuns e
      // mantemos o resto genérico em vez de exibir texto cru ao usuário.
      const texto = /same as the old|should be different/i.test(error.message)
        ? 'A nova senha precisa ser diferente da atual.'
        : 'Não foi possível trocar a senha. Tente novamente.';
      setErro(texto);
      return;
    }

    setSenha('');
    setConfirmacao('');
    setOk(true);
    router.refresh();
  }

  return (
    <form onSubmit={salvar} className="max-w-md space-y-3">
      {email ? (
        <p className="text-sm text-tinta-suave">
          Conta: <strong className="text-tinta">{email}</strong>
        </p>
      ) : null}

      <div>
        <label htmlFor="novaSenha" className="mb-1 block text-sm font-semibold text-tinta">
          Nova senha
        </label>
        <input
          id="novaSenha"
          type="password"
          required
          minLength={TAMANHO_MINIMO_SENHA}
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="w-full rounded border border-borda bg-superficie px-3 py-2"
        />
        <p className="mt-1 text-xs text-tinta-suave">
          Mínimo de {TAMANHO_MINIMO_SENHA} caracteres.
        </p>
      </div>

      <div>
        <label htmlFor="confirmaSenha" className="mb-1 block text-sm font-semibold text-tinta">
          Repita a nova senha
        </label>
        <input
          id="confirmaSenha"
          type="password"
          required
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          className="w-full rounded border border-borda bg-superficie px-3 py-2"
        />
      </div>

      {erro ? (
        <p role="alert" className="text-sm font-semibold text-vinho">
          {erro}
        </p>
      ) : null}
      {ok ? (
        <p role="status" className="text-sm font-semibold text-[#2F6B3A]">
          Senha alterada. Use a nova na próxima entrada.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={salvando}
        className="rounded bg-vinho px-4 py-2 text-sm font-semibold text-creme disabled:opacity-60"
      >
        {salvando ? 'Salvando…' : 'Trocar senha'}
      </button>
    </form>
  );
}
