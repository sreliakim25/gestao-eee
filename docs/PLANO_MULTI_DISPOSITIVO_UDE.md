# Plano de Execução — Expansão Multi-Dispositivo (UDE)

> Documento para ser lido pelo Claude Code antes de continuar esta frente. Complementa
> `docs/PLANO_EXECUCAO_APP_GESTAO_EEE.md` (Fases 0–7, concluídas) — não o substitui.
> Regras de orquestração de subagentes em `docs/ORQUESTRACAO_SUBAGENTES.md`.

---

## 1. Contexto e motivação

O app nasceu para gerenciar uma obra só: a EEE Novo Mundo. As Fases 0–7 do plano original
foram entregues e estão em produção — painel, cronograma, curva S, lançamento de produção,
gestão visual em SVG, diário de obra, concretagem, orçamento e análise IA, todos funcionando
sobre um único `projeto`.

A UDE (Unidade de Dispositivos Especiais da Viana & Moura) tem mais de um dispositivo em
acompanhamento — Novo Mundo é o primeiro, mas Caruaru, Garanhuns e SC (nomes de trabalho,
a confirmar) também precisam entrar no mesmo app. Em vez de duplicar o projeto para cada
obra nova, o app passa a ser multi-dispositivo: **login → escolher UGB → escolher
dispositivo → módulos** (painel, cronograma, curva S etc., iguais aos de hoje, mas
escopados ao dispositivo escolhido).

Esta expansão é **aditiva sobre o schema existente**: nenhuma tabela é recriada, nenhuma
query de hoje muda de resultado até a navegação por dispositivo existir de fato. O objetivo
do schema é nunca deixar o único projeto atual (EEE Novo Mundo) quebrado enquanto o resto é
construído por cima.

---

## 2. O que já está pronto (schema)

Seis migrations já escritas e testadas localmente (405 testes passam), cobrindo a base de
dados para o modelo multi-dispositivo:

| Migration | Entrega |
|---|---|
| `20260813100000_ugbs.sql` | Tabela `ugbs` + `projetos.ugb_id` (nullable) |
| `20260813100100_projetos_capacidades_modulo.sql` | `projetos.modulo_concretagem_habilitado` / `modulo_orcamento_habilitado` |
| `20260813100200_elementos_visuais_projeto.sql` | `elementos_visuais.projeto_id` — Gestão Visual deixa de ser global |
| `20260813100300_fotos_evidencia_projeto.sql` | `fotos_evidencia.projeto_id` — vínculo direto com o dispositivo |
| `20260813100400_concretagem_orcamento_projeto.sql` | `concretagem_pedidos.projeto_id` / `orcamento_itens.projeto_id` |
| `20260813100500_projeto_planilhas_smartsheet.sql` | Tabela `projeto_planilhas_smartsheet` (N:N dispositivo↔planilha) |
| `20260820100000_seed_ugbs_reais.sql` | Seed das 6 UGBs reais (Caruaru, Garanhuns, Igarassu, Santa Cruz, Jaboatão dos Guararapes, São Lourenço da Mata) e atribuição de `projetos.ugb_id` do dispositivo existente (EEE Novo Mundo → Caruaru) |

Também já feito: `lib/smartsheet/config-dispositivos.ts` — registro explícito de configuração
de import por dispositivo (poda de ramo + mapeamento de elemento visual), para o importador
parar de assumir que só existe a EEE Novo Mundo.

Todas as migrations acima já foram aplicadas no Supabase (via `npm run db:aplicar -- --apply`)
e commitadas.

---

## 3. O que falta (visão geral)

Hoje, mesmo com o schema pronto, a experiência do usuário continua sendo a de um app de
projeto único: não existe seletor de UGB, não existe seletor de dispositivo, e todas as
rotas (`app/cronograma`, `app/orcamento`, ...) buscam dados sem filtrar por `projeto_id`
explícito — implicitamente, o único projeto que existe. Falta:

1. Aplicar e commitar o schema já pronto.
2. Navegação pós-login: UGB → dispositivo → módulos.
3. Toda leitura/escrita do app passar a ser escopada por dispositivo selecionado (via rota
   ou contexto), não mais implícita.
4. Seed das UGBs e dos novos dispositivos reais.
5. Migrar as leituras que ainda dependem de `projetos.smartsheet_sheet_id` /
   `smartsheet_sincronizado_em` (legado) para `projeto_planilhas_smartsheet`.
6. Decidir o que Concretagem e Orçamento fazem para dispositivos sem esse conteúdo
   (hoje o plano de concretagem e o quantitativo do terceirizado são hardcoded à EEE Novo
   Mundo — a flag de capacidade só esconde a aba, não generaliza o conteúdo).
