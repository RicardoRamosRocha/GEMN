\set ON_ERROR_STOP on

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin
) values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'e11f0000-0000-0000-0000-000000000001'::uuid,
  'authenticated', 'authenticated', 'e11-finalizer@example.local',
  crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(), '{}', '{}', false
);

insert into public.profiles (id, nome_completo, telefone)
values ('e11f0000-0000-0000-0000-000000000001'::uuid, 'E11 Finalizer', '00000000000')
on conflict (id) do nothing;

insert into public.seller_applications (
  id, user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao, status
) values (
  'e11f0000-0000-0000-0000-000000000002'::uuid,
  'e11f0000-0000-0000-0000-000000000001'::uuid,
  'empreendedor', 'E11 Seller', '12345678909', '00000000000', 'teste', 'fixture', 'aprovada'
);

insert into public.sellers (
  id, user_id, application_id, tipo_membro, nome_negocio, descricao, telefone, status, aceita_gemn
) values (
  'e11f0000-0000-0000-0000-000000000003'::uuid,
  'e11f0000-0000-0000-0000-000000000001'::uuid,
  'e11f0000-0000-0000-0000-000000000002'::uuid,
  'empreendedor', 'E11 Seller', 'fixture', '00000000000', 'ativo', false
);

insert into public.categories (id, nome, ativo)
values ('e11f0000-0000-0000-0000-000000000004'::uuid, 'E11 Category', true);

insert into public.listings (
  id, seller_id, category_id, tipo, nome, descricao, preco_real,
  aceita_gemn, preco_gemn, status
) values (
  'e11f0000-0000-0000-0000-000000000005'::uuid,
  'e11f0000-0000-0000-0000-000000000003'::uuid,
  'e11f0000-0000-0000-0000-000000000004'::uuid,
  'produto', 'E11 Item', 'fixture', 25, false, null, 'ativo'
);

insert into public.orders (
  id, buyer_id, idempotency_key, status, forma_pagamento,
  total_real, total_gemn, gemn_utilizado, valor_devido_real
) values (
  'e11f0000-0000-0000-0000-000000000006'::uuid,
  'e11f0000-0000-0000-0000-000000000001'::uuid,
  'e11f0000-0000-0000-0000-000000000007'::uuid,
  'pendente', 'real', 25, null, 0, 25
);

insert into public.order_items (
  id, order_id, listing_id, seller_id, nome_item, tipo, quantidade,
  preco_real_unitario, subtotal_real, cashback_percentual, cashback_previsto
) values (
  'e11f0000-0000-0000-0000-000000000008'::uuid,
  'e11f0000-0000-0000-0000-000000000006'::uuid,
  'e11f0000-0000-0000-0000-000000000005'::uuid,
  'e11f0000-0000-0000-0000-000000000003'::uuid,
  'E11 Item', 'produto', 1, 25, 25, 0, 0
);

insert into public.asaas_customers (
  id, user_id, ambiente, asaas_customer_id, status
) values (
  'e11f0000-0000-0000-0000-000000000009'::uuid,
  'e11f0000-0000-0000-0000-000000000001'::uuid,
  'sandbox', 'cus_e11_verified', 'active'
);

insert into public.payment_intents (
  id, order_id, buyer_id, provider, method, ambiente, status,
  idempotency_key, external_reference, asaas_customer_id,
  provider_customer_id, asaas_payment_id, amount_due_real, currency, due_at
) values (
  'e11f0000-0000-0000-0000-000000000010'::uuid,
  'e11f0000-0000-0000-0000-000000000006'::uuid,
  'e11f0000-0000-0000-0000-000000000001'::uuid,
  'asaas', 'pix', 'sandbox', 'created',
  'e11f0000-0000-0000-0000-000000000011'::uuid,
  'gemn-order-e11-finalizer', 'e11f0000-0000-0000-0000-000000000009'::uuid,
  'cus_e11_verified', 'pay_e11_verified', 25, 'BRL', now() + interval '24 hours'
);

