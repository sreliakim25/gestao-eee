/**
 * Testes da montagem de payload e da detecção de órfãs do import.
 *
 * Aqui não se toca no Supabase: só as funções puras, que são exatamente onde
 * mora a garantia de "rodar duas vezes não duplica nada".
 *
 * Chaves exercitadas (migration 20260805120900):
 *   grupos_macro  UNIQUE (projeto_id, nome_smartsheet)
 *   atividades    UNIQUE (grupo_macro_id, caminho_wbs)
 */

import { describe, expect, it } from 'vitest';

import fixture from '../fixtures/cronograma-smartsheet.json';
import { interpretarLinhas } from '@/scripts/import/parser';
import {
  chaveAtividade,
  detectarOrfas,
  montarPayloadAtividades,
  montarPayloadGrupos,
  type AtividadeOrfa,
} from '@/scripts/import/upsert';
import type { LinhaBruta } from '@/scripts/import/tipos';
import type { TipoElementoVisual } from '@/types/database';

const resultado = interpretarLinhas(fixture as unknown as LinhaBruta[]);

const PROJETO_ID = '00000000-0000-4000-8000-000000000001';

/** Ids fictícios estáveis, como se viessem do upsert de grupos_macro. */
const idPorGrupo = new Map<string, string>([
  ['SERVIÇOS PRELIMINARES', 'grupo-servicos-preliminares'],
  ['CIVIL', 'grupo-civil'],
  ['ELÉTRICA', 'grupo-eletrica'],
]);

const idPorTipoElemento = new Map<TipoElementoVisual, string>([
  ['poco_umido', 'el-poco-umido'],
  ['caixa_comporta', 'el-caixa-comporta'],
  ['muro_perimetral', 'el-muro-perimetral'],
]);

describe('payload de grupos_macro', () => {
  it('chaveia por nome_smartsheet (a string crua do .xlsx)', () => {
    const payload = montarPayloadGrupos(resultado.grupos, PROJETO_ID);
    expect(payload.map((g) => g.nome_smartsheet)).toEqual([
      'SERVIÇOS PRELIMINARES',
      'CIVIL',
      'ELÉTRICA',
    ]);
    expect(payload.every((g) => g.projeto_id === PROJETO_ID)).toBe(true);
  });

  it('PRESERVA o rótulo legível já gravado no banco em vez de sobrescrevê-lo', () => {
    // Sem isso, cada import trocaria "Drenagem — Canal e muro" por
    // "DRENAGEM - Canal e muro" na UI, porque o upsert atualiza o que recebe.
    const rotulos = new Map([
      ['SERVIÇOS PRELIMINARES', 'Serviços Preliminares'],
      ['CIVIL', 'Civil'],
      ['ELÉTRICA', 'Elétrica'],
    ]);
    const payload = montarPayloadGrupos(resultado.grupos, PROJETO_ID, rotulos);
    expect(payload.map((g) => g.nome)).toEqual(['Serviços Preliminares', 'Civil', 'Elétrica']);
  });

  it('usa a string do .xlsx como nome só quando o grupo ainda não existe', () => {
    const payload = montarPayloadGrupos(resultado.grupos, PROJETO_ID, new Map());
    expect(payload.map((g) => g.nome)).toEqual(['SERVIÇOS PRELIMINARES', 'CIVIL', 'ELÉTRICA']);
  });

  it('é determinístico (mesma entrada → mesmo payload)', () => {
    expect(montarPayloadGrupos(resultado.grupos, PROJETO_ID)).toEqual(
      montarPayloadGrupos(resultado.grupos, PROJETO_ID),
    );
  });
});

