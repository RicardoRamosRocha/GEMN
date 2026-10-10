\set ON_ERROR_STOP on

select set_config('gemn.test.buyer', :'user_a_id', false);
select set_config('gemn.test.seller_user', :'user_b_id', false);
select set_config('gemn.test.run_id', :'run_id', false);
select set_config('gemn.test.key_mixed', :'key_mixed', false);
select set_config('gemn.test.key_snapshot', :'key_snapshot', false);
select set_config('gemn.test.key_snapshot_after', :'key_snapshot_after', false);

begin;

do $$
declare
  v_buyer uuid := current_setting('gemn.test.buyer')::uuid;
  v_seller_user uuid := current_setting('gemn.test.seller_user')::uuid;
  v_app uuid;
  v_seller uuid;
  v_category uuid;
  v_target_listing uuid;
  v_decimal_listing uuid;
  v_no_gemn_listing uuid;
  v_source_listing_a uuid;
  v_source_listing_b uuid;
  v_source_order_a uuid;
  v_source_order_b uuid;
  v_wallet uuid;
begin
  insert into public.seller_applications (
    user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao, status
  )
  values (
    v_seller_user, 'empreendedor',
    concat('GEMN_3B_SELLER_', current_setting('gemn.test.run_id')),
    'T' || replace(v_seller_user::text, '-', ''), '11999990003',
    'teste', 'fixture', 'aprovada'
  )
  returning id into v_app;

  insert into public.sellers (
    user_id, application_id, tipo_membro, nome_negocio, descricao, telefone, aceita_gemn
  )
  values (
    v_seller_user, v_app,
    'empreendedor',
    concat('GEMN_3B_SELLER_', current_setting('gemn.test.run_id')),
    'fixture', '11999990003', true
  )
  returning id into v_seller;

  insert into public.categories (nome, ativo)
  values (concat('GEMN_3B_CAT_', current_setting('gemn.test.run_id')), true)
  returning id into v_category;

  insert into public.listings (
    seller_id, category_id, tipo, nome, descricao,
    preco_real, aceita_gemn, preco_gemn, status
  )
  values (
    v_seller, v_category, 'produto',
    concat('GEMN_3B_TARGET_', current_setting('gemn.test.run_id')),
    'fixture', 10.00, true, 10.00, 'ativo'
  )
  returning id into v_target_listing;

  insert into public.listings (
    seller_id, category_id, tipo, nome, descricao,
    preco_real, aceita_gemn, preco_gemn, status
  )
  values (
    v_seller, v_category, 'produto',
    concat('GEMN_3B_DECIMAL_', current_setting('gemn.test.run_id')),
    'fixture', 3.33, true, 3.33, 'ativo'
  )
  returning id into v_decimal_listing;

  insert into public.listings (
    seller_id, category_id, tipo, nome, descricao,
    preco_real, aceita_gemn, preco_gemn, status
  )
  values (
    v_seller, v_category, 'produto',
    concat('GEMN_3B_NO_GEMN_', current_setting('gemn.test.run_id')),
    'fixture', 10.00, false, null, 'ativo'
  )
  returning id into v_no_gemn_listing;

  insert into public.listings (
    seller_id, category_id, tipo, nome, descricao,
    preco_real, aceita_gemn, preco_gemn, status
  )
  values
    (v_seller, v_category, 'produto', concat('GEMN_3B_SOURCE_A_', current_setting('gemn.test.run_id')), 'fixture', 10.00, false, null, 'ativo'),
    (v_seller, v_category, 'produto', concat('GEMN_3B_SOURCE_B_', current_setting('gemn.test.run_id')), 'fixture', 10.00, false, null, 'ativo');

  select id into v_source_listing_a
    from public.listings
   where nome = concat('GEMN_3B_SOURCE_A_', current_setting('gemn.test.run_id'));
  select id into v_source_listing_b
    from public.listings
   where nome = concat('GEMN_3B_SOURCE_B_', current_setting('gemn.test.run_id'));

  insert into public.cashback_rules (
    seller_id, percentual, idempotency_key, vigente_desde, criado_por
  )
  values (v_seller, 10.00, gen_random_uuid(), now(), v_seller_user);

  insert into public.wallets (user_id, saldo_disponivel)
  values (v_buyer, 20.00)
  returning id into v_wallet;

  insert into public.orders (
    buyer_id, idempotency_key, status, forma_pagamento,
    total_real, total_gemn, gemn_utilizado, valor_devido_real
  )
  values (v_seller_user, gen_random_uuid(), 'pendente', 'real', 10.00, null, 0.00, 10.00)
  returning id into v_source_order_a;

  insert into public.order_items (
    order_id, listing_id, seller_id, nome_item, tipo, quantidade,
    preco_real_unitario, subtotal_real, cashback_percentual, cashback_previsto
  )
  values (
    v_source_order_a, v_source_listing_a, v_seller,
    concat('GEMN_3B_SOURCE_A_', current_setting('gemn.test.run_id')),
    'produto', 1, 10.00, 10.00, 0.00, 0.00
  );
  update public.orders set status = 'concluido' where id = v_source_order_a;

  insert into public.orders (
    buyer_id, idempotency_key, status, forma_pagamento,
    total_real, total_gemn, gemn_utilizado, valor_devido_real
  )
  values (v_seller_user, gen_random_uuid(), 'pendente', 'real', 10.00, null, 0.00, 10.00)
  returning id into v_source_order_b;

  insert into public.order_items (
    order_id, listing_id, seller_id, nome_item, tipo, quantidade,
    preco_real_unitario, subtotal_real, cashback_percentual, cashback_previsto
  )
  values (
    v_source_order_b, v_source_listing_b, v_seller,
    concat('GEMN_3B_SOURCE_B_', current_setting('gemn.test.run_id')),
    'produto', 1, 10.00, 10.00, 0.00, 0.00
  );
  update public.orders set status = 'concluido' where id = v_source_order_b;

  insert into public.cashback_lots (
    wallet_id, order_id, order_item_id, seller_origem_id,
    valor_original, valor_disponivel, status
  )
  select v_wallet, oi.order_id, oi.id, oi.seller_id,
         10.00, 10.00, 'disponivel'
    from public.order_items oi
   where oi.order_id = v_source_order_a;

  insert into public.cashback_lots (
    wallet_id, order_id, order_item_id, seller_origem_id,
    valor_original, valor_disponivel, status
  )
  select v_wallet, oi.order_id, oi.id, oi.seller_id,
         10.00, 10.00, 'disponivel'
    from public.order_items oi
   where oi.order_id = v_source_order_b;

  perform set_config('gemn.test.target_listing', v_target_listing::text, false);
  perform set_config('gemn.test.decimal_listing', v_decimal_listing::text, false);
  perform set_config('gemn.test.no_gemn_listing', v_no_gemn_listing::text, false);
  perform set_config('gemn.test.wallet', v_wallet::text, false);
