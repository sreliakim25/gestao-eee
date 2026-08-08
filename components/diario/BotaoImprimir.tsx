'use client';

/**
 * Dispara o diálogo de impressão do navegador (de onde sai o "Salvar como PDF").
 * Client component isolado para que a página de impressão continue sendo
 * server component.
 */

export function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded px-4 py-2 text-sm font-semibold text-white"
      style={{ backgroundColor: '#8B1A1A' }}
    >
      Salvar como PDF / Imprimir
    </button>
  );
}
