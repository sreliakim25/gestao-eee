/**
 * Checklist técnico pré-concretagem (seção 3 do plano).
 * Somente leitura: a marcação em campo é feita pelo fluxo de lançamento, e um
 * pedido só vira "concretado" com o checklist completo (regra em
 * `lib/concretagem/status.ts`).
 */

import { avaliarChecklist, ITENS_CHECKLIST } from '@/lib/concretagem/checklist';
import type { EstadoChecklist } from '@/lib/concretagem/tipos';

export function ChecklistPreConcretagem({ checklist }: { checklist: EstadoChecklist }) {
  const avaliacao = avaliarChecklist(checklist);

  return (
    <section className="mt-4" aria-label="Checklist pré-concretagem">
      <header className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-[#8B1A1A]">Checklist pré-concretagem</h4>
        <span
          data-teste="checklist-progresso"
          className={[
            'rounded-full px-2 py-0.5 text-xs font-semibold',
            avaliacao.completo ? 'bg-[#8B1A1A] text-[#F0EAD8]' : 'bg-[#E8A020]/25 text-[#7A5410]',
          ].join(' ')}
        >
          {avaliacao.marcadosObrigatorios}/{avaliacao.totalObrigatorios}
          {avaliacao.completo ? ' — completo' : ' — pendente'}
        </span>
      </header>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#8B1A1A]/10">
        <div className="h-full bg-[#E8A020]" style={{ width: `${avaliacao.percentual}%` }} />
      </div>

      <ul className="mt-3 space-y-1.5">
        {ITENS_CHECKLIST.map((item) => {
          const estado = checklist[item.id];
          const marcado = estado?.marcado === true;
          const foraDeFaixa = avaliacao.foraDeFaixa.find((f) => f.item.id === item.id);

          return (
            <li key={item.id} className="flex gap-2 text-sm">
              <span aria-hidden className={marcado ? 'text-[#8B1A1A]' : 'text-[#8B1A1A]/30'}>
                {marcado ? '☑' : '☐'}
              </span>
              <div>
                <p className={marcado ? 'text-[#2B2118]' : 'text-[#2B2118]/70'}>
                  {item.rotulo}
                  {!item.obrigatorio ? (
                    <span className="ml-2 rounded bg-[#8B1A1A]/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                      condicional
                    </span>
                  ) : null}
                  {typeof estado?.valor === 'number' ? (
                    <span className="ml-2 font-semibold">
                      medido: {estado.valor}
                      {item.unidadeValor ? ` ${item.unidadeValor}` : ''}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-[#2B2118]/60">{item.detalhe}</p>
                {foraDeFaixa ? (
                  <p className="mt-1 text-xs font-semibold text-[#8B1A1A]">⛔ {foraDeFaixa.mensagem}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
