/**
 * components/gestao-visual/adaptadores.ts — ponte entre as linhas do banco e o
 * contrato de renderização (`ElementoRenderizavel`).
 *
 * ATENÇÃO: aqui NÃO se calcula percentual. A única fonte é
 * `percentuaisPorElementoVisual` / `faixaProgresso` de `@/lib/calculos`
 * (dono: `motor-indicadores`). Reimplementar a média ponderada ou o `if` da
 * faixa faria o SVG contar uma história diferente do Painel sem gerar nenhum
 * erro de compilação — é exatamente o bug que a regra 4 do CLAUDE.md proíbe.
 */

import { faixaProgresso, percentuaisPorElementoVisual } from '@/lib/calculos';
import type { OpcoesPonderacao } from '@/lib/calculos';
import type { ElementoVisual } from '@/types/database';
import type { AtividadeGestaoVisual, ElementoRenderizavel } from './tipos';

/**
 * Resolve a lista de elementos renderizáveis em uma única passada pelas
 * atividades (o mapa em lote existe justamente para não rodar o cálculo por
 * elemento dentro de um laço).
 *
 * Elemento sem atividade vinculada entra com 0% / `nao_iniciado` e
 * `totalAtividades: 0` — a UI mostra isso explicitamente, em vez de fingir que
 * o elemento simplesmente não começou.
 */
export function montarElementosRenderizaveis(
  elementos: readonly ElementoVisual[],
  atividades: readonly AtividadeGestaoVisual[],
  opcoes: OpcoesPonderacao = {},
): ElementoRenderizavel[] {
  const agregados = percentuaisPorElementoVisual(atividades, opcoes);

  return [...elementos]
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((elemento) => {
      const agregado = agregados[elemento.id];
      const percentual = agregado?.percentual ?? 0;
      return {
        id: elemento.id,
        nome: elemento.nome,
        tipo: elemento.tipo,
        svgPathId: elemento.svg_path_id,
        ifcGlobalId: elemento.ifc_global_id,
        percentual,
        // `agregado.faixa` já vem de `faixaProgresso`; o fallback usa a mesma
        // função para que exista um único caminho de classificação.
        faixa: agregado?.faixa ?? faixaProgresso(percentual),
        totalAtividades: agregado?.totalAtividades ?? 0,
      };
    });
}

/** Atividades vinculadas a um elemento visual. Filtro puro, sem cálculo. */
export function atividadesDoElemento(
  atividades: readonly AtividadeGestaoVisual[],
  elementoVisualId: string | null,
): AtividadeGestaoVisual[] {
  if (!elementoVisualId) return [];
  return atividades.filter(
    (atividade) => atividade.elemento_visual_id === elementoVisualId,
  );
}

/**
 * Último segmento de um caminho WBS.
 *
 * Desde a migration `20260805120900`, `atividades.nome` JÁ é o nome curto e o
 * caminho completo mora em `atividades.caminho_wbs` — então na prática esta
 * função devolve o nome inalterado. Ela permanece como rede de proteção para
 * bases importadas antes dessa correção, onde o caminho inteiro ainda pode
 * estar empilhado em `nome`.
 */
export function nomeCurtoAtividade(nome: string): string {
  const partes = nome.split('>').map((parte) => parte.trim()).filter(Boolean);
  return partes.length > 0 ? partes[partes.length - 1] : nome;
}

/** Formata um percentual 0–100 em pt-BR, sem casas decimais desnecessárias. */
export function formatarPercentual(valor: number): string {
  const arredondado = Math.round(valor * 10) / 10;
  return `${arredondado.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}
