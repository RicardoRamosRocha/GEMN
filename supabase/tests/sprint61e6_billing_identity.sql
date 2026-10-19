-- Sprint 6.1-E6-B: contratos SQL da identificação privada de cobrança.
--
-- Este arquivo é um teste de contrato para executar em uma base local já
-- migrada. Ele não coleta documentos, não chama o Asaas e não cria cobranças.
-- Os cenários de duas sessões estão documentados ao final porque exigem duas
-- conexões SQL independentes e não podem ser simulados corretamente em uma
-- única transação.

do $$
begin
  if to_regclass('public.billing_identities') is null then
    raise exception 'billing_identities is missing';
  end if;
  if to_regclass('public.asaas_customer_provisioning') is null then
    raise exception 'asaas_customer_provisioning is missing';
  end if;
  if to_regprocedure('public.associate_asaas_customer_billing_identity(uuid,uuid)') is null
     or to_regprocedure('public.associate_asaas_customer_payment_intent(uuid,uuid)') is null
     or to_regprocedure('public.claim_asaas_customer_provisioning(uuid,text,integer)') is null
     or to_regprocedure('public.finalize_asaas_customer_provisioning(uuid,uuid,text)') is null
     or to_regprocedure('public.mark_asaas_customer_provisioning_needs_review(uuid,uuid)') is null then
    raise exception 'E6-B backend functions are missing';
  end if;
end;
$$;

do $$
declare
  v_column text;
begin
  foreach v_column in array array[
    'user_id', 'identity_version', 'document_type', 'document_ciphertext',
    'document_fingerprint', 'document_last4', 'key_version', 'status',
    'criado_em', 'atualizado_em'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'billing_identities'
        and column_name = v_column
    ) then
      raise exception 'billing_identities column is missing: %', v_column;
    end if;
  end loop;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'billing_identities'
      and column_name in ('document_plaintext', 'document_key', 'encryption_key')
  ) then
    raise exception 'billing_identities contains plaintext or key storage';
  end if;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['public.billing_identities', 'public.asaas_customer_provisioning'] loop
    if not exists (
      select 1 from pg_class c
      where c.oid = v_table::regclass and c.relrowsecurity
    ) then
      raise exception 'RLS is disabled for %', v_table;
    end if;
  end loop;
end;
$$;

do $$
begin
  if has_table_privilege('anon', 'public.billing_identities', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.billing_identities', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'billing_identities is directly writable/readable by client roles';
  end if;
  if has_table_privilege('anon', 'public.asaas_customer_provisioning', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.asaas_customer_provisioning', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'asaas_customer_provisioning is directly writable/readable by client roles';
  end if;
end;
$$;

do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.associate_asaas_customer_billing_identity(uuid,uuid)',
    'public.associate_asaas_customer_payment_intent(uuid,uuid)',
    'public.claim_asaas_customer_provisioning(uuid,text,integer)',
    'public.finalize_asaas_customer_provisioning(uuid,uuid,text)',
    'public.mark_asaas_customer_provisioning_needs_review(uuid,uuid)'
  ] loop
    if has_function_privilege('anon', v_function, 'EXECUTE')
       or has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'backend-only function is exposed to client role: %', v_function;
    end if;
    if not has_function_privilege('service_role', v_function, 'EXECUTE') then
      raise exception 'service_role cannot execute backend function: %', v_function;
    end if;
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'billing_identities'
      and indexname = 'billing_identities_one_active_per_user_idx'
  ) then
    raise exception 'one-active-identity partial unique index is missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'asaas_customers'
      and indexname = 'asaas_customers_identity_environment_unique'
  ) then
    raise exception 'customer/identity/environment unique index is missing';
  end if;
end;
$$;

do $$
declare
  v_owner text;
  v_function text;
begin
  foreach v_function in array array[
    'public.associate_asaas_customer_billing_identity(uuid,uuid)',
    'public.associate_asaas_customer_payment_intent(uuid,uuid)',
    'public.claim_asaas_customer_provisioning(uuid,text,integer)',
    'public.finalize_asaas_customer_provisioning(uuid,uuid,text)',
    'public.mark_asaas_customer_provisioning_needs_review(uuid,uuid)'
  ] loop
    select r.rolname into v_owner
    from pg_proc p join pg_roles r on r.oid = p.proowner
    where p.oid = v_function::regprocedure;
    if v_owner in ('anon', 'authenticated', 'public') then
      raise exception 'SECURITY DEFINER function has client owner: %', v_function;
    end if;
  end loop;
end;
$$;

