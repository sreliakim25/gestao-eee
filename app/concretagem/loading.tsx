/**
 * app/concretagem/loading.tsx — placeholder de carregamento do módulo de
 * Concretagem.
 *
 * Server Component puro (sem 'use client', sem dados): o Next.js exibe este
 * arquivo automaticamente enquanto `page.tsx` busca as etapas e pedidos no
 * Supabase, evitando a navegação "congelada" entre módulos.
 */

export default function CarregandoConcretagem() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse text-tinta">
      <header className="border-b-2 border-ouro pb-4">
        <div className="h-3 w-32 rounded bg-creme" />
        <div className="mt-2 h-8 w-72 rounded bg-creme" />
        <div className="mt-3 h-4 w-full max-w-xl rounded bg-creme" />
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="h-24 rounded-lg border border-borda bg-superficie p-4">
          <div className="h-3 w-20 rounded bg-creme" />
          <div className="mt-3 h-6 w-14 rounded bg-creme" />
        </div>
        <div className="h-24 rounded-lg border border-borda bg-superficie p-4">
          <div className="h-3 w-20 rounded bg-creme" />
          <div className="mt-3 h-6 w-14 rounded bg-creme" />
        </div>
        <div className="h-24 rounded-lg border border-borda bg-superficie p-4">
          <div className="h-3 w-20 rounded bg-creme" />
          <div className="mt-3 h-6 w-14 rounded bg-creme" />
        </div>
        <div className="h-24 rounded-lg border border-borda bg-superficie p-4">
          <div className="h-3 w-20 rounded bg-creme" />
          <div className="mt-3 h-6 w-14 rounded bg-creme" />
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="h-28 rounded-lg border border-borda bg-superficie p-4">
          <div className="h-4 w-40 rounded bg-creme" />
          <div className="mt-3 h-2 w-full rounded-full bg-creme" />
        </div>
        <div className="h-28 rounded-lg border border-borda bg-superficie p-4">
          <div className="h-4 w-40 rounded bg-creme" />
          <div className="mt-3 h-2 w-full rounded-full bg-creme" />
        </div>
      </div>
    </div>
  );
}
