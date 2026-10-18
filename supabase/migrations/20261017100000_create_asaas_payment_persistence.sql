-- Sprint 6.1-D: persistence segura para pagamentos externos Asaas.
-- Esta migration não chama a API Asaas e não confirma pedidos, carteira ou cashback.

create table if not exists public.asaas_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  ambiente text not null default 'sandbox',
  asaas_customer_id text not null,
  status text not null default 'active',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint asaas_customers_ambiente_check check (ambiente in ('sandbox', 'production')),
  constraint asaas_customers_status_check check (status in ('active', 'inactive', 'needs_review')),
  constraint asaas_customers_external_id_check check (length(btrim(asaas_customer_id)) > 0),
  constraint asaas_customers_user_environment_unique unique (user_id, ambiente),
  constraint asaas_customers_external_unique unique (ambiente, asaas_customer_id)
);

create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null default 'asaas',
  method text not null default 'pix',
  ambiente text not null default 'sandbox',
  status text not null default 'pending_creation',
  idempotency_key uuid not null,
  external_reference text not null,
  asaas_customer_id uuid references public.asaas_customers(id) on delete restrict,
  provider_customer_id text,
  asaas_payment_id text,
  amount_due_real numeric(12,2) not null,
  currency text not null default 'BRL',
  provider_status text,
  due_at timestamptz not null,
  pix_qr_expires_at timestamptz,
  net_value numeric(12,2),
  fee_value numeric(12,2),
  last_error_code text,
  last_error_message text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  confirmed_at timestamptz,
  received_at timestamptz,
  canceled_at timestamptz,
  constraint payment_intents_provider_check check (provider = 'asaas'),
  constraint payment_intents_method_check check (method = 'pix'),
  constraint payment_intents_ambiente_check check (ambiente in ('sandbox', 'production')),
  constraint payment_intents_status_check check (status in (
    'pending_creation', 'created', 'qr_ready', 'payment_confirmed',
    'payment_received', 'overdue', 'canceled', 'refunded',
    'partially_refunded', 'chargeback', 'failed', 'needs_reconciliation'
  )),
  constraint payment_intents_external_reference_check check (length(btrim(external_reference)) > 0),
  constraint payment_intents_currency_check check (currency = 'BRL'),
  constraint payment_intents_amount_check check (amount_due_real > 0),
  constraint payment_intents_optional_amounts_check check (
    (net_value is null or net_value >= 0)
    and (fee_value is null or fee_value >= 0)
  ),
  constraint payment_intents_order_provider_method_unique unique (order_id, provider, method),
  constraint payment_intents_buyer_idempotency_unique unique (buyer_id, idempotency_key),
  constraint payment_intents_reference_unique unique (provider, ambiente, external_reference),
  constraint payment_intents_external_payment_unique unique (provider, ambiente, asaas_payment_id)
);

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'asaas',
  asaas_event_id text not null,
  event_type text not null,
  payment_intent_id uuid references public.payment_intents(id) on delete set null,
  asaas_payment_id text,
  external_reference text,
  provider_status text,
  payment_value numeric(12,2),
  net_value numeric(12,2),
  occurred_at timestamptz,
  payload_hash text not null,
  processing_status text not null default 'pending',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text,
  constraint payment_webhook_events_provider_check check (provider = 'asaas'),
  constraint payment_webhook_events_id_check check (length(btrim(asaas_event_id)) > 0),
  constraint payment_webhook_events_type_check check (length(btrim(event_type)) > 0),
  constraint payment_webhook_events_hash_check check (length(btrim(payload_hash)) > 0),
  constraint payment_webhook_events_status_check check (processing_status in (
    'pending', 'accepted', 'processed', 'ignored', 'needs_review', 'failed'
  )),
  constraint payment_webhook_events_values_check check (
    (payment_value is null or payment_value >= 0)
    and (net_value is null or net_value >= 0)
  ),
  constraint payment_webhook_events_external_unique unique (provider, asaas_event_id)
);

create index if not exists asaas_customers_user_idx
  on public.asaas_customers (user_id, ambiente);

create index if not exists payment_intents_buyer_idx
  on public.payment_intents (buyer_id, criado_em desc);

create index if not exists payment_intents_status_idx
  on public.payment_intents (status, due_at);

create index if not exists payment_intents_reconciliation_idx
  on public.payment_intents (status, atualizado_em)
  where status in ('pending_creation', 'needs_reconciliation');

create index if not exists payment_webhook_events_payment_idx
  on public.payment_webhook_events (asaas_payment_id, received_at desc);

create index if not exists payment_webhook_events_pending_idx
  on public.payment_webhook_events (processing_status, received_at)
  where processing_status in ('pending', 'needs_review');