describe('payload de atividades', () => {
  const { linhas, descartadasPorColisao, semGrupo } = montarPayloadAtividades(
    resultado.atividades,
    idPorGrupo,
    idPorTipoElemento,
  );

  it('gera uma linha por atividade do ramo, sem colisão nem sobra', () => {
    expect(linhas).toHaveLength(13);
    expect(descartadasPorColisao).toHaveLength(0);
    expect(semGrupo).toHaveLength(0);
  });

  it('produz chaves (grupo_macro_id, caminho_wbs) únicas — a constraint do banco', () => {
    const chaves = linhas.map((l) => chaveAtividade(l.grupo_macro_id, l.caminho_wbs));
    expect(new Set(chaves).size).toBe(linhas.length);
  });

  it('grava nome curto em `nome` e o caminho completo em `caminho_wbs`', () => {
    const concretagemFosso = linhas.find((l) => l.caminho_wbs.endsWith('Fosso de sucção > Laje de fundo > Concretagem'))!;
    expect(concretagemFosso.nome).toBe('Concretagem');
    expect(concretagemFosso.caminho_wbs).toBe(
      'Elevatória de esgoto bruto > Fosso de sucção > Laje de fundo > Concretagem',
    );
    // O nome curto NÃO carrega o caminho — é o que a UI exibe.
    expect(linhas.every((l) => !l.nome.includes(' > '))).toBe(true);
  });

  it('mapeia os campos do Smartsheet para as colunas do banco', () => {
    const concretagemFosso = linhas.find((l) => l.caminho_wbs.endsWith('Fosso de sucção > Laje de fundo > Concretagem'))!;
    expect(concretagemFosso).toMatchObject({
      grupo_macro_id: 'grupo-civil',
      wbs_nivel: 5,
      percentual_concluido: 0,
      caminho_critico: true, // linha 17 da fixture está no caminho crítico
      elemento_visual_id: 'el-poco-umido',
    });
    const marcacao = linhas.find((l) => l.nome === 'Marcação de obra')!;
    expect(marcacao).toMatchObject({
      grupo_macro_id: 'grupo-servicos-preliminares',
      percentual_concluido: 100,
      data_inicio_planejada: '2026-05-15',
      predecessores: '56',
      elemento_visual_id: null,
    });
  });

  it('deixa elemento_visual_id null quando o elemento não existe no banco', () => {
    const { linhas: semElementos } = montarPayloadAtividades(
      resultado.atividades,
      idPorGrupo,
      new Map(),
    );
    expect(semElementos.every((l) => l.elemento_visual_id === null)).toBe(true);
  });

  it('IDEMPOTÊNCIA: duas montagens seguidas produzem exatamente o mesmo payload', () => {
    const primeira = montarPayloadAtividades(resultado.atividades, idPorGrupo, idPorTipoElemento);
    const segunda = montarPayloadAtividades(resultado.atividades, idPorGrupo, idPorTipoElemento);
    expect(JSON.stringify(segunda.linhas)).toBe(JSON.stringify(primeira.linhas));
    // Nenhum campo volátil (id, criado_em, atualizado_em) entra no payload.
    for (const chave of ['id', 'criado_em', 'atualizado_em']) {
      expect(primeira.linhas.some((l) => chave in l)).toBe(false);
    }
  });

  it('IDEMPOTÊNCIA: reparsear o mesmo arquivo gera o mesmo payload', () => {
    const outroParse = interpretarLinhas(fixture as unknown as LinhaBruta[]);
    const outro = montarPayloadAtividades(outroParse.atividades, idPorGrupo, idPorTipoElemento);
    expect(JSON.stringify(outro.linhas)).toBe(JSON.stringify(linhas));
  });

  it('descarta a segunda ocorrência de uma chave repetida em vez de estourar no Postgres', () => {
    const duplicadas = [...resultado.atividades, resultado.atividades[0]];
    const { linhas: comDuplicata, descartadasPorColisao: descartadas } = montarPayloadAtividades(
      duplicadas,
      idPorGrupo,
      idPorTipoElemento,
    );
    expect(comDuplicata).toHaveLength(13);
    expect(descartadas).toHaveLength(1);
  });

  it('separa as atividades cujo grupo macro não existe no banco', () => {
    const { linhas: parciais, semGrupo: sobraram } = montarPayloadAtividades(
      resultado.atividades,
      new Map([['CIVIL', 'grupo-civil']]),
      idPorTipoElemento,
    );
    expect(parciais.every((l) => l.grupo_macro_id === 'grupo-civil')).toBe(true);
    expect(sobraram.length).toBe(13 - parciais.length);
    expect(sobraram.length).toBeGreaterThan(0);
  });
});

