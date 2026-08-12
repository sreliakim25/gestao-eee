-- ============================================================================
-- Liberação de acesso: quem se cadastra fica PENDENTE até um gestor aprovar
--
-- O DESENHO
--
-- A pessoa cria a própria conta e a própria senha, mas isso não dá acesso a
-- nada: o perfil nasce `pendente` e o app mostra uma tela de espera. Um gestor
-- libera e escolhe o papel.
--
-- A trava está na RLS, NÃO na interface. `eh_usuario_do_app()` passa a exigir
-- status `ativo`, então um usuário pendente que chamasse a API direto — sem
-- passar pela tela — continuaria sem ler uma linha sequer. Esconder o menu é
-- conveniência; a barreira é o Postgres.
--
-- POR QUE NÃO USAR A CONFIRMAÇÃO DE E-MAIL DO SUPABASE COMO PORTÃO
--
-- Porque ela não é o portão que o usuário pediu: confirmar e-mail prova que o
-- endereço existe, não que a pessoa deve entrar na obra. E, sem SMTP próprio,
-- o e-mail nativo do Supabase é limitado a poucos envios por hora e cai em
-- spam — o cadastro dependeria de uma entrega que não acontece.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_acesso') then
    create type public.status_acesso as enum ('pendente', 'ativo', 'bloqueado');
  end if;
end
$$;

alter table public.perfis
  add column if not exists status public.status_acesso not null default 'pendente',
  add column if not exists liberado_em timestamptz,
  add column if not exists liberado_por uuid references auth.users (id) on delete set null;

comment on column public.perfis.status is
  'pendente = criou conta e aguarda liberação; ativo = usa o app; bloqueado = '
  'acesso revogado sem apagar a conta (preserva autoria de RDO e lançamentos).';

comment on column public.perfis.liberado_por is
  'Gestor que liberou. Existe para haver rastro de quem deu acesso a quem.';

-- Quem já estava no banco antes desta regra continua ativo: ninguém é
-- expulso do sistema por causa de uma migration.
update public.perfis set status = 'ativo' where status = 'pendente' and criado_em < now();

/* -------------------------------------------------------------------------- */
/* Helpers de RLS: acesso passa a exigir status ativo                          */
/* -------------------------------------------------------------------------- */

create or replace function public.perfil_atual()
returns public.perfil_usuario
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Só devolve papel para quem está ativo. Pendente e bloqueado ficam NULL,
  -- e com isso reprovam em eh_gestor/eh_fiscal/eh_usuario_do_app de uma vez.
  select p.perfil from public.perfis p
   where p.id = auth.uid() and p.status = 'ativo';
$$;

/** Status do usuário atual — a tela de espera precisa distinguir os casos. */
create or replace function public.status_atual()
returns public.status_acesso
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.status from public.perfis p where p.id = auth.uid();
$$;

revoke all on function public.status_atual() from public;
grant execute on function public.status_atual() to authenticated;

/* -------------------------------------------------------------------------- */
/* RLS de perfis                                                              */
/* -------------------------------------------------------------------------- */

-- O usuário lê o próprio perfil mesmo pendente — é o que a tela de espera
-- consulta para saber se já foi liberado.
drop policy if exists perfis_leitura_proprio on public.perfis;
create policy perfis_leitura_proprio on public.perfis
  for select
  using (id = auth.uid() or public.eh_gestor());

-- Gestor administra os demais. A cláusula `id <> auth.uid()` no UPDATE impede
-- o caso mais bobo e mais perigoso: um gestor se rebaixando por engano e
-- deixando o sistema sem nenhum gestor.
drop policy if exists perfis_escrita_gestor on public.perfis;
create policy perfis_escrita_gestor on public.perfis
  for update
  using (public.eh_gestor())
  with check (public.eh_gestor());

/**
 * Impede que o último gestor ativo seja removido.
 *
 * Sem isto, um clique deixa o sistema sem ninguém capaz de liberar acesso — e
 * a recuperação exigiria SQL direto no banco.
 */
create or replace function public.proteger_ultimo_gestor()
returns trigger
language plpgsql
as $$
begin
  if old.perfil = 'gestor' and old.status = 'ativo'
     and (new.perfil <> 'gestor' or new.status <> 'ativo') then
    if (select count(*) from public.perfis
         where perfil = 'gestor' and status = 'ativo' and id <> old.id) = 0 then
      raise exception 'Não é possível remover o último gestor ativo do sistema.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists perfis_proteger_ultimo_gestor on public.perfis;
create trigger perfis_proteger_ultimo_gestor
  before update on public.perfis
  for each row execute function public.proteger_ultimo_gestor();
