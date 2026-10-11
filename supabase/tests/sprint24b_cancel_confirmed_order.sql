\set ON_ERROR_STOP on

begin;

insert into public.profiles (id, is_admin)
values (:'user_a_id'::uuid, true)
on conflict (id) do update set is_admin = true;

insert into public.seller_applications (user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao)
values (:'user_a_id'::uuid, 'empreendedor', concat('S24B2C_', :'run_id'), concat('S24B2C', :'run_id'), '11999990001', 'teste', 'fixture')
returning id \gset application_

insert into public.sellers (user_id, application_id, tipo_membro, nome_negocio, descricao, telefone)
values (:'user_a_id'::uuid, :'application_id'::uuid, 'empreendedor', concat('S24B2C_', :'run_id'), 'fixture', '11999990001')
returning id \gset seller_
update public.sellers set status = 'ativo', aceita_gemn = true where id = :'seller_id'::uuid;

insert into public.categories (nome, ativo)
values (concat('S24B2C_', :'run_id'), true)
returning id \gset category_

insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
values (:'seller_id'::uuid, :'category_id'::uuid, 'produto', concat('S24B2C_', :'run_id'), 'fixture', 10.00, true, 10.00, 'ativo')
returning id \gset listing_

insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
values (:'seller_id'::uuid, :'category_id'::uuid, 'produto', concat('S24B2C_1_', :'run_id'), 'fixture', 1.00, true, 1.00, 'ativo')
returning id \gset listing_1_
insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
values (:'seller_id'::uuid, :'category_id'::uuid, 'produto', concat('S24B2C_2_', :'run_id'), 'fixture', 2.00, true, 2.00, 'ativo')
returning id \gset listing_2_
insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
values (:'seller_id'::uuid, :'category_id'::uuid, 'produto', concat('S24B2C_4_', :'run_id'), 'fixture', 4.00, true, 4.00, 'ativo')
returning id \gset listing_4_
insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
values (:'seller_id'::uuid, :'category_id'::uuid, 'produto', concat('S24B2C_5_', :'run_id'), 'fixture', 5.00, true, 5.00, 'ativo')
returning id \gset listing_5_

insert into public.wallets (user_id, saldo_disponivel, saldo_a_recuperar)
values (:'user_b_id'::uuid, 20.00, 1.00)
on conflict (user_id) do update set saldo_disponivel = 20.00, saldo_reservado = 0.00, saldo_a_recuperar = 1.00
returning id \gset wallet_

-- Pedido 100% real: cashback totalmente disponivel.
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset real_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'real_order_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24B2C_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 10.00, 10.00)
returning id \gset real_item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, status)
values (:'wallet_id'::uuid, :'real_order_id'::uuid, :'real_item_id'::uuid, :'seller_id'::uuid, 10.00, 10.00, 'disponivel');

-- Pedido misto: duas alocacoes FIFO e cashback parcialmente consumido.
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'misto', 10.00, 10.00, 5.00, 5.00)
returning id \gset mixed_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'mixed_order_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24B2C_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 10.00, 2.00)
returning id \gset mixed_item_

insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, valor_consumido, status)
values (:'wallet_id'::uuid, :'mixed_order_id'::uuid, :'mixed_item_id'::uuid, :'seller_id'::uuid, 2.00, 1.00, 1.00, 'disponivel')
returning id \gset mixed_cashback_lot_

insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, status)
values (:'wallet_id'::uuid, :'real_order_id'::uuid, :'real_item_id'::uuid, :'seller_id'::uuid, 0.00, 0.00, 'esgotado')
on conflict (order_item_id) do nothing;

insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, status)
select :'wallet_id'::uuid, :'mixed_order_id'::uuid, :'mixed_item_id'::uuid, :'seller_id'::uuid, 0.00, 0.00, 'esgotado'
where false;

insert into public.gemn_reservations (wallet_id, order_id, buyer_id, seller_recebedor_id, valor_gemn, status, idempotency_key)
values (:'wallet_id'::uuid, :'mixed_order_id'::uuid, :'user_b_id'::uuid, :'seller_id'::uuid, 5.00, 'efetivada', gen_random_uuid())
returning id \gset mixed_reservation_

insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, status)
select :'wallet_id'::uuid, :'real_order_id'::uuid, :'real_item_id'::uuid, :'seller_id'::uuid, 0.00, 0.00, 'esgotado'
where false;

insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, status)
values (:'wallet_id'::uuid, :'mixed_order_id'::uuid, :'mixed_item_id'::uuid, :'seller_id'::uuid, 0.00, 0.00, 'esgotado')
on conflict (order_item_id) do nothing;

-- Lotes de origem mais antigos, consumidos pela reserva mista.
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'real', 1.00, 1.00, 0.00, 1.00)
returning id \gset source_order_a_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'source_order_a_id'::uuid, :'listing_1_id'::uuid, :'seller_id'::uuid, concat('S24B2C_1_', :'run_id'), 'produto', 1, 1.00, 1.00, 1.00, 1.00, 0.00, 0.00)
returning id \gset source_item_a_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_consumido, status)
values (:'wallet_id'::uuid, :'source_order_a_id'::uuid, :'source_item_a_id'::uuid, :'seller_id'::uuid, 4.00, 4.00, 'esgotado')
returning id \gset source_lot_a_

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'real', 1.00, 1.00, 0.00, 1.00)
returning id \gset source_order_b_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'source_order_b_id'::uuid, :'listing_1_id'::uuid, :'seller_id'::uuid, concat('S24B2C_1_', :'run_id'), 'produto', 1, 1.00, 1.00, 1.00, 1.00, 0.00, 0.00)
returning id \gset source_item_b_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_consumido, status)
values (:'wallet_id'::uuid, :'source_order_b_id'::uuid, :'source_item_b_id'::uuid, :'seller_id'::uuid, 2.00, 2.00, 'esgotado')
returning id \gset source_lot_b_

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'real', 1.00, 1.00, 0.00, 1.00)
returning id \gset source_order_c_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'source_order_c_id'::uuid, :'listing_1_id'::uuid, :'seller_id'::uuid, concat('S24B2C_1_', :'run_id'), 'produto', 1, 1.00, 1.00, 1.00, 1.00, 0.00, 0.00)
returning id \gset source_item_c_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_consumido, status)
values (:'wallet_id'::uuid, :'source_order_c_id'::uuid, :'source_item_c_id'::uuid, :'seller_id'::uuid, 4.00, 4.00, 'esgotado')
returning id \gset source_lot_c_

insert into public.gemn_reservation_allocations (reservation_id, cashback_lot_id, seller_origem_id, seller_recebedor_id, valor_gemn, ordem_fifo, status)
values
  (:'mixed_reservation_id'::uuid, :'source_lot_a_id'::uuid, :'seller_id'::uuid, :'seller_id'::uuid, 3.00, 1, 'consumida'),
  (:'mixed_reservation_id'::uuid, :'source_lot_b_id'::uuid, :'seller_id'::uuid, :'seller_id'::uuid, 2.00, 2, 'consumida');

-- Pedido 100% GEMN, sem cashback.
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'gemn', 4.00, 4.00, 4.00, 0.00)
returning id \gset gemn_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'gemn_order_id'::uuid, :'listing_4_id'::uuid, :'seller_id'::uuid, concat('S24B2C_4_', :'run_id'), 'produto', 1, 4.00, 4.00, 4.00, 4.00, 10.00, 0.00)
returning id \gset gemn_item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, status)
values (:'wallet_id'::uuid, :'gemn_order_id'::uuid, :'gemn_item_id'::uuid, :'seller_id'::uuid, 0.00, 'esgotado');
insert into public.gemn_reservations (wallet_id, order_id, buyer_id, seller_recebedor_id, valor_gemn, status, idempotency_key)
values (:'wallet_id'::uuid, :'gemn_order_id'::uuid, :'user_b_id'::uuid, :'seller_id'::uuid, 4.00, 'efetivada', gen_random_uuid())
returning id \gset gemn_reservation_
insert into public.gemn_reservation_allocations (reservation_id, cashback_lot_id, seller_origem_id, seller_recebedor_id, valor_gemn, ordem_fifo, status)
values (:'gemn_reservation_id'::uuid, :'source_lot_c_id'::uuid, :'seller_id'::uuid, :'seller_id'::uuid, 4.00, 1, 'consumida');

