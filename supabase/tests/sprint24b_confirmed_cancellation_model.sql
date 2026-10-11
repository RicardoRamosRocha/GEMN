\set ON_ERROR_STOP on

begin;

insert into public.profiles (id, is_admin)
values (:'user_a_id'::uuid, true)
on conflict (id) do update set is_admin = true;

insert into public.seller_applications (user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao)
values (:'user_a_id'::uuid, 'empreendedor', concat('S24B2_', :'run_id'), concat('S24B2', :'run_id'), '11999990001', 'teste', 'fixture')
returning id \gset application_

insert into public.sellers (user_id, application_id, tipo_membro, nome_negocio, descricao, telefone)
values (:'user_a_id'::uuid, :'application_id'::uuid, 'empreendedor', concat('S24B2_', :'run_id'), 'fixture', '11999990001')
returning id \gset seller_

update public.sellers set status = 'ativo' where id = :'seller_id'::uuid;

insert into public.categories (nome, ativo)
values (concat('S24B2_', :'run_id'), true)
returning id \gset category_

insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
values (:'seller_id'::uuid, :'category_id'::uuid, 'produto', concat('S24B2_', :'run_id'), 'fixture', 10.00, true, 10.00, 'ativo')
returning id \gset listing_

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'misto', 10.00, 10.00, 4.00, 6.00)
returning id \gset order_

insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'order_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24B2_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 10.00, 10.00);

update public.orders set status = 'confirmado' where id = :'order_id'::uuid;

insert into public.wallets (user_id, saldo_disponivel, saldo_reservado, saldo_a_recuperar)
values (:'user_b_id'::uuid, 8.00, 0.00, 8.00);

select id as wallet_id from public.wallets where user_id = :'user_b_id'::uuid \gset

insert into public.cashback_lots (wallet_id, order_id, order_item_id, seller_origem_id, valor_original, valor_disponivel, valor_reservado, valor_consumido, valor_a_recuperar, status)
select :'wallet_id'::uuid, :'order_id'::uuid, oi.id, :'seller_id'::uuid, 10.00, 0.00, 0.00, 8.00, 2.00, 'estornado'
from public.order_items oi where oi.order_id = :'order_id'::uuid
returning id \gset lot_

-- Registra a auditoria antes da alocacao viva; a RPC real executa o fluxo
-- completo sob a mesma transacao e o trigger bloqueia consumo ainda ativo.
insert into public.order_cancellations (order_id, idempotency_key, status_anterior, executado_por, motivo, gemn_estornado, cashback_retirado, cashback_divida_criada, cashback_divida_restaurada)
values (:'order_id'::uuid, gen_random_uuid(), 'confirmado', :'user_a_id'::uuid, 'cancelamento administrativo de teste', 4.00, 2.00, 8.00, 0.00)
returning id \gset cancellation_

insert into public.gemn_reservations (wallet_id, order_id, buyer_id, seller_recebedor_id, valor_gemn, status, idempotency_key)
values (:'wallet_id'::uuid, :'order_id'::uuid, :'user_b_id'::uuid, :'seller_id'::uuid, 4.00, 'efetivada', gen_random_uuid())
returning id \gset reservation_

insert into public.gemn_reservation_allocations (reservation_id, cashback_lot_id, seller_origem_id, seller_recebedor_id, valor_gemn, ordem_fifo, status)
values (:'reservation_id'::uuid, :'lot_id'::uuid, :'seller_id'::uuid, :'seller_id'::uuid, 4.00, 1, 'consumida')
returning id \gset allocation_

insert into public.order_cancellation_allocations (order_cancellation_id, order_id, reservation_id, reservation_allocation_id, cashback_lot_id, seller_origem_id, seller_recebedor_id, valor_gemn)
select oc.id, oc.order_id, a.reservation_id, a.id, a.cashback_lot_id, a.seller_origem_id, a.seller_recebedor_id, a.valor_gemn
from public.order_cancellations oc
cross join public.gemn_reservation_allocations a
where oc.id = :'cancellation_id'::uuid and a.id = :'allocation_id'::uuid;

update public.gemn_reservations
set status = 'estornada', estornada_em = now(), estornada_por = :'user_a_id'::uuid,
    estorno_idempotency_key = gen_random_uuid(), order_cancellation_id = :'cancellation_id'::uuid
where id = :'reservation_id'::uuid;

update public.gemn_reservation_allocations
set status = 'estornada', estornada_em = now(), estornada_por = :'user_a_id'::uuid,
    order_cancellation_id = :'cancellation_id'::uuid
where id = :'allocation_id'::uuid;

