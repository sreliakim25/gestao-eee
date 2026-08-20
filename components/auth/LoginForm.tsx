'use client';

/**
 * Formulário de login (Supabase Auth, e-mail + senha).
 *
 * Nada de localStorage manual: o @supabase/ssr grava a sessão em cookies, que
 * o middleware renova a cada request.
 */

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Alert } from '@/components/ui/primitives';

interface LoginFormProps {
  /** Rota para onde voltar depois de entrar (vem do `?proximo=` do middleware). */
  proximo?: string;
}

/** Mensagem amigável — nunca ecoar o erro cru do Supabase para a tela. */
function mensagemDeLogin(codigo: string | undefined): string {
  if (codigo === 'invalid_credentials') return 'E-mail ou senha incorretos.';
  if (codigo === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar.';
  if (codigo === 'over_request_rate_limit') {
    return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.';
  }
  return 'Não foi possível entrar. Verifique os dados e tente novamente.';
}

/**
 * Só aceita destino interno — bloqueia open redirect via `?proximo=`.
 *
 * Sem `?proximo=` (login "solto", não vindo de um redirecionamento de rota
 * protegida), o destino padrão é `/ugbs`: a navegação pós-login começa pela
 * escolha de UGB, não direto no Painel de um dispositivo.
 */
export function destinoSeguro(proximo: string | undefined): string {
  if (!proximo) return '/ugbs';
  if (!proximo.startsWith('/') || proximo.startsWith('//')) return '/ugbs';
  return proximo;
}

export function LoginForm({ proximo }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);

    // Validação no cliente antes de bater no Supabase.
    if (!email.trim() || !senha) {
      setErro('Informe e-mail e senha.');
      return;
    }

    setEnviando(true);
    try {
      const { error } = await createClient().auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });

      if (error) {
        setErro(mensagemDeLogin(error.code));
        return;
      }

      router.replace(destinoSeguro(proximo));
      router.refresh();
    } catch {
      setErro('Serviço de autenticação indisponível. Tente novamente em instantes.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {erro ? <Alert tone="erro">{erro}</Alert> : null}

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-semibold text-tinta">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
          className="w-full rounded-md border border-borda bg-superficie px-3 py-2 text-tinta"
        />
      </div>

      <div>
        <label htmlFor="senha" className="mb-1 block text-sm font-semibold text-tinta">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          value={senha}
          onChange={(evento) => setSenha(evento.target.value)}
          className="w-full rounded-md border border-borda bg-superficie px-3 py-2 text-tinta"
        />
      </div>

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-md bg-vinho px-4 py-2.5 font-semibold text-creme transition-colors hover:bg-vinho-escuro disabled:opacity-60"
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>

      <p className="text-center text-sm text-tinta-suave">
        O acesso é criado pelo gestor da obra. Todo novo usuário entra com perfil de
        campo.
      </p>
    </form>
  );
}
