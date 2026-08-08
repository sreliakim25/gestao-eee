/**
 * O dossiê da Análise IA é a fronteira entre os números oficiais e o texto
 * gerado. Estes testes travam duas coisas:
 *   1. que os números do dossiê são exatamente os de `lib/calculos/` (se
 *      divergirem, a IA contradiz o Painel sem nenhum erro de compilação);
 *   2. que as regras de negócio e de escopo estão na instrução de sistema.
 */

import { describe, expect, it } from 'vitest';
import { montarIndicadoresPainel } from '@/lib/calculos';
import { MODELO_ANALISE, SISTEMA_ANALISE, montarDossie } from '@/lib/ia/analise-obra';
import type { AtividadeCalculo } from '@/lib/calculos';

const ID_TERRA = 'grp-terraplenagem';
const ID_CIVIL = 'grp-civil';
const ID_POCO = 'elem-poco';

function atividade(
  parcial: Partial<AtividadeCalculo> & { nome?: string },
): AtividadeCalculo & { nome: string } {
  return {
    nome: 'Atividade',
    grupo_macro_id: ID_CIVIL,
    elemento_visual_id: null,
    percentual_concluido: 0,
    duracao_dias: 10,
    data_inicio_planejada: '2026-05-15',
    data_fim_planejada: '2026-05-25',
    caminho_critico: false,
    ...parcial,
  } as AtividadeCalculo & { nome: string };
}

const ATIVIDADES = [
  atividade({ nome: 'Corte', grupo_macro_id: ID_TERRA, percentual_concluido: 100 }),
  atividade({ nome: 'Reaterro', grupo_macro_id: ID_TERRA, percentual_concluido: 0 }),
  atividade({
    nome: 'Laje de fundo',
    grupo_macro_id: ID_CIVIL,
    elemento_visual_id: ID_POCO,
    percentual_concluido: 50,
    caminho_critico: true,
  }),
];

const NOMES_GRUPOS = { [ID_TERRA]: 'Terraplenagem', [ID_CIVIL]: 'Civil' };
const NOMES_ELEMENTOS = { [ID_POCO]: 'Poço úmido' };

function dossiePadrao() {
  const indicadores = montarIndicadoresPainel({
    atividades: ATIVIDADES,
    dataReferencia: '2026-08-05',
    dataFimPlanejada: '2027-01-26',
  });

  return {
    indicadores,
    texto: montarDossie({
      indicadores,
      dataReferencia: '2026-08-05',
      dataFimPlanejada: '2027-01-26',
      nomesGrupos: NOMES_GRUPOS,
      nomesElementos: NOMES_ELEMENTOS,
      criticasEmAberto: [
        { nome: 'Laje de fundo', percentualConcluido: 50, dataFimPlanejada: '2026-09-01' },
      ],
    }),
  };
}

describe('instrução de sistema', () => {
  it('usa o modelo declarado como constante, não string solta', () => {
    expect(MODELO_ANALISE).toBe('claude-opus-5');
  });

  it('proíbe inventar dados', () => {
    expect(SISTEMA_ANALISE).toMatch(/nunca invente/i);
    expect(SISTEMA_ANALISE).toMatch(/não estiver no dossiê/i);
  });

  it('carrega as regras de negócio críticas do projeto', () => {
    // Mínimo de concreto e separação concreto x mão de obra.
    expect(SISTEMA_ANALISE).toMatch(/5\s?m³/);
    expect(SISTEMA_ANALISE).toMatch(/compra direta/i);
    expect(SISTEMA_ANALISE).toMatch(/mão de obra/i);
  });

  it('declara o escopo dentro do muro e exclui as redes externas', () => {
    expect(SISTEMA_ANALISE).toMatch(/muro perimetral/i);
    expect(SISTEMA_ANALISE).toMatch(/emissário final/i);
    expect(SISTEMA_ANALISE).toMatch(/rede coletora externa/i);
    expect(SISTEMA_ANALISE).toMatch(/FORA de escopo/i);
  });
});

describe('dossiê', () => {
  it('reporta o mesmo percentual geral que o motor de cálculo', () => {
    const { indicadores, texto } = dossiePadrao();
    const esperado = (Math.round(indicadores.percentualEvolucaoGeral * 10) / 10).toLocaleString(
      'pt-BR',
      { maximumFractionDigits: 1 },
    );
    expect(texto).toContain(`Evolução física geral: ${esperado}%`);
  });

  it('reporta o mesmo total e a mesma contagem de críticas do motor', () => {
    const { indicadores, texto } = dossiePadrao();
    expect(texto).toContain(`${indicadores.resumo.total} no total`);
    expect(texto).toContain(`Em caminho crítico: ${indicadores.resumo.criticas}`);
  });

  it('usa os nomes legíveis dos grupos, não os uuids', () => {
    const { texto } = dossiePadrao();
    expect(texto).toContain('Terraplenagem');
    expect(texto).toContain('Civil');
    expect(texto).not.toContain(ID_TERRA);
    expect(texto).not.toContain(ID_CIVIL);
  });

  it('usa os nomes legíveis dos elementos visuais', () => {
    const { texto } = dossiePadrao();
    expect(texto).toContain('Poço úmido');
    expect(texto).not.toContain(ID_POCO);
  });

  it('lista as atividades críticas em aberto com prazo', () => {
    const { texto } = dossiePadrao();
    expect(texto).toContain('Laje de fundo');
    expect(texto).toContain('2026-09-01');
  });

  it('distingue "sem apontamento" de zero por cento', () => {
    const indicadores = montarIndicadoresPainel({
      atividades: ATIVIDADES,
      dataReferencia: '2026-08-05',
      dataFimPlanejada: '2027-01-26',
    });
    const texto = montarDossie({
      indicadores,
      dataReferencia: '2026-08-05',
      dataFimPlanejada: '2027-01-26',
      nomesGrupos: NOMES_GRUPOS,
      nomesElementos: NOMES_ELEMENTOS,
      criticasEmAberto: [
        { nome: 'Ferragem', percentualConcluido: null, dataFimPlanejada: null },
      ],
    });
    expect(texto).toContain('Ferragem — sem apontamento, término planejado sem data');
    // O aviso existe porque 304 das 310 atividades do Smartsheet vêm sem %.
    expect(texto).toMatch(/não conclua que a atividade está parada/i);
  });

  it('não quebra quando não há nada em aberto nem agregados', () => {
    const indicadores = montarIndicadoresPainel({
      atividades: [],
      dataReferencia: '2026-08-05',
      dataFimPlanejada: '2027-01-26',
    });
    const texto = montarDossie({
      indicadores,
      dataReferencia: '2026-08-05',
      dataFimPlanejada: '2027-01-26',
      nomesGrupos: {},
      nomesElementos: {},
      criticasEmAberto: [],
    });
    expect(texto).toContain('Sem dados por frente.');
    expect(texto).toContain('Nenhuma atividade crítica em aberto');
  });
});
