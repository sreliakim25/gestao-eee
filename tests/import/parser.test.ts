/**
 * Testes do parser do export .xlsx do Smartsheet.
 *
 * Fixture: `tests/fixtures/cronograma-smartsheet.json` — recorte anonimizado da
 * estrutura real de "Materiais/EEE - Novo Mundo.xlsx": um trecho do
 * macro-cronograma corporativo (fora de escopo), o ramo "E.E.E. - NOVO MUNDO"
 * com 3 grupos macro e 13 atividades, uma linha em branco e outro ramo de
 * nível 0 depois, para provar que o recorte do ramo termina no lugar certo.
 */

import { describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';

import fixture from '../fixtures/cronograma-smartsheet.json';
import {
  interpretarLinhas,
  lerLinhasBrutas,
  paraBooleano,
  paraDataIso,
  paraDuracaoDias,
  paraPercentual,
  SEPARADOR_CAMINHO_WBS,
} from '@/scripts/import/parser';
import { inferirElementoVisual } from '@/scripts/import/mapeamento-elementos';
import { montarResumo } from '@/scripts/import/resumo';
import type { LinhaBruta } from '@/scripts/import/tipos';

const linhas = fixture as unknown as LinhaBruta[];
const resultado = interpretarLinhas(linhas);

describe('filtro de escopo — só o ramo "E.E.E. - NOVO MUNDO"', () => {
  it('descarta o macro-cronograma corporativo e os ramos vizinhos', () => {
    const nomes = resultado.atividades.map((a) => a.nome);
    expect(nomes).not.toContain('Previsão para entrega do projeto civil'); // Engenharia de Produto
    expect(nomes).not.toContain('Compras'); // Suprimentos EC
    expect(nomes).not.toContain('Compra do aço'); // Suprimentos EC
    expect(nomes).not.toContain('Etapa qualquer de outro ramo'); // ramo depois do escopo
  });

  it('conta as linhas descartadas por estarem fora de escopo', () => {
    expect(resultado.linhasForaDeEscopo).toBe(8);
    expect(resultado.linhasVaziasIgnoradas).toBe(1);
  });

  it('encerra o ramo na próxima linha de nível menor ou igual ao da raiz', () => {
    // O último item do ramo é da ELÉTRICA; nada de "OUTRO RAMO CORPORATIVO".
    expect(resultado.atividades.at(-1)?.nome).toBe(
      'Instalação de medidor de vazão do macromedidor',
    );
  });

  it('aborta quando o ramo em escopo não existe na planilha', () => {
    const semRamo = linhas.filter(
      (l) => String(l.celulas.atividade ?? '').indexOf('E.E.E.') === -1,
    );
    expect(() => interpretarLinhas(semRamo)).toThrow(/não encontrado/i);
  });

  it('ignora a linha crítica que está fora de escopo na contagem de críticas', () => {
    // "Compra do aço" é crítica, mas é de Suprimentos EC.
    expect(resultado.atividades.filter((a) => a.caminhoCritico)).toHaveLength(2);
  });
});

describe('reconstrução da hierarquia pelo "Nível de hierarquia"', () => {
  it('promove os níveis 1 do ramo a grupos macro, chaveados pela string crua do .xlsx', () => {
    // A chave é `nome_smartsheet`: a string EXATA do arquivo, sem tradução.
    // O rótulo legível da UI é dado do seed, não é inventado pelo import.
    expect(resultado.grupos.map((g) => g.nomeSmartsheet)).toEqual([
      'SERVIÇOS PRELIMINARES',
      'CIVIL',
      'ELÉTRICA',
    ]);
    expect(resultado.grupos.map((g) => g.ordem)).toEqual([1, 2, 3]);
    expect(resultado.grupos[0].nomeFallback).toBe('SERVIÇOS PRELIMINARES');
  });

  it('monta o caminho WBS acumulando os ancestrais', () => {
    const concretagemFosso = resultado.atividades.find((a) => a.linhaPlanilha === 17)!;
    expect(concretagemFosso.caminhoWbs).toEqual([
      'Elevatória de esgoto bruto',
      'Fosso de sucção',
      'Laje de fundo',
      'Concretagem',
    ]);
    expect(concretagemFosso.wbsNivel).toBe(5);
    expect(concretagemFosso.grupoMacroSmartsheet).toBe('CIVIL');
    expect(concretagemFosso.nome).toBe('Concretagem'); // nome curto para a UI
    expect(concretagemFosso.caminhoWbsTexto).toBe(
      'Elevatória de esgoto bruto > Fosso de sucção > Laje de fundo > Concretagem',
    );
  });

  it('desempilha ao subir de nível (irmão em outro ramo não herda o anterior)', () => {
    const concretagemCaixa = resultado.atividades.find((a) => a.linhaPlanilha === 20)!;
    expect(concretagemCaixa.caminhoWbs).toEqual([
      'Elevatória de esgoto bruto',
      'Caixa de comporta',
      'Laje de fundo',
      'Concretagem',
    ]);
  });

  it('mantém o nome curto repetido e desambigua pelo caminho WBS', () => {
    const concretagens = resultado.atividades.filter((a) => a.nome === 'Concretagem');
    expect(concretagens).toHaveLength(2);
    // Mesmo grupo macro e MESMO nome curto — é justamente o caso que quebrava a
    // chave antiga (grupo_macro_id, nome). Só o caminho WBS os separa.
    expect(concretagens[0].grupoMacroSmartsheet).toBe(concretagens[1].grupoMacroSmartsheet);
    expect(concretagens[0].nome).toBe(concretagens[1].nome);
    expect(concretagens[0].caminhoWbsTexto).not.toBe(concretagens[1].caminhoWbsTexto);
    expect(concretagens[0].caminhoWbsTexto).toContain(SEPARADOR_CAMINHO_WBS);
  });

  it('não emite aviso de colisão de chave para a fixture', () => {
    expect(resultado.avisos.join('\n')).not.toMatch(/COLISÃO DE CHAVE/);
  });

  it('marca corretamente as folhas do WBS', () => {
    const folhas = resultado.atividades.filter((a) => a.ehFolha).map((a) => a.nome);
    expect(folhas).toContain('Ferragem');
    expect(folhas).toContain('Pintura');
    expect(folhas).not.toContain('Fosso de sucção'); // tem filhos
    expect(folhas).not.toContain('Elevatória de esgoto bruto');
  });
});

describe('parsing de datas', () => {
  it('converte Date do exceljs usando UTC (não desloca um dia em fuso negativo)', () => {
    expect(paraDataIso(new Date('2026-05-15T00:00:00.000Z'))).toBe('2026-05-15');
    expect(paraDataIso(new Date('2027-01-26T00:00:00.000Z'))).toBe('2027-01-26');
  });

  it('aceita o formato brasileiro dd/MM/yy e dd/MM/yyyy', () => {
    expect(paraDataIso('27/07/26')).toBe('2026-07-27');
    expect(paraDataIso('26/01/2027')).toBe('2027-01-26');
  });

  it('devolve null para célula vazia ou texto inválido', () => {
    expect(paraDataIso(null)).toBeNull();
    expect(paraDataIso('')).toBeNull();
    expect(paraDataIso('data ruim')).toBeNull();
  });

  it('propaga as datas do ramo para as atividades', () => {
    const marcacao = resultado.atividades.find((a) => a.nome === 'Marcação de obra')!;
    expect(marcacao.dataInicioPlanejada).toBe('2026-05-15');
    expect(marcacao.dataFimPlanejada).toBe('2026-07-27');
    const pintura = resultado.atividades.find((a) => a.nome === 'Pintura')!;
    expect(pintura.dataInicioPlanejada).toBeNull();
  });
});

describe('parsing de "% Concluída"', () => {
  it('converte a fração exportada pelo Smartsheet para 0–100', () => {
    expect(paraPercentual(1)).toEqual({ percentual: 100, suspeito: false });
    expect(paraPercentual(0.42)).toEqual({ percentual: 42, suspeito: false });
    expect(paraPercentual(0.06)).toEqual({ percentual: 6, suspeito: false });
    expect(paraPercentual(0)).toEqual({ percentual: 0, suspeito: false });
  });

  it('trata célula vazia como null (o parser aplica o default 0)', () => {
    expect(paraPercentual(null).percentual).toBeNull();
    const fosso = resultado.atividades.find((a) => a.nome === 'Fosso de sucção')!;
    expect(fosso.percentualConcluido).toBe(0);
  });

  it('marca como suspeito quando o valor sai do intervalo 0–1 (mudança de export)', () => {
    expect(paraPercentual(46)).toEqual({ percentual: 46, suspeito: true });
    expect(paraPercentual(150)).toEqual({ percentual: 100, suspeito: true });
    expect(paraPercentual(-1)).toEqual({ percentual: 0, suspeito: true });
  });

  it('lê o rollup da linha raiz do ramo — a referência oficial dos 6%', () => {
    expect(resultado.raiz.percentualConcluido).toBe(6);
    expect(resultado.raiz.dataInicioPlanejada).toBe('2026-05-15');
    expect(resultado.raiz.dataFimPlanejada).toBe('2027-01-26');
  });

  it('aplica o percentual nas atividades do ramo', () => {
    const gabaritos = resultado.atividades.find(
      (a) => a.nome === 'Execução dos gabaritos de Locação',
    )!;
    expect(gabaritos.percentualConcluido).toBe(42);
  });
});

describe('duração', () => {
  it('aceita sufixo "d" e vírgula decimal do pt-BR', () => {
    expect(paraDuracaoDias('15d')).toBe(15);
    expect(paraDuracaoDias('55,5d')).toBe(55.5);
    expect(paraDuracaoDias('0,5d')).toBe(0.5);
    expect(paraDuracaoDias('0')).toBe(0);
  });

  it('devolve null quando não há duração', () => {
    expect(paraDuracaoDias(null)).toBeNull();
    expect(paraDuracaoDias('')).toBeNull();
    expect(paraDuracaoDias('indefinida')).toBeNull();
  });
});

describe('flag de caminho crítico', () => {
  it('aceita booleano do export e as variantes textuais', () => {
    expect(paraBooleano(true)).toBe(true);
    expect(paraBooleano('Sim')).toBe(true);
    expect(paraBooleano('sim')).toBe(true);
    expect(paraBooleano(null)).toBe(false);
    expect(paraBooleano('Não')).toBe(false);
  });

  it('marca só as atividades realmente críticas do ramo', () => {
    const criticas = resultado.atividades.filter((a) => a.caminhoCritico).map((a) => a.nome);
    expect(criticas.sort()).toEqual(['Concretagem', 'Ferragem']);
  });
});

describe('vínculo atividade → elemento visual', () => {
  it('herda o elemento do ancestral do caminho WBS', () => {
    const porLinha = (n: number) => resultado.atividades.find((a) => a.linhaPlanilha === n)!;
    expect(porLinha(14).tipoElementoVisual).toBe('poco_umido'); // Fosso de sucção
    expect(porLinha(17).tipoElementoVisual).toBe('poco_umido'); // Concretagem do fosso
    expect(porLinha(18).tipoElementoVisual).toBe('caixa_comporta');
    expect(porLinha(20).tipoElementoVisual).toBe('caixa_comporta');
    expect(porLinha(21).tipoElementoVisual).toBe('muro_perimetral');
    expect(porLinha(22).tipoElementoVisual).toBe('muro_perimetral'); // Pintura do muro
  });

  it('deixa null quando não há certeza', () => {
    const elevatoria = resultado.atividades.find(
      (a) => a.nome === 'Elevatória de esgoto bruto',
    )!;
    expect(elevatoria.tipoElementoVisual).toBeNull();
    const marcacao = resultado.atividades.find((a) => a.nome === 'Marcação de obra')!;
    expect(marcacao.tipoElementoVisual).toBeNull();
  });

  it('não confunde serviço elétrico do macromedidor com a caixa do medidor de vazão', () => {
    expect(
      inferirElementoVisual(['Instalação de medidor de vazão do macromedidor'], 'Elétrica'),
    ).toBeNull();
    expect(inferirElementoVisual(['Caixa para medidor de vazão'], 'Civil')).toBe(
      'caixa_medidor_vazao',
    );
  });

  it('não confunde o muro ciclópico do canal com o muro perimetral', () => {
    expect(
      inferirElementoVisual(
        ['Execução de muro em concreto ciclópico - 107m de comprimento', 'Formas'],
        'Drenagem — Canal e muro',
      ),
    ).toBeNull();
  });

  it('cobre os demais elementos reais do WBS', () => {
    expect(inferirElementoVisual(['Área das escadas, caixa de areia e calha Parshall'], 'Civil')).toBe(
      'camara_grades',
    );
    expect(inferirElementoVisual(['Caixa com válvulas do barrilete de recalque'], 'Civil')).toBe(
      'caixa_valvulas',
    );
    expect(inferirElementoVisual(['Caixa para tanque hidropneumático'], 'Civil')).toBe(
      'caixa_tanque_hidropneumatico',
    );
    expect(inferirElementoVisual(['Casa de comando', 'Infra'], 'Elétrica')).toBe('casa_comando');
    expect(inferirElementoVisual(['Pavimentação', 'Meio-fio'], 'Civil')).toBe('pavimentacao');
    expect(
      inferirElementoVisual(['Elevatória de esgoto bruto', 'Passeio em concreto (155m²)'], 'Civil'),
    ).toBe('pavimentacao');
  });
});

describe('resumo do import', () => {
  const resumo = montarResumo(resultado);

  it('conta grupos, atividades e críticas da fixture', () => {
    expect(resumo.totalGrupos).toBe(3);
    expect(resumo.totalAtividades).toBe(13);
    expect(resumo.atividadesCriticas).toBe(2);
  });

  it('deriva as datas extremas só do ramo em escopo', () => {
    expect(resumo.dataMinimaInicio).toBe('2026-05-15');
    expect(resumo.dataMaximaFim).toBe('2027-01-26');
  });

  it('reporta a taxa de vínculo com elemento visual', () => {
    expect(resumo.atividadesComElementoVisual).toBe(9);
    expect(resumo.taxaVinculoElemento).toBeCloseTo(69.2, 1);
  });

  it('aponta divergência em destaque quando os números não batem com o plano', () => {
    // A fixture é um recorte, então tem de divergir dos 317/310/34 reais.
    expect(resumo.divergencias.length).toBeGreaterThan(0);
    expect(resumo.divergencias.join(' ')).toMatch(/atividades: obtido 13, esperado 310/);
    // Mas o % geral e as datas do ramo continuam batendo com o esperado.
    expect(resumo.divergencias.join(' ')).not.toMatch(/% geral/);
    expect(resumo.divergencias.join(' ')).not.toMatch(/data mínima/);
  });
});

describe('leitura do arquivo .xlsx (camada de I/O)', () => {
  /** Gera um .xlsx mínimo, com as colunas fora da ordem original de propósito. */
  async function gerarArquivoTemporario(cabecalhos: string[]): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const planilha = workbook.addWorksheet('EEE - Novo Mundo');
    planilha.addRow(cabecalhos);
    planilha.addRow(['E.E.E. - NOVO MUNDO', 0, 0.06, '164d', new Date(Date.UTC(2026, 4, 15))]);
    planilha.addRow(['SERVIÇOS PRELIMINARES', 1, 1, '2d', new Date(Date.UTC(2026, 6, 27))]);
    planilha.addRow(['Marcação de obra', 2, 1, '1d', new Date(Date.UTC(2026, 6, 27))]);
    workbook.addWorksheet('Comments').addRow(['Linha 5', 'comentário qualquer']);

    const destino = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), 'eee-import-')),
      'fixture.xlsx',
    );
    await workbook.xlsx.writeFile(destino);
    return destino;
  }

  const CABECALHOS_VALIDOS = [
    'Atividade',
    'Nível de hierarquia',
    '% Concluída',
    'Duração',
    'Iniciar',
  ];

  it('lê por nome de cabeçalho, aguentando reordenação de colunas', async () => {
    const arquivo = await gerarArquivoTemporario(CABECALHOS_VALIDOS);
    const brutas = await lerLinhasBrutas(arquivo);
    expect(brutas).toHaveLength(3);
    expect(brutas[0].celulas.atividade).toBe('E.E.E. - NOVO MUNDO');
    expect(brutas[0].celulas.nivel).toBe(0);
    expect(brutas[0].celulas.iniciar).toBeInstanceOf(Date);

    const interpretado = interpretarLinhas(brutas);
    expect(interpretado.grupos.map((g) => g.nomeSmartsheet)).toEqual(['SERVIÇOS PRELIMINARES']);
    expect(interpretado.atividades).toHaveLength(1);
    expect(interpretado.atividades[0].dataInicioPlanejada).toBe('2026-07-27');
    expect(interpretado.raiz.percentualConcluido).toBe(6);
  });

  it('falha com mensagem clara se o cabeçalho obrigatório sumir', async () => {
    const arquivo = await gerarArquivoTemporario(['Tarefa', 'Profundidade', 'Pct', 'Dur', 'Ini']);
    await expect(lerLinhasBrutas(arquivo)).rejects.toThrow(/Colunas obrigatórias/);
  });
});
