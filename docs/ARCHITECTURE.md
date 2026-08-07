# Arquitetura — App de Gestão de Obra: EEE Novo Mundo

> Documento vivo. Cada agente dono de uma área anexa a sua seção aqui.
> Contexto e escopo completos em `docs/PLANO_EXECUCAO_APP_GESTAO_EEE.md`.
> Divisão de responsabilidades em `docs/ORQUESTRACAO_SUBAGENTES.md`.

---

## 1. Banco de dados (Supabase / Postgres) — dono: `arquiteto-dados`

### 1.1 Migrations

Aplicação em ordem alfabética do nome do arquivo (padrão do Supabase CLI):

| Arquivo em `supabase/migrations/` | Conteúdo |
|---|---|
| `20260805120000_extensoes_enums_utilitarios.sql` | `pgcrypto`, os 4 enums do domínio, função de trigger `tocar_atualizado_em()` |
| `20260805120100_perfis_auth.sql` | `perfis` (1:1 com `auth.users`), trigger de signup, helpers de RLS |
| `20260805120200_projetos_grupos_elementos.sql` | `projetos`, `grupos_macro`, `elementos_visuais` |
| `20260805120300_atividades_avancos.sql` | `atividades`, `avancos_semanais` |
| `20260805120400_diario_fotos.sql` | `diario_obra`, `fotos_evidencia` |
| `20260805120500_concretagem_orcamento.sql` | `concretagem_pedidos`, `orcamento_itens` |
| `20260805120600_views_derivadas.sql` | Views de progresso e resumo de orçamento |
| `20260805120700_rls_politicas.sql` | RLS habilitada e políticas por perfil |
| `20260805120800_storage_fotos.sql` | Bucket privado `fotos-obra` e políticas de Storage |
| `20260805120900_atividades_caminho_wbs.sql` | Correção da chave de upsert: `atividades.caminho_wbs` e `grupos_macro.nome_smartsheet` |
| `supabase/seed.sql` | Projeto, 7 grupos macro do WBS e 9 elementos visuais |

Regra: **migration aplicada nunca é editada** — toda mudança vira um arquivo novo.
As migrations são idempotentes onde faz sentido (`create ... if not exists`,
`drop policy if exists` antes de `create policy`, `on conflict do nothing`).

### 1.2 Diagrama de relações

```
auth.users
   └─1:1─ perfis (id, nome, perfil[gestor|fiscal|campo])
             ├─◀ avancos_semanais.registrado_por
             ├─◀ diario_obra.autor_id
             └─◀ fotos_evidencia.criado_por

projetos (E.E.E. - NOVO MUNDO)
   ├─1:N─ grupos_macro (7 grupos de nível 1 do WBS; UNIQUE projeto_id + nome_smartsheet)
   │         └─1:N─ atividades (310; UNIQUE grupo_macro_id + caminho_wbs) ┐
   │                    │            │  (0..1)
   │                    │            └──▶ elementos_visuais
   │                    ├─1:N─ avancos_semanais (UNIQUE atividade_id + semana)
   │                    └─1:N─ fotos_evidencia
   └─1:N─ diario_obra (UNIQUE projeto_id + data)
             └─1:N─ fotos_evidencia

elementos_visuais ─1:N─ fotos_evidencia
                  ─1:N─ concretagem_pedidos.elemento_visual_id (opcional)

concretagem_pedidos   (independente — etapas 1..4 do plano de concretagem)
orcamento_itens       (independente — 7 categorias da aba ORÇAMENTO)

Views derivadas (security_invoker = on):
  elementos_visuais_progresso   ← elementos_visuais + atividades
  grupos_macro_progresso        ← grupos_macro + atividades
  orcamento_resumo_categoria    ← orcamento_itens
```

### 1.3 Decisões

**Chave estável de upsert das atividades: `UNIQUE (grupo_macro_id, caminho_wbs)`.**
O export `.xlsx` do Smartsheet não traz ID externo por linha, então a identidade
precisa vir do próprio conteúdo. A primeira versão do schema usava
`UNIQUE (grupo_macro_id, nome)` e **estava errada**: o dry-run sobre o arquivo
real mostrou que o ramo "E.E.E. - NOVO MUNDO" tem 7 grupos macro e 310
atividades, mas o nome curto se repete demais dentro do mesmo grupo — só em
CIVIL, "Concretagem" aparece 35×, "Formas" 27× e "Ferragem" 25×. Com o nome
curto, as **310 atividades colapsavam em 159 chaves** e o import perderia 151
linhas em silêncio.

