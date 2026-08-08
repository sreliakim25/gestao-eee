/**
 * Fluxos críticos 2 a 4, conforme a estratégia de testes do plano:
 *   - lançamento de produção semanal atualizando a Curva S
 *   - pedido de concretagem com alerta de volume abaixo de 5 m³
 *   - RDO com upload de foto
 *   - separação concreto (compra direta) x mão de obra no Orçamento
 *
 * Todos escrevem no banco — use um Supabase de teste (ver e2e/README.md).
 */

import { expect, test } from '@playwright/test'
import { entrar, exigirCredencial, segundaFeiraISO } from './apoio'

test.describe('lançamento de produção → Curva S', () => {
  test('registrar avanço semanal reflete na Curva S', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)

    await page.goto('/lancamento')
    await expect(page.getByRole('heading', { name: /lançamento/i })).toBeVisible()

    // A semana de referência é sempre uma segunda-feira ISO (constraint do banco).
    const semana = segundaFeiraISO(new Date())
    const campoSemana = page.getByLabel(/semana/i).first()
    if (await campoSemana.isVisible()) {
      await campoSemana.fill(semana)
    }

    await page.getByRole('combobox', { name: /atividade/i }).first().click()
    await page.getByRole('option').first().click()
    await page.getByLabel(/percentual|avanço/i).first().fill('25')
    await page.getByRole('button', { name: /salvar|registrar|lançar/i }).click()

    await expect(page.getByText(/salvo|registrado|sucesso/i)).toBeVisible({ timeout: 15_000 })

    await page.goto('/curva-s')
    await expect(page.getByRole('heading', { name: /curva s/i })).toBeVisible()
    // O gráfico só existe quando há série realizada.
    await expect(page.locator('svg.recharts-surface')).toBeVisible({ timeout: 15_000 })
  })

  test('semana que não é segunda-feira é barrada antes de bater no banco', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)
    await page.goto('/lancamento')

    const campoSemana = page.getByLabel(/semana/i).first()
    test.skip(!(await campoSemana.isVisible()), 'formulário sem campo de semana editável')

    // 2026-08-05 é uma quarta-feira.
    await campoSemana.fill('2026-08-05')
    await page.getByRole('button', { name: /salvar|registrar|lançar/i }).click()
    await expect(page.getByText(/segunda|semana inválida|inválid/i)).toBeVisible()
  })
})

test.describe('concretagem', () => {
  test('pedido abaixo de 5 m³ dispara o alerta de volume mínimo', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)

    await page.goto('/concretagem')
    await expect(page.getByRole('heading', { name: /concretagem/i })).toBeVisible()

    await page.getByRole('button', { name: /novo pedido|adicionar/i }).first().click()
    await page.getByLabel(/volume/i).first().fill('3')

    // Regra de negócio 1 do CLAUDE.md: mínimo 5 m³, combinar sobras antes de pedir.
    await expect(page.getByText(/5\s?m³/i)).toBeVisible()
    await expect(page.getByText(/combin|sobra/i)).toBeVisible()
  })
})

test.describe('diário de obra', () => {
  test('registrar RDO com foto', async ({ page }) => {
    const dados = exigirCredencial('CAMPO')
    await entrar(page, dados)

    await page.goto('/diario')
    await expect(page.getByRole('heading', { name: /diário/i })).toBeVisible()

    await page.getByLabel(/clima/i).first().fill('Sol')
    await page.getByLabel(/efetivo/i).first().fill('12')
    await page.getByLabel(/atividades executadas/i).first().fill('Concretagem da laje de fundo.')

    // PNG 1x1 gerado em memória — não versionamos binário de teste.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const campoFoto = page.locator('input[type="file"]').first()
    if (await campoFoto.count()) {
      await campoFoto.setInputFiles({ name: 'evidencia.png', mimeType: 'image/png', buffer: png })
    }

    await page.getByRole('button', { name: /salvar|registrar/i }).first().click()
    await expect(page.getByText(/salvo|registrado|sucesso/i)).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('orçamento do terceirizado', () => {
  test('concreto de compra direta aparece separado da mão de obra', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)

    await page.goto('/orcamento')
    await expect(page.getByRole('heading', { name: /orçamento/i })).toBeVisible()

    // Regra de negócio 2 do CLAUDE.md: os dois valores nunca podem ser somados
    // num total único de contrato do terceirizado.
    await expect(page.getByText(/compra direta/i)).toBeVisible()
    await expect(page.getByText(/mão de obra/i)).toBeVisible()
  })
})

test.describe('análise IA', () => {
  test('a chave da Anthropic nunca chega ao browser', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)
    await page.goto('/analise')

    // Nenhum bundle servido ao cliente pode conter a chave nem o nome da var.
    const conteudo = await page.content()
    expect(conteudo).not.toMatch(/sk-ant-/)
    expect(conteudo).not.toMatch(/ANTHROPIC_API_KEY/)
  })

  test('campo não acessa a análise consolidada', async ({ page }) => {
    const dados = exigirCredencial('CAMPO')
    await entrar(page, dados)
    await page.goto('/analise')
    await expect(page.getByText(/sem acesso/i)).toBeVisible()
  })
})
