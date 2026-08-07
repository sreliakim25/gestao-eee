'use client';

/**
 * Cliente Supabase para o browser (Client Components).
 *
 * Usa exclusivamente a anon key — a service role key NUNCA pode aparecer aqui.
 * Toda proteção de dados vem das políticas de RLS definidas nas migrations.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { getSupabaseAnonKey, getSupabaseUrl } from './env';

/** Instância única por aba do browser (evita recriar o client a cada render). */
let clienteBrowser: SupabaseClient<Database> | undefined;

export function createClient(): SupabaseClient<Database> {
  if (!clienteBrowser) {
    clienteBrowser = createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey());
  }
  return clienteBrowser;
}