Correção (migration `20260805120900`): a identidade passou a ser
`atividades.caminho_wbs` — o caminho WBS completo dentro do grupo macro, com os
segmentos unidos por `" > "` (ex.: `"Elevatória de esgoto bruto > Fosso de sucção
> Laje de fundo > Concretagem"`), único em 310/310. A coluna `nome` voltou a ser
apenas o **nome curto** (último segmento), sem unicidade — é o que a UI exibe,
sem precisar fatiar string. Índice de apoio: `(grupo_macro_id, nome)`.

Consequência conhecida e documentada em `COMMENT ON CONSTRAINT`: renomear um
**ancestral** no Smartsheet muda o caminho de todos os descendentes, que entram
como linhas novas e deixam as antigas órfãs. O `scripts/import-smartsheet.ts`
deve detectar e reportar órfãos, nunca silenciá-los.

**Nome canônico dos grupos macro: `grupos_macro.nome_smartsheet`.**
Os nomes de nível 1 no `.xlsx` estão em caixa alta e com pontuação própria
(`SERVIÇOS PRELIMINARES`, `DRENAGEM - Canal e muro`,
`DRAGAGEM E POSSÍVEL REBAIXAMENTO DE COTA DA LÂMINA DO CANAL`), enquanto a UI
usa os rótulos legíveis da seção 3 do plano (`Serviços Preliminares`,
`Drenagem — Canal e muro`). Em vez de manter um mapa `GRUPOS_MACRO_CANONICOS`
dentro do script de import, a correspondência virou **dado**: `nome_smartsheet`
(string exata do arquivo, `UNIQUE (projeto_id, nome_smartsheet)` — chave de
casamento do import) e `nome` (rótulo exibido). As 7 strings foram conferidas
diretamente no `.xlsx` real e estão no `supabase/seed.sql`. Se o Smartsheet
mudar um nome de grupo, corrige-se uma linha do seed, não o código do importador.

**`percentual_concluido` de elemento visual e de grupo macro é derivado, não coluna.**
Persistir esse número criaria duas fontes de verdade que dessincronizam a cada
reimportação do Smartsheet e a cada lançamento de produção — Painel e Gestão
Visual passariam a divergir do Cronograma. A definição da seção 4 do plano
(média das atividades vinculadas) está implementada na view
`elementos_visuais_progresso` e na função `percentual_elemento(uuid)`. A view
também expõe `percentual_ponderado_duracao` e `faixa_progresso`
(`nao_iniciado` / `em_andamento` / `concluido`) para colorir o SVG.
Isso é conveniência de leitura: os cálculos oficiais de indicador e Curva S
continuam em `lib/calculos/` (dono: `motor-indicadores`).

**Estratégia de RLS.** RLS habilitada em todas as 10 tabelas. As políticas nunca
consultam `public.perfis` diretamente — usam os helpers `perfil_atual()`,
`eh_gestor()`, `eh_gestor_ou_fiscal()` e `eh_usuario_do_app()`, todos
`SECURITY DEFINER` com `search_path` fixo (`public, pg_temp`). Isso evita
recursão infinita de política sobre `perfis` e fecha a porta para sequestro de
`search_path`. Usuário anônimo não lê nada.

| Tabela | gestor | fiscal | campo |
|---|---|---|---|
| `perfis` | tudo | lê o próprio | lê o próprio |
| `projetos`, `grupos_macro`, `elementos_visuais`, `atividades` | tudo | leitura | leitura |
| `concretagem_pedidos`, `orcamento_itens` | tudo | leitura | leitura |
| `avancos_semanais` | tudo | leitura + escrita | leitura + escrita só do que registrou |
| `diario_obra` | tudo | leitura + escrita | leitura + escrita só do que registrou |
| `fotos_evidencia` | tudo | leitura + escrita | leitura + escrita só do que registrou |

