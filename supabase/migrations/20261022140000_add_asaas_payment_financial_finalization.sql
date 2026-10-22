-- Sprint 6.1-E11: ponte interna entre cobrança Asaas verificada e liquidação.
-- O webhook não chama esta função. Um backend confiável deve verificar a
-- cobrança no Asaas e então chamar esta RPC com service_role.

do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.confirm_order_payment(uuid, uuid)'::regprocedure
  );

  v_definition := replace(
    v_definition,
    'public.confirm_order_payment(',
    'public.confirm_order_payment_internal('
  );
  v_definition := replace(
    v_definition,
    'public.confirm_order_payment_internal(p_order_id uuid, p_idempotency_key uuid)',
    'public.confirm_order_payment_internal(p_order_id uuid, p_idempotency_key uuid, p_executor_id uuid)'
  );
  v_definition := replace(
    v_definition,
    '  v_executor_id uuid := auth.uid();',
    '  v_executor_id uuid := p_executor_id;'
  );
  v_definition := replace(
    v_definition,
    'if v_executor_id is null then',
    'if false then'
  );
  v_definition := replace(
    v_definition,
    'if not coalesce(v_is_admin, false) then',
    'if false then'
  );

  execute v_definition;
end;
$$;

drop function if exists public.confirm_order_payment_internal(uuid, uuid);

alter function public.confirm_order_payment_internal(uuid, uuid, uuid)
  owner to postgres;

revoke all on function public.confirm_order_payment_internal(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.finalize_asaas_payment(
  p_payment_intent_id uuid,
  p_asaas_payment_id text,
  p_provider_status text,
  p_amount_due_real numeric,
  p_currency text,
  p_external_reference text,
  p_provider_customer_id text,
  p_idempotency_key uuid,
  p_verified_at timestamptz default null
)
returns table (
  order_id uuid,
  status text,
  confirmacao_idempotency_key uuid,
  confirmado_por uuid,
  gemn_consumido numeric(18, 2),
  cashback_creditado numeric(18, 2),
  cashback_recuperado numeric(18, 2)
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_intent public.payment_intents%rowtype;
  v_order public.orders%rowtype;
  v_customer public.asaas_customers%rowtype;
  v_event public.payment_webhook_events%rowtype;
  v_verified_at timestamptz := coalesce(p_verified_at, clock_timestamp());
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;

  if p_payment_intent_id is null
     or nullif(btrim(p_asaas_payment_id), '') is null
     or upper(nullif(btrim(p_provider_status), '')) not in ('RECEIVED', 'CONFIRMED')
     or p_amount_due_real is null
     or p_currency is null
     or upper(btrim(p_currency)) <> 'BRL'
     or nullif(btrim(p_external_reference), '') is null
     or nullif(btrim(p_provider_customer_id), '') is null
     or p_idempotency_key is null then
    raise exception 'verified payment fields are invalid' using errcode = '22023';
  end if;

  select * into v_intent
    from public.payment_intents
   where id = p_payment_intent_id
     and provider = 'asaas'
   for update;
  if not found then
    raise exception 'payment intent not found' using errcode = 'P0002';
  end if;

  select * into v_order
    from public.orders
   where id = v_intent.order_id
   for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_intent.asaas_payment_id is distinct from btrim(p_asaas_payment_id)
     or v_intent.external_reference is distinct from btrim(p_external_reference)
     or v_intent.amount_due_real is distinct from p_amount_due_real
     or v_intent.currency <> upper(btrim(p_currency))
     or v_intent.asaas_customer_id is null then
    raise exception 'verified payment does not match intent' using errcode = 'P0001';
  end if;

  select * into v_customer
    from public.asaas_customers
   where id = v_intent.asaas_customer_id
   for update;
  if not found
     or v_customer.user_id is distinct from v_intent.buyer_id
     or v_customer.ambiente is distinct from v_intent.ambiente
     or v_customer.status <> 'active'
     or v_customer.asaas_customer_id <> btrim(p_provider_customer_id) then
    raise exception 'verified provider customer does not match intent' using errcode = 'P0001';
  end if;

  select * into v_event
    from public.payment_webhook_events
   where provider = 'asaas'
     and payment_intent_id = v_intent.id
     and asaas_payment_id = btrim(p_asaas_payment_id)
     and external_reference = btrim(p_external_reference)
     and payment_value = p_amount_due_real
     and upper(coalesce(provider_status, '')) in ('RECEIVED', 'CONFIRMED')
     and processing_status in ('accepted', 'processed', 'pending')
   order by received_at desc, id desc
   limit 1
   for update;
  if not found then
    raise exception 'validated webhook event not found' using errcode = 'P0001';
  end if;

  if v_order.status not in ('pendente', 'confirmado', 'concluido')
     or v_intent.status in ('canceled', 'overdue', 'refunded', 'partially_refunded', 'chargeback') then
    raise exception 'order or payment is not eligible' using errcode = 'P0001';
  end if;

  -- A chamada repetida com a mesma chave retorna o resultado já persistido;
  -- chave diferente continua sendo rejeitada pela rotina financeira interna.
  if v_order.status in ('confirmado', 'concluido') then
    if v_order.confirmacao_idempotency_key = p_idempotency_key then
      return query select * from public.confirm_order_payment_internal(
        v_order.id, p_idempotency_key, v_order.confirmado_por
      );
      return;
    end if;
    raise exception 'order already finalized with another key' using errcode = 'P0001';
  end if;

  update public.payment_intents as pi
     set status = 'payment_confirmed',
         provider_status = upper(btrim(p_provider_status)),
         confirmed_at = coalesce(pi.confirmed_at, v_verified_at)
   where pi.id = v_intent.id
     and pi.status in ('created', 'payment_received', 'payment_confirmed');

  if not found then
    raise exception 'payment intent is not eligible for finalization' using errcode = 'P0001';
  end if;

  return query select * from public.confirm_order_payment_internal(
    v_order.id, p_idempotency_key, null
  );
end;
$$;

revoke all on function public.finalize_asaas_payment(
  uuid, text, text, numeric, text, text, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.finalize_asaas_payment(
  uuid, text, text, numeric, text, text, text, uuid, timestamptz
) to service_role;
