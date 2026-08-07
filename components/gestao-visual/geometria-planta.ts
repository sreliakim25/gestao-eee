/**
 * components/gestao-visual/geometria-planta.ts — geometria da planta
 * esquemática da EEE Novo Mundo. FONTE ÚNICA do desenho.
 *
 * Tanto o componente React (`renderizador-svg.tsx`) quanto o arquivo estático
 * `public/svg/planta-eee.svg` são produzidos a partir deste módulo. O teste
 * `tests/gestao-visual/planta-svg.test.ts` compara o arquivo com a saída de
 * `montarSvgEstatico()` — se alguém editar um sem o outro, o teste quebra.
 *
 * ---------------------------------------------------------------------------
 * PROCEDÊNCIA DO DESENHO (nada aqui é chutado)
 * ---------------------------------------------------------------------------
 * Layout e posições relativas: `Projetos/36-PE-SES-04-R01-LOCAÇÃO ESTAÇÃO
 * ELEVATÓRIA.pdf` (planta de locação, escala 1:100 da prancha 04/12) e
 * `Projetos/36-PE-SES-01-R01-PLANTA GERAL.pdf`.
 *
 * | Elemento                       | Prancha de referência                          |
 * |--------------------------------|------------------------------------------------|
 * | poço úmido / câmara de grades  | 03-R01 Estação Elevatória (Planta Baixa 1:50), EST-01 |
 * | caixa de comporta              | 04-R01 Locação (caixa a montante, chegada do DN300 do PV-29), EST-04 Caixas Diversas |
 * | caixa de válvulas (barrilete)  | 03-R01 (trechos de 2,70 m e 2,30 m a leste do poço), EST-04 |
 * | casa de comando                | 04-R01 Locação + 05-R01 Casa de Comando (1:50), EST-02 |
 * | caixa do medidor de vazão      | 04-R01 Locação (braço nordeste, 2,60 m), 10-R01, EST-03 |
 * | caixa do tanque hidropneum.    | 04-R01 Locação (base 3,00 m, braço nordeste), EST-05 |
 * | muro perimetral / portões      | 04-R01 ("Muro de Fechamento", 2 portões 6,00×2,80), 01-R00 e 02-R00 |
 * | pavimentação                   | 04-R01 ("PAVIMENTAÇÃO EM PAVER", área interna ao muro) |
 *
 * Medidas lidas da locação e usadas nas proporções: muro norte 29,10 m; braço
 * nordeste 17,18 m × 7,00 m; face sul ≈ 48,2 m (6,18 + 2,40 + 18,85 + 2,70 +
 * 9,60 + 1,70 + 2,90 + 3,88); estrutura da elevatória 18,85 m × 5,50 m; casa de
 * comando 9,60 m × 5,90 m; caixa do medidor 2,60 m; base do tanque 3,00 m.
 *
 * ESCOPO: só o que está dentro do muro perimetral (regra 3 do CLAUDE.md).
 * Emissário final e rede coletora externa NÃO são desenhados — a rede coletora
 * aparece apenas como a seta de chegada do DN 300 até a caixa de comporta,
 * como contexto não interativo e sem elemento visual associado.
 *
 * ---------------------------------------------------------------------------
 * SISTEMA DE COORDENADAS
 * ---------------------------------------------------------------------------
 * 1 unidade de usuário = 0,1 m (decímetro). Norte para cima (conferido pelas
 * coordenadas UTM da tabela "Limites da Área da EEE" da prancha 04: o vértice
 * 01 está a nordeste do vértice 02). O desenho é ESQUEMÁTICO e não cotado —
 * serve para localizar e clicar, não para medir.
 */

import type { TipoElementoVisual } from '@/types/database';
import { DEFS_TEXTURAS_SVG, ESTILO_POR_FAIXA, TINTA, CREME } from './paleta';

/** `viewBox` do desenho — escalável, sem largura/altura fixas. */
export const VIEW_BOX = '0 0 560 196';

/*
 * Tipografia dos rótulos. Ficam aqui (e não em cada consumidor) porque o SVG
 * estático e o renderizador React precisam produzir exatamente o mesmo texto —
 * é o que o teste de sincronismo compara.
 * O halo creme com `paint-order="stroke"` é o que mantém o rótulo legível sobre
 * as três cores de faixa, inclusive sobre o vermelho escuro do "concluído".
 */
