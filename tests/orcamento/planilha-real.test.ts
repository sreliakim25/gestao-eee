/**
 * Teste de integração do parser contra a planilha REAL do terceirizado
 * (`Materiais/QUANTITATIVO ESTAÇÃO ELEVATÓRIA DE ESGOTO RL.xlsx`).
 *
 * Trava os números que a UI e a medição usam. Se a planilha for substituída por
 * uma revisão nova, este teste falha de propósito: os valores precisam ser
 * reconferidos antes de reimportar.
 */

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  calcularTotais,
  CAMINHO_PADRAO_XLSX,
  conferirTotal,
  lerPlanilhaOrcamento,
  montarItens,
  ORDEM_CATEGORIAS,
  TOTAL_CONTRATADO_ESPERADO,
} from '@/scripts/import-orcamento';

const temPlanilha = existsSync(CAMINHO_PADRAO_XLSX);
const suite = temPlanilha ? describe : describe.skip;

/** Id fictício: o teste não toca no banco, só na montagem do payload. */
const PROJETO_ID_TESTE = '00000000-0000-4000-8000-000000000099';

suite('planilha real — aba ORÇAMENTO', () => {
  async function importar() {
    const parse = await lerPlanilhaOrcamento(CAMINHO_PADRAO_XLSX);
    const montagem = montarItens(parse.linhas, PROJETO_ID_TESTE);
    return { parse, montagem, totais: calcularTotais(montagem.itens) };
  }

  it('lê o total oficial declarado na planilha: R$ 736.324,27', async () => {
    const { parse } = await importar();
    expect(parse.totalDaPlanilha).toBe(TOTAL_CONTRATADO_ESPERADO);
  }, 60_000);

  it('extrai 256 linhas de item e 205 folhas importáveis', async () => {
    const { parse, montagem } = await importar();
    expect(parse.linhas).toHaveLength(256);
    expect(montagem.itens).toHaveLength(205);
    expect(montagem.duplicados.map((d) => d.itemCodigo)).toEqual(['4.4.7']);
  }, 60_000);

  it('classifica todas as 7 categorias e nenhum item fica sem categoria', async () => {
    const { montagem, totais } = await importar();
    const categorias = new Set(montagem.itens.map((i) => i.categoria));
    for (const c of categorias) expect(ORDEM_CATEGORIAS).toContain(c);
    // "Itens Omissos" está em branco na planilha atual — é o único bloco sem item.
    expect(totais.porCategoria.itens_omissos.itens).toBe(0);
  }, 60_000);

  it('REGRA CRÍTICA: separa o concreto (compra direta) da mão de obra', async () => {
    const { totais } = await importar();

    expect(totais.totalCompraDireta).toBe(104868.54);
    expect(totais.totalMaoDeObra).toBe(632055.71);
    expect(totais.totalGeral).toBe(736924.25);

    // O valor de mão de obra do contrato do terceirizado é MENOR que o total,
    // exatamente pelo montante do concreto de compra direta.
    expect(totais.totalGeral - totais.totalMaoDeObra).toBeCloseTo(totais.totalCompraDireta, 2);
  }, 60_000);

  it('todo item de compra direta é concreto (FCK/magro/peças estruturais)', async () => {
    const { montagem } = await importar();
    const compraDireta = montagem.itens.filter((i) => i.eh_compra_direta);

    expect(compraDireta.map((i) => i.item_codigo).sort()).toEqual([
      '2.2.2.1', // PAREDES, LAJES E ESCADA — FCK 40 MPa, 84,94 m³
      '3.1.1.1', // PAREDES E LAJES — caixa do tanque pneumático
      '4.2.2.1', // SAPATAS — casa de comando
      '4.2.2.2', // VIGA BALDRAME
      '4.2.2.3', // PILARES
      '4.2.2.4', // VIGAS
      '4.2.2.5', // PISO
      '4.2.2.6', // LAJES
      '5.2.2.1', // SAPATAS — muro externo
      '5.2.2.2', // VIGA BALDRAME
      '5.2.2.3', // VIGA SUPERIOR
      '5.2.2.4', // PILARES
    ]);
  }, 60_000);

  it('compra direta por categoria bate com os itens de concreto da planilha', async () => {
    const { totais } = await importar();
    expect(totais.porCategoria.servicos_preliminares.compraDireta).toBe(0);
    expect(totais.porCategoria.estacao_elevatoria.compraDireta).toBe(76446); // 84,94 m³ × R$ 900
    expect(totais.porCategoria.caixa_tanque_pneumatico.compraDireta).toBe(3298);
    expect(totais.porCategoria.casa_comando.compraDireta).toBe(10500.29);
    expect(totais.porCategoria.muro_externo.compraDireta).toBe(14624.25);
    expect(totais.porCategoria.sistema_diversos.compraDireta).toBe(0);
  }, 60_000);

  it('detecta a divergência real de R$ 599,98 do totalizador da planilha', async () => {
    const { parse, totais } = await importar();
    const conferencia = conferirTotal(totais.totalGeral);

    // A soma das folhas dá R$ 600,00 a mais que o "TOTAL DO SERVIÇO" da planilha:
    // a fórmula do bloco 3 (Caixa do Tanque Pneumático) não abrange o subitem 3.3
    // "Material Hidráulico - PEAD" (R$ 600,00). O script avisa em destaque.
    expect(conferencia.bate).toBe(false);
    expect(conferencia.diferenca).toBe(599.98);
    expect(totais.porCategoria.caixa_tanque_pneumatico.total).toBe(22475.4);
    expect(parse.totaisDeclaradosPorCategoria.caixa_tanque_pneumatico).toBe(21875.4);
  }, 60_000);

  it('as demais categorias batem com o totalizador declarado na planilha', async () => {
    const { parse, totais } = await importar();
    for (const categoria of ORDEM_CATEGORIAS) {
      if (categoria === 'caixa_tanque_pneumatico') continue;
      const declarado = parse.totaisDeclaradosPorCategoria[categoria];
      if (declarado === undefined) continue;
      expect(Math.abs(totais.porCategoria[categoria].total - declarado), categoria).toBeLessThanOrEqual(0.5);
    }
  }, 60_000);
});
