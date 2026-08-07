'use client';

/**
 * components/gestao-visual/renderizador-svg.tsx — implementação SVG do
 * contrato `RenderizadorPlanta` (ver `tipos.ts`).
 *
 * É a peça SUBSTITUÍVEL da Gestão Visual: quando o modelo IFC da elevatória
 * existir, basta escrever um `RenderizadorIfc` com a mesma assinatura e passá-lo
 * em `<GestaoVisual renderizador={...} />`. Nada em `app/gestao-visual/`, em
 * `adaptadores.ts` ou no banco muda.
 *
 * Este componente não sabe o que é uma atividade e não calcula percentual —
 * recebe `ElementoRenderizavel[]` com percentual e faixa já resolvidos.
 */

import { useState, type KeyboardEvent } from 'react';
import { ROTULOS_FAIXA_PROGRESSO } from '@/lib/calculos';
import { formatarPercentual } from './adaptadores';
import {
  ALTURA_LINHA_ROTULO,
  FONTE_ROTULO,
  FORMAS_EM_ORDEM_DE_DESENHO,
  HALO_ROTULO,
  ROTULOS_CONTEXTO,
  SETA_NORTE,
  TRACOS_CONTEXTO,
  VIEW_BOX,
} from './geometria-planta';
import { CREME, ESTILO_POR_FAIXA, OURO, TINTA, preenchimentoDaFaixa, tracoDaFaixa } from './paleta';
import type { ElementoRenderizavel, PropsRenderizadorPlanta } from './tipos';

/** Texturas das faixas. Renderizadas uma única vez, dentro do próprio desenho. */
function DefsProgresso() {
  const emAndamento = ESTILO_POR_FAIXA.em_andamento;
  const concluido = ESTILO_POR_FAIXA.concluido;
  return (
    <defs>
      {/* Listras diagonais: a faixa "em andamento" continua distinguível em
          preto-e-branco e para quem não separa ouro de vermelho. */}
      <pattern
        id="gv-textura-em-andamento"
        patternUnits="userSpaceOnUse"
        width={8}
        height={8}
        patternTransform="rotate(45)"
      >
        <rect width={8} height={8} fill={OURO} />
        <rect width={3} height={8} fill={emAndamento.corTraco} opacity={0.55} />
      </pattern>
      {/* Pontilhado claro sobre o vermelho escuro do "concluído". */}
      <pattern
        id="gv-textura-concluido"
        patternUnits="userSpaceOnUse"
        width={6}
        height={6}
      >
        <rect width={6} height={6} fill={concluido.corBase} />
        <circle cx={1.5} cy={1.5} r={1.1} fill={CREME} opacity={0.7} />
        <circle cx={4.5} cy={4.5} r={1.1} fill={CREME} opacity={0.7} />
      </pattern>
    </defs>
  );
}

/** Texto de acessibilidade e de tooltip de um elemento. */
export function descreverElemento(elemento: ElementoRenderizavel): string {
  const faixa = ROTULOS_FAIXA_PROGRESSO[elemento.faixa];
  const atividades =
    elemento.totalAtividades === 1
      ? '1 atividade vinculada'
      : `${elemento.totalAtividades} atividades vinculadas`;
  return `${elemento.nome}: ${formatarPercentual(elemento.percentual)} concluído — ${faixa} (${atividades})`;
}