-- Pedido com cashback anteriormente abatido: disponivel=2, recuperado=3.
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'real', 5.00, 5.00, 0.00, 5.00)
returning id \gset debt_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'debt_order_id'::uuid, :'listing_5_id'::uuid, :'seller_id'::uuid, concat('S24B2C_5_', :'run_id'), 'produto', 1, 5.00, 5.00, 5.00, 5.00, 10.00, 5.00)
returning id \gset debt_item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, valor_consumido, valor_a_recuperar, status)
values (:'wallet_id'::uuid, :'debt_order_id'::uuid, :'debt_item_id'::uuid, :'seller_id'::uuid, 5.00, 0.00, 2.00, 3.00, 'esgotado');

-- Pedido bloqueado por cashback reservado em outro pedido pendente.
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'real', 2.00, 2.00, 0.00, 2.00)
returning id \gset blocked_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'blocked_order_id'::uuid, :'listing_2_id'::uuid, :'seller_id'::uuid, concat('S24B2C_2_', :'run_id'), 'produto', 1, 2.00, 2.00, 2.00, 2.00, 10.00, 3.00)
returning id \gset blocked_item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, valor_reservado, status)
values (:'wallet_id'::uuid, :'blocked_order_id'::uuid, :'blocked_item_id'::uuid, :'seller_id'::uuid, 3.00, 2.00, 1.00, 'disponivel');

update public.orders set status = 'confirmado'
 where id in (:'real_order_id'::uuid, :'mixed_order_id'::uuid, :'source_order_a_id'::uuid,
              :'source_order_b_id'::uuid, :'source_order_c_id'::uuid, :'gemn_order_id'::uuid, :'debt_order_id'::uuid,
              :'blocked_order_id'::uuid);

commit;

select set_config('gemn.cancel.user_b_id', :'user_b_id', false);
select set_config('gemn.cancel.real_order_id', :'real_order_id', false);
select set_config('gemn.cancel.mixed_order_id', :'mixed_order_id', false);
select set_config('gemn.cancel.gemn_order_id', :'gemn_order_id', false);
select set_config('gemn.cancel.debt_order_id', :'debt_order_id', false);
select set_config('gemn.cancel.blocked_order_id', :'blocked_order_id', false);

begin;
set local role postgres;
select set_config('request.jwt.claim.sub', :'user_a_id', true);

select * from public.cancel_confirmed_order(:'real_order_id'::uuid, gen_random_uuid(), 'cancelamento real');

do $$
declare v_wallet public.wallets%rowtype; v_lot public.cashback_lots%rowtype; v_count integer;
begin
  select * into v_wallet from public.wallets where user_id = current_setting('gemn.cancel.user_b_id')::uuid;
  if v_wallet.saldo_disponivel <> 10.00 then raise exception 'real estorno alterou saldo incorretamente: %', v_wallet.saldo_disponivel; end if;
  select * into v_lot from public.cashback_lots where order_id = current_setting('gemn.cancel.real_order_id')::uuid;
  if v_lot.status <> 'estornado' or v_lot.valor_disponivel <> 0 then raise exception 'cashback real nao estornado'; end if;
  select count(*) into v_count from public.wallet_transactions where order_id = current_setting('gemn.cancel.real_order_id')::uuid and tipo = 'estorno_cashback';
  if v_count <> 1 then raise exception 'ledger estorno_cashback ausente'; end if;
end $$;

