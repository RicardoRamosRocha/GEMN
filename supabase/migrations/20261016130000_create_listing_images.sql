-- GEMN: imagens adicionais dos anúncios.
-- Esta migration é local e não deve ser aplicada ao Supabase DEV sem aprovação.

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null,
  sort_order smallint not null default 0,
  is_primary boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint listing_images_storage_path_not_blank check (btrim(storage_path) <> ''),
  constraint listing_images_sort_order_check check (sort_order between 0 and 7),
  constraint listing_images_listing_order_unique unique (listing_id, sort_order),
  constraint listing_images_listing_path_unique unique (listing_id, storage_path)
);

create unique index listing_images_one_primary_per_listing
  on public.listing_images (listing_id)
  where is_primary = true;

create index listing_images_listing_order_idx
  on public.listing_images (listing_id, sort_order);

create or replace function public.validate_listing_images_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.listing_id::text, 0));
  if tg_op = 'INSERT' and (select count(*) from public.listing_images where listing_id = new.listing_id) >= 8 then
    raise exception using errcode = 'P0001', message = 'um anúncio pode ter no máximo 8 imagens';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger validate_listing_images_limit
  before insert or update on public.listing_images
  for each row execute function public.validate_listing_images_limit();

alter table public.listing_images enable row level security;

create policy listing_images_select_visible_or_owned
  on public.listing_images
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.listings as l
        join public.sellers as s on s.id = l.seller_id
        join public.categories as c on c.id = l.category_id
       where l.id = listing_id
         and (
           (l.status = 'ativo' and s.status = 'ativo' and c.ativo = true)
           or s.user_id = (select auth.uid())
           or exists (
             select 1 from public.profiles as p
              where p.id = (select auth.uid()) and p.is_admin = true
           )
         )
    )
  );

create policy listing_images_insert_owned
  on public.listing_images
  for insert
  to authenticated
  with check (
    exists (
      select 1
        from public.listings as l
        join public.sellers as s on s.id = l.seller_id
       where l.id = listing_id
         and s.user_id = (select auth.uid())
         and s.status = 'ativo'
    )
  );

create policy listing_images_update_owned
  on public.listing_images
  for update
  to authenticated
  using (
    exists (
      select 1 from public.listings as l join public.sellers as s on s.id = l.seller_id
       where l.id = listing_id and s.user_id = (select auth.uid()) and s.status = 'ativo'
    )
  )
  with check (
    exists (
      select 1 from public.listings as l join public.sellers as s on s.id = l.seller_id
       where l.id = listing_id and s.user_id = (select auth.uid()) and s.status = 'ativo'
    )
  );

create policy listing_images_delete_owned
  on public.listing_images
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.listings as l join public.sellers as s on s.id = l.seller_id
       where l.id = listing_id and s.user_id = (select auth.uid()) and s.status = 'ativo'
    )
  );

revoke all on table public.listing_images from anon, authenticated;
-- O cliente lê pela relação protegida e grava exclusivamente pela RPC atômica.
grant select on table public.listing_images to authenticated;

-- Atomic replacement used by the client after all new Storage uploads succeed.
-- It never deletes Storage objects; cleanup is performed best-effort by the app.
create or replace function public.replace_listing_images(
  p_listing_id uuid,
  p_images jsonb
)
returns setof public.listing_images
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_seller_id uuid;
  v_count integer;
  v_primary_count integer;
begin
  select l.seller_id into v_seller_id
    from public.listings as l
    join public.sellers as s on s.id = l.seller_id
   where l.id = p_listing_id and s.user_id = (select auth.uid()) and s.status = 'ativo';
  if v_seller_id is null then
    raise exception using errcode = '42501', message = 'vendedor não autorizado para este anúncio';
  end if;
  if p_images is null or jsonb_typeof(p_images) <> 'array' then
    raise exception using errcode = '22023', message = 'imagens inválidas';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_listing_id::text, 0));
  if exists (
    select 1
      from jsonb_array_elements(p_images) as values(item)
     where not (item ? 'storage_path')
        or jsonb_typeof(item->'storage_path') <> 'string'
        or btrim(item->>'storage_path') = ''
        or (item->>'storage_path') !~ ('^' || v_seller_id::text || '/' || p_listing_id::text || '/[^/]+$')
        or not (item ? 'sort_order')
        or (item->>'sort_order') !~ '^[0-7]$'
        or not (item ? 'is_primary')
        or jsonb_typeof(item->'is_primary') <> 'boolean'
  ) then
    raise exception using errcode = '22023', message = 'imagem inválida ou caminho de Storage não pertence ao anúncio';
  end if;
  select count(*), count(*) filter (where coalesce((item->>'is_primary')::boolean, false))
    into v_count, v_primary_count
    from jsonb_array_elements(p_images) as values(item);
  if v_count > 8 or v_primary_count > 1 or (v_count > 0 and v_primary_count <> 1) then
    raise exception using errcode = '22023', message = 'um anúncio pode ter no máximo 8 imagens e uma imagem principal';
  end if;
  if (select count(distinct item->>'storage_path') from jsonb_array_elements(p_images) as values(item)) <> v_count
     or (select count(distinct (item->>'sort_order')::smallint) from jsonb_array_elements(p_images) as values(item)) <> v_count
     or (v_count > 0 and (select min((item->>'sort_order')::smallint) from jsonb_array_elements(p_images) as values(item)) <> 0)
     or (v_count > 0 and (select max((item->>'sort_order')::smallint) from jsonb_array_elements(p_images) as values(item)) <> v_count - 1) then
    raise exception using errcode = '22023', message = 'ordenação de imagens inválida';
  end if;

  delete from public.listing_images where listing_id = p_listing_id;
  insert into public.listing_images (listing_id, storage_path, sort_order, is_primary)
  select p_listing_id, item->>'storage_path', (item->>'sort_order')::smallint, coalesce((item->>'is_primary')::boolean, false)
    from jsonb_array_elements(p_images) as values(item);

  update public.listings
     set imagem_principal = (select storage_path from public.listing_images where listing_id = p_listing_id and is_primary limit 1)
   where id = p_listing_id;

  return query select * from public.listing_images where listing_id = p_listing_id order by sort_order;
end;
$$;

revoke all on function public.validate_listing_images_limit() from public;
revoke all on function public.replace_listing_images(uuid, jsonb) from public;
grant execute on function public.replace_listing_images(uuid, jsonb) to authenticated;

-- Backfill legacy listings without touching existing Storage objects.
insert into public.listing_images (listing_id, storage_path, sort_order, is_primary)
select l.id, l.imagem_principal, 0, true
  from public.listings as l
 where l.imagem_principal is not null
   and btrim(l.imagem_principal) <> ''
   and not exists (select 1 from public.listing_images as li where li.listing_id = l.id);
