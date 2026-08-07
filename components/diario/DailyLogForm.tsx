'use client';

/**
 * Formulário do Diário de Obra (RDO) de um dia.
 *
 * Upsert por (projeto_id, data) — o banco tem UNIQUE nesse par, então reabrir o
 * dia e complementar o relatório é o fluxo normal, não um erro.
 */

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { DiarioObra } from '@/types/database';
import { Alert, Card } from '@/components/ui/primitives';
import { formatarDataBR } from '@/lib/ui/formato';
import {
  OPCOES_CLIMA,
  efetivoParaLinhas,
  equipamentosParaLinhas,
  linhasParaEfetivo,
  linhasParaEquipamentos,
  type LinhaEfetivo,
  type LinhaEquipamento,
} from './dailyLog';

interface DailyLogFormProps {
  projetoId: string;
  data: string;
  registro: DiarioObra | null;
  usuarioId: string;
  podeRegistrar: boolean;
}

const CLASSE_CAMPO =
  'w-full rounded-md border border-borda bg-creme-claro px-3 py-2 text-tinta';

export function DailyLogForm({
  projetoId,
  data,
  registro,
  usuarioId,
  podeRegistrar,
}: DailyLogFormProps) {
  const router = useRouter();

  const [clima, setClima] = useState(registro?.clima ?? '');
  const [efetivo, setEfetivo] = useState<LinhaEfetivo[]>(
    efetivoParaLinhas(registro?.efetivo) ,
  );
  const [equipamentos, setEquipamentos] = useState<LinhaEquipamento[]>(
    equipamentosParaLinhas(registro?.equipamentos),
  );
  const [atividadesExecutadas, setAtividadesExecutadas] = useState(
    registro?.atividades_executadas ?? '',
  );
  const [ocorrencias, setOcorrencias] = useState(registro?.ocorrencias ?? '');
  const [mensagem, setMensagem] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(
    null,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setMensagem(null);
    setErro(null);

    // Validação no cliente: um RDO sem clima e sem atividade não serve de nada.
    if (!clima.trim()) {
      setErro('Informe a condição do tempo do dia.');
      return;
    }
    if (!atividadesExecutadas.trim()) {
      setErro('Descreva as atividades executadas no dia.');
      return;
    }

    setSalvando(true);
    try {
      const { error } = await createClient()
        .from('diario_obra')
        .upsert(
          {
            projeto_id: projetoId,
            data,
            clima: clima.trim(),
            efetivo: linhasParaEfetivo(efetivo),
            equipamentos: linhasParaEquipamentos(equipamentos),
            atividades_executadas: atividadesExecutadas.trim(),
            ocorrencias: ocorrencias.trim() || null,
            autor_id: usuarioId,
          },
          { onConflict: 'projeto_id,data' },
        );

      if (error) {
        setMensagem({
          tom: 'erro',
          texto:
            'Não foi possível salvar o RDO. Se o relatório do dia foi criado por outra pessoa, só gestor ou fiscal pode alterá-lo.',
        });
        return;
      }

      setMensagem({ tom: 'sucesso', texto: `RDO de ${formatarDataBR(data)} salvo.` });
      router.refresh();
    } catch {
      setMensagem({ tom: 'erro', texto: 'Falha de conexão ao salvar o RDO.' });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {mensagem ? (
          <Alert tone={mensagem.tom === 'sucesso' ? 'sucesso' : 'erro'}>
            {mensagem.texto}
          </Alert>
        ) : null}
        {erro ? <Alert tone="erro">{erro}</Alert> : null}
        {!podeRegistrar ? (
          <Alert>Seu perfil não tem permissão para registrar o RDO.</Alert>
        ) : null}

        <div>
          <label htmlFor="clima" className="mb-1 block text-sm font-semibold text-tinta">
            Condição do tempo
          </label>
          <select
            id="clima"
            value={clima}
            onChange={(evento) => setClima(evento.target.value)}
            className={CLASSE_CAMPO}
            required
          >
            <option value="">Selecione…</option>
            {OPCOES_CLIMA.map((opcao) => (
              <option key={opcao} value={opcao}>
                {opcao}
              </option>
            ))}
          </select>
        </div>

        {/* --- Efetivo -------------------------------------------------- */}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-tinta">
            Efetivo do dia (função e quantidade)
          </legend>
          <div className="space-y-2">
            {efetivo.map((linha, indice) => (
              <div key={indice} className="flex gap-2">
                <input
                  aria-label={`Função ${indice + 1}`}
                  value={linha.funcao}
                  onChange={(evento) =>
                    setEfetivo((atual) =>
                      atual.map((item, i) =>
                        i === indice ? { ...item, funcao: evento.target.value } : item,
                      ),
                    )
                  }
                  placeholder="ex.: pedreiro"
                  className={CLASSE_CAMPO}
                />
                <input
                  aria-label={`Quantidade da função ${indice + 1}`}
                  type="number"
                  min={0}
                  value={linha.quantidade}
                  onChange={(evento) =>
                    setEfetivo((atual) =>
                      atual.map((item, i) =>
                        i === indice ? { ...item, quantidade: evento.target.value } : item,
                      ),
                    )
                  }
                  className="w-28 rounded-md border border-borda bg-creme-claro px-3 py-2 text-tinta"
                />
                <button
                  type="button"
                  onClick={() => setEfetivo((atual) => atual.filter((_, i) => i !== indice))}
                  className="rounded-md border border-borda px-3 text-tinta hover:bg-creme"
                  aria-label={`Remover função ${indice + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEfetivo((atual) => [...atual, { funcao: '', quantidade: '' }])}
            className="mt-2 rounded-md border border-borda px-3 py-1.5 text-sm text-tinta hover:bg-creme-claro"
          >
            + Adicionar função
          </button>
        </fieldset>

        {/* --- Equipamentos --------------------------------------------- */}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-tinta">
            Equipamentos mobilizados (nome e horas)
          </legend>
          <div className="space-y-2">
            {equipamentos.map((linha, indice) => (
              <div key={indice} className="flex gap-2">
                <input
                  aria-label={`Equipamento ${indice + 1}`}
                  value={linha.nome}
                  onChange={(evento) =>
                    setEquipamentos((atual) =>
                      atual.map((item, i) =>
                        i === indice ? { ...item, nome: evento.target.value } : item,
                      ),
                    )
                  }
                  placeholder="ex.: escavadeira"
                  className={CLASSE_CAMPO}
                />
                <input
                  aria-label={`Horas do equipamento ${indice + 1}`}
                  type="number"
                  min={0}
                  step="0.5"
                  value={linha.horas}
                  onChange={(evento) =>
                    setEquipamentos((atual) =>
                      atual.map((item, i) =>
                        i === indice ? { ...item, horas: evento.target.value } : item,
                      ),
                    )
                  }
                  className="w-28 rounded-md border border-borda bg-creme-claro px-3 py-2 text-tinta"
                />
                <button
                  type="button"
                  onClick={() =>
                    setEquipamentos((atual) => atual.filter((_, i) => i !== indice))
                  }
                  className="rounded-md border border-borda px-3 text-tinta hover:bg-creme"
                  aria-label={`Remover equipamento ${indice + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEquipamentos((atual) => [...atual, { nome: '', horas: '' }])}
            className="mt-2 rounded-md border border-borda px-3 py-1.5 text-sm text-tinta hover:bg-creme-claro"
          >
            + Adicionar equipamento
          </button>
        </fieldset>

        <div>
          <label
            htmlFor="atividadesExecutadas"
            className="mb-1 block text-sm font-semibold text-tinta"
          >
            Atividades executadas
          </label>
          <textarea
            id="atividadesExecutadas"
            rows={4}
            required
            value={atividadesExecutadas}
            onChange={(evento) => setAtividadesExecutadas(evento.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>

        <div>
          <label
            htmlFor="ocorrencias"
            className="mb-1 block text-sm font-semibold text-tinta"
          >
            Ocorrências (paralisações, acidentes, interferências)
          </label>
          <textarea
            id="ocorrencias"
            rows={3}
            value={ocorrencias}
            onChange={(evento) => setOcorrencias(evento.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>

        <button
          type="submit"
          disabled={salvando || !podeRegistrar}
          className="w-full rounded-md bg-vinho px-4 py-2.5 font-semibold text-creme transition-colors hover:bg-vinho-escuro disabled:opacity-60 sm:w-auto"
        >
          {salvando ? 'Salvando…' : registro ? 'Atualizar RDO' : 'Salvar RDO'}
        </button>
      </form>
    </Card>
  );
}
