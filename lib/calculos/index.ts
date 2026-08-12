/**
 * lib/calculos/index.ts — API pública do motor de indicadores.
 *
 * Consumidores (Painel, Cronograma, Curva S, Gestão Visual) importam SEMPRE de
 * `@/lib/calculos`, nunca dos arquivos internos, para que uma reorganização
 * interna não quebre a UI. Nenhuma fórmula pode ser reimplementada fora daqui.
 */

export {
  MS_POR_DIA,
  DIAS_POR_SEMANA,
  paraDataUTC,
  formatarDataISO,
  adicionarDias,
  diferencaEmDias,
  segundaFeiraDaSemana,
  domingoDaSemana,
  chaveSemana,
  listarSemanas,
  diasRestantes,
  semanasRestantes,
  type DataEntrada,
} from './datas';

export {
  PESO_PADRAO_ATIVIDADE,
  arredondar,
  limitarPercentual,
  filtrarAtividades,
  type AgregadoPercentual,
  type AtividadeCalculo,
  type AvancoSemanalCalculo,
  type BasePonderacao,
  type FaixaProgresso,
  type FiltrosAtividade,
  type OpcoesPonderacao,
} from './tipos';

export {
  LIMIAR_INICIO_PP,
  LIMIAR_CONCLUSAO_PP,
  ROTULOS_FAIXA_PROGRESSO,
  faixaProgresso,
  rotuloFaixaProgresso,
} from './progresso';

export {
  mediaPonderada,
  pesoAtividade,
  percentualEvolucaoGeral,
  percentualPorGrupoMacro,
  percentualPorElementoVisual,
  percentuaisPorElementoVisual,
  faixaProgressoElemento,
  resumirAtividades,
  type ResultadoPonderado,
  type ResumoAtividades,
} from './evolucao';

export {
  TOLERANCIA_STATUS_PRAZO_PP,
  classificarDesvioPrazo,
  percentualPlanejadoAtividade,
  percentualPlanejadoAcumulado,
  statusPrazo,
  statusPrazoPorSeries,
  type AvaliacaoPrazo,
  type LinhaBasePlanejada,
  type StatusPrazo,
} from './prazo';

export {
  agregarCurvaS,
  seriesCurvaS,
  pontoDaSemana,
  type CurvaS,
  type FontePlanejado,
  type OpcoesCurvaS,
  type PontoCurvaS,
} from './curva-s';

export {
  LIMIAR_DIVERGENCIA_PP,
  percentualOficial,
  divergenciaRelevante,
  type FontePercentual,
  type PercentualOficial,
} from './oficial';

export {
  LIMIAR_DESVIO_DIAS,
  desvioRelevante,
  periodoDeAtividades,
  periodosPorGrupoMacro,
  type PeriodoFrente,
} from './periodos';

export {
  montarIndicadoresPainel,
  type EntradaPainel,
  type IndicadoresPainel,
} from './painel';
