/**
 * Interpretação do cronograma do Smartsheet → estrutura tipada.
 *
 * Este arquivo é PURO: reconstrói o WBS, filtra escopo e normaliza tipos, sem
 * tocar em disco nem em rede. Quem entrega as células cruas são dois
 * fornecedores diferentes, e as regras abaixo valem igual para os dois:
 *   - `scripts/import/xlsx.ts`          — lê o arquivo exportado (usa exceljs);
 *   - `scripts/import/smartsheet-api.ts` — lê a API.
 *
 * A pureza não é preferência de estilo: a rota de sincronização do app importa
 * este módulo, e um `import` de exceljs aqui arrastaria uma biblioteca de
 * planilha de vários megabytes para dentro do servidor Next só para interpretar
 * linhas que vieram da API.
 *
 * Sobre a leitura de arquivo: usar `exceljs`, nunca o pacote `xlsx` da npm
 * (CVEs conhecidos, sem correção).
 */

import { normalizarTexto } from './mapeamento-elementos';
import type {
  AtividadeParseada,
  ColunaSmartsheet,
  GrupoParseado,
  InferirElementoVisualFn,
  LinhaBruta,
  ResultadoParse,
} from './tipos';

/* -------------------------------------------------------------------------- */
/* Constantes de escopo e nomenclatura                                        */
/* -------------------------------------------------------------------------- */

/**
 * Nome da linha raiz do ÚNICO ramo que entra no banco para a EEE Novo Mundo.
 * Tudo o que estiver fora deste ramo (Engenharia de Produto, Engenharia de
 * Custos, Suprimentos EC, Sustentabilidade/Legalização, e o marco corporativo
 * "MARCOS CONDICIONANTES PARA INÍCIO DA EXECUÇÃO") é descartado — regra 3 do
 * CLAUDE.md e seção 1 do plano de execução.
 *
 * MULTI-DISPOSITIVO: este valor só é usado quando `interpretarLinhas` recebe
 * `opcoes.nomeRaizEscopo` explicitamente — é o caso da Novo Mundo, cuja
 * planilha é comprovadamente um macro-cronograma corporativo com mais de um
 * ramo (ver `lib/smartsheet/config-dispositivos.ts`). Os demais dispositivos
 * da UDE têm planilha dedicada e não passam essa opção — `interpretarLinhas`
 * importa a planilha inteira sem podar ramo nenhum.
 */
export const NOME_RAIZ_ESCOPO = 'E.E.E. - NOVO MUNDO';

/** Separador dos segmentos em `atividades.caminho_wbs`. Ver CHAVE_UPSERT. */
export const SEPARADOR_CAMINHO_WBS = ' > ';

/**
 * CHAVE_UPSERT — decisão frágil, documentada de propósito.
 *
 * O export do Smartsheet não traz ID externo estável por linha. As chaves do
 * banco (migration `20260805120900_atividades_caminho_wbs.sql`) são:
 *
 *   grupos_macro  UNIQUE (projeto_id, nome_smartsheet)
 *   atividades    UNIQUE (grupo_macro_id, caminho_wbs)
 *
 * Por que NÃO dá para usar o nome curto da atividade: medição no arquivo de
 * 05/08/2026 — as 310 atividades do ramo colapsam em 159 chaves. Só dentro de
 * CIVIL, "Concretagem" aparece 35x, "Formas" 27x e "Ferragem" 25x. Com a chave
 * antiga o import perdia 151 linhas em silêncio.
 *
 * O caminho WBS completo dentro do grupo macro é único em 310/310 linhas.
 * `atividades.nome` volta a ser só o nome curto — é o que a UI exibe, e não
 * tem (nem precisa de) unicidade.
 *
 * Por que os grupos casam por `nome_smartsheet` e não por `nome`: o .xlsx traz
 * "SERVIÇOS PRELIMINARES" / "DRENAGEM - Canal e muro", enquanto a UI mostra
 * "Serviços Preliminares" / "Drenagem — Canal e muro". A correspondência é
 * DADO no seed, não um mapa de tradução dentro deste script.
 *
 * Consequência conhecida (aceita, mas precisa de olho): renomear QUALQUER nó
 * ancestral no Smartsheet muda o caminho de todos os descendentes → eles entram
 * como linhas novas e as antigas viram órfãs. Isso é intencional: o script
 * reporta em destaque e exige `--prune` explícito, nunca apaga sozinho.
 */
