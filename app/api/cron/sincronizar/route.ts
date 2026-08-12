/**
 * GET /api/cron/sincronizar — sync agendado (Vercel Cron).
 *
 * Garante o registro diário do cronograma mesmo que ninguém abra o app. É o
 * que faz `historico_cronograma` virar uma série de verdade em vez de uma
 * coleção de dias em que alguém lembrou de clicar.
 *
 * AUTENTICAÇÃO: esta rota não tem sessão de usuário — quem chama é a
 * infraestrutura. A Vercel envia `Authorization: Bearer $CRON_SECRET`; sem
 * conferir isso, qualquer pessoa na internet dispararia o sync com um GET.
 *
 * Agendamento em `vercel.json`. Fora da Vercel, o mesmo efeito se obtém com
 * `npm run smartsheet:sync -- --apply` num cron do sistema.
 */

import { NextResponse } from 'next/server';
import { ErroSync, sincronizarCronograma } from '@/lib/smartsheet/sincronizar';
import { ErroSmartsheet } from '@/scripts/import/smartsheet-api';

/** Sync pode passar de 10s; o padrão da Vercel derrubaria no meio. */
export const maxDuration = 60;

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    // Falha fechada: sem segredo configurado, a rota não roda. O contrário
    // deixaria um gatilho aberto em produção por esquecimento de variável.
    return NextResponse.json({ erro: 'CRON_SECRET não configurado.' }, { status: 503 });
  }

  if (request.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const resultado = await sincronizarCronograma();
    console.log(
      `[cron] sync ok: ${resultado.atividades} atividades, ${resultado.percentualSmartsheet}%, ` +
        `término ${resultado.dataFimPlanejada}, ${resultado.orfas.length} órfã(s).`,
    );
    return NextResponse.json({
      ok: true,
      atividades: resultado.atividades,
      percentual: resultado.percentualSmartsheet,
      dataFimPlanejada: resultado.dataFimPlanejada,
      orfas: resultado.orfas.length,
    });
  } catch (erro) {
    const tratado = erro instanceof ErroSync || erro instanceof ErroSmartsheet;
    console.error('[cron] falha no sync:', tratado ? (erro as Error).message : erro);
    return NextResponse.json(
      { ok: false, erro: tratado ? (erro as Error).message : 'Falha no sync agendado.' },
      { status: 502 },
    );
  }
}
