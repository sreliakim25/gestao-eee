-- ============================================================================
-- Linha de base das datas planejadas
--
-- O PROBLEMA
--
-- `data_inicio_planejada` / `data_fim_planejada` são sobrescritas a cada sync
-- com o Smartsheet. Isso é correto — elas representam o plano VIGENTE — mas
-- destrói a informação de que o plano mudou. Já aconteceu nesta obra: o término
-- foi de 26/01/2027 para 12/02/2027 entre o .xlsx e o primeiro sync, e o app
-- não tinha como mostrar isso.
--
-- A SOLUÇÃO
--
-- Duas colunas que guardam a linha de base e NÃO são tocadas pelo sync. A
-- proteção fica num trigger, não na aplicação: o upsert do importador manda
-- todas as colunas do payload, então confiar no cliente para "não enviar" a
-- baseline seria frágil — bastaria alguém adicionar a coluna ao payload para
-- a referência se perder em silêncio.
--
-- Semântica: baseline é definida na PRIMEira vez que a atividade entra, e só
-- muda por ação explícita (função `redefinir_linha_base`). Replanejar é decisão
-- de gestão, não efeito colateral de um import.
-- ============================================================================

alter table public.atividades
  add column if not exists data_inicio_linha_base date,
  add column if not exists data_fim_linha_base date;

comment on column public.atividades.data_inicio_linha_base is
  'Início planejado na linha de base. Congelado: o sync do Smartsheet não '
  'altera. Comparar com data_inicio_planejada revela replanejamento.';

comment on column public.atividades.data_fim_linha_base is
  'Término planejado na linha de base. Congelado — ver data_inicio_linha_base.';

-- Backfill: quem já está no banco tem o plano atual como linha de base.
update public.atividades
   set data_inicio_linha_base = coalesce(data_inicio_linha_base, data_inicio_planejada),
       data_fim_linha_base    = coalesce(data_fim_linha_base, data_fim_planejada)
 where data_inicio_linha_base is null
    or data_fim_linha_base is null;

/**
 * Congela a linha de base.
 *
 * INSERT: se não veio valor, copia do plano — a primeira versão do cronograma
 * é a linha de base.
 * UPDATE: ignora qualquer valor novo e mantém o antigo. É isto que torna a
 * baseline imune ao sync.
 *
 * Escape: quando a sessão declara `app.redefinindo_linha_base = 'on'`, o
 * trigger deixa passar. É como a função de replanejamento age, sem precisar
 * de DDL nem de travar a tabela.
 */
create or replace function public.preservar_linha_base()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.redefinindo_linha_base', true), 'off') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.data_inicio_linha_base := coalesce(new.data_inicio_linha_base, new.data_inicio_planejada);
    new.data_fim_linha_base    := coalesce(new.data_fim_linha_base, new.data_fim_planejada);
  else
    -- Mantém o que já estava gravado, venha o que vier no UPDATE.
    new.data_inicio_linha_base := coalesce(old.data_inicio_linha_base, new.data_inicio_planejada);
    new.data_fim_linha_base    := coalesce(old.data_fim_linha_base, new.data_fim_planejada);
  end if;
  return new;
end;
$$;

drop trigger if exists atividades_preservar_linha_base on public.atividades;
create trigger atividades_preservar_linha_base
  before insert or update on public.atividades
  for each row execute function public.preservar_linha_base();

/**
 * Redefine a linha de base para o plano vigente — o "replanejamento aprovado".
 *
 * Deliberadamente uma função explícita, e não um efeito do import: mover a
 * linha de base apaga o histórico de atraso, então tem de ser um ato
 * consciente de quem gerencia a obra.
 */
create or replace function public.redefinir_linha_base(p_projeto_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  afetadas integer;
begin
  perform set_config('app.redefinindo_linha_base', 'on', true);  -- true = só nesta transação
  update public.atividades a
     set data_inicio_linha_base = a.data_inicio_planejada,
         data_fim_linha_base    = a.data_fim_planejada
    from public.grupos_macro g
   where a.grupo_macro_id = g.id
     and g.projeto_id = p_projeto_id;
  get diagnostics afetadas = row_count;
  perform set_config('app.redefinindo_linha_base', 'off', true);
  return afetadas;
end;
$$;

comment on function public.redefinir_linha_base(uuid) is
  'Move a linha de base para o plano vigente. Apaga o histórico de desvio — '
  'use apenas quando houver replanejamento formalmente aprovado.';