select * from public.cancel_confirmed_order(:'mixed_order_id'::uuid, gen_random_uuid(), 'cancelamento misto');
do $$
declare v_wallet public.wallets%rowtype; v_lot public.cashback_lots%rowtype; v_count integer;
begin
  select * into v_wallet from public.wallets where user_id = current_setting('gemn.cancel.user_b_id')::uuid;
  if v_wallet.saldo_disponivel <> 14.00 or v_wallet.saldo_a_recuperar <> 2.00 then raise exception 'misto nao conciliou saldo: %, %', v_wallet.saldo_disponivel, v_wallet.saldo_a_recuperar; end if;
  select * into v_lot from public.cashback_lots where order_id = current_setting('gemn.cancel.mixed_order_id')::uuid;
  if v_lot.valor_consumido <> 1.00 or v_lot.status <> 'estornado' then raise exception 'historico do lote misto perdido'; end if;
  select count(*) into v_count from public.order_cancellation_allocations where order_id = current_setting('gemn.cancel.mixed_order_id')::uuid;
  if v_count <> 2 then raise exception 'FIFO de dois lotes nao foi rastreado'; end if;
end $$;

select * from public.cancel_confirmed_order(:'gemn_order_id'::uuid, gen_random_uuid(), 'cancelamento GEMN');
do $$
declare v_wallet public.wallets%rowtype; v_count integer;
begin
  select * into v_wallet from public.wallets where user_id = current_setting('gemn.cancel.user_b_id')::uuid;
  if v_wallet.saldo_disponivel <> 18.00 then raise exception 'estorno 100%% GEMN incorreto: %', v_wallet.saldo_disponivel; end if;
  select count(*) into v_count from public.wallet_transactions where order_id = current_setting('gemn.cancel.gemn_order_id')::uuid and tipo = 'estorno_gemn';
  if v_count <> 1 then raise exception 'ledger estorno_gemn ausente'; end if;
end $$;

select * from public.cancel_confirmed_order(:'debt_order_id'::uuid, gen_random_uuid(), 'cancelamento divida');
do $$
declare v_wallet public.wallets%rowtype; v_lot public.cashback_lots%rowtype; v_count integer;
begin
  select * into v_wallet from public.wallets where user_id = current_setting('gemn.cancel.user_b_id')::uuid;
  if v_wallet.saldo_disponivel <> 18.00 or v_wallet.saldo_a_recuperar <> 7.00 then raise exception 'divida restaurada incorretamente: %, %', v_wallet.saldo_disponivel, v_wallet.saldo_a_recuperar; end if;
  select * into v_lot from public.cashback_lots where order_id = current_setting('gemn.cancel.debt_order_id')::uuid;
  if v_lot.valor_disponivel <> 0 or v_lot.valor_a_recuperar <> 3.00 then raise exception 'lote de divida perdeu historico'; end if;
  select count(*) into v_count from public.wallet_transactions where order_id = current_setting('gemn.cancel.debt_order_id')::uuid and tipo = 'cashback_divida_criada';
  if v_count <> 2 then raise exception 'ledger de divida consumida/restaurada incompleto'; end if;
end $$;

do $$
declare v_rejected boolean;
begin
  begin
    perform * from public.cancel_confirmed_order(current_setting('gemn.cancel.debt_order_id')::uuid, (select idempotency_key from public.order_cancellations where order_id = current_setting('gemn.cancel.debt_order_id')::uuid), 'retry');
  exception when others then raise exception 'retry com a mesma chave foi rejeitado: %', sqlerrm; end;
  v_rejected := false;
  begin
    perform * from public.cancel_confirmed_order(current_setting('gemn.cancel.debt_order_id')::uuid, gen_random_uuid(), 'outra chave');
  exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'chave diferente foi aceita'; end if;
end $$;

do $$
declare v_rejected boolean := false;
begin
  begin
    perform * from public.cancel_confirmed_order(current_setting('gemn.cancel.blocked_order_id')::uuid, gen_random_uuid(), 'bloqueio');
  exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'cashback reservado nao bloqueou estorno'; end if;
end $$;

rollback;

