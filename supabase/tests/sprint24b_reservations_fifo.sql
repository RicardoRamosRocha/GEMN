\set ON_ERROR_STOP on

select set_config('gemn.test.buyer', :'user_a_id', false);
select set_config('gemn.test.other', :'user_b_id', false);
select set_config('gemn.test.run_id', :'run_id', false);
select set_config('gemn.test.reserve_key', :'reserve_key', false);

begin;

do $$
declare
  v_buyer uuid := current_setting('gemn.test.buyer')::uuid;
  v_other uuid := current_setting('gemn.test.other')::uuid;
  v_app_a uuid;
  v_app_b uuid;
  v_seller_a uuid;
  v_seller_b uuid;
  v_category uuid;
  v_listing_a uuid;
  v_listing_source_b uuid;
  v_listing_b uuid;
  v_order_source_a uuid;
  v_order_source_b uuid;
  v_order_target uuid;
  v_order_insufficient uuid;
  v_order_concurrent_a uuid;
  v_order_concurrent_b uuid;
  v_order_expiry uuid;
  v_wallet uuid;
  v_lot_a uuid;
  v_lot_b uuid;
begin
  insert into public.seller_applications (user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao, status)
  values (v_buyer, 'empreendedor', 'GEMN reservation source A', 'R' || replace(v_buyer::text, '-', ''), '11999990001', 'teste', 'fixture', 'aprovada')
  returning id into v_app_a;

  insert into public.seller_applications (user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao, status)
  values (v_other, 'empreendedor', 'GEMN reservation receiver B', 'S' || replace(v_other::text, '-', ''), '11999990002', 'teste', 'fixture', 'aprovada')
  returning id into v_app_b;

  insert into public.sellers (user_id, application_id, tipo_membro, nome_negocio, descricao, telefone)
  values (v_buyer, v_app_a, 'empreendedor', 'GEMN reservation source A', 'fixture', '11999990001')
  returning id into v_seller_a;

  insert into public.sellers (user_id, application_id, tipo_membro, nome_negocio, descricao, telefone)
  values (v_other, v_app_b, 'empreendedor', 'GEMN reservation receiver B', 'fixture', '11999990002')
  returning id into v_seller_b;

  update public.sellers set aceita_gemn = true where id = v_seller_b;

  insert into public.categories (nome, ativo)
  values (concat('GEMN_RES_CAT_', current_setting('gemn.test.run_id')), true)
  returning id into v_category;

  insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
  values (v_seller_a, v_category, 'produto', concat('GEMN_RES_SOURCE_A_', current_setting('gemn.test.run_id')), 'fixture', 4.00, false, null, 'ativo')
  returning id into v_listing_a;

  insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
  values (v_seller_b, v_category, 'produto', concat('GEMN_RES_RECEIVER_', current_setting('gemn.test.run_id')), 'fixture', 12.00, true, 12.00, 'ativo');

  insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
  values (v_seller_b, v_category, 'produto', concat('GEMN_RES_SOURCE_B_', current_setting('gemn.test.run_id')), 'fixture', 6.00, false, null, 'ativo')
  returning id into v_listing_source_b;

  select id into v_listing_b from public.listings where nome = concat('GEMN_RES_RECEIVER_', current_setting('gemn.test.run_id'));

  insert into public.wallets (user_id, saldo_disponivel, saldo_reservado, saldo_a_recuperar)
  values (v_buyer, 10.00, 0.00, 0.00)
  returning id into v_wallet;

  insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
  values (v_other, gen_random_uuid(), 'pendente', 'real', 4.00, null, 0.00, 4.00)
  returning id into v_order_source_a;
  insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, subtotal_real)
  values (v_order_source_a, v_listing_a, v_seller_a, concat('GEMN_RES_SOURCE_A_', current_setting('gemn.test.run_id')), 'produto', 1, 4.00, 4.00);
  update public.orders set status = 'concluido' where id = v_order_source_a;

  insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
  values (v_other, gen_random_uuid(), 'pendente', 'real', 6.00, null, 0.00, 6.00)
  returning id into v_order_source_b;
  insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, subtotal_real)
  values (v_order_source_b, v_listing_source_b, v_seller_b, concat('GEMN_RES_SOURCE_B_', current_setting('gemn.test.run_id')), 'produto', 1, 6.00, 6.00);
  update public.orders set status = 'concluido' where id = v_order_source_b;

  insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, status)
  select v_wallet, oi.order_id, oi.id, oi.seller_id, oi.subtotal_real, oi.subtotal_real, 'disponivel'
    from public.order_items oi where oi.order_id = v_order_source_a
  returning id into v_lot_a;

  insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, status)
  select v_wallet, oi.order_id, oi.id, oi.seller_id, oi.subtotal_real, oi.subtotal_real, 'disponivel'
    from public.order_items oi where oi.order_id = v_order_source_b
  returning id into v_lot_b;

  update public.cashback_lots set criado_em = '2020-01-01 00:00:00+00' where id = v_lot_a;
  update public.cashback_lots set criado_em = '2020-01-02 00:00:00+00' where id = v_lot_b;

  insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
  values
    (v_buyer, gen_random_uuid(), 'pendente', 'real', 12.00, 12.00, 0.00, 12.00),
    (v_buyer, gen_random_uuid(), 'pendente', 'real', 12.00, 12.00, 0.00, 12.00),
    (v_buyer, gen_random_uuid(), 'pendente', 'real', 12.00, 12.00, 0.00, 12.00),
    (v_buyer, gen_random_uuid(), 'pendente', 'real', 12.00, 12.00, 0.00, 12.00),
    (v_buyer, gen_random_uuid(), 'pendente', 'real', 12.00, 12.00, 0.00, 12.00);

  insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn)
  select id, v_listing_b, v_seller_b, concat('GEMN_RES_RECEIVER_', current_setting('gemn.test.run_id')), 'produto', 1, total_real, 12.00, total_real, 12.00
    from public.orders
   where buyer_id = v_buyer
     and criado_em >= now() - interval '1 minute'
   order by criado_em;

  select id into v_order_target from public.orders where buyer_id = v_buyer order by criado_em, id limit 1 offset 0;
  select id into v_order_insufficient from public.orders where buyer_id = v_buyer order by criado_em, id limit 1 offset 1;
  select id into v_order_concurrent_a from public.orders where buyer_id = v_buyer order by criado_em, id limit 1 offset 2;
  select id into v_order_concurrent_b from public.orders where buyer_id = v_buyer order by criado_em, id limit 1 offset 3;
  select id into v_order_expiry from public.orders where buyer_id = v_buyer order by criado_em, id limit 1 offset 4;

  with numbered as (
    select id, row_number() over (order by criado_em, id) as rn
      from public.orders
     where buyer_id = v_buyer
  )
  update public.orders as o
     set gemn_utilizado = case numbered.rn when 1 then 7.00 when 2 then 4.00 when 3 then 6.00 when 4 then 6.00 else 2.00 end,
         valor_devido_real = case numbered.rn when 1 then 5.00 when 2 then 8.00 when 3 then 6.00 when 4 then 6.00 else 10.00 end
    from numbered
   where o.id = numbered.id;

  perform set_config('gemn.test.order_target', v_order_target::text, false);
  perform set_config('gemn.test.order_insufficient', v_order_insufficient::text, false);
  perform set_config('gemn.test.order_concurrent_a', v_order_concurrent_a::text, false);
  perform set_config('gemn.test.order_concurrent_b', v_order_concurrent_b::text, false);
  perform set_config('gemn.test.order_expiry', v_order_expiry::text, false);
  perform set_config('gemn.test.wallet', v_wallet::text, false);
  perform set_config('gemn.test.lot_a', v_lot_a::text, false);
  perform set_config('gemn.test.lot_b', v_lot_b::text, false);
