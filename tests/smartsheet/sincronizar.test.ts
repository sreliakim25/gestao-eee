// @vitest-environment node
//
// `lib/smartsheet/sincronizar.ts` recusa import fora do servidor checando
// `typeof window !== 'undefined'` — o padrão jsdom deste projeto (vitest.config.ts)
// definiria `window` e faria o import falhar. Este arquivo roda em ambiente
// `node` só para este teste (suportado nativamente pelo Vitest via este
// comentário), sem mudar o guard de produção nem o config global.

/**
 * Testes de `lib/smartsheet/sincronizar.ts` focados em multi-dispositivo:
 * `sincronizarTodosDispositivos` precisa isolar a falha de UMA planilha sem
 * abortar as demais (regra explícita da Fase 2 do plano multi-dispositivo).
 *
 * Estratégia: mocka a camada de I/O (`@/lib/supabase/admin` e
 * `@/scripts/import/smartsheet-api`) e as funções de escrita de
 * `@/scripts/import/upsert` que tocam banco de verdade — mantém as funções
 * PURAS desse módulo (`montarPayloadAtividades`, `montarPayloadGrupos`,
 * `detectarOrfas`) reais, para o teste continuar exercitando a montagem de
 * payload de verdade, não só a orquestração.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sincronizarTodosDispositivos } from '@/lib/smartsheet/sincronizar';

/** Respostas canônicas do cliente Supabase falso, ajustáveis por teste. */
let respostaPlanilhasAtivas: { data: unknown[] | null; error: { message: string } | null };
let respostaProjetos: { data: unknown[] | null; error: { message: string } | null };

/**
 * Cliente Supabase falso mínimo: só entende os dois caminhos que
 * `lib/smartsheet/sincronizar.ts` usa DIRETO no `SupabaseClient` (fora de
 * `scripts/import/upsert.ts`, que é mockado à parte): listar planilhas ativas,
 * listar projetos por id, e o update de `projetos` quando a planilha é a
 * principal.
 */
function criarClienteFalso() {
  function from(tabela: string) {
    let acao: 'select' | 'update' = 'select';
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      update: () => {
        acao = 'update';
        return chain;
      },
      then: (resolve: (valor: unknown) => void) => {
        if (tabela === 'projeto_planilhas_smartsheet') return resolve(respostaPlanilhasAtivas);
        if (tabela === 'projetos' && acao === 'update') return resolve({ data: null, error: null });
        if (tabela === 'projetos') return resolve(respostaProjetos);
        return resolve({ data: null, error: null });
      },
    };
    return chain;
  }
  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => criarClienteFalso(),
}));

vi.mock('@/scripts/import/smartsheet-api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/scripts/import/smartsheet-api')>();
  return {
    ...original,
    buscarPlanilha: vi.fn(async (_token: string, sheetId: string) => {
      if (sheetId === 'sheet-com-erro') {
        throw new original.ErroSmartsheet('Falha simulada: planilha inacessível.', 500);
      }
      return {
        linhas: [
          { linhaPlanilha: 2, celulas: { nivel: 1, atividade: 'FASE A', percentualConcluida: 0.5 } },
          { linhaPlanilha: 3, celulas: { nivel: 2, atividade: 'Atividade 1' } },
        ],
        rowIdPorLinha: new Map<number, string>(),
        parentIdPorLinha: new Map<number, string | null>(),
        planilha: { nome: `Planilha ${sheetId}`, modificadaEm: '2026-01-01T00:00:00Z', totalLinhas: 2 },
      };
    }),
  };
});

