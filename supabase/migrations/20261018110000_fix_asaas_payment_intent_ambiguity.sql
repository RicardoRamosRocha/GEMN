-- Sprint 6.1-E1 corrective migration.
-- Qualify column references so RETURNS TABLE output variables cannot shadow columns.

create or replace function public.prepare_asaas_payment_intent(
  p_order_id uuid,
  p_idempotency_key uuid
)
returns table (
  payment_intent_id uuid,
  order_id uuid,
  status text,
  amount_due_real numeric,
  currency text,
  ambiente text,
  external_reference text,
  due_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_existing public.payment_intents%rowtype;
  v_due_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_order_id is null or p_idempotency_key is null then
    raise exception 'order_id and idempotency_key are required' using errcode = '22023';
  end if;

  select o.* into v_order
  from public.orders as o
  where o.id = p_order_id and o.buyer_id = v_user_id
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_order.status <> 'pendente' then
    raise exception 'order is not pending' using errcode = 'P0001';
  end if;

  if v_order.criado_em <= clock_timestamp() - interval '24 hours' then
    raise exception 'order payment window expired' using errcode = 'P0001';
  end if;

  if coalesce(v_order.valor_devido_real, 0) <= 0 then
    raise exception 'order has no Pix amount due' using errcode = 'P0001';
  end if;

  v_due_at := v_order.criado_em + interval '24 hours';

  select pi.* into v_existing
  from public.payment_intents as pi
  where pi.order_id = p_order_id
    and pi.provider = 'asaas'
    and pi.method = 'pix'
  for update;

  if found then
    if v_existing.buyer_id <> v_user_id
       or v_existing.idempotency_key <> p_idempotency_key
       or v_existing.amount_due_real <> v_order.valor_devido_real then
      raise exception 'payment intent idempotency mismatch' using errcode = '23505';
    end if;

    return query select v_existing.id, v_existing.order_id, v_existing.status,
      v_existing.amount_due_real, v_existing.currency, v_existing.ambiente,
      v_existing.external_reference, v_existing.due_at;
    return;
  end if;

  begin
    insert into public.payment_intents as pi (
      order_id, buyer_id, provider, method, ambiente, status,
      idempotency_key, external_reference, amount_due_real, due_at
    ) values (
      v_order.id, v_user_id, 'asaas', 'pix', 'sandbox', 'pending_creation',
      p_idempotency_key, 'gemn-order-' || v_order.id::text,
      v_order.valor_devido_real, v_due_at
    )
    returning pi.id, pi.order_id, pi.status, pi.amount_due_real, pi.currency,
      pi.ambiente, pi.external_reference, pi.due_at
    into payment_intent_id, order_id, status, amount_due_real, currency,
      ambiente, external_reference, due_at;

    return next;
  exception when unique_violation then
    select pi.* into v_existing
    from public.payment_intents as pi
    where pi.order_id = p_order_id
      and pi.provider = 'asaas'
      and pi.method = 'pix'
    for update;

    if not found
       or v_existing.buyer_id <> v_user_id
       or v_existing.idempotency_key <> p_idempotency_key
       or v_existing.amount_due_real <> v_order.valor_devido_real then
      raise exception 'payment intent concurrent idempotency conflict' using errcode = '23505';
    end if;

    return query select v_existing.id, v_existing.order_id, v_existing.status,
      v_existing.amount_due_real, v_existing.currency, v_existing.ambiente,
      v_existing.external_reference, v_existing.due_at;
  end;
end;
$$;

alter function public.prepare_asaas_payment_intent(uuid, uuid) owner to postgres;

revoke all on function public.prepare_asaas_payment_intent(uuid, uuid) from public, anon;
grant execute on function public.prepare_asaas_payment_intent(uuid, uuid) to authenticated;
