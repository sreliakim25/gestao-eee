# E2E — pré-requisitos

Estes testes exercitam o app de verdade, então precisam de infraestrutura que os
testes unitários não precisam. **Eles ainda não foram executados nenhuma vez** —
foram escritos contra o comportamento esperado, não contra uma execução
observada. Trate o primeiro `npm run test:e2e` como parte da implantação, não
como uma formalidade: é esperado que ajustes de seletor sejam necessários.

## O que precisa existir antes

1. **Projeto Supabase acessível**, com as migrations de `supabase/migrations/`
   aplicadas e o `supabase/seed.sql` rodado.
2. **`.env.local`** preenchido a partir de `.env.example`.
3. **Cronograma importado**: `npm run import:cronograma -- --apply`.
4. **Navegadores do Playwright**: `npx playwright install chromium`.
5. **Usuários de teste**, um por perfil, criados no Supabase Auth e exportados
   no ambiente:

   ```
   E2E_EMAIL_GESTOR=...      E2E_SENHA_GESTOR=...
   E2E_EMAIL_CAMPO=...       E2E_SENHA_CAMPO=...
   ```

   Sem essas variáveis os testes que dependem de login são **pulados** (skip),
   não falhados — para que a suíte não fique vermelha por falta de credencial e
   acabe sendo ignorada. Um skip é honesto; um teste que passa sem exercitar
   nada, não.

## Rodar

```bash
npm run test:e2e
```

## Aviso sobre dados

Os testes escrevem no banco (lançamento de produção, RDO, pedido de
concretagem). **Aponte para um projeto Supabase de teste, nunca para o da obra
em produção.**
