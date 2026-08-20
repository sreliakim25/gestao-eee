/**
 * `destinoSeguro` — para onde o login manda o usuário depois de autenticar.
 *
 * Com a navegação pós-login passando a começar pela escolha de UGB
 * (Fase 2 do plano multi-dispositivo), o destino padrão (sem `?proximo=`)
 * deixou de ser o Painel (`/`) e passou a ser `/ugbs`. `?proximo=` de uma
 * rota protegida continua tendo prioridade — e a proteção contra open
 * redirect não pode regredir.
 */

import { describe, expect, it } from 'vitest';
import { destinoSeguro } from '@/components/auth/LoginForm';

describe('destinoSeguro', () => {
  it('sem `proximo`, manda para /ugbs (início da navegação pós-login)', () => {
    expect(destinoSeguro(undefined)).toBe('/ugbs');
  });

  it('`proximo` interno é respeitado (ex.: rota protegida que exigiu login)', () => {
    expect(destinoSeguro('/cronograma')).toBe('/cronograma');
    expect(destinoSeguro('/ugbs/algum-id')).toBe('/ugbs/algum-id');
  });

  it('bloqueia open redirect (URL absoluta ou protocolo relativo) caindo em /ugbs', () => {
    expect(destinoSeguro('https://malicioso.com')).toBe('/ugbs');
    expect(destinoSeguro('//malicioso.com')).toBe('/ugbs');
  });
});
