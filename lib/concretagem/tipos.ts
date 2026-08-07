/**
 * lib/concretagem/tipos.ts — Tipos do domínio de concretagem.
 *
 * Dono: agente `concretagem-orcamento`.
 * Regras puras, sem I/O e sem React. Nada aqui calcula % de evolução física
 * (isso é de `lib/calculos/`, dono `motor-indicadores`).
 */

import type { StatusPedidoConcretagem } from '@/types/database';

/* -------------------------------------------------------------------------- */
/* Plano de concretagem                                                        */
/* -------------------------------------------------------------------------- */

/** Número da etapa do plano (1 a 4). */
export type NumeroEtapa = 1 | 2 | 3 | 4;

/** Elemento estrutural concretado (parede, laje, acessório). */
export interface ElementoConcretagem {
  /** Identificação do projeto estrutural: "Par 5", "LF1", "LT1", "B1"... */
  codigo: string;
  descricao: string;
  /** Espessura em cm, quando cotada nas pranchas de forma. */
  espessuraCm: number | null;
  /** Comprimento em cm, quando cotado. */
  comprimentoCm: number | null;
  /** Altura em m, quando cotada. */
  alturaM: number | null;
  /**
   * Volume em m³ conforme o plano. `null` quando o plano traz apenas o volume
   * agregado da etapa e não detalha o elemento — nunca inventar número aqui.
   */
  volumeM3: number | null;
  /** Altura aproximada/estimada no plano (marcada com "~" no documento). */
  alturaAproximada?: boolean;
  /** Elemento executado em 2ª fase, após o reaterro (escadas E1/E2). */
  segundaFase?: boolean;
}

