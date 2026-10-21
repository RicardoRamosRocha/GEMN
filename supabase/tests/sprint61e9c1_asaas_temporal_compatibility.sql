-- Sprint 6.1-E9-B1.3-C1: contrato temporal da ingestão Asaas v2.
-- Execução prevista somente no banco descartável, com ON_ERROR_STOP=1.

do $$
declare
  v_signature regprocedure;
begin
  v_signature := to_regprocedure(
    'public.ingest_asaas_webhook_event_v2(text,text,text,text,text,numeric,numeric,timestamptz,text,text)'
  );
  if v_signature is null then
    raise exception 'RPC v2 ausente';
  end if;

  if to_regprocedure(
       'public.ingest_asaas_webhook_event(text,text,text,text,text,numeric,numeric,timestamptz,text)'
     ) is null then
    raise exception 'RPC histórica ausente';
  end if;

  if to_regclass('public.payment_webhook_events') is null
     or to_regclass('public.payment_webhook_event_conflicts') is null then
    raise exception 'tabelas de ingestão ausentes';
  end if;
end;
$$;

do $$
declare
  v_proc record;
begin
  select p.prosecdef, p.proconfig
    into v_proc
  from pg_proc p
  where p.oid = 'public.ingest_asaas_webhook_event_v2(text,text,text,text,text,numeric,numeric,timestamptz,text,text)'::regprocedure;

  if not v_proc.prosecdef then
    raise exception 'RPC v2 não é SECURITY DEFINER';
  end if;

  if v_proc.proconfig is null
     or not exists (
       select 1 from unnest(v_proc.proconfig) c
       where c = 'search_path=pg_catalog, public'
     ) then
    raise exception 'RPC v2 sem search_path seguro';
  end if;

  if not (
    select c.relrowsecurity
    from pg_class c
    where c.oid = 'public.payment_webhook_events'::regclass
  ) then
    raise exception 'RLS ausente em payment_webhook_events';
  end if;

  if not (
    select c.relrowsecurity
    from pg_class c
    where c.oid = 'public.payment_webhook_event_conflicts'::regclass
  ) then
    raise exception 'RLS ausente em payment_webhook_event_conflicts';
  end if;

  if has_function_privilege(
       'anon',
       'public.ingest_asaas_webhook_event_v2(text,text,text,text,text,numeric,numeric,timestamptz,text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.ingest_asaas_webhook_event_v2(text,text,text,text,text,numeric,numeric,timestamptz,text,text)',
       'EXECUTE'
     ) then
    raise exception 'RPC v2 exposta a papéis de cliente';
  end if;

  if not has_function_privilege(
       'service_role',
       'public.ingest_asaas_webhook_event_v2(text,text,text,text,text,numeric,numeric,timestamptz,text,text)',
       'EXECUTE'
     ) then
    raise exception 'service_role sem EXECUTE na RPC v2';
  end if;
end;
$$;

begin;

set local role service_role;

create temporary table gemn_e9c1_financial_snapshot (
  table_name text primary key,
  row_count bigint not null,
  fingerprint text not null
) on commit drop;

insert into gemn_e9c1_financial_snapshot (table_name, row_count, fingerprint)
select 'orders', count(*)::bigint,
       md5(coalesce(string_agg(id::text || ':' || status || ':' || forma_pagamento || ':' ||
         total_real::text || ':' || total_gemn::text || ':' || valor_devido_real::text,
         ',' order by id), ''))
from public.orders
union all
select 'payment_intents', count(*)::bigint,
       md5(coalesce(string_agg(id::text || ':' || status || ':' ||
         coalesce(asaas_payment_id, '') || ':' || amount_due_real::text || ':' ||
         coalesce(net_value::text, '') || ':' || coalesce(fee_value::text, ''),
         ',' order by id), ''))
