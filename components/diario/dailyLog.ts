/**
 * components/diario/dailyLog.ts — normalização dos campos JSON do RDO.
 *
 * O banco guarda `efetivo` como objeto ({"pedreiro": 4}) e `equipamentos` como
 * lista ([{"nome":"Escavadeira","horas":8}]). O formulário trabalha com linhas,
 * então a conversão nos dois sentidos mora aqui — fora do componente, para ser
 * testável.
 */

import type { Json } from '@/types/database';

export interface LinhaEfetivo {
  funcao: string;
  quantidade: string;
}

export interface LinhaEquipamento {
  nome: string;
  horas: string;
}

/** Opções de clima do RDO (padrão dos diários da VMC). */
export const OPCOES_CLIMA = [
  'Bom / céu claro',
  'Nublado',
  'Chuva fraca',
  'Chuva forte',
  'Impraticável',
] as const;

/** JSON do banco → linhas do formulário. */
export function efetivoParaLinhas(valor: Json | null | undefined): LinhaEfetivo[] {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return [];
  return Object.entries(valor).map(([funcao, quantidade]) => ({
    funcao,
    quantidade: quantidade === null || quantidade === undefined ? '' : String(quantidade),
  }));
}

/** Linhas do formulário → JSON do banco (ignora linhas incompletas). */
export function linhasParaEfetivo(linhas: readonly LinhaEfetivo[]): Record<string, number> {
  const resultado: Record<string, number> = {};
  for (const linha of linhas) {
    const funcao = linha.funcao.trim();
    const quantidade = Number(linha.quantidade);
    if (!funcao || !Number.isFinite(quantidade) || quantidade <= 0) continue;
    resultado[funcao] = quantidade;
  }
  return resultado;
}

export function equipamentosParaLinhas(valor: Json | null | undefined): LinhaEquipamento[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((item): item is { [k: string]: Json } => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      nome: typeof item.nome === 'string' ? item.nome : '',
      horas:
        item.horas === null || item.horas === undefined ? '' : String(item.horas as Json),
    }));
}

export function linhasParaEquipamentos(
  linhas: readonly LinhaEquipamento[],
): { nome: string; horas: number }[] {
  const resultado: { nome: string; horas: number }[] = [];
  for (const linha of linhas) {
    const nome = linha.nome.trim();
    if (!nome) continue;
    const horas = Number(linha.horas);
    resultado.push({ nome, horas: Number.isFinite(horas) && horas > 0 ? horas : 0 });
  }
  return resultado;
}

/** Total de pessoas no dia — soma simples do efetivo, para o cabeçalho do RDO. */
export function totalEfetivo(valor: Json | null | undefined): number {
  const linhas = efetivoParaLinhas(valor);
  return linhas.reduce((soma, linha) => {
    const quantidade = Number(linha.quantidade);
    return soma + (Number.isFinite(quantidade) ? quantidade : 0);
  }, 0);
}

/** Caminho do objeto no bucket `fotos-obra`. */
export function caminhoDaFoto(
  projetoId: string,
  data: string,
  nomeArquivo: string,
  sufixoUnico: string,
): string {
  const extensao = (nomeArquivo.split('.').pop() ?? 'jpg')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 5);
  return `${projetoId}/${data}/${sufixoUnico}.${extensao || 'jpg'}`;
}

/** Tipos e tamanho aceitos no upload (validação no cliente). */
export const TIPOS_IMAGEM_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
export const TAMANHO_MAXIMO_FOTO_BYTES = 10 * 1024 * 1024; // 10 MB

export function validarArquivoDeFoto(arquivo: {
  type: string;
  size: number;
}): string | null {
  if (!TIPOS_IMAGEM_ACEITOS.includes(arquivo.type)) {
    return 'Formato não aceito. Envie JPG, PNG, WEBP ou HEIC.';
  }
  if (arquivo.size > TAMANHO_MAXIMO_FOTO_BYTES) {
    return 'Arquivo acima de 10 MB. Reduza a foto antes de enviar.';
  }
  return null;
}
