/**
 * /curva-s — planejado x realizado acumulado, com os mesmos filtros do Cronograma.
 * Toda a agregação é do motor (`agregarCurvaS`); a página só carrega os dados.
 */

import Link from 'next/link';
import { CurvaSChart } from '@/components/curva-s/CurvaSChart';
import { Alert, EmptyState, PageHeading } from '@/components/ui/primitives';
import { carregarAvancosSemanais, carregarContextoCronograma } from '@/lib/dados/consultas';
import { exigirSessao } from '@/lib/dados/sessao';
import { dataDeHojeISO, formatarDataBR } from '@/lib/ui/formato';

export const metadata = {
  title: 'Curva S — EEE Novo Mundo',
};

export default async function CurvaSPage() {
  await exigirSessao();

  const [contexto, { avancos, erro: erroAvancos }] = await Promise.all([
    carregarContextoCronograma(),
    carregarAvancosSemanais(),
  ]);

  const hoje = dataDeHojeISO();
  const erro = contexto.erro ?? erroAvancos;

  return (
    <>
      <PageHeading
        title="Curva S"
        subtitle={`Acumulado semanal (semana ISO, fechada no domingo) · posição em ${formatarDataBR(hoje)}`}
      />

      {erro ? (
        <div className="mb-4">
          <Alert tone="erro">{erro}</Alert>
        </div>
      ) : null}

      {contexto.atividades.length === 0 ? (
        <EmptyState
          title="Sem cronograma importado"
          description="A curva planejada nasce das datas do Smartsheet. Importe o cronograma para que o gráfico faça sentido."
        />
      ) : (
        <>
          <CurvaSChart
            atividades={contexto.atividades}
            avancos={avancos}
            grupos={contexto.grupos.map((grupo) => ({ id: grupo.id, nome: grupo.nome }))}
            elementos={contexto.elementos.map((elemento) => ({
              id: elemento.id,
              nome: elemento.nome,
            }))}
            dataReferencia={hoje}
          />

          <p className="mt-5 text-sm text-tinta-suave">
            O realizado vem dos lançamentos semanais. Registre o avanço em{' '}
            <Link href="/lancamento" className="text-ouro-escuro underline underline-offset-2">
              Lançamento de produção
            </Link>
            .
          </p>
        </>
      )}
    </>
  );
}