from public.payment_intents
union all
select 'wallets', count(*)::bigint,
       md5(coalesce(string_agg(id::text || ':' || saldo_disponivel::text || ':' ||
         saldo_reservado::text || ':' || saldo_a_recuperar::text || ':' || versao::text,
         ',' order by id), ''))
from public.wallets
union all
select 'wallet_transactions', count(*)::bigint,
       md5(coalesce(string_agg(id::text || ':' || valor::text || ':' ||
         saldo_disponivel_apos::text || ':' || saldo_reservado_apos::text || ':' ||
         coalesce(order_id::text, '') || ':' || tipo,
         ',' order by id), ''))
from public.wallet_transactions
union all
select 'cashback_lots', count(*)::bigint,
       md5(coalesce(string_agg(id::text || ':' || status || ':' || valor_original::text || ':' ||
         valor_disponivel::text || ':' || valor_reservado::text || ':' ||
         valor_consumido::text || ':' || valor_a_recuperar::text,
         ',' order by id), ''))
from public.cashback_lots
union all
select 'gemn_reservations', count(*)::bigint,
       md5(coalesce(string_agg(id::text || ':' || status || ':' || valor_gemn::text,
         ',' order by id), ''))
from public.gemn_reservations
union all
select 'gemn_reservation_allocations', count(*)::bigint,
       md5(coalesce(string_agg(id::text || ':' || status || ':' || valor_gemn::text,
         ',' order by id), ''))
from public.gemn_reservation_allocations;

do $$
declare
  v_id uuid;
  v_duplicate boolean;
  v_conflict boolean;
  v_persisted boolean;
  v_status text;
  v_reason text;
  v_intent uuid;
  v_rejected boolean;
  v_count bigint;
  v_case text;
