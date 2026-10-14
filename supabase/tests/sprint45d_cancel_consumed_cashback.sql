\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

-- Teste transacional: nenhuma fixture ou movimentação permanece no banco.
begin;

select gen_random_uuid() as admin_id \gset
select gen_random_uuid() as buyer_id \gset
select gen_random_uuid() as seller_id \gset
select gen_random_uuid() as application_id \gset
select gen_random_uuid() as category_id \gset
select gen_random_uuid() as listing_id \gset
select gen_random_uuid() as consumer_listing_id \gset
select gen_random_uuid() as reserved_listing_id \gset
select gen_random_uuid() as wallet_id \gset
select gen_random_uuid() as source_order_id \gset
select gen_random_uuid() as source_item_id \gset
select gen_random_uuid() as source_lot_id \gset
select gen_random_uuid() as consumer_order_id \gset
select gen_random_uuid() as consumer_item_id \gset
select gen_random_uuid() as consumer_reservation_id \gset
select gen_random_uuid() as consumer_allocation_id \gset
select gen_random_uuid() as reserved_order_id \gset
select gen_random_uuid() as reserved_item_id \gset
select gen_random_uuid() as reserved_lot_id \gset
select gen_random_uuid() as request_key \gset
select gen_random_uuid() as approval_key \gset
select gen_random_uuid() as reserved_request_key \gset
select gen_random_uuid() as reserved_approval_key \gset

insert into public.profiles (id, is_admin)
values
  (:'admin_id'::uuid, true),
  (:'buyer_id'::uuid, false),
  (:'seller_id'::uuid, false)
;

insert into public.seller_applications (
  id, user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao
)
values (
  :'application_id'::uuid, :'seller_id'::uuid, 'empreendedor',
  'S45D cashback consumido', 'S45D' || substr(:'seller_id', 1, 8),
  '11999990001', 'teste', 'fixture'
);

insert into public.sellers (
  id, user_id, application_id, tipo_membro, nome_negocio, descricao,
  telefone, status
)
values (
  :'seller_id'::uuid, :'seller_id'::uuid, :'application_id'::uuid,
  'empreendedor', 'S45D cashback consumido', 'fixture', '11999990001', 'ativo'
);

insert into public.categories (id, nome, ativo)
values (:'category_id'::uuid, 'S45D cashback consumido', true);

insert into public.listings (
  id, seller_id, category_id, tipo, nome, descricao, preco_real,
  aceita_gemn, preco_gemn, status
)
values (
  :'listing_id'::uuid, :'seller_id'::uuid, :'category_id'::uuid, 'produto',
  'S45D origem', 'fixture', 30.00, true, 30.00, 'ativo'
);

insert into public.listings (
  id, seller_id, category_id, tipo, nome, descricao, preco_real,
  aceita_gemn, preco_gemn, status
)
values (
  :'consumer_listing_id'::uuid, :'seller_id'::uuid, :'category_id'::uuid,
  'produto', 'S45D consumidor', 'fixture', 3.00, true, 3.00, 'ativo'
);

insert into public.listings (
  id, seller_id, category_id, tipo, nome, descricao, preco_real,
  aceita_gemn, preco_gemn, status
)
values (
  :'reserved_listing_id'::uuid, :'seller_id'::uuid, :'category_id'::uuid,
  'produto', 'S45D reservado', 'fixture', 10.00, true, 10.00, 'ativo'
);

insert into public.wallets (id, user_id, saldo_disponivel, saldo_reservado, saldo_a_recuperar)
values (:'wallet_id'::uuid, :'buyer_id'::uuid, 2.40, 0.00, 0.00);

-- Origem: pagamento integral em reais e cashback já consumido.
insert into public.orders (
  id, buyer_id, idempotency_key, status, forma_pagamento, total_real,
  total_gemn, gemn_utilizado, valor_devido_real
)
values (
  :'source_order_id'::uuid, :'buyer_id'::uuid, gen_random_uuid(), 'pendente',
  'real', 30.00, 30.00, 0.00, 30.00
);

insert into public.order_items (
  id, order_id, listing_id, seller_id, nome_item, tipo, quantidade,
  preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn,
  cashback_percentual, cashback_previsto
)
values (
  :'source_item_id'::uuid, :'source_order_id'::uuid, :'listing_id'::uuid,
  :'seller_id'::uuid, 'S45D origem', 'produto', 1, 30.00, 30.00, 30.00,
  30.00, 10.00, 3.00
);

insert into public.cashback_lots (
  id, wallet_id, order_id, order_item_id, seller_origem_id, valor_original,
  valor_disponivel, valor_reservado, valor_consumido, valor_a_recuperar, status
)
values (
  :'source_lot_id'::uuid, :'wallet_id'::uuid, :'source_order_id'::uuid,
  :'source_item_id'::uuid, :'seller_id'::uuid, 3.00, 0.00, 0.00, 3.00,
  0.00, 'esgotado'
);
update public.orders set status = 'confirmado' where id = :'source_order_id'::uuid;

