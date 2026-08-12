/**
 * POST /api/sincronizar — puxa o cronograma do Smartsheet sob demanda.
 *
 * É o mesmo `sincronizarCronograma()` que o CLI e o cron chamam; a rota só
 * cuida de quem pode disparar e de não deixar a chamada virar metralhadora
 * contra a API do Smartsheet.
 *
 * POR QUE NÃO SINCRONIZAR AUTOMATICAMENTE A CADA LOGIN
 *
 * Seria o desenho óbvio e é armadilha: com N pessoas abrindo o app pela manhã,
 * são N syncs simultâneos contra o mesmo cronograma — bate no rate limit do
 * Smartsheet (429), e cada carregamento de página fica refém de uma chamada de
 * rede externa. Além disso o resultado seria imprevisível: a página às vezes
 * demora 6s, às vezes não. Preferimos: cron para a rotina, botão para o "acabei
 * de mexer na planilha", e um aviso na tela quando o dado está velho.
 */

import { NextResponse } from 'next/server';
import { ErroSync, sincronizarCronograma } from '@/lib/smartsheet/sincronizar';
import { ErroSmartsheet } from '@/scripts/import/smartsheet-api';
import { getPerfilAtual, getUsuarioAtual } from '@/lib/supabase/server';

/** Intervalo mínimo entre syncs disparados pela tela. */
const INTERVALO_MINIMO_MS = 60_000;

/**
 * Trava em memória do processo. Não é distribuída — em várias instâncias na
 * Vercel cada uma tem a sua. Serve contra clique repetido e duplo-clique, que
 * é o caso real; contra abuso deliberado seria preciso um lock no Postgres.
 */
let ultimoSyncMs = 0;
let sincronizando = false;

export async function POST() {
  const usuario = await getUsuarioAtual().catch(() => null);
  if (!usuario) {
    return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  }

  // Sincronizar reescreve o cronograma inteiro: é ação de gestor.
  const perfil = await getPerfilAtual().catch(() => null);
  if (perfil?.perfil !== 'gestor') {
    return NextResponse.json(
      { erro: 'Apenas o perfil gestor pode sincronizar o cronograma.' },
      { status: 403 },
    );
  }

  if (sincronizando) {
    return NextResponse.json(
      { erro: 'Já existe uma sincronização em andamento.' },
      { status: 409 },
    );
  }

  const agora = Date.now();
  if (agora - ultimoSyncMs < INTERVALO_MINIMO_MS) {
    const faltam = Math.ceil((INTERVALO_MINIMO_MS - (agora - ultimoSyncMs)) / 1000);
    return NextResponse.json(
      { erro: `Aguarde ${faltam}s antes de sincronizar de novo.` },
      { status: 429 },
    );
  }

  sincronizando = true;
  try {
    const resultado = await sincronizarCronograma();
    ultimoSyncMs = Date.now();
    return NextResponse.json({ resultado });
  } catch (erro) {
    // Mensagens tratadas podem ir para a tela; o resto vira genérico, porque
    // erro cru de banco ou da API carrega detalhe de infraestrutura.
    if (erro instanceof ErroSync || erro instanceof ErroSmartsheet) {
      const status = erro instanceof ErroSync && erro.codigo === 'config' ? 503 : 502;
      return NextResponse.json({ erro: erro.message }, { status });
    }
    console.error('[sincronizar] falha inesperada:', erro);
    return NextResponse.json(
      { erro: 'Não foi possível sincronizar agora. Tente novamente em alguns minutos.' },
      { status: 502 },
    );
  } finally {
    sincronizando = false;
  }
}
