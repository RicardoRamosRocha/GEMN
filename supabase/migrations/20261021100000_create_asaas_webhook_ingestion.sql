-- Sprint 6.1-E8-C2: ingestão durável de webhooks Asaas.
-- Esta migration não aplica estados financeiros nem armazena payload bruto.

alter table public.payment_webhook_events
  add column if not exists processing_attempts integer not null default 0,
  add column if not exists claim_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_at timestamptz;

alter table public.payment_webhook_events
  drop constraint if exists payment_webhook_events_attempts_check;

alter table public.payment_webhook_events
  add constraint payment_webhook_events_attempts_check
  check (processing_attempts >= 0);

create table if not exists public.payment_webhook_event_conflicts (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'asaas',
  payment_webhook_event_id uuid not null
    references public.payment_webhook_events(id) on delete restrict,
  asaas_event_id text not null,
  conflicting_payload_hash text not null,
  received_at timestamptz not null default now(),
  reason_code text not null default 'DUPLICATE_HASH_CONFLICT',
  constraint payment_webhook_event_conflicts_provider_check
    check (provider = 'asaas'),
  constraint payment_webhook_event_conflicts_event_id_check
    check (length(btrim(asaas_event_id)) > 0),
  constraint payment_webhook_event_conflicts_hash_check
    check (length(btrim(conflicting_payload_hash)) > 0),
  constraint payment_webhook_event_conflicts_reason_check
    check (length(btrim(reason_code)) > 0),
  constraint payment_webhook_event_conflicts_unique_hash
    unique (provider, asaas_event_id, conflicting_payload_hash)
);

create index if not exists payment_webhook_events_claim_idx
  on public.payment_webhook_events (processing_status, next_attempt_at, received_at)
  where processing_status in ('pending', 'failed');

create index if not exists payment_webhook_events_lease_idx
  on public.payment_webhook_events (lease_expires_at)
  where lease_expires_at is not null;

create index if not exists payment_webhook_event_conflicts_event_idx
  on public.payment_webhook_event_conflicts (provider, asaas_event_id, received_at desc);

alter table public.payment_webhook_event_conflicts enable row level security;
revoke all on table public.payment_webhook_event_conflicts from public, anon, authenticated;

