-- E13-R: associate an ambiguously-timed Asaas event only after an
-- independent provider verification. The original source timestamp remains
-- untouched and is intentionally not converted to an instant.
create or replace function public.reprocess_asaas_webhook_event_after_verification(
  p_webhook_event_id uuid,
  p_payment_intent_id uuid,
  p_asaas_payment_id text,
  p_provider_customer_id text,
  p_external_reference text,
  p_payment_value numeric,
  p_provider_status text
)
returns table (
  webhook_event_id uuid,
  payment_intent_id uuid,
  processing_status text,
  reprocessed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event public.payment_webhook_events%rowtype;
  v_intent public.payment_intents%rowtype;
  v_order public.orders%rowtype;
  v_customer public.asaas_customers%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;

  if p_webhook_event_id is null
     or p_payment_intent_id is null
     or nullif(btrim(p_asaas_payment_id), '') is null
     or nullif(btrim(p_provider_customer_id), '') is null
     or nullif(btrim(p_external_reference), '') is null
     or p_payment_value is null
     or p_payment_value < 0
     or upper(nullif(btrim(p_provider_status), '')) not in ('RECEIVED', 'CONFIRMED') then
    raise exception 'verified webhook fields are invalid' using errcode = '22023';
  end if;

  select * into v_event
    from public.payment_webhook_events
   where id = p_webhook_event_id
     and provider = 'asaas'
   for update;
  if not found then
    raise exception 'webhook event not found' using errcode = 'P0002';
  end if;

  if v_event.processing_status = 'pending'
     and v_event.payment_intent_id = p_payment_intent_id then
    return query select v_event.id, v_event.payment_intent_id,
      v_event.processing_status, false;
    return;
  end if;

  if v_event.processing_status <> 'needs_review'
     or v_event.error_code <> 'DATE_CREATED_TIMEZONE_MISSING'
     or v_event.payment_intent_id is not null
     or v_event.event_type not in ('PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED') then
    raise exception 'webhook event is not eligible for temporal recovery' using errcode = 'P0001';
  end if;

  if v_event.asaas_payment_id is distinct from btrim(p_asaas_payment_id)
     or v_event.external_reference is distinct from btrim(p_external_reference)
     or v_event.payment_value is distinct from p_payment_value
     or upper(coalesce(v_event.provider_status, '')) <> upper(btrim(p_provider_status)) then
    raise exception 'verified webhook does not match persisted event' using errcode = 'P0001';
  end if;

  select * into v_intent
    from public.payment_intents
   where id = p_payment_intent_id
     and provider = 'asaas'
   for update;
  if not found then
    raise exception 'payment intent not found' using errcode = 'P0002';
  end if;

  if v_intent.asaas_payment_id is distinct from btrim(p_asaas_payment_id)
     or v_intent.provider_customer_id is distinct from btrim(p_provider_customer_id)
     or v_intent.external_reference is distinct from btrim(p_external_reference)
     or v_intent.amount_due_real is distinct from p_payment_value
     or v_intent.ambiente <> 'sandbox'
     or v_intent.status not in ('created', 'payment_received', 'payment_confirmed') then
    raise exception 'verified provider data does not match payment intent' using errcode = 'P0001';
  end if;

  select * into v_order
    from public.orders
   where id = v_intent.order_id
   for update;
  if not found or v_order.status <> 'pendente' then
    raise exception 'order is not eligible for webhook recovery' using errcode = 'P0001';
  end if;

  select * into v_customer
    from public.asaas_customers
   where id = v_intent.asaas_customer_id
   for update;
  if not found
     or v_customer.asaas_customer_id <> btrim(p_provider_customer_id)
     or v_customer.ambiente <> 'sandbox'
     or v_customer.user_id <> v_intent.buyer_id
     or v_customer.status <> 'active' then
    raise exception 'provider customer does not match local identity' using errcode = 'P0001';
  end if;

  update public.payment_webhook_events
     set payment_intent_id = v_intent.id,
         processing_status = 'pending',
         error_code = null,
         next_attempt_at = clock_timestamp()
   where id = v_event.id;

  return query select v_event.id, v_intent.id, 'pending'::text, true;
end;
$$;

revoke all on function public.reprocess_asaas_webhook_event_after_verification(
  uuid, uuid, text, text, text, numeric, text
) from public, anon, authenticated;
grant execute on function public.reprocess_asaas_webhook_event_after_verification(
  uuid, uuid, text, text, text, numeric, text
) to service_role;

create or replace function public.complete_asaas_webhook_event_after_finalization(
  p_webhook_event_id uuid,
  p_payment_intent_id uuid
)
returns table (
  webhook_event_id uuid,
  processing_status text,
  completed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event public.payment_webhook_events%rowtype;
  v_intent public.payment_intents%rowtype;
  v_order public.orders%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;

  select * into v_event
    from public.payment_webhook_events
   where id = p_webhook_event_id
     and provider = 'asaas'
   for update;
  if not found or v_event.payment_intent_id is distinct from p_payment_intent_id then
    raise exception 'webhook event is not linked to the finalized intent' using errcode = 'P0001';
  end if;

  select * into v_intent from public.payment_intents where id = p_payment_intent_id;
  select * into v_order from public.orders where id = v_intent.order_id;
  if not found or v_intent.status <> 'payment_confirmed'
     or v_order.status not in ('confirmado', 'concluido') then
    raise exception 'financial finalization is not confirmed' using errcode = 'P0001';
  end if;

  if v_event.processing_status = 'processed' then
    return query select v_event.id, v_event.processing_status, false;
    return;
  end if;

  if v_event.processing_status <> 'pending' then
    raise exception 'webhook event is not pending completion' using errcode = 'P0001';
  end if;

  update public.payment_webhook_events
     set processing_status = 'processed',
         processed_at = coalesce(processed_at, clock_timestamp()),
         error_code = null,
         last_error_code = null,
         last_error_at = null
   where id = v_event.id;

  return query select v_event.id, 'processed'::text, true;
end;
$$;

revoke all on function public.complete_asaas_webhook_event_after_finalization(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_asaas_webhook_event_after_finalization(uuid, uuid)
  to service_role;
