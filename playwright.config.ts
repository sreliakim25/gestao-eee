import { defineConfig, devices } from '@playwright/test'

// E2E dos fluxos críticos da obra. Os testes rodam contra o build de produção
// local; um Supabase acessível é pré-requisito (ver e2e/README.md).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    locale: 'pt-BR',
    timezoneId: 'America/Recife',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // A equipe de campo usa o app no celular — o RDO precisa passar aqui também.
    { name: 'campo', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