Novo usuário entra sempre como `campo` (menor privilégio); o papel pode vir de
`raw_user_meta_data->>'perfil'` no convite, e qualquer valor inválido cai em
`campo`. Promoção de perfil é operação de `gestor`.

**Regras de negócio viradas constraint.**

- `concretagem_pedidos_volume_minimo`: `volume_m3 >= 5 OR combinado_com_sobra`.
  O pedido mínimo de concreto é 5 m³; volume menor só é aceito quando a sobra foi
  combinada com outra etapa/frente no mesmo caminhão (coluna `combinado_com_sobra`).
- `concretagem_pedidos_data_realizada_coerente`: status `concretado` exige
  `data_realizada`.
- `orcamento_itens.eh_compra_direta`: concreto é compra direta da contratada,
  faturado pela contratante. A view `orcamento_resumo_categoria` separa
  `valor_mao_de_obra` de `valor_compra_direta` — totalizações do contrato do
  terceirizado sempre filtram `eh_compra_direta = false`.
- `avancos_semanais_segunda_feira`: `semana_referencia` é sempre a segunda-feira
  da semana ISO, normalizando a grade semanal da Curva S.
- `atividades_percentual_valido` e limites 0–100 nos percentuais.

**Colunas extras além da seção 4 do plano** (necessárias, documentadas em SQL):
`elementos_visuais.ifc_global_id` (troca futura do SVG por viewer IFC sem mexer
no modelo), `fotos_evidencia.criado_por` (sem ela a RLS do perfil `campo` é
impossível), `concretagem_pedidos.combinado_com_sobra` e
`concretagem_pedidos.elemento_visual_id`, `orcamento_itens.eh_compra_direta`,
`diario_obra.projeto_id`, `atividades.caminho_wbs` e `grupos_macro.nome_smartsheet`
(as duas chaves de upsert do import, ver acima), colunas `criado_em`/`atualizado_em`.

**Índices** criados nos filtros reais da UI: `atividades` por `grupo_macro_id`,
por `(grupo_macro_id, nome)`,
por `elemento_visual_id`, índice parcial por `caminho_critico`, por
`data_inicio_planejada`, por `data_fim_planejada` e composto para a janela da
semana atual; `avancos_semanais` com `UNIQUE (atividade_id, semana_referencia)`
mais índices por semana e por autor; `orcamento_itens` por categoria e por
compra direta; `concretagem_pedidos` por status, etapa e data prevista.

**Storage.** Bucket privado `fotos-obra` (acesso por signed URL).
`fotos_evidencia.storage_path` é a ponte entre a linha do banco e o objeto.
As políticas de `storage.objects` são criadas com tratamento de exceção: se o
papel que roda a migration não tiver privilégio, o log avisa e elas devem ser
criadas pelo painel do Supabase com as mesmas regras.

### 1.4 Cliente Supabase (`lib/supabase/`)

