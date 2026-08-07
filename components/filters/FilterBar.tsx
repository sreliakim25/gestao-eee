'use client';

/**
 * Barra de filtros compartilhada pelo Cronograma e pela Curva S.
 *
 * Controlada: quem usa mantém o estado (`ScheduleFilterState`) e recebe as
 * mudanças por `onChange`. Assim as duas telas oferecem exatamente os mesmos
 * recortes, sem duplicar controles.
 */

import { useId } from 'react';
import {
  FILTROS_INICIAIS,
  countActiveFilters,
  type ScheduleFilterState,
} from './scheduleFilters';

export interface OpcaoFiltro {
  id: string;
  nome: string;
}

interface FilterBarProps {
  grupos: readonly OpcaoFiltro[];
  elementos: readonly OpcaoFiltro[];
  valor: ScheduleFilterState;
  onChange: (proximo: ScheduleFilterState) => void;
  /** Campo de busca por nome (útil no Cronograma, dispensável na Curva S). */
  mostrarBusca?: boolean;
  /** Filtro "semana atual" (não faz sentido na Curva S, que é a série inteira). */
  mostrarSemanaAtual?: boolean;
  /** Texto do tipo "48 de 317 atividades". */
  resumo?: string;
}

export function FilterBar({
  grupos,
  elementos,
  valor,
  onChange,
  mostrarBusca = true,
  mostrarSemanaAtual = true,
  resumo,
}: FilterBarProps) {
  const idBase = useId();
  const ativos = countActiveFilters(valor);

  function alterar(parcial: Partial<ScheduleFilterState>) {
    onChange({ ...valor, ...parcial });
  }

  return (
    <section
      aria-label="Filtros de atividades"
      className="mb-4 rounded-lg border border-borda bg-superficie p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label
            htmlFor={`${idBase}-grupo`}
            className="mb-1 block text-sm font-semibold text-tinta"
          >
            Frente / disciplina
          </label>
          <select
            id={`${idBase}-grupo`}
            value={valor.grupoMacroId}
            onChange={(evento) => alterar({ grupoMacroId: evento.target.value })}
            className="w-full rounded-md border border-borda bg-creme-claro px-2 py-2 text-tinta"
          >
            <option value="">Todas as frentes</option>
            {grupos.map((grupo) => (
              <option key={grupo.id} value={grupo.id}>
                {grupo.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={`${idBase}-elemento`}
            className="mb-1 block text-sm font-semibold text-tinta"
          >
            Elemento estrutural
          </label>
          <select
            id={`${idBase}-elemento`}
            value={valor.elementoVisualId}
            onChange={(evento) => alterar({ elementoVisualId: evento.target.value })}
            className="w-full rounded-md border border-borda bg-creme-claro px-2 py-2 text-tinta"
          >
            <option value="">Todos os elementos</option>
            {elementos.map((elemento) => (
              <option key={elemento.id} value={elemento.id}>
                {elemento.nome}
              </option>
            ))}
          </select>
        </div>

        {mostrarBusca ? (
          <div>
            <label
              htmlFor={`${idBase}-busca`}
              className="mb-1 block text-sm font-semibold text-tinta"
            >
              Buscar atividade
            </label>
            <input
              id={`${idBase}-busca`}
              type="search"
              value={valor.busca}
              onChange={(evento) => alterar({ busca: evento.target.value })}
              placeholder="ex.: escavação"
              className="w-full rounded-md border border-borda bg-creme-claro px-2 py-2 text-tinta"
            />
          </div>
        ) : null}

        <fieldset className="flex flex-col justify-end gap-2">
          <legend className="sr-only">Recortes rápidos</legend>

          <label className="flex items-center gap-2 text-tinta">
            <input
              type="checkbox"
              checked={valor.apenasCriticas}
              onChange={(evento) => alterar({ apenasCriticas: evento.target.checked })}
              className="size-4 accent-[var(--vinho)]"
            />
            Somente caminho crítico
          </label>

          {mostrarSemanaAtual ? (
            <label className="flex items-center gap-2 text-tinta">
              <input
                type="checkbox"
                checked={valor.apenasSemanaAtual}
                onChange={(evento) =>
                  alterar({ apenasSemanaAtual: evento.target.checked })
                }
                className="size-4 accent-[var(--vinho)]"
              />
              Somente a semana atual
            </label>
          ) : null}
        </fieldset>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-tinta-suave">
        <span>{resumo}</span>
        {ativos > 0 ? (
          <button
            type="button"
            onClick={() => onChange({ ...FILTROS_INICIAIS })}
            className="rounded border border-borda px-2 py-1 text-tinta hover:bg-creme"
          >
            Limpar filtros ({ativos})
          </button>
        ) : null}
      </div>
    </section>
  );
}
