-- =============================================================================
-- 20260805120000 — Extensões, tipos enumerados e funções utilitárias
-- App de Gestão da Obra — EEE Novo Mundo (Viana & Moura Construções)
--
-- Escopo do banco: exclusivamente o que está dentro do muro perimetral da
-- elevatória. Redes externas (emissário final, rede coletora externa) NÃO são
-- modeladas aqui.
--
-- Migration idempotente: pode ser reaplicada sem erro.
-- =============================================================================

-- Geração de UUID (gen_random_uuid) — já vem no Postgres 13+ via pgcrypto.
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enum: perfil de usuário do app
--   gestor — engenharia/coordenação: leitura e escrita total
--   fiscal — fiscalização: leitura total + escrita em avanços, diário e fotos
--   campo  — equipe de campo: leitura total + escrita apenas nos registros
--            que ela mesma criou (diário, fotos, avanços)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'perfil_usuario') then
    create type public.perfil_usuario as enum ('gestor', 'fiscal', 'campo');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Enum: tipo do elemento visual da Gestão Visual (SVG hoje, IFC no futuro).
-- Os valores vêm dos projetos estruturais listados na seção 3 do plano.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_elemento_visual') then
    create type public.tipo_elemento_visual as enum (
      'poco_umido',
      'camara_grades',
      'casa_comando',
      'muro_perimetral',
      'pavimentacao',
      'caixa_comporta',
      'caixa_valvulas',
      'caixa_tanque_hidropneumatico',
      'caixa_medidor_vazao'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Enum: ciclo de vida do pedido de concreto (módulo de Concretagem).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_pedido_concretagem') then
    create type public.status_pedido_concretagem as enum (
      'planejado',
      'pedido',
      'confirmado',
      'concretado'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Enum: categorias reais da aba ORÇAMENTO do arquivo
-- "QUANTITATIVO ESTAÇÃO ELEVATÓRIA DE ESGOTO RL.xlsx" (7 categorias).
-- Não inventar categorias novas sem conferir a planilha.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'categoria_orcamento') then
    create type public.categoria_orcamento as enum (
      'servicos_preliminares',
      'estacao_elevatoria',
      'caixa_tanque_pneumatico',
      'casa_comando',
      'muro_externo',
      'sistema_diversos',
      'itens_omissos'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Função de trigger: mantém a coluna atualizado_em sempre com o horário
-- da última alteração da linha.
-- -----------------------------------------------------------------------------
create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

comment on function public.tocar_atualizado_em() is
  'Trigger BEFORE UPDATE: atualiza a coluna atualizado_em com now().';