| Arquivo | Uso |
|---|---|
| `env.ts` | Leitura validada de `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `client.ts` | `createClient()` para Client Components (anon key, instância única por aba) |
| `server.ts` | `createClient()` por request para Server Components/Actions/Route Handlers, mais `getUsuarioAtual()` e `getPerfilAtual()` |
| `middleware.ts` | `atualizarSessao(request)` — renova o token e grava os cookies na resposta |
| `admin.ts` | `createAdminClient()` com service role, **somente servidor/script**; lança erro se detectar `window` |

A `SUPABASE_SERVICE_ROLE_KEY` nunca é prefixada com `NEXT_PUBLIC_` e só é lida em
`admin.ts` — usada pelo `scripts/import-smartsheet.ts`, que por isso ignora RLS.

### 1.5 Tipos (`types/database.ts`)

Escritos à mão enquanto o projeto Supabase não existe; o cabeçalho do arquivo traz
o comando `supabase gen types typescript` para regenerar depois. O bloco final
"Tipos de conveniência" (`Atividade`, `GrupoMacro`, `ElementoVisual`,
`AvancoSemanal`, `DiarioObra`, `ConcretagemPedido`, `OrcamentoItem`,
`PerfilUsuario`, os `*Insert` e a constante `VOLUME_MINIMO_CONCRETO_M3`) precisa
ser reanexado manualmente após qualquer regeneração pelo CLI.

---

## 2. Motor de indicadores (`lib/calculos/`) — dono: `motor-indicadores`

Funções **puras**: sem I/O, sem React, sem Supabase, sem `new Date()` interno.
Recebem dados já carregados e devolvem números/objetos. Consumidores (Painel,
Cronograma, Curva S, Gestão Visual) importam **sempre de `@/lib/calculos`**,
nunca dos arquivos internos — e nunca reimplementam fórmula em componente
(regra 4 do `CLAUDE.md`).

### 2.1 Arquivos

| Arquivo | Conteúdo |
|---|---|
| `tipos.ts` | Contratos de entrada (`AtividadeCalculo`, `AvancoSemanalCalculo`), filtros, ponderação, `limitarPercentual`, `arredondar`, `filtrarAtividades` |
| `datas.ts` | Aritmética de datas em UTC, semana ISO, `semanasRestantes` |
| `progresso.ts` | Faixa de progresso (`nao_iniciado`/`em_andamento`/`concluido`) |
| `evolucao.ts` | % de evolução física: geral, por grupo macro, por elemento visual |
| `prazo.ts` | Linha de base planejada e status de prazo |
| `curva-s.ts` | Agregação semanal planejado × realizado |
| `painel.ts` | Composição pronta dos indicadores de topo |
| `index.ts` | Superfície pública (barrel) |

### 2.2 API pública

**Datas** — `paraDataUTC`, `formatarDataISO`, `adicionarDias`, `diferencaEmDias`,
`segundaFeiraDaSemana`, `domingoDaSemana`, `chaveSemana`, `listarSemanas`,
`diasRestantes`, `semanasRestantes(dataReferencia, dataFimPlanejada)`.

**Evolução física** — `percentualEvolucaoGeral`, `percentualPorGrupoMacro`,
`percentualPorElementoVisual`, `percentuaisPorElementoVisual`,
`faixaProgressoElemento`, `mediaPonderada`, `pesoAtividade`, `resumirAtividades`.

**Prazo** — `statusPrazo(atividades, dataReferencia, opcoes)`,
`statusPrazoPorSeries(dataReferencia, curvaPlanejada, curvaRealizada)`,
`percentualPlanejadoAtividade`, `percentualPlanejadoAcumulado`,
`classificarDesvioPrazo`, `TOLERANCIA_STATUS_PRAZO_PP`.

**Curva S** — `agregarCurvaS(atividades, avancos, opcoes)`, `seriesCurvaS`,
`pontoDaSemana`.

**Gestão Visual** — `faixaProgresso`, `rotuloFaixaProgresso`,
`ROTULOS_FAIXA_PROGRESSO`, `LIMIAR_INICIO_PP`, `LIMIAR_CONCLUSAO_PP`.

**Painel** — `montarIndicadoresPainel({ atividades, dataReferencia, dataFimPlanejada, filtros })`
devolve em uma chamada: `% geral`, faixa, `prazo`, `semanasRestantes`, `resumo`
(total/críticas/concluídas/…), `porGrupoMacro` e `porElementoVisual`.

Todas as agregações aceitam o mesmo `FiltrosAtividade`:
`gruposMacroIds`, `elementosVisuaisIds`, `apenasCaminhoCritico`,
`apenasComElementoVisual`.

### 2.3 Fórmulas e decisões

**% de evolução física = média ponderada por duração.**

```
% = Σ (percentual_concluido_i × peso_i) / Σ peso_i        peso_i = duracao_dias_i
```

Média simples faria "limpeza final" pesar igual a "escavação do poço úmido".
A troca futura para **custo** já está pronta: `{ base: 'custo', custoPorAtividadeId }`
— a fórmula não muda, muda só a origem do peso. Enquanto o orçamento do
terceirizado não estiver amarrado atividade a atividade, a base é duração.

`PESO_PADRAO_ATIVIDADE = 1`: atividade com duração nula/zero/negativa entra com
peso 1, **não** com peso 0 — com peso 0 ela sumiria da média e o indicador
ficaria otimista, escondendo cadastro incompleto vindo do Smartsheet.

**Linha de base planejada = progressão linear entre as datas planejadas**,
com contagem de dias **inclusiva** nas duas pontas (coerente com `duracao_dias`
do Smartsheet, onde 15/05→15/05 tem duração 1):

```
planejado_i(d) = 0                                        se d < início
               = 100                                      se d >= fim
               = 100 × (d − início + 1) / (fim − início + 1)   caso contrário
