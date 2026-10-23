begin;

do $$
declare
  v_event uuid := gen_random_uuid();
  v_intent uuid := gen_random_uuid();
  v_order uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_customer uuid := gen_random_uuid();
  v_result record;
begin
  -- Contract presence and least privilege.
  if to_regprocedure('public.reprocess_asaas_webhook_event_after_verification(uuid,uuid,text,text,text,numeric,text)') is null then
    raise exception 'temporal recovery RPC is missing';
  end if;
  if has_function_privilege('anon', 'public.reprocess_asaas_webhook_event_after_verification(uuid,uuid,text,text,text,numeric,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reprocess_asaas_webhook_event_after_verification(uuid,uuid,text,text,text,numeric,text)', 'EXECUTE') then
    raise exception 'temporal recovery RPC is exposed to a client role';
  end if;
  if to_regprocedure('public.complete_asaas_webhook_event_after_finalization(uuid,uuid)') is null then
    raise exception 'temporal completion RPC is missing';
  end if;

  -- Fixture sintética: a recuperação deve depender apenas do estado persistido
  -- nesta transação, nunca de evento ou intent histórico do DEV/E13.
  perform set_config('request.jwt.claim.role', 'service_role', true);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
  ) values (
    '00000000-0000-0000-0000-000000000000'::uuid,
    v_user,
    'authenticated', 'authenticated',
    'sprint61r-' || replace(v_user::text, '-', '') || '@example.local',
    crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false
  );

  insert into public.profiles (id)
  values (v_user)
  on conflict (id) do nothing;

  insert into public.orders (
    id, buyer_id, idempotency_key, status, forma_pagamento,
    total_real, total_gemn, criado_em, atualizado_em,
    gemn_utilizado, valor_devido_real
  ) values (
    v_order, v_user, gen_random_uuid(), 'pendente', 'real',
    5, 0, now(), now(), 0, 5
  );

  insert into public.asaas_customers (
    id, user_id, ambiente, asaas_customer_id, status
  ) values (
    v_customer, v_user, 'sandbox', 'cus-sprint61r-' || replace(v_customer::text, '-', ''), 'active'
  );

  insert into public.payment_intents (
    id, order_id, buyer_id, provider, method, ambiente, status,
    idempotency_key, external_reference, asaas_customer_id,
    provider_customer_id, asaas_payment_id, amount_due_real, due_at
  ) values (
    v_intent, v_order, v_user, 'asaas', 'pix', 'sandbox', 'created',
    gen_random_uuid(), 'gemn-sprint61r-' || replace(v_intent::text, '-', ''),
    v_customer, 'cus-sprint61r-' || replace(v_customer::text, '-', ''),
    'pay-sprint61r-' || replace(v_intent::text, '-', ''), 5, now() + interval '24 hours'
  );

  insert into public.payment_webhook_events (
    id, provider, asaas_event_id, event_type, payment_intent_id,
    asaas_payment_id, external_reference, provider_status, payment_value,
    payload_hash, processing_status, error_code, occurred_at, source_date_created
  ) values (
    v_event, 'asaas', 'evt-sprint61r-' || replace(v_event::text, '-', ''),
    'PAYMENT_RECEIVED', null,
    'pay-sprint61r-' || replace(v_intent::text, '-', ''),
    'gemn-sprint61r-' || replace(v_intent::text, '-', ''),
    'RECEIVED', 5, 'hash-sprint61r-' || replace(v_event::text, '-', ''),
    'needs_review', 'DATE_CREATED_TIMEZONE_MISSING', null, '2026-10-22 12:00:00'
  );

  select * into v_result
  from public.reprocess_asaas_webhook_event_after_verification(
    v_event, v_intent,
    'pay-sprint61r-' || replace(v_intent::text, '-', ''),
    'cus-sprint61r-' || replace(v_customer::text, '-', ''),
    'gemn-sprint61r-' || replace(v_intent::text, '-', ''),
    5, 'RECEIVED'
  );

  if v_result.webhook_event_id <> v_event
     or v_result.payment_intent_id <> v_intent
     or v_result.processing_status <> 'pending'
     or v_result.reprocessed is distinct from true then
    raise exception 'synthetic temporal recovery did not move event to pending';
  end if;

  if exists (
    select 1 from public.payment_webhook_events
    where id = v_event and occurred_at is not null
  ) then
    raise exception 'temporal recovery inferred occurred_at';
  end if;

  select * into v_result
  from public.reprocess_asaas_webhook_event_after_verification(
    v_event, v_intent,
    'pay-sprint61r-' || replace(v_intent::text, '-', ''),
    'cus-sprint61r-' || replace(v_customer::text, '-', ''),
    'gemn-sprint61r-' || replace(v_intent::text, '-', ''),
    5, 'RECEIVED'
  );

  if v_result.reprocessed is distinct from false
     or v_result.processing_status <> 'pending' then
    raise exception 'repeated temporal recovery was not idempotent';
  end if;

  -- No timestamp inference is permitted by the function contract.
  if (select prosrc from pg_proc where oid = 'public.reprocess_asaas_webhook_event_after_verification(uuid,uuid,text,text,text,numeric,text)'::regprocedure)
     not like '%processing_status = ''pending''%' then
    raise exception 'recovery does not release only to pending';
  end if;

  if (select prosrc from pg_proc where oid = 'public.reprocess_asaas_webhook_event_after_verification(uuid,uuid,text,text,text,numeric,text)'::regprocedure)
     like '%occurred_at =%' then
    raise exception 'recovery must not infer occurred_at';
  end if;
end;
$$;

rollback;

select 'sprint61r_asaas_temporal_recovery_contract_ok' as result;