-- Consumidor: permanece confirmado, com alocação efetivamente consumida.
insert into public.orders (
  id, buyer_id, idempotency_key, status, forma_pagamento, total_real,
  total_gemn, gemn_utilizado, valor_devido_real
)
values (
  :'consumer_order_id'::uuid, :'buyer_id'::uuid, gen_random_uuid(), 'pendente',
  'gemn', 3.00, 3.00, 3.00, 0.00
);

insert into public.order_items (
  id, order_id, listing_id, seller_id, nome_item, tipo, quantidade,
  preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn,
  cashback_percentual, cashback_previsto
)
values (
  :'consumer_item_id'::uuid, :'consumer_order_id'::uuid, :'consumer_listing_id'::uuid,
  :'seller_id'::uuid, 'S45D consumidor', 'produto', 1, 3.00, 3.00, 3.00,
  3.00, 0.00, 0.00
);

insert into public.gemn_reservations (
  id, wallet_id, order_id, buyer_id, seller_recebedor_id, valor_gemn,
  status, idempotency_key
)
values (
  :'consumer_reservation_id'::uuid, :'wallet_id'::uuid,
  :'consumer_order_id'::uuid, :'buyer_id'::uuid, :'seller_id'::uuid, 3.00,
  'efetivada', gen_random_uuid()
);

insert into public.gemn_reservation_allocations (
  id, reservation_id, cashback_lot_id, seller_origem_id, seller_recebedor_id,
  valor_gemn, ordem_fifo, status
)
values (
  :'consumer_allocation_id'::uuid, :'consumer_reservation_id'::uuid,
  :'source_lot_id'::uuid, :'seller_id'::uuid, :'seller_id'::uuid, 3.00, 1,
  'consumida'
);

-- Ledger do consumo efetivado, com snapshot coerente com a carteira fixture.
insert into public.wallet_transactions (
  wallet_id, order_id, reservation_id, cashback_lot_id, tipo, valor,
  saldo_disponivel_apos, saldo_reservado_apos, saldo_a_recuperar_apos,
  idempotency_key, seller_origem_id, seller_recebedor_id, executado_por,
  descricao
)
values (
  :'wallet_id'::uuid, :'consumer_order_id'::uuid,
  :'consumer_reservation_id'::uuid, :'source_lot_id'::uuid, 'debito_gemn',
  3.00, 2.40, 0.00, 0.00, gen_random_uuid(), :'seller_id'::uuid,
  :'seller_id'::uuid, :'admin_id'::uuid,
  'Consumo fixture de GEMN reservado por pedido confirmado'
);
update public.orders set status = 'confirmado' where id = :'consumer_order_id'::uuid;

do $$
begin
  if exists (
    select 1
      from pg_trigger
     where tgname = 'reject_live_cashback_consumption_on_cancellation'
       and not tgisinternal
  ) then
    raise exception 'obsolete cashback cancellation trigger still exists';
  end if;
end $$;

-- O comprador solicita e o administrador aprova a origem.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'buyer_id', true);
select * from public.request_order_cancellation(
  :'source_order_id'::uuid, :'request_key'::uuid, 'cancelamento Sprint 4.5-D'
) \gset source_request_
select set_config('gemn.test.wallet', :'wallet_id', false);
select set_config('gemn.test.source_order', :'source_order_id', false);
select set_config('gemn.test.source_lot', :'source_lot_id', false);
select set_config('gemn.test.consumer_order', :'consumer_order_id', false);
select set_config('gemn.test.consumer_allocation', :'consumer_allocation_id', false);
select set_config('gemn.test.consumer_reservation', :'consumer_reservation_id', false);
select set_config('gemn.test.source_request', :'source_request_request_id', false);

select count(*) as consumer_ledger_count,
       coalesce(sum(valor), 0.00) as consumer_ledger_value,
       md5(coalesce(string_agg(
         concat_ws('|', id::text, order_id::text, reservation_id::text,
                   cashback_lot_id::text, tipo, valor::text,
                   saldo_disponivel_apos::text, saldo_reservado_apos::text,
                   saldo_a_recuperar_apos::text, idempotency_key::text,
                   descricao), E'\n' order by id), '')) as consumer_ledger_fingerprint
 from public.wallet_transactions
 where order_id = :'consumer_order_id'::uuid
\gset consumer_before_
select set_config('gemn.test.consumer_ledger_count', :'consumer_before_consumer_ledger_count', false);
select set_config('gemn.test.consumer_ledger_value', :'consumer_before_consumer_ledger_value', false);
select set_config('gemn.test.consumer_ledger_fingerprint', :'consumer_before_consumer_ledger_fingerprint', false);

