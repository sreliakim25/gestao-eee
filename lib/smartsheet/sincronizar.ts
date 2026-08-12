/**
 * lib/smartsheet/sincronizar.ts — o sync do cronograma, em um lugar só.
 *
 * Chamado por dois caminhos:
 *   - `scripts/sync-smartsheet.ts` (CLI / cron)
 *   - `app/api/sincronizar/route.ts` (botão na tela)
 *
 * Estar aqui, e não duplicado nos dois, é o que garante que o botão e o cron
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

import { createAdminClient } from '@/lib/supabase/admin';
import { interpretarLinhas } from '@/scripts/import/parser';
import { buscarPlanilha } from '@/scripts/import/smartsheet-api';
import {
  buscarAtividadesExistentes,
  buscarElementosVisuais,
  buscarGruposExistentes,
  buscarProjetoId,
  atualizarPercentualDoProjeto,
  detectarOrfas,
  montarPayloadAtividades,
  montarPayloadGrupos,
  registrarHistoricoCronograma,
  upsertAtividades,
  upsertGrupos,
} from '@/scripts/import/upsert';

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

/**
 * Executa o sync completo e devolve o relatório.
 *
 * `agora` é injetável para o resultado ser determinístico em teste.
 */
export async function sincronizarCronograma(
  agora: Date = new Date(),
): Promise<ResultadoSync> {
  const token = process.env.SMARTSHEET_TOKEN ?? '';
  const sheetId = process.env.SMARTSHEET_SHEET_ID ?? '';

  if (!token || !sheetId) {
    throw new ErroSync(
      'Sincronização não configurada neste ambiente (SMARTSHEET_TOKEN / SMARTSHEET_SHEET_ID).',
      'config',
    );
  }

  const { linhas, rowIdPorLinha, planilha } = await buscarPlanilha(token, sheetId);
  const resultado = interpretarLinhas(linhas);

  const cliente = createAdminClient();
  const projetoId = await buscarProjetoId(cliente);

  const { rotulos } = await buscarGruposExistentes(cliente, projetoId);
  const idPorGrupo = await upsertGrupos(
    cliente,
    montarPayloadGrupos(resultado.grupos, projetoId, rotulos),
  );

  const agoraIso = agora.toISOString();
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

  const idPorTipoElemento = await buscarElementosVisuais(cliente);
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
  await registrarHistoricoCronograma(cliente, projetoId, agoraIso.slice(0, 10), {
    dataInicioPlanejada: resultado.raiz.dataInicioPlanejada,
    dataFimPlanejada: resultado.raiz.dataFimPlanejada,
    percentualSmartsheet: resultado.raiz.percentualConcluido,
    totalAtividades: folhas.length,
    atividadesCriticas: resultado.atividades.filter((a) => a.caminhoCritico).length,
    atividadesConcluidas: folhas.filter((a) => a.percentualConcluido >= 100).length,
    origem: 'sync',
  });

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