insert into public.payment_webhook_events (
  provider, asaas_event_id, event_type, payment_intent_id,
  asaas_payment_id, external_reference, provider_status, payment_value,
  payload_hash, processing_status
) values (
  'asaas', 'evt_e11_verified', 'PAYMENT_CONFIRMED',
  'e11f0000-0000-0000-0000-000000000010'::uuid,
  'pay_e11_verified', 'gemn-order-e11-finalizer', 'CONFIRMED', 25,
  'hash_e11_verified', 'accepted'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    perform * from public.finalize_asaas_payment(
      'e11f0000-0000-0000-0000-000000000010'::uuid,
      'pay_e11_verified', 'CONFIRMED', 25, 'BRL',
      'gemn-order-e11-finalizer', 'cus_e11_verified',
      'e11f0000-0000-0000-0000-000000000012'::uuid
    );
    raise exception 'unauthorized finalization was accepted';
  exception when others then
    if sqlerrm = 'unauthorized finalization was accepted' then raise; end if;
  end;
end;
$$;
reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  v_status text;
  v_cashback numeric;
  v_rejected boolean := false;
begin
  begin
    perform * from public.finalize_asaas_payment(
      'e11f0000-0000-0000-0000-000000000010'::uuid,
      'pay_e11_verified', 'PENDING', 25, 'BRL',
      'gemn-order-e11-finalizer', 'cus_e11_verified',
      'e11f0000-0000-0000-0000-000000000015'::uuid
    );
    raise exception 'pending provider payment was accepted';
  exception when others then
    if sqlerrm = 'pending provider payment was accepted' then raise; end if;
  end;

  begin
    perform * from public.finalize_asaas_payment(
      'e11f0000-0000-0000-0000-000000000099'::uuid,
      'pay_missing', 'CONFIRMED', 25, 'BRL',
      'missing-order', 'cus_e11_verified',
      'e11f0000-0000-0000-0000-000000000016'::uuid
    );
    raise exception 'missing payment intent was accepted';
  exception when others then
    if sqlerrm = 'missing payment intent was accepted' then raise; end if;
  end;

  begin
    perform * from public.finalize_asaas_payment(
      'e11f0000-0000-0000-0000-000000000010'::uuid,
      'pay_e11_verified', 'CONFIRMED', 25, 'BRL',
      'gemn-order-e11-finalizer', 'cus_other',
      'e11f0000-0000-0000-0000-000000000017'::uuid
    );
    raise exception 'wrong customer was accepted';
  exception when others then
    if sqlerrm = 'wrong customer was accepted' then raise; end if;
  end;

  select status, cashback_creditado into v_status, v_cashback
    from public.finalize_asaas_payment(
      'e11f0000-0000-0000-0000-000000000010'::uuid,
      'pay_e11_verified', 'CONFIRMED', 25, 'BRL',
      'gemn-order-e11-finalizer', 'cus_e11_verified',
      'e11f0000-0000-0000-0000-000000000012'::uuid
    );
  if v_status <> 'confirmado' or v_cashback <> 0 then
    raise exception 'valid Asaas finalization mismatch';
  end if;

  perform * from public.finalize_asaas_payment(
    'e11f0000-0000-0000-0000-000000000010'::uuid,
    'pay_e11_verified', 'CONFIRMED', 25, 'BRL',
    'gemn-order-e11-finalizer', 'cus_e11_verified',
    'e11f0000-0000-0000-0000-000000000012'::uuid
  );

  begin
    perform * from public.finalize_asaas_payment(
      'e11f0000-0000-0000-0000-000000000010'::uuid,
      'pay_e11_verified', 'CONFIRMED', 24, 'BRL',
      'gemn-order-e11-finalizer', 'cus_e11_verified',
      'e11f0000-0000-0000-0000-000000000013'::uuid
    );
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'divergent amount was accepted'; end if;

  v_rejected := false;
  begin
    perform * from public.finalize_asaas_payment(
      'e11f0000-0000-0000-0000-000000000010'::uuid,
      'pay_other', 'CONFIRMED', 25, 'BRL',
      'gemn-order-e11-finalizer', 'cus_e11_verified',
      'e11f0000-0000-0000-0000-000000000014'::uuid
    );
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'wrong payment was accepted'; end if;

  update public.orders
     set status = 'cancelado'
   where id = 'e11f0000-0000-0000-0000-000000000006'::uuid;
  v_rejected := false;
  begin
    perform * from public.finalize_asaas_payment(
      'e11f0000-0000-0000-0000-000000000010'::uuid,
      'pay_e11_verified', 'CONFIRMED', 25, 'BRL',
      'gemn-order-e11-finalizer', 'cus_e11_verified',
      'e11f0000-0000-0000-0000-000000000018'::uuid
    );
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'cancelled order was accepted'; end if;
end;
$$;

rollback;
select 'sprint61e11_asaas_financial_finalization_ok' as result;
