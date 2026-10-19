-- Sprint 6.1-E1: testes transacionais do claim de criação Asaas.
-- Executar somente em uma base local de testes com as migrations 6.1-D/E1
-- aplicadas. Não chama a API Asaas e termina com ROLLBACK.

do $$
declare
  v_name text;
  v_function text;
  v_proc record;
begin
  if to_regprocedure('public.claim_asaas_payment_creation(uuid,integer)') is null
     or to_regprocedure('public.finalize_asaas_payment_creation(uuid,uuid,text,text,text,numeric,text)') is null
     or to_regprocedure('public.fail_asaas_payment_creation(uuid,uuid,text,text)') is null
     or to_regprocedure('public.mark_asaas_payment_needs_reconciliation(uuid,uuid,text,text)') is null then
    raise exception 'Sprint 6.1-E1 functions are missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_intents'::regclass
      and conname = 'payment_intents_status_check'
      and pg_get_constraintdef(oid) like '%creating%'
  ) then
    raise exception 'creating status is missing from payment_intents';
  end if;

  foreach v_name in array array[
    'creation_claim_token',
    'creation_lease_expires_at',
    'creation_claimed_at',
    'creation_attempts'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'payment_intents'
        and column_name = v_name
    ) then
      raise exception 'claim column is missing: %', v_name;
    end if;
  end loop;

  foreach v_function in array array[
    'public.claim_asaas_payment_creation(uuid,integer)',
    'public.finalize_asaas_payment_creation(uuid,uuid,text,text,text,numeric,text)',
    'public.fail_asaas_payment_creation(uuid,uuid,text,text)',
    'public.mark_asaas_payment_needs_reconciliation(uuid,uuid,text,text)'
  ] loop
    if has_function_privilege('anon', v_function, 'EXECUTE')
       or has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'privileged function exposed to client role: %', v_function;
    end if;

    if not has_function_privilege('service_role', v_function, 'EXECUTE') then
      raise exception 'backend function is not granted to service_role: %', v_function;
    end if;

    select p.prosecdef,
           pg_get_userbyid(p.proowner) as owner_name,
           p.proconfig
      into v_proc
    from pg_proc p
    where p.oid = v_function::regprocedure;

    if not v_proc.prosecdef then
      raise exception 'function is not SECURITY DEFINER: %', v_function;
    end if;

    if v_proc.owner_name in ('anon', 'authenticated', 'public') then
      raise exception 'function owner is a client role: %', v_function;
    end if;

    if v_proc.proconfig is null
       or not exists (
         select 1 from unnest(v_proc.proconfig) c
         where c = 'search_path=pg_catalog, public'
       ) then
      raise exception 'safe search_path is missing: %', v_function;
    end if;
  end loop;
end;
$$;

begin;

-- Fixtures ficam dentro desta transação e não sobrevivem ao ROLLBACK final.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  is_sso_user, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'e1000000-0000-0000-0000-000000000001'::uuid,
  'authenticated', 'authenticated', 'sprint61e1@example.local',
  crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}', false, false, false
)
on conflict (id) do nothing;

insert into public.profiles (id, nome_completo, telefone)
values ('e1000000-0000-0000-0000-000000000001'::uuid, 'Sprint 6.1-E1', '00000000000')
on conflict (id) do nothing;

insert into public.orders (
  id, buyer_id, idempotency_key, status, forma_pagamento,
  total_real, total_gemn, criado_em, atualizado_em,
  gemn_utilizado, valor_devido_real
) values
  ('e2000000-0000-0000-0000-000000000001'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, gen_random_uuid(), 'pendente', 'real', 25, 0, now(), now(), 0, 25),
  ('e2000000-0000-0000-0000-000000000002'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, gen_random_uuid(), 'pendente', 'real', 30, 0, now(), now(), 0, 30),
  ('e2000000-0000-0000-0000-000000000003'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, gen_random_uuid(), 'pendente', 'real', 35, 0, now(), now(), 0, 35),
  ('e2000000-0000-0000-0000-000000000004'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, gen_random_uuid(), 'pendente', 'real', 40, 0, now(), now(), 0, 40),
  ('e2000000-0000-0000-0000-000000000005'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, gen_random_uuid(), 'cancelado', 'real', 45, 0, now(), now(), 0, 45),
  ('e2000000-0000-0000-0000-000000000006'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, gen_random_uuid(), 'pendente', 'real', 50, 0, now() - interval '25 hours', now(), 0, 50),
  ('e2000000-0000-0000-0000-000000000007'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, gen_random_uuid(), 'pendente', 'gemn', 10, 10, now(), now(), 10, 0),
  ('e2000000-0000-0000-0000-000000000008'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, gen_random_uuid(), 'pendente', 'real', 55, 0, now(), now(), 0, 55),
  ('e2000000-0000-0000-0000-000000000009'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, gen_random_uuid(), 'pendente', 'real', 60, 0, now(), now(), 0, 60);

