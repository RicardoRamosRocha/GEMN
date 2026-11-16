-- Auditoria somente leitura dos objetos do bucket listing-images.
-- Executar como postgres no DEV. Não exclui, move ou altera arquivos.
\set ON_ERROR_STOP on
\pset format aligned

select
  o.name as storage_path,
  li.listing_id,
  l.status as listing_status,
  s.status as seller_status,
  c.ativo as category_active,
  case
    when li.id is null then 'orphan_storage_object'
    when l.id is null then 'missing_listing'
    when l.status <> 'ativo' then 'listing_not_public'
    when s.status <> 'ativo' then 'seller_not_public'
    when c.ativo is distinct from true then 'category_not_public'
    else 'publicly_eligible'
  end as audit_status
from storage.objects as o
left join public.listing_images as li
  on li.storage_path = o.name
left join public.listings as l
  on l.id = li.listing_id
left join public.sellers as s
  on s.id = l.seller_id
left join public.categories as c
  on c.id = l.category_id
where o.bucket_id = 'listing-images'
order by audit_status, o.name;

select
  count(*) filter (where li.id is null) as orphan_storage_objects,
  count(*) filter (where li.id is not null and (l.id is null or l.status <> 'ativo' or s.status <> 'ativo' or c.ativo is distinct from true)) as non_public_references,
  count(*) filter (where li.id is not null and l.status = 'ativo' and s.status = 'ativo' and c.ativo = true) as publicly_eligible_objects
from storage.objects as o
left join public.listing_images as li on li.storage_path = o.name
left join public.listings as l on l.id = li.listing_id
left join public.sellers as s on s.id = l.seller_id
left join public.categories as c on c.id = l.category_id
where o.bucket_id = 'listing-images';
