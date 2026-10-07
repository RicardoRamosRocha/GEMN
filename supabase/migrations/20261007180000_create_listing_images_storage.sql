-- GEMN: Storage para imagens principais de produtos e serviços.
--
-- O bucket é público somente para leitura das imagens de marketplace. A
-- escrita continua protegida por policies que validam seller, listing e
-- usuário autenticado no banco.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'listing-images',
  'listing-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- A leitura pública do bucket permite usar URLs públicas diretamente no Web
-- e no Mobile. Esta policy também permite consultar metadados pelo papel
-- authenticated sem abrir acesso a outros buckets.
create policy listing_images_select_authenticated
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'listing-images');

-- O caminho deve ter exatamente dois diretórios e um arquivo:
-- <seller_id>/<listing_id>/<arquivo>.
-- As comparações são textuais para que nomes malformados não sejam
-- convertidos para uuid e não causem erro de cast controlável pelo cliente.
create policy listing_images_insert_owned_active_seller
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'listing-images'
    and coalesce(array_length(storage.foldername(name), 1), 0) = 2
    and nullif(storage.filename(name), '') is not null
    and exists (
      select 1
        from public.listings as l
        join public.sellers as s
          on s.id = l.seller_id
       where s.id::text = (storage.foldername(name))[1]
         and l.id::text = (storage.foldername(name))[2]
         and s.user_id = (select auth.uid())
         and s.status = 'ativo'
    )
  );

-- UPDATE cobre substituição e renomeação dentro de listings pertencentes ao
-- próprio seller ativo. A condição é aplicada ao objeto antigo e ao novo.
create policy listing_images_update_owned_active_seller
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'listing-images'
    and coalesce(array_length(storage.foldername(name), 1), 0) = 2
    and nullif(storage.filename(name), '') is not null
    and exists (
      select 1
        from public.listings as l
        join public.sellers as s
          on s.id = l.seller_id
       where s.id::text = (storage.foldername(name))[1]
         and l.id::text = (storage.foldername(name))[2]
         and s.user_id = (select auth.uid())
         and s.status = 'ativo'
    )
  )
  with check (
    bucket_id = 'listing-images'
    and coalesce(array_length(storage.foldername(name), 1), 0) = 2
    and nullif(storage.filename(name), '') is not null
    and exists (
      select 1
        from public.listings as l
        join public.sellers as s
          on s.id = l.seller_id
       where s.id::text = (storage.foldername(name))[1]
         and l.id::text = (storage.foldername(name))[2]
         and s.user_id = (select auth.uid())
         and s.status = 'ativo'
    )
  );

create policy listing_images_delete_owned_active_seller
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'listing-images'
    and coalesce(array_length(storage.foldername(name), 1), 0) = 2
    and nullif(storage.filename(name), '') is not null
    and exists (
      select 1
        from public.listings as l
        join public.sellers as s
          on s.id = l.seller_id
       where s.id::text = (storage.foldername(name))[1]
         and l.id::text = (storage.foldername(name))[2]
         and s.user_id = (select auth.uid())
         and s.status = 'ativo'
    )
  );
