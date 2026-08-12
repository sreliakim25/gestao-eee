/**
 * scripts/import-smartsheet.ts — Import do cronograma do Smartsheet.
 *
 * Dono: agente `importador-cronograma`.
 * Uso:
 *   npm run import:cronograma -- --dry-run          # padrão: só imprime o diff
 *   npm run import:cronograma -- --apply            # grava no banco
 *   npm run import:cronograma -- --apply --prune    # grava E remove órfãs
 *   npm run import:cronograma -- --arquivo "outro.xlsx"
 *
 * Regras que este script respeita (CLAUDE.md):
 *  - Importa SOMENTE o ramo "E.E.E. - NOVO MUNDO". Todo o resto do
 *    macro-cronograma corporativo é descartado e contabilizado no log.
 *  - Nunca inventa dado de cronograma: o que não está na planilha fica null.
 *  - Nunca escreve em `lib/calculos/` nem calcula indicador oficial. Os
 *    agregados impressos aqui são conferência de import, não indicador.
 *  - `elementos_visuais.percentual_concluido` NÃO é recalculado aqui porque
 *    não é coluna: é derivado nas views `elementos_visuais_progresso` /
 *    `percentual_elemento(uuid)` (decisão do `arquiteto-dados`, seção 1.3 do
 *    ARCHITECTURE.md). O que este import faz é manter `atividades.
 *    elemento_visual_id` correto, que é o insumo dessas views.
 */

import path from 'node:path';
import process from 'node:process';
import { config as carregarEnv } from 'dotenv';
import { parsearCronograma } from './import/xlsx';
import { montarResumo, NUMEROS_ESPERADOS, type ResumoImport } from './import/resumo';
import {
  buscarAtividadesExistentes,
  buscarElementosVisuais,
  buscarGruposExistentes,
  buscarProjetoId,
  chaveAtividade,
  detectarOrfas,
  montarPayloadAtividades,
  montarPayloadGrupos,
  removerOrfas,
  upsertAtividades,
  upsertGrupos,
  atualizarPercentualDoProjeto,
  type AtividadeOrfa,
} from './import/upsert';
import type { AtividadeInsert, TipoElementoVisual } from '@/types/database';

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

interface Opcoes {
  arquivo: string;
  /** true = não escreve nada no banco. Padrão do script. */
  dryRun: boolean;
  /** true = remove as atividades órfãs. Exige `--apply`. */
  prune: boolean;
}

const CAMINHO_PADRAO_XLSX = 'Materiais/EEE - Novo Mundo.xlsx';

export function lerOpcoes(argv: readonly string[]): Opcoes {
  const args = [...argv];
  const temFlag = (nome: string) => args.includes(`--${nome}`);

  const indiceArquivo = args.findIndex((a) => a === '--arquivo' || a.startsWith('--arquivo='));
  let arquivo = process.env.SMARTSHEET_XLSX_PATH || CAMINHO_PADRAO_XLSX;
  if (indiceArquivo !== -1) {
    const bruto = args[indiceArquivo];
    arquivo = bruto.includes('=') ? bruto.split('=').slice(1).join('=') : (args[indiceArquivo + 1] ?? arquivo);
  }

  // Escrita só acontece com --apply explícito. `--dry-run` é o padrão e
  // continua aceito para deixar a intenção clara na linha de comando.
  const dryRun = !temFlag('apply');

  return { arquivo, dryRun, prune: temFlag('prune') };
}

/* -------------------------------------------------------------------------- */
/* Impressão                                                                  */
/* -------------------------------------------------------------------------- */

const LARGURA = 78;
const linha = (c = '─') => c.repeat(LARGURA);

function titulo(texto: string): void {
  console.log(`\n${linha()}\n${texto}\n${linha()}`);
}

function destaque(texto: string): void {
  console.log(`\n${'█'.repeat(LARGURA)}\n  ${texto}\n${'█'.repeat(LARGURA)}`);
}

