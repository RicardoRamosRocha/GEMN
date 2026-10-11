-- GEMN: evita estornar um lote de cashback ainda consumido por pedido confirmado.
-- A ordem segura para dependencias e: cancelar o consumidor primeiro, depois a origem.

create or replace function public.reject_cancellation_with_live_cashback_consumption()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
      from public.cashback_lots as source_lot
      join public.gemn_reservation_allocations as allocation
        on allocation.cashback_lot_id = source_lot.id
       and allocation.status = 'consumida'
      join public.gemn_reservations as reservation
        on reservation.id = allocation.reservation_id
       and reservation.status = 'efetivada'
      join public.orders as consumer_order
        on consumer_order.id = reservation.order_id
       and consumer_order.status = 'confirmado'
     where source_lot.order_id = new.order_id
       and source_lot.valor_consumido > 0
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'cashback deste pedido ainda esta consumido por pedido confirmado; cancele primeiro o pedido consumidor';
  end if;

  return new;
end;
$$;

drop trigger if exists reject_live_cashback_consumption_on_cancellation
  on public.order_cancellations;

create trigger reject_live_cashback_consumption_on_cancellation
  before insert on public.order_cancellations
  for each row
  execute function public.reject_cancellation_with_live_cashback_consumption();

revoke all on function public.reject_cancellation_with_live_cashback_consumption()
  from public, anon, authenticated;
