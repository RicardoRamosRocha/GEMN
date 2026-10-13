-- GEMN: Storage da identidade visual das lojas.
--
-- O bucket é privado. A leitura ocorre somente por usuário autenticado e
-- somente para caminhos referenciados por seller_branding. O cliente deve
-- solicitar URLs assinadas de curta duração (por exemplo, 5 minutos).

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'seller-branding',
  'seller-branding',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- createSignedUrl depende da mesma autorização de leitura do Storage. O
-- proprietário pode ler o próprio branding mesmo suspenso; compradores
-- autenticados só podem ler referências de sellers ativos. Arquivos órfãos
-- ou caminhos arbitrários não são legíveis.
create policy seller_branding_select_authorized
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'seller-branding'
    and exists (
      select 1
        from public.seller_branding as b
        join public.sellers as s
          on s.id = b.seller_id
       where (b.logo_path = name or b.banner_path = name)
         and (
           s.status = 'ativo'
           or s.user_id = (select auth.uid())
         )
    )
  );

-- Upload somente pelo proprietário de seller ativo e somente nos dois
-- formatos de caminho definidos para branding.
create policy seller_branding_insert_owned_active_seller
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'seller-branding'
    and coalesce(array_length(storage.foldername(name), 1), 0) = 2
    and (storage.foldername(name))[2] in ('logo', 'banner')
    and storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$'
    and exists (
      select 1
        from public.sellers as s
       where s.id::text = (storage.foldername(name))[1]
         and s.user_id = (select auth.uid())
         and s.status = 'ativo'
    )
  );

-- Não existe UPDATE de objeto: a substituição usa novo UUID, atualiza a
-- referência pela RPC e só então remove o objeto antigo.

-- Um arquivo só pode ser excluído pelo proprietário ativo e quando não está
-- referenciado como logo ou banner. Isso impede apagar a imagem atualmente
-- exibida pela loja.
create policy seller_branding_delete_owned_unreferenced
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'seller-branding'
    and exists (
      select 1
        from public.sellers as s
       where s.id::text = (storage.foldername(name))[1]
         and s.user_id = (select auth.uid())
         and s.status = 'ativo'
    )
    and not exists (
      select 1
        from public.seller_branding as b
       where b.seller_id::text = (storage.foldername(name))[1]
         and (b.logo_path = name or b.banner_path = name)
    )
  );
