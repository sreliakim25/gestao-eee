/**
 * loading.tsx — placeholder exibido pelo App Router enquanto `page.tsx`
 * resolve sessão (cookies) e consultas ao Supabase. Server Component puro
 * (sem 'use client', sem dados) para evitar tela congelada na navegação.
 *
 * A proporção do retângulo principal acompanha o viewBox de
 * `public/svg/planta-eee.svg` (560 × 196) para o layout não "pular" quando o
 * SVG real assumir o lugar.
 */

export default function CarregandoGestaoVisual() {
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-borda pb-3">
        <div className="min-w-0">
          <h1 className="font-titulo text-2xl text-vinho sm:text-3xl">Gestão Visual</h1>
          <p className="mt-1 text-tinta-suave">
            Planta esquemática dentro do muro perimetral · clique num elemento para ver as
            atividades
          </p>
        </div>
      </div>

      <div className="animate-pulse space-y-4" aria-hidden="true">
        <div className="rounded-lg border border-borda bg-superficie p-4 shadow-[0_1px_0_rgba(43,35,32,0.06)]">
          <div className="aspect-[560/196] w-full rounded-md bg-creme" />
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="h-5 w-28 rounded-full bg-creme" />
          <div className="h-5 w-28 rounded-full bg-creme" />
          <div className="h-5 w-28 rounded-full bg-creme" />
        </div>
      </div>

      <span className="sr-only">Carregando gestão visual…</span>
    </>
  );
}