create or replace function public.set_asaas_payment_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists asaas_customers_set_updated_at on public.asaas_customers;
create trigger asaas_customers_set_updated_at
before update on public.asaas_customers
for each row execute function public.set_asaas_payment_updated_at();

drop trigger if exists payment_intents_set_updated_at on public.payment_intents;
create trigger payment_intents_set_updated_at
before update on public.payment_intents
for each row execute function public.set_asaas_payment_updated_at();

alter table public.asaas_customers enable row level security;
alter table public.payment_intents enable row level security;
alter table public.payment_webhook_events enable row level security;

revoke all on table public.asaas_customers from public, anon, authenticated;
revoke all on table public.payment_intents from public, anon, authenticated;
revoke all on table public.payment_webhook_events from public, anon, authenticated;

grant select (id, ambiente, status, criado_em, atualizado_em)
  on table public.asaas_customers to authenticated;
grant select (
  id, order_id, provider, method, ambiente, status, amount_due_real,
  currency, provider_status, due_at, pix_qr_expires_at, criado_em,
  atualizado_em, confirmed_at, received_at, canceled_at
)
  on table public.payment_intents to authenticated;

drop policy if exists asaas_customers_select_own on public.asaas_customers;
create policy asaas_customers_select_own
on public.asaas_customers
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists payment_intents_select_own on public.payment_intents;
create policy payment_intents_select_own
on public.payment_intents
for select to authenticated
using ((select auth.uid()) = buyer_id);

-- A aplicação não recebe qualquer privilégio de escrita nestas tabelas.
-- O acesso de backend para webhook será concedido somente à rotina segura abaixo.

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

  select * into v_order
  from public.orders
  where id = p_order_id and buyer_id = v_user_id
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

  select * into v_existing
  from public.payment_intents
  where order_id = p_order_id
    and provider = 'asaas'
    and method = 'pix'
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
    insert into public.payment_intents (
      order_id, buyer_id, provider, method, ambiente, status,
      idempotency_key, external_reference, amount_due_real, due_at
    ) values (
      v_order.id, v_user_id, 'asaas', 'pix', 'sandbox', 'pending_creation',
      p_idempotency_key, 'gemn-order-' || v_order.id::text,
      v_order.valor_devido_real, v_due_at
    )
    returning id, order_id, status, amount_due_real, currency, ambiente,
      external_reference, due_at
    into payment_intent_id, order_id, status, amount_due_real, currency,
      ambiente, external_reference, due_at;

    return next;
  exception when unique_violation then
    select * into v_existing
    from public.payment_intents
    where order_id = p_order_id
      and provider = 'asaas'
      and method = 'pix'
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

revoke all on function public.prepare_asaas_payment_intent(uuid, uuid) from public, anon;
grant execute on function public.prepare_asaas_payment_intent(uuid, uuid) to authenticated;

