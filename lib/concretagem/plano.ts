/**
 * lib/concretagem/plano.ts — O plano de concretagem, tipado.
 *
 * FONTE ÚNICA: `Materiais/Plano_Execucao_Concretagem_EEE.docx`
 * (VMC/UDE — "SISTEMA DE ESGOTAMENTO SANITÁRIO — EEE NOVO MUNDO").
 *
 * Nenhum número aqui foi estimado: todos são transcrição literal das tabelas
 * "Volumes por etapa" e "Detalhamento das paredes" do documento. Onde o plano
 * não detalha o volume de um elemento (lajes de fundo, laje de tampa, chicana,
 * base do guindaste, bancada), o campo fica `null` de propósito — o volume
 * conhecido é só o agregado da etapa.
 */

import type { ElementoConcretagem, EtapaPlano, NumeroEtapa } from './tipos';

/**
 * Volume total oficial do carimbo do projeto estrutural (Vce), em m³.
 * Referência do documento: "calibrados para que a soma bata com o volume total
 * oficial do carimbo (Vce = 84,94 m³)".
 */
export const VOLUME_TOTAL_CARIMBO_M3 = 84.94;

/** Capacidade máxima do caminhão-betoneira, em m³ (faixa 5–14 m³ do plano). */
export const CAPACIDADE_CAMINHAO_M3 = 14;

/**
 * Detalhamento das paredes (espessura × comprimento × altura), tabela 2 do plano.
 * Os pares "Par 1a / Par 2a" etc. aparecem no documento com volume "(cada)":
 * aqui viram duas linhas, uma por parede, com o mesmo volume unitário.
 */
export const PAREDES_DETALHADAS: readonly ElementoConcretagem[] = [
  { codigo: 'Par 1a', descricao: 'Parede 1 — trecho a', espessuraCm: 25, comprimentoCm: 285, alturaM: 2.6, volumeM3: 1.85 },
  { codigo: 'Par 2a', descricao: 'Parede 2 — trecho a', espessuraCm: 25, comprimentoCm: 285, alturaM: 2.6, volumeM3: 1.85 },
  { codigo: 'Par 1b', descricao: 'Parede 1 — trecho b', espessuraCm: 25, comprimentoCm: 515, alturaM: 4.9, volumeM3: 6.31 },
  { codigo: 'Par 2b', descricao: 'Parede 2 — trecho b', espessuraCm: 25, comprimentoCm: 515, alturaM: 4.9, volumeM3: 6.31 },
  { codigo: 'Par 1c', descricao: 'Parede 1 — trecho c', espessuraCm: 18, comprimentoCm: 198, alturaM: 1.85, volumeM3: 0.66 },
  { codigo: 'Par 2c', descricao: 'Parede 2 — trecho c', espessuraCm: 18, comprimentoCm: 198, alturaM: 1.85, volumeM3: 0.66 },
  { codigo: 'Par 3', descricao: 'Parede da escada', espessuraCm: 25, comprimentoCm: 285, alturaM: 2.75, volumeM3: 1.96 },
  { codigo: 'Par 4', descricao: 'Parede do poço úmido', espessuraCm: 25, comprimentoCm: 515, alturaM: 2.14, volumeM3: 2.76 },
  { codigo: 'Par 5', descricao: 'Parede alta do poço úmido (4,74 m)', espessuraCm: 25, comprimentoCm: 515, alturaM: 4.74, volumeM3: 6.1 },
  { codigo: 'Par 6', descricao: 'Parede do poço úmido (18 cm)', espessuraCm: 18, comprimentoCm: 198, alturaM: 1.88, volumeM3: 0.67 },
  { codigo: 'Par 7', descricao: 'Parede de extremidade da câmara de grades', espessuraCm: 25, comprimentoCm: 155, alturaM: 2.1, volumeM3: 0.81 },
  { codigo: 'Par 11', descricao: 'Parede de extremidade da câmara de grades', espessuraCm: 25, comprimentoCm: 155, alturaM: 2.1, volumeM3: 0.81 },
  { codigo: 'Par 8', descricao: 'Chicana baixa', espessuraCm: 15, comprimentoCm: 155, alturaM: 0.8, volumeM3: 0.19 },
  { codigo: 'Par 9', descricao: 'Chicana baixa', espessuraCm: 15, comprimentoCm: 155, alturaM: 0.8, volumeM3: 0.19 },
  { codigo: 'Par 10', descricao: 'Chicana baixa', espessuraCm: 15, comprimentoCm: 155, alturaM: 0.8, volumeM3: 0.19 },
  { codigo: 'Par 12', descricao: 'Parede de acessório', espessuraCm: 25, comprimentoCm: 155, alturaM: 1.5, volumeM3: 0.58, alturaAproximada: true },
  { codigo: 'Par 13', descricao: 'Parede de acessório', espessuraCm: 15, comprimentoCm: 75, alturaM: 1.0, volumeM3: 0.11, alturaAproximada: true },
  { codigo: 'Par 14', descricao: 'Parede de acessório', espessuraCm: 15, comprimentoCm: 75, alturaM: 1.0, volumeM3: 0.11, alturaAproximada: true },
];

