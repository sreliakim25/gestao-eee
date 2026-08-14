/**
 * Conversão da resposta da API do Smartsheet para o formato do parser.
 *
 * O ponto crítico aqui é que a API e o .xlsx PRECISAM produzir a mesma
 * interpretação. Se divergirem, os dois caminhos de import contam histórias
 * diferentes sobre a mesma obra sem gerar erro nenhum.
 */

import { describe, expect, it } from 'vitest';
import {
  ErroSmartsheet,
  buscarPlanilha,
  converterParaLinhasBrutas,
  listarPlanilhas,
} from '@/scripts/import/smartsheet-api';
import { interpretarLinhas } from '@/scripts/import/parser';

/** Resposta mínima no formato real da API (verificado contra a planilha viva). */
function sheetFake() {
  const col = {
    nivel: 1,
    atividade: 2,
    pct: 3,
    duracao: 4,
    iniciar: 5,
    terminar: 6,
    critico: 7,
  };
  const linha = (
    id: number,
    rowNumber: number,
    parentId: number | null,
    nivel: number,
    nome: string,
    pct: number | null,
    dur: string,
  ) => ({
    id,
    rowNumber,
    ...(parentId ? { parentId } : {}),
    cells: [
      { columnId: col.nivel, value: nivel },
      { columnId: col.atividade, value: nome },
      ...(pct === null ? [] : [{ columnId: col.pct, value: pct, displayValue: `${pct * 100}%` }]),
      { columnId: col.duracao, value: dur },
      { columnId: col.iniciar, value: '2026-05-15T08:00:00' },
      { columnId: col.terminar, value: '2027-02-12T16:59:59' },
      { columnId: col.critico, value: false },
    ],
  });

  return {
    name: 'EEE - Novo Mundo',
    modifiedAt: '2026-08-07T18:40:35Z',
    totalRowCount: 5,
    columns: [
      { id: col.nivel, title: 'Nível de hierarquia' },
      { id: col.atividade, title: 'Atividade' },
      { id: col.pct, title: '% Concluída' },
      { id: col.duracao, title: 'Duração' },
      { id: col.iniciar, title: 'Iniciar' },
      { id: col.terminar, title: 'Terminar' },
      { id: col.critico, title: 'Está em Caminho Crítico?' },
    ],
    rows: [
      linha(1000, 1, null, 0, 'FORA DO ESCOPO', 0.5, '10d'),
      linha(2000, 2, null, 0, 'E.E.E. - NOVO MUNDO', 0.07, '177d'),
      linha(3000, 3, 2000, 1, 'TERRAPLENAGEM', 0.45, '55d'),
      linha(4000, 4, 3000, 2, 'Corte', 1, '5d'),
      linha(5000, 5, 3000, 2, 'Reaterro', null, '5d'),
    ],
  };
}

describe('converterParaLinhasBrutas', () => {
  it('usa o valor CRU, não o displayValue', () => {
    const { linhas } = converterParaLinhasBrutas(sheetFake());
    const raiz = linhas.find((l) => l.celulas.atividade === 'E.E.E. - NOVO MUNDO');
    // Cru = 0.07 (fração), igual ao .xlsx. displayValue seria "7%", que exigiria
    // um segundo conjunto de regras de parsing.
    expect(raiz?.celulas.percentualConcluida).toBe(0.07);
  });

  it('mapeia rowId e parentId por número de linha', () => {
    const { rowIdPorLinha, parentIdPorLinha } = converterParaLinhasBrutas(sheetFake());
    expect(rowIdPorLinha.get(4)).toBe('4000');
    expect(parentIdPorLinha.get(4)).toBe('3000');
    expect(parentIdPorLinha.get(2)).toBeNull();
  });

  it('devolve os rowIds como string, para não perder precisão', () => {
    // Os ids do Smartsheet passam de 2^53 (ex.: 795559381127044 e maiores);
    // tratá-los como number arriscaria arredondamento silencioso.
    const { rowIdPorLinha } = converterParaLinhasBrutas(sheetFake());
    for (const valor of rowIdPorLinha.values()) expect(typeof valor).toBe('string');
  });

  it('expõe os metadados da planilha para o log de sync', () => {
    const { planilha } = converterParaLinhasBrutas(sheetFake());
    expect(planilha.nome).toBe('EEE - Novo Mundo');
    expect(planilha.modificadaEm).toBe('2026-08-07T18:40:35Z');
  });

  it('falha alto quando o layout do cronograma muda', () => {
    const sheet = sheetFake();
    sheet.columns = sheet.columns.filter((c) => c.title !== 'Atividade');
    expect(() => converterParaLinhasBrutas(sheet)).toThrow(ErroSmartsheet);
    expect(() => converterParaLinhasBrutas(sheet)).toThrow(/colunas obrigatórias/i);
  });

  it('tolera acento e caixa diferentes no título da coluna', () => {
    const sheet = sheetFake();
    sheet.columns = sheet.columns.map((c) =>
      c.title === 'Nível de hierarquia' ? { ...c, title: 'NIVEL DE HIERARQUIA' } : c,
    );
    expect(() => converterParaLinhasBrutas(sheet)).not.toThrow();
  });
});

