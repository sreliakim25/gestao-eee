/**
 * Teste de regressão contra o .xlsx REAL — "Materiais/EEE - Novo Mundo.xlsx".
 *
 * POR QUE ESTE ARQUIVO EXISTE: a chave de upsert original era
 * `atividades UNIQUE (grupo_macro_id, nome)`. Com os dados reais, as 310
 * atividades do ramo colapsavam em 159 chaves — só em CIVIL, "Concretagem"
 * aparece 35x, "Formas" 27x e "Ferragem" 25x — e o import perdia 151 linhas em
 * silêncio. A correção (migration 20260805120900) moveu a identidade para
 * `caminho_wbs`. Os testes abaixo travam essa correção: se alguém voltar a
 * chavear por nome curto, ou mexer na montagem do caminho, aqui quebra.
 *
 * A fixture pequena (`cronograma-smartsheet.json`) cobre o comportamento; só o
 * arquivo real cobre a ESCALA, que foi exatamente o que passou despercebido.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import path from 'node:path';
import { existsSync } from 'node:fs';

import { parsearCronograma } from '@/scripts/import/parser';
import { chaveAtividade, montarPayloadAtividades } from '@/scripts/import/upsert';
import { montarResumo, NUMEROS_ESPERADOS } from '@/scripts/import/resumo';
import type { ResultadoParse } from '@/scripts/import/tipos';
import type { AtividadeInsert, TipoElementoVisual } from '@/types/database';

const CAMINHO_XLSX = path.resolve(process.cwd(), 'Materiais/EEE - Novo Mundo.xlsx');

/** Ids fictícios: o teste não toca no banco, só na montagem do payload. */
const idPorTipoElemento = new Map<TipoElementoVisual, string>([
  ['poco_umido', 'el-1'],
  ['camara_grades', 'el-2'],
  ['casa_comando', 'el-3'],
  ['muro_perimetral', 'el-4'],
  ['pavimentacao', 'el-5'],
  ['caixa_comporta', 'el-6'],
  ['caixa_valvulas', 'el-7'],
  ['caixa_tanque_hidropneumatico', 'el-8'],
  ['caixa_medidor_vazao', 'el-9'],
]);

describe('arquivo real do Smartsheet', () => {
  let resultado: ResultadoParse;
  let linhas: AtividadeInsert[];

  beforeAll(async () => {
    // Se o .xlsx sumir, o teste FALHA — não é para passar silenciosamente.
    expect(
      existsSync(CAMINHO_XLSX),
      `"${CAMINHO_XLSX}" não encontrado — é a fonte da verdade do cronograma.`,
    ).toBe(true);

    resultado = await parsearCronograma(CAMINHO_XLSX);
    const idPorGrupo = new Map(
      resultado.grupos.map((g, i) => [g.nomeSmartsheet, `grupo-${i + 1}`]),
    );
    linhas = montarPayloadAtividades(resultado.atividades, idPorGrupo, idPorTipoElemento).linhas;
  });

  it('recorta 7 grupos macro e 310 atividades do ramo em escopo', () => {
    expect(resultado.grupos).toHaveLength(7);
    expect(resultado.atividades).toHaveLength(310);
  });

  it('REGRESSÃO: o payload tem exatamente 310 chaves (grupo_macro_id, caminho_wbs) distintas', () => {
    expect(linhas).toHaveLength(310);
    const chaves = linhas.map((l) => chaveAtividade(l.grupo_macro_id, l.caminho_wbs));
    expect(new Set(chaves).size).toBe(310);
  });

  it('REGRESSÃO: os nomes curtos SE REPETEM e isso não pode mais colidir', () => {
    const chavesPeloNomeCurto = new Set(
      linhas.map((l) => chaveAtividade(l.grupo_macro_id, l.nome)),
    );
    // Prova numérica do bug antigo: chavear por nome curto perde 151 linhas.
    expect(chavesPeloNomeCurto.size).toBe(159);
    expect(310 - chavesPeloNomeCurto.size).toBe(151);

    const civil = linhas.filter((l) => l.grupo_macro_id === 'grupo-5');
    const contar = (nome: string) => civil.filter((l) => l.nome === nome).length;
    expect(contar('Concretagem')).toBe(35);
    expect(contar('Formas')).toBe(27);
    expect(contar('Ferragem')).toBe(25);
  });

  it('nenhum `nome` carrega o caminho completo (isso é papel do caminho_wbs)', () => {
    expect(linhas.every((l) => !l.nome.includes(' > '))).toBe(true);
    const comCaminho = linhas.filter((l) => l.caminho_wbs.includes(' > '));
    expect(comCaminho.length).toBeGreaterThan(200);
    // O último segmento do caminho é sempre o nome curto.
    expect(linhas.every((l) => l.caminho_wbs.split(' > ').at(-1) === l.nome)).toBe(true);
  });

  it('os 7 grupos casam pela string exata do .xlsx (nome_smartsheet)', () => {
    expect(resultado.grupos.map((g) => g.nomeSmartsheet)).toEqual([
      'SERVIÇOS PRELIMINARES',
      'DRAGAGEM E POSSÍVEL REBAIXAMENTO DE COTA DA LÂMINA DO CANAL',
      'DRENAGEM - Canal e muro',
      'TERRAPLENAGEM',
      'CIVIL',
      'ELÉTRICA',
      'OUTROS',
    ]);
  });

  it('o parser não acusa colisão de chave no arquivo real', () => {
    expect(resultado.avisos.join('\n')).not.toMatch(/COLISÃO DE CHAVE/);
  });

  it('bate com os números conhecidos da obra (snapshot 05/08/2026)', () => {
    const resumo = montarResumo(resultado);
    expect(resumo.divergencias).toEqual([]);
    expect(resumo.totalLinhasNoRamo).toBe(NUMEROS_ESPERADOS.linhasNoRamo);
    expect(resumo.atividadesCriticas).toBe(34);
    expect(resumo.dataMinimaInicio).toBe('2026-05-15');
    expect(resumo.dataMaximaFim).toBe('2027-01-26');
    expect(resumo.percentualRaizSmartsheet).toBe(6);
    expect(resumo.linhasForaDeEscopo).toBe(32);
  });

  it('mantém a taxa de vínculo com elemento visual em 248/310', () => {
    expect(linhas.filter((l) => l.elemento_visual_id !== null)).toHaveLength(248);
  });

  it('IDEMPOTÊNCIA: reparsear o arquivo real gera payload idêntico', async () => {
    const outro = await parsearCronograma(CAMINHO_XLSX);
    const idPorGrupo = new Map(outro.grupos.map((g, i) => [g.nomeSmartsheet, `grupo-${i + 1}`]));
    const outrasLinhas = montarPayloadAtividades(
      outro.atividades,
      idPorGrupo,
      idPorTipoElemento,
    ).linhas;
    expect(JSON.stringify(outrasLinhas)).toBe(JSON.stringify(linhas));
  });
});
