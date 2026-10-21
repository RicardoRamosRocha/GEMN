-- Sprint 6.1-E9-B1.3-A: preservação explícita de dateCreated.
-- A RPC histórica permanece inalterada. Esta migration adiciona uma interface
-- versionada para que datas sem timezone não sejam convertidas em um instante.

do $$
declare
  v_data_type text;
begin
  select c.data_type
    into v_data_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'payment_webhook_events'
    and c.column_name = 'source_date_created';

  if not found then
    alter table public.payment_webhook_events
      add column source_date_created text;
  elsif v_data_type <> 'text' then
    raise exception 'payment_webhook_events.source_date_created has unexpected type %', v_data_type;
  end if;
end;
$$;

do $$
declare
  v_data_type text;
begin
  select c.data_type
    into v_data_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'payment_webhook_event_conflicts'
    and c.column_name = 'conflicting_source_date_created';

  if not found then
    alter table public.payment_webhook_event_conflicts
      add column conflicting_source_date_created text;
  elsif v_data_type <> 'text' then
    raise exception 'payment_webhook_event_conflicts.conflicting_source_date_created has unexpected type %', v_data_type;
  end if;
end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_constraintdef(c.oid)
    into v_definition
  from pg_constraint c
  where c.conrelid = 'public.payment_webhook_events'::regclass
    and c.conname = 'payment_webhook_events_source_date_created_check';

  if found then
    if v_definition not like '%source_date_created%'
       or v_definition not like '%btrim%'
       or v_definition not like '%64%' then
      raise exception 'existing source_date_created constraint is incompatible: %', v_definition;
    end if;
  else
    alter table public.payment_webhook_events
      add constraint payment_webhook_events_source_date_created_check
      check (
        source_date_created is null
        or (
          length(btrim(source_date_created)) between 1 and 64
          and source_date_created = btrim(source_date_created)
        )
      );
  end if;
end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_constraintdef(c.oid)
    into v_definition
  from pg_constraint c
  where c.conrelid = 'public.payment_webhook_event_conflicts'::regclass
    and c.conname = 'payment_webhook_event_conflicts_source_date_created_check';

  if found then
    if v_definition not like '%conflicting_source_date_created%'
       or v_definition not like '%btrim%'
       or v_definition not like '%64%' then
      raise exception 'existing conflicting source date constraint is incompatible: %', v_definition;
    end if;
  else
    alter table public.payment_webhook_event_conflicts
      add constraint payment_webhook_event_conflicts_source_date_created_check
      check (
        conflicting_source_date_created is null
        or (
          length(btrim(conflicting_source_date_created)) between 1 and 64
          and conflicting_source_date_created = btrim(conflicting_source_date_created)
        )
      );
  end if;
end;
$$;

create or replace function public.ingest_asaas_webhook_event_v2(
  p_asaas_event_id text,
  p_event_type text,
  p_asaas_payment_id text,
  p_external_reference text,
  p_provider_status text,
  p_payment_value numeric,
  p_net_value numeric,
  p_occurred_at timestamptz,
  p_payload_hash text,
  p_source_date_created text
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
  v_has_explicit_timezone boolean;
  v_parsed_at timestamptz;
  v_parsed_local timestamp without time zone;
begin
  if p_asaas_event_id is null or length(btrim(p_asaas_event_id)) = 0
     or p_event_type is null or length(btrim(p_event_type)) = 0
     or p_payload_hash is null or length(btrim(p_payload_hash)) = 0
     or p_source_date_created is null
     or length(btrim(p_source_date_created)) = 0
     or length(p_source_date_created) > 64
     or p_source_date_created <> btrim(p_source_date_created) then
    raise exception 'webhook identity and source date fields are required' using errcode = '22023';
  end if;

  if p_payment_value is not null and p_payment_value < 0 then
    raise exception 'payment value must not be negative' using errcode = '22023';
  end if;

  if p_net_value is not null and p_net_value < 0 then
    raise exception 'net value must not be negative' using errcode = '22023';
  end if;

  v_has_explicit_timezone := p_source_date_created ~
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?([Zz]|[+-][0-9]{2}:[0-9]{2})$';

  if not v_has_explicit_timezone
     and p_source_date_created !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?$' then
    raise exception 'source date format is not supported' using errcode = '22023';
  end if;

  if v_has_explicit_timezone then
    if p_occurred_at is null then
      raise exception 'explicit source date requires occurred_at' using errcode = '22023';
    end if;

    begin
      v_parsed_at := p_source_date_created::timestamptz;
    exception when others then
      raise exception 'source date is invalid' using errcode = '22023';
    end;

    if v_parsed_at is distinct from p_occurred_at then
      raise exception 'occurred_at does not match source date' using errcode = '22023';
    end if;
  elsif p_occurred_at is not null then
    raise exception 'ambiguous source date must not have occurred_at' using errcode = '22023';
  else
    begin
      v_parsed_local := p_source_date_created::timestamp without time zone;
    exception when others then
      raise exception 'source date is invalid' using errcode = '22023';
    end;
    v_reason := 'DATE_CREATED_TIMEZONE_MISSING';
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

  -- The unique constraint is the idempotency boundary. No prior SELECT is used
  -- to decide whether this event is new.
  insert into public.payment_webhook_events (
    provider, asaas_event_id, event_type, asaas_payment_id,
    external_reference, provider_status, payment_value, net_value,
    occurred_at, source_date_created, payload_hash, processing_status
  ) values (
    'asaas', p_asaas_event_id, p_event_type, p_asaas_payment_id,
    p_external_reference, p_provider_status, p_payment_value, p_net_value,
    p_occurred_at, p_source_date_created, p_payload_hash, 'pending'
  )
  on conflict (provider, asaas_event_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    if v_reason is null then
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
    conflicting_payload_hash, conflicting_source_date_created, reason_code
  ) values (
    'asaas', v_event.id, p_asaas_event_id,
    p_payload_hash, p_source_date_created, 'DUPLICATE_HASH_CONFLICT'
  )
  on conflict (provider, asaas_event_id, conflicting_payload_hash) do nothing;

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

revoke all on function public.ingest_asaas_webhook_event_v2(
  text, text, text, text, text, numeric, numeric, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.ingest_asaas_webhook_event_v2(
  text, text, text, text, text, numeric, numeric, timestamptz, text, text
) to service_role;
