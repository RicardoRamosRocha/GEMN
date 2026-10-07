-- GEMN: perfil de negócio associado ao usuário do Supabase Auth.
--
-- Todo usuário autenticado pode atuar como Cliente. A autorização
-- administrativa é determinada por is_admin, enquanto a autorização para
-- vender será determinada futuramente por um registro válido/ativo em sellers.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome_completo text,
  telefone text,
  is_admin boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.profiles is
  'Dados de negócio do usuário autenticado; autorização de venda será determinada futuramente por sellers.';
comment on column public.profiles.is_admin is
  'Indica acesso administrativo. Não é editável pelo usuário autenticado.';
comment on column public.profiles.nome_completo is
  'Pode ser nulo porque o cadastro do Auth pode não fornecer metadata.';

-- O profile é criado automaticamente após o cadastro no Supabase Auth.
-- SECURITY DEFINER permite que o trigger insira o registro sem conceder
-- INSERT direto ao papel authenticated.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (
    id,
    nome_completo,
    telefone,
    is_admin
  )
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'nome_completo'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'telefone'), ''),
    false
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Mantém atualizado_em sob controle do banco. O cliente não recebe
-- privilégio de UPDATE nessa coluna.
create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profile_updated_at();

alter table public.profiles enable row level security;

-- Um usuário autenticado só pode consultar o próprio profile.
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

-- RLS restringe a linha; o privilégio SQL abaixo restringe as colunas.
-- Portanto, mesmo para o próprio id, o usuário comum só pode alterar os
-- dados permitidos do perfil.
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Privilégios explícitos: sem INSERT/DELETE para authenticated e UPDATE
-- somente em nome_completo e telefone. is_admin só deverá ser alterado por
-- um caminho administrativo privilegiado e seguro, a ser definido depois.
revoke all on table public.profiles from anon, authenticated;

grant select (
  id,
  nome_completo,
  telefone,
  is_admin,
  criado_em,
  atualizado_em
)
on table public.profiles
to authenticated;

grant update (
  nome_completo,
  telefone
)
on table public.profiles
to authenticated;

-- Funções usadas exclusivamente por triggers não precisam ficar disponíveis
-- para chamadas diretas de clientes.
revoke all on function public.handle_new_user() from public;
revoke all on function public.set_profile_updated_at() from public;