begin
  -- Explicit Z: the source text is preserved and the instant is unchanged.
  select webhook_event_id, duplicate, hash_conflict, persisted,
         processing_status, reason_code, payment_intent_id
    into v_id, v_duplicate, v_conflict, v_persisted,
         v_status, v_reason, v_intent
  from public.ingest_asaas_webhook_event_v2(
    'e9c1-explicit-z', 'PAYMENT_RECEIVED', 'pay-e9c1-z', null,
    'RECEIVED', 25, 24.50, '2026-10-21T12:34:56+00'::timestamptz,
    'e9c1-hash-z', '2026-10-21T12:34:56Z'
  );

  if v_id is null or v_duplicate or v_conflict or not v_persisted
     or v_status <> 'needs_review'
     or v_reason <> 'PAYMENT_INTENT_NOT_FOUND'
     or v_intent is not null then
    raise exception 'explicit date ingestion contract failed';
  end if;

  if not exists (
    select 1 from public.payment_webhook_events
    where asaas_event_id = 'e9c1-explicit-z'
      and occurred_at = '2026-10-21T12:34:56+00'::timestamptz
      and source_date_created = '2026-10-21T12:34:56Z'
  ) then
    raise exception 'explicit date evidence mismatch';
  end if;

  -- Official timezone-less shape: persist evidence and classify for review.
  select webhook_event_id, duplicate, hash_conflict, persisted,
         processing_status, reason_code, payment_intent_id
    into v_id, v_duplicate, v_conflict, v_persisted,
         v_status, v_reason, v_intent
  from public.ingest_asaas_webhook_event_v2(
    'e9c1-ambiguous', 'PAYMENT_RECEIVED', 'pay-e9c1-ambiguous', null,
    'RECEIVED', 25, 24.50, null, 'e9c1-hash-ambiguous',
    '2026-10-21 12:34:56'
  );

  if v_id is null or v_duplicate or v_conflict or not v_persisted
     or v_status <> 'needs_review'
     or v_reason <> 'DATE_CREATED_TIMEZONE_MISSING'
     or v_intent is not null then
    raise exception 'ambiguous date was not durably classified';
  end if;

  if not exists (
    select 1 from public.payment_webhook_events
    where asaas_event_id = 'e9c1-ambiguous'
      and occurred_at is null
      and source_date_created = '2026-10-21 12:34:56'
  ) then
    raise exception 'ambiguous date evidence mismatch';
  end if;

  -- Same hash is idempotent and does not create a second canonical row.
  select duplicate, hash_conflict, persisted, processing_status, reason_code
    into v_duplicate, v_conflict, v_persisted, v_status, v_reason
  from public.ingest_asaas_webhook_event_v2(
    'e9c1-ambiguous', 'PAYMENT_RECEIVED', 'pay-e9c1-ambiguous', null,
    'RECEIVED', 25, 24.50, null, 'e9c1-hash-ambiguous',
    '2026-10-21T12:34:56'
  );

  if not v_duplicate or v_conflict or not v_persisted
     or v_status <> 'needs_review'
     or v_reason <> 'DUPLICATE_SAME_HASH' then
    raise exception 'same hash is not idempotent';
  end if;

  -- Different hash preserves one conflict evidence row and the canonical state.
  select duplicate, hash_conflict, persisted, processing_status, reason_code
    into v_duplicate, v_conflict, v_persisted, v_status, v_reason
  from public.ingest_asaas_webhook_event_v2(
    'e9c1-ambiguous', 'PAYMENT_RECEIVED', 'pay-e9c1-ambiguous', null,
    'RECEIVED', 25, 24.50, null, 'e9c1-hash-conflict',
    '2026-10-21T12:34:56'
  );

  if not v_duplicate or not v_conflict or not v_persisted
     or v_status <> 'needs_review'
     or v_reason <> 'DUPLICATE_HASH_CONFLICT' then
    raise exception 'hash conflict was not classified';
  end if;

  perform 1 from public.ingest_asaas_webhook_event_v2(
    'e9c1-ambiguous', 'PAYMENT_RECEIVED', 'pay-e9c1-ambiguous', null,
    'RECEIVED', 25, 24.50, null, 'e9c1-hash-conflict',
    '2026-10-21T12:34:56'
  );

  select count(*) into v_count
  from public.payment_webhook_event_conflicts
  where asaas_event_id = 'e9c1-ambiguous'
    and conflicting_payload_hash = 'e9c1-hash-conflict'
    and conflicting_source_date_created = '2026-10-21T12:34:56';
  if v_count <> 1 then raise exception 'conflict evidence is not unique'; end if;

  -- Accepted and processed canonical states must never regress.
  insert into public.payment_webhook_events (
    asaas_event_id, event_type, asaas_payment_id, payment_value,
    payload_hash, processing_status, source_date_created, occurred_at
  ) values
    ('e9c1-accepted', 'PAYMENT_RECEIVED', 'pay-e9c1-accepted', 25,
     'e9c1-accepted-original', 'accepted', '2026-10-21 12:34:56', null),
    ('e9c1-processed', 'PAYMENT_RECEIVED', 'pay-e9c1-processed', 25,
     'e9c1-processed-original', 'processed', '2026-10-21 12:34:56', null);

  foreach v_case in array array['accepted', 'processed'] loop
    select processing_status, hash_conflict, persisted, reason_code
      into v_status, v_conflict, v_persisted, v_reason
    from public.ingest_asaas_webhook_event_v2(
      case when v_case = 'accepted' then 'e9c1-accepted' else 'e9c1-processed' end,
      'PAYMENT_RECEIVED', null, null, 'RECEIVED', 25, null, null,
      case when v_case = 'accepted' then 'e9c1-accepted-conflict' else 'e9c1-processed-conflict' end,
      '2026-10-21 12:34:56'
    );

    if v_status <> v_case or not v_conflict or not v_persisted
       or v_reason <> 'DUPLICATE_HASH_CONFLICT' then
      raise exception 'applied state was regressed';
    end if;
  end loop;

  -- Invalid, impossible and inconsistent temporal values fail atomically.
  foreach v_reason in array array[
    '2026-02-30 12:34:56',
    '2026/10/21 12:34:56',
    '2026-10-21T12:34:56.1234567Z'
  ] loop
    v_rejected := false;
    begin
      perform * from public.ingest_asaas_webhook_event_v2(
        'e9c1-invalid-' || replace(v_reason, ' ', '_'), 'PAYMENT_RECEIVED', null, null,
        null, 25, null, null, 'e9c1-invalid-hash-' || v_reason, v_reason
      );
    exception when others then
      v_rejected := true;
    end;
    if not v_rejected then raise exception 'invalid temporal value accepted'; end if;
  end loop;

  if exists (
    select 1 from public.payment_webhook_events
    where asaas_event_id like 'e9c1-invalid-%'
  ) then
    raise exception 'invalid temporal event left a row';
  end if;

  -- Database constraints are independently checked, not only the RPC guards.
  v_rejected := false;
  begin
    insert into public.payment_webhook_events (
      asaas_event_id, event_type, payload_hash, source_date_created
    ) values ('e9c1-invalid-constraint', 'PAYMENT_RECEIVED', 'e9c1-constraint', ' bad');
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'source date constraint accepted whitespace'; end if;

  -- Historical nine-parameter RPC remains callable and its signature is intact.
  perform * from public.record_asaas_webhook_event(
    'e9c1-historical', 'PAYMENT_RECEIVED', null, null, null,
    25, null, null, 'e9c1-historical-hash'
  );
