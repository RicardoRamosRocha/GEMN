-- GEMN: permite escrita de imagens nos anúncios próprios em qualquer estado.
--
-- A migration original restringia INSERT/UPDATE de objetos a listings ativos.
-- Esta migration substitui a policy de INSERT e remove a policy de UPDATE,
-- preservando bucket, leitura, limite, MIME types e a policy de DELETE.
--
-- Policies RLS de storage.objects não conseguem comparar diretamente o name
-- antigo e o novo durante UPDATE: USING avalia a linha antiga e WITH CHECK
-- avalia a linha resultante. Portanto, manter UPDATE aqui permitiria mover um
-- objeto entre dois listings do mesmo seller. A substituição deve ser feita
-- com INSERT usando um nome novo (e, quando necessário, DELETE do objeto
-- antigo).

drop policy if exists listing_images_insert_owned_active_seller
  on storage.objects;

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

drop policy if exists listing_images_update_owned_active_seller
  on storage.objects;
