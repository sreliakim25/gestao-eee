/**
 * app/orcamento/loading.tsx — placeholder de carregamento do módulo de
 * Orçamento / Terceirizado.
 *
 * Server Component puro (sem 'use client', sem dados): o Next.js exibe este
 * arquivo automaticamente enquanto `page.tsx` busca `orcamento_resumo_categoria`
 * no Supabase, evitando a navegação "congelada" entre módulos.
 */

export default function CarregandoOrcamento() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse text-tinta">
      <header className="border-b-2 border-ouro pb-4">
        <div className="h-3 w-32 rounded bg-creme" />
        <div className="mt-2 h-8 w-96 rounded bg-creme" />
        <div className="mt-3 h-4 w-full max-w-2xl rounded bg-creme" />
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-24 rounded-lg border border-borda bg-superficie p-4">
          <div className="h-3 w-24 rounded bg-creme" />
          <div className="mt-3 h-6 w-16 rounded bg-creme" />
        </div>
        <div className="h-24 rounded-lg border border-borda bg-superficie p-4">
          <div className="h-3 w-24 rounded bg-creme" />
          <div className="mt-3 h-6 w-16 rounded bg-creme" />
        </div>
        <div className="h-24 rounded-lg border border-borda bg-superficie p-4">
          <div className="h-3 w-24 rounded bg-creme" />
          <div className="mt-3 h-6 w-16 rounded bg-creme" />
        </div>
      </div>

      {/* Placeholder da tabela das 6 categorias + Itens Omissos, orçado x medido. */}
      <div className="mt-6 space-y-2 rounded-lg border border-borda bg-superficie p-4">
        <div className="h-4 w-56 rounded bg-creme" />
        <div className="mt-3 h-10 w-full rounded bg-creme" />
        <div className="h-10 w-full rounded bg-creme" />
        <div className="h-10 w-full rounded bg-creme" />
        <div className="h-10 w-full rounded bg-creme" />
      </div>
    </div>
  );
}
