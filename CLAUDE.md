# CLAUDE.md — App de Gestão de Obra: EEE Novo Mundo

> Leitura obrigatória no início de qualquer sessão do Claude Code neste repositório. Contexto completo em `docs/PLANO_EXECUCAO_APP_GESTAO_EEE.md`. Regras de orquestração de subagentes em `docs/ORQUESTRACAO_SUBAGENTES.md`.

## O que é este projeto

App de gestão da obra da **Estação Elevatória de Esgoto (EEE) do Novo Mundo** (Viana & Moura Construções). Cobre exclusivamente o que está dentro do muro perimetral da elevatória: serviços preliminares, dragagem/drenagem do canal, terraplenagem, civil (poço úmido, câmara de grades, casa de comando, redes internas, pavimentação, muro perimetral), elétrica e outros. **Redes externas (emissário final, coletora externa) estão fora de escopo.**

Segundo app da família de gestão de obra da VMC, no padrão do já existente Emissário Leão Dourado — módulos parecidos, mas aqui o objeto é uma estrutura pontual (não uma rede linear).

## Fonte da verdade dos dados

- Cronograma: Smartsheet, importado via `.xlsx` exportado (`Materiais/EEE - Novo Mundo.xlsx`) — ver `scripts/import-smartsheet.ts`.
- Orçamento do terceirizado: `Materiais/QUANTITATIVO ESTAÇÃO ELEVATÓRIA DE ESGOTO RL.xlsx`.
- Plano de concretagem: `Materiais/Plano_Execucao_Concretagem_EEE.docx`.
- Nunca inventar dados de cronograma/orçamento — sempre importar ou perguntar.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14+ (App Router), TypeScript, Tailwind |
| Gráficos | Recharts |
| Gestão visual | SVG inline + React (preparado para trocar por viewer IFC no futuro) |
| Backend/dados | Supabase (Postgres + Auth + Storage) |
| Deploy | Vercel |
| Testes | Vitest (unit/component) + Playwright (e2e dos fluxos críticos) |

## Convenções deste projeto

- Comentários sempre em português; variáveis/funções em `camelCase` em inglês; tabelas e colunas do banco em `snake_case` em português (ex.: `atividades`, `percentual_concluido`).
- Nunca usar `localStorage` — Supabase é o storage.
- `.env` nunca vai para o Git; conferir `.gitignore` antes de qualquer commit.
- Identidade visual: creme `#F0EAD8`, vermelho escuro `#8B1A1A`, ouro `#E8A020`; títulos em Playfair Display, corpo em Crimson Pro. Tom refinado e técnico.

## Regras de negócio críticas (não simplificar)

1. **Concretagem**: pedido mínimo de concreto é **5 m³**. Sempre combinar sobras entre etapas/frentes antes de pedir um caminhão abaixo do mínimo (ver plano de concretagem).
2. **Concreto é compra direta da contratada**, faturado pela contratante — nunca somar ao valor de mão de obra do contrato do terceirizado no módulo de orçamento.
3. **Escopo geográfico**: qualquer atividade, elemento visual ou projeto fora do muro perimetral (emissário final, rede coletora externa) não entra no cronograma nem na gestão visual deste app.
4. **Curva S e % de evolução física** são derivados de `lib/calculos/` — nunca calculados ad-hoc dentro de componentes de UI.

## Regra de ouro: orquestração de subagentes

Este projeto usa uma stack de subagentes especializados, cada um dono de uma área do código (ver `docs/ORQUESTRACAO_SUBAGENTES.md` e `.claude/agents/`). Antes de considerar qualquer tarefa concluída:

1. Identifique o(s) agente(s) dono(s) do código alterado e delegue a eles.
2. Se a alteração tocar `lib/calculos/`, `supabase/migrations/`, `scripts/import-smartsheet.ts` ou qualquer tipo compartilhado, **acione obrigatoriamente o agente `qa-regressao`** para rodar a suíte de testes completa antes de finalizar.
3. Nenhuma tarefa é considerada concluída sem testes passando. Se não houver teste cobrindo a mudança, escreva o teste antes de finalizar.
4. Para mudanças em mais de um módulo, finalize com o agente `revisor-codigo`.

## Não fazer

- Não usar Next.js/React fora deste projeto (padrão pessoal do usuário é vanilla por padrão em outros contextos — aqui a stack acima é a decisão já tomada e documentada).
- Não misturar regras de escopo externo (emissário, rede coletora) neste app.
- Não marcar tarefa como concluída com testes quebrados ou ausentes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
