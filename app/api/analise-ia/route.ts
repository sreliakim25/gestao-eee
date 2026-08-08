/**
 * POST /api/analise-ia — resumo automático do estado da obra.
 *
 * Roda SOMENTE no servidor: a ANTHROPIC_API_KEY nunca chega ao browser (não é
 * `NEXT_PUBLIC_`, e este arquivo é um route handler). O client só recebe o texto.
 *
 * O request não aceita dados do cliente sobre a obra — os indicadores são
 * carregados aqui, do Supabase, sob a sessão do usuário. Isso evita que alguém
 * mande números forjados no corpo e receba de volta uma análise "oficial".
 */

import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { montarIndicadoresPainel } from '@/lib/calculos';
import { carregarContextoCronograma, DATA_FIM_PLANEJADA_PADRAO } from '@/lib/dados/consultas';
import { getUsuarioAtual } from '@/lib/supabase/server';
import { MODELO_ANALISE, SISTEMA_ANALISE, montarDossie } from '@/lib/ia/analise-obra';
import { dataDeHojeISO } from '@/lib/ui/formato';

/** Quantas atividades críticas em aberto entram no dossiê. */
const LIMITE_CRITICAS = 25;

/**
 * Rate limiting simples, em memória do processo. Não substitui um limitador
 * distribuído — em várias instâncias na Vercel cada uma tem seu próprio mapa —
 * mas já impede que um clique repetido queime a cota da API por engano.
 */
const INTERVALO_MINIMO_MS = 30_000;
const ultimaChamadaPorUsuario = new Map<string, number>();

export async function POST() {
  // 1. Autenticação. Sem sessão, nem chega perto da API da Anthropic.
  const usuario = await getUsuarioAtual().catch(() => null);
  if (!usuario) {
    return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  }

  // 2. Rate limiting por usuário.
  const agora = Date.now();
  const ultima = ultimaChamadaPorUsuario.get(usuario.id) ?? 0;
  if (agora - ultima < INTERVALO_MINIMO_MS) {
    const faltam = Math.ceil((INTERVALO_MINIMO_MS - (agora - ultima)) / 1000);
    return NextResponse.json(
      { erro: `Aguarde ${faltam}s antes de gerar outra análise.` },
      { status: 429 },
    );
  }

  // 3. Chave configurada? Falha explícita, sem vazar detalhe de ambiente.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { erro: 'Análise por IA não está configurada neste ambiente.' },
      { status: 503 },
    );
  }

  // 4. Dados da obra, lidos sob a sessão do usuário (RLS aplicada).
  const contexto = await carregarContextoCronograma();
  if (contexto.atividades.length === 0) {
    return NextResponse.json(
      { erro: 'Sem cronograma importado — não há o que analisar.' },
      { status: 422 },
    );
  }

  const hoje = dataDeHojeISO();
  const dataFimPlanejada = contexto.projeto?.data_fim_planejada ?? DATA_FIM_PLANEJADA_PADRAO;

  const indicadores = montarIndicadoresPainel({
    atividades: contexto.atividades,
    dataReferencia: hoje,
    dataFimPlanejada,
  });

  const criticasEmAberto = contexto.atividades
    .filter(
      (atividade) =>
        atividade.caminho_critico && (atividade.percentual_concluido ?? 0) < 100,
    )
    .sort((a, b) =>
      (a.data_fim_planejada ?? '9999-12-31').localeCompare(b.data_fim_planejada ?? '9999-12-31'),
    )
    .slice(0, LIMITE_CRITICAS)
    .map((atividade) => ({
      nome: atividade.nome,
      percentualConcluido: atividade.percentual_concluido,
      dataFimPlanejada: atividade.data_fim_planejada,
    }));

  const dossie = montarDossie({
    indicadores,
    dataReferencia: hoje,
    dataFimPlanejada,
    nomesGrupos: Object.fromEntries(contexto.grupos.map((grupo) => [grupo.id, grupo.nome])),
    nomesElementos: Object.fromEntries(
      contexto.elementos.map((elemento) => [elemento.id, elemento.nome]),
    ),
    criticasEmAberto,
  });

  ultimaChamadaPorUsuario.set(usuario.id, agora);

  // 5. Chamada ao modelo. `max_tokens` cobre raciocínio + texto no Opus 5.
  try {
    const anthropic = new Anthropic();
    const resposta = await anthropic.messages.create({
      model: MODELO_ANALISE,
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      system: SISTEMA_ANALISE,
      messages: [{ role: 'user', content: dossie }],
    });

    // Classificadores podem recusar; `content` vem vazio nesse caso.
    if (resposta.stop_reason === 'refusal') {
      return NextResponse.json(
        { erro: 'O modelo recusou gerar esta análise.' },
        { status: 422 },
      );
    }

    const texto = resposta.content
      .filter((bloco): bloco is Anthropic.TextBlock => bloco.type === 'text')
      .map((bloco) => bloco.text)
      .join('\n')
      .trim();

    if (!texto) {
      return NextResponse.json({ erro: 'A análise voltou vazia.' }, { status: 502 });
    }

    return NextResponse.json({
      texto,
      geradoEm: new Date().toISOString(),
      dataReferencia: hoje,
      modelo: MODELO_ANALISE,
      truncado: resposta.stop_reason === 'max_tokens',
    });
  } catch (erro) {
    // Nunca devolver a mensagem crua: ela pode carregar detalhe da conta/chave.
    console.error('[analise-ia] falha ao chamar a API da Anthropic:', erro);
    const status = erro instanceof Anthropic.RateLimitError ? 429 : 502;
    return NextResponse.json(
      { erro: 'Não foi possível gerar a análise agora. Tente novamente em alguns minutos.' },
      { status },
    );
  }
}
