-- Sprint 6.1-E1: claim exclusivo para criação externa de cobrança Asaas.
-- Esta migration não chama a API Asaas e não confirma pedidos, carteira ou cashback.

alter table public.payment_intents
  add column if not exists creation_claim_token uuid,
  add column if not exists creation_lease_expires_at timestamptz,
  add column if not exists creation_claimed_at timestamptz,
  add column if not exists creation_attempts integer not null default 0;

alter table public.payment_intents
  drop constraint if exists payment_intents_creation_attempts_check;

alter table public.payment_intents
  add constraint payment_intents_creation_attempts_check
  check (creation_attempts >= 0);

alter table public.payment_intents
  drop constraint if exists payment_intents_status_check;

alter table public.payment_intents
  add constraint payment_intents_status_check check (status in (
    'pending_creation', 'creating', 'created', 'qr_ready', 'payment_confirmed',
    'payment_received', 'overdue', 'canceled', 'refunded',
    'partially_refunded', 'chargeback', 'failed', 'needs_reconciliation'
  ));

create index if not exists payment_intents_creation_lease_idx
  on public.payment_intents (status, creation_lease_expires_at)
  where status = 'creating';

-- Somente o backend pode reservar uma tentativa de criação externa.
-- Um lease expirado nunca libera outro POST: ele converte a intenção para
-- needs_reconciliation, pois a tentativa anterior pode ter sido aceita pelo Asaas.
create or replace function public.claim_asaas_payment_creation(
  p_payment_intent_id uuid,
  p_lease_seconds integer default 120
)
returns table (
  payment_intent_id uuid,
  status text,
  claim_granted boolean,
  claim_token uuid,
  lease_expires_at timestamptz,
  creation_attempts integer,
  asaas_payment_id text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_intent public.payment_intents%rowtype;
  v_order public.orders%rowtype;
  v_order_id uuid;
  v_now timestamptz := clock_timestamp();
  v_token uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;

  if p_payment_intent_id is null then
    raise exception 'payment_intent_id is required' using errcode = '22023';
  end if;

  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 600 then
    raise exception 'lease must be between 30 and 600 seconds' using errcode = '22023';
  end if;

  -- Para a transição pending_creation, a ordem de locks é sempre
  -- orders -> payment_intents, igual à RPC de preparação. A leitura inicial
  -- sem lock serve apenas para descobrir a chave; o vínculo é confirmado
  -- novamente depois dos dois locks.
  select order_id into v_order_id
  from public.payment_intents
  where id = p_payment_intent_id;

  if not found then
    raise exception 'payment intent not found' using errcode = 'P0002';
  end if;

  select * into v_intent
  from public.payment_intents
  where id = p_payment_intent_id;

  if v_intent.status <> 'pending_creation' then
    if v_intent.status = 'creating'
       and v_intent.creation_lease_expires_at is not null
       and v_intent.creation_lease_expires_at <= v_now then
      update public.payment_intents
      set status = 'needs_reconciliation',
          last_error_code = 'CREATION_LEASE_EXPIRED',
          last_error_message = 'Creation lease expired; external result must be reconciled before retry.',
          creation_claim_token = null,
          creation_lease_expires_at = null
      where id = v_intent.id;

      return query
      select v_intent.id, 'needs_reconciliation'::text, false, null::uuid,
        null::timestamptz, v_intent.creation_attempts, v_intent.asaas_payment_id;
    else
      return query
      select v_intent.id, v_intent.status, false, null::uuid,
        v_intent.creation_lease_expires_at, v_intent.creation_attempts,
        v_intent.asaas_payment_id;
    end if;
    return;
  end if;

  select * into v_order
  from public.orders
  where id = v_order_id
  for update;

  select * into v_intent
  from public.payment_intents
  where id = p_payment_intent_id
  for update;

  if not found or v_intent.order_id is distinct from v_order.id then
    raise exception 'payment intent/order mismatch' using errcode = 'P0001';
  end if;

  if v_order.status <> 'pendente' then
    raise exception 'order is no longer pending' using errcode = 'P0001';
  end if;

  if v_order.criado_em <= v_now - interval '24 hours' then
    raise exception 'order payment window expired' using errcode = 'P0001';
  end if;

  if coalesce(v_order.valor_devido_real, 0) <= 0
     or v_order.valor_devido_real is distinct from v_intent.amount_due_real then
    raise exception 'payment amount mismatch' using errcode = 'P0001';
  end if;

  if v_intent.provider <> 'asaas'
     or v_intent.method <> 'pix'
     or v_intent.ambiente <> 'sandbox'
     or v_intent.asaas_payment_id is not null then
    raise exception 'payment intent is not eligible for sandbox Pix creation' using errcode = 'P0001';
  end if;

  if v_intent.status = 'pending_creation' then
    v_token := gen_random_uuid();

    update public.payment_intents
    set status = 'creating',
        creation_claim_token = v_token,
        creation_claimed_at = v_now,
        creation_lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
        creation_attempts = creation_attempts + 1,
        last_error_code = null,
        last_error_message = null
    where id = v_intent.id;

    return query
    select v_intent.id, 'creating'::text, true, v_token,
      v_now + make_interval(secs => p_lease_seconds),
      v_intent.creation_attempts + 1, v_intent.asaas_payment_id;
    return;
  end if;

  raise exception 'payment intent claim state changed' using errcode = 'P0001';
end;
$$;

-- A finalização somente pode ser feita pelo token do claim vigente e enquanto
-- o lease ainda estiver ativo. Respostas tardias devem seguir reconciliação.
create or replace function public.finalize_asaas_payment_creation(
  p_payment_intent_id uuid,
  p_claim_token uuid,
  p_asaas_payment_id text,
  p_provider_customer_id text,
  p_provider_status text,
  p_amount_due_real numeric,
  p_external_reference text
)
returns table (
  payment_intent_id uuid,
  status text,
  asaas_payment_id text,
  amount_due_real numeric,
  external_reference text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_intent public.payment_intents%rowtype;
  v_order public.orders%rowtype;
  v_order_id uuid;
  v_customer public.asaas_customers%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;

  if p_payment_intent_id is null or p_claim_token is null
     or nullif(btrim(p_asaas_payment_id), '') is null
     or nullif(btrim(p_provider_customer_id), '') is null
     or nullif(btrim(p_external_reference), '') is null
     or p_amount_due_real is null then
    raise exception 'finalization fields are required' using errcode = '22023';
  end if;

  -- Mesma ordem da preparação: orders -> payment_intents -> asaas_customers.
  select order_id into v_order_id
  from public.payment_intents
  where id = p_payment_intent_id;

  if not found then
    raise exception 'payment intent not found' using errcode = 'P0002';
  end if;

  select * into v_order
  from public.orders
  where id = v_order_id
  for update;

  select * into v_intent
  from public.payment_intents
  where id = p_payment_intent_id
  for update;

  if not found or v_intent.order_id is distinct from v_order.id then
    raise exception 'payment intent/order mismatch' using errcode = 'P0001';
  end if;

  if v_intent.status <> 'creating'
     or v_intent.creation_claim_token <> p_claim_token
     or v_intent.creation_lease_expires_at is null
     or v_intent.creation_lease_expires_at <= clock_timestamp() then
    raise exception 'stale or invalid creation claim' using errcode = 'P0001';
  end if;

  if v_order.status <> 'pendente' then
    raise exception 'order is no longer eligible' using errcode = 'P0001';
  end if;

  if v_order.valor_devido_real is distinct from v_intent.amount_due_real
     or p_amount_due_real is distinct from v_intent.amount_due_real then
    raise exception 'payment amount mismatch' using errcode = 'P0001';
  end if;

  if p_external_reference <> v_intent.external_reference then
    raise exception 'payment external reference mismatch' using errcode = 'P0001';
  end if;

  if v_intent.asaas_customer_id is null then
    raise exception 'payment intent customer is not associated' using errcode = 'P0001';
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
    raise exception 'provider customer mismatch' using errcode = 'P0001';
  end if;

  if v_intent.provider_customer_id is not null
     and v_intent.provider_customer_id <> btrim(p_provider_customer_id) then
    raise exception 'provider customer mismatch' using errcode = 'P0001';
  end if;

  update public.payment_intents
  set status = 'created',
      asaas_payment_id = btrim(p_asaas_payment_id),
      provider_customer_id = btrim(p_provider_customer_id),
      provider_status = nullif(btrim(p_provider_status), ''),
      creation_claim_token = null,
      creation_lease_expires_at = null
  where id = v_intent.id
    and status = 'creating'
    and creation_claim_token = p_claim_token;

  if not found then
    raise exception 'creation claim was superseded' using errcode = 'P0001';
  end if;

  return query
  select v_intent.id, 'created'::text, btrim(p_asaas_payment_id),
    v_intent.amount_due_real, v_intent.external_reference;
end;
$$;

-- Usado somente quando a resposta externa é conhecida como falha. Timeout,
-- abort ou resposta inconclusiva devem usar needs_reconciliation, nunca failed.
create or replace function public.fail_asaas_payment_creation(
  p_payment_intent_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_message text
)
returns table (payment_intent_id uuid, status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;

  update public.payment_intents
  set status = 'failed',
      last_error_code = nullif(btrim(p_error_code), ''),
      last_error_message = nullif(left(p_error_message, 1000), ''),
      creation_claim_token = null,
      creation_lease_expires_at = null
  where id = p_payment_intent_id
    and status = 'creating'
    and creation_claim_token = p_claim_token
    and creation_lease_expires_at > clock_timestamp();

  if not found then
    raise exception 'stale or invalid creation claim' using errcode = 'P0001';
  end if;

  return query select p_payment_intent_id, 'failed'::text;
end;
$$;

-- Esta transição encerra a tentativa atual e bloqueia qualquer novo POST até
-- uma rotina de reconciliação confiável localizar ou resolver a cobrança.
create or replace function public.mark_asaas_payment_needs_reconciliation(
  p_payment_intent_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_message text
)
returns table (payment_intent_id uuid, status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;

  update public.payment_intents
  set status = 'needs_reconciliation',
      last_error_code = nullif(btrim(p_error_code), ''),
      last_error_message = nullif(left(p_error_message, 1000), ''),
      creation_claim_token = null,
      creation_lease_expires_at = null
  where id = p_payment_intent_id
    and status = 'creating'
    and creation_claim_token = p_claim_token;

  if not found then
    raise exception 'stale or invalid creation claim' using errcode = 'P0001';
  end if;

  return query select p_payment_intent_id, 'needs_reconciliation'::text;
end;
$$;

revoke all on function public.claim_asaas_payment_creation(uuid, integer) from public, anon, authenticated;
revoke all on function public.finalize_asaas_payment_creation(uuid, uuid, text, text, text, numeric, text) from public, anon, authenticated;
revoke all on function public.fail_asaas_payment_creation(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.mark_asaas_payment_needs_reconciliation(uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function public.claim_asaas_payment_creation(uuid, integer) to service_role;
grant execute on function public.finalize_asaas_payment_creation(uuid, uuid, text, text, text, numeric, text) to service_role;
grant execute on function public.fail_asaas_payment_creation(uuid, uuid, text, text) to service_role;
grant execute on function public.mark_asaas_payment_needs_reconciliation(uuid, uuid, text, text) to service_role;
