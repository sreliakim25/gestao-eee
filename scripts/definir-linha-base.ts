/**
 * Define a linha de base das datas planejadas.
 *
 *   npm run linha-base                      # mostra o estado atual (não grava)
 *   npm run linha-base -- --do-xlsx         # baseline = snapshot do .xlsx
 *   npm run linha-base -- --do-plano-atual  # baseline = plano vigente (replanejamento)
 *
 * POR QUE ISTO É UM COMANDO SEPARADO, E NÃO PARTE DO SYNC
 *
 * Mover a linha de base apaga o histórico de atraso: se ela acompanhasse o
 * Smartsheet, toda obra estaria eternamente "no prazo", porque o alvo se
 * moveria junto com a realidade. Redefinir baseline é decisão de gestão —
 * replanejamento aprovado — e por isso exige um ato explícito.
 *
 * O trigger `atividades_preservar_linha_base` no banco impede que o sync
 * altere essas colunas por acidente; este script usa a função
 * `redefinir_linha_base`, que é o único caminho autorizado.
 */

import { config } from 'dotenv';
import { Client } from 'pg';
import { parsearCronograma } from './import/xlsx';
import { NOME_PROJETO } from './import/upsert';
import { obterConfiguracaoDispositivo } from '@/lib/smartsheet/config-dispositivos';

config({ path: '.env.local', quiet: true });

const CAMINHO_XLSX = process.env.SMARTSHEET_XLSX_PATH ?? './Materiais/EEE - Novo Mundo.xlsx';

type Modo = 'mostrar' | 'xlsx' | 'plano-atual';

function lerModo(argv: readonly string[]): Modo {
  const args = new Set(argv.slice(2));
  if (args.has('--do-xlsx') && args.has('--do-plano-atual')) {
    throw new Error('Escolha apenas um: --do-xlsx OU --do-plano-atual.');
  }
  if (args.has('--do-xlsx')) return 'xlsx';
  if (args.has('--do-plano-atual')) return 'plano-atual';
  return 'mostrar';
}

async function main(): Promise<void> {
  const modo = lerModo(process.argv);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida em .env.local.');

  // Ver scripts/aplicar-schema.ts: o pooler do Supabase exige SSL, sem isto a
  // conexão é recusada com uma mensagem enganosa de "senha errada".
  const cliente = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await cliente.connect();

  try {
    const { rows: resumo } = await cliente.query<{
      total: string;
      divergentes: string;
      base_min: string | null;
      base_max: string | null;
      plano_min: string | null;
      plano_max: string | null;
    }>(`
      select count(*)::text as total,
             count(*) filter (
               where data_fim_planejada is distinct from data_fim_linha_base
                  or data_inicio_planejada is distinct from data_inicio_linha_base
             )::text as divergentes,
             min(data_inicio_linha_base)::text as base_min,
             max(data_fim_linha_base)::text    as base_max,
             min(data_inicio_planejada)::text  as plano_min,
             max(data_fim_planejada)::text     as plano_max
        from public.atividades
    `);
    const r = resumo[0];
    console.log('\nESTADO ATUAL');
    console.log(`  atividades                 ${r.total}`);
    console.log(`  divergentes da linha base  ${r.divergentes}`);
    console.log(`  linha de base              ${r.base_min} a ${r.base_max}`);
    console.log(`  plano vigente              ${r.plano_min} a ${r.plano_max}`);

    if (modo === 'mostrar') {
      console.log(
        '\nNada foi alterado. Use --do-xlsx (snapshot do arquivo) ou\n' +
          '--do-plano-atual (congela o plano de hoje como novo alvo).\n',
      );
      return;
    }

    if (modo === 'plano-atual') {
      const { rows } = await cliente.query<{ redefinir_linha_base: number }>(
        'select public.redefinir_linha_base((select id from public.projetos limit 1))',
      );
      console.log(`\n${rows[0].redefinir_linha_base} atividade(s) com linha de base = plano vigente.`);
      console.log('O histórico de desvio anterior foi apagado.\n');
      return;
    }

    // --- baseline a partir do snapshot do .xlsx ------------------------------
    const cronograma = await parsearCronograma(CAMINHO_XLSX, obterConfiguracaoDispositivo(NOME_PROJETO));
    console.log(`\nLendo linha de base de: ${CAMINHO_XLSX}`);
    console.log(`  ${cronograma.atividades.length} atividades no arquivo.`);

    // Casa por (nome_smartsheet do grupo, caminho_wbs) — a mesma chave lógica
    // usada pelo import por arquivo.
    const paresValidos = cronograma.atividades.filter(
      (a) => a.dataInicioPlanejada || a.dataFimPlanejada,
    );

    await cliente.query('begin');
    // Sem isto o trigger devolve o valor antigo e o UPDATE vira no-op.
    await cliente.query("select set_config('app.redefinindo_linha_base', 'on', true)");

    let atualizadas = 0;
    for (const atividade of paresValidos) {
      const { rowCount } = await cliente.query(
        `update public.atividades a
            set data_inicio_linha_base = $3::date,
                data_fim_linha_base    = $4::date
           from public.grupos_macro g
          where a.grupo_macro_id = g.id
            and g.nome_smartsheet = $1
            and a.caminho_wbs = $2`,
        [
          atividade.grupoMacroSmartsheet,
          atividade.caminhoWbsTexto,
          atividade.dataInicioPlanejada,
          atividade.dataFimPlanejada,
        ],
      );
      atualizadas += rowCount ?? 0;
    }
    await cliente.query('commit');

    console.log(`  ${atualizadas} atividade(s) com linha de base vinda do arquivo.`);
    if (atualizadas < paresValidos.length) {
      console.log(
        `  ! ${paresValidos.length - atualizadas} linha(s) do arquivo não casaram com o banco ` +
          '(atividade renomeada ou removida no Smartsheet desde o export).',
      );
    }

    const { rows: depois } = await cliente.query<{ divergentes: string }>(`
      select count(*) filter (
               where data_fim_planejada is distinct from data_fim_linha_base
             )::text as divergentes
        from public.atividades
    `);
    console.log(`\nAgora ${depois[0].divergentes} atividade(s) divergem da linha de base.`);
    console.log('Para desfazer: npm run linha-base -- --do-plano-atual\n');
  } finally {
    await cliente.end();
  }
}

main().catch((erro) => {
  console.error(`\nERRO: ${(erro as Error).message}\n`);
  process.exitCode = 1;
});