insert into public.asaas_customers (
  id, user_id, ambiente, asaas_customer_id, status
) values (
  'e3000000-0000-0000-0000-000000000001'::uuid,
  'e1000000-0000-0000-0000-000000000001'::uuid,
  'sandbox', 'cus_sprint61e1_001', 'active'
);

insert into public.payment_intents (
  id, order_id, buyer_id, provider, method, ambiente, status,
  idempotency_key, external_reference, asaas_customer_id,
  amount_due_real, due_at
) values
  ('e4000000-0000-0000-0000-000000000001'::uuid, 'e2000000-0000-0000-0000-000000000001'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, 'asaas', 'pix', 'sandbox', 'pending_creation', gen_random_uuid(), 'gemn-order-e2000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001'::uuid, 25, now() + interval '24 hours'),
  ('e4000000-0000-0000-0000-000000000002'::uuid, 'e2000000-0000-0000-0000-000000000002'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, 'asaas', 'pix', 'sandbox', 'pending_creation', gen_random_uuid(), 'gemn-order-e2000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000001'::uuid, 30, now() + interval '24 hours'),
  ('e4000000-0000-0000-0000-000000000003'::uuid, 'e2000000-0000-0000-0000-000000000003'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, 'asaas', 'pix', 'sandbox', 'pending_creation', gen_random_uuid(), 'gemn-order-e2000000-0000-0000-0000-000000000003', 'e3000000-0000-0000-0000-000000000001'::uuid, 35, now() + interval '24 hours'),
  ('e4000000-0000-0000-0000-000000000004'::uuid, 'e2000000-0000-0000-0000-000000000004'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, 'asaas', 'pix', 'sandbox', 'pending_creation', gen_random_uuid(), 'gemn-order-e2000000-0000-0000-0000-000000000004', 'e3000000-0000-0000-0000-000000000001'::uuid, 40, now() + interval '24 hours'),
  ('e4000000-0000-0000-0000-000000000005'::uuid, 'e2000000-0000-0000-0000-000000000005'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, 'asaas', 'pix', 'sandbox', 'pending_creation', gen_random_uuid(), 'gemn-order-e2000000-0000-0000-0000-000000000005', 'e3000000-0000-0000-0000-000000000001'::uuid, 45, now() + interval '24 hours'),
  ('e4000000-0000-0000-0000-000000000006'::uuid, 'e2000000-0000-0000-0000-000000000006'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, 'asaas', 'pix', 'sandbox', 'pending_creation', gen_random_uuid(), 'gemn-order-e2000000-0000-0000-0000-000000000006', 'e3000000-0000-0000-0000-000000000001'::uuid, 50, now() - interval '1 hour'),
  ('e4000000-0000-0000-0000-000000000008'::uuid, 'e2000000-0000-0000-0000-000000000008'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, 'asaas', 'pix', 'sandbox', 'pending_creation', gen_random_uuid(), 'gemn-order-e2000000-0000-0000-0000-000000000008', 'e3000000-0000-0000-0000-000000000001'::uuid, 55, now() + interval '24 hours'),
  ('e4000000-0000-0000-0000-000000000009'::uuid, 'e2000000-0000-0000-0000-000000000009'::uuid, 'e1000000-0000-0000-0000-000000000001'::uuid, 'asaas', 'pix', 'sandbox', 'pending_creation', gen_random_uuid(), 'gemn-order-e2000000-0000-0000-0000-000000000009', 'e3000000-0000-0000-0000-000000000001'::uuid, 60, now() + interval '24 hours');

do $$
declare
  v_granted boolean;
  v_token uuid;
  v_status text;
  v_rejected boolean;
begin
  select claim_granted, claim_token into v_granted, v_token
  from public.claim_asaas_payment_creation('e4000000-0000-0000-0000-000000000001'::uuid, 120);
  if not v_granted or v_token is null then raise exception 'initial claim failed'; end if;

  select claim_granted, status into v_granted, v_status
  from public.claim_asaas_payment_creation('e4000000-0000-0000-0000-000000000001'::uuid, 120);
  if v_granted or v_status <> 'creating' then raise exception 'second active claim was granted'; end if;

  perform * from public.finalize_asaas_payment_creation(
    'e4000000-0000-0000-0000-000000000001'::uuid, v_token,
    'pay_sprint61e1_001', 'cus_sprint61e1_001', 'PENDING', 25,
    'gemn-order-e2000000-0000-0000-0000-000000000001'
  );

  v_rejected := false;
  begin
    perform * from public.finalize_asaas_payment_creation(
      'e4000000-0000-0000-0000-000000000001'::uuid, v_token,
      'pay_sprint61e1_old', 'cus_sprint61e1_001', 'PENDING', 25,
      'gemn-order-e2000000-0000-0000-0000-000000000001'
    );
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'obsolete token was accepted'; end if;
end;
$$;

