/**
 * Parser da aba ORÇAMENTO do quantitativo do terceirizado.
 *
 * REGRA DE NEGÓCIO CRÍTICA testada aqui:
 *   concreto é COMPRA DIRETA da contratada, faturada pela contratante — nunca
 *   soma ao valor de mão de obra do contrato do terceirizado.
 */

import { describe, expect, it } from 'vitest';
import {
  arredondarReais,
  calcularTotais,
  categoriaPorCodigo,
  conferirTotal,
  ehAncestral,
  ehCabecalhoDeCategoria,
  ehCompraDireta,
  extrairLinhas,
  montarItens,
  normalizarCodigo,
  numeroDaCelula,
  ORDEM_CATEGORIAS,
  separarFolhas,
  textoDaCelula,
  TOTAL_CONTRATADO_ESPERADO,
  type LinhaOrcamento,
  type PlanilhaLike,
} from '@/scripts/import-orcamento';

/** Observação literal usada na planilha para marcar o concreto de compra direta. */
const OBS_COMPRA_DIRETA =
  'Considerar o custo de mão de obra e o concreto será tratado como compra direta ' +
  '(a contratada é responsável pela compra e a contratante irá faturar a nota)';
const OBS_MAO_DE_OBRA = 'Considerar o custo de mão de obra e insumos para execução do serviço completo.';

function linha(parcial: Partial<LinhaOrcamento> & { itemCodigo: string }): LinhaOrcamento {
  return {
    linhaPlanilha: 0,
    descricao: parcial.itemCodigo,
    unidade: 'm3',
    quantidade: 0,
    precoUnitario: 0,
    valorTotal: 0,
    observacoes: '',
    ehCabecalhoCategoria: ehCabecalhoDeCategoria(parcial.itemCodigo),
    ...parcial,
  };
}

describe('leitura de célula do exceljs', () => {
  it('lê texto direto, richText e fórmula com resultado em cache', () => {
    expect(textoDaCelula('  PAREDES  ')).toBe('PAREDES');
    expect(textoDaCelula({ richText: [{ text: 'AÇO CA-50 ' }, { text: 'Ø 8.0' }] })).toBe('AÇO CA-50 Ø 8.0');
    expect(textoDaCelula({ formula: 'A1', result: 'AÇO CA-60 Ø 5.0' })).toBe('AÇO CA-60 Ø 5.0');
    expect(textoDaCelula(null)).toBe('');
  });

  it('lê número direto e fórmula com resultado', () => {
    expect(numeroDaCelula(76446)).toBe(76446);
    expect(numeroDaCelula({ formula: 'E21*F21', result: 76446 })).toBe(76446);
  });

  it('fórmula SEM resultado em cache vira 0 — nunca inventa quantidade × preço', () => {
    expect(numeroDaCelula({ formula: 'E235*F235', ref: 'G235', shareType: 'shared' })).toBe(0);
    expect(numeroDaCelula({ sharedFormula: 'G252' })).toBe(0);
    expect(numeroDaCelula(null)).toBe(0);
  });
});

describe('códigos e categorias', () => {
  it('normaliza o código removendo o ponto final dos cabeçalhos', () => {
    expect(normalizarCodigo('1.')).toBe('1');
    expect(normalizarCodigo(' 2.2.2.1 ')).toBe('2.2.2.1');
  });

  it('mapeia as 7 categorias do orçamento na ordem da planilha', () => {
    expect(ORDEM_CATEGORIAS).toEqual([
      'servicos_preliminares',
      'estacao_elevatoria',
      'caixa_tanque_pneumatico',
      'casa_comando',
      'muro_externo',
      'sistema_diversos',
      'itens_omissos',
    ]);
    expect(categoriaPorCodigo('1.4')).toBe('servicos_preliminares');
    expect(categoriaPorCodigo('2.2.2.1')).toBe('estacao_elevatoria');
    expect(categoriaPorCodigo('3.1.1.1')).toBe('caixa_tanque_pneumatico');
    expect(categoriaPorCodigo('4.2.2.5')).toBe('casa_comando');
    expect(categoriaPorCodigo('5.2.2.3')).toBe('muro_externo');
    expect(categoriaPorCodigo('6.11')).toBe('sistema_diversos');
    expect(categoriaPorCodigo('7.1')).toBe('itens_omissos');
    expect(categoriaPorCodigo('9.9')).toBeNull();
  });

  it('identifica cabeçalho de categoria', () => {
    expect(ehCabecalhoDeCategoria('2.')).toBe(true);
    expect(ehCabecalhoDeCategoria('2.2')).toBe(false);
  });

  it('detecta ancestralidade sem confundir prefixo textual', () => {
    expect(ehAncestral('2.2', '2.2.1')).toBe(true);
    expect(ehAncestral('2.2', '2.21')).toBe(false);
    expect(ehAncestral('2.2', '2.2')).toBe(false);
  });
});

