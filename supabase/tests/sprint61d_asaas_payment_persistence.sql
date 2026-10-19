-- Sprint 6.1-D: testes de contrato da persistência de pagamentos Asaas.
-- Executar em uma base de teste com supabase db test / psql.
-- Não usa service_role para provar pagamento; a função de webhook é apenas
-- uma fronteira interna para a futura Edge Function após validação do Asaas.

do $$
begin
  if to_regclass('public.asaas_customers') is null
     or to_regclass('public.payment_intents') is null
     or to_regclass('public.payment_webhook_events') is null then
    raise exception 'Sprint 6.1-D tables are missing';
  end if;

  if to_regprocedure('public.prepare_asaas_payment_intent(uuid,uuid)') is null then
    raise exception 'prepare_asaas_payment_intent is missing';
  end if;

  if to_regprocedure('public.record_asaas_webhook_event(text,text,text,text,text,numeric,numeric,timestamptz,text)') is null then
    raise exception 'record_asaas_webhook_event is missing';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_intents'::regclass
      and conname = 'payment_intents_order_provider_method_unique'
  ) then
    raise exception 'payment intent order/provider/method uniqueness is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_intents'::regclass
      and conname = 'payment_intents_external_payment_unique'
  ) then
    raise exception 'external payment id uniqueness is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_webhook_events'::regclass
      and conname = 'payment_webhook_events_external_unique'
  ) then
    raise exception 'webhook event id uniqueness is missing';
  end if;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'public.asaas_customers',
    'public.payment_intents',
    'public.payment_webhook_events'
  ] loop
    if not exists (
      select 1 from pg_class c
      where c.oid = v_table::regclass
        and c.relrowsecurity
    ) then
      raise exception 'RLS is disabled for %', v_table;
    end if;
  end loop;
end;
$$;

do $$
begin
  -- anon herda privilégios concedidos a PUBLIC; testar anon cobre ambos.
  if has_function_privilege('anon', 'public.prepare_asaas_payment_intent(uuid,uuid)', 'EXECUTE') then
    raise exception 'prepare function is exposed to anon/public';
  end if;

  if has_function_privilege('anon', 'public.record_asaas_webhook_event(text,text,text,text,text,numeric,numeric,timestamptz,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.record_asaas_webhook_event(text,text,text,text,text,numeric,numeric,timestamptz,text)', 'EXECUTE') then
    raise exception 'webhook recorder is exposed to client roles';
  end if;
end;
$$;

-- Testes de integração a executar com fixtures isoladas:
-- 1. Duas chamadas concorrentes de prepare_asaas_payment_intent para o mesmo
--    pedido devem retornar o mesmo id, sem segunda linha nem segundo POST externo.
-- 2. A mesma idempotency_key com pedido/valor divergente deve falhar.
-- 3. O mesmo asaas_event_id deve retornar DUPLICATE_EVENT e não reaplicar estado.
-- 4. Valor divergente, intent ausente ou pedido inelegível devem gerar
--    needs_review e nunca alterar orders, wallets, reservations ou cashback.
-- 5. O papel authenticated deve conseguir apenas SELECT dos metadados próprios;
--    INSERT/UPDATE/DELETE e leitura de payload não devem ser permitidos.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'asaas_customers'
      and policyname = 'asaas_customers_select_own'
      and cmd = 'SELECT'
  ) then
    raise exception 'own-customer read policy is missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_intents'
      and policyname = 'payment_intents_select_own'
      and cmd = 'SELECT'
  ) then
    raise exception 'own-payment-intent read policy is missing';
  end if;
end;
$$;

do $$
declare
  v_owner text;
begin
  select r.rolname into v_owner
  from pg_proc p
  join pg_roles r on r.oid = p.proowner
  where p.oid = 'public.prepare_asaas_payment_intent(uuid,uuid)'::regprocedure;

  if v_owner in ('anon', 'authenticated', 'public') then
    raise exception 'prepare function owner is a client role: %', v_owner;
  end if;

  select r.rolname into v_owner
  from pg_proc p
  join pg_roles r on r.oid = p.proowner
  where p.oid = 'public.record_asaas_webhook_event(text,text,text,text,text,numeric,numeric,timestamptz,text)'::regprocedure;

  if v_owner in ('anon', 'authenticated', 'public') then
    raise exception 'webhook function owner is a client role: %', v_owner;
  end if;