select set_config('request.jwt.claim.sub', :'admin_id', true);
select * from public.approve_order_cancellation_request(
  :'source_request_request_id'::uuid, :'approval_key'::uuid
) \gset source_approved_

reset role;

do $$
declare
  v_wallet public.wallets%rowtype;
  v_lot public.cashback_lots%rowtype;
  v_request public.order_cancellation_requests%rowtype;
  v_cancellation public.order_cancellations%rowtype;
  v_reservation public.gemn_reservations%rowtype;
  v_allocation public.gemn_reservation_allocations%rowtype;
  v_consumer_order text;
  v_debt_ledger integer;
  v_consumer_ledger_count integer;
  v_consumer_ledger_value numeric;
  v_consumer_ledger_fingerprint text;
begin
  select * into v_wallet from public.wallets where id = current_setting('gemn.test.wallet', true)::uuid;
  if v_wallet.saldo_disponivel <> 2.40 or v_wallet.saldo_reservado <> 0.00
     or v_wallet.saldo_a_recuperar <> 3.00 then
    raise exception 'wallet mismatch: %, %, %', v_wallet.saldo_disponivel,
      v_wallet.saldo_reservado, v_wallet.saldo_a_recuperar;
  end if;

  select * into v_lot from public.cashback_lots
   where id = current_setting('gemn.test.source_lot', true)::uuid;
  if v_lot.valor_consumido <> 3.00 or v_lot.valor_a_recuperar <> 0.00
     or v_lot.status <> 'estornado' then
    raise exception 'source lot history mismatch';
  end if;

  if (select status from public.orders where id = current_setting('gemn.test.source_order', true)::uuid) <> 'cancelado' then
    raise exception 'source order was not cancelled';
  end if;
  select status into v_consumer_order from public.orders
   where id = current_setting('gemn.test.consumer_order', true)::uuid;
  if v_consumer_order <> 'confirmado' then
    raise exception 'consumer order was changed: %', v_consumer_order;
  end if;

  select * into v_reservation from public.gemn_reservations
   where id = current_setting('gemn.test.consumer_reservation', true)::uuid;
  if v_reservation.status <> 'efetivada' or v_reservation.valor_gemn <> 3.00 then
    raise exception 'consumer reservation was changed';
  end if;

  select * into v_allocation from public.gemn_reservation_allocations
   where id = current_setting('gemn.test.consumer_allocation', true)::uuid;
  if v_allocation.status <> 'consumida' or v_allocation.valor_gemn <> 3.00
     or v_allocation.cashback_lot_id <> current_setting('gemn.test.source_lot', true)::uuid then
    raise exception 'consumer allocation was changed';
  end if;

  select count(*), coalesce(sum(valor), 0.00),
         md5(coalesce(string_agg(
           concat_ws('|', id::text, order_id::text, reservation_id::text,
                     cashback_lot_id::text, tipo, valor::text,
                     saldo_disponivel_apos::text, saldo_reservado_apos::text,
                     saldo_a_recuperar_apos::text, idempotency_key::text,
                     descricao), E'\n' order by id), ''))
    into v_consumer_ledger_count, v_consumer_ledger_value,
         v_consumer_ledger_fingerprint
    from public.wallet_transactions
   where order_id = current_setting('gemn.test.consumer_order', true)::uuid;
  if v_consumer_ledger_count <> current_setting('gemn.test.consumer_ledger_count', true)::integer
     or v_consumer_ledger_value <> current_setting('gemn.test.consumer_ledger_value', true)::numeric
     or v_consumer_ledger_fingerprint <> current_setting('gemn.test.consumer_ledger_fingerprint', true) then
    raise exception 'consumer ledger changed or was duplicated';
  end if;

  select * into v_cancellation from public.order_cancellations
   where order_id = current_setting('gemn.test.source_order', true)::uuid;
  if v_cancellation.cashback_divida_criada <> 3.00 then
    raise exception 'debt mismatch: %', v_cancellation.cashback_divida_criada;
  end if;

  select count(*) into v_debt_ledger from public.wallet_transactions
   where order_id = current_setting('gemn.test.source_order', true)::uuid
     and tipo = 'cashback_divida_criada';
  if v_debt_ledger <> 1 then raise exception 'debt ledger duplicated or missing'; end if;
  if (select saldo_disponivel_apos from public.wallet_transactions
      where order_id = current_setting('gemn.test.source_order', true)::uuid
        and tipo = 'cashback_divida_criada') <> 2.40
     or (select saldo_a_recuperar_apos from public.wallet_transactions
      where order_id = current_setting('gemn.test.source_order', true)::uuid
        and tipo = 'cashback_divida_criada') <> 3.00 then
    raise exception 'debt ledger balance snapshot mismatch';
  end if;

  select * into v_request from public.order_cancellation_requests
   where id = current_setting('gemn.test.source_request', true)::uuid;
  if v_request.status <> 'aprovada' then raise exception 'request was not approved'; end if;

