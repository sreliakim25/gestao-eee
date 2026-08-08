/**
 * Aplica o schema completo (migrations + seed) num banco Postgres do Supabase.
 *
 *   npm run db:aplicar -- --dry-run     # só lista o que seria executado
 *   npm run db:aplicar -- --apply       # executa de verdade
 *
 * Lê a conexão de DATABASE_URL (em .env.local, que nunca vai para o Git).
 * Essa é a senha do POSTGRES — diferente das chaves de API do Supabase:
 * as chaves `sb_publishable_`/`sb_secret_` acessam dados via PostgREST e não
 * executam DDL. Pegue em Project Settings → Database → Connection string (URI).
 *
 * Cada migration roda dentro de UMA transação: se qualquer comando falhar, o
 * arquivo inteiro volta atrás. Assim o banco nunca fica num estado pela metade.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: '.env.local', quiet: true });

const RAIZ = process.cwd();
const DIR_MIGRATIONS = path.join(RAIZ, 'supabase/migrations');
const ARQUIVO_SEED = path.join(RAIZ, 'supabase/seed.sql');

interface Opcoes {
  aplicar: boolean;
  pularSeed: boolean;
}

function lerOpcoes(argv: readonly string[]): Opcoes {
  const args = new Set(argv.slice(2));
  if (args.has('--apply') && args.has('--dry-run')) {
    throw new Error('Use --apply OU --dry-run, não os dois.');
  }
  return {
    aplicar: args.has('--apply'),
    pularSeed: args.has('--sem-seed'),
  };
}

/** Tabela de controle: registra quais migrations já rodaram. */
const SQL_CONTROLE = `
create table if not exists public._migrations_aplicadas (
  arquivo text primary key,
  aplicada_em timestamptz not null default now()
);
`;

async function main(): Promise<void> {
  const opcoes = lerOpcoes(process.argv);

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      '\nERRO: DATABASE_URL não definida.\n\n' +
        'Pegue em: Supabase → Project Settings → Database → Connection string → URI.\n' +
        'Troque [YOUR-PASSWORD] pela senha real do banco (não é a chave de API!)\n' +
        'e grave em .env.local como:\n\n' +
        '  DATABASE_URL="postgresql://postgres:SENHA@db.SEU-REF.supabase.co:5432/postgres"\n',
    );
    process.exitCode = 1;
    return;
  }

  const arquivos = (await readdir(DIR_MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
  console.log(`\nMigrations encontradas: ${arquivos.length}`);

  if (!opcoes.aplicar) {
    for (const arquivo of arquivos) console.log(`  - ${arquivo}`);
    if (!opcoes.pularSeed) console.log('  - seed.sql');
    console.log('\nDRY-RUN: nada foi executado. Rode com --apply para gravar.\n');
    return;
  }

  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  console.log('Conectado.\n');

  try {
    await cliente.query(SQL_CONTROLE);
    const { rows } = await cliente.query<{ arquivo: string }>(
      'select arquivo from public._migrations_aplicadas',
    );
    const jaAplicadas = new Set(rows.map((r) => r.arquivo));

    let executadas = 0;
    for (const arquivo of arquivos) {
      if (jaAplicadas.has(arquivo)) {
        console.log(`  = ${arquivo} (já aplicada, pulando)`);
        continue;
      }
      const sql = await readFile(path.join(DIR_MIGRATIONS, arquivo), 'utf8');
      // Transação por arquivo: falhou, volta tudo daquele arquivo.
      await cliente.query('begin');
      try {
        await cliente.query(sql);
        await cliente.query('insert into public._migrations_aplicadas (arquivo) values ($1)', [
          arquivo,
        ]);
        await cliente.query('commit');
        console.log(`  + ${arquivo}`);
        executadas += 1;
      } catch (erro) {
        await cliente.query('rollback');
        console.error(`\nFALHOU em ${arquivo}:`);
        console.error(`  ${(erro as Error).message}`);
        console.error('\nNada dessa migration foi gravado. Corrija e rode de novo.\n');
        process.exitCode = 1;
        return;
      }
    }

    console.log(`\n${executadas} migration(s) aplicada(s).`);

    if (!opcoes.pularSeed) {
      const seed = await readFile(ARQUIVO_SEED, 'utf8');
      await cliente.query('begin');
      try {
        await cliente.query(seed);
        await cliente.query('commit');
        console.log('Seed aplicado (7 grupos macro + 9 elementos visuais).');
      } catch (erro) {
        await cliente.query('rollback');
        console.error(`\nFALHOU no seed: ${(erro as Error).message}\n`);
        process.exitCode = 1;
        return;
      }
    }

    // Conferência final honesta: conta o que existe de fato.
    const conferencia = await cliente.query<{ tabelas: string; rls: string }>(`
      select
        (select count(*)::text from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE') as tabelas,
        (select count(*)::text from pg_tables t
          join pg_class c on c.relname = t.tablename
          where t.schemaname = 'public' and c.relrowsecurity) as rls
    `);
    const { tabelas, rls } = conferencia.rows[0];
    console.log(`\nBanco: ${tabelas} tabelas em public, ${rls} com RLS ativa.`);
    console.log('\nPróximo passo: npm run import:cronograma -- --apply\n');
  } finally {
    await cliente.end();
  }
}

main().catch((erro) => {
  console.error(`\nERRO: ${(erro as Error).message}\n`);
  process.exitCode = 1;
});