/** Busca uma parede do detalhamento pelo código ("Par 5"). */
function parede(codigo: string): ElementoConcretagem {
  const achada = PAREDES_DETALHADAS.find((p) => p.codigo === codigo);
  if (!achada) throw new Error(`Elemento "${codigo}" não existe no detalhamento do plano.`);
  return achada;
}

/** Elemento sem volume detalhado no plano (só o agregado da etapa é conhecido). */
function semVolumeDetalhado(
  codigo: string,
  descricao: string,
  extras: Partial<ElementoConcretagem> = {},
): ElementoConcretagem {
  return {
    codigo,
    descricao,
    espessuraCm: null,
    comprimentoCm: null,
    alturaM: null,
    volumeM3: null,
    ...extras,
  };
}

/** As 4 etapas do plano de execução da concretagem. */
export const ETAPAS_PLANO: readonly EtapaPlano[] = [
  {
    etapa: 1,
    titulo: 'Lajes de fundo',
    volumeM3: 23.5,
    cargasPrevistasM3: [14, 9.5],
    diaInicio: 1,
    diaFim: 2,
    exigeCombinacaoComOutraFrente: false,
    elementos: [
      semVolumeDetalhado('LF1', 'Laje de fundo LF1 (h = 25 cm)'),
      semVolumeDetalhado('LF2', 'Laje de fundo LF2 (h = 25 cm)'),
      semVolumeDetalhado('LF3', 'Laje de fundo LF3'),
      semVolumeDetalhado('LF4', 'Laje de fundo LF4 (h = 25 cm)'),
      parede('Par 8'),
      parede('Par 9'),
      parede('Par 10'),
    ],
    sequenciaExecutiva: [
      'Lastro de concreto magro (e = 5 cm) sob todas as lajes de fundo — concreto simples, não estrutural; pedir junto com outra frente se não atingir 5 m³ isoladamente.',
      'Concretar LF1, LF2, LF4 (h = 25 cm) no mesmo dia, em até 2 caminhões (14 + 9,5 m³).',
      'Prever arranque (ferro de espera) para as paredes na junta com a laje, conforme item 10.7.1.5 da NBR 14931:2023 — junta vertical tipo pente, sem nata vitrificada.',
      'Concretar Par 8, 9 e 10 (chicanas baixas, h = 0,80 m) após liberação do escoramento da laje.',
      'Aguardar cura mínima de 7 dias nas superfícies expostas e 14 dias para desforma total antes de iniciar a Etapa 2.',
    ],
    observacoes: [
      'O lastro de concreto magro é a primeira frente candidata a combinar volume com outra etapa (raramente atinge 5 m³ sozinho).',
    ],
  },
  {
    etapa: 2,
    titulo: 'Paredes da câmara de grades',
    volumeM3: 25.5,
    cargasPrevistasM3: [14, 11.5],
    diaInicio: 3,
    diaFim: 4,
    exigeCombinacaoComOutraFrente: false,
    elementos: [
      semVolumeDetalhado('Chicana', 'Chicana — elemento de desvio de fluxo do canal de grades'),
      parede('Par 1a'),
      parede('Par 1b'),
      parede('Par 1c'),
      parede('Par 2a'),
      parede('Par 2b'),
      parede('Par 2c'),
      parede('Par 7'),
      parede('Par 11'),
    ],
    sequenciaExecutiva: [
      'Concretar Par 7 e Par 11 (paredes de extremidade da câmara de grades, 25 cm).',
      'Concretar Par 1 e Par 2 nos trechos a/b/c — a espessura varia ao longo do comprimento (25 cm → 25 cm → 18 cm): planejar forma em 3 seções por parede.',
      'Concretar a chicana (elemento de desvio de fluxo dentro do canal de grades).',
      'Impermeabilização asfáltica (Igol S ou similar) nas faces em contato com o solo, após a desforma.',
    ],
  },
  {
    etapa: 3,
    titulo: 'Paredes altas do poço úmido + laje de tampa',
    volumeM3: 31.5,
    cargasPrevistasM3: [14, 14, 3.5],
    diaInicio: 5,
    diaFim: 7,
    exigeCombinacaoComOutraFrente: true,
    elementos: [parede('Par 4'), parede('Par 5'), parede('Par 6'), semVolumeDetalhado('LT1', 'Laje de tampa LT1 (h = 16 cm)')],
    sequenciaExecutiva: [
      'ATENÇÃO: Par 5 tem 4,74 m de altura — validar com o calculista se o lançamento é em uma única etapa ou em duas camadas (verificar pressão de forma para concreto C-40 slump 60 mm nessa altura).',
      'Concretar Par 4, Par 5 e Par 6 — sequência sugerida: Par 4 e Par 5 (paredes mais altas) primeiro, Par 6 (18 cm, menor) em seguida.',
      'Aguardar cura mínima de 7 dias nas paredes antes de apoiar e concretar a laje de tampa LT1 (h = 16 cm).',
      'Concretar LT1 cobrindo toda a área — deixar previstos os furos/aberturas para acesso e tubulações (Ø 150 mm) indicados no projeto.',
    ],
    observacoes: [
      'A terceira carga da etapa é de 3,5 m³ (abaixo do mínimo de 5 m³): combinar com outra frente antes de fechar o pedido.',
    ],
  },
  {
    etapa: 4,
    titulo: 'Acessórios e finalização (pós-reaterro)',
    volumeM3: 4.5,
    cargasPrevistasM3: [4.5],
    diaInicio: 8,
    diaFim: 8,
    exigeCombinacaoComOutraFrente: true,
    elementos: [
      parede('Par 3'),
      parede('Par 12'),
      parede('Par 13'),
      parede('Par 14'),
      semVolumeDetalhado('B1', 'Base do guindaste B1 (80 × 80 × 60 cm)'),
      semVolumeDetalhado('Bancada', 'Bancada'),
      semVolumeDetalhado('E1', 'Escada E1 — 2ª fase, somente após o reaterro', { segundaFase: true }),
      semVolumeDetalhado('E2', 'Escada E2 — 2ª fase, somente após o reaterro', { segundaFase: true }),
    ],
    sequenciaExecutiva: [
      'Concretar Par 12, Par 13, Par 14, base do guindaste B1 (80 × 80 × 60 cm) e bancada — volume pequeno (4,5 m³): combinar com sobra de concreto de outra frente da obra (Novo Mundo, Moreiras ou Santa Cruz) para não desperdiçar giro de caminhão.',
      'NÃO concretar as escadas E1/E2 (ligadas à Par 3) nesta etapa — conforme nota do projeto e do Corte A-A, a escada é executada em 2ª fase, somente após o reaterro.',
      'Após o reaterro da obra: concretar o trecho final da escada (identificado como "concretar 2ª fase" no Corte A-A).',
    ],
    observacoes: [
      'Etapa inteira abaixo do pedido mínimo de 5 m³ (4,5 m³): o plano já determina a combinação com outra frente.',
    ],
  },
];