create or replace function public.record_asaas_webhook_event(
  p_asaas_event_id text,
  p_event_type text,
  p_asaas_payment_id text,
  p_external_reference text,
  p_provider_status text,
  p_payment_value numeric,
  p_net_value numeric,
  p_occurred_at timestamptz,
  p_payload_hash text
)
returns table (
  webhook_event_id uuid,
  duplicate boolean,
  accepted boolean,
  reason_code text,
  payment_intent_id uuid,
  payment_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event public.payment_webhook_events%rowtype;
  v_intent public.payment_intents%rowtype;
  v_order_status text;
  v_is_reversal boolean;
  v_next_status text;
  v_applied_status text;
  v_reason text := null;
begin
  if p_asaas_event_id is null or p_event_type is null or p_payload_hash is null then
    raise exception 'webhook identity fields are required' using errcode = '22023';
  end if;

  v_is_reversal := p_event_type in (
    'PAYMENT_PARTIALLY_REFUNDED',
    'PAYMENT_REFUNDED',
    'PAYMENT_REFUND_IN_PROGRESS',
    'PAYMENT_CHARGEBACK_REQUESTED',
    'PAYMENT_CHARGEBACK_DISPUTE'
  );

  select * into v_event
  from public.payment_webhook_events
  where provider = 'asaas' and asaas_event_id = p_asaas_event_id;

  if found then
    return query select v_event.id, true,
      v_event.processing_status in ('accepted', 'processed'),
      'DUPLICATE_EVENT', v_event.payment_intent_id,
      (select pi.status from public.payment_intents pi where pi.id = v_event.payment_intent_id);
    return;
  end if;

  select * into v_intent
  from public.payment_intents
  where provider = 'asaas'
    and (
      (p_asaas_payment_id is not null and asaas_payment_id = p_asaas_payment_id)
      or (p_external_reference is not null and external_reference = p_external_reference)
    )
  order by criado_em
  limit 1
  for update;

  if not found then
    v_reason := 'PAYMENT_INTENT_NOT_FOUND';
  else
    select status into v_order_status
    from public.orders
    where id = v_intent.order_id;

    if v_order_status is null then
      v_reason := 'ORDER_NOT_FOUND';
    elsif not v_is_reversal and v_order_status <> 'pendente' then
      v_reason := 'ORDER_NOT_ELIGIBLE';
    elsif p_external_reference is not null
          and v_intent.external_reference <> p_external_reference then
      v_reason := 'REFERENCE_MISMATCH';
    elsif p_asaas_payment_id is not null
          and v_intent.asaas_payment_id is not null
          and v_intent.asaas_payment_id <> p_asaas_payment_id then
      v_reason := 'PAYMENT_ID_MISMATCH';
    elsif p_payment_value is null or p_payment_value <> v_intent.amount_due_real then
      v_reason := 'PAYMENT_VALUE_MISMATCH';
    elsif not v_is_reversal
          and v_intent.status in ('canceled', 'overdue', 'refunded', 'partially_refunded', 'chargeback') then
      v_reason := 'PAYMENT_NOT_ELIGIBLE';
    end if;
  end if;

  if v_reason is not null then
    insert into public.payment_webhook_events (
      provider, asaas_event_id, event_type, payment_intent_id,
      asaas_payment_id, external_reference, provider_status,
      payment_value, net_value, occurred_at, payload_hash,
      processing_status, error_code
    ) values (
      'asaas', p_asaas_event_id, p_event_type, v_intent.id,
      p_asaas_payment_id, p_external_reference, p_provider_status,
      p_payment_value, p_net_value, p_occurred_at, p_payload_hash,
      'needs_review', v_reason
    ) returning id into webhook_event_id;

    return query select webhook_event_id, false, false, v_reason,
      v_intent.id, v_intent.status;
    return;
  end if;

  if v_intent.asaas_payment_id is null and p_asaas_payment_id is not null then
    v_intent.asaas_payment_id := p_asaas_payment_id;
  end if;

  v_next_status := case
    when p_event_type = 'PAYMENT_RECEIVED' then 'payment_received'
    when p_event_type = 'PAYMENT_CONFIRMED' then 'payment_confirmed'
    when p_event_type in ('PAYMENT_OVERDUE', 'PAYMENT_DUNNING_RECEIVED') then 'overdue'
    when p_event_type = 'PAYMENT_PARTIALLY_REFUNDED' then 'partially_refunded'
    when p_event_type in ('PAYMENT_REFUNDED', 'PAYMENT_REFUND_IN_PROGRESS') then 'refunded'
    when p_event_type in ('PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE') then 'chargeback'
    else null
  end;

  v_applied_status := case
    when v_next_status = 'payment_confirmed'
         and v_intent.status = 'payment_received' then v_intent.status
    when v_next_status = 'overdue'
         and v_intent.status in ('payment_confirmed', 'payment_received') then v_intent.status
    else coalesce(v_next_status, v_intent.status)
  end;

  insert into public.payment_webhook_events (
    provider, asaas_event_id, event_type, payment_intent_id,
    asaas_payment_id, external_reference, provider_status,
    payment_value, net_value, occurred_at, payload_hash,
    processing_status
  ) values (
    'asaas', p_asaas_event_id, p_event_type, v_intent.id,
    p_asaas_payment_id, p_external_reference, p_provider_status,
    p_payment_value, p_net_value, p_occurred_at, p_payload_hash,
    case when v_next_status is null then 'ignored' else 'accepted' end
  ) returning id into webhook_event_id;

  update public.payment_intents
  set asaas_payment_id = coalesce(asaas_payment_id, p_asaas_payment_id),
      provider_status = coalesce(p_provider_status, provider_status),
      net_value = coalesce(p_net_value, net_value),
      status = v_applied_status,
      confirmed_at = case when p_event_type = 'PAYMENT_CONFIRMED' then coalesce(confirmed_at, now()) else confirmed_at end,
      received_at = case when p_event_type = 'PAYMENT_RECEIVED' then coalesce(received_at, now()) else received_at end
  where id = v_intent.id;

  return query select webhook_event_id, false, (v_next_status is not null),
    case when v_next_status is null then 'EVENT_NOT_PAYMENT_STATE' else null end,
    v_intent.id, v_applied_status;
end;
$$;

revoke all on function public.record_asaas_webhook_event(text, text, text, text, text, numeric, numeric, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_asaas_webhook_event(text, text, text, text, text, numeric, numeric, timestamptz, text) to service_role;
