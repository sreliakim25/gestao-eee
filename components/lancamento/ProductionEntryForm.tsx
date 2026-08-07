'use client';

/**
 * Formulário de lançamento do avanço físico semanal.
 *
 * Grava em `avancos_semanais` com upsert por (atividade_id, semana_referencia):
 * corrigir o número de uma semana já lançada é rotina de obra, e a tabela tem
 * UNIQUE nesse par.
 *
 * Este lançamento alimenta o REALIZADO da Curva S. O `percentual_concluido` de
 * `atividades` continua vindo do Smartsheet (import), para não criar duas
 * fontes de verdade sobre o mesmo número.
 */

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Atividade } from '@/types/database';
import { Alert, Card } from '@/components/ui/primitives';
import { formatarPercentual } from '@/lib/ui/formato';
import {
  VALORES_INICIAIS,
  segundaDaSemanaDe,
  validarLancamento,
  type ProductionEntryField,
  type ProductionEntryValues,
} from './validation';

interface ProductionEntryFormProps {
  atividades: readonly Atividade[];
  grupos: readonly { id: string; nome: string }[];
  /** Data "hoje" (fuso da obra), injetada pelo servidor. */
  dataReferencia: string;
  /** Quem registrou — vai para `registrado_por` (a RLS do perfil campo depende disso). */
  usuarioId: string;
  /** `false` desabilita o envio (perfil sem permissão de escrita). */
  podeRegistrar: boolean;
}

