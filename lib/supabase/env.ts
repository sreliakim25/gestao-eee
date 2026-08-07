/**
 * Leitura das variáveis de ambiente do Supabase.
 *
 * Regra de segurança: apenas URL e anon key podem ser públicas (NEXT_PUBLIC_*).
 * A service role key é lida somente em código de servidor/script — ver admin.ts.
 */

/** URL do projeto Supabase (pública, protegida por RLS). */
export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL não definida. Copie .env.example para .env.local e preencha.',
    );
  }
  return url;
}

/** Chave anônima (pública). Todo acesso continua filtrado pelas políticas de RLS. */
export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY não definida. Copie .env.example para .env.local e preencha.',
    );
  }
  return key;
}
