-- Vendedores podem consultar solicitacoes de qualquer parte quando o pedido
-- possui item de sua propriedade. A identidade do solicitante continua sendo
-- derivada e protegida pela tabela de solicitacoes.
create or replace function public.can_view_order_cancellation_request(
  p_order_id uuid,
  p_requester_seller_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.profiles as p
     where p.id = auth.uid() and p.is_admin
  )
  or exists (
    select 1 from public.orders as o
     where o.id = p_order_id and o.buyer_id = auth.uid()
  )
  or exists (
    select 1
      from public.sellers as s
      join public.order_items as oi on oi.seller_id = s.id
     where s.user_id = auth.uid()
       and oi.order_id = p_order_id
  );
$$;

revoke all on function public.can_view_order_cancellation_request(uuid, uuid)
  from public, anon;
grant execute on function public.can_view_order_cancellation_request(uuid, uuid)
  to authenticated;
