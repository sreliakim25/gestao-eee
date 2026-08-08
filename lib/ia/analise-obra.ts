/**
 * lib/ia/analise-obra.ts — monta o dossiê que vai para a API da Anthropic.
 *
 * REGRA: a IA recebe indicadores JÁ CALCULADOS por `lib/calculos/`. Ela não
 * recalcula percentual nem status de prazo — se recalculasse, o texto poderia
 * contradizer o Painel, e o número do Painel é o oficial. A IA interpreta e
 * recomenda; a aritmética não é dela.
 *
 * Este módulo é puro (sem I/O, sem SDK) para ser testável sem chamar a API.
 */

import type { IndicadoresPainel } from '@/lib/calculos';
import { ROTULOS_STATUS_PRAZO } from '@/lib/ui/formato';

/** Modelo usado na análise. Constante para não ficar solto no route handler. */
export const MODELO_ANALISE = 'claude-opus-5';

export interface EntradaAnalise {
  indicadores: IndicadoresPainel;
  dataReferencia: string;
  dataFimPlanejada: string;
  /** Nome legível de cada grupo macro, por id. */
  nomesGrupos: Readonly<Record<string, string>>;
  /** Nome legível de cada elemento visual, por id. */
  nomesElementos: Readonly<Record<string, string>>;
  /** Atividades críticas em aberto, já filtradas e ordenadas pela página. */
  criticasEmAberto: ReadonlyArray<{
    nome: string;
    percentualConcluido: number | null;
    dataFimPlanejada: string | null;
  }>;
}

/** Instrução de sistema: define o papel e o que é proibido inventar. */
export const SISTEMA_ANALISE = `Você é um engenheiro de planejamento analisando a obra da Estação Elevatória de Esgoto (EEE) do Novo Mundo, da Viana & Moura Construções.

Escopo da obra: exclusivamente o que está dentro do muro perimetral da elevatória. Emissário final e rede coletora externa estão FORA de escopo — nunca os mencione como pendência desta obra.

Regras invioláveis:
- Use apenas os números fornecidos no dossiê. Nunca invente percentuais, datas, quantidades ou valores.
- Se um dado necessário não estiver no dossiê, diga explicitamente que ele não está disponível em vez de estimar.
- Pedido mínimo de concreto é 5 m³; sobras devem ser combinadas entre etapas antes de pedir um caminhão abaixo do mínimo.
- Concreto é compra direta da contratada, faturado pela contratante — nunca some ao valor de mão de obra do contrato do terceirizado.

Escreva em português do Brasil, tom técnico e direto, sem floreio. Responda em Markdown com exatamente estas três seções:

## Situação
Duas a quatro frases sobre onde a obra está.

## Riscos
Lista curta. Para cada risco, aponte o dado do dossiê que o sustenta.

## Recomendações
No máximo cinco ações concretas, ordenadas por prioridade.

Seja conciso: o leitor é o gestor da obra, não precisa de contexto que ele já tem.`;

/** Serializa os indicadores num dossiê legível para o modelo. */
export function montarDossie(entrada: EntradaAnalise): string {
  const { indicadores: ind, nomesGrupos, nomesElementos } = entrada;

  const linhasGrupos = Object.entries(ind.porGrupoMacro)
    .map(([id, agregado]) => {
      const nome = nomesGrupos[id] ?? id;
      return `- ${nome}: ${formatar(agregado.percentual)}% (${agregado.totalAtividades} atividades)`;
    })
    .sort();

  const linhasElementos = Object.entries(ind.porElementoVisual)
    .map(([id, agregado]) => {
      const nome = nomesElementos[id] ?? id;
      return `- ${nome}: ${formatar(agregado.percentual)}% (${agregado.totalAtividades} atividades)`;
    })
    .sort();

  const linhasCriticas = entrada.criticasEmAberto.map((atividade) => {
    const termino = atividade.dataFimPlanejada ?? 'sem data';
    const percentual =
      atividade.percentualConcluido === null
        ? 'sem apontamento'
        : `${formatar(atividade.percentualConcluido)}%`;
    return `- ${atividade.nome} — ${percentual}, término planejado ${termino}`;
  });

  return [
    `# Dossiê da obra em ${entrada.dataReferencia}`,
    '',
    '## Indicadores gerais',
    `- Evolução física geral: ${formatar(ind.percentualEvolucaoGeral)}%`,
    `- Status de prazo: ${ROTULOS_STATUS_PRAZO[ind.prazo.status]} (desvio de ${formatar(ind.prazo.desvioPontosPercentuais)} pontos percentuais em relação ao planejado)`,
    `- Semanas restantes até o fim planejado (${entrada.dataFimPlanejada}): ${ind.semanasRestantes}`,
    `- Atividades: ${ind.resumo.total} no total, ${ind.resumo.concluidas} concluídas, ${ind.resumo.emAndamento} em andamento, ${ind.resumo.naoIniciadas} não iniciadas`,
    `- Em caminho crítico: ${ind.resumo.criticas}`,
    `- Sem datas planejadas (fora da linha de base): ${ind.resumo.semDatasPlanejadas}`,
    '',
    '## Evolução por frente',
    ...(linhasGrupos.length > 0 ? linhasGrupos : ['- Sem dados por frente.']),
    '',
    '## Evolução por elemento estrutural',
    ...(linhasElementos.length > 0 ? linhasElementos : ['- Sem dados por elemento.']),
    '',
    '## Atividades em caminho crítico ainda não concluídas',
    ...(linhasCriticas.length > 0
      ? linhasCriticas
      : ['- Nenhuma atividade crítica em aberto no recorte enviado.']),
    '',
    'IMPORTANTE: um percentual "sem apontamento" significa que o Smartsheet não teve o campo preenchido — não conclua que a atividade está parada por causa disso.',
  ].join('\n');
}

/** Uma casa decimal, sem notação científica, com vírgula do pt-BR. */
function formatar(valor: number): string {
  const arredondado = Math.round(valor * 10) / 10;
  return arredondado.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}
