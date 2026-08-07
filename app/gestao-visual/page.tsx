/**
 * /gestao-visual — planta esquemática da elevatória colorida por % concluído.
 *
 * A página só carrega dados e entrega ao módulo. Quem resolve percentual e
 * faixa é `lib/calculos` (via `montarElementosRenderizaveis`); quem desenha é
 * o renderizador injetável definido em `components/gestao-visual/tipos.ts` —
 * hoje SVG, amanhã um viewer IFC, sem mudança nesta rota.
 */

import { GestaoVisual } from '@/components/gestao-visual';
import { Alert, EmptyState, PageHeading } from '@/components/ui/primitives';
import { carregarContextoCronograma } from '@/lib/dados/consultas';
import { exigirSessao } from '@/lib/dados/sessao';

export const metadata = {
  title: 'Gestão Visual — EEE Novo Mundo',
};

export default async function GestaoVisualPage() {
  await exigirSessao();

  const contexto = await carregarContextoCronograma();

  return (
    <>
      <PageHeading
        title="Gestão Visual"
        subtitle="Planta esquemática dentro do muro perimetral · clique num elemento para ver as atividades"
      />

      {contexto.erro ? (
        <div className="mb-4">
          <Alert tone="erro">{contexto.erro}</Alert>
        </div>
      ) : null}

      {contexto.elementos.length === 0 ? (
        <EmptyState
          title="Sem elementos visuais cadastrados"
          description="Os elementos da elevatória vêm do seed do banco. Aplique as migrations e o seed para que a planta apareça."
        />
      ) : (
        <GestaoVisual elementos={contexto.elementos} atividades={contexto.atividades} />
      )}
    </>
  );
}
