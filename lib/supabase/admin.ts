/**
 * Cliente administrativo (service role) — IGNORA RLS.
 *
 * PERIGO: só pode ser importado em código que roda no servidor ou em scripts
 * Node (ex.: scripts/import-smartsheet.ts). Nunca importar em Client Component
 * nem expor a chave com prefixo NEXT_PUBLIC_.
 *
 * Não usa `server-only` de propósito, para permitir uso pelo script de import
 * fora do runtime do Next. A proteção é a checagem explícita abaixo.
 */

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export function createAdminClient(): SupabaseClient<Database> {
  // Guarda-corpo: se houver window, estamos no browser — aborta.
  if (typeof window !== 'undefined') {
    throw new Error(
      'createAdminClient() não pode ser usado no browser: a service role key ignora RLS.',
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias para o cliente administrativo.',
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
