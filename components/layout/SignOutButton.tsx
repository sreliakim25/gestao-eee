'use client';

/** Encerra a sessão do Supabase e devolve o usuário ao login. */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function handleSignOut() {
    setSaindo(true);
    try {
      await createClient().auth.signOut();
    } catch {
      // Mesmo com falha de rede seguimos para o login: o cookie local já caiu.
    } finally {
      // refresh() força o layout do servidor a reler a sessão (agora vazia).
      router.replace('/login');
      router.refresh();
      setSaindo(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={saindo}
      className="rounded border border-creme/40 px-3 py-1 text-sm text-creme transition-colors hover:bg-vinho-escuro hover:text-ouro disabled:opacity-60"
    >
      {saindo ? 'Saindo…' : 'Sair'}
    </button>
  );
}
