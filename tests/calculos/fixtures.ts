/**
 * tests/calculos/fixtures.ts — FIXTURES SINTÉTICAS de teste.
 *
 * ATENÇÃO: nada aqui é o cronograma real do Smartsheet. São atividades
 * inventadas, calibradas para REPRODUZIR OS AGREGADOS REAIS conhecidos do plano
 * (`docs/PLANO_EXECUCAO_APP_GESTAO_EEE.md`, seção 1, snapshot de 05/08/2026):
 *
 *   - 317 atividades no ramo "E.E.E. - NOVO MUNDO"
 *   - 34 delas no caminho crítico
 *   - % de evolução física geral = 6%
 *   - Serviços Preliminares = 100%
 *   - Terraplenagem = 46%
 *   - início 15/05/2026, fim planejado 26/01/2027 (~25 semanas em 05/08/2026)
 *
 * Se uma mudança de fórmula fizer esses números mudarem, os testes quebram —
 * que é exatamente o objetivo (o motor é consumido por Painel, Cronograma,
 * Curva S e Gestão Visual, e uma fórmula errada não gera erro de compilação).
 */

import type { AtividadeCalculo, AvancoSemanalCalculo } from '@/lib/calculos';

/** Data de referência do snapshot documentado no plano. */
export const DATA_REFERENCIA = '2026-08-05';

/** Datas do projeto (tabela `projetos`). */
export const DATA_INICIO_PROJETO = '2026-05-15';
export const DATA_FIM_PROJETO = '2027-01-26';

/** Ids sintéticos dos grupos macro (nível 1 do WBS). */
export const GRUPOS = {
  preliminares: 'grupo-servicos-preliminares',
  dragagem: 'grupo-dragagem',
  drenagem: 'grupo-drenagem',
  terraplenagem: 'grupo-terraplenagem',
  civil: 'grupo-civil',
  eletrica: 'grupo-eletrica',
  outros: 'grupo-outros',
} as const;

/** Ids sintéticos dos elementos visuais usados pela Gestão Visual. */
export const ELEMENTOS = {
  pocoUmido: 'elem-poco-umido',
  camaraGrades: 'elem-camara-grades',
  casaComando: 'elem-casa-comando',
  muroPerimetral: 'elem-muro-perimetral',
} as const;

/** Cria uma atividade completa a partir de um parcial (o resto é default). */
export function criarAtividade(
  parcial: Partial<AtividadeCalculo> & { id: string },
): AtividadeCalculo {
  return {
    grupo_macro_id: GRUPOS.civil,
    elemento_visual_id: null,
    duracao_dias: 1,
    data_inicio_planejada: null,
    data_fim_planejada: null,
    percentual_concluido: 0,
    caminho_critico: false,
    ...parcial,
  };
}

/** Gera `quantidade` atividades iguais, com sufixo numérico no id. */
function repetir(
  prefixo: string,
  quantidade: number,
  molde: Omit<Partial<AtividadeCalculo>, 'id'>,
): AtividadeCalculo[] {
  return Array.from({ length: quantidade }, (_, indice) =>
    criarAtividade({ ...molde, id: `${prefixo}-${indice + 1}` }),
  );
}

/**
 * Carteira sintética de 317 atividades que reproduz o snapshot de 05/08/2026.
 *
 * Memória de cálculo da ponderação por duração (peso = duracao_dias):
 *
 *   Serviços Preliminares  12 ativ. × 2 dias  = peso  24 · 100% → contrib. 2.400
 *   Terraplenagem          25 ativ. × 12 dias = peso 300 ·  46% → contrib. 13.800
 *      (11 atividades a 100%, 1 a 50%, 13 a 0%)
 *   Demais grupos (0%)                          peso 2.376 → contrib. 0
 *   ------------------------------------------------------------------------
 *   peso total 2.700 · contribuição 16.200 → 16.200 / 2.700 = 6,00%
 *
 * O peso 2.376 dos grupos a 0% é distribuído em durações plausíveis; a última
 * atividade de "Outros" tem duração 7 apenas para fechar a conta exata dos 6%.
 */
