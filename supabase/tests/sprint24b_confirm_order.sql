\set ON_ERROR_STOP on

select set_config('gemn.test.buyer', :'buyer_id', false);
select set_config('gemn.test.seller_user', :'seller_user_id', false);
select set_config('gemn.test.admin', :'admin_id', false);
select set_config('gemn.test.run_id', :'run_id', false);
select set_config('gemn.test.key_real', :'key_real', false);
select set_config('gemn.test.key_mixed', :'key_mixed', false);
select set_config('gemn.test.key_gemn', :'key_gemn', false);
select set_config('gemn.test.key_recovery', :'key_recovery', false);
select set_config('gemn.test.key_concurrent', :'key_concurrent', false);

begin;
do $$
declare
  v_app uuid;
  v_seller uuid;
  v_category uuid;
  v_source_listing uuid;
  v_target_listing uuid;
  v_source_order uuid;
  v_source_item uuid;
  v_wallet uuid;
  v_expired_order uuid;
  v_expired_item uuid;
begin
  update public.profiles
     set is_admin = true
   where id = current_setting('gemn.test.admin')::uuid;

  insert into public.seller_applications (
    user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao, status
  ) values (
    current_setting('gemn.test.seller_user')::uuid, 'empreendedor',
    concat('GEMN_4A_SELLER_', current_setting('gemn.test.run_id')),
    'C' || replace(current_setting('gemn.test.seller_user'), '-', ''),
    '11999990004', 'teste', 'fixture', 'aprovada'
  ) returning id into v_app;

  insert into public.sellers (
    user_id, application_id, tipo_membro, nome_negocio, descricao, telefone, aceita_gemn
  ) values (
    current_setting('gemn.test.seller_user')::uuid, v_app, 'empreendedor',
    concat('GEMN_4A_SELLER_', current_setting('gemn.test.run_id')),
    'fixture', '11999990004', true
  ) returning id into v_seller;

  insert into public.categories (nome, ativo)
  values (concat('GEMN_4A_CAT_', current_setting('gemn.test.run_id')), true)
  returning id into v_category;

  insert into public.listings (
    seller_id, category_id, tipo, nome, descricao,
    preco_real, aceita_gemn, preco_gemn, status
  ) values (
    v_seller, v_category, 'produto',
    concat('GEMN_4A_SOURCE_', current_setting('gemn.test.run_id')),
    'fixture', 10.00, false, null, 'ativo'
  ) returning id into v_source_listing;

  insert into public.listings (
    seller_id, category_id, tipo, nome, descricao,
    preco_real, aceita_gemn, preco_gemn, status
  ) values (
    v_seller, v_category, 'produto',
    concat('GEMN_4A_TARGET_', current_setting('gemn.test.run_id')),
    'fixture', 10.00, true, 10.00, 'ativo'
  ) returning id into v_target_listing;

  insert into public.cashback_rules (
    seller_id, percentual, idempotency_key, vigente_desde, criado_por
  ) values (v_seller, 10.00, gen_random_uuid(), now(), current_setting('gemn.test.seller_user')::uuid);

  insert into public.wallets (user_id, saldo_disponivel)
  values (current_setting('gemn.test.buyer')::uuid, 20.00)
  returning id into v_wallet;

  insert into public.orders (
    buyer_id, idempotency_key, status, forma_pagamento,
    total_real, total_gemn, gemn_utilizado, valor_devido_real
  ) values (
    current_setting('gemn.test.buyer')::uuid, gen_random_uuid(), 'pendente', 'real',
    10.00, null, 0.00, 10.00
  ) returning id into v_source_order;

  insert into public.order_items (
    order_id, listing_id, seller_id, nome_item, tipo, quantidade,
    preco_real_unitario, subtotal_real, cashback_percentual, cashback_previsto
  ) values (
    v_source_order, v_source_listing, v_seller,
    concat('GEMN_4A_SOURCE_', current_setting('gemn.test.run_id')),
    'produto', 1, 10.00, 10.00, 0.00, 0.00
  ) returning id into v_source_item;

  update public.orders set status = 'concluido' where id = v_source_order;

  insert into public.cashback_lots (
    wallet_id, order_id, order_item_id, seller_origem_id,
    valor_original, valor_disponivel, status
  ) values (v_wallet, v_source_order, v_source_item, v_seller, 20.00, 20.00, 'disponivel');

  insert into public.orders (
    buyer_id, idempotency_key, status, forma_pagamento,
    total_real, total_gemn, gemn_utilizado, valor_devido_real,
    criado_em, atualizado_em
  ) values (
    current_setting('gemn.test.buyer')::uuid, gen_random_uuid(), 'pendente', 'real',
    10.00, 10.00, 0.00, 10.00,
    clock_timestamp() - interval '24 hours', clock_timestamp() - interval '24 hours'
  ) returning id into v_expired_order;

  insert into public.order_items (
    order_id, listing_id, seller_id, nome_item, tipo, quantidade,
    preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn,
    cashback_percentual, cashback_previsto
  ) values (
    v_expired_order, v_target_listing, v_seller,
    concat('GEMN_4A_TARGET_', current_setting('gemn.test.run_id')),
    'produto', 1, 10.00, 10.00, 10.00, 10.00, 10.00, 1.00
  ) returning id into v_expired_item;

  perform set_config('gemn.test.target_listing', v_target_listing::text, false);
  perform set_config('gemn.test.seller', v_seller::text, false);
  perform set_config('gemn.test.expired_order', v_expired_order::text, false);
