/**
 * Fluxo crítico 1 — acesso.
 *
 * O teste de rota protegida NÃO precisa de credencial e é o smoke mais valioso
 * da suíte: se o middleware quebrar, toda a RLS vira a única linha de defesa.
 */

import { expect, test } from '@playwright/test'
import { entrar, exigirCredencial } from './apoio'

const ROTAS_PROTEGIDAS = [
  '/',
  '/cronograma',
  '/curva-s',
  '/lancamento',
  '/gestao-visual',
  '/diario',
  '/concretagem',
  '/orcamento',
]

test.describe('acesso', () => {
  for (const rota of ROTAS_PROTEGIDAS) {
    test(`visitante anônimo é mandado ao login em ${rota}`, async ({ page }) => {
      await page.goto(rota)
      await expect(page).toHaveURL(/\/login/)
    })
  }

  test('a tela de login não vaza detalhe interno em credencial errada', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/e-?mail/i).fill('ninguem@example.com')
    await page.getByLabel(/senha/i).fill('senha-errada-de-proposito')
    await page.getByRole('button', { name: /entrar/i }).click()

    const corpo = page.locator('body')
    await expect(corpo).toContainText(/inválid|incorret|não foi possível/i)
    // Nada de stack trace, nome de tabela ou mensagem crua do Postgres.
    await expect(corpo).not.toContainText(/supabase\.co|postgres|relation |JWT/i)
  })

  test('gestor entra e chega ao Painel', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)
    await expect(page.getByRole('heading', { name: /painel/i })).toBeVisible()
  })
})
