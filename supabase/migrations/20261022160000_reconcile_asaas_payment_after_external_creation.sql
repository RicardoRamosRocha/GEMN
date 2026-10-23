-- Reconcilia uma cobrança já confirmada no Asaas após falha de persistência local.
-- Não chama o Asaas e não cria uma nova cobrança.

create or replace function public.reconcile_asaas_payment_after_external_creation(
  p_payment_intent_id uuid,
  p_asaas_payment_id text,
  p_provider_customer_id text,
  p_provider_status text,
  p_amount_due_real numeric,
  p_external_reference text
)
returns table (
  reconciled_payment_intent_id uuid,
  reconciled_status text,
  reconciled_asaas_payment_id text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_intent public.payment_intents%rowtype;
  v_order public.orders%rowtype;
  v_customer public.asaas_customers%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;
  if p_payment_intent_id is null
     or nullif(btrim(p_asaas_payment_id), '') is null
     or nullif(btrim(p_provider_customer_id), '') is null
     or nullif(btrim(p_external_reference), '') is null
     or p_amount_due_real is null then
    raise exception 'reconciliation fields are required' using errcode = '22023';
  end if;

  select * into v_intent
    from public.payment_intents
   where id = p_payment_intent_id
   for update;
  if not found then
    raise exception 'payment intent not found' using errcode = 'P0002';
  end if;
  select * into v_order from public.orders where id = v_intent.order_id for update;

  if v_intent.status not in ('needs_reconciliation', 'created')
     or v_intent.provider <> 'asaas'
     or v_intent.method <> 'pix'
     or v_intent.ambiente <> 'sandbox'
     or v_order.status <> 'pendente'
     or v_intent.amount_due_real is distinct from v_order.valor_devido_real
     or p_amount_due_real is distinct from v_intent.amount_due_real
     or p_external_reference <> v_intent.external_reference then
    raise exception 'payment intent is not eligible for external reconciliation' using errcode = 'P0001';
  end if;

  select * into v_customer
    from public.asaas_customers
   where user_id = v_intent.buyer_id
     and ambiente = 'sandbox'
     and status = 'active'
     and asaas_customer_id = btrim(p_provider_customer_id)
   for update;
  if not found then
    raise exception 'provider customer mismatch' using errcode = 'P0001';
  end if;

  if v_intent.asaas_payment_id is not null
     and v_intent.asaas_payment_id <> btrim(p_asaas_payment_id) then
    raise exception 'payment id mismatch' using errcode = '23505';
  end if;

  update public.payment_intents
     set status = 'created',
         asaas_customer_id = v_customer.id,
         asaas_payment_id = btrim(p_asaas_payment_id),
         provider_customer_id = btrim(p_provider_customer_id),
         provider_status = nullif(btrim(p_provider_status), ''),
         creation_claim_token = null,
         creation_lease_expires_at = null,
         last_error_code = 'RECONCILED_EXTERNAL_PAYMENT',
         last_error_message = 'External payment verified by GET and reconciled locally.'
   where id = v_intent.id;

  return query select v_intent.id, 'created'::text,
    btrim(p_asaas_payment_id);
end;
$$;

revoke all on function public.reconcile_asaas_payment_after_external_creation(uuid, text, text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.reconcile_asaas_payment_after_external_creation(uuid, text, text, text, numeric, text)
  to service_role;
