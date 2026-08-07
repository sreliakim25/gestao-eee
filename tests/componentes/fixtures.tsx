/**
 * Fixtures dos testes de componente.
 *
 * Carteira MÍNIMA e sintética (não é o cronograma real): quatro atividades que
 * cobrem as combinações de filtro que interessam — crítica x semana atual x
 * frente x sem datas. Os números reais da obra são exercitados nos testes de
 * `lib/calculos`.
 */

import type { Atividade } from '@/types/database';

export const GRUPO_TERRAPLENAGEM = 'grupo-terraplenagem';
export const GRUPO_CIVIL = 'grupo-civil';
export const ELEMENTO_POCO = 'elemento-poco-umido';

/** Quarta-feira; a semana ISO correspondente começa em 03/08/2026. */
export const DATA_REFERENCIA = '2026-08-05';
export const SEGUNDA_DA_SEMANA = '2026-08-03';

function atividadeBase(parcial: Partial<Atividade> & Pick<Atividade, 'id' | 'nome'>): Atividade {
  return {
    grupo_macro_id: GRUPO_TERRAPLENAGEM,
    elemento_visual_id: null,
    wbs_nivel: 2,
    predecessores: null,
    duracao_dias: 5,
    data_inicio_planejada: null,
    data_fim_planejada: null,
    percentual_concluido: 0,
    caminho_critico: false,
    folga_dias: null,
    recurso: null,
    criado_em: '2026-05-15T00:00:00Z',
    atualizado_em: '2026-05-15T00:00:00Z',
    ...parcial,
  } as Atividade;
}

export const ATIVIDADE_CRITICA_NA_SEMANA = atividadeBase({
  id: 'a1',
  nome: 'Escavação do poço úmido',
  grupo_macro_id: GRUPO_TERRAPLENAGEM,
  elemento_visual_id: ELEMENTO_POCO,
  caminho_critico: true,
  data_inicio_planejada: '2026-08-03',
  data_fim_planejada: '2026-08-07',
  percentual_concluido: 40,
});

export const ATIVIDADE_NAO_CRITICA_NA_SEMANA = atividadeBase({
  id: 'a2',
  nome: 'Marcação de obra',
  grupo_macro_id: GRUPO_TERRAPLENAGEM,
  caminho_critico: false,
  data_inicio_planejada: '2026-08-05',
  data_fim_planejada: '2026-08-05',
  duracao_dias: 1,
  percentual_concluido: 100,
});

export const ATIVIDADE_CIVIL_FORA_DA_SEMANA = atividadeBase({
  id: 'a3',
  nome: 'Muro perimetral em blocos',
  grupo_macro_id: GRUPO_CIVIL,
  caminho_critico: false,
  data_inicio_planejada: '2026-09-01',
  data_fim_planejada: '2026-09-10',
  duracao_dias: 10,
});

export const ATIVIDADE_CIVIL_SEM_DATAS = atividadeBase({
  id: 'a4',
  nome: 'Braço giratório do poço',
  grupo_macro_id: GRUPO_CIVIL,
  caminho_critico: true,
  duracao_dias: null,
});

export const ATIVIDADES: Atividade[] = [
  ATIVIDADE_CRITICA_NA_SEMANA,
  ATIVIDADE_NAO_CRITICA_NA_SEMANA,
  ATIVIDADE_CIVIL_FORA_DA_SEMANA,
  ATIVIDADE_CIVIL_SEM_DATAS,
];

export const GRUPOS = [
  { id: GRUPO_TERRAPLENAGEM, nome: 'Terraplenagem' },
  { id: GRUPO_CIVIL, nome: 'Civil' },
];

export const ELEMENTOS = [{ id: ELEMENTO_POCO, nome: 'Poço úmido' }];
