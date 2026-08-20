import 'server-only';

/**
 * lib/dados/ugbs.ts — leituras do Supabase para a navegação UGB → dispositivo.
 *
 * Separado de `lib/dados/consultas.ts` de propósito: aquele arquivo é o
 * contexto do dispositivo único de hoje (Painel/Cronograma/Curva S/...) e não
 * deve ser tocado nesta frente (Fase 2 do plano multi-dispositivo). Este
 * arquivo só resolve a casca de navegação: quantas UGBs existem, quantos
 * dispositivos cada uma tem, e quais são.
 *
 * Mesmas regras de `consultas.ts`: nenhuma fórmula aqui, e falha nunca derruba
 * a tela — devolve lista vazia + `erro` para a UI mostrar um estado honesto.
 */

import { createClient } from '@/lib/supabase/server';
import { contarDispositivosPorUgb, type UgbComContagem } from '@/components/ugbs/UgbGrid';
import type { Projeto, Ugb } from '@/types/database';

export type { UgbComContagem };

/** Mensagem de erro sem vazar detalhe interno de banco para a tela. */
function mensagemDeErro(prefixo: string): string {
  return `${prefixo} Verifique a conexão com o Supabase e as permissões do seu perfil.`;
}

/**
 * Todas as UGBs, ordenadas por `ordem`, com a contagem de dispositivos de
 * cada uma. Duas consultas ao todo (uma em `ugbs`, uma em `projetos`) — o
 * agrupamento em si (puro, testável) mora em `components/ugbs/UgbGrid`.
 */
export async function carregarUgbsComContagem(): Promise<{
  ugbs: UgbComContagem[];
  erro: string | null;
}> {
  try {
    const supabase = await createClient();

    const [ugbsRes, projetosRes] = await Promise.all([
      supabase.from('ugbs').select('*').order('ordem'),
      supabase.from('projetos').select('id, ugb_id'),
    ]);

    const falhou = ugbsRes.error || projetosRes.error;

    return {
      ugbs: contarDispositivosPorUgb(ugbsRes.data ?? [], projetosRes.data ?? []),
      erro: falhou ? mensagemDeErro('Não foi possível carregar as UGBs.') : null,
    };
  } catch {
    return { ugbs: [], erro: mensagemDeErro('UGBs indisponíveis.') };
  }
}

export interface ContextoUgb {
  ugb: Ugb | null;
  /** Dispositivos (linhas de `projetos`) desta UGB, ordenados por nome. */
  projetos: Projeto[];
  erro: string | null;
}

/** UGB por id + os dispositivos vinculados a ela. */
export async function carregarUgbComDispositivos(ugbId: string): Promise<ContextoUgb> {
  try {
    const supabase = await createClient();

    const [ugbRes, projetosRes] = await Promise.all([
      supabase.from('ugbs').select('*').eq('id', ugbId).maybeSingle(),
      supabase.from('projetos').select('*').eq('ugb_id', ugbId).order('nome'),
    ]);

    const falhou = ugbRes.error || projetosRes.error;

    return {
      ugb: ugbRes.data ?? null,
      projetos: projetosRes.data ?? [],
      erro: falhou ? mensagemDeErro('Não foi possível carregar esta UGB.') : null,
    };
  } catch {
    return { ugb: null, projetos: [], erro: mensagemDeErro('UGB indisponível.') };
  }
}
