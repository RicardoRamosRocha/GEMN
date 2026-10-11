\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin;

insert into public.profiles (id, is_admin)
values (:'admin_id'::uuid, true)
on conflict (id) do update set is_admin = true;

insert into public.seller_applications (user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao)
values (:'seller_id'::uuid, 'empreendedor', concat('S24C_RPC_', :'run_id'), concat('S24CR', :'run_id'), '11999990001', 'teste', 'fixture')
returning id \gset seller_application_
insert into public.sellers (user_id, application_id, tipo_membro, nome_negocio, descricao, telefone, status)
values (:'seller_id'::uuid, :'seller_application_id'::uuid, 'empreendedor', concat('S24C_RPC_', :'run_id'), 'fixture', '11999990001', 'ativo')
returning id \gset seller_row_

insert into public.seller_applications (user_id, tipo_membro, nome_negocio, cnpj, telefone, categoria, descricao)
values (:'other_seller_id'::uuid, 'empresa', concat('S24C_RPC_OTHER_', :'run_id'), concat('S24CRCO', :'run_id'), '11999990002', 'teste', 'fixture')
returning id \gset other_application_
insert into public.sellers (user_id, application_id, tipo_membro, nome_negocio, descricao, telefone, status)
values (:'other_seller_id'::uuid, :'other_application_id'::uuid, 'empresa', concat('S24C_RPC_OTHER_', :'run_id'), 'fixture', '11999990002', 'ativo')
returning id \gset other_seller_row_

insert into public.categories (nome, ativo)
values (concat('S24C_RPC_', :'run_id'), true)
returning id \gset category_
insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
values (:'seller_row_id'::uuid, :'category_id'::uuid, 'produto', concat('S24C_RPC_', :'run_id'), 'fixture', 10.00, true, 10.00, 'ativo')
returning id \gset listing_
insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
values (:'other_seller_row_id'::uuid, :'category_id'::uuid, 'produto', concat('S24C_RPC_OTHER_', :'run_id'), 'fixture', 10.00, true, 10.00, 'ativo')
returning id \gset other_listing_

insert into public.wallets (user_id, saldo_disponivel, saldo_reservado, saldo_a_recuperar)
values (:'buyer_id'::uuid, 1.00, 1.00, 0.00)
returning id \gset wallet_

-- Pedido do comprador que sera aprovado.
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'buyer_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset buyer_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'buyer_order_id'::uuid, :'listing_id'::uuid, :'seller_row_id'::uuid, concat('S24C_RPC_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00)
returning id \gset buyer_item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, status)
values (:'wallet_id'::uuid, :'buyer_order_id'::uuid, :'buyer_item_id'::uuid, :'seller_row_id'::uuid, 0.00, 0.00, 'esgotado');
update public.orders set status = 'confirmado' where id = :'buyer_order_id'::uuid;

-- Pedido do vendedor suspenso: sera rejeitado e solicitado novamente.
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'buyer_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset seller_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'seller_order_id'::uuid, :'listing_id'::uuid, :'seller_row_id'::uuid, concat('S24C_RPC_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00)
returning id \gset seller_item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, status)
values (:'wallet_id'::uuid, :'seller_order_id'::uuid, :'seller_item_id'::uuid, :'seller_row_id'::uuid, 0.00, 0.00, 'esgotado');
update public.orders set status = 'confirmado' where id = :'seller_order_id'::uuid;

-- Pedido cujo cashback reservado provocara falha recuperavel.
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'buyer_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset failure_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'failure_order_id'::uuid, :'listing_id'::uuid, :'seller_row_id'::uuid, concat('S24C_RPC_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00)
returning id \gset failure_item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, valor_reservado, status)
values (:'wallet_id'::uuid, :'failure_order_id'::uuid, :'failure_item_id'::uuid, :'seller_row_id'::uuid, 1.00, 0.00, 1.00, 'disponivel');
update public.orders set status = 'confirmado' where id = :'failure_order_id'::uuid;

-- Pedido de outro seller para testar autorizacao por vinculo de item.
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'buyer_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset other_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'other_order_id'::uuid, :'other_listing_id'::uuid, :'other_seller_row_id'::uuid, concat('S24C_RPC_OTHER_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00);
update public.orders set status = 'confirmado' where id = :'other_order_id'::uuid;

-- Os pedidos sao historicos; o seller pode solicitar mesmo suspenso.
update public.listings set status = 'inativo' where id = :'listing_id'::uuid;
update public.sellers set status = 'suspenso' where id = :'seller_row_id'::uuid;

select set_config('gemn.test.buyer_order', :'buyer_order_id', false);
select set_config('gemn.test.seller_order', :'seller_order_id', false);
select set_config('gemn.test.failure_order', :'failure_order_id', false);
select set_config('gemn.test.other_order', :'other_order_id', false);
select set_config('gemn.test.wallet', :'wallet_id', false);

-- Comprador solicita e repete com a mesma chave.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'buyer_id', true);
select gen_random_uuid() as buyer_key \gset
select set_config('gemn.test.buyer_key', :'buyer_key', false);
select * from public.request_order_cancellation(:'buyer_order_id'::uuid, :'buyer_key'::uuid, 'comprador solicita cancelamento') \gset buyer_
select * from public.request_order_cancellation(:'buyer_order_id'::uuid, :'buyer_key'::uuid, 'comprador solicita cancelamento');

