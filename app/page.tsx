/**
 * / — Painel (dashboard) da obra.
 *
 * REGRA DO PROJETO: nenhum indicador é calculado aqui. Tudo vem de
 * `montarIndicadoresPainel` (@/lib/calculos), que devolve em uma chamada o %
 * geral, a faixa, o status de prazo, as semanas restantes, o resumo e os
 * agregados por grupo macro e por elemento visual.
 */

import Link from 'next/link';
import { montarIndicadoresPainel } from '@/lib/calculos';
import {
  DATA_FIM_PLANEJADA_PADRAO,
  carregarContextoCronograma,
} from '@/lib/dados/consultas';
import { exigirSessao } from '@/lib/dados/sessao';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  MetricCard,
  PageHeading,
  ProgressBar,
} from '@/components/ui/primitives';
import { FrontCard } from '@/components/painel/FrontCard';
import {
  CLASSES_STATUS_PRAZO,
  ROTULOS_STATUS_PRAZO,
  dataDeHojeISO,
  formatarDataBR,
  formatarDesvioPP,
  formatarInteiro,
  formatarPercentual,
  pluralizar,
} from '@/lib/ui/formato';

export const metadata = {
  title: 'Painel — EEE Novo Mundo',
};

export default async function PainelPage() {
  await exigirSessao();

  const { projeto, grupos, atividades, erro } = await carregarContextoCronograma();
  const hoje = dataDeHojeISO();
  const dataFimPlanejada = projeto?.data_fim_planejada ?? DATA_FIM_PLANEJADA_PADRAO;

  const indicadores = montarIndicadoresPainel({
    atividades,
    dataReferencia: hoje,
    dataFimPlanejada,
  });

  const { prazo, resumo } = indicadores;
  const acentoPrazo =
    prazo.status === 'adiantado'
      ? 'adiantado'
      : prazo.status === 'atrasado'
        ? 'atrasado'
        : 'no-prazo';

  return (
    <>
      <PageHeading
        title="Painel da obra"
        subtitle={
          <>
            Posição em {formatarDataBR(hoje)} · fim planejado em{' '}
            {formatarDataBR(dataFimPlanejada)}
          </>
        }
        actions={
          <Badge className={CLASSES_STATUS_PRAZO[prazo.status]}>
            {ROTULOS_STATUS_PRAZO[prazo.status]}
          </Badge>
        }
      />

      {erro ? (
        <div className="mb-4">
          <Alert tone="erro">{erro}</Alert>
        </div>
      ) : null}

      {atividades.length === 0 ? (
        <EmptyState
          title="Nenhuma atividade importada ainda"
          description={
            <>
              O cronograma é a fonte da verdade do Smartsheet e precisa ser importado
              antes de qualquer indicador aparecer. Rode{' '}
              <code className="rounded bg-creme px-1">npm run import:cronograma</code> com
              o arquivo <em>Materiais/EEE - Novo Mundo.xlsx</em> atualizado. Nenhum número
              é estimado nesta tela.
            </>
          }
        />
      ) : (
        <>
          {/* --- Indicadores de topo ------------------------------------- */}
          <section aria-label="Indicadores gerais" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Evolução física"
              value={formatarPercentual(indicadores.percentualEvolucaoGeral)}
              hint="Média ponderada pela duração das atividades"
            >
              <div className="mt-3">
                <ProgressBar
                  percentual={indicadores.percentualEvolucaoGeral}
                  label="Evolução física geral"
                />
              </div>
            </MetricCard>

            <MetricCard
              label="Status de prazo"
              value={ROTULOS_STATUS_PRAZO[prazo.status]}
              accent={acentoPrazo}
              hint={
                <>
                  Realizado {formatarPercentual(prazo.percentualRealizado)} x planejado{' '}
                  {formatarPercentual(prazo.percentualPlanejado)} ·{' '}
                  {formatarDesvioPP(prazo.desvioPontosPercentuais)} (tolerância ±
                  {prazo.toleranciaPontosPercentuais} p.p.)
                </>
              }
            />

            <MetricCard
              label="Prazo restante"
              value={pluralizar(indicadores.semanasRestantes, 'semana', 'semanas')}
              hint={`Até ${formatarDataBR(dataFimPlanejada)}`}
            />

            <MetricCard
              label="Atividades"
              value={formatarInteiro(resumo.total)}
              hint={
                <>
                  {formatarInteiro(resumo.criticas)} no caminho crítico ·{' '}
                  {formatarInteiro(resumo.concluidas)} concluídas ·{' '}
                  {formatarInteiro(resumo.emAndamento)} em andamento
                </>
              }
            />
          </section>

          {/* --- Alertas de qualidade do dado ---------------------------- */}
          {resumo.semDatasPlanejadas > 0 ? (
            <div className="mt-4">
              <Alert>
                {formatarInteiro(resumo.semDatasPlanejadas)} atividade(s) sem datas
                planejadas ficam fora da linha de base — revise o cronograma no Smartsheet
                e reimporte.
              </Alert>
            </div>
          ) : null}

          {/* --- Frentes ------------------------------------------------- */}
          <section aria-labelledby="titulo-frentes" className="mt-7">
            <h2 id="titulo-frentes" className="mb-3 font-titulo text-xl text-vinho">
              Evolução por frente
            </h2>

            {grupos.length === 0 ? (
              <Card>
                <p className="text-tinta-suave">
                  Os grupos macro do WBS ainda não foram semeados no banco.
                </p>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grupos.map((grupo) => (
                  <FrontCard
                    key={grupo.id}
                    nome={grupo.nome}
                    grupoMacroId={grupo.id}
                    agregado={indicadores.porGrupoMacro[grupo.id]}
                  />
                ))}
              </div>
            )}
          </section>

          <p className="mt-6 text-sm text-tinta-suave">
            Detalhamento por atividade no{' '}
            <Link href="/cronograma" className="text-ouro-escuro underline underline-offset-2">
              Cronograma
            </Link>{' '}
            e evolução semanal na{' '}
            <Link href="/curva-s" className="text-ouro-escuro underline underline-offset-2">
              Curva S
            </Link>
            .
          </p>
        </>
      )}
    </>
  );
}