do $$
declare
  v_token uuid;
  v_status text;
  v_granted boolean;
  v_rejected boolean;
  v_accepted boolean;
  v_reason text;
begin
  select claim_token into v_token
  from public.claim_asaas_payment_creation('e4000000-0000-0000-0000-000000000002'::uuid, 120);
  perform * from public.fail_asaas_payment_creation(
    'e4000000-0000-0000-0000-000000000002'::uuid, v_token,
    'ASAAS_400', 'known provider rejection'
  );
  select claim_granted, status into v_granted, v_status
  from public.claim_asaas_payment_creation('e4000000-0000-0000-0000-000000000002'::uuid, 120);
  if v_granted or v_status <> 'failed' then raise exception 'failed intent became retryable'; end if;

  select claim_token into v_token
  from public.claim_asaas_payment_creation('e4000000-0000-0000-0000-000000000003'::uuid, 120);
  perform * from public.mark_asaas_payment_needs_reconciliation(
    'e4000000-0000-0000-0000-000000000003'::uuid, v_token,
    'ASAAS_TIMEOUT', 'inconclusive response'
  );
  select claim_granted, status into v_granted, v_status
  from public.claim_asaas_payment_creation('e4000000-0000-0000-0000-000000000003'::uuid, 120);
  if v_granted or v_status <> 'needs_reconciliation' then raise exception 'timeout intent became retryable'; end if;

  select accepted, reason_code into v_accepted, v_reason
  from public.record_asaas_webhook_event(
    'evt_sprint61e1_timeout_reconciled', 'PAYMENT_RECEIVED', 'pay_webhook_003',
    'gemn-order-e2000000-0000-0000-0000-000000000003', 'RECEIVED',
    35, 34, now(), 'hash_sprint61e1_timeout_reconciled'
  );
  if not v_accepted or v_reason is not null then
    raise exception 'valid webhook did not reconcile timeout intent';
  end if;
  select status into v_status
  from public.claim_asaas_payment_creation('e4000000-0000-0000-0000-000000000003'::uuid, 120);
  if v_status <> 'payment_received' then raise exception 'reconciled timeout became claimable'; end if;

  select claim_token into v_token
  from public.claim_asaas_payment_creation('e4000000-0000-0000-0000-000000000004'::uuid, 120);
  update public.payment_intents
  set creation_lease_expires_at = clock_timestamp() - interval '1 second'
  where id = 'e4000000-0000-0000-0000-000000000004'::uuid;
  select claim_granted, status into v_granted, v_status
  from public.claim_asaas_payment_creation('e4000000-0000-0000-0000-000000000004'::uuid, 120);
  if v_granted or v_status <> 'needs_reconciliation' then raise exception 'expired lease was retryable'; end if;

  v_rejected := false;
  begin
    perform * from public.finalize_asaas_payment_creation(
      'e4000000-0000-0000-0000-000000000003'::uuid, v_token,
      'pay_old', 'cus_sprint61e1_001', 'PENDING', 35,
      'gemn-order-e2000000-0000-0000-0000-000000000003'
    );
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'old token finalized reconciliation intent'; end if;
end;
$$;

do $$
declare
  v_rejected boolean;
  v_intent_id uuid;
begin
  foreach v_intent_id in array array[
    'e4000000-0000-0000-0000-000000000005'::uuid,
    'e4000000-0000-0000-0000-000000000006'::uuid
  ] loop
    v_rejected := false;
    begin
      perform * from public.claim_asaas_payment_creation(v_intent_id, 120);
    exception when others then v_rejected := true;
    end;
    if not v_rejected then raise exception 'ineligible order received a claim: %', v_intent_id; end if;
  end loop;
end;
$$;

-- Divergências de valor, referência e customer devem falhar antes da gravação.
do $$
declare
  v_token uuid;
  v_rejected boolean;
