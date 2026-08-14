/**
 * lib/smartsheet/sincronizar.ts — o sync do cronograma, em um lugar só.
 *
 * Chamado por três caminhos:
 *   - `scripts/sync-smartsheet.ts` (CLI, dedicado à EEE Novo Mundo)
 *   - `app/api/sincronizar/route.ts` (botão na tela — dispositivo atual)
 *   - `app/api/cron/sincronizar/route.ts` (cron — todos os dispositivos)
 *
 * Estar aqui, e não duplicado em cada caminho, é o que garante que os três
 * façam exatamente a mesma coisa. Duas cópias divergiriam na primeira correção
 * aplicada só de um lado — e o sintoma seria dado diferente conforme quem
 * sincronizou, que é o tipo de bug que ninguém encontra.
 *
 * SOMENTE SERVIDOR: usa a service role key.
 *
 * A guarda é em runtime (`typeof window`) e não o pacote `server-only`, porque
 * este módulo também roda no CLI/cron via tsx — fora do Next, `server-only`
 * resolve para a variante de client e lança na importação.
 */

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/smartsheet/sincronizar só pode ser importado no servidor: ele usa a service role key.',
  );
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { createAdminClient } from '@/lib/supabase/admin';
import { obterConfiguracaoDispositivo } from '@/lib/smartsheet/config-dispositivos';
import { interpretarLinhas } from '@/scripts/import/parser';
import { buscarPlanilha } from '@/scripts/import/smartsheet-api';
import {
  buscarAtividadesExistentes,
  buscarElementosVisuais,
  buscarGruposExistentes,
  atualizarPercentualDoProjeto,
  atualizarUltimoSincronizadoPlanilha,
  detectarOrfas,
  montarPayloadAtividades,
  montarPayloadGrupos,
  registrarHistoricoCronograma,
  upsertAtividades,
  upsertGrupos,
} from '@/scripts/import/upsert';

type Cliente = SupabaseClient<Database>;

/** Papel padrão de uma planilha quando não informado — dita rollup e datas do projeto. */
const PAPEL_PADRAO = 'principal';

export interface ResultadoSync {
  planilha: { nome: string; modificadaEm: string };
  grupos: number;
  atividades: number;
  folhas: number;
  criticas: number;
  percentualSmartsheet: number | null;
  dataInicioPlanejada: string | null;
  dataFimPlanejada: string | null;
  comRowId: number;
  orfas: { nome: string; caminhoWbs: string }[];
  sincronizadoEm: string;
}

export class ErroSync extends Error {
  constructor(
    message: string,
    readonly codigo: 'config' | 'smartsheet' | 'banco' | 'integridade',
  ) {
    super(message);
    this.name = 'ErroSync';
  }
}

/** Parâmetros de uma sincronização — um dispositivo × uma planilha. */
export interface ParametrosSincronizacao {
  /** Id do dispositivo (projeto) no banco. Quem chama já resolveu isso. */
  projetoId: string;
  /**
   * `projetos.nome` — usado para (a) achar a configuração de import própria
   * do dispositivo em `lib/smartsheet/config-dispositivos.ts` e (b) mensagens
   * de erro/log legíveis. Não é usado para resolver `projetoId`: isso já veio
   * pronto de quem chama, para não pagar uma query redundante por dispositivo
   * a cada iteração de `sincronizarTodosDispositivos`.
   */
  nomeProjeto: string;
  /** Id da planilha do Smartsheet a sincronizar (ver `projeto_planilhas_smartsheet.sheet_id`). */
  sheetId: string;
  /**
   * Papel da planilha para o dispositivo. `'principal'` (padrão) dita o
   * rollup de % e as datas do projeto — planilhas de outro papel (RAP, REL...)
   * ainda têm seus grupos/atividades importados, mas não sobrescrevem
   * `projetos.percentual_smartsheet` / `data_inicio_planejada` / `data_fim_planejada`.
   */
  papel?: string;
}

/**
 * Executa o sync de UMA planilha para UM dispositivo e devolve o relatório.
 *
 * `agora` é injetável para o resultado ser determinístico em teste.
 */
