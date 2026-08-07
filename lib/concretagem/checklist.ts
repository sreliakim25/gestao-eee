/**
 * lib/concretagem/checklist.ts — Checklist técnico pré-concretagem.
 *
 * Transcrição da seção 3 do `Plano_Execucao_Concretagem_EEE.docx`
 * ("Checklist antes de cada concretagem"), em itens tipados — nunca string solta.
 *
 * REGRA CRÍTICA: um pedido só pode ser marcado como "concretado" com todos os
 * itens obrigatórios marcados (ver `lib/concretagem/status.ts`).
 */

import type { Json } from '@/types/database';
import type {
  AvaliacaoChecklist,
  EstadoChecklist,
  EstadoItemChecklist,
  IdItemChecklist,
  ItemChecklist,
} from './tipos';

/* -------------------------------------------------------------------------- */
/* Parâmetros técnicos (todos vindos do plano)                                 */
/* -------------------------------------------------------------------------- */

/** Slump alvo na chegada do caminhão, em mm. */
export const SLUMP_ALVO_MM = 60;
/** Tolerância do slump, em mm (faixa aceita: 50 a 70 mm). */
export const SLUMP_TOLERANCIA_MM = 10;
/** Cobrimento nominal mínimo, em cm — classe de agressividade ambiental IV. */
export const COBRIMENTO_NOMINAL_MINIMO_CM = 5;
/** Dimensão máxima do agregado graúdo, em mm, em regiões densamente armadas. */
export const AGREGADO_GRAUDO_MAXIMO_MM = 25;
/** Cura mínima das superfícies expostas, em dias corridos. */
export const CURA_MINIMA_DIAS = 7;
/** Desforma total apenas após este prazo, em dias (NBR 14931:2023, itens 11 e 12). */
export const DESFORMA_MINIMA_DIAS = 14;

/** Faixa aceita de slump, em mm. */
export const FAIXA_SLUMP_MM = {
  minimo: SLUMP_ALVO_MM - SLUMP_TOLERANCIA_MM,
  maximo: SLUMP_ALVO_MM + SLUMP_TOLERANCIA_MM,
} as const;

/* -------------------------------------------------------------------------- */
/* Definição dos itens                                                         */
/* -------------------------------------------------------------------------- */

export const ITENS_CHECKLIST: readonly ItemChecklist[] = [
  {
    id: 'slump',
    rotulo: `Ensaio de slump na chegada do caminhão (${SLUMP_ALVO_MM} mm ± ${SLUMP_TOLERANCIA_MM} mm)`,
    detalhe: `Rejeitar a carga fora da faixa de ${FAIXA_SLUMP_MM.minimo} a ${FAIXA_SLUMP_MM.maximo} mm.`,
    obrigatorio: true,
    unidadeValor: 'mm',
  },
  {
    id: 'cobrimento',
    rotulo: `Conferência de armadura e cobrimento nominal (Cn ≥ ${COBRIMENTO_NOMINAL_MINIMO_CM},0 cm, CAA IV)`,
    detalhe: 'Conferir antes de fechar a forma.',
    obrigatorio: true,
    unidadeValor: 'cm',
  },
  {
    id: 'forma_travada',
    rotulo: 'Forma travada e estanque',
    detalhe: 'Juntas de concretagem verticais, tipo "pente", com agregado graúdo exposto (sem nata vitrificada).',
    referencia: 'NBR 14931:2023, item 10.7.1.5',
    obrigatorio: true,
  },
  {
    id: 'aditivo_cristalizante',
    rotulo: 'Aditivo cristalizante dosado em todo o concreto estrutural',
    detalhe: 'Sika WT-200P ou similar.',
    obrigatorio: true,
  },
  {
    id: 'agregado_graudo',
    rotulo: `Agregado graúdo máx. ${AGREGADO_GRAUDO_MAXIMO_MM} mm nas regiões densamente armadas`,
    detalhe: 'Conferir com a concreteira antes da saída do caminhão.',
    obrigatorio: true,
    unidadeValor: 'mm',
  },
  {
    id: 'cura_7_dias',
    rotulo: `Cura das superfícies expostas por no mínimo ${CURA_MINIMA_DIAS} dias corridos`,
    detalhe: 'Programar a cura antes do lançamento — sem cura não se libera a etapa seguinte.',
    obrigatorio: true,
    unidadeValor: 'dias',
  },
  {
    id: 'desforma_14_dias',
    rotulo: `Desforma total apenas após ${DESFORMA_MINIMA_DIAS} dias`,
    detalhe: 'Conforme NBR 14931/2023 (itens 11 e 12).',
    referencia: 'NBR 14931:2023, itens 11 e 12',
    obrigatorio: true,
    unidadeValor: 'dias',
  },
  {
    id: 'furos_recompostos',
    rotulo: 'Furos para tubulação em paredes já concretadas',
    detalhe:
      'Executar com equipamento de baixo impacto e recompor com graute não retrátil e fita hidroexpansiva. Item condicional: só se aplica quando houver furo em peça já concretada.',
    obrigatorio: false,
  },
];