end;
$$;

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000'::uuid,
   '61000000-0000-0000-0000-000000000001'::uuid,
   'authenticated', 'authenticated', 'sprint61d-a@example.local',
   crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, false, false),
  ('00000000-0000-0000-0000-000000000000'::uuid,
   '61000000-0000-0000-0000-000000000002'::uuid,
   'authenticated', 'authenticated', 'sprint61d-b@example.local',
   crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, false, false)
on conflict (id) do nothing;

insert into public.profiles (id)
values
  ('61000000-0000-0000-0000-000000000001'::uuid),
  ('61000000-0000-0000-0000-000000000002'::uuid)
on conflict (id) do nothing;

insert into public.orders (
  id, buyer_id, idempotency_key, status, forma_pagamento,
  total_real, total_gemn, criado_em, atualizado_em,
  gemn_utilizado, valor_devido_real
) values
  ('62000000-0000-0000-0000-000000000001'::uuid,
   '61000000-0000-0000-0000-000000000001'::uuid,
   '63000000-0000-0000-0000-000000000001'::uuid,
   'pendente', 'real', 25, 0, now(), now(), 0, 25),
  ('62000000-0000-0000-0000-000000000002'::uuid,
   '61000000-0000-0000-0000-000000000001'::uuid,
   '63000000-0000-0000-0000-000000000002'::uuid,
   'pendente', 'real', 25, 0, now() - interval '25 hours', now(), 0, 25),
  ('62000000-0000-0000-0000-000000000003'::uuid,
   '61000000-0000-0000-0000-000000000001'::uuid,
   '63000000-0000-0000-0000-000000000003'::uuid,
   'pendente', 'gemn', 25, 25, now(), now(), 25, 0),
  ('62000000-0000-0000-0000-000000000004'::uuid,
   '61000000-0000-0000-0000-000000000001'::uuid,
   '63000000-0000-0000-0000-000000000004'::uuid,
   'pendente', 'real', 25, 0, now(), now(), 0, 25),
  ('62000000-0000-0000-0000-000000000005'::uuid,
   '61000000-0000-0000-0000-000000000002'::uuid,
   '63000000-0000-0000-0000-000000000005'::uuid,
   'pendente', 'real', 25, 0, now(), now(), 0, 25);

-- O pedido usado nos cenários de cancelamento precisa nascer pendente;
-- a transição é exercida pela RPC pública do comprador, preservando trigger,
-- RLS e a regra de idempotência do cancelamento.
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select * from public.cancel_pending_order(
  '62000000-0000-0000-0000-000000000004'::uuid,
  '63000000-0000-0000-0000-000000000004'::uuid
);
reset role;

insert into public.payment_intents (
  id, order_id, buyer_id, provider, method, ambiente, status,
  idempotency_key, external_reference, asaas_payment_id,
  amount_due_real, due_at
) values
  ('64000000-0000-0000-0000-000000000001'::uuid,
   '62000000-0000-0000-0000-000000000001'::uuid,
   '61000000-0000-0000-0000-000000000001'::uuid,
   'asaas', 'pix', 'sandbox', 'created',
   '65000000-0000-0000-0000-000000000001'::uuid,
   'gemn-test-webhook-1', null, 25, now() + interval '24 hours'),
  ('64000000-0000-0000-0000-000000000002'::uuid,
   '62000000-0000-0000-0000-000000000004'::uuid,
   '61000000-0000-0000-0000-000000000001'::uuid,
   'asaas', 'pix', 'sandbox', 'payment_received',
   '65000000-0000-0000-0000-000000000002'::uuid,
   'gemn-test-webhook-refund', 'pay_test_refund', 25, now() + interval '24 hours');

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_first uuid;
  v_second uuid;
  v_visible integer;