export async function sincronizarCronograma(
  parametros: ParametrosSincronizacao,
  agora: Date = new Date(),
): Promise<ResultadoSync> {
  const token = process.env.SMARTSHEET_TOKEN ?? '';
  const { projetoId, nomeProjeto, sheetId, papel = PAPEL_PADRAO } = parametros;

  if (!token) {
    throw new ErroSync(
      'Sincronização não configurada neste ambiente (SMARTSHEET_TOKEN).',
      'config',
    );
  }
  if (!sheetId) {
    throw new ErroSync(`Planilha do Smartsheet não informada para "${nomeProjeto}".`, 'config');
  }

  const { linhas, rowIdPorLinha, planilha } = await buscarPlanilha(token, sheetId);
  const configuracaoDispositivo = obterConfiguracaoDispositivo(nomeProjeto);
  const resultado = interpretarLinhas(linhas, configuracaoDispositivo);

  const cliente = createAdminClient();
  const ehPrincipal = papel === PAPEL_PADRAO;
  const agoraIso = agora.toISOString();

  const { rotulos } = await buscarGruposExistentes(cliente, projetoId);
  const idPorGrupo = await upsertGrupos(
    cliente,
    montarPayloadGrupos(resultado.grupos, projetoId, rotulos),
  );

  // O rollup de % e as datas do PROJETO só vêm da planilha principal — uma
  // planilha secundária (RAP/REL) não pode sobrescrever esses campos.
  if (ehPrincipal) {
    await atualizarPercentualDoProjeto(
      cliente,
      projetoId,
      resultado.raiz.percentualConcluido,
      agoraIso,
    );
    await cliente
      .from('projetos')
      .update({
        data_inicio_planejada: resultado.raiz.dataInicioPlanejada,
        data_fim_planejada: resultado.raiz.dataFimPlanejada,
        smartsheet_sheet_id: sheetId,
        smartsheet_sincronizado_em: agoraIso,
      })
      .eq('id', projetoId);
  }

  await atualizarUltimoSincronizadoPlanilha(cliente, projetoId, sheetId, agoraIso);

  const idPorTipoElemento = await buscarElementosVisuais(cliente, projetoId);
  const { linhas: payload } = montarPayloadAtividades(
    resultado.atividades,
    idPorGrupo,
    idPorTipoElemento,
  );

  // rowId é a chave estável. A chave do mapa inclui o grupo porque
  // `caminho_wbs` só é único DENTRO de um grupo macro.
  const chave = (grupoId: string, caminho: string) => `${grupoId}::${caminho}`;
  const rowIdPorChave = new Map<string, string>();
  for (const atividade of resultado.atividades) {
    const grupoId = idPorGrupo.get(atividade.grupoMacroSmartsheet);
    const rowId = rowIdPorLinha.get(atividade.linhaPlanilha);
    if (grupoId && rowId) rowIdPorChave.set(chave(grupoId, atividade.caminhoWbsTexto), rowId);
  }
  for (const item of payload) {
    const rowId = rowIdPorChave.get(chave(item.grupo_macro_id, item.caminho_wbs));
    if (rowId) item.smartsheet_row_id = rowId;
  }

  const atribuidos = payload.map((p) => p.smartsheet_row_id).filter(Boolean);
  if (new Set(atribuidos).size !== atribuidos.length) {
    throw new ErroSync(
      'rowId repetido no payload: duas atividades apontariam para a mesma linha do Smartsheet. Nada foi gravado.',
      'integridade',
    );
  }

  const existentes = await buscarAtividadesExistentes(cliente, idPorGrupo);
  const orfas = detectarOrfas(existentes, payload);
  await upsertAtividades(cliente, payload);

  const folhas = resultado.atividades.filter((a) => a.ehFolha);

  // Idem ao rollup: o histórico diário reflete a planilha principal, para não
  // misturar o número oficial do dispositivo com o conteúdo de uma planilha
  // secundária.
  if (ehPrincipal) {
    await registrarHistoricoCronograma(cliente, projetoId, agoraIso.slice(0, 10), {
      dataInicioPlanejada: resultado.raiz.dataInicioPlanejada,
      dataFimPlanejada: resultado.raiz.dataFimPlanejada,
      percentualSmartsheet: resultado.raiz.percentualConcluido,
      totalAtividades: folhas.length,
      atividadesCriticas: resultado.atividades.filter((a) => a.caminhoCritico).length,
      atividadesConcluidas: folhas.filter((a) => a.percentualConcluido >= 100).length,
      origem: 'sync',
    });
  }

  return {
    planilha: { nome: planilha.nome, modificadaEm: planilha.modificadaEm },
    grupos: idPorGrupo.size,
    atividades: payload.length,
    folhas: folhas.length,
    criticas: resultado.atividades.filter((a) => a.caminhoCritico).length,
    percentualSmartsheet: resultado.raiz.percentualConcluido,
    dataInicioPlanejada: resultado.raiz.dataInicioPlanejada,
    dataFimPlanejada: resultado.raiz.dataFimPlanejada,
    comRowId: atribuidos.length,
    orfas: orfas.map((o) => ({ nome: o.nome, caminhoWbs: o.caminhoWbs })),
    sincronizadoEm: agoraIso,
  };
}

/** Resultado de sincronizar uma combinação (dispositivo × planilha) dentro de um lote. */
export interface ResultadoSincronizacaoDispositivo {
  projetoId: string;
  nomeProjeto: string;
  sheetId: string;
  papel: string;
  ok: boolean;
  resultado?: ResultadoSync;
  /** Presente só quando `ok === false` — mensagem tratada, nunca o erro cru. */
  erro?: string;
}

/**
 * Sincroniza uma planilha isoladamente: nunca deixa uma exceção subir e
 * derrubar o lote inteiro. É o que garante que uma planilha com problema
 * (token sem acesso, coluna removida, 429...) não aborte as demais.
 */