/** Etapa do plano de execução da concretagem. */
export interface EtapaPlano {
  etapa: NumeroEtapa;
  titulo: string;
  /** Volume total da etapa, em m³, conforme a tabela "Volumes por etapa". */
  volumeM3: number;
  /** Cargas previstas no plano, em m³ (ex.: [14, 9.5]). */
  cargasPrevistasM3: readonly number[];
  /** Dias previstos, conforme a coluna "Dias previstos" do plano. */
  diaInicio: number;
  diaFim: number;
  elementos: readonly ElementoConcretagem[];
  /** Passos executivos da seção 2 do plano. */
  sequenciaExecutiva: readonly string[];
  /** True quando o próprio plano manda combinar com outra frente. */
  exigeCombinacaoComOutraFrente: boolean;
  observacoes?: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Checklist pré-concretagem                                                   */
/* -------------------------------------------------------------------------- */

/** Identificadores estáveis dos itens do checklist (persistidos no jsonb). */
export type IdItemChecklist =
  | 'slump'
  | 'cobrimento'
  | 'forma_travada'
  | 'aditivo_cristalizante'
  | 'agregado_graudo'
  | 'cura_7_dias'
  | 'desforma_14_dias'
  | 'furos_recompostos';

/** Definição (imutável) de um item do checklist técnico. */
export interface ItemChecklist {
  id: IdItemChecklist;
  rotulo: string;
  detalhe: string;
  /** Referência normativa/técnica citada no plano, quando houver. */
  referencia?: string;
  /**
   * Itens obrigatórios travam a marcação de "concretado".
   * O item condicional (`furos_recompostos`) só se aplica quando há furo em
   * peça já concretada.
   */
  obrigatorio: boolean;
  /** Item que aceita um valor medido em campo (ex.: slump em mm). */
  unidadeValor?: 'mm' | 'cm' | 'dias';
}

/** Estado de um item do checklist em um pedido concreto. */
export interface EstadoItemChecklist {
  marcado: boolean;
  /** Valor medido em campo (slump em mm, cobrimento em cm, cura em dias). */
  valor?: number | null;
  observacao?: string | null;
  /** ISO 8601 de quando o item foi marcado. */
  marcadoEm?: string | null;
}

/** Estado completo do checklist, como fica em `concretagem_pedidos.checklist_json`. */
export type EstadoChecklist = Partial<Record<IdItemChecklist, EstadoItemChecklist>>;

/** Resultado da avaliação do checklist de um pedido. */
export interface AvaliacaoChecklist {
  completo: boolean;
  totalObrigatorios: number;
  marcadosObrigatorios: number;
  /** 0 a 100, apenas para barra de progresso da UI. */
  percentual: number;
  pendentes: readonly ItemChecklist[];
  /** Itens marcados com valor medido fora da faixa técnica. */
  foraDeFaixa: readonly { item: ItemChecklist; valor: number; mensagem: string }[];
}

/* -------------------------------------------------------------------------- */
/* Pedido de concreto                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Recorte de `concretagem_pedidos` usado pelas regras puras.
 * Propositalmente menor que a Row do banco: as regras não dependem de
 * `criado_em`, `atualizado_em` etc.
 */
export interface PedidoConcretagem {
  id: string;
  etapa: NumeroEtapa;
  elementos: readonly string[];
  volumeM3: number;
  dataPrevista: string | null;
  dataRealizada: string | null;
  status: StatusPedidoConcretagem;
  combinadoComSobra: boolean;
  checklist: EstadoChecklist;
  notaFiscalRef?: string | null;
  observacoes?: string | null;
}

/** Severidade de um alerta de validação. */
export type NivelAlerta = 'bloqueio' | 'atencao' | 'info';

/** Códigos estáveis de alerta (usados em teste e na UI). */
export type CodigoAlerta =
  | 'VOLUME_NAO_POSITIVO'
  | 'VOLUME_ABAIXO_MINIMO'
  | 'VOLUME_ABAIXO_MINIMO_COMBINADO'
  | 'ULTIMA_CARGA_ABAIXO_MINIMO'
  | 'SEM_DATA_REALIZADA'
  | 'CHECKLIST_INCOMPLETO'
  | 'CHECKLIST_FORA_DE_FAIXA'
  | 'SEM_NOTA_FISCAL';

export interface AlertaPedido {
  nivel: NivelAlerta;
  codigo: CodigoAlerta;
  mensagem: string;
}

/** Resultado da validação de um pedido. */
export interface ValidacaoPedido {
  /** false quando existe pelo menos um alerta de nível `bloqueio`. */
  liberado: boolean;
  alertas: readonly AlertaPedido[];
  caminhoes: CalculoCaminhoes;
  checklist: AvaliacaoChecklist;
}

/** Resultado do cálculo de caminhões/sobra de uma remessa. */
export interface CalculoCaminhoes {
  volumeM3: number;
  numCaminhoes: number;
  /** Carga de cada caminhão, em m³, na ordem de chegada. */
  cargasM3: readonly number[];
  /** Volume da última carga (a que costuma ficar abaixo do mínimo). */
  ultimaCargaM3: number;
  /** Capacidade contratada ociosa: numCaminhoes × capacidade − volume. */
  sobraCapacidadeM3: number;
  /** True quando a última carga fica abaixo do pedido mínimo de 5 m³. */
  ultimaCargaAbaixoDoMinimo: boolean;
}

/* -------------------------------------------------------------------------- */
/* Combinação de sobras                                                        */
/* -------------------------------------------------------------------------- */

/** Pedido parceiro escolhido para fechar o volume mínimo. */
export interface ParceiroCombinacao {
  id: string;
  etapa: NumeroEtapa;
  volumeM3: number;
  dataPrevista: string | null;
  /** Diferença absoluta de dias entre as datas previstas (null se faltar data). */
  distanciaDias: number | null;
}

/** Sugestão de combinação para um pedido abaixo do mínimo. */
export interface SugestaoCombinacao {
  pedidoId: string;
  etapa: NumeroEtapa;
  volumeM3: number;
  /** Quanto falta para atingir os 5 m³. */
  faltamM3: number;
  parceiros: readonly ParceiroCombinacao[];
  volumeCombinadoM3: number;
  atingeMinimo: boolean;
  mensagem: string;
}

export interface OpcoesCombinacao {
  /** Janela, em dias, para considerar dois pedidos combináveis. Padrão: 7. */
  janelaDias?: number;
  /** Capacidade máxima do caminhão, em m³. Padrão: 14. */
  capacidadeCaminhaoM3?: number;
  /** Aceita parceiro sem data prevista. Padrão: true. */
  aceitarSemData?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Máquina de estados                                                          */
/* -------------------------------------------------------------------------- */

export type CodigoErroTransicao =
  | 'TRANSICAO_INEXISTENTE'
  | 'PULO_DE_ETAPA'
  | 'RETROCESSO'
  | 'MESMO_STATUS'
  | 'STATUS_FINAL'
  | 'SEM_DATA_REALIZADA'
  | 'CHECKLIST_INCOMPLETO'
  | 'VOLUME_ABAIXO_MINIMO';

export interface ResultadoTransicao {
  permitida: boolean;
  erros: readonly { codigo: CodigoErroTransicao; mensagem: string }[];
}

/** Contexto necessário para validar a transição para `concretado`. */
export interface ContextoTransicao {
  dataRealizada?: string | null;
  checklist?: EstadoChecklist;
  volumeM3?: number;
  combinadoComSobra?: boolean;
}