export const CHAVE_UPSERT =
  'grupos_macro(projeto_id, nome_smartsheet) + atividades(grupo_macro_id, caminho_wbs)';

/**
 * Cabeçalhos esperados do export, mapeados para as chaves internas.
 * A leitura é feita POR NOME de cabeçalho e não por posição fixa, para
 * sobreviver a uma reordenação de colunas no Smartsheet.
 */
export const CABECALHOS: Record<string, ColunaSmartsheet> = {
  'nivel de hierarquia': 'nivel',
  predecessores: 'predecessores',
  '% concluida': 'percentualConcluida',
  atividade: 'atividade',
  duracao: 'duracao',
  iniciar: 'iniciar',
  terminar: 'terminar',
  'esta em caminho critico?': 'caminhoCritico',
  'indicador de prazo de entrega': 'indicadorPrazo',
  folga: 'folga',
  'ha pulmao?': 'haPulmao',
  sucessoras: 'sucessoras',
  recurso: 'recurso',
};

/** Colunas sem as quais o parse não faz sentido. */
export const COLUNAS_OBRIGATORIAS: ColunaSmartsheet[] = ['nivel', 'atividade'];

/* -------------------------------------------------------------------------- */
/* Camada 1 — leitura do arquivo                                              */
/* -------------------------------------------------------------------------- */


/* -------------------------------------------------------------------------- */
/* Normalizadores de valor (puros, testáveis um a um)                         */
/* -------------------------------------------------------------------------- */

/** Texto limpo ou null (célula vazia / só espaços vira null). */
export function paraTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto === '' ? null : texto;
}

/** Número tolerante a vírgula decimal (pt-BR) e a sufixos. */
/**
 * Maior folga plausível num cronograma de obra, em dias. Serve de peneira
 * contra o valor-sentinela do Smartsheet.
 *
 * A API devolve `-922337203.685478` na coluna Folga de algumas linhas — é
 * `int64` mínimo dividido por 10^10, o jeito do Smartsheet dizer "folga não
 * aplicável". O .xlsx exportado não traz isso, então o problema só apareceu ao
 * ligar o sync pela API: o valor estoura `numeric(8,2)` e derruba o lote
 * inteiro do upsert com "numeric field overflow".
 */
export const LIMITE_FOLGA_DIAS = 100_000;

/**
 * Folga em dias, com sentinela do Smartsheet convertido em `null`.
 * `null` aqui significa "não informada", que é exatamente o que a sentinela
 * quer dizer — melhor do que gravar um número absurdo ou zero (que seria lido
 * como "está no limite do prazo").
 */
export function paraFolgaDias(valor: unknown): number | null {
  const numero = paraNumero(valor);
  if (numero === null) return null;
  if (!Number.isFinite(numero) || Math.abs(numero) > LIMITE_FOLGA_DIAS) return null;
  return numero;
}

export function paraNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const limpo = String(valor).replace(',', '.').trim();
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/**
 * Duração: o Smartsheet exporta texto tipo "15d", "55,5d", "0,5d", "0" ou vazio.
 * Devolve dias como número, ou null quando não há duração informada.
 */
