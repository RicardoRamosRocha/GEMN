\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin;

insert into public.profiles (id, is_admin)
values
  (:'admin_id'::uuid, true),
  (:'buyer_id'::uuid, false),
  (:'seller_a_user_id'::uuid, false),
  (:'seller_b_user_id'::uuid, false),
  (:'outsider_id'::uuid, false)
on conflict (id) do update set is_admin = excluded.is_admin;

insert into public.seller_applications (user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao)
values (:'seller_a_user_id'::uuid, 'empreendedor', concat('S24C_READ_A_', :'run_id'), concat('S24CRA', :'run_id'), '11999990001', 'teste', 'fixture')
returning id \gset application_a_
insert into public.sellers (user_id, application_id, tipo_membro, nome_negocio, descricao, telefone, status)
values (:'seller_a_user_id'::uuid, :'application_a_id'::uuid, 'empreendedor', concat('S24C_READ_A_', :'run_id'), 'fixture', '11999990001', 'ativo')
returning id \gset seller_a_

insert into public.seller_applications (user_id, tipo_membro, nome_negocio, cnpj, telefone, categoria, descricao)
values (:'seller_b_user_id'::uuid, 'empresa', concat('S24C_READ_B_', :'run_id'), concat('S24CRB', :'run_id'), '11999990002', 'teste', 'fixture')
returning id \gset application_b_
insert into public.sellers (user_id, application_id, tipo_membro, nome_negocio, descricao, telefone, status)
values (:'seller_b_user_id'::uuid, :'application_b_id'::uuid, 'empresa', concat('S24C_READ_B_', :'run_id'), 'fixture', '11999990002', 'ativo')
returning id \gset seller_b_

insert into public.categories (nome, ativo)
values (concat('S24C_READ_', :'run_id'), true)
returning id \gset category_
insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
values
  (:'seller_a_id'::uuid, :'category_id'::uuid, 'produto', concat('S24C_READ_A_', :'run_id'), 'fixture', 10.00, true, 10.00, 'ativo'),
  (:'seller_b_id'::uuid, :'category_id'::uuid, 'produto', concat('S24C_READ_B_', :'run_id'), 'fixture', 10.00, true, 10.00, 'ativo');

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'buyer_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset order_a_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
select :'order_a_id'::uuid, l.id, l.seller_id, l.nome, 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00
  from public.listings l
 where l.seller_id = :'seller_a_id'::uuid;

select set_config('gemn.test.order_a', :'order_a_id', false);
select set_config('gemn.test.seller_b', :'seller_b_id', false);
do $$
declare v_failed boolean := false;
begin
  begin
    insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
    select current_setting('gemn.test.order_a')::uuid, l.id, l.seller_id, l.nome, 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00
      from public.listings l where l.seller_id = current_setting('gemn.test.seller_b')::uuid;
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'two sellers same order unexpectedly accepted'; end if;
end $$;
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'buyer_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset order_b_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
select :'order_b_id'::uuid, l.id, l.seller_id, l.nome, 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00
  from public.listings l
 where l.seller_id = :'seller_b_id'::uuid;
update public.orders set status = 'confirmado' where id in (:'order_a_id'::uuid, :'order_b_id'::uuid);
update public.listings set status = 'inativo' where seller_id = :'seller_a_id'::uuid;
update public.sellers set status = 'suspenso' where id = :'seller_a_id'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'buyer_id', true);
select gen_random_uuid() as request_key \gset
select * from public.request_order_cancellation(:'order_a_id'::uuid, :'request_key'::uuid, 'motivo de leitura') \gset request_

select count(*) as n from public.list_my_cancellation_requests() \gset buyer_requests_

-- O vendedor A está suspenso, mas continua autorizado por vínculo histórico.
select set_config('request.jwt.claim.sub', :'seller_a_user_id', true);
select count(*) as n from public.list_seller_related_orders() \gset seller_a_orders_
select count(*) as n from public.list_my_cancellation_requests() \gset seller_a_requests_