export function criarCarteiraEEE(): AtividadeCalculo[] {
  const atividades: AtividadeCalculo[] = [];

  // --- Serviços Preliminares: 12 atividades, todas 100% -----------------------
  atividades.push(
    ...repetir('prel', 12, {
      grupo_macro_id: GRUPOS.preliminares,
      duracao_dias: 2,
      data_inicio_planejada: '2026-05-15',
      data_fim_planejada: '2026-05-16',
      percentual_concluido: 100,
    }),
  );

  // --- Dragagem: 15 atividades × 6 dias (peso 90), 0% -------------------------
  atividades.push(
    ...repetir('drag', 15, {
      grupo_macro_id: GRUPOS.dragagem,
      duracao_dias: 6,
      data_inicio_planejada: '2026-05-18',
      data_fim_planejada: '2026-05-23',
    }),
  );

  // --- Drenagem: 10 atividades × 8 dias (peso 80), 0% -------------------------
  atividades.push(
    ...repetir('dren', 10, {
      grupo_macro_id: GRUPOS.drenagem,
      duracao_dias: 8,
      data_inicio_planejada: '2026-05-25',
      data_fim_planejada: '2026-06-01',
    }),
  );

  // --- Terraplenagem: 25 atividades × 12 dias (peso 300), média 46% -----------
  const terraplenagem: AtividadeCalculo[] = [
    ...repetir('terr-ok', 11, {
      grupo_macro_id: GRUPOS.terraplenagem,
      duracao_dias: 12,
      data_inicio_planejada: '2026-06-01',
      data_fim_planejada: '2026-06-12',
      percentual_concluido: 100,
    }),
    criarAtividade({
      id: 'terr-parcial-1',
      grupo_macro_id: GRUPOS.terraplenagem,
      duracao_dias: 12,
      data_inicio_planejada: '2026-06-01',
      data_fim_planejada: '2026-06-12',
      percentual_concluido: 50,
    }),
    ...repetir('terr-zero', 13, {
      grupo_macro_id: GRUPOS.terraplenagem,
      duracao_dias: 12,
      data_inicio_planejada: '2026-06-01',
      data_fim_planejada: '2026-06-12',
    }),
  ];
  atividades.push(...terraplenagem);

  // --- Civil: 180 atividades × 10 dias (peso 1.800), 0%, ligadas ao SVG -------
  const elementosCivis = [
    ELEMENTOS.pocoUmido,
    ELEMENTOS.camaraGrades,
    ELEMENTOS.casaComando,
    ELEMENTOS.muroPerimetral,
  ];
  atividades.push(
    ...repetir('civ', 180, {
      grupo_macro_id: GRUPOS.civil,
      duracao_dias: 10,
      data_inicio_planejada: '2026-09-01',
      data_fim_planejada: '2026-09-10',
    }).map((atividade, indice) => ({
      ...atividade,
      elemento_visual_id: elementosCivis[indice % elementosCivis.length],
    })),
  );

  // --- Elétrica: 45 atividades × 5 dias (peso 225), 0% ------------------------
  atividades.push(
    ...repetir('elet', 45, {
      grupo_macro_id: GRUPOS.eletrica,
      duracao_dias: 5,
      data_inicio_planejada: '2026-10-01',
      data_fim_planejada: '2026-10-05',
    }),
  );

  // --- Outros: 30 atividades (29 × 6 dias + 1 × 7 dias de fechamento), 0% -----
  atividades.push(
    ...repetir('outr', 29, {
      grupo_macro_id: GRUPOS.outros,
      duracao_dias: 6,
      data_inicio_planejada: '2026-11-02',
      data_fim_planejada: '2026-11-07',
    }),
    criarAtividade({
      id: 'outr-fechamento',
      grupo_macro_id: GRUPOS.outros,
      duracao_dias: 7,
      data_inicio_planejada: '2026-11-02',
      data_fim_planejada: '2026-11-08',
    }),
  );

  // --- Caminho crítico: exatamente 34 atividades ------------------------------
  // (4 de Terraplenagem + 25 de Civil + 5 de Elétrica = 34)
  const criticas = new Set<string>([
    ...Array.from({ length: 4 }, (_, i) => `terr-ok-${i + 1}`),
    ...Array.from({ length: 25 }, (_, i) => `civ-${i + 1}`),
    ...Array.from({ length: 5 }, (_, i) => `elet-${i + 1}`),
  ]);

  return atividades.map((atividade) =>
    criticas.has(atividade.id) ? { ...atividade, caminho_critico: true } : atividade,
  );
}

/** Cria um lançamento semanal (a semana precisa ser uma segunda-feira). */
export function criarAvanco(
  parcial: Partial<AvancoSemanalCalculo> & {
    atividade_id: string;
    semana_referencia: string;
  },
): AvancoSemanalCalculo {
  return {
    percentual_planejado_acumulado: 0,
    percentual_realizado_acumulado: 0,
    ...parcial,
  };
}