-- Rejeicao de estados incompativeis e rollback integral de falha financeira.
begin;
set local role postgres;
select set_config('request.jwt.claim.sub', :'user_a_id', true);

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset pending_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'pending_order_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24B2C_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00)
returning id \gset pending_item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, status)
values (:'wallet_id'::uuid, :'pending_order_id'::uuid, :'pending_item_id'::uuid, :'seller_id'::uuid, 0.00, 0.00, 'esgotado');

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset concluded_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'concluded_order_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24B2C_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00)
returning id \gset concluded_item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, status)
values (:'wallet_id'::uuid, :'concluded_order_id'::uuid, :'concluded_item_id'::uuid, :'seller_id'::uuid, 0.00, 0.00, 'esgotado');
update public.orders set status = 'concluido' where id = :'concluded_order_id'::uuid;

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'gemn', 4.00, 4.00, 4.00, 0.00)
returning id \gset rollback_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'rollback_order_id'::uuid, :'listing_4_id'::uuid, :'seller_id'::uuid, concat('S24B2C_4_', :'run_id'), 'produto', 1, 4.00, 4.00, 4.00, 4.00, 0.00, 0.00)
returning id \gset rollback_item_
insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_consumido, status)
values (:'wallet_id'::uuid, :'rollback_order_id'::uuid, :'rollback_item_id'::uuid, :'seller_id'::uuid, 4.00, 0.00, 'disponivel')
returning id \gset rollback_lot_
insert into public.gemn_reservations (wallet_id, order_id, buyer_id, seller_recebedor_id, valor_gemn, status, idempotency_key)
values (:'wallet_id'::uuid, :'rollback_order_id'::uuid, :'user_b_id'::uuid, :'seller_id'::uuid, 4.00, 'efetivada', gen_random_uuid())
returning id \gset rollback_reservation_
insert into public.gemn_reservation_allocations (reservation_id, cashback_lot_id, seller_origem_id, seller_recebedor_id, valor_gemn, ordem_fifo, status)
values (:'rollback_reservation_id'::uuid, :'rollback_lot_id'::uuid, :'seller_id'::uuid, :'seller_id'::uuid, 4.00, 1, 'consumida');
update public.orders set status = 'confirmado' where id = :'rollback_order_id'::uuid;

select set_config('gemn.cancel.pending_order_id', :'pending_order_id', false);
select set_config('gemn.cancel.concluded_order_id', :'concluded_order_id', false);
select set_config('gemn.cancel.rollback_order_id', :'rollback_order_id', false);
select set_config('gemn.cancel.rollback_lot_id', :'rollback_lot_id', false);

do $$
declare v_rejected boolean;
begin
  v_rejected := false;
  begin
    perform * from public.cancel_confirmed_order(current_setting('gemn.cancel.pending_order_id')::uuid, gen_random_uuid(), 'pendente');
  exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'pedido pendente foi aceito'; end if;
  v_rejected := false;
  begin
    perform * from public.cancel_confirmed_order(current_setting('gemn.cancel.concluded_order_id')::uuid, gen_random_uuid(), 'concluido');
  exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'pedido concluido foi aceito'; end if;
  v_rejected := false;
  begin
    perform * from public.cancel_confirmed_order(current_setting('gemn.cancel.rollback_order_id')::uuid, gen_random_uuid(), 'falha');
  exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'falha financeira nao foi rejeitada'; end if;
  if exists (select 1 from public.order_cancellations where order_id = current_setting('gemn.cancel.rollback_order_id')::uuid) then raise exception 'rollback deixou cancelamento'; end if;
  if (select valor_consumido from public.cashback_lots where id = current_setting('gemn.cancel.rollback_lot_id')::uuid) <> 0 then raise exception 'rollback alterou lote'; end if;
end $$;

rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_b_id', true);
do $$
declare v_rejected boolean := false;
begin
  begin
    perform * from public.cancel_confirmed_order(current_setting('gemn.cancel.real_order_id')::uuid, gen_random_uuid(), 'nao autorizado');
  exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'comprador conseguiu cancelar'; end if;
end $$;
rollback;

select 'SPRINT24B_CANCEL_CONFIRMED_ORDER_OK' as result;
