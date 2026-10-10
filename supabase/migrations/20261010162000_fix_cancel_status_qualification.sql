-- Evita colisão entre o parâmetro de saída status e orders.status.

create or replace function public.cancel_pending_order(
  p_order_id uuid,
  p_idempotency_key uuid
)
returns table (
  order_id uuid,
  status text,
  gemn_liberado numeric(18, 2),
  cancelado_por uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_executor_id uuid := auth.uid();
  v_is_admin boolean;
  v_order public.orders%rowtype;
  v_reservation public.gemn_reservations%rowtype;
begin
  if v_executor_id is null then
    raise exception using errcode = 'P0001', message = 'usuário autenticado é obrigatório';
  end if;
  if p_order_id is null or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'pedido e idempotency_key são obrigatórios';
  end if;

  select p.is_admin into v_is_admin
    from public.profiles as p where p.id = v_executor_id;
  if not (v_executor_id = (select o.buyer_id from public.orders as o where o.id = p_order_id)
          or coalesce(v_is_admin, false)) then
    raise exception using errcode = 'P0001', message = 'usuário não pode cancelar este pedido';
  end if;

  select o.* into v_order from public.orders as o
   where o.id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'pedido não encontrado';
  end if;

  if v_order.status = 'cancelado' then
    if v_order.cancelamento_idempotency_key = p_idempotency_key then
      return query select v_order.id, v_order.status,
        coalesce(v_order.gemn_utilizado, 0.00)::numeric(18, 2), v_order.cancelado_por;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'pedido já foi cancelado com outra chave';
  end if;
  if v_order.status <> 'pendente' then
    raise exception using errcode = 'P0001', message = 'somente pedidos pendentes podem ser cancelados';
  end if;

  if coalesce(v_order.gemn_utilizado, 0.00) > 0 then
    select r.* into v_reservation from public.gemn_reservations as r
     where r.order_id = v_order.id for update;
    if not found or v_reservation.buyer_id <> v_order.buyer_id
       or v_reservation.valor_gemn <> v_order.gemn_utilizado
       or v_reservation.status <> 'ativa' then
      raise exception using errcode = 'P0001', message = 'reserva GEMN ativa e consistente é obrigatória';
    end if;
    perform public.release_gemn_reservation(v_reservation.id, 'cancelamento', p_idempotency_key);
  end if;

  update public.orders as o
     set status = 'cancelado',
         cancelamento_idempotency_key = p_idempotency_key,
         cancelado_em = clock_timestamp(),
         cancelado_por = v_executor_id
   where o.id = v_order.id and o.status = 'pendente';
  if not found then
    raise exception using errcode = 'P0001', message = 'pedido foi processado concorrentemente';
  end if;

  return query select v_order.id, 'cancelado'::text,
    coalesce(v_order.gemn_utilizado, 0.00)::numeric(18, 2), v_executor_id;
end;
$$;

revoke all on function public.cancel_pending_order(uuid, uuid) from public, anon;
grant execute on function public.cancel_pending_order(uuid, uuid) to authenticated;
