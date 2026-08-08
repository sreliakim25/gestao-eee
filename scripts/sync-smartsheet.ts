/**
 * Sync do cronograma direto da API do Smartsheet.
 *
 *   npm run smartsheet:listar                 # descobre o SMARTSHEET_SHEET_ID
 *   npm run smartsheet:sync                   # dry-run (padrão): mostra o diff
 *   npm run smartsheet:sync -- --apply        # grava no banco
 *
 * Substitui o import por .xlsx. Duas vantagens que motivaram a troca:
 *
 *   1. O arquivo envelhece. Na primeira execução deste script a planilha ao
 *      vivo já estava 7% contra os 6% do .xlsx, com o término planejado
 *      12/02/2027 contra 26/01/2027 — duas semanas de defasagem invisível.
 *   2. `rowId` é chave estável: renomear uma atividade-pai deixa de orfanar
 *      todos os descendentes.
 *
 * O parsing é o MESMO do .xlsx (`interpretarLinhas`), então as regras de
 * escopo, hierarquia e vínculo com elemento visual não podem divergir entre os
 * dois caminhos.
 */

import { config } from 'dotenv';
import { createAdminClient } from '@/lib/supabase/admin';
import { interpretarLinhas } from './import/parser';
import {
  ErroSmartsheet,
  buscarPlanilha,
  listarPlanilhas,
} from './import/smartsheet-api';
import {
  atualizarPercentualDoProjeto,
  buscarAtividadesExistentes,
  buscarElementosVisuais,
  buscarGruposExistentes,
  buscarProjetoId,
  detectarOrfas,
  montarPayloadAtividades,
  montarPayloadGrupos,
  upsertAtividades,
  upsertGrupos,
} from './import/upsert';

config({ path: '.env.local', quiet: true });

interface Opcoes {
  aplicar: boolean;
  listar: boolean;
}

function lerOpcoes(argv: readonly string[]): Opcoes {
  const args = new Set(argv.slice(2));
  return { aplicar: args.has('--apply'), listar: args.has('--listar') };
}

function linha(): void {
  console.log('─'.repeat(78));
}

