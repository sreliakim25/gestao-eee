'use client';

/**
 * Navegação por data do Diário de Obra.
 *
 * A data vive na URL (`/diario?data=YYYY-MM-DD`), então o histórico do
 * navegador e o compartilhamento de link funcionam de graça. A aritmética de
 * datas é a do motor (UTC), para não pular um dia conforme o fuso do aparelho.
 */

import { useRouter } from 'next/navigation';
import { adicionarDias, formatarDataISO, paraDataUTC } from '@/lib/calculos';
import { formatarDataBR } from '@/lib/ui/formato';

interface DateNavigatorProps {
  data: string;
  /** Hoje no fuso da obra — limita a navegação para o futuro. */
  hoje: string;
  /** Datas que já possuem RDO, para sinalizar o dia atual. */
  datasComRegistro: readonly string[];
}

export function DateNavigator({ data, hoje, datasComRegistro }: DateNavigatorProps) {
  const router = useRouter();

  function irPara(novaData: string) {
    if (!novaData) return;
    router.push(`/diario?data=${novaData}`);
  }

  function deslocar(dias: number) {
    const referencia = paraDataUTC(data);
    if (!referencia) return;
    irPara(formatarDataISO(adicionarDias(referencia, dias)));
  }

  const temRegistro = datasComRegistro.includes(data);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-borda bg-superficie p-3">
      <button
        type="button"
        onClick={() => deslocar(-1)}
        className="rounded-md border border-borda px-3 py-1.5 text-tinta hover:bg-creme-claro"
        aria-label="Dia anterior"
      >
        ← Anterior
      </button>

      <label htmlFor="data-rdo" className="sr-only">
        Data do relatório
      </label>
      <input
        id="data-rdo"
        type="date"
        value={data}
        max={hoje}
        onChange={(evento) => irPara(evento.target.value)}
        className="rounded-md border border-borda bg-creme-claro px-3 py-1.5 text-tinta"
      />

      <button
        type="button"
        onClick={() => deslocar(1)}
        disabled={data >= hoje}
        className="rounded-md border border-borda px-3 py-1.5 text-tinta hover:bg-creme-claro disabled:opacity-50"
        aria-label="Próximo dia"
      >
        Próximo →
      </button>

      <button
        type="button"
        onClick={() => irPara(hoje)}
        className="rounded-md border border-borda px-3 py-1.5 text-tinta hover:bg-creme-claro"
      >
        Hoje
      </button>

      <span className="ml-auto text-sm text-tinta-suave">
        {formatarDataBR(data)} · {temRegistro ? 'RDO registrado' : 'sem RDO neste dia'}
      </span>
    </div>
  );
}
