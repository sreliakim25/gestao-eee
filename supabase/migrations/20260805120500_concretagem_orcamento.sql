-- =============================================================================
-- 20260805120500 — concretagem_pedidos e orcamento_itens
--
-- Regras de negócio críticas (Plano_Execucao_Concretagem_EEE.docx e CLAUDE.md):
--   1) Pedido mínimo de concreto = 5 m³. Abaixo disso, só é aceito se o volume
--      tiver sido combinado com a sobra de outra etapa/frente.
--   2) Concreto é COMPRA DIRETA da contratada, faturado pela contratante —
--      nunca soma ao valor de mão de obra do contrato do terceirizado.
-- =============================================================================

create table if not exists public.concretagem_pedidos (
  id                 uuid primary key default gen_random_uuid(),
  -- Etapas 1 a 4 do plano de concretagem (lajes de fundo → paredes da câmara de
  -- grades → paredes altas do poço úmido + laje de tampa → acessórios/escadas).
  etapa              smallint not null,
  -- Elementos concretados nesta remessa, conforme o plano (texto livre curto).
  elementos          text[] not null default '{}'::text[],
  -- Vínculo opcional com a Gestão Visual (elemento predominante da remessa).
  elemento_visual_id uuid references public.elementos_visuais (id) on delete set null,
  volume_m3          numeric(10,2) not null,
  num_caminhoes      smallint,
  data_prevista      date,
  data_realizada     date,
  status             public.status_pedido_concretagem not null default 'planejado',
  -- Checklist técnico pré-concretagem (slump 60mm±10, cobrimento ≥5cm CAA IV,
  -- cura mínima 7 dias, desforma ≥14 dias, aditivo cristalizante, juntas tipo pente).
  checklist_json     jsonb not null default '{}'::jsonb,
  -- Referência da NF da compra direta do concreto (não entra em orcamento_itens
  -- como mão de obra — ver regra 2 no cabeçalho).
  nota_fiscal_ref    text,
  -- Marca que o volume abaixo de 5 m³ foi combinado com sobra de outra etapa.
  combinado_com_sobra boolean not null default false,
  observacoes        text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),

  constraint concretagem_pedidos_etapa_valida
    check (etapa between 1 and 4),
  constraint concretagem_pedidos_volume_positivo
    check (volume_m3 > 0),
  -- REGRA DE NEGÓCIO: pedido mínimo de 5 m³, salvo combinação de sobra.
  constraint concretagem_pedidos_volume_minimo
    check (volume_m3 >= 5 or combinado_com_sobra),
  constraint concretagem_pedidos_caminhoes_positivo
    check (num_caminhoes is null or num_caminhoes > 0),
  -- Só é "concretado" com data de realização registrada.
  constraint concretagem_pedidos_data_realizada_coerente
    check (status <> 'concretado' or data_realizada is not null)
);

comment on table  public.concretagem_pedidos is
  'Pedidos/remessas de concreto por etapa do Plano_Execucao_Concretagem_EEE.docx.';
comment on constraint concretagem_pedidos_volume_minimo on public.concretagem_pedidos is
  'Pedido mínimo de concreto = 5 m³. Volume menor só é aceito com combinado_com_sobra = true.';
comment on column public.concretagem_pedidos.combinado_com_sobra is
  'True quando o volume abaixo de 5 m³ foi combinado com a sobra de outra etapa/frente no mesmo caminhão.';
comment on column public.concretagem_pedidos.nota_fiscal_ref is
  'NF da compra direta do concreto. Valor de concreto NUNCA entra no contrato de mão de obra do terceirizado.';

create index if not exists idx_concretagem_pedidos_status   on public.concretagem_pedidos (status);
create index if not exists idx_concretagem_pedidos_etapa    on public.concretagem_pedidos (etapa);
create index if not exists idx_concretagem_pedidos_prevista on public.concretagem_pedidos (data_prevista);
create index if not exists idx_concretagem_pedidos_elemento on public.concretagem_pedidos (elemento_visual_id)
  where elemento_visual_id is not null;

drop trigger if exists trg_concretagem_pedidos_atualizado_em on public.concretagem_pedidos;
create trigger trg_concretagem_pedidos_atualizado_em
  before update on public.concretagem_pedidos
  for each row execute function public.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- orcamento_itens — proposta do terceirizado
-- ("QUANTITATIVO ESTAÇÃO ELEVATÓRIA DE ESGOTO RL.xlsx", aba ORÇAMENTO).
-- Nenhum valor é semeado aqui: tudo vem do import (Fase 6).
-- -----------------------------------------------------------------------------
create table if not exists public.orcamento_itens (
  id              uuid primary key default gen_random_uuid(),
  item_codigo     text not null,
  descricao       text not null,
  unidade         text,
  quantidade      numeric(14,4) not null default 0,
  preco_unitario  numeric(14,2) not null default 0,
  valor_total     numeric(14,2) not null default 0,
  categoria       public.categoria_orcamento not null,
  valor_medido    numeric(14,2) not null default 0,
  -- Derivado: evita percentual dessincronizado do valor medido.
  percentual_medido numeric(6,2)
    generated always as (
      case when valor_total > 0
           then round((valor_medido / valor_total) * 100, 2)
           else 0
      end
    ) stored,
  -- Concreto é COMPRA DIRETA (faturado pela contratante) e não pode ser somado
  -- ao valor de mão de obra do contrato do terceirizado.
  eh_compra_direta boolean not null default false,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  constraint orcamento_itens_codigo_unico unique (item_codigo),
  constraint orcamento_itens_quantidade_nao_negativa check (quantidade >= 0),
  constraint orcamento_itens_preco_nao_negativo     check (preco_unitario >= 0),
  constraint orcamento_itens_valor_total_nao_negativo check (valor_total >= 0),
  constraint orcamento_itens_medido_nao_negativo    check (valor_medido >= 0)
);

comment on table  public.orcamento_itens is
  'Itens da proposta do terceirizado (7 categorias, total contratado R$ 736.324,27 na versão importada).';
comment on column public.orcamento_itens.eh_compra_direta is
  'True para concreto e demais insumos de compra direta da contratada. Esses itens NÃO somam ao valor de mão de obra — sempre filtrar por eh_compra_direta = false ao totalizar o contrato.';
comment on column public.orcamento_itens.percentual_medido is
  'Coluna gerada: valor_medido / valor_total * 100.';

create index if not exists idx_orcamento_itens_categoria     on public.orcamento_itens (categoria);
create index if not exists idx_orcamento_itens_compra_direta on public.orcamento_itens (eh_compra_direta);

drop trigger if exists trg_orcamento_itens_atualizado_em on public.orcamento_itens;
create trigger trg_orcamento_itens_atualizado_em
  before update on public.orcamento_itens
  for each row execute function public.tocar_atualizado_em();