describe('separarFolhas — evita dobrar o orçamento', () => {
  it('descarta totalizadores e cabeçalhos, mantendo só as folhas', () => {
    const linhas = [
      linha({ itemCodigo: '2', valorTotal: 100 }),
      linha({ itemCodigo: '2.2', valorTotal: 100 }),
      linha({ itemCodigo: '2.2.1', valorTotal: 40 }),
      linha({ itemCodigo: '2.2.2', valorTotal: 60 }),
      linha({ itemCodigo: '2.2.2.1', valorTotal: 60 }),
    ];
    const { folhas, agregadoras } = separarFolhas(linhas);
    expect(folhas.map((f) => f.itemCodigo)).toEqual(['2.2.1', '2.2.2.1']);
    expect(agregadoras.map((a) => a.itemCodigo)).toEqual(['2', '2.2', '2.2.2']);
  });

  it('a soma das folhas reproduz o totalizador, sem duplicar', () => {
    const linhas = [
      linha({ itemCodigo: '1', valorTotal: 52983 }),
      linha({ itemCodigo: '1.1', valorTotal: 6000 }),
      linha({ itemCodigo: '1.2', valorTotal: 10000 }),
      linha({ itemCodigo: '1.3', valorTotal: 20000 }),
      linha({ itemCodigo: '1.4', valorTotal: 16983 }),
    ];
    const { itens } = montarItens(linhas);
    expect(calcularTotais(itens).totalGeral).toBe(52983);
  });
});

describe('REGRA CRÍTICA — concreto é compra direta, nunca soma à mão de obra', () => {
  it('reconhece a observação de compra direta da planilha', () => {
    expect(ehCompraDireta(OBS_COMPRA_DIRETA)).toBe(true);
    expect(ehCompraDireta(OBS_MAO_DE_OBRA)).toBe(false);
    expect(ehCompraDireta('')).toBe(false);
  });

  it('marca eh_compra_direta = true no item de concreto e false nos demais', () => {
    const { itens } = montarItens([
      linha({ itemCodigo: '2.2.2.1', descricao: 'PAREDES, LAJES E ESCADA', valorTotal: 76446, observacoes: OBS_COMPRA_DIRETA }),
      linha({ itemCodigo: '2.2.3.3', descricao: 'PAREDES (fôrma)', valorTotal: 80678.58, observacoes: OBS_MAO_DE_OBRA }),
    ]);
    expect(itens.find((i) => i.item_codigo === '2.2.2.1')?.eh_compra_direta).toBe(true);
    expect(itens.find((i) => i.item_codigo === '2.2.3.3')?.eh_compra_direta).toBe(false);
  });

  it('o total de mão de obra NÃO inclui o concreto de compra direta', () => {
    const { itens } = montarItens([
      linha({ itemCodigo: '2.2.2.1', descricao: 'PAREDES, LAJES E ESCADA', valorTotal: 76446, observacoes: OBS_COMPRA_DIRETA }),
      linha({ itemCodigo: '2.2.3.3', descricao: 'PAREDES (fôrma)', valorTotal: 80678.58, observacoes: OBS_MAO_DE_OBRA }),
    ]);
    const totais = calcularTotais(itens);

    expect(totais.totalCompraDireta).toBe(76446);
    expect(totais.totalMaoDeObra).toBe(80678.58);
    expect(totais.totalMaoDeObra + totais.totalCompraDireta).toBeCloseTo(totais.totalGeral, 2);
    // O ponto da regra: mão de obra e compra direta são grandezas separadas.
    expect(totais.totalMaoDeObra).not.toBe(totais.totalGeral);
  });

  it('separa mão de obra x compra direta por categoria', () => {
    const { itens } = montarItens([
      linha({ itemCodigo: '4.2.2.1', descricao: 'SAPATAS', valorTotal: 1523.2, observacoes: OBS_COMPRA_DIRETA }),
      linha({ itemCodigo: '4.2.3.1', descricao: 'SAPATAS (fôrma)', valorTotal: 1152, observacoes: OBS_MAO_DE_OBRA }),
      linha({ itemCodigo: '5.2.2.1', descricao: 'SAPATAS muro', valorTotal: 2876.4, observacoes: OBS_COMPRA_DIRETA }),
    ]);
    const { porCategoria } = calcularTotais(itens);

    expect(porCategoria.casa_comando).toMatchObject({ maoDeObra: 1152, compraDireta: 1523.2, itens: 2 });
    expect(porCategoria.muro_externo).toMatchObject({ maoDeObra: 0, compraDireta: 2876.4, itens: 1 });
  });
});

