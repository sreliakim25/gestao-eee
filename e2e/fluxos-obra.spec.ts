/**
 * Fluxos críticos da obra.
 *
 * Estas specs foram REESCRITAS depois da primeira execução real contra o app.
 * A versão anterior tinha sido escrita contra o comportamento esperado e errava
 * seletores (procurava um botão "novo pedido" que não existe, tratava `<select>`
 * nativo como combobox de opções, e dava falso positivo de segurança). O que
 * está aqui reflete o que as telas realmente renderizam.
 */

import { expect, test } from '@playwright/test'
import { entrar, exigirCredencial, segundaFeiraISO } from './apoio'

test.describe('painel', () => {
  test('exibe o percentual do Smartsheet e declara a procedência', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)

    const conteudo = page.locator('#conteudo')
    await expect(conteudo.getByRole('heading', { name: /painel da obra/i })).toBeVisible()

    // O número oficial é o rollup do Smartsheet, não a média das folhas.
    await expect(conteudo).toContainText('Rollup do Smartsheet')

    // Regra que motivou toda a mudança: o status de prazo tem de ser julgado
    // contra o MESMO percentual exibido. Se o card de evolução diz 6,0% e o de
    // prazo diz "Realizado 0,9%", a tela se contradiz na cara do gestor.
    const texto = (await conteudo.innerText()).replace(/\s+/g, ' ')
    const evolucao = texto.match(/EVOLUÇÃO FÍSICA\s+([\d,]+)%/i)?.[1]
    const realizado = texto.match(/Realizado\s+([\d,]+)%/i)?.[1]
    expect(evolucao, 'percentual de evolução não encontrado na tela').toBeTruthy()
    expect(realizado, 'percentual realizado não encontrado na tela').toBe(evolucao)
  })

  test('conta apenas as folhas do WBS, não as linhas-mãe', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)
    const texto = (await page.locator('#conteudo').innerText()).replace(/\s+/g, ' ')

    // 310 linhas importadas = 235 folhas + 75 linhas-mãe. Somar as duas na
    // mesma média é dupla contagem; o Painel deve mostrar só as folhas.
    expect(texto).not.toMatch(/ATIVIDADES\s+310\b/i)
    expect(texto).toMatch(/ATIVIDADES\s+\d+/i)
  })
})

test.describe('lançamento de produção → Curva S', () => {
  test('registrar avanço semanal reflete na Curva S', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)

    await page.goto('/lancamento')
    await expect(page.getByRole('heading', { name: /lançamento de produção/i })).toBeVisible()

    // Semana sempre numa segunda-feira ISO (há constraint no banco).
    await page.locator('#semanaReferencia').fill(segundaFeiraISO(new Date()))

    // `<select>` nativo: usar selectOption, não click + option.
    const atividades = page.locator('#atividadeId')
    const valores = await atividades.locator('option').evaluateAll((opts) =>
      opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
    )
    expect(valores.length, 'nenhuma atividade disponível para lançamento').toBeGreaterThan(0)
    await atividades.selectOption(valores[0])

    await page.locator('#percentualRealizado').fill('25')
    await page.getByRole('button', { name: /registrar avanço/i }).click()

    await expect(page.locator('#conteudo')).toContainText(/salvo|registrado|sucesso/i, {
      timeout: 20_000,
    })

    await page.goto('/curva-s')
    // Exato: há também um <h2 class="sr-only">Gráfico da Curva S</h2>.
    await expect(page.getByRole('heading', { name: 'Curva S', exact: true })).toBeVisible()
    await expect(page.locator('svg.recharts-surface').first()).toBeVisible({ timeout: 20_000 })
  })

  test('semana fora de segunda-feira é barrada antes de bater no banco', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)
    await page.goto('/lancamento')

    // 2026-08-05 é uma quarta-feira.
    await page.locator('#semanaReferencia').fill('2026-08-05')
    const atividades = page.locator('#atividadeId')
    const valores = await atividades.locator('option').evaluateAll((opts) =>
      opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
    )
    test.skip(valores.length === 0, 'sem atividades para exercitar a validação')
    await atividades.selectOption(valores[0])
    await page.locator('#percentualRealizado').fill('10')
    await page.getByRole('button', { name: /registrar avanço/i }).click()

    await expect(page.locator('#conteudo')).toContainText(/segunda|inválid/i)
  })
})