end;
$$;

commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), true);

select * from public.create_order(
  current_setting('gemn.test.target_listing')::uuid, 1, 'gemn',
  :'key_gemn'::uuid, 10.00
);
reset role;

do $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
begin
  select o.* into v_order
    from public.orders o
   where o.buyer_id = current_setting('gemn.test.buyer')::uuid
   order by o.criado_em desc limit 1;
  select oi.* into v_item from public.order_items oi where oi.order_id = v_order.id;
  if v_order.gemn_utilizado <> 10.00
     or v_order.valor_devido_real <> 0.00
     or v_item.cashback_percentual <> 10.00
     or v_item.cashback_previsto <> 0.00 then
    raise exception '100%% GEMN financial snapshot mismatch';
  end if;
end;
$$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), true);

select * from public.create_order(
  current_setting('gemn.test.decimal_listing')::uuid, 3, 'misto',
  gen_random_uuid(), 1.11
);
reset role;

do $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
begin
  select o.* into v_order from public.orders o
   where o.buyer_id = current_setting('gemn.test.buyer')::uuid
   order by o.criado_em desc limit 1;
  select oi.* into v_item from public.order_items oi where oi.order_id = v_order.id;
  if v_order.total_real <> 9.99
     or v_order.gemn_utilizado <> 1.11
     or v_order.valor_devido_real <> 8.88
     or v_item.subtotal_real <> 9.99
     or v_item.cashback_percentual <> 10.00
     or v_item.cashback_previsto <> 0.89 then
    raise exception 'quantity/decimal rounding mismatch: total=%, gemn=%, due=%, subtotal=%, cashback=%',
      v_order.total_real, v_order.gemn_utilizado, v_order.valor_devido_real,
      v_item.subtotal_real, v_item.cashback_previsto;
  end if;
end;
$$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), true);
select * from public.create_order(
  current_setting('gemn.test.target_listing')::uuid, 1, 'real',
  current_setting('gemn.test.key_snapshot')::uuid, 0.00
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.seller_user'), true);
select * from public.set_seller_cashback(20.00, current_setting('gemn.test.key_snapshot_after')::uuid);
reset role;

do $$
declare
  v_percent numeric;
  v_cashback numeric;
begin
  select oi.cashback_percentual, oi.cashback_previsto
    into v_percent, v_cashback
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where o.idempotency_key = current_setting('gemn.test.key_snapshot')::uuid;
  if v_percent <> 10.00 or v_cashback <> 1.00 then
    raise exception 'cashback snapshot was changed retroactively: %, %', v_percent, v_cashback;
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), true);
select * from public.create_order(
  current_setting('gemn.test.target_listing')::uuid, 1, 'real',
  current_setting('gemn.test.key_snapshot_after')::uuid, 0.00
);
reset role;

do $$
declare
  v_percent numeric;
  v_cashback numeric;