async function sincronizarItemIsolado(
  item: ParametrosSincronizacao,
  agora: Date,
): Promise<ResultadoSincronizacaoDispositivo> {
  const papel = item.papel ?? PAPEL_PADRAO;
  try {
    const resultado = await sincronizarCronograma(item, agora);
    return { projetoId: item.projetoId, nomeProjeto: item.nomeProjeto, sheetId: item.sheetId, papel, ok: true, resultado };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(
      `[sincronizar] falha em "${item.nomeProjeto}" (sheet ${item.sheetId}, papel ${papel}): ${mensagem}`,
    );
    return { projetoId: item.projetoId, nomeProjeto: item.nomeProjeto, sheetId: item.sheetId, papel, ok: false, erro: mensagem };
  }
}

/** Todas as planilhas ATIVAS de todos os dispositivos, com o nome do dispositivo já resolvido. */
async function listarPlanilhasAtivas(cliente: Cliente): Promise<ParametrosSincronizacao[]> {
  const { data, error } = await cliente
    .from('projeto_planilhas_smartsheet')
    .select('projeto_id, sheet_id, papel')
    .eq('ativo', true);
  if (error) throw new ErroSync(`Falha ao listar planilhas ativas: ${error.message}`, 'banco');
  if (!data || data.length === 0) return [];

  const idsProjetos = [...new Set(data.map((p) => p.projeto_id))];
  const { data: projetos, error: erroProjetos } = await cliente
    .from('projetos')
    .select('id, nome')
    .in('id', idsProjetos);
  if (erroProjetos) throw new ErroSync(`Falha ao ler os dispositivos: ${erroProjetos.message}`, 'banco');
  const nomePorProjeto = new Map((projetos ?? []).map((p) => [p.id, p.nome]));

  return data.map((p) => ({
    projetoId: p.projeto_id,
    nomeProjeto: nomePorProjeto.get(p.projeto_id) ?? '(dispositivo desconhecido)',
    sheetId: p.sheet_id,
    papel: p.papel,
  }));
}

/**
 * Sincroniza a planilha PRINCIPAL de UM dispositivo — a que dita rollup de %
 * e datas do projeto. É o que o botão "Sincronizar" da tela dispara: um sync
 * único e imediato do cronograma principal do dispositivo selecionado.
 *
 * Planilhas secundárias (RAP, REL...) do mesmo dispositivo, se houver, ficam
 * para `sincronizarTodosDispositivos` (cron) — o botão não é o lugar para um
 * lote de N chamadas à API do Smartsheet disparado por clique.
 */
export async function sincronizarPlanilhaPrincipal(
  projetoId: string,
  agora: Date = new Date(),
): Promise<ResultadoSync> {
  const cliente = createAdminClient();

  const { data: projeto, error: erroProjeto } = await cliente
    .from('projetos')
    .select('id, nome')
    .eq('id', projetoId)
    .maybeSingle();
  if (erroProjeto) throw new ErroSync(`Falha ao ler o dispositivo: ${erroProjeto.message}`, 'banco');
  if (!projeto) throw new ErroSync('Dispositivo não encontrado.', 'config');

  const { data: planilha, error: erroPlanilha } = await cliente
    .from('projeto_planilhas_smartsheet')
    .select('sheet_id, papel')
    .eq('projeto_id', projetoId)
    .eq('papel', PAPEL_PADRAO)
    .eq('ativo', true)
    .maybeSingle();
  if (erroPlanilha) {
    throw new ErroSync(`Falha ao ler a planilha do dispositivo: ${erroPlanilha.message}`, 'banco');
  }
  if (!planilha) {
    throw new ErroSync(
      `"${projeto.nome}" não tem planilha principal do Smartsheet ativa configurada.`,
      'config',
    );
  }

  return sincronizarCronograma(
    { projetoId, nomeProjeto: projeto.nome, sheetId: planilha.sheet_id, papel: planilha.papel },
    agora,
  );
}

/**
 * Sincroniza TODOS os dispositivos com planilha ativa (`projeto_planilhas_smartsheet.ativo`).
 * Usado pelo cron.
 *
 * SEQUENCIAL DE PROPÓSITO: nunca `Promise.all` aqui — a API do Smartsheet tem
 * rate limit (HTTP 429) por token, e o token é o mesmo para todos os
 * dispositivos (`SMARTSHEET_TOKEN` é de conta, não por planilha).
 *
 * ISOLAMENTO DE FALHA: cada combinação (dispositivo × planilha) é sincronizada
 * por `sincronizarItemIsolado`, que nunca lança — uma planilha com problema
 * não aborta as demais. O relatório devolvido traz sucesso/erro por item; quem
 * chama decide o que fazer com falhas parciais.
 */
export async function sincronizarTodosDispositivos(
  agora: Date = new Date(),
): Promise<ResultadoSincronizacaoDispositivo[]> {
  const cliente = createAdminClient();
  const itens = await listarPlanilhasAtivas(cliente);

  const relatorio: ResultadoSincronizacaoDispositivo[] = [];
  for (const item of itens) relatorio.push(await sincronizarItemIsolado(item, agora));
  return relatorio;
}
