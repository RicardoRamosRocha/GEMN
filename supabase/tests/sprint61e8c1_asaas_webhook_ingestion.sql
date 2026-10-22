-- Sprint 6.1-E8-C2: contrato isolado da ingestão durável de webhooks Asaas.
-- Executar somente em uma base local de testes com as migrations aplicadas.
-- Todas as fixtures são sintéticas e a transação termina com ROLLBACK.

do $$
declare
  v_proc record;
begin
  if to_regclass('public.payment_webhook_events') is null
     or to_regclass('public.payment_webhook_event_conflicts') is null then
    raise exception 'webhook ingestion tables are missing';
  end if;

  if to_regprocedure('public.ingest_asaas_webhook_event(text,text,text,text,text,numeric,numeric,timestamptz,text)') is null then
    raise exception 'webhook ingestion function is missing';
  end if;

  if has_function_privilege('anon', 'public.ingest_asaas_webhook_event(text,text,text,text,text,numeric,numeric,timestamptz,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.ingest_asaas_webhook_event(text,text,text,text,text,numeric,numeric,timestamptz,text)', 'EXECUTE') then
    raise exception 'ingestion function is exposed to client roles';
  end if;

  if not has_function_privilege('service_role', 'public.ingest_asaas_webhook_event(text,text,text,text,text,numeric,numeric,timestamptz,text)', 'EXECUTE') then
    raise exception 'ingestion function is not granted to service_role';
  end if;

  select p.prosecdef, p.proconfig
    into v_proc
  from pg_proc p
  where p.oid = 'public.ingest_asaas_webhook_event(text,text,text,text,text,numeric,numeric,timestamptz,text)'::regprocedure;

  if not v_proc.prosecdef then
    raise exception 'ingestion function is not SECURITY DEFINER';
  end if;

  if v_proc.proconfig is null
     or not exists (
       select 1 from unnest(v_proc.proconfig) c
       where c = 'search_path=pg_catalog, public'
     ) then
    raise exception 'safe search_path is missing';
  end if;

  if not exists (
    select 1 from pg_class c
    where c.oid = 'public.payment_webhook_event_conflicts'::regclass
      and c.relrowsecurity
  ) then
    raise exception 'conflict evidence RLS is disabled';
  end if;

  if not exists (
    select 1 from pg_class c
    where c.oid = 'public.payment_webhook_events'::regclass
      and c.relrowsecurity
  ) then
    raise exception 'canonical event RLS is disabled';
  end if;

  if has_table_privilege('anon', 'public.payment_webhook_event_conflicts', 'SELECT')
     or has_table_privilege('authenticated', 'public.payment_webhook_event_conflicts', 'SELECT') then
    raise exception 'conflict evidence is exposed to client roles';
  end if;
end;
$$;

begin;

-- Fixtures sintéticas mínimas para testar correlação sem criar carteira,
-- cashback ou reserva. Todos os registros ficam protegidos pelo ROLLBACK final.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin
) values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'e8c10000-0000-0000-0000-000000000001'::uuid,
  'authenticated', 'authenticated', 'sprint61e8c1@example.local',
  crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  false
)
on conflict (id) do nothing;

-- O trigger on_auth_user_created chama handle_new_user como SECURITY DEFINER
-- e cria public.profiles para o usuário acima.

insert into public.orders (
  id, buyer_id, idempotency_key, status, forma_pagamento,
  total_real, total_gemn, criado_em, atualizado_em,
  gemn_utilizado, valor_devido_real
) values (
  'e8c20000-0000-0000-0000-000000000001'::uuid,
  'e8c10000-0000-0000-0000-000000000001'::uuid,
  'e8c30000-0000-0000-0000-000000000001'::uuid,
  'pendente', 'real', 25, 0, now(), now(), 0, 25
);