describe('montarItens', () => {
  it('ignora linha sem descrição (itens omissos em branco) sem quebrar', () => {
    const { itens, semDescricao } = montarItens([
      linha({ itemCodigo: '7', descricao: 'ITENS OMISSOS' }),
      linha({ itemCodigo: '7.1', descricao: '' }),
    ]);
    expect(itens).toHaveLength(0);
    expect(semDescricao).toHaveLength(1);
  });

  it('desambigua código duplicado (o UNIQUE do banco é por item_codigo)', () => {
    const { itens, duplicados } = montarItens([
      linha({ itemCodigo: '4.4.7', descricao: 'Cobogó (elemento vazado) de concreto', valorTotal: 250 }),
      linha({ itemCodigo: '4.4.7', descricao: 'Caiação em parede externa', valorTotal: 1351.05 }),
    ]);
    expect(itens.map((i) => i.item_codigo)).toEqual(['4.4.7', '4.4.7#2']);
    expect(duplicados).toHaveLength(1);
    expect(new Set(itens.map((i) => i.item_codigo)).size).toBe(itens.length);
  });

  it('não envia valor_medido — o upsert não pode zerar a medição já lançada', () => {
    const { itens } = montarItens([linha({ itemCodigo: '1.1', descricao: 'Mobilização', valorTotal: 6000 })]);
    expect(itens[0]).not.toHaveProperty('valor_medido');
  });

  it('é determinístico (idempotência do upsert)', () => {
    const linhas = [
      linha({ itemCodigo: '1.1', descricao: 'Mobilização', valorTotal: 6000 }),
      linha({ itemCodigo: '1.2', descricao: 'Canteiro', valorTotal: 10000 }),
    ];
    expect(montarItens(linhas).itens).toEqual(montarItens(linhas).itens);
  });

  it('avisa quando há item com valor zerado', () => {
    const { avisos } = montarItens([linha({ itemCodigo: '2.3.2', descricao: 'TUBO FoFo', valorTotal: 0 })]);
    expect(avisos.join(' ')).toMatch(/valor_total = 0/);
  });
});

describe('conferirTotal', () => {
  it('aceita diferença de arredondamento dentro da tolerância', () => {
    expect(conferirTotal(TOTAL_CONTRATADO_ESPERADO).bate).toBe(true);
    expect(conferirTotal(736324.0).bate).toBe(true);
  });

  it('reprova divergência real e informa a diferença', () => {
    const conferencia = conferirTotal(736924.25);
    expect(conferencia.bate).toBe(false);
    expect(conferencia.diferenca).toBe(599.98);
  });

  it('arredonda para 2 casas, como a coluna numeric(14,2)', () => {
    expect(arredondarReais(76446.000000001)).toBe(76446);
    expect(arredondarReais(3998.062500000001)).toBe(3998.06);
  });
});

describe('extrairLinhas — varredura da aba', () => {
  /** Dublê mínimo de worksheet do exceljs. */
  function planilhaFalsa(linhas: Record<number, unknown[]>): PlanilhaLike {
    return {
      getRow: (numero: number) => ({
        getCell: (coluna: number) => ({ value: linhas[numero]?.[coluna - 1] ?? null }),
      }),
    };
  }

  it('lê itens, marca cabeçalho de categoria e para na linha do total', () => {
    // Colunas: A, B=item, C=descrição, D=und, E=qtd, F=preço, G=total, H=obs
    const resultado = extrairLinhas(
      planilhaFalsa({
        10: [null, '1.', 'SERVIÇOS PRELIMINARES', null, null, null, { formula: 'x', result: 52983 }, null],
        11: [null, '1.1', 'Mobilização', 'VB', 1, 6000, { formula: 'E11*F11', result: 6000 }, null],
        12: [null, null, null, null, null, null, null, null],
        13: [null, null, null, null, null, 'TOTAL DO SERVIÇO:', { formula: 's', result: 736324.266398 }, null],
        14: [null, '9.9', 'não deve ser lido', null, null, null, 1, null],
      }),
    );

    expect(resultado.linhas.map((l) => l.itemCodigo)).toEqual(['1', '1.1']);
    expect(resultado.linhas[0].ehCabecalhoCategoria).toBe(true);
    expect(resultado.linhas[1].unidade).toBe('VB');
    expect(resultado.totalDaPlanilha).toBe(736324.27);
    expect(resultado.totaisDeclaradosPorCategoria.servicos_preliminares).toBe(52983);
  });

  it('ignora linhas cujo "código" não é numérico hierárquico', () => {
    const resultado = extrairLinhas(
      planilhaFalsa({
        10: [null, 'OBSERVAÇÕES GERAIS', 'texto solto', null, null, null, null, null],
        11: [null, '2.1', 'Movimentação de Terra', 'm3', 1, 1, 100, null],
      }),
    );
    expect(resultado.linhas.map((l) => l.itemCodigo)).toEqual(['2.1']);
  });
});
