-- Contrato de segurança da leitura pública do marketplace.
--
-- Execute como postgres, depois da migration pública e com quatro UUIDs:
-- public_seller_id, published_listing_id, inactive_listing_id e
-- suspended_seller_id. A transação é revertida e não altera dados.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin;

-- O anon recebe apenas as colunas da projeção pública.
do $$
begin
  if not has_column_privilege('anon', 'public.sellers', 'id', 'SELECT')
     or not has_column_privilege('anon', 'public.sellers', 'nome_negocio', 'SELECT')
     or has_column_privilege('anon', 'public.sellers', 'user_id', 'SELECT')
     or has_column_privilege('anon', 'public.sellers', 'telefone', 'SELECT') then
    raise exception 'grant público de sellers está amplo ou incompleto';
  end if;
  if has_column_privilege('anon', 'public.listings', 'atualizado_em', 'SELECT') then
    raise exception 'anon recebeu coluna interna de listings';
  end if;
  if not has_column_privilege('anon', 'public.listing_images', 'storage_path', 'SELECT') then
    raise exception 'anon não consegue ler o caminho público da imagem';
  end if;
end;
$$;

-- A leitura pública deve aceitar somente o seller ativo e o anúncio publicado.
begin;
set local role anon;
do $$
declare
  v_public_seller integer;
  v_published integer;
  v_inactive integer;
  v_suspended integer;
begin
  select count(*) into v_public_seller from public.sellers where id = :'public_seller_id'::uuid;
  select count(*) into v_published from public.listings where id = :'published_listing_id'::uuid;
  select count(*) into v_inactive from public.listings where id = :'inactive_listing_id'::uuid;
  select count(*) into v_suspended from public.sellers where id = :'suspended_seller_id'::uuid;
  if v_public_seller <> 1 then raise exception 'seller ativo não está visível ao anon'; end if;
  if v_published <> 1 then raise exception 'anúncio publicado não está visível ao anon'; end if;
  if v_inactive <> 0 then raise exception 'anúncio inativo ficou visível ao anon'; end if;
  if v_suspended <> 0 then raise exception 'seller suspenso ficou visível ao anon'; end if;
end;
$$;
rollback;

-- O papel público não pode inserir, alterar ou apagar anúncios, sellers ou
-- imagens, nem consultar dados de pedidos e carteiras.
do $$
declare
  v_tables text[] := array['public.sellers', 'public.categories', 'public.listings', 'public.listing_images', 'public.orders', 'public.wallets'];
  v_table text;
begin
  foreach v_table in array v_tables loop
    if has_table_privilege('anon', v_table, 'INSERT')
       or has_table_privilege('anon', v_table, 'UPDATE')
       or has_table_privilege('anon', v_table, 'DELETE') then
      raise exception 'anon recebeu privilégio de escrita em %', v_table;
    end if;
  end loop;
end;
$$;

-- listing-images é público por decisão de produto; seller-branding continua
-- em bucket privado e não ganha leitura anônima nesta migration.
do $$
declare
  v_listing_public boolean;
  v_branding_public boolean;
begin
  select public into v_listing_public from storage.buckets where id = 'listing-images';
  select public into v_branding_public from storage.buckets where id = 'seller-branding';
  if v_listing_public is distinct from true then raise exception 'listing-images deixou de ser público'; end if;
  if v_branding_public is distinct from false then raise exception 'seller-branding não está privado'; end if;
end;
$$;

\echo PUBLIC_MARKETPLACE_READ_SECURITY_OK