insert into public.payment_intents (
  id, order_id, buyer_id, provider, method, ambiente, status,
  idempotency_key, external_reference, asaas_payment_id,
  amount_due_real, due_at
) values (
  'e8c40000-0000-0000-0000-000000000001'::uuid,
  'e8c20000-0000-0000-0000-000000000001'::uuid,
  'e8c10000-0000-0000-0000-000000000001'::uuid,
  'asaas', 'pix', 'sandbox', 'pending_creation',
  'e8c50000-0000-0000-0000-000000000001'::uuid,
  'gemn-e8c-canonical-reference', 'pay-e8c-canonical',
  25, now() + interval '24 hours'
);

insert into public.payment_webhook_events (
  asaas_event_id, event_type, asaas_payment_id, external_reference,
  payment_value, payload_hash, processing_status, error_code
) values
  ('evt_ingest_accepted_001', 'PAYMENT_RECEIVED', 'pay-e8c-accepted',
   'gemn-e8c-accepted', 25, 'hash_accepted_original', 'accepted', null),
  ('evt_ingest_processed_001', 'PAYMENT_RECEIVED', 'pay-e8c-processed',
   'gemn-e8c-processed', 25, 'hash_processed_original', 'processed', null),
  ('evt_ingest_pending_001', 'PAYMENT_RECEIVED', 'pay-e8c-pending',
   'gemn-e8c-pending', 25, 'hash_pending_original', 'pending', null),
  ('evt_ingest_failed_001', 'PAYMENT_RECEIVED', 'pay-e8c-failed',
   'gemn-e8c-failed', 25, 'hash_failed_original', 'failed', 'TRANSIENT_TEST');

-- A partir daqui, a execução da RPC e as verificações de backend ocorrem sob
-- service_role. A preparação de auth.users foi feita pelo papel de sessão.
set local role service_role;

create temporary table gemn_e8c_financial_snapshot (
  table_name text primary key,
  row_count bigint not null,
  amount_a numeric,
  amount_b numeric,
  amount_c numeric,
  fingerprint text not null
) on commit drop;

insert into gemn_e8c_financial_snapshot (
  table_name, row_count, amount_a, amount_b, amount_c, fingerprint
)
select 'orders', count(*)::bigint,
       coalesce(sum(total_real), 0),
       coalesce(sum(total_gemn), 0),
       0::numeric,
       coalesce(string_agg(
         id::text || ':' || status || ':' || forma_pagamento,
         ',' order by id
       ), '')
from public.orders
union all
select 'payment_intents', count(*)::bigint,
       coalesce(sum(amount_due_real), 0),
       coalesce(sum(net_value), 0),
       coalesce(sum(fee_value), 0),
       coalesce(string_agg(
         id::text || ':' || status || ':' || coalesce(asaas_payment_id, ''),
         ',' order by id
       ), '')
from public.payment_intents
union all
select 'wallets', count(*)::bigint,
       coalesce(sum(saldo_disponivel), 0),
       coalesce(sum(saldo_reservado), 0),
       coalesce(sum(saldo_a_recuperar), 0),
       coalesce(string_agg(
         id::text || ':' || versao::text,
         ',' order by id
       ), '')
from public.wallets
union all
select 'wallet_transactions', count(*)::bigint,
       coalesce(sum(valor), 0),
       coalesce(sum(saldo_disponivel_apos), 0),
       coalesce(sum(saldo_reservado_apos), 0),
       coalesce(string_agg(
         id::text || ':' || tipo || ':' || coalesce(order_id::text, '') || ':'
           || saldo_a_recuperar_apos::text,
         ',' order by id
       ), '')
from public.wallet_transactions
union all
select 'cashback_lots', count(*)::bigint,
       coalesce(sum(valor_original), 0),
       coalesce(sum(valor_disponivel), 0),
       coalesce(sum(valor_reservado), 0),
       coalesce(string_agg(
         id::text || ':' || status || ':' || valor_consumido::text || ':'
           || valor_a_recuperar::text,
         ',' order by id
       ), '')