describe('detecção de atividades órfãs', () => {
  const { linhas } = montarPayloadAtividades(resultado.atividades, idPorGrupo, idPorTipoElemento);

  const existentesIdenticas: AtividadeOrfa[] = linhas.map((l, i) => ({
    id: `atividade-${i}`,
    nome: l.nome,
    caminhoWbs: l.caminho_wbs,
    grupoMacroId: l.grupo_macro_id,
    grupoMacroNome: 'irrelevante para a chave',
    percentualConcluido: l.percentual_concluido ?? 0,
  }));

  it('não acusa órfã quando o banco está alinhado com o .xlsx (2ª rodada do import)', () => {
    expect(detectarOrfas(existentesIdenticas, linhas)).toHaveLength(0);
  });

  it('acusa a atividade que sumiu do .xlsx (provável renomeação no Smartsheet)', () => {
    const renomeadaNoBanco: AtividadeOrfa[] = [
      ...existentesIdenticas,
      {
        id: 'atividade-antiga',
        nome: 'Concretagem da laje',
        caminhoWbs:
          'Elevatória de esgoto bruto > Fosso de sucção > Laje de fundo > Concretagem da laje',
        grupoMacroId: 'grupo-civil',
        grupoMacroNome: 'Civil',
        percentualConcluido: 30,
      },
    ];
    const orfas = detectarOrfas(renomeadaNoBanco, linhas);
    expect(orfas).toHaveLength(1);
    expect(orfas[0].id).toBe('atividade-antiga');
    expect(orfas[0].percentualConcluido).toBe(30);
  });

  it('renomear um ANCESTRAL torna órfãos todos os descendentes de uma vez', () => {
    // No banco, o ramo inteiro ainda está sob o nome antigo do nível 2.
    const nomeAntigoDoAncestral: AtividadeOrfa[] = linhas
      .filter((l) => l.caminho_wbs.startsWith('Elevatória de esgoto bruto'))
      .map((l, i) => ({
        id: `antiga-${i}`,
        nome: l.nome,
        caminhoWbs: l.caminho_wbs.replace('Elevatória de esgoto bruto', 'Elevatória EEB'),
        grupoMacroId: l.grupo_macro_id,
        grupoMacroNome: 'Civil',
        percentualConcluido: 0,
      }));
    expect(nomeAntigoDoAncestral.length).toBeGreaterThan(1);
    // Todas viram órfãs — comportamento esperado e documentado, não um bug.
    expect(detectarOrfas(nomeAntigoDoAncestral, linhas)).toHaveLength(
      nomeAntigoDoAncestral.length,
    );
  });

  it('não confunde caminhos iguais em grupos macro diferentes', () => {
    const emOutroGrupo: AtividadeOrfa[] = [
      {
        id: 'atividade-eletrica',
        nome: linhas[0].nome,
        caminhoWbs: linhas[0].caminho_wbs,
        grupoMacroId: 'grupo-eletrica',
        grupoMacroNome: 'Elétrica',
        percentualConcluido: 0,
      },
    ];
    // Mesmo caminho, outro grupo: a chave é composta, então é órfã.
    expect(detectarOrfas(emOutroGrupo, linhas)).toHaveLength(1);
  });

  it('banco vazio não gera órfã nenhuma', () => {
    expect(detectarOrfas([], linhas)).toHaveLength(0);
  });
});
