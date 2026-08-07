# Plano de Execução — App de Gestão de Obra: EEE Novo Mundo

> Documento para ser lido pelo Claude Code no início da codificação. Contém escopo, dados reais do projeto, módulos, modelo de dados, stack recomendada e o roadmap de implementação em fases.

---

## 1. Contexto

Obra: **Estação Elevatória de Esgoto (EEE) do Novo Mundo**, executada pela Viana & Moura Construções.
Cronograma mestre mantido no **Smartsheet** (fonte da verdade do planejamento). Parte da execução da elevatória (concreto/armadura) é **terceirizada** — já existe proposta comercial do terceirizado com quantitativos e memória de cálculo.

Este app é o segundo de uma família de apps de gestão de obra da VMC no mesmo padrão do já existente **Emissário Leão Dourado** (`emi-leao-dourado.vercel.app` — referência de módulos e identidade visual, não copiar 100%, pois lá o objeto é uma rede linear georreferenciada e aqui é uma estrutura pontual).

### Escopo do app — MUITO IMPORTANTE

O app cobre **exclusivamente** o que está dentro do muro perimetral da elevatória, ou seja, o ramo do Smartsheet **"E.E.E. - NOVO MUNDO"** (não o macro-cronograma corporativo inteiro, que também tem "Engenharia de Produto", "Suprimentos EC" etc. — esses ficam de fora).

Dentro do escopo (317 atividades, de 15/05/2026 a 26/01/2027):

