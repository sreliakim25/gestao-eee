/**
 * Testes de tests/calculos/datas.ts — utilidades de data do motor.
 * Foco: UTC puro, semana ISO começando na segunda e semanas restantes.
 */

import { describe, expect, it } from 'vitest';
import {
  adicionarDias,
  chaveSemana,
  diasRestantes,
  diferencaEmDias,
  domingoDaSemana,
  formatarDataISO,
  listarSemanas,
  paraDataUTC,
  segundaFeiraDaSemana,
  semanasRestantes,
} from '@/lib/calculos';
import { DATA_FIM_PROJETO, DATA_REFERENCIA } from './fixtures';

describe('paraDataUTC', () => {
  it('interpreta "YYYY-MM-DD" em UTC, sem deslocar pelo fuso local', () => {
    const data = paraDataUTC('2026-08-05');
    expect(data).not.toBeNull();
    expect(data!.getUTCFullYear()).toBe(2026);
    expect(data!.getUTCMonth()).toBe(7);
    expect(data!.getUTCDate()).toBe(5);
    expect(data!.getUTCHours()).toBe(0);
  });

  it('ignora horário e offset de timestamps', () => {
    expect(formatarDataISO(paraDataUTC('2026-08-05T23:45:00-03:00')!)).toBe('2026-08-05');
  });

  it('normaliza um Date para meia-noite UTC', () => {
    const original = new Date(Date.UTC(2026, 7, 5, 18, 30));
    expect(formatarDataISO(paraDataUTC(original)!)).toBe('2026-08-05');
  });

  it('devolve null para entradas inválidas em vez de lançar', () => {
    expect(paraDataUTC(null)).toBeNull();
    expect(paraDataUTC(undefined)).toBeNull();
    expect(paraDataUTC('')).toBeNull();
    expect(paraDataUTC('não é data')).toBeNull();
    expect(paraDataUTC('2026-02-31')).toBeNull(); // data estourada
    expect(paraDataUTC('2026-13-01')).toBeNull();
    expect(paraDataUTC(new Date('inválido'))).toBeNull();
  });
});

describe('aritmética de dias', () => {
  it('conta a diferença em dias inteiros', () => {
    expect(diferencaEmDias(paraDataUTC('2026-08-05')!, paraDataUTC('2027-01-26')!)).toBe(174);
    expect(diferencaEmDias(paraDataUTC('2027-01-26')!, paraDataUTC('2026-08-05')!)).toBe(-174);
  });

  it('soma e subtrai dias', () => {
    expect(formatarDataISO(adicionarDias(paraDataUTC('2026-12-31')!, 1))).toBe('2027-01-01');
    expect(formatarDataISO(adicionarDias(paraDataUTC('2026-03-01')!, -1))).toBe('2026-02-28');
  });
});

describe('semana ISO (segunda-feira)', () => {
  it('resolve a segunda-feira da semana para todos os dias da semana', () => {
    // 2026-08-05 é uma quarta-feira; a semana começa em 03/08 e fecha em 09/08.
    expect(chaveSemana('2026-08-05')).toBe('2026-08-03');
    expect(chaveSemana('2026-08-03')).toBe('2026-08-03'); // segunda
    expect(chaveSemana('2026-08-09')).toBe('2026-08-03'); // domingo
    expect(chaveSemana('2026-08-10')).toBe('2026-08-10'); // segunda seguinte
  });

  it('fecha a semana no domingo', () => {
    const segunda = segundaFeiraDaSemana(paraDataUTC('2026-08-05')!);
    expect(formatarDataISO(domingoDaSemana(segunda))).toBe('2026-08-09');
  });

  it('lista todas as segundas do intervalo, inclusive as das pontas', () => {
    const semanas = listarSemanas(paraDataUTC('2026-08-05')!, paraDataUTC('2026-08-24')!).map(
      formatarDataISO,
    );
    expect(semanas).toEqual(['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24']);
  });

  it('devolve lista vazia quando o fim é anterior ao início', () => {
    expect(listarSemanas(paraDataUTC('2026-08-24')!, paraDataUTC('2026-08-05')!)).toEqual([]);
  });
});

describe('semanasRestantes', () => {
  it('REGRESSÃO: 05/08/2026 → 26/01/2027 = 174 dias = 25 semanas', () => {
    expect(diasRestantes(DATA_REFERENCIA, DATA_FIM_PROJETO)).toBe(174);
    expect(semanasRestantes(DATA_REFERENCIA, DATA_FIM_PROJETO)).toBe(25);
  });

  it('arredonda para cima: semana começada é semana a trabalhar', () => {
    expect(semanasRestantes('2026-08-05', '2026-08-12')).toBe(1); // 7 dias exatos
    expect(semanasRestantes('2026-08-05', '2026-08-13')).toBe(2); // 8 dias
  });

  it('devolve 0 para prazo vencido, mesmo dia ou datas ausentes', () => {
    expect(semanasRestantes('2027-02-01', '2027-01-26')).toBe(0);
    expect(semanasRestantes('2027-01-26', '2027-01-26')).toBe(0);
    expect(semanasRestantes('2026-08-05', null)).toBe(0);
    expect(semanasRestantes('2026-08-05', 'data inválida')).toBe(0);
  });
});
