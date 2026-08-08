/**
 * /diario/impressao?data=YYYY-MM-DD — versão do RDO pronta para virar PDF.
 *
 * DECISÃO: não geramos o PDF no servidor. Nem `pdfkit`/`puppeteer` (pesados, e
 * o headless Chrome não cabe bem numa function da Vercel) nem `@react-pdf`
 * (obriga a manter um segundo conjunto de componentes, que desincroniza do RDO
 * de tela na primeira mudança). Em vez disso esta rota é uma página A4 com
 * `@page` e regras de impressão, e o PDF sai pelo "Salvar como PDF" do próprio
 * navegador — inclusive no celular, que é onde a equipe de campo está.
 *
 * Contrapartida honesta: o arquivo depende do diálogo de impressão do usuário,
 * então não dá para gerar RDO em lote nem anexar automaticamente a um e-mail.
 * Se isso virar requisito, o caminho é um job separado com Chrome headless —
 * e aí esta página continua sendo o template, sem retrabalho.
 */

import Link from 'next/link';
import { BotaoImprimir } from '@/components/diario/BotaoImprimir';
import {
  equipamentosParaLinhas,
  efetivoParaLinhas,
  totalEfetivo,
} from '@/components/diario/dailyLog';
import { carregarContextoCronograma, carregarDiarioDoDia } from '@/lib/dados/consultas';
import { exigirSessao } from '@/lib/dados/sessao';
import { dataDeHojeISO, formatarDataBR, formatarInteiro } from '@/lib/ui/formato';

export const metadata = {
  title: 'RDO para impressão — EEE Novo Mundo',
};

function normalizarData(valor: string | undefined, hoje: string): string {
  if (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  return hoje;
}

interface Props {
  searchParams: Promise<{ data?: string }>;
}

export default async function ImpressaoRdoPage({ searchParams }: Props) {
  const sessao = await exigirSessao();
  const parametros = await searchParams;

  const hoje = dataDeHojeISO();
  const data = normalizarData(parametros.data, hoje);

  const [{ projeto }, diario] = await Promise.all([
    carregarContextoCronograma(),
    carregarDiarioDoDia(data),
  ]);

  const registro = diario.registro;
  const efetivo = efetivoParaLinhas(registro?.efetivo);
  const equipamentos = equipamentosParaLinhas(registro?.equipamentos);

  return (
    <div className="rdo-impressao mx-auto max-w-[210mm] bg-white p-6 text-[#1A1A1A] print:p-0">
      {/* Barra de ação: some na impressão. */}
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link
          href={`/diario?data=${data}`}
          className="text-sm underline underline-offset-2"
          style={{ color: '#8B1A1A' }}
        >
          ← Voltar ao Diário de Obra
        </Link>
        <BotaoImprimir />
      </div>

      <header className="mb-5 border-b-2 pb-3" style={{ borderColor: '#8B1A1A' }}>
        <h1
          className="text-xl font-bold"
          style={{ color: '#8B1A1A', fontFamily: 'var(--font-titulo, serif)' }}
        >
          Relatório Diário de Obra
        </h1>
        <p className="mt-1 text-sm">
          {projeto?.nome ?? 'EEE Novo Mundo'}
          {projeto?.cliente ? ` · ${projeto.cliente}` : ''}
        </p>
        <p className="mt-0.5 text-sm font-semibold">{formatarDataBR(data)}</p>
      </header>

      {registro === null ? (
        <p className="text-sm italic">
          Não há RDO registrado para {formatarDataBR(data)}.
        </p>
      ) : (
        <>
          <section className="mb-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <h2 className="mb-1 text-xs font-bold uppercase tracking-wide">Clima</h2>
              <p>{registro.clima ?? '—'}</p>
            </div>
            <div>
              <h2 className="mb-1 text-xs font-bold uppercase tracking-wide">Efetivo total</h2>
              <p>{formatarInteiro(totalEfetivo(registro.efetivo))} pessoas</p>
            </div>
          </section>

          <section className="mb-4">
            <h2 className="mb-1 text-xs font-bold uppercase tracking-wide">Efetivo por função</h2>
            {efetivo.length === 0 ? (
              <p className="text-sm italic">Não informado.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: '#C9C2AE' }}>
                    <th className="py-1 text-left font-semibold">Função</th>
                    <th className="py-1 text-right font-semibold">Quantidade</th>
                  </tr>
                </thead>
                <tbody>
                  {efetivo.map((linha) => (
                    <tr key={linha.funcao} className="border-b" style={{ borderColor: '#E5E0D2' }}>
                      <td className="py-1">{linha.funcao}</td>
                      <td className="py-1 text-right tabular-nums">
                        {linha.quantidade || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="mb-4">
            <h2 className="mb-1 text-xs font-bold uppercase tracking-wide">Equipamentos</h2>
            {equipamentos.length === 0 ? (
              <p className="text-sm italic">Não informado.</p>
            ) : (
              <ul className="list-disc pl-5 text-sm">
                {equipamentos.map((linha) => (
                  <li key={linha.nome}>
                    {linha.nome}
                    {linha.horas ? ` — ${linha.horas} h` : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-4 break-inside-avoid">
            <h2 className="mb-1 text-xs font-bold uppercase tracking-wide">
              Atividades executadas
            </h2>
            <p className="whitespace-pre-wrap text-sm">
              {registro.atividades_executadas?.trim() || '—'}
            </p>
          </section>

          <section className="mb-4 break-inside-avoid">
            <h2 className="mb-1 text-xs font-bold uppercase tracking-wide">Ocorrências</h2>
            <p className="whitespace-pre-wrap text-sm">{registro.ocorrencias?.trim() || '—'}</p>
          </section>

          <section className="mb-6">
            <h2 className="mb-1 text-xs font-bold uppercase tracking-wide">
              Registro fotográfico ({diario.fotos.length})
            </h2>
            {diario.fotos.length === 0 ? (
              <p className="text-sm italic">Sem fotos anexadas.</p>
            ) : (
              <ul className="text-sm">
                {diario.fotos.map((foto, indice) => (
                  <li key={foto.id}>
                    {indice + 1}. {foto.legenda?.trim() || 'Sem legenda'}
                  </li>
                ))}
              </ul>
            )}
            {/* As fotos ficam num bucket privado: a URL assinada expira e sairia
                quebrada no PDF. Listamos as legendas e mantemos as imagens no app. */}
            {diario.fotos.length > 0 ? (
              <p className="mt-1 text-xs italic">
                As imagens permanecem no app (bucket privado) — consulte em /diario.
              </p>
            ) : null}
          </section>

          <footer
            className="mt-8 border-t pt-3 text-xs"
            style={{ borderColor: '#C9C2AE' }}
          >
            <div className="grid grid-cols-2 gap-8">
              <div>
                <div className="mb-1 h-10 border-b" style={{ borderColor: '#1A1A1A' }} />
                <p>Responsável pelo registro</p>
                <p className="italic">{sessao.email ?? ''}</p>
              </div>
              <div>
                <div className="mb-1 h-10 border-b" style={{ borderColor: '#1A1A1A' }} />
                <p>Fiscalização</p>
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
