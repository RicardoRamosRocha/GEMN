\set ON_ERROR_STOP on

select set_config('gemn.test.run_id', :'run_id', false);
select set_config('gemn.test.buyer', :'buyer_id', false);
select set_config('gemn.test.other_buyer', :'other_buyer_id', false);
select set_config('gemn.test.seller_user', :'seller_user_id', false);
select set_config('gemn.test.admin', :'admin_id', false);
select set_config('gemn.test.cancel_key', :'cancel_key', false);

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
begin
  update public.profiles set is_admin = true
   where id = current_setting('gemn.test.admin')::uuid;

  insert into public.seller_applications (
    user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao, status
  ) values (
    current_setting('gemn.test.seller_user')::uuid, 'empreendedor',
    'GEMN_4B1_SELLER_' || current_setting('gemn.test.run_id'),
    'B' || replace(current_setting('gemn.test.seller_user'), '-', ''),
    '11999990041', 'teste', 'fixture', 'aprovada'
  ) returning id into v_app;

  insert into public.sellers (
    user_id, application_id, tipo_membro, nome_negocio, descricao, telefone, aceita_gemn
  ) values (
    current_setting('gemn.test.seller_user')::uuid, v_app, 'empreendedor',
    'GEMN_4B1_SELLER_' || current_setting('gemn.test.run_id'),
    'fixture', '11999990041', true
  ) returning id into v_seller;

  insert into public.categories (nome, ativo)
  values ('GEMN_4B1_CAT_' || current_setting('gemn.test.run_id'), true)
  returning id into v_category;

  insert into public.listings (
    seller_id, category_id, tipo, nome, descricao, preco_real,
    aceita_gemn, preco_gemn, status
  ) values (
    v_seller, v_category, 'produto',
    'GEMN_4B1_SOURCE_' || current_setting('gemn.test.run_id'),
    'fixture', 10.00, false, null, 'ativo'
  ) returning id into v_source_listing;

  insert into public.listings (
    seller_id, category_id, tipo, nome, descricao, preco_real,
    aceita_gemn, preco_gemn, status
  ) values (
    v_seller, v_category, 'produto',
    'GEMN_4B1_TARGET_' || current_setting('gemn.test.run_id'),
    'fixture', 10.00, true, 10.00, 'ativo'
  ) returning id into v_target_listing;

  insert into public.wallets (user_id, saldo_disponivel)
  values (current_setting('gemn.test.buyer')::uuid, 10.00)
  returning id into v_wallet;

  insert into public.orders (
    buyer_id, idempotency_key, forma_pagamento, total_real, total_gemn,
    gemn_utilizado, valor_devido_real
  ) values (
    current_setting('gemn.test.buyer')::uuid, gen_random_uuid(), 'real',
    10.00, null, 0.00, 10.00
  ) returning id into v_source_order;

  insert into public.order_items (
    order_id, listing_id, seller_id, nome_item, tipo, quantidade,
    preco_real_unitario, subtotal_real, cashback_percentual, cashback_previsto
  ) values (
    v_source_order, v_source_listing, v_seller,
    'GEMN_4B1_SOURCE_' || current_setting('gemn.test.run_id'),
    'produto', 1, 10.00, 10.00, 0.00, 0.00
  ) returning id into v_source_item;

  update public.orders set status = 'concluido' where id = v_source_order;

  insert into public.cashback_lots (
    wallet_id, order_id, order_item_id, seller_origem_id,
    valor_original, valor_disponivel, status
  ) values (v_wallet, v_source_order, v_source_item, v_seller, 10.00, 10.00, 'disponivel');

  perform set_config('gemn.test.seller', v_seller::text, false);
  perform set_config('gemn.test.listing', v_target_listing::text, false);
  perform set_config('gemn.test.wallet', v_wallet::text, false);
end;
$$;
commit;

-- Comprador cancela um pedido misto e o retry idempotente não muda o estado.
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), false);
set role authenticated;
select set_config('gemn.test.mixed_order',
  (select order_id::text from public.create_order(
    current_setting('gemn.test.listing')::uuid, 1, 'misto', gen_random_uuid(), 4.00
  )), false);
select order_id, status, gemn_liberado
  from public.cancel_pending_order(
    current_setting('gemn.test.mixed_order')::uuid,
    current_setting('gemn.test.cancel_key')::uuid
  );
select * from public.cancel_pending_order(
  current_setting('gemn.test.mixed_order')::uuid,
  current_setting('gemn.test.cancel_key')::uuid
);

reset role;
do $$
declare v_status text; v_reservation_status text; v_available numeric; v_reserved numeric;
begin
  select status into v_status from public.orders
   where id = current_setting('gemn.test.mixed_order')::uuid;
  if v_status <> 'cancelado' then raise exception 'buyer cancel failed'; end if;
  select r.status into v_reservation_status from public.gemn_reservations r
   where r.order_id = current_setting('gemn.test.mixed_order')::uuid;
  if v_reservation_status <> 'liberada' then raise exception 'reservation was not released'; end if;
  select valor_disponivel, valor_reservado into v_available, v_reserved
    from public.cashback_lots order by criado_em desc limit 1;
  if v_available <> 10.00 or v_reserved <> 0.00 then raise exception 'lot was not restored'; end if;
  if (select count(*) from public.wallet_transactions
      where order_id = current_setting('gemn.test.mixed_order')::uuid
        and tipo = 'liberacao_reserva') <> 1 then raise exception 'release ledger duplicated'; end if;
end;
$$;
set role authenticated;