from public.cashback_lots
union all
select 'gemn_reservations', count(*)::bigint,
       coalesce(sum(valor_gemn), 0),
       0::numeric,
       0::numeric,
       coalesce(string_agg(
         id::text || ':' || status,
         ',' order by id
       ), '')
from public.gemn_reservations
union all
select 'gemn_reservation_allocations', count(*)::bigint,
       coalesce(sum(valor_gemn), 0),
       0::numeric,
       0::numeric,
       coalesce(string_agg(
         id::text || ':' || status,
         ',' order by id
       ), '')
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
  v_case text;
  v_expected_reason text;
  v_count bigint;
begin
  select webhook_event_id, duplicate, hash_conflict, persisted,
         processing_status, reason_code, payment_intent_id
    into v_id, v_duplicate, v_conflict, v_persisted,
         v_status, v_reason, v_intent
  from public.ingest_asaas_webhook_event(
    'evt_ingest_contract_001', 'PAYMENT_RECEIVED', 'pay_ingest_unknown',
    'gemn-ingest-unknown', 'RECEIVED', 25, 24.50, now(), 'hash_ingest_001'
  );

  if v_id is null or v_duplicate or v_conflict or not v_persisted
     or v_status <> 'needs_review'
     or v_reason <> 'PAYMENT_INTENT_NOT_FOUND'
     or v_intent is not null then
    raise exception 'unknown intent was not durably classified for review';
  end if;

  select count(*) into v_count
  from public.payment_webhook_events
  where asaas_event_id = 'evt_ingest_contract_001';
  if v_count <> 1 then raise exception 'canonical event count is incorrect'; end if;

  select webhook_event_id, duplicate, hash_conflict, persisted,
         processing_status, reason_code
    into v_id, v_duplicate, v_conflict, v_persisted, v_status, v_reason
  from public.ingest_asaas_webhook_event(
    'evt_ingest_contract_001', 'PAYMENT_RECEIVED', 'pay_ingest_unknown',
    'gemn-ingest-unknown', 'RECEIVED', 25, 24.50, now(), 'hash_ingest_001'
  );

  if not v_duplicate or v_conflict or not v_persisted
     or v_reason <> 'DUPLICATE_SAME_HASH' then
    raise exception 'same-hash duplicate is not idempotent';
  end if;

  select hash_conflict, persisted, processing_status, reason_code
    into v_conflict, v_persisted, v_status, v_reason
  from public.ingest_asaas_webhook_event(
    'evt_ingest_contract_001', 'PAYMENT_RECEIVED', 'pay_ingest_unknown',
    'gemn-ingest-unknown', 'RECEIVED', 25, 24.50, now(), 'hash_ingest_002'
  );

  if not v_conflict or not v_persisted
     or v_status <> 'needs_review'
     or v_reason <> 'DUPLICATE_HASH_CONFLICT' then
    raise exception 'hash conflict was not blocked for review';
  end if;

  -- A conflict after an already applied event preserves its state while
  -- recording evidence; it must never replay financial effects.
  foreach v_case in array array['accepted', 'processed'] loop
    select processing_status, hash_conflict, persisted, reason_code
      into v_status, v_conflict, v_persisted, v_reason
    from public.ingest_asaas_webhook_event(
      case when v_case = 'accepted' then 'evt_ingest_accepted_001'
           else 'evt_ingest_processed_001' end,
      'PAYMENT_RECEIVED',
      case when v_case = 'accepted' then 'pay-e8c-accepted'
           else 'pay-e8c-processed' end,
      case when v_case = 'accepted' then 'gemn-e8c-accepted'
           else 'gemn-e8c-processed' end,
      'RECEIVED', 25, 24.50, now(),
      case when v_case = 'accepted' then 'hash_accepted_conflict'
           else 'hash_processed_conflict' end
    );

    if v_status <> v_case
       or not v_conflict or not v_persisted
       or v_reason <> 'DUPLICATE_HASH_CONFLICT' then
      raise exception 'applied event was regressed or conflict was not recorded';
    end if;
  end loop;

  foreach v_case in array array['pending', 'failed'] loop
    select processing_status, hash_conflict, persisted, reason_code
      into v_status, v_conflict, v_persisted, v_reason
    from public.ingest_asaas_webhook_event(
      case when v_case = 'pending' then 'evt_ingest_pending_001'
           else 'evt_ingest_failed_001' end,
      'PAYMENT_RECEIVED',
      case when v_case = 'pending' then 'pay-e8c-pending'
           else 'pay-e8c-failed' end,
      case when v_case = 'pending' then 'gemn-e8c-pending'
           else 'gemn-e8c-failed' end,
      'RECEIVED', 25, 24.50, now(),
      case when v_case = 'pending' then 'hash_pending_conflict'
           else 'hash_failed_conflict' end
    );

    if v_status <> 'needs_review' or not v_conflict or not v_persisted
       or v_reason <> 'DUPLICATE_HASH_CONFLICT' then
      raise exception 'retryable event was not blocked for review';
    end if;
  end loop;

  -- Correlation divergences are durable review cases and do not mutate the
  -- canonical payment intent or any financial table.
  foreach v_expected_reason in array array[
    'REFERENCE_MISMATCH', 'PAYMENT_ID_MISMATCH', 'PAYMENT_VALUE_MISMATCH'
  ] loop
    select processing_status, reason_code, persisted
      into v_status, v_reason, v_persisted
    from public.ingest_asaas_webhook_event(
      case when v_expected_reason = 'REFERENCE_MISMATCH' then 'evt_ingest_ref_001'
           when v_expected_reason = 'PAYMENT_ID_MISMATCH' then 'evt_ingest_payment_001'
           else 'evt_ingest_value_001' end,
      'PAYMENT_RECEIVED',
      case when v_expected_reason = 'PAYMENT_ID_MISMATCH' then 'pay-e8c-wrong'
           else 'pay-e8c-canonical' end,
      case when v_expected_reason = 'REFERENCE_MISMATCH' then 'gemn-e8c-wrong-reference'
           else 'gemn-e8c-canonical-reference' end,
      'RECEIVED',
      case when v_expected_reason = 'PAYMENT_VALUE_MISMATCH' then 24 else 25 end,
      23.50, now(), 'hash_' || lower(v_expected_reason)
    );

    if v_status <> 'needs_review' or not v_persisted
       or v_reason <> v_expected_reason then
      raise exception 'correlation divergence was not classified for review';
    end if;
  end loop;

  if (select count(*) from public.payment_webhook_event_conflicts
      where asaas_event_id in (
        'evt_ingest_contract_001', 'evt_ingest_accepted_001',
        'evt_ingest_processed_001', 'evt_ingest_pending_001',
        'evt_ingest_failed_001'
      )) <> 5 then
    raise exception 'hash conflict evidence count is incorrect';
  end if;

  if (select count(*) from public.payment_webhook_events
      where asaas_event_id in (
        'evt_ingest_contract_001', 'evt_ingest_accepted_001',
        'evt_ingest_processed_001', 'evt_ingest_pending_001',
        'evt_ingest_failed_001'
      )) <> 5 then
    raise exception 'hash conflict created a second canonical event';
  end if;

  if exists (
    with current_snapshot(table_name, row_count, amount_a, amount_b, amount_c, fingerprint) as (
      select 'orders', count(*)::bigint, coalesce(sum(total_real), 0),
             coalesce(sum(total_gemn), 0), 0::numeric,
             coalesce(string_agg(id::text || ':' || status || ':' || forma_pagamento, ',' order by id), '')
      from public.orders
      union all
      select 'payment_intents', count(*)::bigint, coalesce(sum(amount_due_real), 0),
             coalesce(sum(net_value), 0), coalesce(sum(fee_value), 0),
             coalesce(string_agg(id::text || ':' || status || ':' || coalesce(asaas_payment_id, ''), ',' order by id), '')
      from public.payment_intents
      union all
      select 'wallets', count(*)::bigint, coalesce(sum(saldo_disponivel), 0),
             coalesce(sum(saldo_reservado), 0), coalesce(sum(saldo_a_recuperar), 0),
             coalesce(string_agg(id::text || ':' || versao::text, ',' order by id), '')
      from public.wallets
      union all
      select 'wallet_transactions', count(*)::bigint, coalesce(sum(valor), 0),
             coalesce(sum(saldo_disponivel_apos), 0), coalesce(sum(saldo_reservado_apos), 0),
             coalesce(string_agg(id::text || ':' || tipo || ':' || coalesce(order_id::text, '') || ':' || saldo_a_recuperar_apos::text, ',' order by id), '')
      from public.wallet_transactions
      union all
      select 'cashback_lots', count(*)::bigint, coalesce(sum(valor_original), 0),
             coalesce(sum(valor_disponivel), 0), coalesce(sum(valor_reservado), 0),
             coalesce(string_agg(id::text || ':' || status || ':' || valor_consumido::text || ':' || valor_a_recuperar::text, ',' order by id), '')
      from public.cashback_lots
      union all
      select 'gemn_reservations', count(*)::bigint, coalesce(sum(valor_gemn), 0), 0::numeric, 0::numeric,
             coalesce(string_agg(id::text || ':' || status, ',' order by id), '')
      from public.gemn_reservations
      union all
      select 'gemn_reservation_allocations', count(*)::bigint, coalesce(sum(valor_gemn), 0), 0::numeric, 0::numeric,
             coalesce(string_agg(id::text || ':' || status, ',' order by id), '')
      from public.gemn_reservation_allocations
    )
    select 1
    from gemn_e8c_financial_snapshot before_state
    full join current_snapshot after_state using (table_name)
    where before_state.row_count is distinct from after_state.row_count
       or before_state.amount_a is distinct from after_state.amount_a
       or before_state.amount_b is distinct from after_state.amount_b
       or before_state.amount_c is distinct from after_state.amount_c
       or before_state.fingerprint is distinct from after_state.fingerprint
  ) then
    raise exception 'ingestion changed financial values, statuses, balances or reservations';
  end if;
