\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin;

insert into public.profiles (id, is_admin)
values (:'admin_id'::uuid, true)
on conflict (id) do update set is_admin = true;

insert into public.seller_applications (user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao)
values (:'seller_id'::uuid, 'empreendedor', concat('S24C_CONC_', :'run_id'), concat('S24CC', :'run_id'), '11999990001', 'teste', 'fixture')
returning id \gset application_
insert into public.sellers (user_id, application_id, tipo_membro, nome_negocio, descricao, telefone, status)
values (:'seller_id'::uuid, :'application_id'::uuid, 'empreendedor', concat('S24C_CONC_', :'run_id'), 'fixture', '11999990001', 'ativo')
returning id \gset seller_
insert into public.categories (nome, ativo)
values (concat('S24C_CONC_', :'run_id'), true)
returning id \gset category_
insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
values (:'seller_id'::uuid, :'category_id'::uuid, 'produto', concat('S24C_CONC_', :'run_id'), 'fixture', 10.00, true, 10.00, 'ativo')
returning id \gset listing_
insert into public.wallets (user_id, saldo_disponivel, saldo_reservado, saldo_a_recuperar)
values (:'buyer_id'::uuid, 0.00, 0.00, 0.00)
returning id \gset wallet_
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'buyer_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'order_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24C_CONC_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00)
returning id \gset item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, status)
values (:'wallet_id'::uuid, :'order_id'::uuid, :'item_id'::uuid, :'seller_id'::uuid, 0.00, 0.00, 'esgotado');
update public.orders set status = 'confirmado' where id = :'order_id'::uuid;

commit;
select 'ORDER_ID=' || :'order_id';
select 'REQUEST_KEY=' || gen_random_uuid();
select 'APPROVAL_KEY=' || gen_random_uuid();