begin
  select claim_token into v_token
  from public.claim_asaas_payment_creation('e4000000-0000-0000-0000-000000000008'::uuid, 120);

  v_rejected := false;
  begin
    perform * from public.finalize_asaas_payment_creation(
      'e4000000-0000-0000-0000-000000000008'::uuid, v_token,
      'pay_bad_amount', 'cus_sprint61e1_001', 'PENDING', 54,
      'gemn-order-e2000000-0000-0000-0000-000000000008'
    );
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'amount mismatch was accepted'; end if;

  v_rejected := false;
  begin
    perform * from public.finalize_asaas_payment_creation(
      'e4000000-0000-0000-0000-000000000008'::uuid, v_token,
      'pay_bad_reference', 'cus_sprint61e1_001', 'PENDING', 55,
      'wrong-reference'
    );
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'reference mismatch was accepted'; end if;

  v_rejected := false;
  begin
    perform * from public.finalize_asaas_payment_creation(
      'e4000000-0000-0000-0000-000000000008'::uuid, v_token,
      'pay_bad_customer', 'cus_other_customer', 'PENDING', 55,
      'gemn-order-e2000000-0000-0000-0000-000000000008'
    );
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'customer mismatch was accepted'; end if;

  perform * from public.mark_asaas_payment_needs_reconciliation(
    'e4000000-0000-0000-0000-000000000008'::uuid, v_token,
    'TEST_CLEANUP', 'test cleanup'
  );
end;
$$;

-- Webhook durante creating pode resolver a intenção se a referência e o valor
-- forem válidos; finalização posterior com o claim antigo continua bloqueada.
do $$
declare
  v_token uuid;
  v_accepted boolean;
  v_reason text;
  v_status text;
  v_rejected boolean;
begin
  select claim_token into v_token
  from public.claim_asaas_payment_creation('e4000000-0000-0000-0000-000000000009'::uuid, 120);

  select accepted, reason_code, payment_status
    into v_accepted, v_reason, v_status
  from public.record_asaas_webhook_event(
    'evt_sprint61e1_creating', 'PAYMENT_RECEIVED', 'pay_webhook_009',
    'gemn-order-e2000000-0000-0000-0000-000000000009', 'RECEIVED',
    60, 59, now(), 'hash_sprint61e1_creating'
  );
  if not v_accepted or v_reason is not null or v_status <> 'payment_received' then
    raise exception 'valid webhook did not resolve creating intent';
  end if;

  v_rejected := false;
  begin
    perform * from public.finalize_asaas_payment_creation(
      'e4000000-0000-0000-0000-000000000009'::uuid, v_token,
      'pay_late', 'cus_sprint61e1_001', 'PENDING', 60,
      'gemn-order-e2000000-0000-0000-0000-000000000009'
    );
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'old claim finalized after webhook state change'; end if;

  select accepted, reason_code into v_accepted, v_reason
  from public.record_asaas_webhook_event(
    'evt_sprint61e1_divergent', 'PAYMENT_RECEIVED', 'pay_other',
    'gemn-order-e2000000-0000-0000-0000-000000000001', 'RECEIVED',
    25, 24, now(), 'hash_sprint61e1_divergent'
  );
  if v_accepted or v_reason <> 'PAYMENT_ID_MISMATCH' then
    raise exception 'divergent webhook payment id was accepted';
  end if;
end;
$$;

-- Pedido 100% GEMN não deve sequer criar payment_intent. A RPC de preparação
-- já rejeita valor_devido_real <= 0; a constraint também impede persistência
-- acidental de uma intenção desse tipo.
do $$
declare
  v_rejected boolean := false;
  v_count integer;
begin
  select count(*) into v_count
  from public.payment_intents
  where order_id = 'e2000000-0000-0000-0000-000000000007'::uuid;
  if v_count <> 0 then raise exception '100%% GEMN order has a Pix intent'; end if;

  begin
    insert into public.payment_intents (
      order_id, buyer_id, provider, method, ambiente, status,
      idempotency_key, external_reference, amount_due_real, due_at
    ) values (
      'e2000000-0000-0000-0000-000000000007'::uuid,
      'e1000000-0000-0000-0000-000000000001'::uuid,
      'asaas', 'pix', 'sandbox', 'pending_creation', gen_random_uuid(),
      'gemn-order-e2000000-0000-0000-0000-000000000007', 0, now()
    );
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception '100%% GEMN intent insert was accepted'; end if;
end;
$$;

-- Concorrência real pendente: executar em duas sessões independentes, ambas
-- com role service_role e o claim JWT configurado. A sessão A deve iniciar uma
-- transação, chamar claim para a mesma intent e manter a transação aberta;
-- a sessão B deve chamar o mesmo claim antes do COMMIT de A. Após o COMMIT de A,
-- B deve retornar claim_granted=false e status=creating. Este arquivo não marca
-- esse cenário como aprovado sem essa execução real.

rollback;

select 'sprint61e1_asaas_creation_claim_transactional_contract_ok' as result;
