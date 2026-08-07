-- =============================================================================
-- 20260805120100 — Perfis de usuário ligados ao Supabase Auth
--
-- A tabela public.perfis espelha auth.users e guarda o papel do usuário no app.
-- É a base de TODAS as políticas de RLS das demais tabelas.
-- =============================================================================

create table if not exists public.perfis (
  -- Mesmo id de auth.users: 1:1 com a conta de autenticação.
  id           uuid primary key references auth.users (id) on delete cascade,
  nome         text not null default '',
  perfil       public.perfil_usuario not null default 'campo',
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table  public.perfis is
  'Perfil de acesso do usuário no app (gestor/fiscal/campo). 1:1 com auth.users.';
comment on column public.perfis.perfil is
  'Papel usado pelas políticas de RLS. Novo usuário entra como "campo" (menor privilégio).';

create index if not exists idx_perfis_perfil on public.perfis (perfil);

drop trigger if exists trg_perfis_atualizado_em on public.perfis;
create trigger trg_perfis_atualizado_em
  before update on public.perfis
  for each row execute function public.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- Criação automática do perfil no signup.
-- O papel pode vir de raw_user_meta_data->>'perfil' (definido pelo gestor ao
-- convidar alguém); qualquer valor inválido ou ausente cai em 'campo'.
-- -----------------------------------------------------------------------------
create or replace function public.criar_perfil_no_signup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  perfil_informado text;
  perfil_final public.perfil_usuario;
begin
  perfil_informado := new.raw_user_meta_data ->> 'perfil';

  if perfil_informado in ('gestor', 'fiscal', 'campo') then
    perfil_final := perfil_informado::public.perfil_usuario;
  else
    perfil_final := 'campo';
  end if;

  insert into public.perfis (id, nome, perfil)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1), ''),
    perfil_final
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.criar_perfil_no_signup() is
  'Trigger AFTER INSERT em auth.users: cria a linha correspondente em public.perfis.';

drop trigger if exists trg_criar_perfil_no_signup on auth.users;
create trigger trg_criar_perfil_no_signup
  after insert on auth.users
  for each row execute function public.criar_perfil_no_signup();

-- -----------------------------------------------------------------------------
-- Helpers de RLS.
--
-- IMPORTANTE: são SECURITY DEFINER com search_path fixo. Isso evita recursão
-- infinita de RLS (uma política de public.perfis que consultasse public.perfis
-- entraria em loop) e evita sequestro de search_path.
-- -----------------------------------------------------------------------------
create or replace function public.perfil_atual()
returns public.perfil_usuario
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.perfil from public.perfis p where p.id = auth.uid();
$$;

comment on function public.perfil_atual() is
  'Retorna o perfil (gestor/fiscal/campo) do usuário autenticado. NULL se não houver perfil.';

create or replace function public.eh_gestor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.perfil_atual() = 'gestor', false);
$$;

create or replace function public.eh_gestor_ou_fiscal()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.perfil_atual() in ('gestor', 'fiscal'), false);
$$;

-- Qualquer usuário com perfil cadastrado tem leitura ampla no app.
create or replace function public.eh_usuario_do_app()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.perfil_atual() is not null;
$$;

revoke all on function public.perfil_atual()        from public;
revoke all on function public.eh_gestor()           from public;
revoke all on function public.eh_gestor_ou_fiscal() from public;
revoke all on function public.eh_usuario_do_app()   from public;

grant execute on function public.perfil_atual()        to authenticated;
grant execute on function public.eh_gestor()           to authenticated;
grant execute on function public.eh_gestor_ou_fiscal() to authenticated;
grant execute on function public.eh_usuario_do_app()   to authenticated;
