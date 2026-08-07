'use client';

/**
 * Visão do Cronograma: filtros combináveis + tabela paginada + Gantt.
 *
 * Desempenho: as 317 atividades chegam prontas do servidor, mas só uma página
 * (40 linhas) vai para o DOM de cada vez. Filtro e agregação rodam em `useMemo`,
 * então digitar na busca não recalcula tudo a cada tecla desnecessariamente.
 */

import { useMemo, useState } from 'react';
import { percentualEvolucaoGeral } from '@/lib/calculos';
import type { Atividade } from '@/types/database';
import { FilterBar, type OpcaoFiltro } from '@/components/filters/FilterBar';
import {
  FILTROS_INICIAIS,
  applyScheduleFilters,
  type ScheduleFilterState,
} from '@/components/filters/scheduleFilters';
import { EmptyState } from '@/components/ui/primitives';
import { formatarInteiro, formatarPercentual } from '@/lib/ui/formato';
import { ScheduleTable } from './ScheduleTable';
import { SimpleGantt } from './SimpleGantt';

const TAMANHO_PAGINA = 40;

type ModoVisao = 'tabela' | 'gantt';

interface ScheduleViewProps {
  atividades: readonly Atividade[];
  grupos: readonly OpcaoFiltro[];
  elementos: readonly OpcaoFiltro[];
  /** Data "hoje" injetada pelo servidor (fuso da obra). */
  dataReferencia: string;
  /** Pré-seleção vinda da querystring (ex.: link do Painel). */
  filtrosIniciais?: Partial<ScheduleFilterState>;
}

export function ScheduleView({
  atividades,
  grupos,
  elementos,
  dataReferencia,
  filtrosIniciais,
}: ScheduleViewProps) {
  const [filtros, setFiltros] = useState<ScheduleFilterState>({
    ...FILTROS_INICIAIS,
    ...filtrosIniciais,
  });
  const [pagina, setPagina] = useState(1);
  const [modo, setModo] = useState<ModoVisao>('tabela');

  const filtradas = useMemo(
    () => applyScheduleFilters(atividades, filtros, dataReferencia),
    [atividades, filtros, dataReferencia],
  );

  // Percentual do recorte — vem do motor, nunca somado à mão aqui.
  const percentualRecorte = useMemo(
    () => percentualEvolucaoGeral(filtradas),
    [filtradas],
  );

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / TAMANHO_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * TAMANHO_PAGINA;
  const visiveis = filtradas.slice(inicio, inicio + TAMANHO_PAGINA);

  const nomesGrupos = useMemo(
    () => Object.fromEntries(grupos.map((grupo) => [grupo.id, grupo.nome])),
    [grupos],
  );
  const nomesElementos = useMemo(
    () => Object.fromEntries(elementos.map((elemento) => [elemento.id, elemento.nome])),
    [elementos],
  );

  function alterarFiltros(proximo: ScheduleFilterState) {
    setFiltros(proximo);
    setPagina(1); // filtro novo sempre volta para a primeira página
  }

  return (
    <>
      <FilterBar
        grupos={grupos}
        elementos={elementos}
        valor={filtros}
        onChange={alterarFiltros}
        resumo={`${formatarInteiro(filtradas.length)} de ${formatarInteiro(
          atividades.length,
        )} atividades · ${formatarPercentual(percentualRecorte)} concluído no recorte`}
      />

      <div
        role="group"
        aria-label="Modo de visualização"
        className="mb-3 flex gap-2"
      >
        {(['tabela', 'gantt'] as const).map((opcao) => (
          <button
            key={opcao}
            type="button"
            aria-pressed={modo === opcao}
            onClick={() => setModo(opcao)}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              modo === opcao
                ? 'border-vinho bg-vinho text-creme'
                : 'border-borda bg-superficie text-tinta hover:bg-creme-claro'
            }`}
          >
            {opcao === 'tabela' ? 'Tabela' : 'Gantt simplificado'}
          </button>
        ))}
      </div>

      {filtradas.length === 0 ? (
        <EmptyState
          title="Nenhuma atividade para este recorte"
          description="Ajuste ou limpe os filtros. Nada é estimado: a lista mostra apenas o que veio do cronograma importado."
        />
      ) : (
        <>
          {modo === 'tabela' ? (
            <ScheduleTable
              atividades={visiveis}
              nomesGrupos={nomesGrupos}
              nomesElementos={nomesElementos}
            />
          ) : (
            <SimpleGantt atividades={visiveis} dataReferencia={dataReferencia} />
          )}

          {totalPaginas > 1 ? (
            <nav
              aria-label="Paginação das atividades"
              className="mt-4 flex items-center justify-between gap-3 text-sm"
            >
              <button
                type="button"
                onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
                disabled={paginaAtual <= 1}
                className="rounded-md border border-borda bg-superficie px-3 py-1.5 text-tinta disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="numeros-tabulares text-tinta-suave">
                Página {paginaAtual} de {totalPaginas} · mostrando{' '}
                {formatarInteiro(visiveis.length)} atividades
              </span>
              <button
                type="button"
                onClick={() => setPagina((atual) => Math.min(totalPaginas, atual + 1))}
                disabled={paginaAtual >= totalPaginas}
                className="rounded-md border border-borda bg-superficie px-3 py-1.5 text-tinta disabled:opacity-50"
              >
                Próxima
              </button>
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