begin;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000'::uuid,
   'e6000000-0000-0000-0000-000000000001'::uuid,
   'authenticated', 'authenticated', 'sprint61e6-a@example.local',
   crypt('sprint61e6-a', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, false, false),
  ('00000000-0000-0000-0000-000000000000'::uuid,
   'e6000000-0000-0000-0000-000000000002'::uuid,
   'authenticated', 'authenticated', 'sprint61e6-b@example.local',
   crypt('sprint61e6-b', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, false, false),
  ('00000000-0000-0000-0000-000000000000'::uuid,
   'e6000000-0000-0000-0000-000000000003'::uuid,
   'authenticated', 'authenticated', 'sprint61e6-c@example.local',
   crypt('sprint61e6-c', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, false, false)
on conflict (id) do nothing;

insert into public.profiles (id, nome_completo)
values
  ('e6000000-0000-0000-0000-000000000001'::uuid, 'E6-B A'),
  ('e6000000-0000-0000-0000-000000000002'::uuid, 'E6-B B'),
  ('e6000000-0000-0000-0000-000000000003'::uuid, 'E6-B C')
on conflict (id) do nothing;

insert into public.billing_identities (
  id, user_id, identity_version, document_type, document_ciphertext,
  document_fingerprint, document_last4, key_version, status
) values
  ('e6100000-0000-0000-0000-000000000001'::uuid,
   'e6000000-0000-0000-0000-000000000001'::uuid, 1, 'cpf',
   'ciphertext:test:e6-a-v1', 'hmac:test:e6-a-v1', '0001', 1, 'active'),
  ('e6100000-0000-0000-0000-000000000002'::uuid,
   'e6000000-0000-0000-0000-000000000002'::uuid, 1, 'cnpj',
   'ciphertext:test:e6-b-v1', 'hmac:test:e6-b-v1', '0002', 1, 'active'),
  ('e6100000-0000-0000-0000-000000000003'::uuid,
   'e6000000-0000-0000-0000-000000000003'::uuid, 1, 'cpf',
   'ciphertext:test:e6-c-v1', 'hmac:test:e6-c-v1', '0003', 1, 'active');

do $$
declare
  v_rejected boolean := false;
begin
  begin
    insert into public.billing_identities (
      user_id, identity_version, document_type, document_ciphertext,
      document_fingerprint, document_last4, key_version, status
    ) values (
      'e6000000-0000-0000-0000-000000000001'::uuid, 2, 'cpf',
      'ciphertext:test:e6-a-v2', 'hmac:test:e6-a-v2', '0004', 1, 'active'
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'second active billing identity was accepted';
  end if;

  v_rejected := false;
  begin
    insert into public.billing_identities (
      user_id, identity_version, document_type, document_ciphertext,
      document_fingerprint, document_last4, key_version, status
    ) values (
      'e6000000-0000-0000-0000-000000000001'::uuid, 2, 'cpf',
      'plaintext-document', 'hmac:test:e6-invalid', '12A4', 0, 'active'
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'invalid billing identity state was accepted';
  end if;
end;
$$;

insert into public.asaas_customers (
  id, user_id, ambiente, asaas_customer_id, status
) values
  ('e6200000-0000-0000-0000-000000000001'::uuid,
   'e6000000-0000-0000-0000-000000000001'::uuid,
   'sandbox', 'cus_e6b_a', 'active'),
  ('e6200000-0000-0000-0000-000000000002'::uuid,
   'e6000000-0000-0000-0000-000000000002'::uuid,
   'sandbox', 'cus_e6b_b', 'active');

insert into public.orders (
  id, buyer_id, idempotency_key, status, forma_pagamento,
  total_real, total_gemn, criado_em, atualizado_em,
  gemn_utilizado, valor_devido_real
) values
  ('e6300000-0000-0000-0000-000000000001'::uuid,
   'e6000000-0000-0000-0000-000000000001'::uuid,
   'e6400000-0000-0000-0000-000000000001'::uuid,
   'pendente', 'real', 25, 0, now(), now(), 0, 25),
  ('e6300000-0000-0000-0000-000000000002'::uuid,
   'e6000000-0000-0000-0000-000000000002'::uuid,
   'e6400000-0000-0000-0000-000000000002'::uuid,
   'pendente', 'real', 25, 0, now(), now(), 0, 25);

insert into public.payment_intents (
  id, order_id, buyer_id, provider, method, ambiente, status,
  idempotency_key, external_reference, amount_due_real, due_at
) values
  ('e6500000-0000-0000-0000-000000000001'::uuid,
   'e6300000-0000-0000-0000-000000000001'::uuid,
   'e6000000-0000-0000-0000-000000000001'::uuid,
   'asaas', 'pix', 'sandbox', 'pending_creation',
   'e6600000-0000-0000-0000-000000000001'::uuid,
   'gemn-e6-b-a', 25, now() + interval '24 hours'),
  ('e6500000-0000-0000-0000-000000000002'::uuid,
   'e6300000-0000-0000-0000-000000000002'::uuid,
   'e6000000-0000-0000-0000-000000000002'::uuid,
   'asaas', 'pix', 'sandbox', 'pending_creation',
   'e6600000-0000-0000-0000-000000000002'::uuid,
   'gemn-e6-b-b', 25, now() + interval '24 hours');

select * from public.associate_asaas_customer_billing_identity(
  'e6200000-0000-0000-0000-000000000001'::uuid,
  'e6100000-0000-0000-0000-000000000001'::uuid
);

do $$
declare
  v_rejected boolean := false;
begin
  begin
    perform * from public.associate_asaas_customer_billing_identity(
      'e6200000-0000-0000-0000-000000000002'::uuid,
      'e6100000-0000-0000-0000-000000000001'::uuid
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'cross-user customer/identity association was accepted';
  end if;
end;
$$;

select * from public.associate_asaas_customer_payment_intent(
  'e6500000-0000-0000-0000-000000000001'::uuid,
  'e6200000-0000-0000-0000-000000000001'::uuid
);

do $$
declare
  v_rejected boolean := false;
begin
  begin
    perform * from public.associate_asaas_customer_payment_intent(
      'e6500000-0000-0000-0000-000000000001'::uuid,
      'e6200000-0000-0000-0000-000000000002'::uuid
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'cross-user payment intent/customer association was accepted';
  end if;
end;
$$;

do $$
declare
  v_claim record;
  v_second record;
  v_third record;
begin
  select * into v_claim
  from public.claim_asaas_customer_provisioning(
    'e6100000-0000-0000-0000-000000000003'::uuid, 'sandbox', 120
  );
  if not v_claim.claim_granted or v_claim.status <> 'creating' then
    raise exception 'initial customer provisioning claim was not granted';
  end if;

  select * into v_second
  from public.claim_asaas_customer_provisioning(
    'e6100000-0000-0000-0000-000000000003'::uuid, 'sandbox', 120
  );
  if v_second.claim_granted or v_second.status <> 'creating' then
    raise exception 'second active customer provisioning claim was granted';
  end if;

  perform * from public.mark_asaas_customer_provisioning_needs_review(
    v_claim.provisioning_id, v_claim.claim_token
  );

  select * into v_third
  from public.claim_asaas_customer_provisioning(
    'e6100000-0000-0000-0000-000000000003'::uuid, 'sandbox', 120
  );
  if v_third.claim_granted or v_third.status <> 'needs_review' then
    raise exception 'ambiguous customer provisioning became retryable';
  end if;
end;
$$;

rollback;

-- Os testes de dados abaixo devem ser executados com fixtures isoladas em uma
-- transação e ROLLBACK ao final:
-- 1. Inserir duas identidades active para o mesmo user_id: a segunda deve
--    falhar no billing_identities_one_active_per_user_idx.
-- 2. Inserir status, document_type, key_version, last4 ou ciphertext inválidos:
--    cada operação deve falhar na constraint correspondente.
-- 3. Associar customer e identidade de usuários diferentes: a RPC deve falhar
--    com owner mismatch e nenhuma linha deve ser alterada.
-- 4. Associar identity inactive/deleted ou customer inactive/provisioning:
--    a RPC deve falhar.
-- 5. Associar um intent a customer de outro usuário ou ambiente: a RPC deve
--    falhar e o FK local do intent deve permanecer inalterado.
-- 6. Repetir a mesma associação: deve retornar sucesso idempotente; tentar
--    trocar para outro customer deve falhar.
-- 7. Claim de provisionamento repetido deve conceder apenas um claim. Um claim
--    creating com lease expirado deve virar needs_review, sem novo claim.
-- 8. Finalização com token inválido, expirado ou já consumido deve falhar.
-- 9. Finalizar provisionamento com provider_customer_id divergente de um
--    customer legado deve falhar, evitando sobrescrever o vínculo existente.

-- Teste de concorrência que depende de duas sessões:
-- Sessão A: BEGIN; SELECT * FROM claim_asaas_customer_provisioning(ID, 'sandbox', 120);
-- Sessão B: executar a mesma chamada antes do COMMIT da sessão A.
-- Resultado esperado: somente uma sessão recebe claim_granted=true; a outra
-- aguarda o lock e recebe creating/claim_granted=false.
-- Após resultado externo ambíguo, marcar needs_review. Uma terceira sessão deve
-- receber needs_review/claim_granted=false, nunca um novo claim.