function imprimirResumo(resumo: ResumoImport, avisos: readonly string[]): void {
  titulo('RESUMO DO PARSE — ramo "E.E.E. - NOVO MUNDO"');
  console.log(`  Grupos macro (nível 1)................ ${resumo.totalGrupos}`);
  console.log(`  Atividades (níveis 2..6).............. ${resumo.totalAtividades}`);
  console.log(`  Linhas no ramo (grupos + atividades).. ${resumo.totalLinhasNoRamo}`);
  console.log(`  Folhas do WBS......................... ${resumo.atividadesFolha}`);
  console.log(`  Em caminho crítico.................... ${resumo.atividadesCriticas}`);
  console.log(`  % geral (rollup do Smartsheet)........ ${resumo.percentualRaizSmartsheet ?? '—'}%`);
  console.log(`  % média simples das atividades........ ${resumo.percentualMediaSimples}%  (conferência)`);
  console.log(`  % folhas ponderado por duração........ ${resumo.percentualPonderadoFolhas}%  (conferência)`);
  console.log(`  Data mínima de início................. ${resumo.dataMinimaInicio ?? '—'}`);
  console.log(`  Data máxima de término................ ${resumo.dataMaximaFim ?? '—'}`);
  console.log('');
  console.log(`  Linhas DESCARTADAS por estarem fora de escopo... ${resumo.linhasForaDeEscopo}`);
  console.log(`  Linhas em branco ignoradas...................... ${resumo.linhasVaziasIgnoradas}`);
  console.log(`  Atividades sem duração informada................ ${resumo.atividadesSemDuracao}`);
  console.log(`  Atividades sem data de início................... ${resumo.atividadesSemDataInicio}`);

  titulo('POR GRUPO MACRO');
  for (const g of resumo.porGrupo) {
    console.log(
      `  ${g.nome.padEnd(42)} ${String(g.atividades).padStart(3)} ativ | ` +
        `${String(g.criticas).padStart(2)} críticas | média ${String(g.percentualMediaSimples).padStart(5)}%`,
    );
  }

  titulo('VÍNCULO ATIVIDADE → ELEMENTO VISUAL');
  console.log(
    `  Vinculadas: ${resumo.atividadesComElementoVisual}/${resumo.totalAtividades} ` +
      `(${resumo.taxaVinculoElemento}%) — o restante fica null de propósito.`,
  );
  for (const [tipo, quantidade] of Object.entries(resumo.vinculosPorTipo).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${tipo.padEnd(32)} ${String(quantidade).padStart(3)}`);
  }

  if (avisos.length > 0) {
    titulo('AVISOS DO PARSER');
    for (const aviso of avisos) console.log(`  ! ${aviso}`);
  }

  titulo('VALIDAÇÃO CONTRA OS NÚMEROS CONHECIDOS DA OBRA');
  console.log(
    `  Referência (plano, snapshot 05/08/2026): ${NUMEROS_ESPERADOS.linhasNoRamo} linhas no ramo ` +
      `(${NUMEROS_ESPERADOS.gruposMacro} grupos + ${NUMEROS_ESPERADOS.atividades} atividades), ` +
      `${NUMEROS_ESPERADOS.dataInicio} a ${NUMEROS_ESPERADOS.dataFim}, ` +
      `${NUMEROS_ESPERADOS.atividadesCaminhoCritico} críticas, ${NUMEROS_ESPERADOS.percentualGeral}% geral.`,
  );
  if (resumo.divergencias.length === 0) {
    console.log('  OK — todos os números conferem com o esperado.');
  } else {
    destaque(`DIVERGÊNCIA CONTRA OS NÚMEROS ESPERADOS (${resumo.divergencias.length})`);
    for (const d of resumo.divergencias) console.log(`  >> ${d}`);
    console.log(
      '\n  Isso NÃO interrompe o import, mas precisa ser conferido com o Smartsheet\n' +
        '  antes de confiar no Painel/Curva S: ou a obra evoluiu, ou o export mudou.',
    );
  }
}

function imprimirOrfas(orfas: readonly AtividadeOrfa[], prune: boolean): void {
  if (orfas.length === 0) {
    console.log('  Nenhuma atividade órfã. O banco está alinhado com o .xlsx.');
    return;
  }
  destaque(`${orfas.length} ATIVIDADE(S) ÓRFÃ(S) — existem no banco e sumiram do .xlsx`);
  for (const o of orfas.slice(0, 40)) {
    console.log(`  - [${o.grupoMacroNome}] ${o.caminhoWbs} (${o.percentualConcluido}% concluída)`);
  }
  if (orfas.length > 40) console.log(`  ... e mais ${orfas.length - 40}.`);
  console.log(
    '\n  Causa mais provável: renomeação no Smartsheet. ATENÇÃO: a identidade da\n' +
      '  atividade é o caminho WBS inteiro, então renomear um nó ANCESTRAL muda o\n' +
      '  caminho de TODOS os descendentes de uma vez — um único rename lá pode\n' +
      '  produzir dezenas de órfãs aqui, sem que a obra tenha perdido atividade.\n' +
      '  Elas podem ter avanços semanais, fotos e RDO vinculados — por isso NÃO são\n' +
      `  apagadas automaticamente. Para remover: rode de novo com --apply --prune.\n` +
      `  ${prune ? '>> --prune informado: as órfãs SERÃO removidas.' : '>> --prune ausente: nada será removido.'}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Etapa de banco                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Verifica as variáveis de ambiente necessárias ao cliente admin.
 * Retorna a lista das que faltam (vazia = tudo certo). Não lança: o dry-run
 * precisa continuar funcionando offline, só com o arquivo.
 */
function variaveisFaltando(): string[] {
  return ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(
    (nome) => !process.env[nome],
  );
}

async function executarEtapaBanco(
  resultado: Awaited<ReturnType<typeof parsearCronograma>>,
  opcoes: Opcoes,
): Promise<void> {
  // Import dinâmico: sem credenciais, nem carregamos o cliente admin.
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const cliente = createAdminClient();

  const projetoId = await buscarProjetoId(cliente);

  // Lê primeiro para preservar os rótulos legíveis já gravados (`grupos_macro.
  // nome`): o import casa por `nome_smartsheet` e não pode sobrescrever a UI
  // com a string em caixa alta do .xlsx.
  const { idPorGrupo: gruposNoBanco, rotulos } = await buscarGruposExistentes(cliente, projetoId);
  const payloadGrupos = montarPayloadGrupos(resultado.grupos, projetoId, rotulos);

  titulo(opcoes.dryRun ? 'DIFF CONTRA O BANCO (dry-run — nada é gravado)' : 'ESCRITA NO BANCO');

  let idPorGrupo: Map<string, string>;
  if (opcoes.dryRun) {
    idPorGrupo = gruposNoBanco;
    const novos = payloadGrupos.filter((g) => !idPorGrupo.has(g.nome_smartsheet));
    console.log(
      `  grupos_macro: ${payloadGrupos.length} no .xlsx | ${idPorGrupo.size} no banco | ` +
        `${novos.length} seriam criados`,
    );
    for (const g of novos) console.log(`    + ${g.nome_smartsheet}`);
  } else {
    idPorGrupo = await upsertGrupos(cliente, payloadGrupos);
    console.log(
      `  grupos_macro: ${idPorGrupo.size} gravados (upsert por projeto_id+nome_smartsheet).`,
    );
    // Percentual OFICIAL do Painel: o rollup da linha raiz do Smartsheet.
    await atualizarPercentualDoProjeto(
      cliente,
      projetoId,
      resultado.raiz.percentualConcluido,
      new Date().toISOString(),
    );
    console.log(
      `  projetos.percentual_smartsheet: ${resultado.raiz.percentualConcluido ?? 'NULL (sem rollup no export)'}`,
    );
  }

  const idPorTipoElemento: Map<TipoElementoVisual, string> = await buscarElementosVisuais(cliente);
  const { linhas, descartadasPorColisao, semGrupo } = montarPayloadAtividades(
    resultado.atividades,
    idPorGrupo,
    idPorTipoElemento,
  );
  if (semGrupo.length > 0) {
    console.log(
      `  ! ${semGrupo.length} atividade(s) sem grupo macro correspondente no banco — não serão gravadas.`,
    );
  }
  if (descartadasPorColisao.length > 0) {
    console.log(`  ! ${descartadasPorColisao.length} atividade(s) descartadas por colisão de chave.`);
  }

  const existentes = await buscarAtividadesExistentes(cliente, idPorGrupo);
  const orfas = detectarOrfas(existentes, linhas);
  const novas = contarNovas(existentes, linhas);

  console.log(
    `  atividades: ${linhas.length} no payload | ${existentes.length} no banco | ` +
      `${novas} novas | ${linhas.length - novas} atualizadas | ${orfas.length} órfãs`,
  );

  if (!opcoes.dryRun) {
    const gravadas = await upsertAtividades(cliente, linhas);
    console.log(`  atividades: ${gravadas} gravadas (upsert por grupo_macro_id+nome).`);
  }

  titulo('ATIVIDADES ÓRFÃS');
  imprimirOrfas(orfas, opcoes.prune);
  if (opcoes.prune && !opcoes.dryRun && orfas.length > 0) {
    const removidas = await removerOrfas(cliente, orfas);
    console.log(`\n  ${removidas} atividade(s) órfã(s) removida(s) por --prune.`);
  }

  console.log(
    '\n  elementos_visuais.percentual_concluido NÃO é recalculado aqui: é derivado\n' +
      '  nas views do banco (elementos_visuais_progresso / percentual_elemento) a\n' +
      '  partir de atividades.elemento_visual_id, que este import acabou de atualizar.\n' +
      '  Fórmula oficial de indicador continua com o motor-indicadores (lib/calculos/).',
  );
}

function contarNovas(
  existentes: readonly { grupoMacroId: string; caminhoWbs: string }[],
  payload: readonly AtividadeInsert[],
): number {
  const chaves = new Set(existentes.map((e) => chaveAtividade(e.grupoMacroId, e.caminhoWbs)));
  return payload.filter((l) => !chaves.has(chaveAtividade(l.grupo_macro_id, l.caminho_wbs))).length;
}

/* -------------------------------------------------------------------------- */
/* main                                                                       */
/* -------------------------------------------------------------------------- */

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  // .env.local é o arquivo do Next; .env fica de fallback. Nenhum vai para o Git.
  carregarEnv({ path: '.env.local', quiet: true });
  carregarEnv({ quiet: true });

  const opcoes = lerOpcoes(argv);
  const caminhoAbsoluto = path.resolve(process.cwd(), opcoes.arquivo);

  titulo('IMPORT DO CRONOGRAMA — Smartsheet .xlsx → Supabase');
  console.log(`  Arquivo.: ${caminhoAbsoluto}`);
  console.log(`  Modo....: ${opcoes.dryRun ? 'DRY-RUN (nada é gravado)' : 'APPLY (grava no banco)'}`);
  console.log(`  Prune...: ${opcoes.prune ? 'sim (remove órfãs)' : 'não'}`);

  if (opcoes.prune && opcoes.dryRun) {
    console.log('  ! --prune sem --apply não remove nada; a lista de órfãs é só informativa.');
  }

  let resultado: Awaited<ReturnType<typeof parsearCronograma>>;
  try {
    resultado = await parsearCronograma(caminhoAbsoluto);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(`\nERRO ao ler/parsear a planilha: ${mensagem}`);
    return 1;
  }

  const resumo = montarResumo(resultado);
  imprimirResumo(resumo, resultado.avisos);

  const faltando = variaveisFaltando();
  if (faltando.length > 0) {
    titulo('ETAPA DE BANCO — PULADA');
    console.log(
      `  Variáveis de ambiente ausentes: ${faltando.join(', ')}.\n` +
        `  Crie um .env.local a partir de .env.example e preencha essas chaves.\n` +
        `  (SUPABASE_SERVICE_ROLE_KEY nunca leva o prefixo NEXT_PUBLIC_.)\n\n` +
        `  O parse acima roda offline, só com o .xlsx — os números são válidos.`,
    );
    // Sem credenciais, o dry-run é sucesso (validou o arquivo); o apply é erro.
    if (!opcoes.dryRun) {
      console.error('\nERRO: --apply exige credenciais do Supabase. Nada foi gravado.');
      return 1;
    }
    return resumo.divergencias.length > 0 ? 0 : 0;
  }

  try {
    await executarEtapaBanco(resultado, opcoes);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(`\nERRO na etapa de banco: ${mensagem}`);
    return 1;
  }

  titulo(opcoes.dryRun ? 'DRY-RUN CONCLUÍDO — nada foi gravado.' : 'IMPORT CONCLUÍDO.');
  return 0;
}

// Executa só quando chamado direto pelo tsx/node, nunca ao ser importado no teste.
const ehExecucaoDireta =
  typeof process.argv[1] === 'string' && process.argv[1].includes('import-smartsheet');
if (ehExecucaoDireta) {
  main().then(
    (codigo) => process.exit(codigo),
    (erro) => {
      console.error(erro);
      process.exit(1);
    },
  );
}