export function paraDuracaoDias(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const texto = String(valor).trim();
  if (texto === '') return null;
  const casamento = texto.replace(',', '.').match(/^(-?\d+(?:\.\d+)?)\s*d?$/i);
  if (!casamento) return null;
  const n = Number(casamento[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * "% Concluída": o Smartsheet exporta FRAÇÃO (0.42 = 42%, 1 = 100%).
 * Devolve 0–100. Célula vazia vira null (o chamador decide o default 0).
 * Se vier um valor > 1, assume-se que já está em pontos percentuais e o
 * chamador é avisado — não silenciar uma mudança de formato do export.
 */
export function paraPercentual(valor: unknown): { percentual: number | null; suspeito: boolean } {
  const n = paraNumero(valor);
  if (n === null) return { percentual: null, suspeito: false };
  if (n < 0) return { percentual: 0, suspeito: true };
  if (n <= 1) return { percentual: Math.round(n * 1000) / 10, suspeito: false };
  if (n <= 100) return { percentual: Math.round(n * 10) / 10, suspeito: true };
  return { percentual: 100, suspeito: true };
}

/**
 * Data → ISO `yyyy-mm-dd`. O exceljs devolve `Date` em meia-noite UTC para
 * células de data, por isso a extração usa os getters UTC (usar os locais
 * jogaria a data um dia para trás em fusos negativos, como o de Recife).
 * Também aceita o texto "dd/MM/yy" ou "dd/MM/yyyy" por segurança.
 */
export function paraDataIso(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    const ano = valor.getUTCFullYear();
    const mes = String(valor.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(valor.getUTCDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }
  const texto = String(valor).trim();
  const brasileira = texto.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (brasileira) {
    const [, dia, mes, anoTexto] = brasileira;
    const ano = anoTexto.length === 2 ? `20${anoTexto}` : anoTexto;
    return `${ano}-${mes}-${dia}`;
  }
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

/** Caminho crítico: o export traz `true` booleano; aceita "Sim"/"Yes"/"1" também. */
export function paraBooleano(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return valor !== 0;
  const texto = normalizarTexto(String(valor));
  return texto === 'true' || texto === 'sim' || texto === 'yes' || texto === '1';
}

/* -------------------------------------------------------------------------- */
/* Camada 2 — interpretação (pura)                                            */
/* -------------------------------------------------------------------------- */

/** Confere se uma linha é a raiz de um ramo de escopo com o nome dado. */
function ehRaizDoEscopo(nome: string, nomeRaizEscopo: string): boolean {
  return normalizarTexto(nome) === normalizarTexto(nomeRaizEscopo);
}

/** Função padrão de vínculo com elemento visual: nunca vincula. */
const inferirElementoVisualPadrao: InferirElementoVisualFn = () => null;

/**
 * Opções de `interpretarLinhas` — controlam o comportamento por dispositivo.
 * Quem escolhe os valores é `lib/smartsheet/config-dispositivos.ts`, nunca o
 * parser: este módulo continua puro e sem conhecimento de qual dispositivo
 * está sendo importado.
 */
export interface OpcoesInterpretacao {
  /**
   * Nome da linha raiz do único ramo em escopo, quando a planilha é um
   * macro-cronograma corporativo com mais de um ramo (caso comprovado da EEE
   * Novo Mundo — ver `NOME_RAIZ_ESCOPO`). Quando OMITIDO, a planilha inteira
   * é importada sem podar ramo nenhum — caso da maioria dos dispositivos da
   * UDE, cuja planilha já é dedicada.
   */
  nomeRaizEscopo?: string;
  /**
   * Regra de vínculo atividade → elemento visual. Quando OMITIDA, usa o
   * default que sempre devolve `null` — um dispositivo sem mapeamento próprio
   * de elemento visual importa normalmente, só com `elemento_visual_id = null`
   * em todas as atividades. NUNCA trava o import por falta de regra.
   */
  inferirElementoVisual?: InferirElementoVisualFn;
}

/**
 * Reconstrói o WBS a partir da coluna "Nível de hierarquia" e devolve grupos
 * macro + atividades já tipados.
 *
 * Sem `opcoes.nomeRaizEscopo`, a planilha inteira vira o "ramo": os nós de
 * nível mais alto (o menor valor de "Nível de hierarquia" presente) viram
 * grupos macro diretamente, sem procurar nem exigir uma linha-raiz específica.
 * Com `opcoes.nomeRaizEscopo`, mantém o comportamento original: procura a
 * linha com esse nome, recorta só os descendentes dela e lança erro se não
 * achar (ver `CHAVE_UPSERT` acima para o porquê de nunca importar o
 * macro-cronograma inteiro em silêncio).
 */
export function interpretarLinhas(
  linhas: readonly LinhaBruta[],
  opcoes: OpcoesInterpretacao = {},
): ResultadoParse {
  const avisos: string[] = [];
  const inferirElemento = opcoes.inferirElementoVisual ?? inferirElementoVisualPadrao;

  // Pré-processa: nível + nome de cada linha, separando as vazias.
  const preparadas = linhas.map((linha) => ({
    linha,
    nivel: paraNumero(linha.celulas.nivel),
    nome: paraTexto(linha.celulas.atividade),
  }));

  const linhasVaziasIgnoradas = preparadas.filter((p) => p.nome === null).length;
  const comConteudo = preparadas.filter(
    (p): p is { linha: LinhaBruta; nivel: number; nome: string } =>
      p.nome !== null && p.nivel !== null,
  );

  const semNivel = preparadas.filter((p) => p.nome !== null && p.nivel === null);
  if (semNivel.length > 0) {
    avisos.push(
      `${semNivel.length} linha(s) com nome mas sem "Nível de hierarquia" foram descartadas ` +
        `(linhas ${semNivel.map((p) => p.linha.linhaPlanilha).slice(0, 5).join(', ')}...).`,
    );
  }

  type LinhaPreparada = { linha: LinhaBruta; nivel: number; nome: string };

  let ramo: LinhaPreparada[];
  let raizPreparada: LinhaPreparada | null;
  let nivelBase: number;
  let linhasForaDeEscopo: number;

  if (opcoes.nomeRaizEscopo) {
    const nomeRaizEscopo = opcoes.nomeRaizEscopo;

    // Localiza a raiz do escopo.
    const indiceRaiz = comConteudo.findIndex((p) => ehRaizDoEscopo(p.nome, nomeRaizEscopo));
    if (indiceRaiz === -1) {
      throw new Error(
        `Ramo "${nomeRaizEscopo}" não encontrado na planilha. ` +
          `O import é abortado de propósito: sem esse ramo não há o que importar, ` +
          `e importar o macro-cronograma corporativo inteiro violaria o escopo do app.`,
      );
    }

    raizPreparada = comConteudo[indiceRaiz];
    nivelBase = raizPreparada.nivel;

    // O ramo vai da raiz até a próxima linha de nível <= nível da raiz.
    let fimDoRamo = comConteudo.length;
    for (let i = indiceRaiz + 1; i < comConteudo.length; i++) {
      if (comConteudo[i].nivel <= nivelBase) {
        fimDoRamo = i;
        break;
      }
    }
    ramo = comConteudo.slice(indiceRaiz + 1, fimDoRamo);

    // Tudo que não é a raiz nem descendente dela está fora de escopo.
    linhasForaDeEscopo = comConteudo.length - ramo.length - 1;
  } else {
    // Sem raiz de escopo: a planilha inteira entra, sem poda de ramo. Os nós
    // do nível mais alto presente (normalmente 0 ou 1) viram grupos macro
    // diretamente — não há linha-raiz física a descartar nem a validar.
    raizPreparada = null;
    ramo = comConteudo;
    linhasForaDeEscopo = 0;
    nivelBase = comConteudo.length > 0 ? Math.min(...comConteudo.map((p) => p.nivel)) - 1 : 0;
  }

  // Percorre o ramo mantendo a pilha de ancestrais para montar o caminho WBS.
  const grupos: GrupoParseado[] = [];
  const atividades: AtividadeParseada[] = [];
  const pilhaCaminho: string[] = [];
  let grupoAtual: GrupoParseado | null = null;

  ramo.forEach((atual, indice) => {
    const proxima = ramo[indice + 1];
    const ehFolha = !proxima || proxima.nivel <= atual.nivel;
    const nivelRelativo = atual.nivel - nivelBase; // 1 = grupo macro

    if (nivelRelativo === 1) {
      // Nível 1 do ramo → grupo macro. A string crua do .xlsx é a chave
      // (`grupos_macro.nome_smartsheet`); o rótulo legível vem do banco.
      const { percentual, suspeito } = paraPercentual(atual.linha.celulas.percentualConcluida);
      if (suspeito) {
        avisos.push(
          `"% Concluída" fora do intervalo 0–1 na linha ${atual.linha.linhaPlanilha} — ` +
            `o Smartsheet pode ter mudado o formato de exportação.`,
        );
      }
      grupoAtual = {
        nomeSmartsheet: atual.nome,
        // Fallback só vale se o grupo ainda não existir no banco; se existir,
        // o rótulo do seed é preservado (ver montarPayloadGrupos).
        nomeFallback: atual.nome,
        ordem: grupos.length + 1, // ordem de aparição no .xlsx
        linhaPlanilha: atual.linha.linhaPlanilha,
        percentualConcluido: percentual,
      };
      grupos.push(grupoAtual);
      pilhaCaminho.length = 0;
      return;
    }

    if (nivelRelativo < 1) return; // defensivo: não deveria acontecer

    if (!grupoAtual) {
      avisos.push(
        `Linha ${atual.linha.linhaPlanilha} ("${atual.nome}") aparece antes de qualquer grupo ` +
          `macro de nível 1 e foi descartada.`,
      );
      return;
    }

    // Mantém a pilha do caminho: índice 0 = nível relativo 2.
    const profundidade = nivelRelativo - 2;
    pilhaCaminho.length = profundidade;
    pilhaCaminho[profundidade] = atual.nome;
    const caminhoWbs = pilhaCaminho.slice(0, profundidade + 1);

    const { percentual, suspeito } = paraPercentual(atual.linha.celulas.percentualConcluida);
    if (suspeito) {
      avisos.push(
        `"% Concluída" fora do intervalo 0–1 na linha ${atual.linha.linhaPlanilha} — ` +
          `o Smartsheet pode ter mudado o formato de exportação.`,
      );
    }

    atividades.push({
      linhaPlanilha: atual.linha.linhaPlanilha,
      grupoMacroSmartsheet: grupoAtual.nomeSmartsheet,
      wbsNivel: nivelRelativo,
      // `nome` é o nome curto (o que a UI exibe); a identidade é o caminho.
      nome: atual.nome,
      caminhoWbs,
      caminhoWbsTexto: caminhoWbs.join(SEPARADOR_CAMINHO_WBS),
      predecessores: paraTexto(atual.linha.celulas.predecessores),
      duracaoDias: paraDuracaoDias(atual.linha.celulas.duracao),
      dataInicioPlanejada: paraDataIso(atual.linha.celulas.iniciar),
      dataFimPlanejada: paraDataIso(atual.linha.celulas.terminar),
      // Célula vazia = atividade não iniciada; o banco exige NOT NULL 0–100.
      percentualConcluido: percentual ?? 0,
      caminhoCritico: paraBooleano(atual.linha.celulas.caminhoCritico),
      folgaDias: paraFolgaDias(atual.linha.celulas.folga),
      recurso: paraTexto(atual.linha.celulas.recurso),
      ehFolha,
      tipoElementoVisual: inferirElemento(caminhoWbs, grupoAtual.nomeSmartsheet),
    });
  });

  // Colisões da chave de upsert (grupo macro + caminho WBS).
  const vistos = new Map<string, number[]>();
  for (const a of atividades) {
    const chave = `${a.grupoMacroSmartsheet}::${a.caminhoWbsTexto}`;
    if (!vistos.has(chave)) vistos.set(chave, []);
    vistos.get(chave)!.push(a.linhaPlanilha);
  }
  const colisoes = [...vistos.entries()].filter(([, ls]) => ls.length > 1);
  if (colisoes.length > 0) {
    avisos.push(
      `COLISÃO DE CHAVE: ${colisoes.length} caminho(s) WBS repetidos dentro do mesmo grupo macro. ` +
        `O upsert manteria só a última ocorrência de cada. Exemplos: ` +
        colisoes
          .slice(0, 5)
          .map(([c, ls]) => `"${c}" (linhas ${ls.join(', ')})`)
          .join('; '),
    );
  }

  // Metadados da "raiz": quando há linha física (opcoes.nomeRaizEscopo), vêm
  // dela mesma. Sem raiz física (planilha inteira, sem poda), não existe uma
  // única linha que represente "o dispositivo inteiro" — o percentual fica
  // null de propósito (nenhuma linha do .xlsx é a fonte oficial desse rollup)
  // e as datas extremas são derivadas das próprias atividades importadas.
  const raiz = raizPreparada
    ? {
        linhaPlanilha: raizPreparada.linha.linhaPlanilha,
        nome: raizPreparada.nome,
        percentualConcluido: paraPercentual(raizPreparada.linha.celulas.percentualConcluida).percentual,
        dataInicioPlanejada: paraDataIso(raizPreparada.linha.celulas.iniciar),
        dataFimPlanejada: paraDataIso(raizPreparada.linha.celulas.terminar),
      }
    : (() => {
        const inicios = atividades.map((a) => a.dataInicioPlanejada).filter((d): d is string => !!d);
        const fins = atividades.map((a) => a.dataFimPlanejada).filter((d): d is string => !!d);
        return {
          linhaPlanilha: 0,
          nome: '(planilha completa — sem nó de raiz de escopo)',
          percentualConcluido: null,
          dataInicioPlanejada: inicios.length ? inicios.slice().sort()[0] : null,
          dataFimPlanejada: fins.length ? fins.slice().sort().at(-1)! : null,
        };
      })();

  return {
    grupos,
    atividades,
    raiz,
    linhasForaDeEscopo,
    linhasVaziasIgnoradas,
    avisos,
  };
}
