/**
 * /ugbs — primeira tela pós-login: escolha da UGB (Unidade de Gestão de Bacia).
 *
 * Passo 1 da navegação UGB → dispositivo → módulos (Fase 2 do plano
 * multi-dispositivo). Não escopa nenhum dado de módulo aqui — só lista as
 * UGBs e quantos dispositivos (`projetos`) cada uma tem hoje.
 */

import { UgbGrid } from '@/components/ugbs/UgbGrid';
import { carregarUgbsComContagem } from '@/lib/dados/ugbs';
import { exigirSessao } from '@/lib/dados/sessao';
import { Alert, PageHeading } from '@/components/ui/primitives';

export const metadata = {
  title: 'Escolha a UGB — Viana & Moura',
};

export default async function UgbsPage() {
  await exigirSessao();

  const { ugbs, erro } = await carregarUgbsComContagem();

  return (
    <>
      <PageHeading
        title="Unidades de Gestão de Bacia"
        subtitle="Escolha a UGB para ver os dispositivos acompanhados nela."
      />

      {erro ? (
        <div className="mb-4">
          <Alert tone="erro">{erro}</Alert>
        </div>
      ) : null}

      {ugbs.length === 0 ? <Alert>Nenhuma UGB cadastrada ainda.</Alert> : <UgbGrid ugbs={ugbs} />}
    </>
  );
}
