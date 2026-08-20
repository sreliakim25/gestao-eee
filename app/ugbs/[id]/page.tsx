/**
 * /ugbs/[id] — passo 2 da navegação: escolha do dispositivo dentro da UGB.
 *
 * Hoje só existe um dispositivo real no banco (E.E.E. Novo Mundo, na UGB
 * Caruaru) e ele continua morando nas rotas de módulo atuais (`/`,
 * `/cronograma`, ...) — o link daqui aponta para o Painel de hoje. Nenhum
 * dispositivo é inventado para UGBs que ainda não têm nenhum cadastrado: a
 * regra 2 do plano multi-dispositivo proíbe simular dado.
 */

import { notFound } from 'next/navigation';
import { DispositivoGrid } from '@/components/ugbs/DispositivoGrid';
import { carregarUgbComDispositivos } from '@/lib/dados/ugbs';
import { exigirSessao } from '@/lib/dados/sessao';
import { Alert, PageHeading } from '@/components/ui/primitives';

interface UgbPageProps {
  params: Promise<{ id: string }>;
}

export default async function UgbPage({ params }: UgbPageProps) {
  await exigirSessao();

  const { id } = await params;
  const { ugb, projetos, erro } = await carregarUgbComDispositivos(id);

  // Query sem erro e sem linha: a UGB não existe mesmo. Erro de leitura
  // (Supabase fora, RLS) é tratado abaixo com um alerta, não com 404 — a UGB
  // pode existir, só não conseguimos confirmar agora.
  if (!ugb && !erro) {
    notFound();
  }

  return (
    <>
      <PageHeading
        title={ugb ? ugb.nome : 'UGB'}
        subtitle="Escolha o dispositivo para abrir o Painel dele."
      />

      {erro ? (
        <div className="mb-4">
          <Alert tone="erro">{erro}</Alert>
        </div>
      ) : null}

      {ugb ? <DispositivoGrid projetos={projetos} /> : null}
    </>
  );
}