-- O vendedor B também vê o pedido e a solicitação do comprador, sem depender do solicitante.
select set_config('request.jwt.claim.sub', :'seller_b_user_id', true);
select count(*) as n from public.list_seller_related_orders() \gset seller_b_orders_
select count(*) as n from public.list_my_cancellation_requests() \gset seller_b_requests_

-- Usuário sem vínculo não recebe nenhuma linha.
select set_config('request.jwt.claim.sub', :'outsider_id', true);
select count(*) as n from public.list_my_cancellation_requests() \gset outsider_requests_
select count(*) as n from public.list_seller_related_orders() \gset outsider_orders_

-- Administrador vê a fila completa, enquanto usuário comum é recusado.
select set_config('request.jwt.claim.sub', :'admin_id', true);
select count(*) as n from public.list_admin_cancellation_requests('pendente') \gset admin_pending_
select gen_random_uuid() as reject_key \gset
select * from public.reject_order_cancellation_request(:'request_request_id'::uuid, :'reject_key'::uuid, 'decisão de teste') \gset rejected_

select set_config('request.jwt.claim.sub', :'seller_a_user_id', true);
select count(*) as n from public.list_cancellation_request_attempts(:'request_request_id'::uuid) \gset seller_attempts_

select set_config('request.jwt.claim.sub', :'buyer_id', true);
do $$
declare v_failed boolean := false;
begin
  begin
    perform * from public.list_admin_cancellation_requests('pendente');
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'non-admin admin queue access accepted'; end if;
end $$;

select set_config('gemn.test.buyer_requests', :'buyer_requests_n', false);
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.list_admin_cancellation_requests(text)', 'EXECUTE') then raise exception 'anon execute privilege leaked'; end if;
  if has_function_privilege('public', 'public.list_admin_cancellation_requests(text)', 'EXECUTE') then raise exception 'public execute privilege leaked'; end if;
  if not has_function_privilege('authenticated', 'public.list_admin_cancellation_requests(text)', 'EXECUTE') then raise exception 'authenticated execute privilege missing'; end if;
end $$;

select set_config('gemn.test.seller_a_orders', :'seller_a_orders_n', false);
select set_config('gemn.test.seller_b_orders', :'seller_b_orders_n', false);
select set_config('gemn.test.seller_a_requests', :'seller_a_requests_n', false);
select set_config('gemn.test.seller_b_requests', :'seller_b_requests_n', false);
select set_config('gemn.test.outsider_requests', :'outsider_requests_n', false);
select set_config('gemn.test.outsider_orders', :'outsider_orders_n', false);
select set_config('gemn.test.admin_pending', :'admin_pending_n', false);
select set_config('gemn.test.seller_attempts', :'seller_attempts_n', false);

do $$
begin
  if current_setting('gemn.test.buyer_requests')::integer <> 1 then
    raise exception 'buyer request visibility mismatch';
  end if;
  if current_setting('gemn.test.seller_a_orders')::integer <> 1 or current_setting('gemn.test.seller_b_orders')::integer <> 1 then
    raise exception 'seller order isolation mismatch';
  end if;
  if current_setting('gemn.test.seller_a_requests')::integer <> 1 or current_setting('gemn.test.seller_b_requests')::integer <> 0 then
    raise exception 'seller request visibility mismatch';
  end if;
  if current_setting('gemn.test.outsider_requests')::integer <> 0 or current_setting('gemn.test.outsider_orders')::integer <> 0 then
    raise exception 'unrelated user received rows';
  end if;
  if current_setting('gemn.test.admin_pending')::integer <> 1 or current_setting('gemn.test.seller_attempts')::integer <> 1 then
    raise exception 'admin queue or attempt history mismatch';
  end if;
end $$;

reset role;
rollback;
select 'SPRINT24C_CANCELLATION_READS_OK' as result;
