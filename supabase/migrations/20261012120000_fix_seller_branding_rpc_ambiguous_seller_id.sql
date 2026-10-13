-- GEMN: corrige a ambiguidade de seller_id na RPC de branding.
--
-- Em uma função RETURNS TABLE, seller_id também é uma variável de saída
-- PL/pgSQL. Por isso, ON CONFLICT (seller_id) pode ser interpretado como
-- referência ambígua. O alvo passa a ser identificado pela constraint da PK.

create or replace function public.set_seller_branding(
  p_logo_path text,
  p_banner_path text
)
returns table (
  seller_id uuid,
  logo_path text,
  banner_path text,
  atualizado_em timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_user_id uuid := auth.uid();
  v_seller public.sellers%rowtype;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'usuário autenticado é obrigatório';
  end if;

  select s.*
    into v_seller
    from public.sellers as s
   where s.user_id = v_user_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'usuário autenticado não possui vendedor';
  end if;

  if v_seller.status <> 'ativo' then
    raise exception using
      errcode = 'P0001',
      message = 'vendedor suspenso não pode alterar a identidade visual';
  end if;

  if p_logo_path is not null then
    if p_logo_path !~* ('^' || v_seller.id::text || '/logo/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$') then
      raise exception using
        errcode = 'P0001',
        message = 'caminho de logo inválido ou pertencente a outro vendedor';
    end if;

    if not exists (
      select 1
        from storage.objects as o
       where o.bucket_id = 'seller-branding'
         and o.name = p_logo_path
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'arquivo de logo não encontrado no Storage';
    end if;
  end if;

  if p_banner_path is not null then
    if p_banner_path !~* ('^' || v_seller.id::text || '/banner/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$') then
      raise exception using
        errcode = 'P0001',
        message = 'caminho de banner inválido ou pertencente a outro vendedor';
    end if;

    if not exists (
      select 1
        from storage.objects as o
       where o.bucket_id = 'seller-branding'
         and o.name = p_banner_path
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'arquivo de banner não encontrado no Storage';
    end if;
  end if;

  return query
  insert into public.seller_branding as b (
    seller_id,
    logo_path,
    banner_path
  )
  values (
    v_seller.id,
    p_logo_path,
    p_banner_path
  )
  on conflict on constraint seller_branding_pkey do update
    set logo_path = excluded.logo_path,
        banner_path = excluded.banner_path
  returning b.seller_id, b.logo_path, b.banner_path, b.atualizado_em;
end;
$$;

comment on function public.set_seller_branding(text, text) is
  'Atualiza referências de logo e banner somente para o seller ativo do usuário autenticado.';

revoke all on function public.set_seller_branding(text, text)
  from public, anon, authenticated;
grant execute on function public.set_seller_branding(text, text)
  to authenticated;