```

Atividade **sem datas fica fora da linha de base** (nem numerador nem
denominador) e é devolvida em `atividadesSemDatas` — silenciar isso mascararia
um import incompleto.

**Tolerância do status de prazo: `TOLERANCIA_STATUS_PRAZO_PP = 2` (±2 p.p.).**
Desvio = realizado − planejado. `> +2` adiantado, `< −2` atrasado, no intervalo
fechado `no_prazo`. Constante exportada e sobrescrevível
(`toleranciaPontosPercentuais`), nunca escondida dentro de um `if`: abaixo de
2 p.p. o ruído de um lançamento semanal faria o card oscilar sem significado
gerencial.

**Convenção de semana: semana ISO começando na SEGUNDA-FEIRA.** A chave de cada
ponto da Curva S (`ponto.semana`) é a segunda-feira, exatamente no formato de
`avancos_semanais.semana_referencia` (constraint `extract(isodow) = 1`). O ponto
representa a situação ao **fim** da semana, medida no domingo (`ponto.fimSemana`)
— é assim que o lançamento de produção funciona: fecha-se a semana e registra-se
o acumulado.

**Realizado da Curva S** vem de `avancos_semanais` com **carry-forward** (semana
sem lançamento mantém o acumulado anterior, não zera) e **para no presente**:
semanas posteriores ao último lançamento recebem `realizadoAcumulado: null`, a
curva realizada nunca é extrapolada. O planejado da curva vem das datas
(`fontePlanejado: 'datas'`, padrão) ou dos lançamentos (`'avancos'`).

**Tudo em UTC.** Colunas `date` do Postgres chegam como `'YYYY-MM-DD'`;
interpretá-las no fuso local faria a obra "andar um dia" entre o navegador em
America/Recife e a Vercel em UTC. Datas inválidas devolvem `null`/0 — nenhuma
função lança.

**`semanasRestantes` arredonda para cima** (semana começada é semana a
trabalhar): 05/08/2026 → 26/01/2027 = 174 dias = 24,86 → **25 semanas**.

**Faixa de progresso é função única e compartilhada** (`faixaProgresso`), usada
por SVG, cards e testes, espelhando a view `elementos_visuais_progresso`:
`<= 0` não iniciado, `>= 100` concluído, o resto em andamento. Diferença
proposital em relação à view: o % oficial do elemento no app é o **ponderado por
duração** (mesma fórmula do Painel), correspondente à coluna
`percentual_ponderado_duracao`; a média simples da view é conveniência de leitura
no SQL.

### 2.4 Testes (`tests/calculos/`)

`fixtures.ts` monta uma carteira **sintética** (não é o cronograma real) de 317
atividades calibrada para reproduzir o snapshot de 05/08/2026 do plano:
**6% geral**, Serviços Preliminares **100%**, Terraplenagem **46%**, **34**
atividades críticas, fim planejado 26/01/2027 (**25 semanas** restantes) e
planejado de 18,3% na data → status **atrasado**. A memória de cálculo dos pesos
está comentada no arquivo. Qualquer mudança de fórmula quebra esses testes de
regressão — que é o objetivo, já que número errado na tela não gera erro de
compilação.

Arquivos: `datas.test.ts`, `evolucao.test.ts`, `prazo.test.ts`,
`curva-s.test.ts`, `progresso.test.ts`, `painel.test.ts`. Bordas cobertas: lista
vazia, duração 0/negativa/nula, atividade sem datas, datas invertidas,
percentual fora de 0–100, lançamento órfão, semana inválida e divisão por zero.

---

## 3. Import do cronograma (Smartsheet → Supabase) — dono: `importador-cronograma`

### 3.1 Arquivos

| Arquivo | Papel |
|---|---|
| `scripts/import-smartsheet.ts` | Entrypoint CLI: flags, `.env.local`, impressão do resumo, orquestração |
| `scripts/import/parser.ts` | Leitura do `.xlsx` (exceljs) + reconstrução do WBS + filtro de escopo |
| `scripts/import/mapeamento-elementos.ts` | Regras explícitas caminho WBS → `elementos_visuais` |
| `scripts/import/resumo.ts` | Agregados de conferência e validação contra os números conhecidos |
| `scripts/import/upsert.ts` | Montagem de payload (puro) + escrita no Supabase |
| `scripts/import/tipos.ts` | Tipos do domínio do import |
| `tests/import/parser.test.ts` | Parser sobre a fixture pequena (comportamento) |
| `tests/import/upsert.test.ts` | Payload, idempotência e órfãs |
| `tests/import/arquivo-real.test.ts` | Regressão de ESCALA contra o `.xlsx` real |
| `tests/fixtures/cronograma-smartsheet.json` | Recorte anonimizado do arquivo real |

Biblioteca de planilha: **`exceljs`**. `xlsx` da npm está proibida no projeto (CVEs
sem correção publicada).

### 3.2 Uso

```bash
npm run import:cronograma -- --dry-run          # padrão: só imprime o diff
npm run import:cronograma -- --apply            # grava no banco
npm run import:cronograma -- --apply --prune    # grava E remove as órfãs
npm run import:cronograma -- --arquivo "outro.xlsx"
```

**Escrita exige `--apply` explícito.** Sem ele o script é sempre dry-run — inclusive
`--prune` sozinho não apaga nada. Sem `NEXT_PUBLIC_SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` o dry-run continua rodando offline (valida o `.xlsx` e
imprime o resumo) e o `--apply` falha com mensagem clara, sem travar.

### 3.3 Filtro de escopo

O `.xlsx` é o macro-cronograma corporativo inteiro. O parser localiza a linha de
`Atividade = "E.E.E. - NOVO MUNDO"` e recorta dela até a próxima linha de nível
menor ou igual. No arquivo de 05/08/2026 isso descarta **32 linhas** de
"MARCOS CONDICIONANTES...", "Engenharia de Produto", "Engenharia de Custos",
"Suprimentos EC" e "Sustentabilidade, Legalização e Diretoria" (mais 16 linhas em
branco do export). Se o ramo não for encontrado, o import **aborta** — importar o
cronograma corporativo inteiro violaria a regra 3 do CLAUDE.md.

### 3.4 Chaves de upsert

Definidas na migration `20260805120900_atividades_caminho_wbs.sql`:

```
grupos_macro  UNIQUE (projeto_id, nome_smartsheet)
atividades    UNIQUE (grupo_macro_id, caminho_wbs)
```

**Por que não o nome curto da atividade.** Medição no arquivo real: chaveando por
`(grupo_macro_id, nome)`, as 310 atividades colapsam em **159 chaves** — só em
`CIVIL`, `Concretagem` aparece 35×, `Formas` 27× e `Ferragem` 25×. O import perderia
151 linhas em silêncio. O caminho WBS completo dentro do grupo é único em 310/310.
`atividades.nome` é o nome curto que a UI exibe e **não tem unicidade**.

**Por que os grupos casam por `nome_smartsheet`.** O `.xlsx` traz
`SERVIÇOS PRELIMINARES` / `DRENAGEM - Canal e muro`; a UI mostra
`Serviços Preliminares` / `Drenagem — Canal e muro`. A correspondência é **dado no
`seed.sql`**, não um mapa de tradução dentro do script (o antigo
`GRUPOS_MACRO_CANONICOS` foi removido).

**Cuidado com o rótulo da UI.** O upsert do Supabase atualiza todas as colunas
enviadas. Como o import só conhece a string crua, `montarPayloadGrupos()` recebe os
rótulos já gravados (`buscarGruposExistentes()`) e os reenvia inalterados; a string
do `.xlsx` só vira `nome` quando o grupo ainda não existe. Sem isso, cada import
rebaixaria "Drenagem — Canal e muro" para "DRENAGEM - Canal e muro" na tela.

### 3.5 Idempotência e órfãs

`montarPayloadAtividades()` é determinística — sem `Date.now()`, sem `uuid()`, sem
`criado_em`/`atualizado_em`. Rodar o import duas vezes gera exatamente o mesmo
payload e o mesmo `on conflict do update`. Colisões dentro do lote são resolvidas
mantendo a primeira ocorrência (evita o erro do Postgres "ON CONFLICT DO UPDATE
command cannot affect row a second time") e são reportadas.

Atividades **órfãs** (existem no banco, sumiram do `.xlsx`) são detectadas por
`(grupo_macro_id, caminho_wbs)` e nunca apagadas automaticamente: podem ter
`avancos_semanais`, `fotos_evidencia` e RDO pendurados. São listadas em destaque e
só removidas com `--apply --prune`.

**Consequência conhecida da chave por caminho:** renomear um nó **ancestral** no
Smartsheet muda o caminho de todos os descendentes de uma vez — um único rename lá
pode produzir dezenas de órfãs aqui, sem que a obra tenha perdido atividade. O
relatório do script diz isso explicitamente para evitar um `--prune` precipitado.

### 3.6 Vínculo atividade → elemento visual

`REGRAS_ELEMENTO_VISUAL` é uma lista ordenada de regras explícitas sobre o caminho
WBS normalizado (sem acento, minúsculo). Primeira regra que casa vence; nenhuma
casou → `elemento_visual_id = null`, e a atividade simplesmente não colore o SVG.
Taxa de vínculo no arquivo real: **248/310 (80%)**.

Casos negativos garantidos por teste: `ELÉTRICA > Instalação de medidor de vazão do
macromedidor` **não** vincula à `caixa_medidor_vazao` (é serviço elétrico, não a
estrutura), e `DRENAGEM > muro em concreto ciclópico` **não** vincula ao
`muro_perimetral` (é o muro do canal, outro elemento).

`elementos_visuais.percentual_concluido` **não é recalculado pelo import** porque
não é coluna: é derivado nas views `elementos_visuais_progresso` /
`percentual_elemento(uuid)` (seção 1.3). O que o import mantém atualizado é
`atividades.elemento_visual_id`, que é o insumo dessas views. A fórmula oficial de
indicador continua sendo do `motor-indicadores` (`lib/calculos/`).

### 3.7 Validação contra os números reais

`NUMEROS_ESPERADOS` (`scripts/import/resumo.ts`) guarda o snapshot de 05/08/2026 do
plano. Toda divergência é impressa em bloco de destaque, nunca silenciada.
Execução real de 05/08/2026 — **todos os números conferem**:

| Métrica | Obtido | Esperado |
|---|---|---|
| Linhas no ramo | 317 | 317 |
| Grupos macro | 7 | 7 |
| Atividades (níveis 2..6) | 310 | — |
| Em caminho crítico | 34 | 34 |
| Data mínima de início | 2026-05-15 | 15/05/2026 |
| Data máxima de término | 2027-01-26 | 26/01/2027 |
| % geral (rollup do Smartsheet na raiz) | 6% | 6% |

Ressalva de leitura: as **317 linhas do ramo são 7 grupos macro + 310 atividades**.
O plano diz "317 atividades" contando os grupos de nível 1 junto.

Os agregados `% média simples` (1.75%) e `% folhas ponderado por duração` (3.34%)
são **conferência de import**, não indicador: divergem dos 6% porque o Smartsheet
faz o próprio rollup e porque 304 das 310 atividades estão com `% Concluída` vazia
(tratada como 0). O número oficial do Painel vem de `lib/calculos/`.

### 3.8 Teste de regressão de escala

`tests/import/arquivo-real.test.ts` roda contra `Materiais/EEE - Novo Mundo.xlsx` e
trava numericamente a correção da chave: o payload precisa ter **310 chaves
`(grupo_macro_id, caminho_wbs)` distintas**, enquanto chavear pelo nome curto
produz apenas **159** (as tais 151 linhas perdidas), com `Concretagem` 35×,
`Formas` 27× e `Ferragem` 25× dentro de `CIVIL`. Também garante que nenhum `nome`
carrega `" > "` e que o último segmento do `caminho_wbs` é sempre o `nome`.

A fixture pequena cobre **comportamento**; só o arquivo real cobre **escala** — e
foi exatamente a escala que passou despercebida na primeira versão. Se o `.xlsx`
sumir, o teste falha em vez de passar em silêncio.