begin
  select oi.cashback_percentual, oi.cashback_previsto
    into v_percent, v_cashback
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where o.idempotency_key = current_setting('gemn.test.key_snapshot_after')::uuid;
  if v_percent <> 20.00 or v_cashback <> 2.00 then
    raise exception 'new cashback rule was not applied: %, %', v_percent, v_cashback;
  end if;
end;
$$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), true);

select * from public.create_order(
  current_setting('gemn.test.target_listing')::uuid, 1, 'real',
  :'key_real'::uuid, 0.00
);
reset role;

do $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
begin
  select o.* into v_order from public.orders o
   where o.buyer_id = current_setting('gemn.test.buyer')::uuid
   order by o.criado_em desc limit 1;
  select oi.* into v_item from public.order_items oi where oi.order_id = v_order.id;
  if v_order.gemn_utilizado <> 0.00
     or v_order.valor_devido_real <> 10.00
     or v_item.cashback_percentual <> 10.00
     or v_item.cashback_previsto <> 1.00 then
    raise exception '100%% real snapshot mismatch: gemn=%, devido=%, percentual=%, cashback=%', v_order.gemn_utilizado, v_order.valor_devido_real, v_item.cashback_percentual, v_item.cashback_previsto;
  end if;
end;
$$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), true);

select * from public.create_order(
  current_setting('gemn.test.target_listing')::uuid, 1, 'misto',
  :'key_mixed'::uuid, 4.00
);
reset role;

do $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_reservations integer;
  v_available numeric;
  v_reserved numeric;
begin
  select o.* into v_order from public.orders o
   where o.buyer_id = current_setting('gemn.test.buyer')::uuid
   order by o.criado_em desc limit 1;
  select oi.* into v_item from public.order_items oi where oi.order_id = v_order.id;
  select count(*) into v_reservations from public.gemn_reservations where order_id = v_order.id;
  select saldo_disponivel, saldo_reservado into v_available, v_reserved
    from public.wallets where user_id = current_setting('gemn.test.buyer')::uuid;
  if v_order.gemn_utilizado <> 4.00
     or v_order.valor_devido_real <> 6.00
     or v_item.cashback_percentual <> 10.00
     or v_item.cashback_previsto <> 0.60
     or v_reservations <> 1
     or v_available <> 16.00
     or v_reserved <> 4.00 then
    raise exception 'mixed order or reservation mismatch';
  end if;
end;
$$;

select public.create_order(
  current_setting('gemn.test.target_listing')::uuid, 1, 'misto',
  :'key_mixed'::uuid, 4.00
);

do $$
begin
  begin
    perform public.create_order(
      current_setting('gemn.test.target_listing')::uuid, 1, 'misto',
      current_setting('gemn.test.key_mixed')::uuid, 5.00
    );
    raise exception 'changed idempotency intent unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'changed idempotency intent unexpectedly succeeded' then raise; end if;
  end;
end;
$$;

do $$
begin
  begin
    perform public.create_order(
      current_setting('gemn.test.target_listing')::uuid, 1, 'misto',
      gen_random_uuid(), 12.00
    );
    perform public.create_order(
      current_setting('gemn.test.target_listing')::uuid, 1, 'misto',
      gen_random_uuid(), 5.00
    );
    raise exception 'insufficient reservation unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'insufficient reservation unexpectedly succeeded' then raise; end if;
  end;

  begin
    perform public.create_order(
      current_setting('gemn.test.target_listing')::uuid, 1, 'misto',
      gen_random_uuid(), 13.00
    );
    raise exception 'over-total GEMN unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'over-total GEMN unexpectedly succeeded' then raise; end if;
  end;

  begin
    perform public.create_order(
      current_setting('gemn.test.no_gemn_listing')::uuid, 1, 'misto',
      gen_random_uuid(), 1.00
    );
    raise exception 'non-GEMN listing unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'non-GEMN listing unexpectedly succeeded' then raise; end if;
  end;
end;
$$;
rollback;

begin;
update public.sellers
   set aceita_gemn = false
 where user_id = current_setting('gemn.test.seller_user')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), true);
do $$
begin
  begin
    perform public.create_order(
      current_setting('gemn.test.target_listing')::uuid, 1, 'misto',
      gen_random_uuid(), 1.00
    );
    raise exception 'seller without GEMN acceptance unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'seller without GEMN acceptance unexpectedly succeeded' then raise; end if;
  end;
end;
$$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.seller_user'), true);
select * from public.create_order(
  current_setting('gemn.test.target_listing')::uuid, 1, 'real',
  :'key_other_user'::uuid, 0.00
);
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.seller_user'), true);
do $$
begin
  begin
    perform public.create_order(
      current_setting('gemn.test.target_listing')::uuid, 1, 'misto',
      gen_random_uuid(), 1.00
    );
    raise exception 'other user used buyer wallet unexpectedly';
  exception when others then
    if sqlerrm = 'other user used buyer wallet unexpectedly' then raise; end if;
  end;
end;
$$;
rollback;

select 'PASS create_order GEMN/mixed snapshots, reservation rollback and isolation' as result;