end;
$$;

commit;

-- Compradores não podem iniciar a reserva antes da integração com create_order.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), true);
do $$
begin
  begin
    perform public.reserve_gemn_for_order(current_setting('gemn.test.order_target')::uuid, 7.00, current_setting('gemn.test.reserve_key')::uuid, null);
    raise exception 'TEST_AUTHENTICATED_RESERVE_SUCCEEDED';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
rollback;

begin;
set local role service_role;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), true);

select public.reserve_gemn_for_order(current_setting('gemn.test.order_target')::uuid, 7.00, :'reserve_key'::uuid, null);

do $$
declare
  v_count integer;
  v_available numeric;
  v_reserved numeric;
  v_lot_a_available numeric;
  v_lot_b_available numeric;
begin
  select count(*) into v_count from public.gemn_reservations where order_id = current_setting('gemn.test.order_target')::uuid;
  if v_count <> 1 then raise exception 'expected one reservation, got %', v_count; end if;
  select saldo_disponivel, saldo_reservado into v_available, v_reserved from public.wallets where id = current_setting('gemn.test.wallet')::uuid;
  if v_available <> 3.00 or v_reserved <> 7.00 then raise exception 'wallet mismatch %, %', v_available, v_reserved; end if;
  select valor_disponivel into v_lot_a_available from public.cashback_lots where id = current_setting('gemn.test.lot_a')::uuid;
  select valor_disponivel into v_lot_b_available from public.cashback_lots where id = current_setting('gemn.test.lot_b')::uuid;
  if v_lot_a_available <> 0.00 or v_lot_b_available <> 3.00 then raise exception 'FIFO mismatch %, %', v_lot_a_available, v_lot_b_available; end if;
end;
$$;

select public.reserve_gemn_for_order(current_setting('gemn.test.order_target')::uuid, 7.00, :'reserve_key'::uuid, null);

do $$
begin
  begin
    perform public.reserve_gemn_for_order(current_setting('gemn.test.order_target')::uuid, 6.00, gen_random_uuid(), null);
    raise exception 'TEST_CHANGED_RETRY_SUCCEEDED';
  exception when others then
    if sqlerrm = 'TEST_CHANGED_RETRY_SUCCEEDED' then raise; end if;
  end;
  begin
    perform public.reserve_gemn_for_order(current_setting('gemn.test.order_insufficient')::uuid, 4.00, gen_random_uuid(), null);
    raise exception 'TEST_INSUFFICIENT_SUCCEEDED';
  exception when others then
    if sqlerrm = 'TEST_INSUFFICIENT_SUCCEEDED' then raise; end if;
  end;
end;
$$;

rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.other'), true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.gemn_reservations;
  if v_count <> 0 then raise exception 'RLS leaked reservations'; end if;
end;
$$;
do $$
begin
  begin
    insert into public.gemn_reservations (wallet_id, order_id, buyer_id, seller_recebedor_id, valor_gemn, idempotency_key)
    values (current_setting('gemn.test.wallet')::uuid, current_setting('gemn.test.order_target')::uuid, current_setting('request.jwt.claim.sub')::uuid, null, 1.00, gen_random_uuid());
    raise exception 'direct reservation write should fail';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;

select 'PASS sequential FIFO/idempotency/RLS' as result;

