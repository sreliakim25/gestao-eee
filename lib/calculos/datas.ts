/**
 * lib/calculos/datas.ts — utilidades de data para o motor de indicadores.
 *
 * REGRAS DESTE MÓDULO (não relaxar):
 * 1. Tudo é calculado em **UTC puro**. O Postgres entrega colunas `date` como
 *    'YYYY-MM-DD'; interpretar isso no fuso local faria a obra "andar um dia"
 *    dependendo de onde o navegador está (America/Recife vs. UTC da Vercel).
 * 2. Nenhuma função aqui chama `new Date()` sem argumento. A data de referência
 *    é sempre injetada por quem chama — requisito de testabilidade.
 * 3. Semana = semana ISO, começando na SEGUNDA-FEIRA, coerente com a constraint
 *    `avancos_semanais_segunda_feira` do banco.
 */

/** Entrada aceita para qualquer data: string ISO ('YYYY-MM-DD' ou timestamp) ou Date. */
export type DataEntrada = string | Date;

/** Milissegundos em um dia (sem horário de verão porque tudo é UTC). */
export const MS_POR_DIA = 86_400_000;

/** Dias em uma semana. */
export const DIAS_POR_SEMANA = 7;

/**
 * Converte uma entrada de data para um `Date` normalizado em meia-noite UTC.
 * Retorna `null` para valores nulos, vazios ou inválidos — nunca lança.
 *
 * Para `Date`, usa os componentes UTC do valor recebido (o timestamp já é
 * absoluto); para string, lê apenas a parte 'YYYY-MM-DD', ignorando horário
 * e offset, porque no banco essas colunas são `date` e não `timestamptz`.
 */
export function paraDataUTC(valor: DataEntrada | null | undefined): Date | null {
  if (valor === null || valor === undefined) return null;

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return new Date(
      Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate()),
    );
  }

  const texto = String(valor).trim();
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (!partes) return null;

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const data = new Date(Date.UTC(ano, mes - 1, dia));
  // Rejeita datas "estouradas" tipo 2026-02-31, que o Date silenciosamente rola.
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }
  return data;
}

/** Formata um `Date` como 'YYYY-MM-DD' (sempre em UTC). */
export function formatarDataISO(data: Date): string {
  const ano = String(data.getUTCFullYear()).padStart(4, '0');
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(data.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Soma (ou subtrai, com valor negativo) dias a uma data, em UTC. */
export function adicionarDias(data: Date, dias: number): Date {
  return new Date(data.getTime() + dias * MS_POR_DIA);
}

/**
 * Diferença em dias inteiros entre duas datas (fim - inicio).
 * Positivo quando `fim` é posterior. Como tudo está em meia-noite UTC,
 * o arredondamento apenas protege contra entradas com horário residual.
 */
export function diferencaEmDias(inicio: Date, fim: Date): number {
  return Math.round((fim.getTime() - inicio.getTime()) / MS_POR_DIA);
}

/**
 * Segunda-feira da semana ISO à qual a data pertence.
 * É a chave canônica de semana em todo o app (`avancos_semanais.semana_referencia`).
 */
export function segundaFeiraDaSemana(data: Date): Date {
  const diaSemana = data.getUTCDay(); // 0 = domingo ... 6 = sábado
  const deslocamento = (diaSemana + 6) % 7; // segunda = 0, domingo = 6
  return adicionarDias(data, -deslocamento);
}

/** Chave de semana ('YYYY-MM-DD' da segunda-feira) a partir de qualquer data. */
export function chaveSemana(valor: DataEntrada): string | null {
  const data = paraDataUTC(valor);
  if (!data) return null;
  return formatarDataISO(segundaFeiraDaSemana(data));
}

/** Domingo que fecha a semana cuja segunda-feira é `segunda`. */
export function domingoDaSemana(segunda: Date): Date {
  return adicionarDias(segunda, DIAS_POR_SEMANA - 1);
}

/**
 * Lista as segundas-feiras (inclusive) entre duas datas quaisquer.
 * A primeira semana é a da `inicio` e a última é a da `fim`.
 * Retorna `[]` se `fim` for anterior a `inicio`.
 *
 * `limiteSemanas` é uma trava de segurança contra datas absurdas vindas de um
 * import ruim do Smartsheet (ex.: ano 9999 travando o render do gráfico).
 */
export function listarSemanas(inicio: Date, fim: Date, limiteSemanas = 1040): Date[] {
  const primeira = segundaFeiraDaSemana(inicio);
  const ultima = segundaFeiraDaSemana(fim);
  if (ultima.getTime() < primeira.getTime()) return [];

  const semanas: Date[] = [];
  let atual = primeira;
  while (atual.getTime() <= ultima.getTime() && semanas.length < limiteSemanas) {
    semanas.push(atual);
    atual = adicionarDias(atual, DIAS_POR_SEMANA);
  }
  return semanas;
}

/**
 * Dias corridos restantes entre a data de referência e o fim planejado.
 * Retorna 0 quando o fim já passou ou quando alguma das datas é inválida.
 */
export function diasRestantes(
  dataReferencia: DataEntrada,
  dataFimPlanejada: DataEntrada | null | undefined,
): number {
  const referencia = paraDataUTC(dataReferencia);
  const fim = paraDataUTC(dataFimPlanejada);
  if (!referencia || !fim) return 0;
  return Math.max(0, diferencaEmDias(referencia, fim));
}

/**
 * Semanas restantes até o fim planejado, a partir de uma data de referência.
 *
 * Convenção: arredonda **para cima** (uma semana começada é uma semana que
 * ainda precisa ser trabalhada). Ex.: 05/08/2026 → 26/01/2027 = 174 dias
 * corridos = 24,86 semanas → **25 semanas**, que é o número divulgado no plano.
 * Retorna 0 se o fim já passou ou se as datas forem inválidas.
 */
export function semanasRestantes(
  dataReferencia: DataEntrada,
  dataFimPlanejada: DataEntrada | null | undefined,
): number {
  const dias = diasRestantes(dataReferencia, dataFimPlanejada);
  return Math.ceil(dias / DIAS_POR_SEMANA);
}
