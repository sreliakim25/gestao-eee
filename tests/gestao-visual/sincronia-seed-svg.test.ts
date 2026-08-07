/**
 * O teste que impede o SVG e o banco de dessincronizarem.
 *
 * `elementos_visuais.svg_path_id` (seed) e o `id` do nó no desenho são a MESMA
 * chave, mantida em dois arquivos diferentes por dois donos diferentes. Se
 * alguém renomear um lado e esquecer o outro, o elemento simplesmente deixa de
 * ser pintado na planta — falha silenciosa, sem erro em tela e sem log. Este
 * teste transforma esse silêncio em suíte vermelha.
 *
 * Ele lê o seed.sql real, não uma cópia: uma edição no seed que não chegue ao
 * desenho quebra aqui.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { IDS_DA_PLANTA, FORMAS_ESTRUTURAIS, acharForma } from '@/components/gestao-visual';

const RAIZ = path.resolve(__dirname, '../..');

/** Extrai os `svg_path_id` do bloco de insert de `elementos_visuais` no seed. */
function lerSvgPathIdsDoSeed(): string[] {
  const seed = readFileSync(path.join(RAIZ, 'supabase/seed.sql'), 'utf8');

  const inicio = seed.indexOf('insert into public.elementos_visuais');
  expect(inicio, 'seed.sql precisa conter o insert de elementos_visuais').toBeGreaterThan(-1);

  const bloco = seed.slice(inicio, seed.indexOf('on conflict', inicio));

  // Cada linha de valores tem 3 literais: nome, tipo e svg_path_id (o 3º).
  return [...bloco.matchAll(/\(\s*'((?:[^']|'')*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*(\d+)\s*\)/g)].map(
    (achado) => achado[3],
  );
}

/** Lê os `id=` declarados no SVG estático publicado em public/svg. */
function lerIdsDoSvgEstatico(): string[] {
  const svg = readFileSync(path.join(RAIZ, 'public/svg/planta-eee.svg'), 'utf8');
  return [...svg.matchAll(/\bid="([^"]+)"/g)].map((achado) => achado[1]);
}

describe('sincronia entre o seed do banco e a planta SVG', () => {
  const idsDoSeed = lerSvgPathIdsDoSeed();

  it('o seed declara os 9 elementos visuais da elevatória', () => {
    expect(idsDoSeed).toHaveLength(9);
    expect(new Set(idsDoSeed).size, 'svg_path_id não pode repetir').toBe(9);
  });

  it('todo svg_path_id do seed tem uma forma correspondente na planta', () => {
    const semForma = idsDoSeed.filter((svgPathId) => acharForma(svgPathId) === undefined);
    expect(
      semForma,
      `sem geometria na planta: ${semForma.join(', ')} — o elemento existiria no banco mas nunca seria pintado`,
    ).toEqual([]);
  });

  it('toda forma da planta corresponde a um elemento do seed (nada desenhado a mais)', () => {
    const semSeed = IDS_DA_PLANTA.filter((svgPathId) => !idsDoSeed.includes(svgPathId));
    expect(
      semSeed,
      `desenhado mas ausente do banco: ${semSeed.join(', ')} — clicar nele não abriria atividade nenhuma`,
    ).toEqual([]);
  });

  it('os dois lados têm exatamente o mesmo conjunto de chaves', () => {
    expect([...IDS_DA_PLANTA].sort()).toEqual([...idsDoSeed].sort());
  });

  it('o SVG estático publicado expõe os ids de todos os elementos', () => {
    const idsDoSvg = lerIdsDoSvgEstatico();
    const ausentes = idsDoSeed.filter((svgPathId) => !idsDoSvg.includes(svgPathId));
    expect(ausentes, `ausentes em public/svg/planta-eee.svg: ${ausentes.join(', ')}`).toEqual([]);
  });

  it('nenhuma forma da planta é de elemento fora do muro perimetral', () => {
    // Regra de escopo do projeto: emissário final e rede coletora externa não
    // entram neste app. Se um dia alguém desenhar um, isto pega.
    const foraDeEscopo = FORMAS_ESTRUTURAIS.filter((forma) =>
      /emissario|emissário|coletora-externa|travessia/i.test(forma.svgPathId),
    );
    expect(foraDeEscopo.map((forma) => forma.svgPathId)).toEqual([]);
  });
});
