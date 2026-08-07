/**
 * components/lancamento/validation.ts — validação do lançamento de produção.
 *
 * Roda no cliente ANTES de bater no banco. Espelha as constraints reais de
 * `avancos_semanais`:
 *   - `avancos_semanais_segunda_feira`: `semana_referencia` é sempre a
 *     segunda-feira da semana ISO;
 *   - percentuais entre 0 e 100;
 *   - `UNIQUE (atividade_id, semana_referencia)` — por isso o envio é upsert.
 *
 * Erro de constraint chega ao usuário como mensagem críptica do Postgres; esta
 * camada existe para que isso não aconteça na obra.
 */

import { formatarDataISO, paraDataUTC, segundaFeiraDaSemana } from '@/lib/calculos';

/** Valores crus do formulário (tudo string, como vem dos inputs). */
export interface ProductionEntryValues {
  atividadeId: string;
  semanaReferencia: string;
  percentualRealizado: string;
  percentualPlanejado: string;
  observacoes: string;
}

/** Payload já normalizado, pronto para o insert/upsert. */
export interface ProductionEntryPayload {
  atividade_id: string;
  semana_referencia: string;
  percentual_realizado_acumulado: number;
  percentual_planejado_acumulado: number;
  observacoes: string | null;
}

export type ProductionEntryField = keyof ProductionEntryValues;

export interface ValidationResult {
  valido: boolean;
  erros: Partial<Record<ProductionEntryField, string>>;
  payload: ProductionEntryPayload | null;
}

export const VALORES_INICIAIS: ProductionEntryValues = {
  atividadeId: '',
  semanaReferencia: '',
  percentualRealizado: '',
  percentualPlanejado: '',
  observacoes: '',
};

/** A data é uma segunda-feira (ISO dow = 1)? */
export function ehSegundaFeira(valor: string): boolean {
  const data = paraDataUTC(valor);
  if (!data) return false;
  return formatarDataISO(segundaFeiraDaSemana(data)) === formatarDataISO(data);
}

/** Segunda-feira da semana da data informada ('' se a data for inválida). */
export function segundaDaSemanaDe(valor: string): string {
  const data = paraDataUTC(valor);
  if (!data) return '';
  return formatarDataISO(segundaFeiraDaSemana(data));
}

/** Converte texto de percentual em número; `null` quando não é número válido. */
function paraNumero(texto: string): number | null {
  const limpo = texto.replace(',', '.').trim();
  if (limpo === '') return null;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

/** Valida o formulário inteiro e devolve o payload pronto quando tudo passa. */
export function validarLancamento(valores: ProductionEntryValues): ValidationResult {
  const erros: Partial<Record<ProductionEntryField, string>> = {};

  if (!valores.atividadeId) {
    erros.atividadeId = 'Selecione a atividade.';
  }

  if (!valores.semanaReferencia) {
    erros.semanaReferencia = 'Informe a semana de referência.';
  } else if (!paraDataUTC(valores.semanaReferencia)) {
    erros.semanaReferencia = 'Data inválida.';
  } else if (!ehSegundaFeira(valores.semanaReferencia)) {
    const sugestao = segundaDaSemanaDe(valores.semanaReferencia);
    erros.semanaReferencia = `A semana de referência precisa ser uma segunda-feira. Use ${sugestao}.`;
  }

  const realizado = paraNumero(valores.percentualRealizado);
  if (realizado === null) {
    erros.percentualRealizado = 'Informe o percentual realizado acumulado.';
  } else if (realizado < 0 || realizado > 100) {
    erros.percentualRealizado = 'O percentual deve estar entre 0 e 100.';
  }

  const planejado = paraNumero(valores.percentualPlanejado);
  if (valores.percentualPlanejado.trim() !== '') {
    if (planejado === null) {
      erros.percentualPlanejado = 'Percentual planejado inválido.';
    } else if (planejado < 0 || planejado > 100) {
      erros.percentualPlanejado = 'O percentual deve estar entre 0 e 100.';
    }
  }

  if (valores.observacoes.length > 1000) {
    erros.observacoes = 'Limite de 1000 caracteres nas observações.';
  }

  const valido = Object.keys(erros).length === 0;

  return {
    valido,
    erros,
    payload:
      valido && realizado !== null
        ? {
            atividade_id: valores.atividadeId,
            semana_referencia: valores.semanaReferencia,
            percentual_realizado_acumulado: realizado,
            percentual_planejado_acumulado: planejado ?? 0,
            observacoes: valores.observacoes.trim() || null,
          }
        : null,
  };
}
