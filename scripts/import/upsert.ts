/**
 * Montagem de payload e escrita no Supabase.
 *
 * As funções de MONTAGEM são puras (testáveis, e é onde mora a garantia de
 * idempotência); as de ESCRITA usam `createAdminClient()` (service role,
 * só server-side) e ficam isoladas no fim do arquivo.
 *
 * Este módulo não altera nada em `lib/supabase/` nem em `lib/calculos/`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AtividadeInsert,
  Database,
  GrupoMacroInsert,
  TipoElementoVisual,
} from '@/types/database';
import type { AtividadeParseada, GrupoParseado } from './tipos';

/** Nome do projeto no banco — mesmo de `supabase/seed.sql`. */
export const NOME_PROJETO = 'E.E.E. - NOVO MUNDO';

/** Chave lógica de uma atividade no banco: (grupo_macro_id, caminho_wbs). */
export function chaveAtividade(grupoMacroId: string, caminhoWbs: string): string {
  return `${grupoMacroId}::${caminhoWbs}`;
}

/**
 * Payload de `grupos_macro`, ordenado e determinístico.
 *
 * A chave é `nome_smartsheet` (string crua do .xlsx). `nome` é o rótulo legível
 * da UI e o import NÃO pode sobrescrevê-lo: como o upsert atualiza todas as
 * colunas enviadas, mandar o nome cru em caixa alta apagaria os rótulos do
 * `seed.sql` a cada importação ("Drenagem — Canal e muro" viraria
 * "DRENAGEM - Canal e muro"). Por isso `rotulosExistentes` — mapa
 * nome_smartsheet → nome já gravado — tem precedência sobre o fallback.
 */
export function montarPayloadGrupos(
  grupos: readonly GrupoParseado[],
  projetoId: string,
  rotulosExistentes: ReadonlyMap<string, string> = new Map(),
): GrupoMacroInsert[] {
  return grupos
    .map((g) => ({
      projeto_id: projetoId,
      nome_smartsheet: g.nomeSmartsheet,
      nome: rotulosExistentes.get(g.nomeSmartsheet) ?? g.nomeFallback,
      // Rollup da linha de nível 1. NULL quando a coluna vem vazia no export —
      // isso significa "sem apontamento", não zero (ver lib/calculos/oficial.ts).
      percentual_smartsheet: g.percentualConcluido,
      ordem: g.ordem,
    }))
    .sort((a, b) => a.ordem - b.ordem);
}

/**
 * Payload de `atividades`.
 *
 * Idempotência: a função é determinística — mesma entrada gera exatamente o
 * mesmo array (mesma ordem, mesmos valores), sem `Date.now()`, sem `uuid()`,
 * sem `criado_em`/`atualizado_em` (esses são do banco). Por isso rodar o import
 * duas vezes seguidas produz o mesmo `on conflict do update`, sem duplicar.
 *
 * Colisões de chave dentro do lote são resolvidas mantendo a PRIMEIRA
 * ocorrência e devolvendo as descartadas, para o relatório não mentir.
 * (O parser já avisa sobre elas; aqui a proteção é contra o erro
 * "ON CONFLICT DO UPDATE command cannot affect row a second time" do Postgres.)
 */
export function montarPayloadAtividades(
  atividades: readonly AtividadeParseada[],
  idPorGrupo: ReadonlyMap<string, string>,
  idPorTipoElemento: ReadonlyMap<TipoElementoVisual, string>,
): { linhas: AtividadeInsert[]; descartadasPorColisao: AtividadeParseada[]; semGrupo: AtividadeParseada[] } {
  const linhas: AtividadeInsert[] = [];
  const descartadasPorColisao: AtividadeParseada[] = [];
  const semGrupo: AtividadeParseada[] = [];
  const chavesUsadas = new Set<string>();

  for (const atividade of atividades) {
    const grupoMacroId = idPorGrupo.get(atividade.grupoMacroSmartsheet);
    if (!grupoMacroId) {
      semGrupo.push(atividade);
      continue;
    }
    const chave = chaveAtividade(grupoMacroId, atividade.caminhoWbsTexto);
    if (chavesUsadas.has(chave)) {
      descartadasPorColisao.push(atividade);
      continue;
    }
    chavesUsadas.add(chave);

    linhas.push({
      grupo_macro_id: grupoMacroId,
      // Só vincula elemento visual se a regra casou E o elemento existe no banco.
      elemento_visual_id: atividade.tipoElementoVisual
        ? (idPorTipoElemento.get(atividade.tipoElementoVisual) ?? null)
        : null,
      wbs_nivel: atividade.wbsNivel,
      // Identidade da linha; `nome` é só o rótulo curto exibido pela UI.
      caminho_wbs: atividade.caminhoWbsTexto,
      nome: atividade.nome,
      predecessores: atividade.predecessores,
      duracao_dias: atividade.duracaoDias,
      data_inicio_planejada: atividade.dataInicioPlanejada,
      data_fim_planejada: atividade.dataFimPlanejada,
      percentual_concluido: atividade.percentualConcluido,
      caminho_critico: atividade.caminhoCritico,
      folga_dias: atividade.folgaDias,
      recurso: atividade.recurso,
    });
  }

  return { linhas, descartadasPorColisao, semGrupo };
}

