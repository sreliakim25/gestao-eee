/**
 * POST /api/cadastro — a pessoa cria a própria conta e a própria senha.
 *
 * A conta nasce SEM acesso: o trigger cria o perfil com status `pendente`, e a
 * RLS só solta dado para quem está `ativo`. Um gestor libera em /usuarios.
 *
 * POR QUE PASSAR PELO SERVIDOR EM VEZ DE `supabase.auth.signUp()` NO CLIENTE
 *
 * O projeto está com "Confirm email" ligado e sem SMTP próprio. Pelo signUp
 * normal, o Supabase mandaria um e-mail de confirmação pelo servidor nativo —
 * limitado a poucos envios por hora e com entrega ruim — e a pessoa ficaria
 * travada esperando um link que talvez nunca chegasse.
 *
 * Aqui o usuário é criado já confirmado (`email_confirm: true`) usando a
 * service role. O portão não é o e-mail: é a liberação do gestor, que é o que
 * de fato importa numa obra — confirmar endereço prova que o e-mail existe,
 * não que a pessoa deve entrar.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** Mínimo do Supabase é 6; exigimos mais por ser acesso a dado de obra. */
const TAMANHO_MINIMO_SENHA = 8;

/** Janela por IP, para o endereço público não virar criador de contas em massa. */
const JANELA_MS = 60_000;
const MAXIMO_POR_JANELA = 5;
const tentativasPorIp = new Map<string, { contador: number; reiniciaEm: number }>();

function excedeuLimite(ip: string, agora: number): boolean {
  const registro = tentativasPorIp.get(ip);
  if (!registro || agora > registro.reiniciaEm) {
    tentativasPorIp.set(ip, { contador: 1, reiniciaEm: agora + JANELA_MS });
    return false;
  }
  registro.contador += 1;
  return registro.contador > MAXIMO_POR_JANELA;
}

function emailValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim());
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconhecido';
  if (excedeuLimite(ip, Date.now())) {
    return NextResponse.json(
      { erro: 'Muitas tentativas. Aguarde um minuto e tente de novo.' },
      { status: 429 },
    );
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: 'Requisição inválida.' }, { status: 400 });
  }

  const { email, senha, nome } = (corpo ?? {}) as Record<string, unknown>;

  if (!emailValido(email)) {
    return NextResponse.json({ erro: 'Informe um e-mail válido.' }, { status: 400 });
  }
  if (typeof senha !== 'string' || senha.length < TAMANHO_MINIMO_SENHA) {
    return NextResponse.json(
      { erro: `A senha precisa ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres.` },
      { status: 400 },
    );
  }
  if (typeof nome !== 'string' || nome.trim().length < 3) {
    return NextResponse.json(
      { erro: 'Informe seu nome completo — é ele que o gestor vê ao liberar o acesso.' },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password: senha,
    email_confirm: true,
    user_metadata: { nome: nome.trim() },
  });

  if (error) {
    // E-mail já cadastrado não vira mensagem específica: dizer "esse e-mail já
    // existe" a quem não está autenticado entrega quem tem conta no sistema.
    // O texto abaixo serve para os dois casos sem mentir sobre o que aconteceu.
    console.error('[cadastro] falha ao criar usuário:', error.message);
    return NextResponse.json(
      {
        erro:
          'Não foi possível concluir o cadastro. Se você já tem conta, use a tela de entrada; ' +
          'se o problema persistir, procure o gestor da obra.',
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    mensagem:
      'Cadastro criado. Seu acesso precisa ser liberado por um gestor antes de você entrar.',
  });
}
