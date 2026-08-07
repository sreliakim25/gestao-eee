/**
 * components/gestao-visual/tipos.ts — CONTRATO DE RENDERIZAÇÃO da Gestão Visual.
 *
 * Este arquivo existe para uma única razão: o elemento visual é uma entidade do
 * modelo de dados (`elementos_visuais`), e NÃO um desenho. Hoje ele é pintado
 * por um SVG esquemático; amanhã, quando o modelo REVIT/IFC da elevatória
 * estiver disponível, ele será pintado por um viewer IFC. A troca deve custar
 * um `import` — não uma migration, não uma mudança de página, não um recálculo.
 *
 * Como a troca funciona:
 *
 *   <GestaoVisual elementos={...} atividades={...} />                    (padrão: SVG)
 *   <GestaoVisual elementos={...} atividades={...} renderizador={RenderizadorIfc} />
 *
 * O renderizador recebe elementos JÁ resolvidos (nome, percentual, faixa) e
 * devolve pixels. Ele nunca conhece Supabase, nunca conhece `atividades` e
 * nunca calcula percentual — quem calcula é `lib/calculos` (`motor-indicadores`).
 *
 * Cada renderizador escolhe qual chave do elemento usa para achar a sua
 * geometria:
 *   - renderizador SVG → `svgPathId`   (casa com `elementos_visuais.svg_path_id`)
 *   - renderizador IFC → `ifcGlobalId` (casa com `elementos_visuais.ifc_global_id`)
 * Ambas as colunas já existem no schema, então nenhum dos dois exige migration.
 */

import type { ComponentType } from 'react';
import type { Atividade, FaixaProgresso, TipoElementoVisual } from '@/types/database';
import type { AtividadeCalculo } from '@/lib/calculos';

/**
 * Colunas de `atividades` que a Gestão Visual consome: as do motor de cálculo
 * mais o que o painel de detalhe exibe. Tipo estrutural — a linha real do
 * Supabase é aceita direto, sem conversão.
 */
export type AtividadeGestaoVisual = AtividadeCalculo & Pick<Atividade, 'nome'>;

/**
 * Um elemento visual pronto para desenhar, independente da tecnologia de
 * renderização. É a única coisa que um renderizador (SVG hoje, IFC amanhã)
 * precisa saber.
 */
export interface ElementoRenderizavel {
  /** `elementos_visuais.id` (uuid) — identidade no banco e chave de seleção. */
  id: string;
  /** `elementos_visuais.nome` — rótulo exibido. */
  nome: string;
  /** `elementos_visuais.tipo` — enum do domínio. */
  tipo: TipoElementoVisual;
  /** Chave de geometria do renderizador SVG (`elementos_visuais.svg_path_id`). */
  svgPathId: string;
  /** Chave de geometria do futuro viewer IFC (`elementos_visuais.ifc_global_id`). */
  ifcGlobalId: string | null;
  /** Percentual 0–100 vindo de `percentuaisPorElementoVisual`. NUNCA recalculado aqui. */
  percentual: number;
  /** Faixa vinda de `faixaProgresso`. NUNCA reimplementada aqui. */
  faixa: FaixaProgresso;
  /** Quantas atividades sustentam esse percentual (0 = elemento sem vínculo). */
  totalAtividades: number;
}

/** Props que todo renderizador de planta precisa aceitar. */
export interface PropsRenderizadorPlanta {
  /** Elementos já resolvidos, na ordem de `elementos_visuais.ordem`. */
  elementos: readonly ElementoRenderizavel[];
  /** Elemento em foco (id do banco), ou `null`. */
  elementoSelecionadoId: string | null;
  /** Disparado por clique, Enter ou Espaço sobre um elemento. */
  aoSelecionar: (elementoId: string) => void;
  /** Texto do `aria-label` do desenho como um todo. */
  descricaoAcessivel?: string;
}

/**
 * O contrato em si. Um viewer IFC é qualquer componente que satisfaça isto.
 * Nada além deste tipo precisa mudar para trocar a fonte de renderização.
 */
export type RenderizadorPlanta = ComponentType<PropsRenderizadorPlanta>;