end;
$$;
commit;

-- Cria pedidos reais, mistos e 100% GEMN como comprador autenticado.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), true);
select * from public.create_order(current_setting('gemn.test.target_listing')::uuid, 1, 'real', :'key_real'::uuid, 0.00);
select * from public.create_order(current_setting('gemn.test.target_listing')::uuid, 1, 'misto', :'key_mixed'::uuid, 4.00);
select * from public.create_order(current_setting('gemn.test.target_listing')::uuid, 1, 'gemn', :'key_gemn'::uuid, 10.00);
reset role;
commit;

select set_config('gemn.test.real_order', (select id::text from public.orders where idempotency_key = current_setting('gemn.test.key_real')::uuid), false);
select set_config('gemn.test.mixed_order', (select id::text from public.orders where idempotency_key = current_setting('gemn.test.key_mixed')::uuid), false);
select set_config('gemn.test.gemn_order', (select id::text from public.orders where idempotency_key = current_setting('gemn.test.key_gemn')::uuid), false);

-- Usuário comum e vendedor não podem confirmar.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), true);
do $$
begin
  begin
    perform public.confirm_order_payment(
      current_setting('gemn.test.real_order')::uuid,
      gen_random_uuid()
    );
    raise exception 'buyer confirmation unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'buyer confirmation unexpectedly succeeded' then raise; end if;
  end;
end;
$$;
reset role;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.seller_user'), true);
do $$
begin
  begin
    perform public.confirm_order_payment(
      current_setting('gemn.test.real_order')::uuid,
      gen_random_uuid()
    );
    raise exception 'seller confirmation unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'seller confirmation unexpectedly succeeded' then raise; end if;
  end;
end;
$$;
reset role;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.admin'), true);
do $$
begin
  begin
    perform public.confirm_order_payment(
      current_setting('gemn.test.expired_order')::uuid,
      gen_random_uuid()
    );
    raise exception '24-hour-old order unexpectedly confirmed';
  exception when others then
    if sqlerrm = '24-hour-old order unexpectedly confirmed' then raise; end if;
  end;
end;
$$;
reset role;
do $$
begin
  if (select status from public.orders where id = current_setting('gemn.test.expired_order')::uuid) <> 'pendente'
     or exists (select 1 from public.cashback_lots where order_id = current_setting('gemn.test.expired_order')::uuid) then
    raise exception 'expired-order rejection left financial state';
  end if;
end;
$$;
rollback;

-- Confirmação administrativa do pedido real.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.admin'), true);
select * from public.confirm_order_payment(
  current_setting('gemn.test.real_order')::uuid,
  :'key_real'::uuid
);
reset role;

do $$
declare
  v_status text;
  v_lots integer;
  v_credit numeric;
begin
  select status into v_status from public.orders where idempotency_key = current_setting('gemn.test.key_real')::uuid;
  select count(*) into v_lots from public.cashback_lots cl join public.orders o on o.id = cl.order_id where o.idempotency_key = current_setting('gemn.test.key_real')::uuid;
  select coalesce(sum(valor), 0) into v_credit from public.wallet_transactions wt join public.orders o on o.id = wt.order_id where o.idempotency_key = current_setting('gemn.test.key_real')::uuid and wt.tipo = 'cashback_credito';
  if v_status <> 'confirmado' or v_lots <> 1 or v_credit <> 1.00 then
    raise exception 'real confirmation mismatch: status=%, lots=%, credit=%', v_status, v_lots, v_credit;
  end if;
end;
$$;
commit;

-- Confirmação mista: consome reserva e credita apenas o cashback sobre reais.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.admin'), true);
select * from public.confirm_order_payment(
  current_setting('gemn.test.mixed_order')::uuid,
  :'key_mixed'::uuid
);
reset role;

do $$
declare
  v_reservation_status text;
  v_allocation_status text;
  v_cashback numeric;
  v_debit numeric;
begin
  select r.status into v_reservation_status from public.gemn_reservations r join public.orders o on o.id = r.order_id where o.idempotency_key = current_setting('gemn.test.key_mixed')::uuid;
  select a.status into v_allocation_status from public.gemn_reservation_allocations a join public.gemn_reservations r on r.id = a.reservation_id join public.orders o on o.id = r.order_id where o.idempotency_key = current_setting('gemn.test.key_mixed')::uuid;
  select coalesce(sum(valor), 0) into v_cashback from public.wallet_transactions wt join public.orders o on o.id = wt.order_id where o.idempotency_key = current_setting('gemn.test.key_mixed')::uuid and wt.tipo = 'cashback_credito';
  select coalesce(sum(valor), 0) into v_debit from public.wallet_transactions wt join public.orders o on o.id = wt.order_id where o.idempotency_key = current_setting('gemn.test.key_mixed')::uuid and wt.tipo = 'debito_gemn';
  if v_reservation_status <> 'efetivada' or v_allocation_status <> 'consumida' or v_cashback <> 0.60 or v_debit <> 4.00 then
    raise exception 'mixed confirmation mismatch: reservation=%, allocation=%, cashback=%, debit=%', v_reservation_status, v_allocation_status, v_cashback, v_debit;
  end if;
