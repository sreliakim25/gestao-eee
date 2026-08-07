'use client';

/**
 * components/gestao-visual/gestao-visual.tsx — o módulo de Gestão Visual.
 *
 * Junta as três peças e nada mais:
 *   1. `montarElementosRenderizaveis` (adaptador → `lib/calculos`)
 *   2. um `RenderizadorPlanta` (SVG hoje, viewer IFC amanhã)
 *   3. `PainelElemento` (detalhe do elemento clicado)
 *
 * A prop `renderizador` é o ponto de troca da tecnologia de desenho. Ela é
 * opcional e cai no SVG por padrão, então a página não precisa saber que existe.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { atividadesDoElemento, montarElementosRenderizaveis, formatarPercentual } from './adaptadores';
import { LegendaProgresso } from './legenda-progresso';
import { PainelElemento } from './painel-elemento';
import { RenderizadorSvgPlanta } from './renderizador-svg';
import { ESTILO_POR_FAIXA, CREME } from './paleta';
import type { AtividadeGestaoVisual, RenderizadorPlanta } from './tipos';
import type { ElementoVisual } from '@/types/database';
import { ROTULOS_FAIXA_PROGRESSO } from '@/lib/calculos';

export interface PropsGestaoVisual {
  /** Linhas de `elementos_visuais` (as 9 do seed). */
  elementos: readonly ElementoVisual[];
  /** Atividades do projeto — as sem `elemento_visual_id` são ignoradas. */
  atividades: readonly AtividadeGestaoVisual[];
  /**
   * Fonte de renderização. Padrão: SVG esquemático.
   * Trocar por um viewer IFC é passar outro componente aqui — ver `tipos.ts`.
   */
  renderizador?: RenderizadorPlanta;
}

export function GestaoVisual({
  elementos,
  atividades,
  renderizador: Renderizador = RenderizadorSvgPlanta,
}: PropsGestaoVisual) {
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  // Guarda quem abriu o painel para devolver o foco ao fechar (acessibilidade).
  const focoAnteriorRef = useRef<HTMLElement | null>(null);

  const renderizaveis = useMemo(
    () => montarElementosRenderizaveis(elementos, atividades),
    [elementos, atividades],
  );

  const selecionado = renderizaveis.find((elemento) => elemento.id === selecionadoId) ?? null;

  const aoSelecionar = useCallback((elementoId: string) => {
    if (typeof document !== 'undefined') {
      focoAnteriorRef.current = document.activeElement as HTMLElement | null;
    }
    setSelecionadoId(elementoId);
  }, []);

  const aoFechar = useCallback(() => {
    setSelecionadoId(null);
    focoAnteriorRef.current?.focus?.();
  }, []);

  const atividadesSelecionadas = useMemo(
    () => atividadesDoElemento(atividades, selecionadoId),
    [atividades, selecionadoId],
  );

  return (
    <div className="flex flex-col gap-4">
      <LegendaProgresso />

      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: '#D8D2C0', backgroundColor: CREME }}
      >
        <Renderizador
          elementos={renderizaveis}
          elementoSelecionadoId={selecionadoId}
          aoSelecionar={aoSelecionar}
        />
      </div>

      {/* Mesma informação da planta em forma de lista: é o caminho de leitura
          para quem usa leitor de tela, e a tabela de conferência para quem não.
          Os botões abrem exatamente o mesmo painel do clique no desenho. */}
      <section aria-labelledby="gv-lista-elementos">
        <h2
          id="gv-lista-elementos"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6E6455]"
        >
          Elementos ({renderizaveis.length})
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="lista-elementos">
          {renderizaveis.map((elemento) => {
            const estilo = ESTILO_POR_FAIXA[elemento.faixa];
            return (
              <li key={elemento.id}>
                <button
                  type="button"
                  onClick={() => aoSelecionar(elemento.id)}
                  aria-pressed={elemento.id === selecionadoId}
                  data-elemento-lista-id={elemento.id}
                  data-faixa={elemento.faixa}
                  className="flex w-full items-center justify-between gap-2 rounded border px-3 py-2 text-left text-sm"
                  style={{ borderColor: estilo.corTraco, backgroundColor: CREME }}
                >
                  <span className="min-w-0 truncate">{elemento.nome}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums">
                      {formatarPercentual(elemento.percentual)}
                    </span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{
                        backgroundColor: estilo.corBase,
                        color: elemento.faixa === 'concluido' ? CREME : undefined,
                        border: `1px solid ${estilo.corTraco}`,
                      }}
                    >
                      {ROTULOS_FAIXA_PROGRESSO[elemento.faixa]}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {selecionado ? (
        <PainelElemento
          elemento={selecionado}
          atividades={atividadesSelecionadas}
          aoFechar={aoFechar}
        />
      ) : null}
    </div>
  );
}
