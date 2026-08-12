/**
 * /cronograma — atividades importadas do Smartsheet, com filtros e Gantt.
 *
 * O servidor carrega as 317 atividades uma única vez; filtro, paginação e
 * Gantt acontecem no cliente (ScheduleView). Datas e caminho crítico vêm
 * prontos do banco — este app não recalcula CPM.
 */

import { BotaoSincronizar } from '@/components/cronograma/BotaoSincronizar';
import { HistoricoCronograma } from '@/components/cronograma/HistoricoCronograma';
import { ScheduleView } from '@/components/cronograma/ScheduleView';
import { Alert, EmptyState, PageHeading } from '@/components/ui/primitives';
import { gerarInsights, montarSerieHistorico } from '@/lib/calculos';
import {
  carregarContextoCronograma,
  carregarHistoricoCronograma,
} from '@/lib/dados/consultas';
import { exigirSessao } from '@/lib/dados/sessao';
import { dataDeHojeISO, formatarDataBR, formatarInteiro } from '@/lib/ui/formato';

export const metadata = {
  title: 'Cronograma — EEE Novo Mundo',
};

interface CronogramaPageProps {
  searchParams: Promise<{ grupo?: string; elemento?: string; criticas?: string }>;
}

export default async function CronogramaPage({ searchParams }: CronogramaPageProps) {
  const sessao = await exigirSessao();

  const [{ projeto, grupos, elementos, atividades, erro }, { registros }, parametros] = await Promise.all([
    carregarContextoCronograma(),
    carregarHistoricoCronograma(),
    searchParams,
  ]);

  // Série e leituras vêm do motor de cálculo — a página só entrega à UI.
  const resumoHistorico = montarSerieHistorico(registros);
  const insights = gerarInsights(resumoHistorico);

  const hoje = dataDeHojeISO();

  return (
    <>
      <PageHeading
        title="Cronograma"
        subtitle={
          atividades.length > 0
            ? `${formatarInteiro(atividades.length)} atividades importadas · posição em ${formatarDataBR(hoje)}`
            : 'Fonte da verdade: cronograma mestre do Smartsheet'
        }
      />

      <BotaoSincronizar
        sincronizadoEm={projeto?.smartsheet_sincronizado_em ?? null}
        podeSincronizar={sessao.papel === 'gestor'}
      />

      {erro ? (
        <div className="mb-4">
          <Alert tone="erro">{erro}</Alert>
        </div>
      ) : null}

      {atividades.length === 0 ? (
        <EmptyState
          title="Cronograma ainda não importado"
          description={
            <>
              Exporte o ramo “E.E.E. - NOVO MUNDO” do Smartsheet para{' '}
              <em>Materiais/EEE - Novo Mundo.xlsx</em> e rode{' '}
              <code className="rounded bg-creme px-1">npm run import:cronograma</code>.
            </>
          }
        />
      ) : (
        <ScheduleView
          atividades={atividades}
          grupos={grupos.map((grupo) => ({ id: grupo.id, nome: grupo.nome }))}
          elementos={elementos.map((elemento) => ({
            id: elemento.id,
            nome: elemento.nome,
          }))}
          dataReferencia={hoje}
          filtrosIniciais={{
            grupoMacroId: parametros.grupo ?? '',
            elementoVisualId: parametros.elemento ?? '',
            apenasCriticas: parametros.criticas === '1',
          }}
        />
      )}

      <HistoricoCronograma resumo={resumoHistorico} insights={insights} />
    </>
  );
}