end $$;

-- Retry com a mesma chave deve retornar o mesmo resultado sem nova dívida.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', true);
select * from public.approve_order_cancellation_request(
  :'source_request_request_id'::uuid, :'approval_key'::uuid
);
reset role;

do $$
begin
  if (select count(*) from public.order_cancellations
      where order_id = current_setting('gemn.test.source_order', true)::uuid) <> 1 then
    raise exception 'idempotent retry created another cancellation';
  end if;
  if (select count(*) from public.wallet_transactions
      where order_id = current_setting('gemn.test.source_order', true)::uuid
        and tipo = 'cashback_divida_criada') <> 1 then
    raise exception 'idempotent retry created another debt';
  end if;
end $$;

-- Segunda origem com cashback reservado: continua bloqueada e faz rollback.
insert into public.orders (
  id, buyer_id, idempotency_key, status, forma_pagamento, total_real,
  total_gemn, gemn_utilizado, valor_devido_real
)
values (
  :'reserved_order_id'::uuid, :'buyer_id'::uuid, gen_random_uuid(), 'pendente',
  'real', 10.00, 10.00, 0.00, 10.00
);
insert into public.order_items (
  id, order_id, listing_id, seller_id, nome_item, tipo, quantidade,
  preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn,
  cashback_percentual, cashback_previsto
)
values (
  :'reserved_item_id'::uuid, :'reserved_order_id'::uuid, :'reserved_listing_id'::uuid,
  :'seller_id'::uuid, 'S45D reservado', 'produto', 1, 10.00, 10.00, 10.00,
  10.00, 10.00, 1.00
);
insert into public.cashback_lots (
  id, wallet_id, order_id, order_item_id, seller_origem_id, valor_original,
  valor_disponivel, valor_reservado, valor_consumido, valor_a_recuperar, status
)
values (
  :'reserved_lot_id'::uuid, :'wallet_id'::uuid, :'reserved_order_id'::uuid,
  :'reserved_item_id'::uuid, :'seller_id'::uuid, 1.00, 0.00, 1.00, 0.00,
  0.00, 'disponivel'
);
update public.orders set status = 'confirmado' where id = :'reserved_order_id'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'buyer_id', true);
select * from public.request_order_cancellation(
  :'reserved_order_id'::uuid, :'reserved_request_key'::uuid, 'cashback reservado'
) \gset reserved_request_
select set_config('gemn.test.reserved_order', :'reserved_order_id', false);
select set_config('gemn.test.reserved_lot', :'reserved_lot_id', false);
select set_config('gemn.test.reserved_request', :'reserved_request_request_id', false);
select set_config('request.jwt.claim.sub', :'admin_id', true);
select * from public.approve_order_cancellation_request(
  :'reserved_request_request_id'::uuid, :'reserved_approval_key'::uuid
) \gset reserved_approved_
reset role;

do $$
declare
  v_reserved_lot public.cashback_lots%rowtype;
begin
  if (select status from public.orders where id = current_setting('gemn.test.reserved_order', true)::uuid) <> 'confirmado' then
    raise exception 'reserved order changed after failed approval';
  end if;
  if (select count(*) from public.order_cancellations
      where order_id = current_setting('gemn.test.reserved_order', true)::uuid) <> 0 then
    raise exception 'failed reserved cancellation was persisted';
  end if;
  if (select saldo_disponivel from public.wallets
      where id = current_setting('gemn.test.wallet', true)::uuid) <> 2.40
     or (select saldo_a_recuperar from public.wallets
      where id = current_setting('gemn.test.wallet', true)::uuid) <> 3.00 then
    raise exception 'failed reserved cancellation changed wallet';
  end if;
  select * into v_reserved_lot from public.cashback_lots
   where id = current_setting('gemn.test.reserved_lot', true)::uuid;
  if v_reserved_lot.valor_original <> 1.00
     or v_reserved_lot.valor_reservado <> 1.00
     or v_reserved_lot.valor_disponivel <> 0.00
     or v_reserved_lot.valor_consumido <> 0.00
     or v_reserved_lot.valor_a_recuperar <> 0.00
     or v_reserved_lot.status <> 'disponivel' then
    raise exception 'reserved cashback lot changed after rollback';
  end if;
  if (select status from public.order_cancellation_requests
      where id = current_setting('gemn.test.reserved_request', true)::uuid) <> 'execucao_falhou' then
    raise exception 'reserved failure was not recorded';
  end if;
end $$;

rollback;
select 'SPRINT45D_CANCEL_CONSUMED_CASHBACK_OK' as result;
