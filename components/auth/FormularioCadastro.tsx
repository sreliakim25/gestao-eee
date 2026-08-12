'use client';

/**
 * Formulário de criação de conta.
 *
 * Fala com `/api/cadastro` (service role no servidor) em vez de chamar
 * `supabase.auth.signUp()` daqui — ver o comentário da rota: sem SMTP próprio,
 * o signUp dependeria de um e-mail de confirmação que não chega de forma
 * confiável.
 */

import Link from 'next/link';
import { useState } from 'react';

const TAMANHO_MINIMO_SENHA = 8;

export function FormularioCadastro() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [concluido, setConcluido] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    // Validação no cliente é conveniência; a rota valida de novo, porque o
    // formulário pode ser contornado.
    if (senha !== confirmacao) {
      setErro('As duas senhas não são iguais.');
      return;
    }
    if (senha.length < TAMANHO_MINIMO_SENHA) {
      setErro(`A senha precisa ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
      return;
    }

    setEnviando(true);
    try {
      const resposta = await fetch('/api/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, senha }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(typeof corpo?.erro === 'string' ? corpo.erro : 'Não foi possível cadastrar.');
        return;
      }
      setConcluido(true);
    } catch {
      setErro('Não foi possível falar com o servidor.');
    } finally {
      setEnviando(false);
    }
  }

  if (concluido) {
    return (
      <div className="rounded border-l-[3px] border-[#2F6B3A] bg-superficie px-4 py-3">
        <p className="font-semibold text-tinta">Cadastro criado.</p>
        <p className="mt-1 text-sm text-tinta-suave">
          Seu acesso ainda precisa ser <strong>liberado por um gestor</strong>. Avise a pessoa
          responsável pela obra; assim que ela liberar, você entra normalmente com o e-mail e a
          senha que acabou de escolher.
        </p>
        <p className="mt-3 text-sm">
          <Link href="/login" className="text-ouro-escuro underline underline-offset-2">
            Ir para a tela de entrada
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div>
        <label htmlFor="nome" className="mb-1 block text-sm font-semibold text-tinta">
          Nome completo
        </label>
        <input
          id="nome"
          type="text"
          required
          autoComplete="name"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full rounded border border-borda bg-superficie px-3 py-2"
        />
        <p className="mt-1 text-xs text-tinta-suave">
          É por ele que o gestor vai te identificar na hora de liberar.
        </p>
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-semibold text-tinta">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-borda bg-superficie px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor="senha" className="mb-1 block text-sm font-semibold text-tinta">
          Senha
        </label>
        <input
          id="senha"
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
        <label htmlFor="confirmacao" className="mb-1 block text-sm font-semibold text-tinta">
          Repita a senha
        </label>
        <input
          id="confirmacao"
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

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded bg-vinho px-4 py-2 font-semibold text-creme disabled:opacity-60"
      >
        {enviando ? 'Criando…' : 'Criar acesso'}
      </button>

      <p className="text-xs text-tinta-suave">
        Criar a conta não libera o acesso: um gestor precisa aprovar antes de você conseguir ver
        os dados da obra.
      </p>
    </form>
  );
}
