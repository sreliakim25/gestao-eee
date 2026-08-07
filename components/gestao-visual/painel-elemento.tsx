'use client';

/**
 * components/gestao-visual/painel-elemento.tsx — painel de detalhe de um
 * elemento visual, aberto ao clicar (ou dar Enter) sobre ele na planta.
 *
 * Mostra o percentual do elemento e as atividades que o sustentam, com o %
 * individual de cada uma. O percentual do elemento vem pronto do adaptador
 * (que por sua vez vem de `lib/calculos`); o da atividade é a coluna
 * `percentual_concluido` do banco. Nada é calculado aqui.
 *
 * Acessibilidade: diálogo modal com `role="dialog"`, `aria-modal`, foco levado
 * para o botão de fechar na abertura, Esc fecha e o foco volta para o elemento
 * do SVG que abriu o painel (responsabilidade de quem controla o estado).
 */

import { useEffect, useRef } from 'react';
import { ROTULOS_FAIXA_PROGRESSO, faixaProgresso } from '@/lib/calculos';
import { formatarPercentual, nomeCurtoAtividade } from './adaptadores';
import { ESTILO_POR_FAIXA, CREME, TINTA, VINHO } from './paleta';
import type { AtividadeGestaoVisual, ElementoRenderizavel } from './tipos';

/** Data ISO (`YYYY-MM-DD`) formatada em pt-BR, sem escorregar de fuso. */
function formatarData(iso: string | null): string {
  if (!iso) return '—';
  const partes = iso.slice(0, 10).split('-');
  if (partes.length !== 3) return '—';
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

export interface PropsPainelElemento {
  elemento: ElementoRenderizavel;
  atividades: readonly AtividadeGestaoVisual[];
  aoFechar: () => void;
}

export function PainelElemento({ elemento, atividades, aoFechar }: PropsPainelElemento) {
  const botaoFecharRef = useRef<HTMLButtonElement>(null);
  const estilo = ESTILO_POR_FAIXA[elemento.faixa];

  useEffect(() => {
    botaoFecharRef.current?.focus();
  }, [elemento.id]);

  useEffect(() => {
    function aoTeclar(evento: globalThis.KeyboardEvent) {
      if (evento.key === 'Escape') aoFechar();
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  const tituloId = `painel-elemento-titulo-${elemento.id}`;

  // Atividades da mais avançada para a menos avançada: o que está andando
  // aparece primeiro, que é a pergunta de quem clica no elemento.
  const ordenadas = [...atividades].sort(
    (a, b) => b.percentual_concluido - a.percentual_concluido,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        data-testid="painel-elemento"
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-lg shadow-xl sm:rounded-lg"
        style={{ backgroundColor: CREME, color: TINTA }}
      >
        <header
          className="flex items-start justify-between gap-4 p-4"
          style={{ borderBottom: `1px solid ${estilo.corTraco}` }}
        >
          <div className="min-w-0">
            <h2
              id={tituloId}
              className="text-xl font-semibold"
              style={{ color: VINHO, fontFamily: 'Georgia, serif' }}
            >
              {elemento.nome}
            </h2>
            <p className="mt-1 text-sm">
              <strong data-testid="percentual-elemento">
                {formatarPercentual(elemento.percentual)}
              </strong>{' '}
              concluído ·{' '}
              <span
                className="rounded px-1.5 py-0.5 text-xs font-semibold"
                style={{
                  backgroundColor: estilo.corBase,
                  color: elemento.faixa === 'concluido' ? CREME : TINTA,
                  border: `1px solid ${estilo.corTraco}`,
                }}
                data-testid="faixa-elemento"
              >
                {ROTULOS_FAIXA_PROGRESSO[elemento.faixa]}
              </span>
            </p>
          </div>
          <button
            ref={botaoFecharRef}
            type="button"
            onClick={aoFechar}
            aria-label={`Fechar detalhe de ${elemento.nome}`}
            className="rounded border px-2 py-1 text-sm"
            style={{ borderColor: estilo.corTraco }}
          >
            Fechar
          </button>
        </header>

        <div className="p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6E6455]">
            Atividades vinculadas ({ordenadas.length})
          </h3>

          {ordenadas.length === 0 ? (
            <p className="text-sm text-[#6E6455]">
              Nenhuma atividade do cronograma está vinculada a este elemento. O
              percentual permanece em 0% até que o import do Smartsheet associe
              atividades a ele.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: '#D8D2C0' }}>
              {ordenadas.map((atividade) => {
                const faixa = faixaProgresso(atividade.percentual_concluido);
                return (
                  <li key={atividade.id} className="py-2" data-testid="atividade-item">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1 text-sm" title={atividade.nome}>
                        {nomeCurtoAtividade(atividade.nome)}
                        {atividade.caminho_critico ? (
                          <span
                            className="ml-2 rounded px-1 text-[10px] font-semibold uppercase"
                            style={{ backgroundColor: VINHO, color: CREME }}
                          >
                            Crítica
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatarPercentual(atividade.percentual_concluido)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#6E6455]">
                      {formatarData(atividade.data_inicio_planejada)} a{' '}
                      {formatarData(atividade.data_fim_planejada)} ·{' '}
                      {ROTULOS_FAIXA_PROGRESSO[faixa]}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
