/**
 * Tipos do import do cronograma (Smartsheet .xlsx → Supabase).
 *
 * Dono deste módulo: agente `importador-cronograma`.
 * Consome tipos do banco de `types/database.ts` (dono: `arquiteto-dados`).
 */

import type { TipoElementoVisual } from '@/types/database';

/** Uma linha crua da planilha, já indexada por nome de coluna do Smartsheet. */
export interface LinhaBruta {
  /** Número da linha na planilha (1-based, igual ao que o Excel mostra). */
  linhaPlanilha: number;
  /** Valor cru de cada célula, na ordem das colunas do cabeçalho reconhecido. */
  celulas: Record<ColunaSmartsheet, unknown>;
}

/** Colunas do export do Smartsheet que este import consome. */
export type ColunaSmartsheet =
  | 'nivel'
  | 'predecessores'
  | 'percentualConcluida'
  | 'atividade'
  | 'duracao'
  | 'iniciar'
  | 'terminar'
  | 'caminhoCritico'
  | 'indicadorPrazo'
  | 'folga'
  | 'haPulmao'
  | 'sucessoras'
  | 'recurso';

/** Grupo macro (nível 1 do ramo "E.E.E. - NOVO MUNDO"). */
export interface GrupoParseado {
  /**
   * String EXATA do nível 1 no .xlsx (ex.: "DRENAGEM - Canal e muro").
   * É a chave de casamento com `grupos_macro.nome_smartsheet`.
   */
  nomeSmartsheet: string;
  /**
   * Rótulo legível da UI. O import NÃO inventa esse valor: quem manda é o
   * `grupos_macro.nome` já semeado. Aqui fica só o fallback usado quando o
   * grupo ainda não existe no banco (= a própria string do .xlsx).
   */
  nomeFallback: string;
  /** Ordem de aparição no .xlsx (1..7) — bate com a ordem do seed. */
  ordem: number;
  linhaPlanilha: number;
  /** % da própria linha de rollup do Smartsheet, quando preenchido (0–100). */
  percentualConcluido: number | null;
}

/** Uma atividade (qualquer nível > 1 dentro do ramo em escopo). */
export interface AtividadeParseada {
  linhaPlanilha: number;
  /** String exata do grupo macro no .xlsx — casa com `nome_smartsheet`. */
  grupoMacroSmartsheet: string;
  /** Nível de hierarquia original do Smartsheet (2..6). */
  wbsNivel: number;
  /**
   * Nome curto — último segmento do caminho. Vai para `atividades.nome`, que é
   * o que a UI exibe e que NÃO é único dentro do grupo macro.
   */
  nome: string;
  /**
   * Caminho WBS relativo ao grupo macro, do nível 2 até esta linha.
   * Ex.: ["Elevatória de esgoto bruto", "Fosso de sucção", "Concretagem"].
   */
  caminhoWbs: string[];
  /**
   * `caminhoWbs` unido por " > ". Vai para `atividades.caminho_wbs` e é metade
   * da chave de upsert — ver `CHAVE_UPSERT` em `parser.ts`.
   */
  caminhoWbsTexto: string;
  predecessores: string | null;
  duracaoDias: number | null;
  /** ISO `yyyy-mm-dd` ou null. */
  dataInicioPlanejada: string | null;
  dataFimPlanejada: string | null;
  /** 0–100 (o Smartsheet exporta fração 0–1; a conversão é feita no parser). */
  percentualConcluido: number;
  caminhoCritico: boolean;
  folgaDias: number | null;
  recurso: string | null;
  /** Folha do WBS (nenhuma linha filha abaixo dela). */
  ehFolha: boolean;
  /** Elemento visual inferido pelas regras explícitas, ou null quando incerto. */
  tipoElementoVisual: TipoElementoVisual | null;
}

/**
 * Assinatura da regra de vínculo atividade → elemento visual.
 *
 * Fica em `tipos.ts` (não em `mapeamento-elementos.ts`) porque é consumida por
 * `parser.ts` só como TIPO — `interpretarLinhas` recebe a função pronta via
 * `OpcoesInterpretacao.inferirElementoVisual`, nunca importa
 * `mapeamento-elementos.ts` diretamente. Quem decide qual regra usar para cada
 * dispositivo é `lib/smartsheet/config-dispositivos.ts`.
 */
export type InferirElementoVisualFn = (
  caminhoWbs: readonly string[],
  grupoMacroNome: string,
) => TipoElementoVisual | null;

/** Resultado completo do parse de um arquivo. */
export interface ResultadoParse {
  grupos: GrupoParseado[];
  atividades: AtividadeParseada[];
  /** Linha raiz do ramo em escopo. */
  raiz: {
    linhaPlanilha: number;
    nome: string;
    /** Rollup de % do próprio Smartsheet (0–100), a referência oficial do "6%". */
    percentualConcluido: number | null;
    dataInicioPlanejada: string | null;
    dataFimPlanejada: string | null;
  };
  /** Linhas com conteúdo que ficaram FORA do ramo "E.E.E. - NOVO MUNDO". */
  linhasForaDeEscopo: number;
  /** Linhas em branco no fim da planilha (ruído do export). */
  linhasVaziasIgnoradas: number;
  /** Avisos não fatais (dados faltando, colisões de nome, formatos estranhos). */
  avisos: string[];
}