create or replace function public.ingest_asaas_webhook_event(
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
  hash_conflict boolean,
  persisted boolean,
  processing_status text,
  reason_code text,
  payment_intent_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event public.payment_webhook_events%rowtype;
  v_inserted_id uuid;
  v_intent public.payment_intents%rowtype;
  v_intent_by_payment_id uuid;
  v_intent_by_reference uuid;
  v_payment_intent_id uuid;
  v_reason text := null;
  v_is_reversal boolean;
  v_supported_event boolean;
  v_final_status text;
  v_final_payment_intent_id uuid;
begin
  if p_asaas_event_id is null or length(btrim(p_asaas_event_id)) = 0
     or p_event_type is null or length(btrim(p_event_type)) = 0
     or p_payload_hash is null or length(btrim(p_payload_hash)) = 0 then
    raise exception 'webhook identity fields are required' using errcode = '22023';
  end if;

  if p_payment_value is not null and p_payment_value < 0 then
    raise exception 'payment value must not be negative' using errcode = '22023';
  end if;

  if p_net_value is not null and p_net_value < 0 then
    raise exception 'net value must not be negative' using errcode = '22023';
  end if;

  v_is_reversal := p_event_type in (
    'PAYMENT_PARTIALLY_REFUNDED',
    'PAYMENT_REFUNDED',
    'PAYMENT_REFUND_IN_PROGRESS',
    'PAYMENT_CHARGEBACK_REQUESTED',
    'PAYMENT_CHARGEBACK_DISPUTE'
  );

  v_supported_event := p_event_type in (
    'PAYMENT_CONFIRMED',
    'PAYMENT_RECEIVED',
    'PAYMENT_OVERDUE',
    'PAYMENT_DUNNING_RECEIVED',
    'PAYMENT_PARTIALLY_REFUNDED',
    'PAYMENT_REFUNDED',
    'PAYMENT_REFUND_IN_PROGRESS',
    'PAYMENT_CHARGEBACK_REQUESTED',
    'PAYMENT_CHARGEBACK_DISPUTE'
  );

  -- A constraint-backed insert is the idempotency boundary. No prior SELECT
  -- is used to decide whether this event is new.
  insert into public.payment_webhook_events (
    provider, asaas_event_id, event_type, asaas_payment_id,
    external_reference, provider_status, payment_value, net_value,
    occurred_at, payload_hash, processing_status
  ) values (
    'asaas', p_asaas_event_id, p_event_type, p_asaas_payment_id,
    p_external_reference, p_provider_status, p_payment_value, p_net_value,
    p_occurred_at, p_payload_hash, 'pending'
  )
  on conflict (provider, asaas_event_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    select pi.id into v_intent_by_payment_id
    from public.payment_intents pi
    where pi.provider = 'asaas'
      and p_asaas_payment_id is not null
      and pi.asaas_payment_id = p_asaas_payment_id
    order by pi.criado_em
    limit 1;

    select pi.id into v_intent_by_reference
    from public.payment_intents pi
    where pi.provider = 'asaas'
      and p_external_reference is not null
      and pi.external_reference = p_external_reference
    order by pi.criado_em
    limit 1;

    if v_intent_by_payment_id is not null
       and v_intent_by_reference is not null
       and v_intent_by_payment_id <> v_intent_by_reference then
      v_reason := 'PAYMENT_REFERENCE_CONFLICT';
    elsif v_intent_by_payment_id is not null then
      v_payment_intent_id := v_intent_by_payment_id;
    elsif v_intent_by_reference is not null then
      v_payment_intent_id := v_intent_by_reference;
    else
      v_reason := 'PAYMENT_INTENT_NOT_FOUND';
    end if;

    if v_reason is null then
      select pi.* into v_intent
      from public.payment_intents pi
      where pi.id = v_payment_intent_id;

      if p_external_reference is not null
         and v_intent.external_reference <> p_external_reference then
        v_reason := 'REFERENCE_MISMATCH';
      elsif p_asaas_payment_id is not null
         and v_intent.asaas_payment_id is not null
         and v_intent.asaas_payment_id <> p_asaas_payment_id then
        v_reason := 'PAYMENT_ID_MISMATCH';
      elsif p_payment_value is null
         or p_payment_value <> v_intent.amount_due_real then
        v_reason := 'PAYMENT_VALUE_MISMATCH';
      else
        select o.status into v_reason
        from public.orders o
        where o.id = v_intent.order_id;

        if v_reason is null then
          v_reason := 'ORDER_NOT_FOUND';
        elsif not v_is_reversal and v_reason <> 'pendente' then
          v_reason := 'ORDER_NOT_ELIGIBLE';
        else
          v_reason := null;
        end if;
      end if;
    end if;

    if v_reason is null and not v_supported_event then
      v_reason := 'UNSUPPORTED_EVENT';
    end if;

    update public.payment_webhook_events as pwe
    set payment_intent_id = v_payment_intent_id,
        processing_status = case when v_reason is null then 'pending' else 'needs_review' end,
        error_code = v_reason
    where pwe.id = v_inserted_id;

    return query select v_inserted_id, false, false, true,
      case when v_reason is null then 'pending' else 'needs_review' end,
      v_reason, v_payment_intent_id;
    return;
  end if;

  -- The conflicting insert is serialized by the unique index; lock the
  -- canonical row before comparing hashes and recording evidence.
  select * into v_event
  from public.payment_webhook_events e
  where e.provider = 'asaas'
    and e.asaas_event_id = p_asaas_event_id
  for update;

  if v_event.payload_hash = p_payload_hash then
    return query select v_event.id, true, false, true,
      v_event.processing_status, 'DUPLICATE_SAME_HASH', v_event.payment_intent_id;
    return;
  end if;

  insert into public.payment_webhook_event_conflicts (
    provider, payment_webhook_event_id, asaas_event_id,
    conflicting_payload_hash, reason_code
  ) values (
    'asaas', v_event.id, p_asaas_event_id,
    p_payload_hash, 'DUPLICATE_HASH_CONFLICT'
  )
  on conflict (provider, asaas_event_id, conflicting_payload_hash) do nothing;

  -- Never regress an already applied historical event. A pending/failed event
  -- is blocked from automatic processing until manual review.
  update public.payment_webhook_events as pwe
  set processing_status = case
        when pwe.processing_status in ('accepted', 'processed') then pwe.processing_status
        else 'needs_review'
      end,
      error_code = 'DUPLICATE_HASH_CONFLICT'
  where pwe.id = v_event.id;

  select e.processing_status, e.payment_intent_id
    into v_final_status, v_final_payment_intent_id
  from public.payment_webhook_events e
  where e.id = v_event.id;

  return query select v_event.id, true, true, true,
    v_final_status, 'DUPLICATE_HASH_CONFLICT', v_final_payment_intent_id;
end;
$$;

revoke all on function public.ingest_asaas_webhook_event(
  text, text, text, text, text, numeric, numeric, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.ingest_asaas_webhook_event(
  text, text, text, text, text, numeric, numeric, timestamptz, text
) to service_role;
