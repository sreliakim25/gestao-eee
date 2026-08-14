'use client';

/**
 * Botão "Sincronizar com o Smartsheet" + indicador de quão velho está o dado.
 *
 * O indicador existe porque é ele, e não o botão, que resolve a pergunta real
 * de quem abre o app: "o que estou vendo é de hoje?". Sem ele, a pessoa não
 * sabe se precisa clicar — e ficaria clicando por precaução.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  /**
   * Dispositivo (projeto) a sincronizar — `POST /api/sincronizar` exige esse
   * id explicitamente agora que o app é multi-dispositivo. `null` enquanto o
   * chamador não sabe qual é o dispositivo atual (ver `lib/dados/dispositivo.ts`,
   * ainda não existente nesta fase): o botão some.
   */
  projetoId: string | null;
  /** `projetos.smartsheet_sincronizado_em`. */
  sincronizadoEm: string | null;
  /** Só gestor pode disparar; para os demais mostramos apenas a data. */
  podeSincronizar: boolean;
  /** Horas a partir das quais o dado é considerado velho. */
  limiteHoras?: number;
}

/** "há 3 horas" / "há 2 dias" — sem biblioteca de datas para isso. */
function tempoDecorrido(iso: string, agora: Date): { texto: string; horas: number } {
  const ms = agora.getTime() - new Date(iso).getTime();
  const horas = ms / 3_600_000;
  if (horas < 1) {
    const minutos = Math.max(1, Math.round(ms / 60_000));
    return { texto: `há ${minutos} min`, horas };
  }
  if (horas < 24) {
    const h = Math.round(horas);
    return { texto: `há ${h} hora${h === 1 ? '' : 's'}`, horas };
  }
  const dias = Math.round(horas / 24);
  return { texto: `há ${dias} dia${dias === 1 ? '' : 's'}`, horas };
}

export function BotaoSincronizar({ projetoId, sincronizadoEm, podeSincronizar, limiteHoras = 24 }: Props) {
  const router = useRouter();
  const [estado, setEstado] = useState<'ocioso' | 'sincronizando'>('ocioso');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const decorrido = sincronizadoEm ? tempoDecorrido(sincronizadoEm, new Date()) : null;
  const desatualizado = decorrido !== null && decorrido.horas >= limiteHoras;

  async function sincronizar() {
    if (!projetoId) {
      setErro('Dispositivo não identificado — não é possível sincronizar.');
      return;
    }
    setEstado('sincronizando');
    setErro(null);
    setMensagem(null);
    try {
      const resposta = await fetch('/api/sincronizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projetoId }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(typeof corpo?.erro === 'string' ? corpo.erro : 'Falha ao sincronizar.');
        return;
      }
      const r = corpo.resultado;
      setMensagem(
        `${r.atividades} atividades · ${r.percentualSmartsheet ?? '—'}% · término ${r.dataFimPlanejada ?? '—'}` +
          (r.orfas?.length ? ` · ${r.orfas.length} órfã(s)` : ''),
      );
      // Recarrega os dados do servidor sem perder a posição da página.
      router.refresh();
    } catch {
      setErro('Não foi possível falar com o servidor.');
    } finally {
      setEstado('ocioso');
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      {podeSincronizar && projetoId ? (
        <button
          type="button"
          onClick={sincronizar}
          disabled={estado === 'sincronizando'}
          className="rounded bg-vinho px-3 py-1.5 text-sm font-semibold text-creme disabled:opacity-60"
        >
          {estado === 'sincronizando' ? 'Sincronizando…' : 'Sincronizar com o Smartsheet'}
        </button>
      ) : null}

      <p className="text-xs text-tinta-suave">
        {decorrido === null ? (
          'Cronograma ainda não sincronizado pela API.'
        ) : (
          <>
            Última sincronização{' '}
            <span className={desatualizado ? 'font-semibold text-vinho' : undefined}>
              {decorrido.texto}
            </span>
            {desatualizado ? ' — pode estar desatualizado.' : '.'}
          </>
        )}
      </p>

      {mensagem ? (
        <p role="status" className="text-xs text-tinta-suave">
          Atualizado: {mensagem}
        </p>
      ) : null}
      {erro ? (
        <p role="alert" className="text-xs font-semibold text-vinho">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