export function RenderizadorSvgPlanta({
  elementos,
  elementoSelecionadoId,
  aoSelecionar,
  descricaoAcessivel = 'Planta esquemática da Estação Elevatória de Esgoto Novo Mundo. Use Tab para percorrer os elementos e Enter para abrir o detalhe.',
}: PropsRenderizadorPlanta) {
  const [focadoId, setFocadoId] = useState<string | null>(null);

  // Índice svg_path_id → elemento. Uma forma sem elemento correspondente no
  // banco é desenhada em cinza e não é clicável (não inventa dado).
  const porSvgPathId = new Map(elementos.map((elemento) => [elemento.svgPathId, elemento]));

  function aoTeclar(evento: KeyboardEvent<SVGGElement>, elementoId: string) {
    if (evento.key === 'Enter' || evento.key === ' ' || evento.key === 'Spacebar') {
      evento.preventDefault();
      aoSelecionar(elementoId);
    }
  }

  return (
    <svg
      viewBox={VIEW_BOX}
      role="group"
      aria-label={descricaoAcessivel}
      data-testid="planta-eee"
      className="h-auto w-full select-none"
      style={{ backgroundColor: CREME }}
    >
      <DefsProgresso />

      {/* Camada 1: formas dos elementos visuais (clicáveis / focáveis). */}
      <g data-camada="estruturas">
        {FORMAS_EM_ORDEM_DE_DESENHO.map((forma) => {
          const elemento = porSvgPathId.get(forma.svgPathId);

          if (!elemento) {
            return (
              <path
                key={forma.svgPathId}
                id={forma.svgPathId}
                d={forma.d}
                fillRule={forma.regraPreenchimento}
                fill={ESTILO_POR_FAIXA.nao_iniciado.corBase}
                stroke={ESTILO_POR_FAIXA.nao_iniciado.corTraco}
                strokeWidth={1.2}
                data-faixa="sem-elemento"
              />
            );
          }

          const selecionado = elemento.id === elementoSelecionadoId;
          const descricao = descreverElemento(elemento);

          return (
            <g
              key={forma.svgPathId}
              role="button"
              tabIndex={0}
              aria-label={descricao}
              aria-pressed={selecionado}
              data-elemento-id={elemento.id}
              className="cursor-pointer focus:outline-none"
              onClick={() => aoSelecionar(elemento.id)}
              onKeyDown={(evento) => aoTeclar(evento, elemento.id)}
              onFocus={() => setFocadoId(elemento.id)}
              onBlur={() => setFocadoId((atual) => (atual === elemento.id ? null : atual))}
            >
              {/* Tooltip nativo do SVG: nome + % + faixa, também lido por AT. */}
              <title>{descricao}</title>
              <path
                id={forma.svgPathId}
                d={forma.d}
                fillRule={forma.regraPreenchimento}
                fill={preenchimentoDaFaixa(elemento.faixa)}
                stroke={tracoDaFaixa(elemento.faixa)}
                strokeWidth={1.2}
                data-faixa={elemento.faixa}
                data-svg-path-id={forma.svgPathId}
                data-percentual={elemento.percentual}
              />
            </g>
          );
        })}
      </g>

      {/* Camada 2: contexto não interativo (rede de chegada, recalque, portões). */}
      <g data-camada="contexto" pointerEvents="none">
        {TRACOS_CONTEXTO.map((traco, indice) => (
          <path
            key={indice}
            d={traco.d}
            fill={traco.preenchimento ?? 'none'}
            stroke={traco.traco}
            strokeWidth={traco.espessura}
            strokeDasharray={traco.tracejado}
            strokeLinecap="round"
          />
        ))}
        <path
          d={SETA_NORTE}
          fill="none"
          stroke="#6E6455"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      </g>

      {/* Camada 3: destaque de foco/seleção. Traço grosso + tracejado, para não
          depender só de cor (mesma razão das texturas). */}
      <g data-camada="destaque" pointerEvents="none">
        {FORMAS_EM_ORDEM_DE_DESENHO.map((forma) => {
          const elemento = porSvgPathId.get(forma.svgPathId);
          if (!elemento) return null;
          const selecionado = elemento.id === elementoSelecionadoId;
          const focado = elemento.id === focadoId;
          if (!selecionado && !focado) return null;
          return (
            <path
              key={`destaque-${forma.svgPathId}`}
              d={forma.d}
              fill="none"
              stroke={TINTA}
              strokeWidth={selecionado ? 3 : 2.4}
              strokeDasharray={focado && !selecionado ? '5 3' : undefined}
              data-destaque={selecionado ? 'selecionado' : 'focado'}
            />
          );
        })}
      </g>

      {/* Camada 4: rótulos. Halo creme (paint-order) garante leitura sobre
          qualquer uma das três cores de faixa. */}
      <g data-camada="rotulos" pointerEvents="none">
        {FORMAS_EM_ORDEM_DE_DESENHO.map((forma) => {
          const elemento = porSvgPathId.get(forma.svgPathId);
          const linhas = [...forma.linhasRotulo];
          if (elemento) linhas.push(formatarPercentual(elemento.percentual));
          return linhas.map((linha, indice) => (
            <text
              key={`${forma.svgPathId}-${indice}`}
              x={forma.rotulo.x}
              y={forma.rotulo.y + indice * ALTURA_LINHA_ROTULO}
              textAnchor={forma.rotulo.ancora}
              fontSize={FONTE_ROTULO}
              fontFamily="Georgia, serif"
              fill={TINTA}
              stroke={CREME}
              strokeWidth={HALO_ROTULO}
              paintOrder="stroke"
              fontWeight={indice === linhas.length - 1 && elemento ? 700 : 400}
            >
              {linha}
            </text>
          ));
        })}
        {ROTULOS_CONTEXTO.map((rotulo) => (
          <text
            key={rotulo.texto}
            x={rotulo.x}
            y={rotulo.y}
            textAnchor={rotulo.ancora}
            fontSize={rotulo.tamanho}
            fontFamily="Georgia, serif"
            fill="#6E6455"
          >
            {rotulo.texto}
          </text>
        ))}
      </g>
    </svg>
  );
}