/** Itens obrigatórios (os que travam a marcação de "concretado"). */
export const ITENS_OBRIGATORIOS: readonly ItemChecklist[] = ITENS_CHECKLIST.filter((i) => i.obrigatorio);

/** Item do checklist pelo id. */
export function buscarItemChecklist(id: IdItemChecklist): ItemChecklist {
  const achado = ITENS_CHECKLIST.find((i) => i.id === id);
  if (!achado) throw new Error(`Item de checklist "${id}" não existe.`);
  return achado;
}

/* -------------------------------------------------------------------------- */
/* Estado do checklist                                                         */
/* -------------------------------------------------------------------------- */

/** Checklist zerado, para um pedido novo. */
export function criarChecklistVazio(): EstadoChecklist {
  const estado: EstadoChecklist = {};
  for (const item of ITENS_CHECKLIST) {
    estado[item.id] = { marcado: false, valor: null, observacao: null, marcadoEm: null };
  }
  return estado;
}

/**
 * Lê o `checklist_json` do banco (jsonb livre) de forma defensiva.
 * Chave desconhecida é ignorada; formato inesperado vira item não marcado.
 */
export function lerChecklist(json: Json | null | undefined): EstadoChecklist {
  const estado = criarChecklistVazio();
  if (!json || typeof json !== 'object' || Array.isArray(json)) return estado;

  for (const item of ITENS_CHECKLIST) {
    const bruto = (json as Record<string, unknown>)[item.id];
    if (bruto === true) {
      estado[item.id] = { marcado: true, valor: null, observacao: null, marcadoEm: null };
      continue;
    }
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) continue;

    const registro = bruto as Record<string, unknown>;
    estado[item.id] = {
      marcado: registro.marcado === true,
      valor: typeof registro.valor === 'number' ? registro.valor : null,
      observacao: typeof registro.observacao === 'string' ? registro.observacao : null,
      marcadoEm: typeof registro.marcadoEm === 'string' ? registro.marcadoEm : null,
    };
  }
  return estado;
}

/** Serializa o estado para gravar em `concretagem_pedidos.checklist_json`. */
export function serializarChecklist(estado: EstadoChecklist): Json {
  const saida: Record<string, Json> = {};
  for (const item of ITENS_CHECKLIST) {
    const atual = estado[item.id];
    saida[item.id] = {
      marcado: atual?.marcado === true,
      valor: atual?.valor ?? null,
      observacao: atual?.observacao ?? null,
      marcadoEm: atual?.marcadoEm ?? null,
    };
  }
  return saida;
}

