# Orquestração de Subagentes — App EEE Novo Mundo

> Como o Claude Code deve dividir o trabalho entre subagentes especializados neste repositório, e como garantir que uma mudança em um módulo não desprograme outro.

## Princípio

Cada área do código tem **um dono**. Nenhum agente edita a área de outro diretamente — ele solicita a mudança ao agente dono ou é acionado pelo orquestrador (a sessão principal do Claude Code, que decide qual agente chamar via `Task`). Toda mudança em código **compartilhado** (consumido por mais de um módulo) aciona obrigatoriamente o `qa-regressao` antes de ser dada como concluída.

## Mapa de agentes

| Agente | Responsabilidade | Pastas que possui | Consome de |
|---|---|---|---|
| `arquiteto-dados` | Schema Postgres, migrations, RLS, cliente Supabase, tipos gerados | `supabase/migrations/`, `lib/supabase/`, `types/database.ts` | — (base de tudo) |
| `importador-cronograma` | Parser do `.xlsx` do Smartsheet, upsert de `atividades`/`grupos_macro` | `scripts/import-smartsheet.ts` | `arquiteto-dados` |
| `motor-indicadores` | Cálculos puros: % evolução, status de prazo, semanas restantes, agregação da Curva S | `lib/calculos/` | `arquiteto-dados` (tipos) |
| `ui-modulos` | Componentes e rotas Next.js: Painel, Cronograma, Curva S, Lançamento, Diário de Obra | `app/`, `components/` (exceto gestão visual) | `motor-indicadores`, `arquiteto-dados` |
| `gestao-visual` | SVG da elevatória, mapeamento de `elementos_visuais`, interação clique → detalhe | `components/gestao-visual/`, `public/svg/` | `motor-indicadores`, `arquiteto-dados` |
| `concretagem-financeiro` | Módulo de Concretagem (checklist, alerta 5m³, status de pedido) e Orçamento/Terceirizado | `app/concretagem/`, `app/orcamento/`, `lib/concretagem/` | `arquiteto-dados` |
| `qa-regressao` | Escreve e roda testes unitários/componentes/e2e; bloqueia conclusão se algo quebrar | `tests/`, `e2e/` | Todos (só leitura do resto) |
| `revisor-codigo` | Revisão final de segurança, consistência e regressão antes de considerar a tarefa pronta | — (somente leitura) | Todos |

## Grafo de dependências e gatilhos obrigatórios de teste

```
arquiteto-dados (schema/tipos)
   ├─▶ importador-cronograma  ─▶ aciona qa-regressao (testes do parser + upsert)
   ├─▶ motor-indicadores      ─▶ aciona qa-regressao (testes unitários: % evolução, curva S, status de prazo)
   │        ├─▶ ui-modulos        ─▶ aciona qa-regressao (testes de componente: Painel, Cronograma, Curva S)
   │        └─▶ gestao-visual     ─▶ aciona qa-regressao (teste de mapeamento elemento → %)
   └─▶ concretagem-financeiro ─▶ aciona qa-regressao (testes de regra: mínimo 5m³, compra direta)
```

Regra prática: **qualquer alteração em `arquiteto-dados` ou `motor-indicadores` é considerada "core"** e obriga rodar a suíte completa (unit + component + smoke e2e), não só os testes do módulo alterado — porque Painel, Cronograma, Curva S e Gestão Visual dependem todos do mesmo cálculo.

## Fluxo de trabalho (Definition of Done)

1. A sessão principal recebe o pedido e identifica o(s) módulo(s) afetado(s) usando o mapa acima.
2. Delega ao(s) agente(s) dono(s) via `Task`, com contexto específico (arquivo, regra de negócio envolvida, o que não deve mudar).
3. O agente implementa e escreve/atualiza os testes da sua própria área.
4. Se a mudança tocou código "core" (`arquiteto-dados` ou `motor-indicadores`) ou mais de um módulo, **aciona `qa-regressao`** para rodar a suíte completa.
5. `qa-regressao` reporta pass/fail. Se falhar, volta para o agente dono do módulo quebrado — não para quem fez a mudança original, salvo se for o mesmo.
6. Para mudanças que tocaram mais de um módulo, `revisor-codigo` faz a revisão final (segurança, RLS, consistência de nomenclatura, regras de negócio) antes de considerar a tarefa concluída.
7. Só então a tarefa é marcada como pronta.

## Estratégia de testes

- **Unitário (Vitest)**: `lib/calculos/` (todas as funções de indicador e curva S) e `scripts/import-smartsheet.ts` (parser, com fixtures do `.xlsx` real anonimizado). Meta: 100% das regras de negócio críticas cobertas (mínimo 5m³, compra direta do concreto, cálculo de status de prazo).
- **Componente (Testing Library)**: renderização condicional por perfil de acesso, filtros do Cronograma (semana atual/críticas/frente), cores da Gestão Visual por faixa de %.
- **E2E (Playwright)**: fluxos críticos — login, lançamento de produção semanal atualizando a Curva S, criação de um pedido de concretagem com alerta de volume abaixo de 5m³, RDO com upload de foto.
- Fixtures de teste devem usar os dados reais já levantados (ex.: Terraplenagem 46%, 34 atividades críticas) para pegar regressões de cálculo com números conhecidos.

## Como invocar cada agente (exemplos)

- "Use o agente `motor-indicadores` para implementar o cálculo de status de prazo (adiantado/no prazo/atrasado)."
- "Use o agente `gestao-visual` para mapear os elementos do SVG aos `elementos_visuais` do banco."
- "Use o agente `qa-regressao` para rodar a suíte completa antes de finalizar — essa mudança tocou `lib/calculos/`."
- "Use o agente `revisor-codigo` para revisar antes de dar como concluído."
