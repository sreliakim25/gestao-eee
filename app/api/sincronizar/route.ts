/**
 * POST /api/sincronizar — puxa o cronograma do Smartsheet sob demanda, para
 * UM dispositivo (projeto).
 *
 * É o mesmo `sincronizarPlanilhaPrincipal()` que o CLI usa; a rota só cuida de
 * quem pode disparar e de não deixar a chamada virar metralhadora contra a
 * API do Smartsheet.
 *
 * DISPOSITIVO ATUAL: este app está virando multi-dispositivo, e a resolução
 * de "qual é o dispositivo atualmente selecionado" (cookie) é responsabilidade
 * de outra camada (fluxo de navegação/seleção). Esta rota não decide de onde
 * o `projetoId` vem — só exige que quem chama mande explicitamente
 * `POST { projetoId }` no corpo. Ausência de `projetoId` é erro claro (400),
 * nunca um fallback silencioso para "o único projeto que existe".
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
import { ErroSync, sincronizarPlanilhaPrincipal } from '@/lib/smartsheet/sincronizar';
import { ErroSmartsheet } from '@/scripts/import/smartsheet-api';
import { getPerfilAtual, getUsuarioAtual } from '@/lib/supabase/server';

/** Intervalo mínimo entre syncs disparados pela tela, POR DISPOSITIVO. */
const INTERVALO_MINIMO_MS = 60_000;

/**
 * Travas em memória do processo, chaveadas por `projetoId`. Não são
 * distribuídas — em várias instâncias na Vercel cada uma tem a sua. Servem
 * contra clique repetido e duplo-clique, que é o caso real; contra abuso
 * deliberado seria preciso um lock no Postgres.
 *
 * Chavear por `projetoId` (em vez de uma única trava global, como antes) é o
 * que garante que sincronizar o dispositivo A não trave o botão do
 * dispositivo B.
 */
const ultimoSyncPorProjeto = new Map<string, number>();
const sincronizandoPorProjeto = new Set<string>();

export async function POST(request: Request) {
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

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    corpo = null;
  }
  const projetoId =
    corpo && typeof corpo === 'object' && typeof (corpo as { projetoId?: unknown }).projetoId === 'string'
      ? (corpo as { projetoId: string }).projetoId
      : null;

  if (!projetoId) {
    return NextResponse.json(
      { erro: 'Informe o projetoId do dispositivo a sincronizar.' },
      { status: 400 },
    );
  }

  if (sincronizandoPorProjeto.has(projetoId)) {
    return NextResponse.json(
      { erro: 'Já existe uma sincronização em andamento para este dispositivo.' },
      { status: 409 },
    );
  }

  const agora = Date.now();
  const ultimoSyncMs = ultimoSyncPorProjeto.get(projetoId) ?? 0;
  if (agora - ultimoSyncMs < INTERVALO_MINIMO_MS) {
    const faltam = Math.ceil((INTERVALO_MINIMO_MS - (agora - ultimoSyncMs)) / 1000);
    return NextResponse.json(
      { erro: `Aguarde ${faltam}s antes de sincronizar de novo.` },
      { status: 429 },
    );
  }

  sincronizandoPorProjeto.add(projetoId);
  try {
    const resultado = await sincronizarPlanilhaPrincipal(projetoId);
    ultimoSyncPorProjeto.set(projetoId, Date.now());
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
    sincronizandoPorProjeto.delete(projetoId);
  }
}
