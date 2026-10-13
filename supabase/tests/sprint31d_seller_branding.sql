-- GEMN Sprint 3.1-D Etapa 1: testes de contrato e autorização.
--
-- Executar somente em banco local/isolado após as migrations. Este arquivo
-- não cria usuários, sellers, objetos Storage nem modifica dados remotos.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_definition text;
  v_bucket_public boolean;
begin
  if not exists (
    select 1
      from information_schema.tables
     where table_schema = 'public'
       and table_name = 'seller_branding'
  ) then
    raise exception 'seller_branding table is missing';
  end if;

  if has_table_privilege('authenticated', 'public.seller_branding', 'INSERT') then
    raise exception 'authenticated must not receive direct INSERT on seller_branding';
  end if;
  if has_table_privilege('authenticated', 'public.seller_branding', 'UPDATE') then
    raise exception 'authenticated must not receive direct UPDATE on seller_branding';
  end if;
  if has_table_privilege('authenticated', 'public.seller_branding', 'DELETE') then
    raise exception 'authenticated must not receive direct DELETE on seller_branding';
  end if;

  if not has_function_privilege('authenticated', 'public.set_seller_branding(text,text)', 'EXECUTE') then
    raise exception 'authenticated must execute the branding RPC';
  end if;

  select b.public
    into v_bucket_public
    from storage.buckets as b
   where b.id = 'seller-branding';

  if v_bucket_public is distinct from false then
    raise exception 'seller-branding bucket must be private';
  end if;

  if not exists (
    select 1
      from storage.buckets as b
     where b.id = 'seller-branding'
       and b.file_size_limit = 5242880
       and b.allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']::text[]
  ) then
    raise exception 'seller-branding bucket limits or MIME types are incorrect';
  end if;

  select pg_get_functiondef(p.oid)
    into v_definition
    from pg_proc as p
   where p.oid = to_regprocedure('public.set_seller_branding(text,text)');

  if v_definition is null
     or position('auth.uid()' in v_definition) = 0
     or position('status <> ''ativo''' in v_definition) = 0
     or position('storage.objects' in v_definition) = 0 then
    raise exception 'branding RPC does not contain the required owner, active-status and object checks';
  end if;

  if (select count(*) from pg_policies
       where schemaname = 'storage'
         and tablename = 'objects'
         and policyname in (
           'seller_branding_select_authorized',
           'seller_branding_insert_owned_active_seller',
           'seller_branding_delete_owned_unreferenced'
         )) <> 3 then
    raise exception 'branding Storage authorization policies are incomplete';
  end if;

  if exists (
    select 1
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'seller_branding_select_authorized'
       and 'anon' = any(roles)
  ) then
    raise exception 'anonymous users must not receive branding Storage read policy';
  end if;

  if exists (
    select 1
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname like 'seller_branding%'
       and cmd = 'UPDATE'
  ) then
    raise exception 'branding Storage must not expose UPDATE policy';
  end if;
end;
$$;

-- A constraint-level contract validates the two namespaces without requiring
-- a real upload. Cross-seller ownership is enforced by the RPC and Storage
-- policies, which are checked above and should be exercised with authenticated
-- local users in the future isolated integration runner.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.seller_branding'::regclass
       and conname = 'seller_branding_logo_path_check'
  ) then
    raise exception 'logo path constraint is missing';
  end if;
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.seller_branding'::regclass
       and conname = 'seller_branding_banner_path_check'
  ) then
    raise exception 'banner path constraint is missing';
  end if;
end;
$$;

rollback;
