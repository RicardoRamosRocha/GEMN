-- Contratos SQL da reconciliação administrativa.
-- Executar somente em uma base local já migrada; não chama o Asaas.

do $$
declare
  v_source text;
begin
  if to_regprocedure('public.reopen_asaas_customer_provisioning(uuid,uuid,boolean)') is null
     or to_regprocedure('public.link_asaas_customer_provisioning(uuid,uuid,text)') is null
     or to_regclass('public.asaas_customer_provisioning_reconciliation_audit') is null then
    raise exception 'reconciliation contract is missing';
  end if;
  if has_function_privilege('anon', 'public.reopen_asaas_customer_provisioning(uuid,uuid,boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reopen_asaas_customer_provisioning(uuid,uuid,boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.link_asaas_customer_provisioning(uuid,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.link_asaas_customer_provisioning(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'reconciliation RPC is exposed to a client role';
  end if;
  if not has_function_privilege('service_role', 'public.reopen_asaas_customer_provisioning(uuid,uuid,boolean)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.link_asaas_customer_provisioning(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'service_role cannot execute reconciliation RPC';
  end if;
  select pg_get_functiondef('public.reopen_asaas_customer_provisioning(uuid,uuid,boolean)'::regprocedure)
    into v_source;
  if position('for update' in lower(v_source)) = 0 then
    raise exception 'reopen RPC lost row locking';
  end if;
end;
$$;

-- Cenários dinâmicos devem ser executados em fixture local, dentro de uma
-- transação de teste: (a) role diferente de service_role e admin falso são
-- rejeitados; (b) confirmação false, claim inexistente e estados creating,
-- ready e needs_review com customer local são rejeitados; (c) needs_review
-- sem customer vira pending mantendo attempts e a segunda chamada retorna
-- changed=false; (d) link de customer confirmado vira ready e a repetição é
-- idempotente. Nunca usar o usuário ou o registro DEV real.
--
-- Concorrência: em duas conexões service_role, chamar reopen para o mesmo
-- claim needs_review. A segunda chamada deve aguardar FOR UPDATE e, após o
-- commit da primeira, observar status=pending e changed=false. Isso não é
-- simulável corretamente em uma única transação SQL.

begin;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000'::uuid,
   'e6600000-0000-0000-0000-000000000001'::uuid,
   'authenticated', 'authenticated', 'reconcile-admin@example.local',
   crypt('reconcile-admin', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, false, false),
  ('00000000-0000-0000-0000-000000000000'::uuid,
   'e6600000-0000-0000-0000-000000000002'::uuid,
   'authenticated', 'authenticated', 'reconcile-user@example.local',
   crypt('reconcile-user', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, false, false)
on conflict (id) do nothing;
insert into public.profiles (id, is_admin)
values
  ('e6600000-0000-0000-0000-000000000001'::uuid, true),
  ('e6600000-0000-0000-0000-000000000002'::uuid, false)
on conflict (id) do update set is_admin = excluded.is_admin;
insert into public.billing_identities (
  id, user_id, identity_version, document_type, document_ciphertext,
  document_fingerprint, document_last4, key_version, status
) values (
  'e6610000-0000-0000-0000-000000000001'::uuid,
  'e6600000-0000-0000-0000-000000000002'::uuid, 1, 'cpf',
  'ciphertext:reconciliation-test', 'hmac:reconciliation-test', '0001', 1, 'active'
)
on conflict (id) do nothing;
insert into public.asaas_customer_provisioning (
  id, user_id, billing_identity_id, ambiente, status, attempts
) values (
  'e6620000-0000-0000-0000-000000000001'::uuid,
  'e6600000-0000-0000-0000-000000000002'::uuid,
  'e6610000-0000-0000-0000-000000000001'::uuid, 'sandbox', 'needs_review', 1
)
on conflict (id) do nothing;

do $$
declare v_rejected boolean := false; v_status text; v_changed boolean; v_attempts integer;
begin
  begin
    perform public.reopen_asaas_customer_provisioning(
      'e6620000-0000-0000-0000-000000000001'::uuid,
      'e6600000-0000-0000-0000-000000000002'::uuid, true);
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'non-admin was accepted'; end if;

  select status, changed, attempts into v_status, v_changed, v_attempts
  from public.reopen_asaas_customer_provisioning(
    'e6620000-0000-0000-0000-000000000001'::uuid,
    'e6600000-0000-0000-0000-000000000001'::uuid, true);
  if v_status <> 'pending' or not v_changed or v_attempts <> 1 then
    raise exception 'reopen contract failed';
  end if;

  select status, changed, attempts into v_status, v_changed, v_attempts
  from public.reopen_asaas_customer_provisioning(
    'e6620000-0000-0000-0000-000000000001'::uuid,
    'e6600000-0000-0000-0000-000000000001'::uuid, true);
  if v_status <> 'pending' or v_changed or v_attempts <> 1 then
    raise exception 'reopen was not idempotent';
  end if;
  if (select count(*) from public.asaas_customer_provisioning_reconciliation_audit
      where provisioning_id = 'e6620000-0000-0000-0000-000000000001'::uuid) <> 1 then
    raise exception 'reopen audit is not idempotent';
  end if;
end;
$$;

rollback;
