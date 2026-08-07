/**
 * /cronograma — atividades importadas do Smartsheet, com filtros e Gantt.
 *
 * O servidor carrega as 317 atividades uma única vez; filtro, paginação e
 * Gantt acontecem no cliente (ScheduleView). Datas e caminho crítico vêm
 * prontos do banco — este app não recalcula CPM.
 */

import { ScheduleView } from '@/components/cronograma/ScheduleView';
import { Alert, EmptyState, PageHeading } from '@/components/ui/primitives';
import { carregarContextoCronograma } from '@/lib/dados/consultas';
import { exigirSessao } from '@/lib/dados/sessao';
import { dataDeHojeISO, formatarDataBR, formatarInteiro } from '@/lib/ui/formato';

export const metadata = {
  title: 'Cronograma — EEE Novo Mundo',
};

interface CronogramaPageProps {
  searchParams: Promise<{ grupo?: string; elemento?: string; criticas?: string }>;
}

export default async function CronogramaPage({ searchParams }: CronogramaPageProps) {
  await exigirSessao();

  const [{ grupos, elementos, atividades, erro }, parametros] = await Promise.all([
    carregarContextoCronograma(),
    searchParams,
  ]);

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
    </>
  );
}
