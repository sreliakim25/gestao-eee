/**
 * Mapa de regras explícitas: caminho WBS → elemento visual da Gestão Visual.
 *
 * Filosofia: NUNCA adivinhar. Cada regra abaixo foi conferida contra a estrutura
 * real de "Materiais/EEE - Novo Mundo.xlsx". Quando nenhuma regra casa com
 * certeza, o vínculo fica `null` e a atividade simplesmente não colore nenhum
 * elemento do SVG — é preferível a um vínculo errado, que falsearia o % do
 * elemento no Painel e na Gestão Visual.
 *
 * Os `tipo` usados aqui são os 9 do enum `tipo_elemento_visual` já semeados em
 * `supabase/seed.sql`. O script resolve tipo → `elementos_visuais.id` no momento
 * da escrita, para não depender de UUID fixo.
 */

import type { TipoElementoVisual } from '@/types/database';

/** Normaliza texto para comparação: sem acento, minúsculo, espaços colapsados. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

interface RegraElemento {
  tipo: TipoElementoVisual;
  /** Descrição da evidência no .xlsx — serve de documentação viva. */
  motivo: string;
  /**
   * Recebe os segmentos do caminho WBS (relativo ao grupo macro) e o grupo
   * macro canônico, ambos JÁ normalizados. Retorna true se a regra casa.
   */
  casa: (segmentos: string[], grupoMacro: string) => boolean;
}

/** Auxiliar: algum segmento do caminho contém um dos termos. */
function algumSegmentoContem(segmentos: string[], ...termos: string[]): boolean {
  return segmentos.some((s) => termos.some((t) => s.includes(t)));
}

/**
 * Regras avaliadas em ordem — a primeira que casar vence.
 * A ordem importa: as caixas específicas vêm antes de regras mais amplas.
 */
export const REGRAS_ELEMENTO_VISUAL: readonly RegraElemento[] = [
  {
    tipo: 'poco_umido',
    motivo: 'CIVIL > Elevatória de esgoto bruto > "Fosso de sucção" é o poço úmido.',
    casa: (s) => algumSegmentoContem(s, 'fosso de succao', 'poco de succao', 'poco umido'),
  },
  {
    tipo: 'camara_grades',
    motivo:
      'CIVIL > Elevatória > "Área das escadas, caixa de areia e calha Parshall" é a câmara de grades/escadas descrita na seção 1 do plano.',
    casa: (s) =>
      algumSegmentoContem(s, 'camara de grades') ||
      algumSegmentoContem(s, 'area das escadas'),
  },
  {
    tipo: 'caixa_comporta',
    motivo: 'CIVIL > Elevatória > "Caixa de comporta".',
    casa: (s) => algumSegmentoContem(s, 'caixa de comporta', 'caixa da comporta'),
  },
  {
    tipo: 'caixa_valvulas',
    motivo: 'CIVIL > Elevatória > "Caixa com válvulas do barrilete de recalque".',
    casa: (s) => algumSegmentoContem(s, 'caixa com valvulas', 'caixa de valvulas'),
  },
  {
    tipo: 'caixa_tanque_hidropneumatico',
    motivo: 'CIVIL > Elevatória > "Caixa para tanque hidropneumático".',
    // Exige a palavra "caixa" no mesmo segmento para não capturar a instalação
    // hidromecânica do tanque, que é montagem e não estrutura.
    casa: (s) => s.some((seg) => seg.includes('caixa') && seg.includes('tanque hidropneumatico')),
  },
  {
    tipo: 'caixa_medidor_vazao',
    motivo: 'CIVIL > Elevatória > "Caixa para medidor de vazão".',
    // Também exige "caixa": ELÉTRICA > "Instalação de medidor de vazão do
    // macromedidor" é serviço elétrico e NÃO deve vincular à estrutura da caixa.
    casa: (s) => s.some((seg) => seg.includes('caixa') && seg.includes('medidor de vazao')),
  },
  {
    tipo: 'casa_comando',
    motivo:
      'CIVIL > "Casa de comando" (obra civil) e ELÉTRICA > "Casa de comando" (instalações) apontam para o mesmo elemento físico.',
    casa: (s) => algumSegmentoContem(s, 'casa de comando'),
  },
  {
    tipo: 'muro_perimetral',
    motivo:
      'CIVIL > "Muro perimetral (~150m)". O muro ciclópico do canal (grupo DRENAGEM) é outra coisa e fica de fora de propósito.',
    casa: (s) => algumSegmentoContem(s, 'muro perimetral'),
  },
  {
    tipo: 'pavimentacao',
    motivo:
      'CIVIL > "Pavimentação" (meio-fio, pano) e CIVIL > Elevatória > "Passeio em concreto (155m²)", ambos piso dentro do muro.',
    casa: (s) => algumSegmentoContem(s, 'pavimentacao', 'passeio em concreto'),
  },
] as const;

/**
 * Infere o elemento visual de uma atividade a partir do seu caminho WBS.
 * Retorna `null` quando nenhuma regra casa — comportamento desejado.
 */
export function inferirElementoVisual(
  caminhoWbs: readonly string[],
  grupoMacroNome: string,
): TipoElementoVisual | null {
  const segmentos = caminhoWbs.map(normalizarTexto);
  const grupo = normalizarTexto(grupoMacroNome);
  for (const regra of REGRAS_ELEMENTO_VISUAL) {
    if (regra.casa(segmentos, grupo)) return regra.tipo;
  }
  return null;
}