| Grupo macro (nível 1 do WBS) | Conteúdo |
|---|---|
| Serviços Preliminares | Marcação de obra, gabaritos |
| Dragagem e rebaixamento de cota do canal | 3 trechos |
| Drenagem — Canal e muro | Muro de contenção em concreto ciclópico (~107m), tampas |
| Terraplenagem | Corte, escavação, remoção 3ª categoria, reaterro |
| **Civil** | Elevatória de esgoto bruto (poço de sucção, câmara de grades/escadas, caixas de comporta/válvulas/tanque hidropneumático/medidor de vazão), Instalações hidromecânicas, Casa de comando, Redes internas (SES/SAA/pluvial só até a caixa d'água / PV de entrada), Pavimentação, Muro perimetral |
| Elétrica | Iluminação externa, alimentação, casa de comando, SPDA, energização |
| Outros | Braço giratório, gerador, container de detritos, limpeza final |

**Fora do escopo** (não entra no app): projetos e etapas de **redes externas** — Emissário Final e Rede Coletora Externa fora do muro. Na pasta `Projetos/`, isso corresponde aos arquivos `36-PE-SES-02-R01-REDE COLETORA EXTERNA`, `36-PE-SES-06/07/08-EMISSÁRIO FINAL` e `36-PE-SES-09-DETALHE TRAVESSIA`. Todo o resto da pasta `Projetos/` é referência válida para a Gestão Visual e para o módulo estrutural/concretagem:

| Arquivo | Uso no app |
|---|---|
| 01-R00 Muro de Fechamento / 02-R00 Detalhes Muro | Elemento visual "muro perimetral" |
| 01-R01 Planta Geral | Referência de layout geral (fundo do SVG de gestão visual) |
| 01A02 Compatibilização EEE | Referência estrutural/interferências |
| 03 Estação Elevatória / 04 Locação / EST-01 | Elemento "poço úmido / câmara de grades" |
| 05 Casa de Comando / EST-02 | Elemento "casa de comando" |
| 10 Medidor de Vazão / EST-03 | Elemento "caixa medidor de vazão" |
| EST-04 Caixas Diversas | Elementos "caixa de comporta", "caixa de válvulas" |
| EST-05 Base Tanque Hidropneumático | Elemento "caixa tanque hidropneumático" |
| 11/12 Planta de Detalhes 01/02 | Apoio para desenhar o SVG |

Snapshot em 05/08/2026 (data de hoje): % concluído geral do ramo = **6%**; Serviços Preliminares 100%; Terraplenagem 46%; ~25 semanas até o fim planejado (26/01/2027); 34 das 317 atividades marcadas como caminho crítico.

---

## 2. Fontes de dados já levantadas (usar como seed/base de import)

1. **`Materiais/EEE - Novo Mundo.xlsx`** — export do Smartsheet. Colunas: Nível de hierarquia, Predecessores, % Concluída, Atividade, Duração, Iniciar, Terminar, Está em Caminho Crítico?, Indicador de prazo de entrega, Folga, Há Pulmão?, Sucessoras, Recurso. É a fonte do cronograma/WBS — este arquivo será reexportado periodicamente pelo Smartsheet e reimportado no app (ver módulo de importação, Fase 1).
2. **`Materiais/QUANTITATIVO ESTAÇÃO ELEVATÓRIA DE ESGOTO RL.xlsx`** — proposta do terceirizado. Abas: `ORÇAMENTO` (sintético, 7 categorias, total **R$ 736.324,27**: Serviços Preliminares, Estação Elevatória de Esgoto, Caixa do Tanque Pneumático, Casa de Comando, Muro Externo, Sistema Diversos, Itens Omissos), `MEMÓRIA DE CÁLCULO` (quantitativo detalhado) e `RESUMO DE FERRAGEM` (aço por bitola). Regra de negócio relevante: **concreto é compra direta da contratada, faturado pela contratante** — não faz parte do valor de mão de obra do contrato; isso deve virar um campo separado no módulo de orçamento/concretagem.
3. **`Materiais/Plano_Execucao_Concretagem_EEE.docx`** — plano de concretagem elaborado com base no projeto estrutural, respeitando pedido mínimo de concreto de **5 m³**. Define 4 etapas de concretagem (lajes de fundo → paredes câmara de grades → paredes altas do poço úmido + laje de tampa → acessórios/escadas pós-reaterro), volumes por elemento, sequência de caminhões, e um checklist técnico (slump 60mm±10, cobrimento ≥5cm CAA IV, cura mínima 7 dias, desforma só após 14 dias, aditivo cristalizante, juntas tipo pente). Este documento é a base do **módulo de concretagem** (Fase 5).

---

## 3. Módulos do aplicativo

Baseado no padrão do Emissário Leão Dourado, adaptado para uma estrutura pontual (não linear):

1. **Painel (Dashboard)** — indicadores de topo:
   - % de evolução física geral (média ponderada por duração, com opção futura de ponderar por custo)
   - Status de prazo: adiantado / no prazo / atrasado (comparação realizado x planejado na data corrente)
   - Semanas restantes até o fim planejado
   - Cards por frente (Terraplenagem, Civil, Elétrica, Outros) com % individual
2. **Cronograma** — lista de atividades com filtros: semana atual, caminho crítico, por frente/disciplina, por elemento estrutural. Visão de tabela + Gantt simplificado (sem motor de CPM próprio — datas e criticidade vêm prontas do Smartsheet).
3. **Curva S** — planejado x realizado acumulado, com filtro por frente/disciplina e por elemento. Recalculada a cada lançamento de produção.
4. **Lançamento de produção** — tela simples para registrar avanço físico semanal por atividade/elemento (alimenta a Curva S e o % de evolução).
5. **Gestão Visual (SVG)** — planta/corte esquemático da elevatória em SVG, com cada elemento (poço úmido, câmara de grades, casa de comando, muro perimetral, caixas diversas, pavimentação) colorido por faixa de % concluído (0 / em andamento / concluído) e clicável para abrir o detalhe das atividades daquele elemento. Arquitetura pensada para permitir, no futuro, trocar o SVG por um visualizador IFC (o usuário ainda vai tentar conseguir o link do modelo em REVIT/IFC) sem redesenhar o modelo de dados — o elemento visual é uma entidade independente do tipo de renderização.
6. **Diário de Obra (RDO)** — registro diário (clima, efetivo, equipamentos, atividades executadas, ocorrências, fotos), com histórico navegável por data.
7. **Concretagem** — módulo dedicado baseado no plano de execução: etapas planejadas, volume por elemento, alerta de pedido mínimo de 5 m³, checklist pré-concretagem, status do pedido (planejado → pedido → confirmado → concretado), vínculo com nota fiscal (compra direta).
8. **Orçamento / Terceirizado** — visão do orçamento contratado (as 6 categorias + itens omissos) x medido/executado, para acompanhamento financeiro do terceirizado.
9. **Análise IA (opcional, fase final)** — resumo automático do estado da obra (atrasos, riscos, recomendações) usando a API da Anthropic sobre os dados do banco.

---

## 4. Modelo de dados (Supabase / Postgres)

Esboço de tabelas (nomes em português, colunas em `snake_case`, seguindo o padrão do banco — os nomes de variáveis no código continuam em `camelCase` em inglês):

- `projetos` (id, nome, cliente, data_inicio_planejada, data_fim_planejada)
- `grupos_macro` (id, projeto_id, nome, ordem) — os 7 grupos de nível 1 do WBS
- `atividades` (id, grupo_macro_id, elemento_visual_id nullable, wbs_nivel, nome, predecessores, duracao_dias, data_inicio_planejada, data_fim_planejada, percentual_concluido, caminho_critico bool, folga_dias, recurso)
- `avancos_semanais` (id, atividade_id, semana_referencia, percentual_planejado_acumulado, percentual_realizado_acumulado, registrado_em, registrado_por)
- `elementos_visuais` (id, nome, tipo_enum [poco_umido | camara_grades | casa_comando | muro_perimetral | pavimentacao | caixa_comporta | caixa_valvulas | caixa_tanque_hidropneumatico | caixa_medidor_vazao], svg_path_id, percentual_concluido calculado)
- `diario_obra` (id, data, clima, efetivo, equipamentos, atividades_executadas, ocorrencias, autor_id)
- `fotos_evidencia` (id, diario_obra_id nullable, atividade_id nullable, elemento_visual_id nullable, storage_path, legenda, criado_em)
- `concretagem_pedidos` (id, etapa, elementos, volume_m3, num_caminhoes, data_prevista, data_realizada, status_enum [planejado | pedido | confirmado | concretado], checklist_json, nota_fiscal_ref, observacoes)
- `orcamento_itens` (id, item_codigo, descricao, unidade, quantidade, preco_unitario, valor_total, categoria_enum, valor_medido, percentual_medido)
- Auth: usar Supabase Auth com perfis (`gestor`, `fiscal`, `campo`) e RLS por perfil — a decidir com o usuário quem terá acesso além da equipe VMC (ver seção 7).

Importação do Smartsheet: script de import (Node, rodado sob demanda) que lê o `.xlsx` exportado, faz upsert em `atividades` por uma chave estável (nome + grupo_macro, já que o Smartsheet não expõe um ID externo direto no export) e recalcula `percentual_concluido` dos `elementos_visuais` a partir da média das atividades vinculadas.

---

## 5. Stack recomendada

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend | **Next.js 14+ (App Router) + TypeScript + Tailwind** | O app tem 8-9 módulos com navegação, autenticação, dados que mudam ao longo de ~8 meses de obra e potencial de virar template para as próximas elevatórias/emissários da VMC. Isso justifica sair do padrão vanilla-por-arquivo-único e usar o fallback definido no seu próprio padrão de stack. |
| Gráficos | Recharts (curva S, barras de % por frente) | Leve, integra bem com React/Tailwind |
| Gestão visual | SVG inline + React (sem lib 3D pesada) | Evita dependência de motor 3D antes de ter o IFC; troca futura por visualizador IFC fica isolada em um componente |
| Backend/dados | **Supabase** (Postgres + Auth + Storage) | Já é o padrão do usuário; Storage cobre fotos do diário de obra sem precisar de S3 à parte |
| Deploy | **Vercel** (frontend) | Padrão do usuário; Supabase já é hospedado |
| Import cronograma | Script Node standalone (`scripts/import-smartsheet.ts`) | Fase 1 manual (upload do .xlsx exportado); Fase futura opcional: sync direto via API do Smartsheet se houver token disponível |
| IA (opcional) | Anthropic API server-side (route handler do Next.js) | Nunca expor a chave no client |

Alternativa mais simples (citar, não é a recomendada): HTML+CSS+Vanilla JS + Supabase JS client direto no browser, sem build step — funcionaria para os módulos de leitura, mas fica mais difícil de manter com 8+ módulos, autenticação por perfil e um cronograma de import periódico. Se preferir essa linha, avise antes da Fase 0 para ajustar a estrutura de pastas.

---

## 6. Estrutura de pastas proposta

```
gestao-eee-novo-mundo/
├── app/                      # rotas Next.js (painel, cronograma, curva-s, gestao-visual, diario, concretagem, orcamento)
├── components/
├── lib/
│   ├── supabase/
│   └── calculos/             # % evolução, status de prazo, curva S
├── scripts/
│   └── import-smartsheet.ts
├── public/
│   └── svg/                  # planta esquemática da elevatória
├── docs/
│   ├── ARCHITECTURE.md
│   └── PLANO_EXECUCAO_APP_GESTAO_EEE.md   # este documento
├── supabase/
│   └── migrations/
├── .env.example
├── .gitignore
└── README.md
```

---

## 7. Fases de execução

| Fase | Entrega |
|---|---|
| 0 | Setup: repo, projeto Supabase, schema inicial (migrations), `.env.example`, skeleton Next.js no Vercel, gerar `docs/ARCHITECTURE.md` a partir deste plano |
| 1 | Import do cronograma (`import-smartsheet.ts`) + Painel com indicadores (% evolução, status de prazo, semanas restantes) + Cronograma filtrável (semana atual / críticas / frente) |
| 2 | Lançamento de produção semanal + Curva S (planejado x realizado, com filtros) |
| 3 | Gestão Visual em SVG — desenhar a planta esquemática, mapear os `elementos_visuais`, colorir por %, clique abre detalhe |
| 4 | Diário de Obra (RDO) + Storage de fotos |
| 5 | Módulo de Concretagem (baseado no `Plano_Execucao_Concretagem_EEE.docx`: etapas, checklist, alerta de 5m³ mínimo, status do pedido) |
| 6 | Módulo de Orçamento/Terceirizado (import do `QUANTITATIVO...xlsx`, orçado x medido) |
| 7 | Polimento: perfis de acesso (RLS), responsivo para campo, exportar RDO em PDF, Análise IA opcional |

---

## 8. Prompt de kickoff para o Claude Code

```
Leia docs/PLANO_EXECUCAO_APP_GESTAO_EEE.md na raiz do projeto.
Execute a Fase 0: crie a estrutura de pastas, inicialize o Next.js 14 (App Router, TypeScript, Tailwind),
configure o cliente Supabase, escreva as migrations do schema descrito na seção 4,
e gere docs/ARCHITECTURE.md resumindo as decisões.
Comentários no código em português. Não avance para a Fase 1 sem confirmação.
```

---

## 9. Pontos em aberto para validar com o usuário

- Confirmar se há token de API do Smartsheet disponível para sync automático, ou se o import via `.xlsx` manual (Fase 1) é suficiente por ora.
- Quem terá acesso ao app além da equipe VMC (fiscal da Compesa? o terceirizado)? Define os perfis de RLS.
- Reaproveitar a identidade visual do Emissário Leão Dourado (creme/vermelho escuro/ouro, já alinhada à identidade RochaDev) ou variação específica para este app.
- Link do modelo IFC/REVIT da elevatória — quando disponível, adicionar como fonte alternativa da Gestão Visual (Fase 3+).