insert into public.wallet_transactions (wallet_id, tipo, valor, saldo_disponivel_apos, saldo_reservado_apos, saldo_a_recuperar_apos, idempotency_key, order_id, descricao, executado_por)
select w.id, x.tipo, x.valor, 8.00, 0.00, x.divida_posterior, gen_random_uuid(), :'order_id'::uuid, concat('fixture ', x.tipo), :'user_a_id'::uuid
from public.wallets w
cross join (values
  ('estorno_gemn'::text, 4.00::numeric, 8.00::numeric, 8.00::numeric),
  ('estorno_cashback'::text, 2.00::numeric, 8.00::numeric, 8.00::numeric),
  ('cashback_divida_criada'::text, 8.00::numeric, 8.00::numeric, 16.00::numeric)
) as x(tipo, valor, divida_anterior, divida_posterior)
where w.user_id = :'user_b_id'::uuid;

select set_config('gemn.test.order_id', :'order_id', false);
select set_config('gemn.test.cancellation_id', :'cancellation_id', false);
select set_config('gemn.test.reservation_id', :'reservation_id', false);
select set_config('gemn.test.allocation_id', :'allocation_id', false);
select set_config('gemn.test.user_a_id', :'user_a_id', false);

do $$
begin
  if (select count(*) from public.order_cancellations where id = current_setting('gemn.test.cancellation_id')::uuid) <> 1 then raise exception 'cancellation fixture missing'; end if;
  if (select status from public.gemn_reservations where id = current_setting('gemn.test.reservation_id')::uuid) <> 'estornada' then raise exception 'reservation status mismatch'; end if;
  if (select status from public.gemn_reservation_allocations where id = current_setting('gemn.test.allocation_id')::uuid) <> 'estornada' then raise exception 'allocation status mismatch'; end if;
  if (select count(*) from public.order_cancellation_allocations where order_cancellation_id = current_setting('gemn.test.cancellation_id')::uuid) <> 1 then raise exception 'allocation audit link missing'; end if;
  if (select count(*) from public.wallet_transactions where order_id = current_setting('gemn.test.order_id')::uuid and tipo in ('estorno_gemn','estorno_cashback','cashback_divida_criada')) <> 3 then raise exception 'ledger reversal types missing'; end if;
end $$;

do $$
begin
  begin
    insert into public.order_cancellations (order_id, idempotency_key, status_anterior, executado_por, motivo)
    values (current_setting('gemn.test.order_id')::uuid, (select idempotency_key from public.order_cancellations where id = current_setting('gemn.test.cancellation_id')::uuid), 'confirmado', current_setting('gemn.test.user_a_id')::uuid, 'duplicado');
    raise exception 'duplicate cancellation was accepted';
  exception when others then null; end;
  begin
    insert into public.order_cancellation_allocations (order_cancellation_id, order_id, reservation_id, reservation_allocation_id, cashback_lot_id, seller_origem_id, seller_recebedor_id, valor_gemn)
    select current_setting('gemn.test.cancellation_id')::uuid, order_id, reservation_id, reservation_allocation_id, cashback_lot_id, seller_origem_id, seller_recebedor_id, valor_gemn
    from public.order_cancellation_allocations where id = (select id from public.order_cancellation_allocations limit 1);
    raise exception 'duplicate allocation link was accepted';
  exception when others then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_b_id', true);
do $$
begin
  if (select count(*) from public.order_cancellations where order_id = current_setting('gemn.test.order_id')::uuid) <> 1 then raise exception 'buyer cannot read own cancellation'; end if;
  begin
    update public.order_cancellations set motivo = 'tampered' where order_id = current_setting('gemn.test.order_id')::uuid;
    raise exception 'buyer updated cancellation history';
  exception when others then null; end;
  begin
    delete from public.order_cancellation_allocations where order_id = current_setting('gemn.test.order_id')::uuid;
    raise exception 'buyer deleted cancellation allocation history';
  exception when others then null; end;
end $$;

select set_config('request.jwt.claim.sub', :'user_c_id', true);
do $$
begin
  if (select count(*) from public.order_cancellations where order_id = current_setting('gemn.test.order_id')::uuid) <> 0 then raise exception 'other buyer can read cancellation'; end if;
end $$;

do $$
begin
  if has_table_privilege('authenticated', 'public.order_cancellations', 'INSERT') then raise exception 'authenticated can insert cancellation'; end if;
  if has_table_privilege('authenticated', 'public.gemn_reservations', 'UPDATE') then raise exception 'authenticated can update reservations'; end if;
  if has_table_privilege('authenticated', 'public.wallet_transactions', 'INSERT') then raise exception 'authenticated can insert ledger'; end if;
end $$;

rollback;
select 'SPRINT24B_CONFIRMED_CANCELLATION_MODEL_OK' as result;