-- Outra chave não pode reabrir ou repetir o cancelamento.
do $$
begin
  begin
    perform public.cancel_pending_order(
      current_setting('gemn.test.mixed_order')::uuid, gen_random_uuid()
    );
    raise exception 'different cancellation key was accepted';
  exception when others then
    if sqlerrm not like '%outra chave%' then raise; end if;
  end;
end;
$$;

-- Cria pedido real para testar isolamento de comprador e vendedor.
select set_config('gemn.test.own_order',
  (select order_id::text from public.create_order(
    current_setting('gemn.test.listing')::uuid, 1, 'real', gen_random_uuid()
  )), false);
select set_config('request.jwt.claim.sub', current_setting('gemn.test.other_buyer'), false);
do $$
begin
  begin
    perform public.cancel_pending_order(current_setting('gemn.test.own_order')::uuid, gen_random_uuid());
    raise exception 'other buyer was accepted';
  exception when others then
    if sqlerrm not like '%não pode cancelar%' then raise; end if;
  end;
end;
$$;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.seller_user'), false);
do $$
begin
  begin
    perform public.cancel_pending_order(current_setting('gemn.test.own_order')::uuid, gen_random_uuid());
    raise exception 'seller was accepted';
  exception when others then
    if sqlerrm not like '%não pode cancelar%' then raise; end if;
  end;
end;
$$;

-- Administrador pode cancelar pedido pendente de terceiro.
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), false);
select set_config('gemn.test.admin_order',
  (select order_id::text from public.create_order(
    current_setting('gemn.test.listing')::uuid, 1, 'real', gen_random_uuid()
  )), false);
select set_config('request.jwt.claim.sub', current_setting('gemn.test.admin'), false);
select order_id, status from public.cancel_pending_order(
  current_setting('gemn.test.admin_order')::uuid, gen_random_uuid()
);
reset role;

-- Falha parcial na liberação deve reverter também o status do pedido.
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), false);
set role authenticated;
select set_config('gemn.test.rollback_order',
  (select order_id::text from public.create_order(
    current_setting('gemn.test.listing')::uuid, 1, 'misto', gen_random_uuid(), 2.00
  )), false);
reset role;
update public.wallets set saldo_reservado = 0
 where id = current_setting('gemn.test.wallet')::uuid;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), false);
set role authenticated;
do $$
begin
  begin
    perform public.cancel_pending_order(
      current_setting('gemn.test.rollback_order')::uuid, gen_random_uuid()
    );
    raise exception 'inconsistent reservation was accepted';
  exception when others then
    if sqlerrm not like '%saldo reservado%' then raise; end if;
  end;
end;
$$;
reset role;
do $$
begin
  if (select status from public.orders where id = current_setting('gemn.test.rollback_order')::uuid) <> 'pendente'
     or (select status from public.gemn_reservations where order_id = current_setting('gemn.test.rollback_order')::uuid) <> 'ativa' then
    raise exception 'rollback did not preserve pending reservation';
  end if;
end;
$$;
update public.wallets set saldo_reservado = 2.00
 where id = current_setting('gemn.test.wallet')::uuid;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), false);
set role authenticated;
select * from public.cancel_pending_order(
  current_setting('gemn.test.rollback_order')::uuid, gen_random_uuid()
);
reset role;

-- Pedidos reais: 23h59 permanece pendente e 24h expira.
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), false);
set role authenticated;
select set_config('gemn.test.near_order',
  (select order_id::text from public.create_order(
    current_setting('gemn.test.listing')::uuid, 1, 'real', gen_random_uuid()
  )), false);
reset role;
update public.orders set criado_em = clock_timestamp() - interval '23 hours 59 minutes'
 where id = current_setting('gemn.test.near_order')::uuid;

select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), false);
set role authenticated;
select set_config('gemn.test.expired_order',
  (select order_id::text from public.create_order(
    current_setting('gemn.test.listing')::uuid, 1, 'misto', gen_random_uuid(), 3.00
  )), false);
reset role;
update public.orders set criado_em = clock_timestamp() - interval '24 hours'
 where id = current_setting('gemn.test.expired_order')::uuid;

set role service_role;
select public.expire_pending_orders(100);
reset role;

do $$
declare v_status text; v_reservation_status text; v_available numeric; v_reserved numeric;
begin
  select status into v_status from public.orders
   where id = current_setting('gemn.test.near_order')::uuid;
  if v_status <> 'pendente' then raise exception '23h59 order expired early'; end if;
  select status into v_status from public.orders
   where id = current_setting('gemn.test.expired_order')::uuid;
  if v_status <> 'expirado' then raise exception '24h order did not expire'; end if;
  select status into v_reservation_status from public.gemn_reservations
   where order_id = current_setting('gemn.test.expired_order')::uuid;
  if v_reservation_status <> 'expirada' then raise exception 'expired reservation not released'; end if;
  select valor_disponivel, valor_reservado into v_available, v_reserved
    from public.cashback_lots order by criado_em desc limit 1;
  if v_reserved < 0 then raise exception 'negative lot reserve'; end if;
end;
$$;

-- Retry do scheduler não processa novamente os mesmos pedidos.
set role service_role;
select public.expire_pending_orders(100);
reset role;

select has_function_privilege('authenticated', 'public.cancel_pending_order(uuid,uuid)', 'EXECUTE') as buyer_cancel_allowed;
select has_function_privilege('authenticated', 'public.expire_pending_orders(integer)', 'EXECUTE') as buyer_expire_allowed;
select has_function_privilege('service_role', 'public.expire_pending_orders(integer)', 'EXECUTE') as scheduler_allowed;

select 'SPRINT24B_CANCEL_EXPIRATION_OK' as result;
