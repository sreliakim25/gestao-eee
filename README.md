# Gestão de Obra — EEE Novo Mundo

App de acompanhamento da obra da Estação Elevatória de Esgoto do Novo Mundo
(Viana & Moura Construções). Cobre exclusivamente o que está **dentro do muro
perimetral**: preliminares, dragagem/drenagem do canal, terraplenagem, civil,
elétrica e outros. Emissário final e rede coletora externa estão fora de escopo.

Contexto completo em [`docs/PLANO_EXECUCAO_APP_GESTAO_EEE.md`](docs/PLANO_EXECUCAO_APP_GESTAO_EEE.md).
Decisões técnicas em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Recharts · Supabase
(Postgres + Auth + Storage) · Vitest · Playwright · deploy na Vercel.

## Módulos

| Rota | Módulo |
|---|---|
| `/` | Painel — % de evolução, status de prazo, semanas restantes, cards por frente |
| `/cronograma` | Atividades com filtros (semana atual, caminho crítico, frente, elemento) |
| `/curva-s` | Planejado x realizado acumulado |
| `/lancamento` | Avanço físico semanal |
| `/gestao-visual` | Planta esquemática em SVG, colorida por % e clicável |
| `/diario` | Diário de obra (RDO) com fotos |
| `/concretagem` | Etapas, checklist, alerta de pedido mínimo de 5 m³ |
| `/orcamento` | Orçado x medido do terceirizado |

## Como subir do zero

```bash
npm install
cp .env.example .env.local     # preencha com os dados do seu projeto Supabase
```

### 1. Banco

Crie um projeto no Supabase e aplique, na ordem, os arquivos de
`supabase/migrations/`, depois `supabase/seed.sql` (7 grupos macro + 9
elementos visuais). Pelo SQL Editor ou via Supabase CLI (`supabase db push`).

### 2. Cronograma

A fonte da verdade é o Smartsheet, exportado para
`Materiais/EEE - Novo Mundo.xlsx`.

```bash
npm run import:cronograma -- --dry-run   # confere sem escrever (padrão)
npm run import:cronograma -- --apply     # grava no banco
```

O dry-run imprime um resumo de conferência: 7 grupos, 310 atividades, 34 em
caminho crítico, 15/05/2026 a 26/01/2027. Se algum número divergir, o script
avisa em destaque em vez de silenciar.

Reimporte sempre que o Smartsheet for reexportado — o upsert é idempotente.
Atividades que sumiram do `.xlsx` são **reportadas como órfãs, nunca apagadas
em silêncio**; remover exige `--prune` explícito.

### 3. Orçamento do terceirizado

```bash
npx tsx scripts/import-orcamento.ts --dry-run
```

### 4. Rodar

```bash
npm run dev
npm test          # 330 testes unitários e de componente
npm run test:e2e  # ver pré-requisitos em e2e/README.md
```

## Regras de negócio que não podem ser simplificadas

1. **Pedido mínimo de concreto é 5 m³.** Sempre combinar sobras entre etapas e
   frentes antes de pedir um caminhão abaixo do mínimo.
2. **Concreto é compra direta da contratada**, faturado pela contratante —
   nunca somar ao valor de mão de obra do contrato do terceirizado.
3. **Escopo geográfico**: nada fora do muro perimetral entra no cronograma nem
   na gestão visual.
4. **Curva S e % de evolução física** saem de `lib/calculos/` — nunca
   calculados dentro de componentes de UI.

## Segurança

- `.env*` não vai para o Git (só `.env.example`).
- `SUPABASE_SERVICE_ROLE_KEY` é usada apenas nos scripts de import, server-side.
  Nunca prefixe com `NEXT_PUBLIC_`.
- Todas as tabelas têm RLS ativa, com perfis `gestor`, `fiscal` e `campo`.
