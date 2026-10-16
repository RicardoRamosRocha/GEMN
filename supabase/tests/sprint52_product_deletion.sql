-- Sprint 5.2: contrato de exclusao segura de anuncios.
-- Execute com psql autenticado como postgres, depois de preparar quatro UUIDs:
-- owner_uid, other_uid, admin_uid, listing_without_orders e listing_with_orders.
-- O listing_with_orders deve possuir ao menos um order_item.
\set ON_ERROR_STOP on
begin;

select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin
    perform public.delete_or_archive_listing(:'listing_with_orders'::uuid);
    raise exception 'usuario anonimo conseguiu remover listing';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%autenticado%' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', :'owner_uid', true);

do $$
declare
  v_action text;
begin
  select action into v_action
    from public.delete_or_archive_listing(:'listing_without_orders'::uuid);
  if v_action <> 'deleted' then
    raise exception 'listing sem pedidos nao foi excluido: %', v_action;
  end if;
  if exists (select 1 from public.listings where id = :'listing_without_orders'::uuid) then
    raise exception 'listing sem pedidos ainda existe';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', :'other_uid', true);
do $$
begin
  begin
    perform public.delete_or_archive_listing(:'listing_with_orders'::uuid);
    raise exception 'usuario nao autorizado conseguiu remover listing';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%nao autorizado%' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', :'owner_uid', true);
do $$
declare
  v_action text;
begin
  select action into v_action
    from public.delete_or_archive_listing(:'listing_with_orders'::uuid);
  if v_action <> 'archived' then
    raise exception 'listing com pedidos nao foi arquivado: %', v_action;
  end if;
  if (select status from public.listings where id = :'listing_with_orders'::uuid) <> 'inativo' then
    raise exception 'listing com pedidos nao ficou inativo';
  end if;
end;
$$;

-- Segunda chamada: o listing sem historico ja foi removido e deve falhar de
-- forma controlada, sem criar uma segunda operacao ou tocar em pedidos.
do $$
begin
  begin
    perform public.delete_or_archive_listing(:'listing_without_orders'::uuid);
    raise exception 'segunda chamada inesperadamente teve sucesso';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%nao encontrado%' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', :'admin_uid', true);
do $$
declare
  v_action text;
begin
  select action into v_action
    from public.delete_or_archive_listing(:'listing_with_orders'::uuid);
  if v_action <> 'archived' then
    raise exception 'administrador nao conseguiu executar operacao autorizada: %', v_action;
  end if;
end;
$$;

rollback;
\echo SPRINT52_PRODUCT_DELETION_OK
