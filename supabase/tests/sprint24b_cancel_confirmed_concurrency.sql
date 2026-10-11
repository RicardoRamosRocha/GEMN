\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin;

insert into public.profiles (id, is_admin)
values (:'user_a_id'::uuid, true)
on conflict (id) do update set is_admin = true;

insert into public.seller_applications (user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao)
values (:'user_a_id'::uuid, 'empreendedor', concat('S24B2CONC_', :'run_id'), concat('S24B2CONC', :'run_id'), '11999990001', 'teste', 'fixture')
returning id \gset application_

insert into public.sellers (user_id, application_id, tipo_membro, nome_negocio, descricao, telefone)
values (:'user_a_id'::uuid, :'application_id'::uuid, 'empreendedor', concat('S24B2CONC_', :'run_id'), 'fixture', '11999990001')
returning id \gset seller_
update public.sellers set status = 'ativo', aceita_gemn = true where id = :'seller_id'::uuid;

insert into public.categories (nome, ativo)
values (concat('S24B2CONC_', :'run_id'), true)
returning id \gset category_

insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
values (:'seller_id'::uuid, :'category_id'::uuid, 'produto', concat('S24B2CONC_', :'run_id'), 'fixture', 10.00, true, 10.00, 'ativo')
returning id \gset listing_

insert into public.wallets (user_id, saldo_disponivel, saldo_a_recuperar)
values (:'user_b_id'::uuid, 30.00, 0.00)
returning id \gset wallet_

-- Pedidos reais usados para as corridas de idempotencia.
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset same_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'same_order_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24B2CONC_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00)
returning id \gset same_item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, status)
values (:'wallet_id'::uuid, :'same_order_id'::uuid, :'same_item_id'::uuid, :'seller_id'::uuid, 0.00, 0.00, 'esgotado');
update public.orders set status = 'confirmado' where id = :'same_order_id'::uuid;

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset different_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'different_order_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24B2CONC_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00)
returning id \gset different_item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, status)
values (:'wallet_id'::uuid, :'different_order_id'::uuid, :'different_item_id'::uuid, :'seller_id'::uuid, 0.00, 0.00, 'esgotado');
update public.orders set status = 'confirmado' where id = :'different_order_id'::uuid;

-- Cashback de origem para a corrida cancelamento x reserva.
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset reserve_source_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'reserve_source_order_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24B2CONC_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00)
returning id \gset reserve_source_item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, status)
values (:'wallet_id'::uuid, :'reserve_source_order_id'::uuid, :'reserve_source_item_id'::uuid, :'seller_id'::uuid, 5.00, 5.00, 'disponivel');
update public.orders set status = 'confirmado' where id = :'reserve_source_order_id'::uuid;

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'misto', 10.00, 10.00, 2.00, 8.00)
returning id \gset reserve_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'reserve_order_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24B2CONC_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00);

