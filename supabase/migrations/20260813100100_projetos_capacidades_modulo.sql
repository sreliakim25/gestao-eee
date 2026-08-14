-- ============================================================================
-- projetos.modulo_concretagem_habilitado / modulo_orcamento_habilitado
--
-- Capacidades por dispositivo: Concretagem e Orçamento só fazem sentido para
-- a EEE Novo Mundo por enquanto (o plano de concretagem e o quantitativo do
-- terceirizado são conteúdo hardcoded a ela) — os demais dispositivos da UDE
-- não têm esse conteúdo ainda. A flag controla só a VISIBILIDADE da aba (regra
-- de UI de uma fase futura); generalizar o conteúdo dos módulos está fora
-- deste escopo.
--
-- Gestão Visual NÃO ganha flag aqui: sua visibilidade vem de existir (ou não)
-- linha em `elementos_visuais` para o projeto — não é uma capacidade a marcar
-- neste schema.
--
-- Sem janela de dado não migrado: ADD COLUMN com DEFAULT constante aplica o
-- valor a todas as linhas já existentes na mesma operação (Postgres 11+), e a
-- coluna já nasce NOT NULL — não precisa de UPDATE de backfill separado.
-- ============================================================================

alter table public.projetos
  add column if not exists modulo_concretagem_habilitado boolean not null default false,
  add column if not exists modulo_orcamento_habilitado   boolean not null default false;

comment on column public.projetos.modulo_concretagem_habilitado is
  'true = a aba Concretagem aparece para este dispositivo. Hoje só a EEE Novo Mundo tem o conteúdo (plano de concretagem hardcoded); habilitar a flag para outro projeto só mostra a aba, não generaliza o conteúdo.';
comment on column public.projetos.modulo_orcamento_habilitado is
  'true = a aba Orçamento aparece para este dispositivo. Hoje só a EEE Novo Mundo tem o conteúdo (quantitativo do terceirizado hardcoded); habilitar a flag para outro projeto só mostra a aba, não generaliza o conteúdo.';
