import 'server-only';

/**
 * lib/dados/consultas.ts — leituras do Supabase usadas pelas telas de
 * acompanhamento (Painel, Cronograma, Curva S, Lançamento, Diário).
 *
 * Regras seguidas aqui:
 *  - nenhuma fórmula: estas funções só carregam linhas; todo indicador vem de
 *    `@/lib/calculos`;
 *  - falha nunca derruba a tela — devolve lista vazia + `erro` para a UI exibir
 *    um estado vazio honesto (nada de dado inventado).
 */

import { createClient } from '@/lib/supabase/server';
import type {
  Atividade,
  AvancoSemanal,
  DiarioObra,
  ElementoVisual,
  FotoEvidencia,
  GrupoMacro,
  Projeto,
} from '@/types/database';

/** Fim planejado da obra segundo o Smartsheet — usado só se o banco não responder. */
export const DATA_FIM_PLANEJADA_PADRAO = '2027-01-26';

export interface ContextoCronograma {
  projeto: Projeto | null;
  grupos: GrupoMacro[];
  elementos: ElementoVisual[];
  atividades: Atividade[];
  /** Mensagem curta quando a leitura falhou (Supabase fora, RLS, rede). */
  erro: string | null;
}

const CONTEXTO_VAZIO: ContextoCronograma = {
  projeto: null,
  grupos: [],
  elementos: [],
  atividades: [],
  erro: null,
};

/** Mensagem de erro sem vazar detalhe interno de banco para a tela. */
function mensagemDeErro(prefixo: string): string {
  return `${prefixo} Verifique a conexão com o Supabase e as permissões do seu perfil.`;
}

/**
 * Carrega projeto, grupos macro, elementos visuais e as 317 atividades.
 * Uma consulta só por tabela (nada de N+1) e ordenação já feita no banco.
 */
export async function carregarContextoCronograma(): Promise<ContextoCronograma> {
  try {
    const supabase = await createClient();

    const [projetoRes, gruposRes, elementosRes, atividadesRes] = await Promise.all([
      supabase.from('projetos').select('*').order('criado_em').limit(1).maybeSingle(),
      supabase.from('grupos_macro').select('*').order('ordem'),
      supabase.from('elementos_visuais').select('*').order('ordem'),
      supabase
        .from('atividades')
        .select('*')
        .order('data_inicio_planejada', { ascending: true, nullsFirst: false })
        .order('nome'),
    ]);

    const falhou =
      projetoRes.error || gruposRes.error || elementosRes.error || atividadesRes.error;

    return {
      projeto: projetoRes.data ?? null,
      grupos: gruposRes.data ?? [],
      elementos: elementosRes.data ?? [],
      atividades: atividadesRes.data ?? [],
      erro: falhou ? mensagemDeErro('Não foi possível carregar o cronograma.') : null,
    };
  } catch {
    return { ...CONTEXTO_VAZIO, erro: mensagemDeErro('Cronograma indisponível.') };
  }
}

/** Lançamentos semanais (base do realizado da Curva S). */
export async function carregarAvancosSemanais(): Promise<{
  avancos: AvancoSemanal[];
  erro: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('avancos_semanais')
      .select('*')
      .order('semana_referencia');

    return {
      avancos: data ?? [],
      erro: error ? mensagemDeErro('Não foi possível carregar os lançamentos.') : null,
    };
  } catch {
    return { avancos: [], erro: mensagemDeErro('Lançamentos indisponíveis.') };
  }
}

/** Últimos lançamentos registrados, para o histórico da tela de Lançamento. */
export async function carregarUltimosAvancos(limite = 20): Promise<AvancoSemanal[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('avancos_semanais')
      .select('*')
      .order('registrado_em', { ascending: false })
      .limit(limite);
    return data ?? [];
  } catch {
    return [];
  }
}

export interface DiarioDoDia {
  registro: DiarioObra | null;
  fotos: FotoEvidencia[];
  /** Datas que já possuem RDO, para a navegação por data. */
  datasComRegistro: string[];
  erro: string | null;
}

/** RDO de uma data específica ('YYYY-MM-DD') + fotos vinculadas. */
export async function carregarDiarioDoDia(data: string): Promise<DiarioDoDia> {
  try {
    const supabase = await createClient();

    const [registroRes, datasRes] = await Promise.all([
      supabase.from('diario_obra').select('*').eq('data', data).maybeSingle(),
      supabase
        .from('diario_obra')
        .select('data')
        .order('data', { ascending: false })
        .limit(90),
    ]);

    let fotos: FotoEvidencia[] = [];
    if (registroRes.data?.id) {
      const { data: fotosData } = await supabase
        .from('fotos_evidencia')
        .select('*')
        .eq('diario_obra_id', registroRes.data.id)
        .order('criado_em');
      fotos = fotosData ?? [];
    }

    return {
      registro: registroRes.data ?? null,
      fotos,
      datasComRegistro: (datasRes.data ?? []).map((linha) => linha.data),
      erro: registroRes.error
        ? mensagemDeErro('Não foi possível carregar o diário desta data.')
        : null,
    };
  } catch {
    return {
      registro: null,
      fotos: [],
      datasComRegistro: [],
      erro: mensagemDeErro('Diário de obra indisponível.'),
    };
  }
}