test.describe('concretagem', () => {
  test('a regra de 5 m³ está declarada na tela', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)

    await page.goto('/concretagem')
    await expect(page.getByRole('heading', { name: /concretagem/i }).first()).toBeVisible()

    const texto = (await page.locator('#conteudo').innerText()).replace(/\s+/g, ' ')
    // Regra de negócio 1 do CLAUDE.md.
    expect(texto).toContain('5 m³')
    expect(texto).toMatch(/mínimo/i)
    // A combinação de sobras é o que permite pedir abaixo do mínimo.
    expect(texto).toMatch(/combin|sobra/i)
  })

  test('as 4 etapas do plano de concretagem aparecem', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)
    await page.goto('/concretagem')

    for (const etapa of [1, 2, 3, 4]) {
      await expect(
        page.getByRole('heading', { name: new RegExp(`Etapa ${etapa} —`, 'i') }),
      ).toBeVisible()
    }
  })

  // NOTA: não há e2e do fluxo "criar pedido abaixo de 5 m³ e ver o alerta"
  // porque a TELA DE CRIAÇÃO DE PEDIDO AINDA NÃO EXISTE — o módulo hoje é uma
  // visão de planejamento somente leitura. A regra em si está coberta por teste
  // unitário em tests/concretagem/volume-minimo.test.ts. Quando o formulário
  // for construído, o e2e do alerta entra aqui.
})

test.describe('orçamento do terceirizado', () => {
  test('concreto de compra direta aparece separado da mão de obra', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)

    await page.goto('/orcamento')
    await expect(
      page.getByRole('heading', { name: /orçamento \/ terceirizado/i }),
    ).toBeVisible()

    // Regra de negócio 2 do CLAUDE.md: os dois valores nunca podem virar um
    // total único de contrato do terceirizado.
    const texto = (await page.locator('#conteudo').innerText()).replace(/\s+/g, ' ')
    expect(texto).toMatch(/contrato do terceirizado \(mão de obra\)/i)
    expect(texto).toMatch(/compra direta/i)
    expect(texto).toMatch(/FORA do contrato de mão de obra/i)
  })
})

test.describe('análise IA', () => {
  test('nenhum segredo do servidor chega ao browser', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)
    await page.goto('/analise')

    const html = await page.content()
    // Procuramos o VALOR de uma chave, não o nome da variável: a página cita
    // "ANTHROPIC_API_KEY" no aviso de configuração, e checar o nome dava um
    // falso positivo de vazamento.
    expect(html).not.toMatch(/sk-ant-[A-Za-z0-9_-]{10,}/)
    expect(html).not.toMatch(/sb_secret_[A-Za-z0-9_-]{10,}/)
    // A chave publicável PODE aparecer — ela é pública por design e protegida
    // por RLS. A secreta, nunca.
  })

  test('a página existe e explica a procedência do número', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)
    await page.goto('/analise')
    await expect(page.getByRole('heading', { name: /análise ia/i })).toBeVisible()
    await expect(page.locator('#conteudo')).toContainText(/lib\/calculos|indicadores/i)
  })
})

test.describe('sincronização com o Smartsheet', () => {
  test('o gestor vê o botão e o indicador de frescor do dado', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)
    await page.goto('/cronograma')

    await expect(
      page.getByRole('button', { name: /sincronizar com o smartsheet/i }),
    ).toBeVisible()
    // O indicador é o que responde "o que estou vendo é de hoje?".
    await expect(page.locator('#conteudo')).toContainText(
      /última sincronização|ainda não sincronizado/i,
    )
  })

  test('a rota de sync recusa quem não está autenticado', async ({ request }) => {
    const resposta = await request.post('/api/sincronizar')
    expect(resposta.status()).toBe(401)
  })

  test('o cron recusa chamada sem o segredo', async ({ request }) => {
    // Sem esta checagem, qualquer pessoa dispararia o sync com um GET.
    const resposta = await request.get('/api/cron/sincronizar')
    expect([401, 503]).toContain(resposta.status())
  })

  test('a seção de evolução do cronograma aparece', async ({ page }) => {
    const dados = exigirCredencial('GESTOR')
    await entrar(page, dados)
    await page.goto('/cronograma')
    await expect(
      page.getByRole('heading', { name: /evolução do cronograma/i }),
    ).toBeVisible()
  })
})
