/**
 * components/gestao-visual/paleta.ts — cores e TEXTURAS das faixas de progresso.
 *
 * Regra de acessibilidade adotada: a faixa NUNCA é comunicada só por matiz.
 * Cada faixa tem, ao mesmo tempo:
 *   1. uma cor da paleta do projeto (creme / vermelho escuro / ouro);
 *   2. uma textura própria (sólido / listras diagonais / pontilhado), que
 *      sobrevive a impressão em preto-e-branco e a daltonismo;
 *   3. um rótulo em texto, tanto na legenda quanto no `aria-label` e no
 *      `<title>` de cada elemento.
 * Também há degrau de luminosidade entre as três (claro / médio / escuro),
 * o que mantém a leitura em escala de cinza.
 *
 * A classificação em si vem de `faixaProgresso` (`lib/calculos`) — aqui só se
 * decide como cada faixa é PINTADA.
 *
 * TODO(ui-modulos): quando os tokens do tema (`--color-creme`, `--color-vinho`,
 * `--color-ouro`) estiverem publicados no `@theme` de `app/globals.css`, trocar
 * os literais abaixo por `var(--color-*)`. Atributos de `fill`/`stroke` de SVG
 * aceitam `var()`, então a troca é direta e não muda nenhuma outra linha.
 */

import type { FaixaProgresso } from '@/types/database';

/* Identidade visual do projeto (CLAUDE.md). */
export const CREME = '#F0EAD8';
export const VINHO = '#8B1A1A';
export const OURO = '#E8A020';
export const TINTA = '#2B2320';

/**
 * DECISÃO PENDENTE DE CONFIRMAÇÃO DO USUÁRIO — cor de "concluído".
 *
 * O plano deixou em aberto entre vermelho escuro (paleta do app) e um verde de
 * sucesso. Adotado o **vermelho escuro `#8B1A1A`**, por dois motivos:
 *   - mantém a paleta creme/vermelho/ouro sem introduzir um quarto matiz;
 *   - nesta tela nada usa vermelho como alarme, então não há ambiguidade
 *     "vermelho = problema" (o status de prazo fica no Painel, não aqui).
 * Se o usuário preferir verde, basta trocar esta constante — nenhum outro
 * arquivo precisa mudar.
 */
export const COR_CONCLUIDO = VINHO;

/** Como uma faixa de progresso é pintada. */
export interface EstiloFaixa {
  /** Cor chapada — usada na legenda, no SVG estático e como fallback. */
  corBase: string;
  /** Cor do contorno. */
  corTraco: string;
  /** Id do `<pattern>` que dá a textura (null = sólido, sem textura). */
  padraoId: string | null;
  /** Descrição da textura, exibida na legenda (redundância proposital). */
  textura: string;
}

/** Estilo de cada faixa. Chaves espelham o tipo `FaixaProgresso` do banco. */
export const ESTILO_POR_FAIXA: Readonly<Record<FaixaProgresso, EstiloFaixa>> = {
  nao_iniciado: {
    corBase: '#CFC7B4',
    corTraco: '#8A8271',
    padraoId: null,
    textura: 'sólido claro',
  },
  em_andamento: {
    corBase: OURO,
    corTraco: '#95660A',
    padraoId: 'gv-textura-em-andamento',
    textura: 'listras diagonais',
  },
  concluido: {
    corBase: COR_CONCLUIDO,
    corTraco: '#4E0E0E',
    padraoId: 'gv-textura-concluido',
    textura: 'pontilhado',
  },
};

/**
 * Valor de `fill` de um elemento naquela faixa: a textura quando existe,
 * a cor chapada quando não.
 */
export function preenchimentoDaFaixa(faixa: FaixaProgresso): string {
  const estilo = ESTILO_POR_FAIXA[faixa];
  return estilo.padraoId ? `url(#${estilo.padraoId})` : estilo.corBase;
}

/** Cor do contorno de um elemento naquela faixa. */
export function tracoDaFaixa(faixa: FaixaProgresso): string {
  return ESTILO_POR_FAIXA[faixa].corTraco;
}

/**
 * Markup dos `<pattern>` das texturas, em string, para o SVG estático de
 * `public/svg/`. O componente React usa o mesmo desenho em `<DefsProgresso />`
 * — a fonte da verdade das duas é esta constante, para não divergirem.
 */
export const DEFS_TEXTURAS_SVG = `<defs>
    <pattern id="gv-textura-em-andamento" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
      <rect width="8" height="8" fill="${OURO}" />
      <rect width="3" height="8" fill="${ESTILO_POR_FAIXA.em_andamento.corTraco}" opacity="0.55" />
    </pattern>
    <pattern id="gv-textura-concluido" patternUnits="userSpaceOnUse" width="6" height="6">
      <rect width="6" height="6" fill="${COR_CONCLUIDO}" />
      <circle cx="1.5" cy="1.5" r="1.1" fill="${CREME}" opacity="0.7" />
      <circle cx="4.5" cy="4.5" r="1.1" fill="${CREME}" opacity="0.7" />
    </pattern>
  </defs>`;