end;
$$;

do $$
declare
  v_before record;
  v_after record;
begin
  for v_before in select * from gemn_e9c1_financial_snapshot order by table_name loop
    select row_count, fingerprint into v_after
    from (
      select 'orders' as table_name, count(*)::bigint as row_count,
        md5(coalesce(string_agg(id::text || ':' || status || ':' || forma_pagamento || ':' || total_real::text || ':' || total_gemn::text || ':' || valor_devido_real::text, ',' order by id), '')) as fingerprint from public.orders
      union all select 'payment_intents', count(*)::bigint, md5(coalesce(string_agg(id::text || ':' || status || ':' || coalesce(asaas_payment_id, '') || ':' || amount_due_real::text || ':' || coalesce(net_value::text, '') || ':' || coalesce(fee_value::text, ''), ',' order by id), '')) from public.payment_intents
      union all select 'wallets', count(*)::bigint, md5(coalesce(string_agg(id::text || ':' || saldo_disponivel::text || ':' || saldo_reservado::text || ':' || saldo_a_recuperar::text || ':' || versao::text, ',' order by id), '')) from public.wallets
      union all select 'wallet_transactions', count(*)::bigint, md5(coalesce(string_agg(id::text || ':' || valor::text || ':' || saldo_disponivel_apos::text || ':' || saldo_reservado_apos::text || ':' || coalesce(order_id::text, '') || ':' || tipo, ',' order by id), '')) from public.wallet_transactions
      union all select 'cashback_lots', count(*)::bigint, md5(coalesce(string_agg(id::text || ':' || status || ':' || valor_original::text || ':' || valor_disponivel::text || ':' || valor_reservado::text || ':' || valor_consumido::text || ':' || valor_a_recuperar::text, ',' order by id), '')) from public.cashback_lots
      union all select 'gemn_reservations', count(*)::bigint, md5(coalesce(string_agg(id::text || ':' || status || ':' || valor_gemn::text, ',' order by id), '')) from public.gemn_reservations
      union all select 'gemn_reservation_allocations', count(*)::bigint, md5(coalesce(string_agg(id::text || ':' || status || ':' || valor_gemn::text, ',' order by id), '')) from public.gemn_reservation_allocations
    ) current_state
    where current_state.table_name = v_before.table_name;

    if v_before.row_count is distinct from v_after.row_count
       or v_before.fingerprint is distinct from v_after.fingerprint then
      raise exception 'financial snapshot changed for %', v_before.table_name;
    end if;
  end loop;
end;
$$;

rollback;

select 'sprint61e9c1_asaas_temporal_compatibility_ok' as result;