describe('integração com o parser do .xlsx', () => {
  it('as linhas convertidas passam pelo mesmo interpretarLinhas', () => {
    const { linhas } = converterParaLinhasBrutas(sheetFake());
    const resultado = interpretarLinhas(linhas, { nomeRaizEscopo: 'E.E.E. - NOVO MUNDO' });

    // Escopo: a linha "FORA DO ESCOPO" não entra.
    expect(resultado.linhasForaDeEscopo).toBe(1);
    expect(resultado.raiz.nome).toBe('E.E.E. - NOVO MUNDO');
    expect(resultado.raiz.percentualConcluido).toBe(7);
    expect(resultado.grupos).toHaveLength(1);
    expect(resultado.grupos[0].percentualConcluido).toBe(45);
    expect(resultado.atividades).toHaveLength(2);
    // "Reaterro" sem % vira 0 na atividade (a distinção null/zero vale para o
    // rollup dos grupos, não para a folha).
    expect(resultado.atividades.map((a) => a.nome).sort()).toEqual(['Corte', 'Reaterro']);
  });
});

describe('erros de rede e credencial', () => {
  const respostaFalsa = (status: number) =>
    ({ ok: false, status }) as unknown as Response;

  it('exige token com mensagem que diz onde consegui-lo', async () => {
    await expect(buscarPlanilha('', '123')).rejects.toThrow(/Personal Settings/i);
  });

  it('exige sheet id', async () => {
    await expect(buscarPlanilha('tok', '')).rejects.toThrow(/SMARTSHEET_SHEET_ID/);
  });

  it('traduz 401 sem repassar o corpo da resposta', async () => {
    const fetchFake = (async () => respostaFalsa(401)) as unknown as typeof fetch;
    await expect(buscarPlanilha('tok', '123', fetchFake)).rejects.toThrow(/inválido ou expirado/i);
  });

  it('traduz 404 citando o id procurado', async () => {
    const fetchFake = (async () => respostaFalsa(404)) as unknown as typeof fetch;
    await expect(buscarPlanilha('tok', '999', fetchFake)).rejects.toThrow(/999/);
  });

  it('traduz 429 como limite de requisições', async () => {
    const fetchFake = (async () => respostaFalsa(429)) as unknown as typeof fetch;
    await expect(buscarPlanilha('tok', '123', fetchFake)).rejects.toThrow(/Limite de requisições/i);
  });

  it('lista planilhas convertendo ids para string', async () => {
    const fetchFake = (async () =>
      ({
        ok: true,
        json: async () => ({ data: [{ id: 795559381127044, name: 'X', modifiedAt: 'agora' }] }),
      }) as unknown as Response) as unknown as typeof fetch;
    const planilhas = await listarPlanilhas('tok', fetchFake);
    expect(planilhas[0].id).toBe('795559381127044');
  });
});
