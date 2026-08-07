/**
 * components/gestao-visual/index.ts — superfície pública do módulo.
 *
 * Outros módulos importam sempre de `@/components/gestao-visual`, nunca dos
 * arquivos internos: assim a troca futura do renderizador SVG por um viewer IFC
 * não vaza para fora desta pasta.
 */

export { GestaoVisual, type PropsGestaoVisual } from './gestao-visual';
export { RenderizadorSvgPlanta, descreverElemento } from './renderizador-svg';
export { LegendaProgresso } from './legenda-progresso';
export { PainelElemento, type PropsPainelElemento } from './painel-elemento';

export {
  montarElementosRenderizaveis,
  atividadesDoElemento,
  nomeCurtoAtividade,
  formatarPercentual,
} from './adaptadores';

export {
  ESTILO_POR_FAIXA,
  preenchimentoDaFaixa,
  tracoDaFaixa,
  COR_CONCLUIDO,
  type EstiloFaixa,
} from './paleta';

export {
  FORMAS_ESTRUTURAIS,
  IDS_DA_PLANTA,
  VIEW_BOX,
  acharForma,
  montarSvgEstatico,
  type FormaEstrutural,
} from './geometria-planta';

export type {
  AtividadeGestaoVisual,
  ElementoRenderizavel,
  PropsRenderizadorPlanta,
  RenderizadorPlanta,
} from './tipos';