end;
$$;
commit;

-- 100% GEMN: reserva efetivada e cashback zero.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.admin'), true);
select * from public.confirm_order_payment(
  current_setting('gemn.test.gemn_order')::uuid,
  :'key_gemn'::uuid
);
reset role;

do $$
declare
  v_cashback numeric;
  v_debit numeric;
  v_lot_status text;
begin
  select coalesce(sum(valor), 0) into v_cashback from public.wallet_transactions wt join public.orders o on o.id = wt.order_id where o.idempotency_key = current_setting('gemn.test.key_gemn')::uuid and wt.tipo = 'cashback_credito';
  select coalesce(sum(valor), 0) into v_debit from public.wallet_transactions wt join public.orders o on o.id = wt.order_id where o.idempotency_key = current_setting('gemn.test.key_gemn')::uuid and wt.tipo = 'debito_gemn';
  select cl.status into v_lot_status from public.cashback_lots cl join public.orders o on o.id = cl.order_id where o.idempotency_key = current_setting('gemn.test.key_gemn')::uuid;
  if v_cashback <> 0.00 or v_debit <> 10.00 or v_lot_status <> 'esgotado' then
    raise exception '100%% GEMN confirmation mismatch: cashback=%, debit=%, lot=%', v_cashback, v_debit, v_lot_status;
  end if;
end;
$$;
commit;

-- Retry idempotente não duplica lotes nem ledger; chave diferente é rejeitada.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.admin'), true);
select * from public.confirm_order_payment(
  current_setting('gemn.test.real_order')::uuid,
  :'key_real'::uuid
);
reset role;
do $$
begin
  begin
    perform public.confirm_order_payment(
      current_setting('gemn.test.real_order')::uuid,
      gen_random_uuid()
    );
    raise exception 'different confirmation key unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'different confirmation key unexpectedly succeeded' then raise; end if;
  end;
end;
$$;
rollback;

-- Abatimento de saldo_a_recuperar antes de disponibilizar novo cashback.
begin;
update public.wallets
   set saldo_a_recuperar = 2.00
 where user_id = current_setting('gemn.test.buyer')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), true);
select * from public.create_order(current_setting('gemn.test.target_listing')::uuid, 1, 'real', :'key_recovery'::uuid, 0.00);
reset role;
select set_config('gemn.test.recovery_order', (select id::text from public.orders where idempotency_key = current_setting('gemn.test.key_recovery')::uuid), false);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.admin'), true);
select * from public.confirm_order_payment(
  current_setting('gemn.test.recovery_order')::uuid,
  :'key_recovery'::uuid
);
reset role;
do $$
declare
  v_available numeric;
  v_recover numeric;
  v_lot_available numeric;
  v_lot_recover numeric;
begin
  select saldo_disponivel, saldo_a_recuperar into v_available, v_recover from public.wallets where user_id = current_setting('gemn.test.buyer')::uuid;
  select cl.valor_disponivel, cl.valor_a_recuperar into v_lot_available, v_lot_recover from public.cashback_lots cl join public.orders o on o.id = cl.order_id where o.idempotency_key = current_setting('gemn.test.key_recovery')::uuid;
  if v_recover <> 1.00 or v_lot_available <> 0.00 or v_lot_recover <> 1.00 then
    raise exception 'cashback recovery mismatch: wallet=%, lot available=%, lot recovery=%', v_recover, v_lot_available, v_lot_recover;
  end if;
end;
$$;
rollback;

-- Falha de integridade deve fazer rollback integral do consumo.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), true);
select * from public.create_order(current_setting('gemn.test.target_listing')::uuid, 1, 'misto', gen_random_uuid(), 2.00) \gset failed_order_
reset role;
select set_config('gemn.test.failed_order', :'failed_order_order_id', false);
update public.gemn_reservations set valor_gemn = 1.00 where order_id = :'failed_order_order_id'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.admin'), true);
do $$
begin
  begin
    perform public.confirm_order_payment(current_setting('gemn.test.failed_order')::uuid, gen_random_uuid());
    raise exception 'inconsistent reservation unexpectedly confirmed';
  exception when others then
    if sqlerrm = 'inconsistent reservation unexpectedly confirmed' then raise; end if;
  end;
end;
$$;
reset role;
do $$
begin
  if (select status from public.orders where id = current_setting('gemn.test.failed_order')::uuid) <> 'pendente'
     or exists (select 1 from public.cashback_lots where order_id = current_setting('gemn.test.failed_order')::uuid) then
    raise exception 'failed confirmation left partial state';
  end if;
end;
$$;
rollback;

select 'PASS administrative confirmation, FIFO consumption, cashback recovery and idempotency' as result;
