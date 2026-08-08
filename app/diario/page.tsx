/**
 * /diario — Relatório Diário de Obra (RDO), navegável por data.
 * A data fica na querystring (`?data=YYYY-MM-DD`); sem parâmetro, abre hoje.
 */

import Link from 'next/link';
import { DailyLogForm } from '@/components/diario/DailyLogForm';
import { DateNavigator } from '@/components/diario/DateNavigator';
import { PhotoGallery } from '@/components/diario/PhotoGallery';
import { totalEfetivo } from '@/components/diario/dailyLog';
import { canRegisterProduction } from '@/components/layout/navigation';
import { Alert, Card, EmptyState, PageHeading } from '@/components/ui/primitives';
import { carregarContextoCronograma, carregarDiarioDoDia } from '@/lib/dados/consultas';
import { exigirSessao } from '@/lib/dados/sessao';
import { dataDeHojeISO, formatarDataBR, formatarInteiro } from '@/lib/ui/formato';

export const metadata = {
  title: 'Diário de Obra — EEE Novo Mundo',
};

/** Aceita só 'YYYY-MM-DD'; qualquer outra coisa cai para hoje. */
function normalizarData(valor: string | undefined, hoje: string): string {
  if (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  return hoje;
}

interface DiarioPageProps {
  searchParams: Promise<{ data?: string }>;
}

export default async function DiarioPage({ searchParams }: DiarioPageProps) {
  const sessao = await exigirSessao();
  const parametros = await searchParams;

  const hoje = dataDeHojeISO();
  const data = normalizarData(parametros.data, hoje);

  const [{ projeto, erro: erroContexto }, diario] = await Promise.all([
    carregarContextoCronograma(),
    carregarDiarioDoDia(data),
  ]);

  const podeRegistrar = canRegisterProduction(sessao.papel);
  const erro = erroContexto ?? diario.erro;

  return (
    <>
      <PageHeading
        title="Diário de Obra"
        subtitle={`RDO de ${formatarDataBR(data)}`}
      />

      {erro ? (
        <div className="mb-4">
          <Alert tone="erro">{erro}</Alert>
        </div>
      ) : null}

      <DateNavigator data={data} hoje={hoje} datasComRegistro={diario.datasComRegistro} />

      {diario.registro ? (
        <p className="mb-4 text-sm">
          <Link
            href={`/diario/impressao?data=${data}`}
            className="text-ouro-escuro underline underline-offset-2"
          >
            Exportar este RDO em PDF
          </Link>
        </p>
      ) : null}

      {!projeto ? (
        <EmptyState
          title="Projeto não encontrado no banco"
          description="Rode o seed do Supabase (supabase/seed.sql) para criar o projeto E.E.E. - NOVO MUNDO antes de registrar RDOs."
        />
      ) : (
        <div className="space-y-5">
          {diario.registro ? (
            <Card>
              <p className="text-sm text-tinta-suave">
                RDO registrado · efetivo total do dia:{' '}
                <strong className="text-tinta">
                  {formatarInteiro(totalEfetivo(diario.registro.efetivo))}
                </strong>{' '}
                pessoa(s)
              </p>
            </Card>
          ) : null}

          <DailyLogForm
            projetoId={projeto.id}
            data={data}
            registro={diario.registro}
            usuarioId={sessao.usuarioId}
            podeRegistrar={podeRegistrar}
          />

          <PhotoGallery
            projetoId={projeto.id}
            data={data}
            diarioObraId={diario.registro?.id ?? null}
            fotos={diario.fotos}
            usuarioId={sessao.usuarioId}
            podeEnviar={podeRegistrar}
          />
        </div>
      )}
    </>
  );
}