export function ProductionEntryForm({
  atividades,
  grupos,
  dataReferencia,
  usuarioId,
  podeRegistrar,
}: ProductionEntryFormProps) {
  const router = useRouter();
  const semanaAtual = segundaDaSemanaDe(dataReferencia);

  const [grupoSelecionado, setGrupoSelecionado] = useState('');
  const [valores, setValores] = useState<ProductionEntryValues>({
    ...VALORES_INICIAIS,
    semanaReferencia: semanaAtual,
  });
  const [erros, setErros] = useState<Partial<Record<ProductionEntryField, string>>>({});
  const [mensagem, setMensagem] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(
    null,
  );
  const [enviando, setEnviando] = useState(false);

  // Lista de atividades do formulário: filtrar por frente evita um <select> de
  // 317 itens no celular.
  const atividadesDisponiveis = useMemo(
    () =>
      grupoSelecionado
        ? atividades.filter((atividade) => atividade.grupo_macro_id === grupoSelecionado)
        : atividades,
    [atividades, grupoSelecionado],
  );

  const atividadeSelecionada = atividades.find(
    (atividade) => atividade.id === valores.atividadeId,
  );

  function alterar(campo: ProductionEntryField, valor: string) {
    setValores((atual) => ({ ...atual, [campo]: valor }));
    setErros((atual) => ({ ...atual, [campo]: undefined }));
    setMensagem(null);
  }

  async function handleSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setMensagem(null);

    const resultado = validarLancamento(valores);
    setErros(resultado.erros);
    if (!resultado.valido || !resultado.payload) return;

    setEnviando(true);
    try {
      const { error } = await createClient()
        .from('avancos_semanais')
        .upsert(
          { ...resultado.payload, registrado_por: usuarioId },
          { onConflict: 'atividade_id,semana_referencia' },
        );

      if (error) {
        setMensagem({
          tom: 'erro',
          texto:
            'Não foi possível salvar o lançamento. Confirme se o seu perfil tem permissão e tente novamente.',
        });
        return;
      }

      setMensagem({
        tom: 'sucesso',
        texto: 'Avanço registrado. A Curva S já reflete este lançamento.',
      });
      setValores({ ...VALORES_INICIAIS, semanaReferencia: valores.semanaReferencia });
      router.refresh();
    } catch {
      setMensagem({ tom: 'erro', texto: 'Falha de conexão ao salvar o lançamento.' });
    } finally {
      setEnviando(false);
    }
  }

  const classeCampo =
    'w-full rounded-md border border-borda bg-creme-claro px-3 py-2 text-tinta';

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {mensagem ? (
          <Alert tone={mensagem.tom === 'sucesso' ? 'sucesso' : 'erro'}>
            {mensagem.texto}
          </Alert>
        ) : null}

        {!podeRegistrar ? (
          <Alert>
            Seu perfil não tem permissão para registrar avanço. Fale com o gestor da obra.
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="frente" className="mb-1 block text-sm font-semibold text-tinta">
              Frente (filtra a lista)
            </label>
            <select
              id="frente"
              value={grupoSelecionado}
              onChange={(evento) => {
                setGrupoSelecionado(evento.target.value);
                alterar('atividadeId', '');
              }}
              className={classeCampo}
            >
              <option value="">Todas as frentes</option>
              {grupos.map((grupo) => (
                <option key={grupo.id} value={grupo.id}>
                  {grupo.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="semanaReferencia"
              className="mb-1 block text-sm font-semibold text-tinta"
            >
              Semana de referência (segunda-feira)
            </label>
            <input
              id="semanaReferencia"
              type="date"
              required
              value={valores.semanaReferencia}
              onChange={(evento) => alterar('semanaReferencia', evento.target.value)}
              aria-invalid={Boolean(erros.semanaReferencia)}
              aria-describedby={erros.semanaReferencia ? 'erro-semana' : undefined}
              className={classeCampo}
            />
            {erros.semanaReferencia ? (
              <p id="erro-semana" role="alert" className="mt-1 text-sm text-atrasado">
                {erros.semanaReferencia}
              </p>
            ) : (
              <p className="mt-1 text-sm text-tinta-suave">
                A semana fecha no domingo; o registro é o acumulado até lá.
              </p>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="atividadeId"
            className="mb-1 block text-sm font-semibold text-tinta"
          >
            Atividade
          </label>
          <select
            id="atividadeId"
            required
            value={valores.atividadeId}
            onChange={(evento) => alterar('atividadeId', evento.target.value)}
            aria-invalid={Boolean(erros.atividadeId)}
            aria-describedby={erros.atividadeId ? 'erro-atividade' : undefined}
            className={classeCampo}
          >
            <option value="">Selecione a atividade…</option>
            {atividadesDisponiveis.map((atividade) => (
              <option key={atividade.id} value={atividade.id}>
                {atividade.nome}
              </option>
            ))}
          </select>
          {erros.atividadeId ? (
            <p id="erro-atividade" role="alert" className="mt-1 text-sm text-atrasado">
              {erros.atividadeId}
            </p>
          ) : atividadeSelecionada ? (
            <p className="mt-1 text-sm text-tinta-suave">
              Percentual no cronograma importado:{' '}
              {formatarPercentual(atividadeSelecionada.percentual_concluido, 0)}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="percentualRealizado"
              className="mb-1 block text-sm font-semibold text-tinta"
            >
              Realizado acumulado (%)
            </label>
            <input
              id="percentualRealizado"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.1"
              required
              value={valores.percentualRealizado}
              onChange={(evento) => alterar('percentualRealizado', evento.target.value)}
              aria-invalid={Boolean(erros.percentualRealizado)}
              aria-describedby={erros.percentualRealizado ? 'erro-realizado' : undefined}
              className={classeCampo}
            />
            {erros.percentualRealizado ? (
              <p id="erro-realizado" role="alert" className="mt-1 text-sm text-atrasado">
                {erros.percentualRealizado}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="percentualPlanejado"
              className="mb-1 block text-sm font-semibold text-tinta"
            >
              Planejado acumulado (%) — opcional
            </label>
            <input
              id="percentualPlanejado"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.1"
              value={valores.percentualPlanejado}
              onChange={(evento) => alterar('percentualPlanejado', evento.target.value)}
              aria-invalid={Boolean(erros.percentualPlanejado)}
              aria-describedby={erros.percentualPlanejado ? 'erro-planejado' : undefined}
              className={classeCampo}
            />
            {erros.percentualPlanejado ? (
              <p id="erro-planejado" role="alert" className="mt-1 text-sm text-atrasado">
                {erros.percentualPlanejado}
              </p>
            ) : (
              <p className="mt-1 text-sm text-tinta-suave">
                Preencha só se a semana foi repactuada fora das datas do cronograma.
              </p>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="observacoes"
            className="mb-1 block text-sm font-semibold text-tinta"
          >
            Observações
          </label>
          <textarea
            id="observacoes"
            rows={3}
            maxLength={1000}
            value={valores.observacoes}
            onChange={(evento) => alterar('observacoes', evento.target.value)}
            aria-invalid={Boolean(erros.observacoes)}
            className={classeCampo}
          />
          {erros.observacoes ? (
            <p role="alert" className="mt-1 text-sm text-atrasado">
              {erros.observacoes}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={enviando || !podeRegistrar}
          className="w-full rounded-md bg-vinho px-4 py-2.5 font-semibold text-creme transition-colors hover:bg-vinho-escuro disabled:opacity-60 sm:w-auto"
        >
          {enviando ? 'Salvando…' : 'Registrar avanço'}
        </button>
      </form>
    </Card>
  );
}
