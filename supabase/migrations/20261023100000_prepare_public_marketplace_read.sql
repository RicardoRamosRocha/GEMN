-- GEMN: leitura pública mínima do marketplace.
--
-- Esta migration não abre tabelas privadas nem cria funções SECURITY DEFINER.
-- O papel anon recebe apenas as colunas necessárias para a vitrine e somente
-- linhas que já estão publicadas por seller e categoria ativos.
--
-- seller-branding permanece privado: URLs assinadas continuam disponíveis
-- somente para usuários autenticados. O bucket listing-images já é público
-- para leitura por decisão de produto e não recebe privilégios de escrita.

create policy sellers_select_public_marketplace
  on public.sellers
  for select
  to anon
  using (status = 'ativo');

grant select (id, nome_negocio, descricao, status, aceita_gemn)
on table public.sellers to anon;

create policy categories_select_public_marketplace
  on public.categories
  for select
  to anon
  using (ativo = true);

grant select (id, nome, ativo)
on table public.categories to anon;

create policy listings_select_public_marketplace
  on public.listings
  for select
  to anon
  using (
    status = 'ativo'
    and exists (
      select 1 from public.sellers as s
       where s.id = seller_id and s.status = 'ativo'
    )
    and exists (
      select 1 from public.categories as c
       where c.id = category_id and c.ativo = true
    )
  );

grant select (
  id, seller_id, category_id, tipo, nome, descricao, preco_real,
  aceita_gemn, preco_gemn, imagem_principal, status
)
on table public.listings to anon;

create policy listing_images_select_public_marketplace
  on public.listing_images
  for select
  to anon
  using (
    exists (
      select 1
        from public.listings as l
        join public.sellers as s on s.id = l.seller_id
        join public.categories as c on c.id = l.category_id
       where l.id = listing_id
         and l.status = 'ativo'
         and s.status = 'ativo'
         and c.ativo = true
    )
  );

grant select (id, listing_id, storage_path, sort_order, is_primary)
on table public.listing_images to anon;

-- Reforça que o papel público não recebeu nenhuma capacidade de escrita.
revoke insert, update, delete, truncate, references, trigger
  on table public.sellers, public.categories, public.listings, public.listing_images
  from anon;

comment on policy sellers_select_public_marketplace on public.sellers is
  'Exibe somente identidade comercial mínima de sellers ativos para visitantes.';
comment on policy listings_select_public_marketplace on public.listings is
  'Exibe somente anúncios ativos vinculados a seller e categoria ativos para visitantes.';
comment on policy listing_images_select_public_marketplace on public.listing_images is
  'Exibe metadados de imagens somente de anúncios atualmente publicados.';