export const FONTE_ROTULO = 7;
export const HALO_ROTULO = 1.6;
export const ALTURA_LINHA_ROTULO = 8;

/** Uma forma clicável do desenho, ligada a um `elementos_visuais.svg_path_id`. */
export interface FormaEstrutural {
  /** Precisa casar EXATAMENTE com `elementos_visuais.svg_path_id` do seed. */
  svgPathId: string;
  /** Tipo correspondente no enum do banco — usado só para conferência cruzada. */
  tipo: TipoElementoVisual;
  /** Rótulo curto desenhado na planta (o nome completo vai no `<title>`). */
  linhasRotulo: readonly string[];
  /** Geometria. */
  d: string;
  /** `fill-rule` — `evenodd` no muro, que é um anel (contorno externo + interno). */
  regraPreenchimento?: 'evenodd' | 'nonzero';
  /** Onde o bloco de rótulo começa. */
  rotulo: { x: number; y: number; ancora: 'start' | 'middle' | 'end' };
  /** Ordem de desenho (menor primeiro): pavimentação embaixo, caixas em cima. */
  camada: number;
}

/*
 * Perímetro do terreno (vértices 01 a 08 da prancha 04, simplificados para 7
 * pontos). O muro é desenhado como um ANEL (faixa de ~0,6 m) e não como um
 * traço: assim ele tem área, aceita textura e é clicável de verdade.
 */
const CONTORNO_EXTERNO = 'M25,75 L316,75 L316,5 L488,5 L545,67 L505,181 L10,181 Z';
const CONTORNO_INTERNO =
  'M30.2,81 L322,81 L322,11 L485.4,11 L538.1,68.4 L500.7,175 L16.9,175 Z';

/**
 * As 9 formas clicáveis, na ordem de `elementos_visuais.ordem` do seed.
 * Toda mudança de `svgPathId` aqui exige mudança no seed (e vice-versa) — o
 * teste de sincronismo existe justamente para tornar isso impossível de
 * esquecer.
 */
export const FORMAS_ESTRUTURAIS: readonly FormaEstrutural[] = [
  {
    svgPathId: 'poco-umido',
    tipo: 'poco_umido',
    linhasRotulo: ['Poço úmido'],
    // Corpo central da estrutura: fosso de sucção das 4 bombas submersíveis.
    d: 'M180,105 L272,105 L272,160 L180,160 Z',
    rotulo: { x: 226, y: 128, ancora: 'middle' },
    camada: 3,
  },
  {
    svgPathId: 'camara-grades',
    tipo: 'camara_grades',
    linhasRotulo: ['Câmara de', 'grades'],
    // Extremo oeste da estrutura: escadas, caixa de areia, grades e Parshall.
    d: 'M111,105 L180,105 L180,160 L111,160 Z',
    rotulo: { x: 145, y: 124, ancora: 'middle' },
    camada: 3,
  },
  {
    svgPathId: 'casa-comando',
    tipo: 'casa_comando',
    linhasRotulo: ['Casa de comando'],
    // Canto leste arredondado, como na locação (R2,50).
    d: 'M350,103 L426,103 A12,12 0 0 1 438,115 L438,150 A12,12 0 0 1 426,162 L350,162 Z',
    rotulo: { x: 392, y: 128, ancora: 'middle' },
    camada: 3,
  },
  {
    svgPathId: 'caixa-comporta',
    tipo: 'caixa_comporta',
    linhasRotulo: ['Caixa de', 'comporta'],
    // A montante da estrutura, onde chega o DN 300 vindo do PV-29.
    d: 'M85,117 L109,117 L109,147 L85,147 Z',
    // Rótulo à esquerda da caixa: ela é pequena demais para conter texto.
    rotulo: { x: 81, y: 140, ancora: 'end' },
    camada: 4,
  },
  {
    svgPathId: 'caixa-valvulas',
    tipo: 'caixa_valvulas',
    linhasRotulo: ['Caixa de', 'válvulas'],
    // Barrilete de recalque, a leste do poço úmido.
    d: 'M272,105 L327,105 L327,160 L272,160 Z',
    rotulo: { x: 299, y: 124, ancora: 'middle' },
    camada: 3,
  },
  {
    svgPathId: 'caixa-tanque-hidropneumatico',
    tipo: 'caixa_tanque_hidropneumatico',
    linhasRotulo: ['Caixa do tanque', 'hidropneumático'],
    // Braço nordeste do terreno, base do tanque de 1 m³.
    d: 'M421,17 L453,17 L453,49 L421,49 Z',
    rotulo: { x: 437, y: 59, ancora: 'middle' },
    camada: 4,
  },
  {
    svgPathId: 'caixa-medidor-vazao',
    tipo: 'caixa_medidor_vazao',
    linhasRotulo: ['Caixa do medidor', 'de vazão'],
    // Braço nordeste, a oeste do tanque, na linha de recalque.
    d: 'M376,31 L402,31 L402,57 L376,57 Z',
    rotulo: { x: 372, y: 40, ancora: 'end' },
    camada: 4,
  },
  {
    svgPathId: 'pavimentacao',
    tipo: 'pavimentacao',
    linhasRotulo: ['Pavimentação'],
    // Toda a área interna ao muro (paver + passeio em concreto).
    d: CONTORNO_INTERNO,
    rotulo: { x: 150, y: 92, ancora: 'middle' },
    camada: 1,
  },
  {
    svgPathId: 'muro-perimetral',
    tipo: 'muro_perimetral',
    linhasRotulo: ['Muro perimetral'],
    d: `${CONTORNO_EXTERNO} ${CONTORNO_INTERNO}`,
    regraPreenchimento: 'evenodd',
    rotulo: { x: 150, y: 62, ancora: 'middle' },
    camada: 2,
  },
];