do $$
declare v_failed boolean := false;
begin
  begin
    perform * from public.request_order_cancellation(current_setting('gemn.test.buyer_order')::uuid, current_setting('gemn.test.buyer_key')::uuid, 'motivo diferente');
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'request idempotency mismatch accepted'; end if;
end $$;

-- Vendedor suspenso solicita seu pedido; vendedor de outro item e rejeitado.
select set_config('request.jwt.claim.sub', :'seller_id', true);
select gen_random_uuid() as seller_key \gset
select * from public.request_order_cancellation(:'seller_order_id'::uuid, :'seller_key'::uuid, 'vendedor solicita') \gset seller_

do $$
declare v_failed boolean := false;
begin
  begin
    perform * from public.request_order_cancellation(current_setting('gemn.test.other_order')::uuid, gen_random_uuid(), 'pedido de terceiro');
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'unrelated seller request accepted'; end if;
end $$;

-- Comprador solicita o pedido que tera falha financeira.
select set_config('request.jwt.claim.sub', :'buyer_id', true);
select gen_random_uuid() as failure_request_key \gset
select * from public.request_order_cancellation(:'failure_order_id'::uuid, :'failure_request_key'::uuid, 'falha recuperavel') \gset failure_

-- Usuario comum nao aprova nem rejeita.
select set_config('request.jwt.claim.sub', :'buyer_id', true);
do $$
declare v_failed boolean := false;
begin
  begin
    perform * from public.approve_order_cancellation_request(current_setting('gemn.test.failure_request')::uuid, gen_random_uuid());
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'non-admin approval accepted'; end if;
end $$;

select set_config('request.jwt.claim.sub', :'admin_id', true);
select gen_random_uuid() as reject_key \gset
select * from public.reject_order_cancellation_request(:'seller_request_id'::uuid, :'reject_key'::uuid, 'motivo administrativo') \gset rejected_
select * from public.reject_order_cancellation_request(:'seller_request_id'::uuid, :'reject_key'::uuid, 'motivo administrativo');

-- Rejeicao libera nova solicitacao do mesmo pedido.
select set_config('request.jwt.claim.sub', :'seller_id', true);
select gen_random_uuid() as seller_retry_key \gset
select * from public.request_order_cancellation(:'seller_order_id'::uuid, :'seller_retry_key'::uuid, 'novo pedido do vendedor') \gset seller_retry_

-- Aprovacao do comprador executa o estorno existente e e idempotente.
select set_config('request.jwt.claim.sub', :'admin_id', true);
select gen_random_uuid() as buyer_approval_key \gset
select * from public.approve_order_cancellation_request(:'buyer_request_id'::uuid, :'buyer_approval_key'::uuid) \gset buyer_approved_
select * from public.approve_order_cancellation_request(:'buyer_request_id'::uuid, :'buyer_approval_key'::uuid);

reset role;
do $$
begin
  if (select status from public.orders where id = current_setting('gemn.test.buyer_order')::uuid) <> 'cancelado' then raise exception 'buyer order not cancelled'; end if;
  if (select count(*) from public.order_cancellations where order_id = current_setting('gemn.test.buyer_order')::uuid) <> 1 then
    raise exception 'buyer cancellation count mismatch order=% count=%', current_setting('gemn.test.buyer_order'), (select count(*) from public.order_cancellations where order_id = current_setting('gemn.test.buyer_order')::uuid);
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', true);

-- Falha recuperavel: o primeiro approval nao cria estorno nem muda pedido.
select gen_random_uuid() as failure_approval_key \gset
select * from public.approve_order_cancellation_request(:'failure_request_id'::uuid, :'failure_approval_key'::uuid) \gset failure_failed_
select * from public.approve_order_cancellation_request(:'failure_request_id'::uuid, :'failure_approval_key'::uuid);

do $$
begin
  if (select status from public.orders where id = current_setting('gemn.test.failure_order')::uuid) <> 'confirmado' then raise exception 'failed approval changed order'; end if;
  if (select count(*) from public.order_cancellations where order_id = current_setting('gemn.test.failure_order')::uuid) <> 0 then raise exception 'failed approval created cancellation'; end if;
end $$;

-- Resolve a dependencia local e tenta novamente com nova chave.
reset role;
update public.cashback_lots set valor_reservado = 0.00, valor_disponivel = 1.00
 where order_id = current_setting('gemn.test.failure_order')::uuid;
update public.wallets set saldo_reservado = 0.00, saldo_disponivel = 1.00
 where id = current_setting('gemn.test.wallet')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', true);
select gen_random_uuid() as failure_retry_approval_key \gset
select * from public.approve_order_cancellation_request(:'failure_request_id'::uuid, :'failure_retry_approval_key'::uuid) \gset failure_approved_

-- Aprova a nova solicitacao do seller suspenso.
select gen_random_uuid() as seller_approval_key \gset
select * from public.approve_order_cancellation_request(:'seller_retry_request_id'::uuid, :'seller_approval_key'::uuid) \gset seller_approved_

reset role;
do $$
begin
  if (select count(*) from public.order_cancellations where order_id in (current_setting('gemn.test.failure_order')::uuid, current_setting('gemn.test.seller_order')::uuid)) <> 2 then raise exception 'approval cancellation count mismatch'; end if;
  if (select count(*) from public.order_cancellation_request_attempts where resultado = 'falha') <> 1 then raise exception 'failure attempt missing'; end if;
end $$;

rollback;
select 'SPRINT24C_CANCELLATION_REQUESTS_RPC_OK' as result;