end;
$$;

-- Invalid arguments fail atomically and do not create a partial event.
do $$
declare
  v_rejected boolean := false;
  v_count bigint;
begin
  begin
    perform * from public.ingest_asaas_webhook_event(
      'evt_ingest_rollback_001', 'PAYMENT_RECEIVED', null,
      null, null, -1, null, now(), 'hash_rollback_001'
    );
  exception when others then
    v_rejected := true;
  end;

  if not v_rejected then raise exception 'negative payment value was accepted'; end if;

  select count(*) into v_count
  from public.payment_webhook_events
  where asaas_event_id = 'evt_ingest_rollback_001';
  if v_count <> 0 then raise exception 'failed ingestion left a partial event'; end if;
end;
$$;

-- A valid ingestion must not update payment_intents or financial tables. The
-- concurrent path is exercised by the unique constraint and ON CONFLICT path
-- above; two-session locking validation remains required in the runbook below.
rollback;

select 'sprint61e8c1_asaas_webhook_ingestion_contract_ok' as result;

-- Concorrência manual obrigatória em duas sessões service_role:
-- A: BEGIN; SELECT ingest_asaas_webhook_event(..., 'evt_concurrent', ..., 'hash_a');
-- B: SELECT ingest_asaas_webhook_event(..., 'evt_concurrent', ..., 'hash_a');
-- Após COMMIT de A, B deve retornar DUPLICATE_SAME_HASH e existir uma única
-- linha canônica. Repetir com hash_b deve registrar uma evidência de conflito.
