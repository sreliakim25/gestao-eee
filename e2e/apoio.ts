/**
 * Apoio comum dos e2e: credenciais por perfil e login.
 *
 * Regra adotada aqui: sem credencial no ambiente, o teste é PULADO, nunca
 * dado como passado. Ver e2e/README.md.
 */

import { expect, type Page, test } from '@playwright/test'

export interface CredencialPerfil {
  email: string
  senha: string
}

/** Lê as credenciais de um perfil, ou `null` se não estiverem no ambiente. */
export function credencial(perfil: 'GESTOR' | 'CAMPO'): CredencialPerfil | null {
  const email = process.env[`E2E_EMAIL_${perfil}`]
  const senha = process.env[`E2E_SENHA_${perfil}`]
  return email && senha ? { email, senha } : null
}

/** Pula o teste com motivo explícito quando falta credencial. */
export function exigirCredencial(perfil: 'GESTOR' | 'CAMPO'): CredencialPerfil {
  const dados = credencial(perfil)
  test.skip(
    dados === null,
    `E2E_EMAIL_${perfil}/E2E_SENHA_${perfil} não definidas — ver e2e/README.md`,
  )
  return dados as CredencialPerfil
}

/** Faz login pelo formulário real e espera a navegação sair do /login. */
export async function entrar(page: Page, dados: CredencialPerfil): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/e-?mail/i).fill(dados.email)
  await page.getByLabel(/senha/i).fill(dados.senha)
  await page.getByRole('button', { name: /entrar/i }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
}

/** Segunda-feira ISO da semana de uma data — espelha a constraint do banco. */
export function segundaFeiraISO(data: Date): string {
  const copia = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()))
  const diaDaSemana = copia.getUTCDay() === 0 ? 7 : copia.getUTCDay()
  copia.setUTCDate(copia.getUTCDate() - (diaDaSemana - 1))
  return copia.toISOString().slice(0, 10)
}