/** Atividade que existe no banco mas não veio no .xlsx desta rodada. */
export interface AtividadeOrfa {
  id: string;
  /** Nome curto, só para o relatório ficar legível. */
  nome: string;
  /** Identidade real da linha — é sobre ela que a comparação é feita. */
  caminhoWbs: string;
  grupoMacroId: string;
  grupoMacroNome: string;
  percentualConcluido: number;
}

/**
 * Detecta atividades órfãs: no banco, dentro dos grupos macro em escopo, mas
 * ausentes do payload atual. A comparação é por (grupo_macro_id, caminho_wbs),
 * a chave real da tabela — nunca pelo nome curto, que se repete.
 *
 * Causa mais provável: alguém renomeou algo no Smartsheet. ATENÇÃO: como a
 * identidade é o caminho WBS inteiro, renomear um nó ANCESTRAL muda o caminho
 * de TODOS os descendentes de uma vez — é normal um único rename no Smartsheet
 * produzir dezenas de órfãs aqui, e isso não significa que a obra perdeu
 * atividades.
 *
 * NUNCA apagar em silêncio: uma órfã pode ter `avancos_semanais`, fotos e RDO
 * pendurados nela. O script só remove com `--prune` explícito.
 */
export function detectarOrfas(
  existentes: readonly AtividadeOrfa[],
  payload: readonly AtividadeInsert[],
): AtividadeOrfa[] {
  const chavesDoPayload = new Set(
    payload.map((linha) => chaveAtividade(linha.grupo_macro_id, linha.caminho_wbs)),
  );
  return existentes.filter(
    (existente) =>
      !chavesDoPayload.has(chaveAtividade(existente.grupoMacroId, existente.caminhoWbs)),
  );
}

/* -------------------------------------------------------------------------- */
/* Escrita no banco                                                           */
/* -------------------------------------------------------------------------- */

type Cliente = SupabaseClient<Database>;

/** Tamanho de lote do upsert — evita payload gigante numa requisição só. */
const TAMANHO_LOTE = 100;

