'use client';

/**
 * Dispara a análise por IA e exibe o resultado.
 *
 * O componente não conhece os dados da obra nem a chave da API: ele só chama
 * `/api/analise-ia`, que carrega os indicadores no servidor. Isso é de propósito
 * — se o client montasse o dossiê, alguém poderia forjar números no corpo do
 * request e receber de volta uma análise com aparência oficial.
 */

import { useState } from 'react';

interface Analise {
  texto: string;
  geradoEm: string;
  dataReferencia: string;
  modelo: string;
  truncado: boolean;
}

export function AnaliseIA() {
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch('/api/analise-ia', { method: 'POST' });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(typeof corpo?.erro === 'string' ? corpo.erro : 'Falha ao gerar a análise.');
        return;
      }
      setAnalise(corpo as Analise);
    } catch {
      setErro('Não foi possível falar com o servidor.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={gerar}
        disabled={carregando}
        className="rounded bg-vinho px-4 py-2 text-sm font-semibold text-creme disabled:opacity-60"
      >
        {carregando ? 'Analisando…' : analise ? 'Gerar nova análise' : 'Gerar análise'}
      </button>

      {erro ? (
        <p role="alert" className="text-sm text-vinho">
          {erro}
        </p>
      ) : null}

      {analise ? (
        <article className="rounded border border-borda bg-white p-4">
          {/* Markdown simples: renderizamos como texto pré-formatado em vez de
              injetar HTML. Conteúdo gerado por modelo não vai para innerHTML. */}
          <pre className="whitespace-pre-wrap font-[inherit] text-sm leading-relaxed">
            {analise.texto}
          </pre>
          <footer className="mt-4 border-t border-borda pt-2 text-xs text-tinta-suave">
            Gerado por {analise.modelo} sobre a posição de {analise.dataReferencia}.
            {analise.truncado ? ' Resposta truncada por limite de tamanho.' : ''} Confira contra o
            Painel antes de decidir — a análise interpreta os indicadores, não os substitui.
          </footer>
        </article>
      ) : null}
    </div>
  );
}
