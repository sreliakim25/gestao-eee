/**
 * GET /api/cron/sincronizar — sync agendado (Vercel Cron), TODOS os dispositivos.
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
 * `npm run smartsheet:sync -- --apply` num cron do sistema (só cobre a Novo
 * Mundo — para todos os dispositivos, chamar esta rota mesmo).
 */

import { NextResponse } from 'next/server';
import { ErroSync, sincronizarTodosDispositivos } from '@/lib/smartsheet/sincronizar';

/**
 * `sincronizarTodosDispositivos` itera SEQUENCIALMENTE (uma chamada à API do
 * Smartsheet por vez, para respeitar o rate limit) por dispositivo × planilha
 * ativa. Com ~8 dispositivos confirmados e poucas planilhas cada, o padrão de
 * 10s da Vercel já não bastava com um dispositivo só; 60s também fica curto
 * quando o lote cresce. 120s dá folga sem exagerar — se o número de planilhas
 * ativas crescer muito, este valor precisa ser revisto de novo.
 */
export const maxDuration = 120;

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
    const relatorio = await sincronizarTodosDispositivos();
    const sucesso = relatorio.filter((item) => item.ok);
    const falhas = relatorio.filter((item) => !item.ok);

    for (const item of sucesso) {
      console.log(
        `[cron] sync ok "${item.nomeProjeto}" (sheet ${item.sheetId}, papel ${item.papel}): ` +
          `${item.resultado?.atividades} atividades, ${item.resultado?.percentualSmartsheet}%, ` +
          `término ${item.resultado?.dataFimPlanejada}, ${item.resultado?.orfas.length ?? 0} órfã(s).`,
      );
    }
    for (const item of falhas) {
      // Isolamento de falha: uma planilha com erro é logada e reportada, mas
      // NUNCA impede as demais de rodar (ver sincronizarTodosDispositivos).
      console.error(`[cron] falha em "${item.nomeProjeto}" (sheet ${item.sheetId}): ${item.erro}`);
    }

    return NextResponse.json({
      ok: falhas.length === 0,
      totalPlanilhas: relatorio.length,
      sucesso: sucesso.length,
      falhas: falhas.map((item) => ({
        nomeProjeto: item.nomeProjeto,
        sheetId: item.sheetId,
        papel: item.papel,
        erro: item.erro,
      })),
    });
  } catch (erro) {
    // Chega aqui só se a PRÓPRIA listagem de planilhas ativas falhar (ex.:
    // banco fora do ar) — falha de UMA planilha nunca cai neste catch.
    const tratado = erro instanceof ErroSync;
    console.error('[cron] falha ao listar planilhas ativas:', tratado ? (erro as Error).message : erro);
    return NextResponse.json(
      { ok: false, erro: tratado ? (erro as Error).message : 'Falha no sync agendado.' },
      { status: 502 },
    );
  }
}