async function main(): Promise<void> {
  const opcoes = lerOpcoes(process.argv);
  const token = process.env.SMARTSHEET_TOKEN ?? '';

  if (opcoes.listar) {
    const planilhas = await listarPlanilhas(token);
    console.log(`\n${planilhas.length} planilha(s) visíveis a este token:\n`);
    for (const p of planilhas) {
      console.log(`  ${p.id.padStart(18)}  ${p.nome}  (modificada ${p.modificadaEm})`);
    }
    console.log('\nCopie o id da planilha do cronograma para SMARTSHEET_SHEET_ID em .env.local.\n');
    return;
  }

  const sheetId = process.env.SMARTSHEET_SHEET_ID ?? '';
  const { linhas, rowIdPorLinha, planilha } = await buscarPlanilha(token, sheetId);
  const resultado = interpretarLinhas(linhas);

  linha();
  console.log(`PLANILHA: ${planilha.nome}  (id ${sheetId})`);
  console.log(`Modificada no Smartsheet em: ${planilha.modificadaEm}`);
  linha();

  const folhas = resultado.atividades.filter((a) => a.ehFolha).length;
  console.log(`  grupos macro            ${resultado.grupos.length}`);
  console.log(`  atividades              ${resultado.atividades.length} (${folhas} folhas, ${resultado.atividades.length - folhas} linhas-mãe)`);
  console.log(`  em caminho crítico      ${resultado.atividades.filter((a) => a.caminhoCritico).length}`);
  console.log(`  rollup da raiz          ${resultado.raiz.percentualConcluido ?? 'NULL'}%`);
  console.log(`  período planejado       ${resultado.raiz.dataInicioPlanejada} a ${resultado.raiz.dataFimPlanejada}`);
  console.log(`  fora de escopo          ${resultado.linhasForaDeEscopo} linha(s) descartada(s)`);

  if (resultado.avisos.length > 0) {
    console.log('\n  AVISOS:');
    for (const aviso of resultado.avisos.slice(0, 10)) console.log(`    ! ${aviso}`);
  }

  if (!opcoes.aplicar) {
    console.log('\nDRY-RUN: nada foi gravado. Rode com --apply para sincronizar.\n');
    return;
  }

  // ---- escrita ------------------------------------------------------------
  let cliente: ReturnType<typeof createAdminClient>;
  try {
    cliente = createAdminClient();
  } catch {
    console.error('\nERRO: --apply exige NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.\n');
    process.exitCode = 1;
    return;
  }

  linha();
  console.log('ESCRITA NO BANCO');
  linha();

  const projetoId = await buscarProjetoId(cliente);
  const { rotulos } = await buscarGruposExistentes(cliente, projetoId);
  const idPorGrupo = await upsertGrupos(
    cliente,
    montarPayloadGrupos(resultado.grupos, projetoId, rotulos),
  );
  console.log(`  grupos_macro: ${idPorGrupo.size} gravados.`);

  await atualizarPercentualDoProjeto(
    cliente,
    projetoId,
    resultado.raiz.percentualConcluido,
    new Date().toISOString(),
  );
  // Datas e procedência do cronograma vêm da mesma leitura.
  await cliente
    .from('projetos')
    .update({
      data_inicio_planejada: resultado.raiz.dataInicioPlanejada,
      data_fim_planejada: resultado.raiz.dataFimPlanejada,
      smartsheet_sheet_id: sheetId,
      smartsheet_sincronizado_em: new Date().toISOString(),
    })
    .eq('id', projetoId);
  console.log(
    `  projetos: rollup ${resultado.raiz.percentualConcluido}% · fim ${resultado.raiz.dataFimPlanejada}`,
  );

  const idPorTipoElemento = await buscarElementosVisuais(cliente);
  const { linhas: payload, semGrupo } = montarPayloadAtividades(
    resultado.atividades,
    idPorGrupo,
    idPorTipoElemento,
  );

  // Anexa o rowId — a chave estável. É o que diferencia este sync do import
  // por arquivo, e o que faz renomear um pai deixar de orfanar os filhos.
  //
  // A chave do mapa tem de incluir o GRUPO: `caminho_wbs` é único apenas
  // dentro de um grupo macro. Indexar só pelo caminho fazia atividades de
  // grupos diferentes casarem com a mesma linha da planilha e receberem o
  // mesmo rowId — o índice único do banco pegou isso na primeira execução.
  const chave = (grupoId: string, caminho: string) => `${grupoId}::${caminho}`;
  const porGrupoECaminho = new Map<string, string>();
  for (const atividade of resultado.atividades) {
    const grupoId = idPorGrupo.get(atividade.grupoMacroSmartsheet);
    const rowId = rowIdPorLinha.get(atividade.linhaPlanilha);
    if (!grupoId || !rowId) continue;
    porGrupoECaminho.set(chave(grupoId, atividade.caminhoWbsTexto), rowId);
  }

  for (const item of payload) {
    const rowId = porGrupoECaminho.get(chave(item.grupo_macro_id, item.caminho_wbs));
    if (rowId) item.smartsheet_row_id = rowId;
  }

  const atribuidos = payload.map((p) => p.smartsheet_row_id).filter(Boolean);
  const distintos = new Set(atribuidos).size;
  console.log(`  rowId anexado a ${atribuidos.length}/${payload.length} atividades.`);
  if (distintos !== atribuidos.length) {
    // Rede de proteção: falhar aqui é muito melhor que gravar vínculo trocado.
    console.error(
      `\nERRO: ${atribuidos.length - distintos} rowId(s) repetido(s) no payload. ` +
        'Isso significaria duas atividades apontando para a mesma linha do ' +
        'Smartsheet. Nada foi gravado.\n',
    );
    process.exitCode = 1;
    return;
  }

  if (semGrupo.length > 0) {
    console.log(`  ! ${semGrupo.length} atividade(s) sem grupo correspondente — não gravadas.`);
  }

  const existentes = await buscarAtividadesExistentes(cliente, idPorGrupo);
  const orfas = detectarOrfas(existentes, payload);
  const gravadas = await upsertAtividades(cliente, payload);
  console.log(`  atividades: ${gravadas} gravadas.`);

  linha();
  if (orfas.length === 0) {
    console.log('Nenhuma atividade órfã. O banco está alinhado com o Smartsheet.');
  } else {
    console.log(`${orfas.length} atividade(s) órfã(s) — existem no banco e sumiram da planilha:`);
    for (const o of orfas.slice(0, 15)) console.log(`  - ${o.caminhoWbs ?? o.nome}`);
    console.log('\nNão foram apagadas. Confira se foram mesmo removidas do cronograma');
    console.log('antes de limpar — renomear um pai também produz órfãs.');
  }
  linha();
  console.log('SYNC CONCLUÍDO.');
  linha();
}

main().catch((erro) => {
  if (erro instanceof ErroSmartsheet) {
    console.error(`\nERRO (Smartsheet): ${erro.message}\n`);
  } else {
    console.error(`\nERRO: ${(erro as Error).message}\n`);
  }
  process.exitCode = 1;
});
