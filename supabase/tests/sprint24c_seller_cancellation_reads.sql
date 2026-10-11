\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin;

insert into public.profiles (id, is_admin)
values
  (:'buyer_id'::uuid, false),
  (:'seller_a_user_id'::uuid, false),
  (:'seller_b_user_id'::uuid, false),
  (:'outsider_id'::uuid, false)
on conflict (id) do update set is_admin = excluded.is_admin;

insert into public.seller_applications (user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao)
values
  (:'seller_a_user_id'::uuid, 'empreendedor', concat('S24C_SELLER_A_', :'run_id'), concat('S24CSA', :'run_id'), '11999990001', 'teste', 'fixture'),
  (:'seller_b_user_id'::uuid, 'empreendedor', concat('S24C_SELLER_B_', :'run_id'), concat('S24CSB', :'run_id'), '11999990002', 'teste', 'fixture');

-- Os dois vendedores sao criados separadamente para preservar o isolamento do teste.
select id as application_a_id from public.seller_applications where user_id = :'seller_a_user_id'::uuid order by criado_em desc limit 1 \gset
select id as application_b_id from public.seller_applications where user_id = :'seller_b_user_id'::uuid order by criado_em desc limit 1 \gset
insert into public.sellers (user_id, application_id, tipo_membro, nome_negocio, descricao, telefone, status)
values
  (:'seller_a_user_id'::uuid, :'application_a_id'::uuid, 'empreendedor', concat('S24C_SELLER_A_', :'run_id'), 'fixture', '11999990001', 'ativo'),
  (:'seller_b_user_id'::uuid, :'application_b_id'::uuid, 'empreendedor', concat('S24C_SELLER_B_', :'run_id'), 'fixture', '11999990002', 'ativo');

select id as seller_a_id from public.sellers where user_id = :'seller_a_user_id'::uuid order by criado_em desc limit 1 \gset
select id as seller_b_id from public.sellers where user_id = :'seller_b_user_id'::uuid order by criado_em desc limit 1 \gset
insert into public.categories (nome, ativo) values (concat('S24C_SELLER_', :'run_id'), true) returning id \gset category_
insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
values
  (:'seller_a_id'::uuid, :'category_id'::uuid, 'produto', concat('S24C_SELLER_A_', :'run_id'), 'fixture', 10.00, true, 10.00, 'ativo'),
  (:'seller_b_id'::uuid, :'category_id'::uuid, 'produto', concat('S24C_SELLER_B_', :'run_id'), 'fixture', 10.00, true, 10.00, 'ativo');
select id as listing_a_id from public.listings where seller_id = :'seller_a_id'::uuid order by criado_em desc limit 1 \gset
select id as listing_b_id from public.listings where seller_id = :'seller_b_id'::uuid order by criado_em desc limit 1 \gset

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'buyer_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset order_a_
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'buyer_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset order_b_
insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'buyer_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset order_c_

insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
select :'order_a_id'::uuid, :'listing_a_id'::uuid, :'seller_a_id'::uuid, l.nome, l.tipo, 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00 from public.listings l where l.id = :'listing_a_id'::uuid
union all
select :'order_b_id'::uuid, :'listing_b_id'::uuid, :'seller_b_id'::uuid, l.nome, l.tipo, 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00 from public.listings l where l.id = :'listing_b_id'::uuid
union all
select :'order_c_id'::uuid, :'listing_a_id'::uuid, :'seller_a_id'::uuid, l.nome, l.tipo, 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00 from public.listings l where l.id = :'listing_a_id'::uuid;
update public.orders set status = 'confirmado' where id in (:'order_a_id'::uuid, :'order_b_id'::uuid, :'order_c_id'::uuid);

-- As fixtures sao criadas pelo papel de teste postgres para que este teste
-- valide exclusivamente a consulta de leitura, sem depender de outra RPC.
insert into public.order_cancellation_requests (
  order_id, requested_by, requester_role, requester_seller_id,
  motivo_solicitacao, idempotency_key
)
values
  (:'order_a_id'::uuid, :'buyer_id'::uuid, 'comprador', null, 'solicitacao do comprador', gen_random_uuid()),
  (:'order_c_id'::uuid, :'seller_a_user_id'::uuid, 'vendedor', :'seller_a_id'::uuid, 'solicitacao do vendedor', gen_random_uuid());

set local role authenticated;
select set_config('request.jwt.claim.sub', :'seller_a_user_id', true);

select count(*) as n from public.list_seller_cancellation_requests() \gset seller_a_
select set_config('request.jwt.claim.sub', :'seller_b_user_id', true);
select count(*) as n from public.list_seller_cancellation_requests() \gset seller_b_
select set_config('request.jwt.claim.sub', :'buyer_id', true);
select count(*) as n from public.list_seller_cancellation_requests() \gset buyer_
select set_config('request.jwt.claim.sub', :'outsider_id', true);
select count(*) as n from public.list_seller_cancellation_requests() \gset outsider_

-- O vendedor A tambem pode consultar o pedido historico depois de suspenso.
reset role;
update public.sellers set status = 'suspenso' where id = :'seller_a_id'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'seller_a_user_id', true);
select count(*) as n from public.list_seller_cancellation_requests() \gset suspended_

set local role anon;
select set_config('request.jwt.claim.sub', :'seller_a_user_id', true);
do $$
declare
  v_failed boolean := false;
begin
  begin
    perform * from public.list_seller_cancellation_requests();
  exception when others then
    v_failed := true;
  end;
  if not v_failed then raise exception 'anonymous seller cancellation read accepted'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'seller_a_user_id', true);

do $$
declare
  v_row jsonb;
begin
  select to_jsonb(r) into v_row from public.list_seller_cancellation_requests() as r limit 1;
  if v_row ? 'requested_by' or v_row ? 'decided_by' or v_row ? 'requester_seller_id' then
    raise exception 'personal identifier leaked in seller result: %', v_row;
  end if;
end $$;

reset role;
do $$
begin
  if has_function_privilege('anon', 'public.list_seller_cancellation_requests()', 'EXECUTE') then raise exception 'anon execute privilege leaked'; end if;
  if has_function_privilege('public', 'public.list_seller_cancellation_requests()', 'EXECUTE') then raise exception 'public execute privilege leaked'; end if;
  if not has_function_privilege('authenticated', 'public.list_seller_cancellation_requests()', 'EXECUTE') then raise exception 'authenticated execute privilege missing'; end if;
end $$;

select set_config('gemn.test.seller_a', :'seller_a_n', false);
select set_config('gemn.test.seller_b', :'seller_b_n', false);
select set_config('gemn.test.buyer', :'buyer_n', false);
select set_config('gemn.test.outsider', :'outsider_n', false);
select set_config('gemn.test.suspended', :'suspended_n', false);
do $$
begin
  if current_setting('gemn.test.seller_a')::integer <> 2 then raise exception 'seller A visibility mismatch'; end if;
  if current_setting('gemn.test.seller_b')::integer <> 0 then raise exception 'seller B isolation mismatch'; end if;
  if current_setting('gemn.test.buyer')::integer <> 0 then raise exception 'buyer without seller relationship received rows'; end if;
  if current_setting('gemn.test.outsider')::integer <> 0 then raise exception 'unrelated user received rows'; end if;
  if current_setting('gemn.test.suspended')::integer <> 2 then raise exception 'suspended seller visibility mismatch'; end if;
end $$;

reset role;
rollback;
select 'SPRINT24C_SELLER_CANCELLATION_READS_OK' as result;