vi.mock('@/scripts/import/upsert', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/scripts/import/upsert')>();
  return {
    ...original,
    // Funções de ESCRITA/LEITURA de banco — mockadas para o teste não
    // depender de um Postgres de verdade.
    buscarGruposExistentes: vi.fn(async () => ({ idPorGrupo: new Map(), rotulos: new Map() })),
    upsertGrupos: vi.fn(async (_cliente: unknown, payload: { nome_smartsheet: string }[]) =>
      new Map(payload.map((g, i) => [g.nome_smartsheet, `grupo-${i}`])),
    ),
    atualizarPercentualDoProjeto: vi.fn(async () => {}),
    atualizarUltimoSincronizadoPlanilha: vi.fn(async () => {}),
    buscarElementosVisuais: vi.fn(async () => new Map()),
    buscarAtividadesExistentes: vi.fn(async () => []),
    upsertAtividades: vi.fn(async () => 0),
    registrarHistoricoCronograma: vi.fn(async () => {}),
    // montarPayloadAtividades, montarPayloadGrupos, detectarOrfas continuam
    // as implementações REAIS (puras) — a montagem de payload é exercitada
    // de verdade.
  };
});

describe('sincronizarTodosDispositivos — isolamento de falha entre dispositivos', () => {
  beforeEach(() => {
    process.env.SMARTSHEET_TOKEN = 'token-de-teste';
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SMARTSHEET_TOKEN;
  });

  it('uma planilha com falha não aborta as demais — cada item vem isolado no relatório', async () => {
    respostaPlanilhasAtivas = {
      data: [
        { projeto_id: 'projeto-a', sheet_id: 'sheet-ok-1', papel: 'principal' },
        { projeto_id: 'projeto-b', sheet_id: 'sheet-com-erro', papel: 'principal' },
        { projeto_id: 'projeto-c', sheet_id: 'sheet-ok-2', papel: 'principal' },
      ],
      error: null,
    };
    respostaProjetos = {
      data: [
        { id: 'projeto-a', nome: 'Dispositivo A' },
        { id: 'projeto-b', nome: 'Dispositivo B' },
        { id: 'projeto-c', nome: 'Dispositivo C' },
      ],
      error: null,
    };

    const relatorio = await sincronizarTodosDispositivos(new Date('2026-01-01T00:00:00Z'));

    expect(relatorio).toHaveLength(3);

    const porProjeto = new Map(relatorio.map((item) => [item.projetoId, item]));

    // A falha do dispositivo B (no meio da lista) não impede A nem C.
    expect(porProjeto.get('projeto-a')?.ok).toBe(true);
    expect(porProjeto.get('projeto-a')?.resultado?.atividades).toBeGreaterThan(0);
    expect(porProjeto.get('projeto-c')?.ok).toBe(true);
    expect(porProjeto.get('projeto-c')?.resultado?.atividades).toBeGreaterThan(0);

    expect(porProjeto.get('projeto-b')?.ok).toBe(false);
    expect(porProjeto.get('projeto-b')?.erro).toMatch(/Falha simulada/);
    expect(porProjeto.get('projeto-b')?.resultado).toBeUndefined();
  });

  it('preserva a ordem das planilhas no relatório, sucesso e falha misturados', async () => {
    respostaPlanilhasAtivas = {
      data: [
        { projeto_id: 'projeto-x', sheet_id: 'sheet-com-erro', papel: 'principal' },
        { projeto_id: 'projeto-y', sheet_id: 'sheet-ok', papel: 'principal' },
      ],
      error: null,
    };
    respostaProjetos = {
      data: [
        { id: 'projeto-x', nome: 'Dispositivo X' },
        { id: 'projeto-y', nome: 'Dispositivo Y' },
      ],
      error: null,
    };

    const relatorio = await sincronizarTodosDispositivos(new Date('2026-01-01T00:00:00Z'));

    expect(relatorio.map((item) => item.projetoId)).toEqual(['projeto-x', 'projeto-y']);
    expect(relatorio[0].ok).toBe(false);
    expect(relatorio[1].ok).toBe(true);
  });

  it('nenhuma planilha ativa devolve relatório vazio, sem erro', async () => {
    respostaPlanilhasAtivas = { data: [], error: null };
    respostaProjetos = { data: [], error: null };

    const relatorio = await sincronizarTodosDispositivos(new Date('2026-01-01T00:00:00Z'));
    expect(relatorio).toEqual([]);
  });
});