export async function buscarProjetoId(cliente: Cliente): Promise<string> {
  const { data, error } = await cliente
    .from('projetos')
    .select('id')
    .eq('nome', NOME_PROJETO)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar o projeto "${NOME_PROJETO}": ${error.message}`);
  if (!data) {
    throw new Error(
      `Projeto "${NOME_PROJETO}" não existe no banco. Rode as migrations e o ` +
        `supabase/seed.sql antes do import.`,
    );
  }
  return data.id;
}

/**
 * Lê os grupos macro já existentes do projeto.
 * Devolve os dois mapas que o resto do import precisa, ambos chaveados pela
 * string crua do .xlsx: nome_smartsheet → id e nome_smartsheet → rótulo da UI.
 */
export async function buscarGruposExistentes(
  cliente: Cliente,
  projetoId: string,
): Promise<{ idPorGrupo: Map<string, string>; rotulos: Map<string, string> }> {
  const { data, error } = await cliente
    .from('grupos_macro')
    .select('id, nome, nome_smartsheet')
    .eq('projeto_id', projetoId);
  if (error) throw new Error(`Falha ao ler grupos_macro: ${error.message}`);
  return {
    idPorGrupo: new Map((data ?? []).map((g) => [g.nome_smartsheet, g.id])),
    rotulos: new Map((data ?? []).map((g) => [g.nome_smartsheet, g.nome])),
  };
}

/** Upsert por (projeto_id, nome_smartsheet). Devolve nome_smartsheet → id. */
export async function upsertGrupos(
  cliente: Cliente,
  payload: readonly GrupoMacroInsert[],
): Promise<Map<string, string>> {
  const { data, error } = await cliente
    .from('grupos_macro')
    .upsert(payload as GrupoMacroInsert[], { onConflict: 'projeto_id,nome_smartsheet' })
    .select('id, nome_smartsheet');
  if (error) throw new Error(`Falha no upsert de grupos_macro: ${error.message}`);
  return new Map((data ?? []).map((g) => [g.nome_smartsheet, g.id]));
}

/** Mapa tipo do enum → id do elemento visual já semeado. */
export async function buscarElementosVisuais(
  cliente: Cliente,
): Promise<Map<TipoElementoVisual, string>> {
  const { data, error } = await cliente.from('elementos_visuais').select('id, tipo');
  if (error) throw new Error(`Falha ao ler elementos_visuais: ${error.message}`);
  return new Map((data ?? []).map((e) => [e.tipo, e.id]));
}

export async function buscarAtividadesExistentes(
  cliente: Cliente,
  idPorGrupo: ReadonlyMap<string, string>,
): Promise<AtividadeOrfa[]> {
  const ids = [...idPorGrupo.values()];
  if (ids.length === 0) return [];
  const nomePorId = new Map([...idPorGrupo].map(([nome, id]) => [id, nome]));
  const { data, error } = await cliente
    .from('atividades')
    .select('id, nome, caminho_wbs, grupo_macro_id, percentual_concluido')
    .in('grupo_macro_id', ids);
  if (error) throw new Error(`Falha ao ler atividades existentes: ${error.message}`);
  return (data ?? []).map((a) => ({
    id: a.id,
    nome: a.nome,
    caminhoWbs: a.caminho_wbs,
    grupoMacroId: a.grupo_macro_id,
    grupoMacroNome: nomePorId.get(a.grupo_macro_id) ?? '(grupo desconhecido)',
    percentualConcluido: a.percentual_concluido,
  }));
}

export async function upsertAtividades(
  cliente: Cliente,
  payload: readonly AtividadeInsert[],
): Promise<number> {
  let gravadas = 0;
  for (let i = 0; i < payload.length; i += TAMANHO_LOTE) {
    const lote = payload.slice(i, i + TAMANHO_LOTE);
    const { data, error } = await cliente
      .from('atividades')
      .upsert(lote as AtividadeInsert[], { onConflict: 'grupo_macro_id,caminho_wbs' })
      .select('id');
    if (error) {
      throw new Error(`Falha no upsert de atividades (lote ${i / TAMANHO_LOTE + 1}): ${error.message}`);
    }
    gravadas += data?.length ?? 0;
  }
  return gravadas;
}

/** Remove órfãs. Só é chamada quando `--prune` foi passado explicitamente. */
export async function removerOrfas(cliente: Cliente, orfas: readonly AtividadeOrfa[]): Promise<number> {
  if (orfas.length === 0) return 0;
  const { error } = await cliente
    .from('atividades')
    .delete()
    .in('id', orfas.map((o) => o.id));
  if (error) throw new Error(`Falha ao remover atividades órfãs: ${error.message}`);
  return orfas.length;
}

/**
 * Grava o rollup da linha raiz do Smartsheet em `projetos.percentual_smartsheet`.
 *
 * Esse é o número OFICIAL de evolução física exibido no Painel — o mesmo que a
 * equipe vê no Smartsheet. Não o recalculamos: importamos o valor exportado,
 * porque replicar a fórmula de rollup exigiria adivinhar o arredondamento e
 * quebraria em silêncio se a Smartsheet mudasse a regra.
 *
 * `agoraIso` é injetado para o script continuar determinístico nos testes.
 */
export async function atualizarPercentualDoProjeto(
  cliente: Cliente,
  projetoId: string,
  percentualSmartsheet: number | null,
  agoraIso: string,
): Promise<void> {
  const { error } = await cliente
    .from('projetos')
    .update({
      percentual_smartsheet: percentualSmartsheet,
      percentual_smartsheet_em: agoraIso,
    })
    .eq('id', projetoId);

  if (error) {
    throw new Error(`Falha ao gravar o percentual oficial do projeto: ${error.message}`);
  }
}