/** Formas em ordem de desenho (camada crescente). */
export const FORMAS_EM_ORDEM_DE_DESENHO: readonly FormaEstrutural[] = [
  ...FORMAS_ESTRUTURAIS,
].sort((a, b) => a.camada - b.camada);

/** Os `svg_path_id` que este desenho oferece — usado pelo teste de sincronismo. */
export const IDS_DA_PLANTA: readonly string[] = FORMAS_ESTRUTURAIS.map(
  (forma) => forma.svgPathId,
);

/** Busca uma forma pelo seu `svg_path_id`. */
export function acharForma(svgPathId: string): FormaEstrutural | undefined {
  return FORMAS_ESTRUTURAIS.find((forma) => forma.svgPathId === svgPathId);
}

/* -------------------------------------------------------------------------- */
/* Contexto não interativo                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Traços de referência que ajudam a ler a planta mas NÃO são elementos visuais
 * do banco: chegada da rede coletora, linha de recalque interna, portões e
 * rosa dos ventos. Não recebem cor de progresso e não são focáveis.
 */
export interface TracoContexto {
  d: string;
  traco: string;
  espessura: number;
  tracejado?: string;
  preenchimento?: string;
}

export const TRACOS_CONTEXTO: readonly TracoContexto[] = [
  // Chegada da rede coletora DN 300 (PV-29) até a caixa de comporta.
  // A rede EXTERNA em si está fora de escopo — aqui é só a seta de chegada.
  {
    d: 'M34,132 L85,132',
    traco: '#6E6455',
    espessura: 1.6,
    tracejado: '6 4',
    preenchimento: 'none',
  },
  // Linha de recalque: barrilete → caixa do medidor de vazão → tanque.
  {
    d: 'M321,110 L368,44 L376,44 M402,44 L437,44 L437,49',
    traco: '#6E6455',
    espessura: 1.6,
    preenchimento: 'none',
  },
  // Portão oeste (6,00 m) sobre o muro.
  { d: 'M17.5,146 L21.5,116', traco: TINTA, espessura: 4, preenchimento: 'none' },
  // Portão leste (6,00 m) sobre o muro.
  { d: 'M527,109 L517,138', traco: TINTA, espessura: 4, preenchimento: 'none' },
];