/** Marca/desmarca um item, devolvendo um estado novo (função pura). */
export function marcarItem(
  estado: EstadoChecklist,
  id: IdItemChecklist,
  dados: Partial<EstadoItemChecklist> & { marcado: boolean },
): EstadoChecklist {
  buscarItemChecklist(id); // valida o id
  return {
    ...estado,
    [id]: {
      marcado: dados.marcado,
      valor: dados.valor ?? estado[id]?.valor ?? null,
      observacao: dados.observacao ?? estado[id]?.observacao ?? null,
      marcadoEm: dados.marcadoEm ?? (dados.marcado ? new Date().toISOString() : null),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Validação de valores medidos                                                */
/* -------------------------------------------------------------------------- */

/** Slump dentro da faixa 60 mm ± 10 mm. */
export function slumpDentroDaFaixa(mm: number): boolean {
  return mm >= FAIXA_SLUMP_MM.minimo && mm <= FAIXA_SLUMP_MM.maximo;
}

/** Cobrimento nominal atende à CAA IV (≥ 5 cm). */
export function cobrimentoAtende(cm: number): boolean {
  return cm >= COBRIMENTO_NOMINAL_MINIMO_CM;
}

/**
 * Verifica o valor medido de um item, quando informado.
 * Retorna a mensagem de erro, ou null quando está dentro do especificado.
 */
export function conferirValorMedido(id: IdItemChecklist, valor: number): string | null {
  switch (id) {
    case 'slump':
      return slumpDentroDaFaixa(valor)
        ? null
        : `Slump de ${valor} mm fora da faixa ${FAIXA_SLUMP_MM.minimo}–${FAIXA_SLUMP_MM.maximo} mm: rejeitar a carga.`;
    case 'cobrimento':
      return cobrimentoAtende(valor)
        ? null
        : `Cobrimento de ${valor} cm abaixo do nominal de ${COBRIMENTO_NOMINAL_MINIMO_CM} cm exigido para CAA IV.`;
    case 'agregado_graudo':
      return valor <= AGREGADO_GRAUDO_MAXIMO_MM
        ? null
        : `Agregado graúdo de ${valor} mm acima do máximo de ${AGREGADO_GRAUDO_MAXIMO_MM} mm.`;
    case 'cura_7_dias':
      return valor >= CURA_MINIMA_DIAS
        ? null
        : `Cura de ${valor} dias abaixo do mínimo de ${CURA_MINIMA_DIAS} dias corridos.`;
    case 'desforma_14_dias':
      return valor >= DESFORMA_MINIMA_DIAS
        ? null
        : `Desforma com ${valor} dias antes do mínimo de ${DESFORMA_MINIMA_DIAS} dias (NBR 14931:2023).`;
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Avaliação                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Avalia o checklist de um pedido.
 *
 * `completo` exige TODOS os itens obrigatórios marcados E nenhum valor medido
 * fora de faixa. Item condicional (`furos_recompostos`) não entra na conta.
 */
export function avaliarChecklist(estado: EstadoChecklist): AvaliacaoChecklist {
  const pendentes: ItemChecklist[] = [];
  const foraDeFaixa: { item: ItemChecklist; valor: number; mensagem: string }[] = [];

  for (const item of ITENS_OBRIGATORIOS) {
    if (estado[item.id]?.marcado !== true) pendentes.push(item);
  }

  for (const item of ITENS_CHECKLIST) {
    const valor = estado[item.id]?.valor;
    if (typeof valor !== 'number') continue;
    const erro = conferirValorMedido(item.id, valor);
    if (erro) foraDeFaixa.push({ item, valor, mensagem: erro });
  }

  const totalObrigatorios = ITENS_OBRIGATORIOS.length;
  const marcadosObrigatorios = totalObrigatorios - pendentes.length;

  return {
    completo: pendentes.length === 0 && foraDeFaixa.length === 0,
    totalObrigatorios,
    marcadosObrigatorios,
    percentual: totalObrigatorios === 0 ? 100 : Math.round((marcadosObrigatorios / totalObrigatorios) * 100),
    pendentes,
    foraDeFaixa,
  };
}

/** Atalho booleano de `avaliarChecklist`. */
export function checklistCompleto(estado: EstadoChecklist): boolean {
  return avaliarChecklist(estado).completo;
}