7. IFC/Revit (ponto em aberto herdado do plano original, seção 9) continua fora desta
   frente — não é bloqueador.

---

## 4. Fases de execução

| Fase | Entrega | Dono (subagente) |
|---|---|---|
| 0 | Aplicar as 6 migrations pendentes no Supabase (via `scripts/aplicar-schema.ts`), rodar `qa-regressao`, e só então commitar o WIP atual (schema + `config-dispositivos.ts` + skeletons de loading) | `arquiteto-dados` → `qa-regressao` |
| 1 | Seed real: popular `ugbs` e os dispositivos confirmados da UDE; atribuir `projetos.ugb_id` para o registro existente (EEE Novo Mundo) | `arquiteto-dados` |
| 2 | Navegação pós-login: tela de escolha de UGB, tela de escolha de dispositivo dentro da UGB, rota base do dispositivo (`app/[dispositivo]/...` ou equivalente) envolvendo os módulos já existentes | `ui-modulos` |
| 3 | Escopar toda leitura/escrita por `projeto_id` do dispositivo em rota — cronograma, painel, curva S, lançamento, gestão visual, diário; remover qualquer query que hoje assume "o único projeto" | `ui-modulos` + `motor-indicadores` (onde `lib/calculos/` também assumir projeto único) |
| 4 | Migrar leituras de `projetos.smartsheet_sheet_id`/`smartsheet_sincronizado_em` para `projeto_planilhas_smartsheet`; sync (botão + cron) passa a operar por planilha vinculada, não mais 1:1 com o projeto | `importador-cronograma` |
| 5 | Concretagem/Orçamento: exibir a aba só quando a flag de capacidade do dispositivo estiver ligada (já existe no schema); conteúdo de outros dispositivos fica para quando houver quantitativo/plano de concretagem real deles — não simular dado | `concretagem-financeiro` |
| 6 | Regressão completa + revisão cruzada antes de considerar a expansão pronta | `qa-regressao` → `revisor-codigo` |

Cada fase que tocar `lib/calculos/`, `supabase/migrations/`, `scripts/import-smartsheet.ts`
ou tipos compartilhados aciona `qa-regressao` obrigatoriamente, conforme a regra de ouro do
`CLAUDE.md`.

---

## 5. Regras que não podem ser simplificadas nesta frente

1. Nenhuma migration pode quebrar o projeto EEE Novo Mundo existente — todo backfill já
   escrito segue esse princípio; novas migrations desta expansão devem seguir o mesmo.
2. Nenhum dado de outro dispositivo (planta, quantitativo, plano de concretagem) é
   inventado ou copiado do padrão da EEE Novo Mundo — cada dispositivo só ganha
   Gestão Visual/Concretagem/Orçamento quando tiver conteúdo real importado ou desenhado.
3. `projetos.smartsheet_sheet_id` continua funcionando como legado até a Fase 4 migrar as
   leituras — não remover a coluna antes disso.
4. Regras de negócio herdadas do app original (pedido mínimo de concreto 5 m³, concreto
   como compra direta separada de mão de obra, escopo dentro do muro perimetral) valem
   para **todos** os dispositivos, não só a EEE Novo Mundo.

---

## 6. Pontos em aberto para validar com o usuário

- Lista de UGBs já confirmada e aplicada (migration `20260820100000_seed_ugbs_reais.sql`):
  Caruaru, Garanhuns, Igarassu, Santa Cruz, Jaboatão dos Guararapes, São Lourenço da Mata —
  fonte: `Macroplano UDE.xlsx`, aba "MACROPLANO UDE NOVA DIVISÂO". O único dispositivo
  existente (EEE Novo Mundo) foi atribuído à UGB Caruaru. Ainda em aberto: os nomes das EEEs
  específicas dentro das demais UGBs — a planilha lista loteamentos (ex.: Rec. Laranjeiras,
  Jd. Hortências) dentro de cada UGB, mas eles não são as EEEs que este app modela; nenhum
  dispositivo novo foi criado em `projetos` até o usuário confirmar quais EEEs reais existem
  em cada UGB.
- Cada novo dispositivo tem planilha própria no Smartsheet já exportável, ou ainda não
  existe cronograma para eles?
- Enquanto um dispositivo não tem Gestão Visual/Concretagem/Orçamento próprios, a tela
  correspondente deve ficar oculta (recomendado) ou mostrar um estado "ainda não
  disponível"?
- Link do modelo IFC/Revit da EEE Novo Mundo — mesmo ponto em aberto do plano original,
  ainda sem posição.
