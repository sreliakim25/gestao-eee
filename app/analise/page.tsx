/**
 * /analise — resumo automático do estado da obra (Fase 7, opcional).
 *
 * Só aparece para gestor e fiscal: a análise consolida o quadro inteiro da obra,
 * incluindo riscos de prazo, e não é informação de rotina para a equipe de campo.
 */

import { AnaliseIA } from '@/components/analise/AnaliseIA';
import { Alert, EmptyState, PageHeading } from '@/components/ui/primitives';
import { exigirSessao } from '@/lib/dados/sessao';

export const metadata = {
  title: 'Análise IA — EEE Novo Mundo',
};

export default async function AnalisePage() {
  const sessao = await exigirSessao();
  const podeAnalisar = sessao.papel === 'gestor' || sessao.papel === 'fiscal';

  const configurada = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <>
      <PageHeading
        title="Análise IA"
        subtitle="Leitura automática dos indicadores: situação, riscos e recomendações"
      />

      {!podeAnalisar ? (
        <EmptyState
          title="Sem acesso"
          description="A análise consolidada está disponível para os perfis gestor e fiscal."
        />
      ) : !configurada ? (
        <Alert tone="aviso">
          A análise por IA não está configurada neste ambiente. Defina ANTHROPIC_API_KEY no
          servidor (nunca com prefixo NEXT_PUBLIC_) para habilitá-la.
        </Alert>
      ) : (
        <>
          <p className="mb-4 text-sm text-tinta-suave">
            A análise usa exclusivamente os indicadores já calculados em{' '}
            <code>lib/calculos/</code> — ela interpreta os números do Painel, não os recalcula.
          </p>
          <AnaliseIA />
        </>
      )}
    </>
  );
}