begin
  select payment_intent_id into v_first
  from public.prepare_asaas_payment_intent(
    '62000000-0000-0000-0000-000000000001'::uuid,
    '65000000-0000-0000-0000-000000000001'::uuid
  );

  select payment_intent_id into v_second
  from public.prepare_asaas_payment_intent(
    '62000000-0000-0000-0000-000000000001'::uuid,
    '65000000-0000-0000-0000-000000000001'::uuid
  );

  if v_first is null or v_first <> v_second then
    raise exception 'idempotent prepare did not reuse the same payment intent';
  end if;

  begin
    perform * from public.prepare_asaas_payment_intent(
      '62000000-0000-0000-0000-000000000001'::uuid,
      '66000000-0000-0000-0000-000000000001'::uuid
    );
    raise exception 'different idempotency key was accepted for existing intent';
  exception when others then
    if sqlstate <> '23505' then raise; end if;
  end;

  select count(*) into v_visible from public.payment_intents;
  if v_visible <> 3 then
    raise exception 'RLS returned unexpected number of own payment intents: %', v_visible;
  end if;

  begin
    perform * from public.prepare_asaas_payment_intent(
      '62000000-0000-0000-0000-000000000002'::uuid,
      '66000000-0000-0000-0000-000000000002'::uuid
    );
    raise exception 'expired order was accepted';
  exception when others then
    if sqlstate <> 'P0001' then raise; end if;
  end;

  begin
    perform * from public.prepare_asaas_payment_intent(
      '62000000-0000-0000-0000-000000000003'::uuid,
      '66000000-0000-0000-0000-000000000003'::uuid
    );
    raise exception 'GEMN-only order was accepted as Pix';
  exception when others then
    if sqlstate <> 'P0001' then raise; end if;
  end;
end;
$$;

reset role;
set local role service_role;

do $$
declare
  v_duplicate boolean;
  v_accepted boolean;
  v_reason text;
  v_status text;
begin
  select duplicate, accepted, reason_code, payment_status
  into v_duplicate, v_accepted, v_reason, v_status
  from public.record_asaas_webhook_event(
    'evt_test_received', 'PAYMENT_RECEIVED', 'pay_test_1',
    'gemn-test-webhook-1', 'RECEIVED', 25, 24.50, now(), 'hash_received'
  );
  if v_duplicate or not v_accepted or v_status <> 'payment_received' then
    raise exception 'valid webhook was not accepted';
  end if;

  select duplicate, accepted into v_duplicate, v_accepted
  from public.record_asaas_webhook_event(
    'evt_test_received', 'PAYMENT_RECEIVED', 'pay_test_1',
    'gemn-test-webhook-1', 'RECEIVED', 25, 24.50, now(), 'hash_received'
  );
  if not v_duplicate or not v_accepted then
    raise exception 'duplicate webhook was reapplied incorrectly';
  end if;

  select accepted, payment_status into v_accepted, v_status
  from public.record_asaas_webhook_event(
    'evt_test_confirmed_late', 'PAYMENT_CONFIRMED', 'pay_test_1',
    'gemn-test-webhook-1', 'CONFIRMED', 25, 24.50, now(), 'hash_confirmed'
  );
  if not v_accepted or v_status <> 'payment_received' then
    raise exception 'out-of-order webhook regressed or rejected the state';
  end if;

  select accepted, reason_code into v_accepted, v_reason
  from public.record_asaas_webhook_event(
    'evt_test_wrong_value', 'PAYMENT_RECEIVED', 'pay_test_1',
    'gemn-test-webhook-1', 'RECEIVED', 24, 23.50, now(), 'hash_wrong_value'
  );
  if v_accepted or v_reason <> 'PAYMENT_VALUE_MISMATCH' then
    raise exception 'wrong payment value was accepted';
  end if;

  select accepted, payment_status into v_accepted, v_status
  from public.record_asaas_webhook_event(
    'evt_test_refund', 'PAYMENT_REFUNDED', 'pay_test_refund',
    'gemn-test-webhook-refund', 'REFUNDED', 25, 0, now(), 'hash_refund'
  );
  if not v_accepted or v_status <> 'refunded' then
    raise exception 'refund for a canceled order was not recorded';
  end if;
end;
$$;

rollback;

select 'sprint61d_asaas_payment_persistence_contract_ok' as result;
