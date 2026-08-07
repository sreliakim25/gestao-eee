/**
 * /lancamento — registro do avanço físico semanal por atividade.
 * Alimenta o realizado da Curva S (tabela `avancos_semanais`).
 */

import { ProductionEntryForm } from '@/components/lancamento/ProductionEntryForm';
import { Alert, Card, EmptyState, PageHeading } from '@/components/ui/primitives';
import { canRegisterProduction } from '@/components/layout/navigation';
import { carregarContextoCronograma, carregarUltimosAvancos } from '@/lib/dados/consultas';
import { exigirSessao } from '@/lib/dados/sessao';
import {
  dataDeHojeISO,
  formatarDataBR,
  formatarPercentual,
} from '@/lib/ui/formato';

export const metadata = {
  title: 'Lançamento de produção — EEE Novo Mundo',
};

export default async function LancamentoPage() {
  const sessao = await exigirSessao();

  const [{ grupos, atividades, erro }, ultimos] = await Promise.all([
    carregarContextoCronograma(),
    carregarUltimosAvancos(15),
  ]);

  const hoje = dataDeHojeISO();
  const nomesAtividades = new Map(atividades.map((a) => [a.id, a.nome]));

  return (
    <>
      <PageHeading
        title="Lançamento de produção"
        subtitle="Avanço acumulado por atividade, fechando a semana no domingo"
      />

      {erro ? (
        <div className="mb-4">
          <Alert tone="erro">{erro}</Alert>
        </div>
      ) : null}

      {atividades.length === 0 ? (
        <EmptyState
          title="Sem atividades para lançar"
          description="Importe o cronograma do Smartsheet antes de registrar produção — o lançamento é sempre vinculado a uma atividade existente."
        />
      ) : (
        <ProductionEntryForm
          atividades={atividades}
          grupos={grupos.map((grupo) => ({ id: grupo.id, nome: grupo.nome }))}
          dataReferencia={hoje}
          usuarioId={sessao.usuarioId}
          podeRegistrar={canRegisterProduction(sessao.papel)}
        />
      )}

      <section aria-labelledby="titulo-historico" className="mt-7">
        <h2 id="titulo-historico" className="mb-3 font-titulo text-xl text-vinho">
          Últimos lançamentos
        </h2>

        {ultimos.length === 0 ? (
          <Card>
            <p className="text-tinta-suave">
              Nenhum avanço registrado ainda. O primeiro lançamento inaugura a curva
              realizada.
            </p>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-borda">
            <table className="w-full border-collapse text-left text-[0.95rem]">
              <caption className="sr-only">
                Últimos avanços semanais registrados
              </caption>
              <thead className="bg-vinho text-creme">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Semana
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Atividade
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Realizado
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Observações
                  </th>
                </tr>
              </thead>
              <tbody>
                {ultimos.map((avanco, indice) => (
                  <tr
                    key={avanco.id}
                    className={indice % 2 === 0 ? 'bg-superficie' : 'bg-creme-claro'}
                  >
                    <td className="numeros-tabulares px-3 py-2 text-tinta">
                      {formatarDataBR(avanco.semana_referencia)}
                    </td>
                    <td className="px-3 py-2 text-tinta">
                      {nomesAtividades.get(avanco.atividade_id) ?? 'Atividade removida'}
                    </td>
                    <td className="numeros-tabulares px-3 py-2 text-right text-tinta">
                      {formatarPercentual(avanco.percentual_realizado_acumulado, 0)}
                    </td>
                    <td className="px-3 py-2 text-tinta-suave">
                      {avanco.observacoes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
