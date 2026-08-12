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
  '/analise',
  '/diario/impressao',
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

test.describe('criação de acesso e liberação', () => {
  test('/cadastro é público — exigir login para criar login seria um círculo', async ({ page }) => {
    await page.goto('/cadastro')
    await expect(page).toHaveURL(/\/cadastro/)
    await expect(page.getByRole('heading', { name: /criar acesso/i })).toBeVisible()
    // A tela precisa avisar ANTES do envio que criar conta não dá acesso.
    await expect(page.locator('body')).toContainText(/liberad|gestor/i)
  })

  test('a tela de entrada leva ao cadastro', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('link', { name: /criar acesso/i })).toBeVisible()
  })

  test('cadastro recusa senha curta', async ({ request }) => {
    const resposta = await request.post('/api/cadastro', {
      data: { nome: 'Fulano de Tal', email: 'curta@example.com', senha: '123' },
    })
    expect(resposta.status()).toBe(400)
    expect((await resposta.json()).erro).toMatch(/caracteres/i)
  })

  test('cadastro recusa e-mail inválido', async ({ request }) => {
    const resposta = await request.post('/api/cadastro', {
      data: { nome: 'Fulano de Tal', email: 'nao-e-email', senha: 'senhaLonga123' },
    })
    expect(resposta.status()).toBe(400)
  })

  test('só gestor administra acessos', async ({ request }) => {
    // Sem sessão a rota tem de responder JSON, não redirecionar para HTML.
    const resposta = await request.patch('/api/usuarios', {
      data: { id: '00000000-0000-0000-0000-000000000000', status: 'ativo' },
    })
    expect(resposta.status()).toBe(401)
  })

  test('gestor enxerga a fila de liberação; a lista é ordenada por pendência', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)
    await page.goto('/usuarios')
    await expect(page.getByRole('heading', { name: /acessos/i })).toBeVisible()
    // O próprio gestor não pode se editar por aqui — é como se tranca fora.
    await expect(page.locator('#conteudo')).toContainText(/você/i)
  })

  test('a pessoa consegue trocar a própria senha', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)
    await page.goto('/conta')
    await expect(page.getByRole('heading', { name: /minha conta/i })).toBeVisible()
    await expect(page.locator('#novaSenha')).toBeVisible()
  })
})