/** Resumo da seção 4 do plano — "Resumo para pedido às concreteiras". */
export interface DiaPedido {
  dia: number;
  /** Volumes a pedir naquele dia, em m³. Vazio quando o dia usa sobra da etapa anterior. */
  volumesM3: readonly number[];
  numCaminhoes: number | null;
  /** Texto literal da coluna "Volume a pedir" quando não é numérico. */
  nota?: string;
}

export const RESUMO_PEDIDO_CONCRETEIRAS: readonly DiaPedido[] = [
  { dia: 1, volumesM3: [14.0, 9.5], numCaminhoes: 2 },
  { dia: 2, volumesM3: [], numCaminhoes: null, nota: 'conforme sobra da Etapa 1' },
  { dia: 3, volumesM3: [14.0, 11.5], numCaminhoes: 2 },
  { dia: 4, volumesM3: [], numCaminhoes: null, nota: 'conforme sobra da Etapa 2' },
  { dia: 5, volumesM3: [14.0], numCaminhoes: 1 },
  { dia: 6, volumesM3: [14.0], numCaminhoes: 1 },
  { dia: 7, volumesM3: [3.5], numCaminhoes: 1, nota: 'combinar com outra frente' },
  { dia: 8, volumesM3: [4.5], numCaminhoes: 1, nota: 'combinar com outra frente' },
];

/** Etapa do plano pelo número (1..4). */
export function buscarEtapa(etapa: NumeroEtapa): EtapaPlano {
  const achada = ETAPAS_PLANO.find((e) => e.etapa === etapa);
  if (!achada) throw new Error(`Etapa ${etapa} não existe no plano de concretagem.`);
  return achada;
}

/**
 * Soma dos volumes das 4 etapas (85,0 m³).
 *
 * Fica ~0,06 m³ acima do Vce oficial do carimbo (84,94 m³) por arredondamento
 * dos volumes por etapa no próprio documento. Não corrigir aqui: o plano é
 * ferramenta de programação logística; para medição/pagamento vale o memorial
 * de cálculo oficial.
 */
export function volumeTotalPlanejadoM3(): number {
  return Number(ETAPAS_PLANO.reduce((soma, e) => soma + e.volumeM3, 0).toFixed(2));
}
