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
import { interpretarLinhas } from './import/parser';
import {
  ErroSmartsheet,
  buscarPlanilha,
  listarPlanilhas,
} from './import/smartsheet-api';
import { NOME_PROJETO, buscarProjetoId } from './import/upsert';
import { obterConfiguracaoDispositivo } from '@/lib/smartsheet/config-dispositivos';
import { ErroSync, sincronizarPlanilhaPrincipal } from '@/lib/smartsheet/sincronizar';
import { createAdminClient } from '@/lib/supabase/admin';

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
  const { linhas, planilha } = await buscarPlanilha(token, sheetId);
  const resultado = interpretarLinhas(linhas, obterConfiguracaoDispositivo(NOME_PROJETO));

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
  // Delega a `sincronizarPlanilhaPrincipal()`, o MESMO caminho que o botão da
  // tela usa. Duplicar a orquestração aqui faria o CLI divergir do app na
  // primeira correção aplicada só de um lado.
  let relatorio;
  try {
    const cliente = createAdminClient();
    const projetoId = await buscarProjetoId(cliente, NOME_PROJETO);
    relatorio = await sincronizarPlanilhaPrincipal(projetoId);
  } catch (erro) {
    if (erro instanceof ErroSync && erro.codigo === 'config') {
      console.error(`\nERRO: ${erro.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw erro;
  }

  linha();
  console.log('ESCRITA NO BANCO');
  linha();
  console.log(`  grupos_macro: ${relatorio.grupos} gravados.`);
  console.log(
    `  projetos: rollup ${relatorio.percentualSmartsheet}% · fim ${relatorio.dataFimPlanejada}`,
  );
  console.log(`  rowId anexado a ${relatorio.comRowId}/${relatorio.atividades} atividades.`);
  console.log(`  atividades: ${relatorio.atividades} gravadas.`);
  console.log('  historico_cronograma: registro do dia gravado.');

  linha();
  if (relatorio.orfas.length === 0) {
    console.log('Nenhuma atividade órfã. O banco está alinhado com o Smartsheet.');
  } else {
    console.log(`${relatorio.orfas.length} atividade(s) órfã(s) — no banco e ausentes da planilha:`);
    for (const o of relatorio.orfas.slice(0, 15)) console.log(`  - ${o.caminhoWbs || o.nome}`);
    console.log('\nNão foram apagadas. Renomear um pai também produz órfãs.');
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