/** Rótulos fixos de contexto (não interativos). */
export const ROTULOS_CONTEXTO: readonly {
  x: number;
  y: number;
  texto: string;
  ancora: 'start' | 'middle' | 'end';
  tamanho: number;
}[] = [
  { x: 34, y: 128, texto: 'Rede coletora DN 300 (PV-29)', ancora: 'start', tamanho: 5 },
  { x: 26, y: 112, texto: 'Portão', ancora: 'start', tamanho: 5 },
  { x: 512, y: 106, texto: 'Portão', ancora: 'end', tamanho: 5 },
  { x: 24, y: 22, texto: 'N', ancora: 'middle', tamanho: 9 },
];

/** Seta da rosa dos ventos (norte aproximado, conforme UTM da prancha 04). */
export const SETA_NORTE = 'M24,44 L24,26 M24,26 L20,33 M24,26 L28,33';

/* -------------------------------------------------------------------------- */
/* SVG estático (public/svg/planta-eee.svg)                                   */
/* -------------------------------------------------------------------------- */

function escaparXml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Monta o SVG autônomo publicado em `public/svg/planta-eee.svg`.
 *
 * Ele é a planta em estado NEUTRO (tudo "não iniciado"): serve para conferência
 * do desenho fora do app, para impressão e como referência do contrato de ids.
 * A coloração por progresso acontece só em runtime, no renderizador React.
 */
export function montarSvgEstatico(): string {
  const neutro = ESTILO_POR_FAIXA.nao_iniciado;

  const formas = FORMAS_EM_ORDEM_DE_DESENHO.map((forma) => {
    const regra = forma.regraPreenchimento
      ? ` fill-rule="${forma.regraPreenchimento}"`
      : '';
    return (
      `    <path id="${forma.svgPathId}" d="${forma.d}"${regra}` +
      ` fill="${neutro.corBase}" stroke="${neutro.corTraco}" stroke-width="1.2">\n` +
      `      <title>${escaparXml(forma.linhasRotulo.join(' '))}</title>\n` +
      `    </path>`
    );
  }).join('\n');

  const contexto = TRACOS_CONTEXTO.map(
    (traco) =>
      `    <path d="${traco.d}" fill="${traco.preenchimento ?? 'none'}"` +
      ` stroke="${traco.traco}" stroke-width="${traco.espessura}"` +
      (traco.tracejado ? ` stroke-dasharray="${traco.tracejado}"` : '') +
      ` stroke-linecap="round" />`,
  ).join('\n');

  const rotulosFormas = FORMAS_EM_ORDEM_DE_DESENHO.map((forma) =>
    forma.linhasRotulo
      .map(
        (linha, indice) =>
          `    <text x="${forma.rotulo.x}" y="${forma.rotulo.y + indice * ALTURA_LINHA_ROTULO}"` +
          ` text-anchor="${forma.rotulo.ancora}" font-size="${FONTE_ROTULO}" fill="${TINTA}"` +
          ` stroke="${CREME}" stroke-width="${HALO_ROTULO}" paint-order="stroke"` +
          ` font-family="Georgia, serif">${escaparXml(linha)}</text>`,
      )
      .join('\n'),
  ).join('\n');

  const rotulosContexto = ROTULOS_CONTEXTO.map(
    (rotulo) =>
      `    <text x="${rotulo.x}" y="${rotulo.y}" text-anchor="${rotulo.ancora}"` +
      ` font-size="${rotulo.tamanho}" fill="#6E6455" font-family="Georgia, serif">` +
      `${escaparXml(rotulo.texto)}</text>`,
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Planta esquemática da EEE Novo Mundo — GERADO por
  components/gestao-visual/geometria-planta.ts (montarSvgEstatico).
  NÃO EDITAR À MÃO: o teste tests/gestao-visual/planta-svg.test.ts compara este
  arquivo com a saída daquela função e falha se houver divergência.
  Cada id abaixo casa com elementos_visuais.svg_path_id (supabase/seed.sql).
-->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" role="img"
     aria-label="Planta esquemática da Estação Elevatória de Esgoto Novo Mundo">
  ${DEFS_TEXTURAS_SVG}
  <g id="estruturas">
${formas}
  </g>
  <g id="contexto">
${contexto}
    <path d="${SETA_NORTE}" fill="none" stroke="#6E6455" stroke-width="1.4" stroke-linecap="round" />
  </g>
  <g id="rotulos">
${rotulosFormas}
${rotulosContexto}
  </g>
</svg>
`;
}
