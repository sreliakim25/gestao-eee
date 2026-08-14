/**
 * lib/smartsheet/config-dispositivos.ts — registro explícito de configuração
 * de import por dispositivo (projeto).
 *
 * POR QUE UM REGISTRO EXPLÍCITO, E NÃO AUTO-DETECÇÃO
 *
 * A EEE Novo Mundo é, até hoje, o ÚNICO dispositivo confirmado cuja planilha
 * do Smartsheet é comprovadamente um macro-cronograma corporativo com mais de
 * um ramo — por isso precisa de `nomeRaizEscopo` para podar só o ramo dela
 * (ver `scripts/import/parser.ts`). Os demais dispositivos da UDE confirmados
 * até agora têm planilha DEDICADA: a planilha inteira já é o cronograma do
 * dispositivo, sem ramo nenhum para podar.
 *
 * Detectar isso "magicamente" (heurística sobre a estrutura do .xlsx) seria
 * frágil e daria falso positivo/negativo em silêncio. Este mapa é pequeno e
 * de leitura direta: um dispositivo fora dele usa os defaults genéricos de
 * `interpretarLinhas` (sem poda de ramo, `elemento_visual_id = null` em
 * tudo) — nunca trava o import por falta de configuração.
 *
 * Quem adiciona uma entrada aqui: só quando um dispositivo precisar de poda
 * de ramo (planilha compartilhada) ou tiver seu próprio mapeamento de
 * elemento visual da Gestão Visual.
 */

import { inferirElementoVisual } from '@/scripts/import/mapeamento-elementos';
import { NOME_RAIZ_ESCOPO, type OpcoesInterpretacao } from '@/scripts/import/parser';
import { NOME_PROJETO } from '@/scripts/import/upsert';

/** Configuração de import específica de um dispositivo — mesmo shape aceito por `interpretarLinhas`. */
export type ConfiguracaoDispositivo = OpcoesInterpretacao;

/** `projetos.nome` → configuração de import específica do dispositivo. */
export const CONFIGURACAO_POR_DISPOSITIVO: Readonly<Record<string, ConfiguracaoDispositivo>> = {
  [NOME_PROJETO]: {
    nomeRaizEscopo: NOME_RAIZ_ESCOPO,
    inferirElementoVisual,
  },
};

/**
 * Configuração de import de um dispositivo pelo `projetos.nome`.
 *
 * Dispositivo fora do registro devolve `{}` — os defaults genéricos de
 * `interpretarLinhas` (sem poda de ramo, sem vínculo de elemento visual).
 * Nunca lança: um dispositivo sem entrada aqui é o caso ESPERADO, não um erro.
 */
export function obterConfiguracaoDispositivo(nomeProjeto: string): ConfiguracaoDispositivo {
  return CONFIGURACAO_POR_DISPOSITIVO[nomeProjeto] ?? {};
}
