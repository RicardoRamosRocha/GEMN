-- GEMN: exclusao segura de listings sem comprometer o historico de pedidos.

create or replace function public.delete_or_archive_listing(p_listing_id uuid)
returns table (action text, had_order_history boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_listing public.listings%rowtype;
  v_has_history boolean;
  v_is_owner boolean;
  v_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'usuario autenticado e obrigatorio';
  end if;

  -- O mesmo lock usado por create_order serializa exclusao e criacao de pedido.
  select l.* into v_listing
    from public.listings as l
   where l.id = p_listing_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'anuncio nao encontrado';
  end if;

  select exists (
    select 1 from public.sellers as s
     where s.id = v_listing.seller_id and s.user_id = auth.uid()
  ) into v_is_owner;

  select coalesce(p.is_admin, false) into v_is_admin
    from public.profiles as p where p.id = auth.uid();

  if not coalesce(v_is_owner, false) and not coalesce(v_is_admin, false) then
    raise exception using errcode = 'P0001', message = 'usuario nao autorizado a alterar este anuncio';
  end if;

  select exists (
    select 1 from public.order_items as oi where oi.listing_id = v_listing.id
  ) into v_has_history;

  if v_has_history then
    update public.listings set status = 'inativo' where id = v_listing.id;
    return query select 'archived'::text, true;
    return;
  end if;

  -- Nunca removemos a imagem do Storage; a limpeza exige verificacao separada.
  delete from public.listings where id = v_listing.id;
  return query select 'deleted'::text, false;
end;
$$;

revoke all on function public.delete_or_archive_listing(uuid) from public, anon, service_role;
grant execute on function public.delete_or_archive_listing(uuid) to authenticated;

comment on function public.delete_or_archive_listing(uuid) is
  'Exclui listing sem pedidos ou o desativa quando ha historico; exige proprietario ou administrador e preserva Storage.';