-- Dois pedidos confirmados compartilham o mesmo lote de origem.
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset shared_source_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'shared_source_order_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24B2CONC_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00)
returning id \gset shared_source_item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_consumido, status)
values (:'wallet_id'::uuid, :'shared_source_order_id'::uuid, :'shared_source_item_id'::uuid, :'seller_id'::uuid, 4.00, 4.00, 'esgotado')
returning id \gset shared_source_lot_
update public.orders set status = 'confirmado' where id = :'shared_source_order_id'::uuid;

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'gemn', 10.00, 10.00, 2.00, 8.00)
returning id \gset shared_order_a_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'shared_order_a_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24B2CONC_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00)
returning id \gset shared_item_a_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, status)
values (:'wallet_id'::uuid, :'shared_order_a_id'::uuid, :'shared_item_a_id'::uuid, :'seller_id'::uuid, 0.00, 'esgotado');
insert into public.gemn_reservations (wallet_id, order_id, buyer_id, seller_recebedor_id, valor_gemn, status, idempotency_key)
values (:'wallet_id'::uuid, :'shared_order_a_id'::uuid, :'user_b_id'::uuid, :'seller_id'::uuid, 2.00, 'efetivada', gen_random_uuid())
returning id \gset shared_reservation_a_
insert into public.gemn_reservation_allocations (reservation_id, cashback_lot_id, seller_origem_id, seller_recebedor_id, valor_gemn, ordem_fifo, status)
values (:'shared_reservation_a_id'::uuid, :'shared_source_lot_id'::uuid, :'seller_id'::uuid, :'seller_id'::uuid, 2.00, 1, 'consumida');
update public.orders set status = 'confirmado' where id = :'shared_order_a_id'::uuid;

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'gemn', 10.00, 10.00, 2.00, 8.00)
returning id \gset shared_order_b_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'shared_order_b_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24B2CONC_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00)
returning id \gset shared_item_b_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, status)
values (:'wallet_id'::uuid, :'shared_order_b_id'::uuid, :'shared_item_b_id'::uuid, :'seller_id'::uuid, 0.00, 'esgotado');
insert into public.gemn_reservations (wallet_id, order_id, buyer_id, seller_recebedor_id, valor_gemn, status, idempotency_key)
values (:'wallet_id'::uuid, :'shared_order_b_id'::uuid, :'user_b_id'::uuid, :'seller_id'::uuid, 2.00, 'efetivada', gen_random_uuid())
returning id \gset shared_reservation_b_
insert into public.gemn_reservation_allocations (reservation_id, cashback_lot_id, seller_origem_id, seller_recebedor_id, valor_gemn, ordem_fifo, status)
values (:'shared_reservation_b_id'::uuid, :'shared_source_lot_id'::uuid, :'seller_id'::uuid, :'seller_id'::uuid, 2.00, 1, 'consumida');
update public.orders set status = 'confirmado' where id = :'shared_order_b_id'::uuid;

-- Sequencia inversa: o produtor nao pode ser cancelado enquanto o cashback
-- continuar consumido por um pedido confirmado.
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset inverse_source_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'inverse_source_order_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24B2CONC_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00)
returning id \gset inverse_source_item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_consumido, status)
values (:'wallet_id'::uuid, :'inverse_source_order_id'::uuid, :'inverse_source_item_id'::uuid, :'seller_id'::uuid, 3.00, 3.00, 'esgotado')
returning id \gset inverse_source_lot_
update public.orders set status = 'confirmado' where id = :'inverse_source_order_id'::uuid;

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'gemn', 10.00, 10.00, 3.00, 7.00)
returning id \gset inverse_consumer_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'inverse_consumer_order_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24B2CONC_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00)
returning id \gset inverse_consumer_item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, status)
values (:'wallet_id'::uuid, :'inverse_consumer_order_id'::uuid, :'inverse_consumer_item_id'::uuid, :'seller_id'::uuid, 0.00, 'esgotado');
insert into public.gemn_reservations (wallet_id, order_id, buyer_id, seller_recebedor_id, valor_gemn, status, idempotency_key)
values (:'wallet_id'::uuid, :'inverse_consumer_order_id'::uuid, :'user_b_id'::uuid, :'seller_id'::uuid, 3.00, 'efetivada', gen_random_uuid())
returning id \gset inverse_reservation_
insert into public.gemn_reservation_allocations (reservation_id, cashback_lot_id, seller_origem_id, seller_recebedor_id, valor_gemn, ordem_fifo, status)
values (:'inverse_reservation_id'::uuid, :'inverse_source_lot_id'::uuid, :'seller_id'::uuid, :'seller_id'::uuid, 3.00, 1, 'consumida');
update public.orders set status = 'confirmado' where id = :'inverse_consumer_order_id'::uuid;

commit;

select 'SAME_ORDER=' || :'same_order_id';
select 'DIFFERENT_ORDER=' || :'different_order_id';
select 'RESERVE_SOURCE_ORDER=' || :'reserve_source_order_id';
select 'RESERVE_ORDER=' || :'reserve_order_id';
select 'SHARED_ORDER_A=' || :'shared_order_a_id';
select 'SHARED_ORDER_B=' || :'shared_order_b_id';
select 'INVERSE_SOURCE_ORDER=' || :'inverse_source_order_id';
select 'INVERSE_CONSUMER_ORDER=' || :'inverse_consumer_order_id';
select 'SAME_KEY=' || gen_random_uuid();
select 'DIFF_KEY_A=' || gen_random_uuid();
select 'DIFF_KEY_B=' || gen_random_uuid();
select 'RESERVE_KEY=' || gen_random_uuid();
select 'CANCEL_RESERVE_KEY=' || gen_random_uuid();
