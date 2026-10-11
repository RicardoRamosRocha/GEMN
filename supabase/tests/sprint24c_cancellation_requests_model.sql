\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin;

insert into public.profiles (id, is_admin)
values (:'admin_id'::uuid, true)
on conflict (id) do update set is_admin = true;

insert into public.seller_applications (user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao)
values (:'seller_user_id'::uuid, 'empreendedor', concat('S24C_', :'run_id'), concat('S24C', :'run_id'), '11999990001', 'teste', 'fixture')
returning id \gset seller_application_
insert into public.sellers (user_id, application_id, tipo_membro, nome_negocio, descricao, telefone, status)
values (:'seller_user_id'::uuid, :'seller_application_id'::uuid, 'empreendedor', concat('S24C_', :'run_id'), 'fixture', '11999990001', 'ativo')
returning id \gset seller_

insert into public.seller_applications (user_id, tipo_membro, nome_negocio, cnpj, telefone, categoria, descricao)
values (:'other_seller_user_id'::uuid, 'empresa', concat('S24C_OTHER_', :'run_id'), concat('S24CO', :'run_id'), '11999990002', 'teste', 'fixture')
returning id \gset other_seller_application_
insert into public.sellers (user_id, application_id, tipo_membro, nome_negocio, descricao, telefone, status)
values (:'other_seller_user_id'::uuid, :'other_seller_application_id'::uuid, 'empresa', concat('S24C_OTHER_', :'run_id'), 'fixture', '11999990002', 'ativo')
returning id \gset other_seller_

insert into public.categories (nome, ativo)
values (concat('S24C_', :'run_id'), true)
returning id \gset category_
insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
values (:'seller_id'::uuid, :'category_id'::uuid, 'produto', concat('S24C_', :'run_id'), 'fixture', 10.00, true, 10.00, 'ativo')
returning id \gset listing_
insert into public.listings (seller_id, category_id, tipo, nome, descricao, preco_real, aceita_gemn, preco_gemn, status)
values (:'other_seller_id'::uuid, :'category_id'::uuid, 'produto', concat('S24C_OTHER_', :'run_id'), 'fixture', 10.00, true, 10.00, 'ativo')
returning id \gset other_listing_

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'buyer_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset buyer_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'buyer_order_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24C_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00);
update public.orders set status = 'confirmado' where id = :'buyer_order_id'::uuid;

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'buyer_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset seller_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'seller_order_id'::uuid, :'listing_id'::uuid, :'seller_id'::uuid, concat('S24C_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00);
update public.orders set status = 'confirmado' where id = :'seller_order_id'::uuid;

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'buyer_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset other_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'other_order_id'::uuid, :'other_listing_id'::uuid, :'other_seller_id'::uuid, concat('S24C_OTHER_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00);
update public.orders set status = 'confirmado' where id = :'other_order_id'::uuid;

insert into public.orders (buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn, gemn_utilizado, valor_devido_real)
values (:'buyer_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, 10.00, 0.00, 10.00)
returning id \gset failed_order_
insert into public.order_items (order_id, listing_id, seller_id, nome_item, tipo, quantidade, preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn, cashback_percentual, cashback_previsto)
values (:'failed_order_id'::uuid, :'other_listing_id'::uuid, :'other_seller_id'::uuid, concat('S24C_OTHER_', :'run_id'), 'produto', 1, 10.00, 10.00, 10.00, 10.00, 0.00, 0.00);
update public.orders set status = 'confirmado' where id = :'failed_order_id'::uuid;

-- O pedido foi criado quando o seller estava ativo; a solicitacao sera feita
-- depois da suspensao para cobrir o requisito de historico.
update public.listings set status = 'inativo' where id = :'listing_id'::uuid;
update public.sellers set status = 'suspenso' where id = :'seller_id'::uuid;

insert into public.order_cancellation_requests (order_id, requested_by, requester_role, motivo_solicitacao, idempotency_key)
values (:'buyer_order_id'::uuid, :'buyer_id'::uuid, 'comprador', 'motivo comprador', gen_random_uuid())
returning id \gset buyer_request_

insert into public.order_cancellation_requests (order_id, requested_by, requester_role, requester_seller_id, motivo_solicitacao, idempotency_key)
values (:'seller_order_id'::uuid, :'seller_user_id'::uuid, 'vendedor', :'seller_id'::uuid, 'motivo vendedor suspenso', gen_random_uuid())
returning id \gset seller_request_

insert into public.order_cancellation_requests (order_id, requested_by, requester_role, requester_seller_id, motivo_solicitacao, idempotency_key)
values (:'other_order_id'::uuid, :'other_seller_user_id'::uuid, 'vendedor', :'other_seller_id'::uuid, 'motivo outro vendedor', gen_random_uuid())
returning id \gset other_request_

-- Rejeicao preserva o historico e libera nova solicitacao para o mesmo pedido.
update public.order_cancellation_requests
   set status = 'rejeitada', decided_by = :'admin_id'::uuid,
       motivo_decisao = 'rejeitado em teste', decidido_em = now(), atualizado_em = now()
 where id = :'buyer_request_id'::uuid;
insert into public.order_cancellation_request_attempts (request_id, operacao, idempotency_key, executor_id, resultado)
values (:'buyer_request_id'::uuid, 'rejeicao', gen_random_uuid(), :'admin_id'::uuid, 'sucesso');

insert into public.order_cancellation_requests (order_id, requested_by, requester_role, motivo_solicitacao, idempotency_key)
values (:'buyer_order_id'::uuid, :'buyer_id'::uuid, 'comprador', 'nova solicitacao apos rejeicao', gen_random_uuid())
returning id \gset replacement_request_

-- Falha recuperavel continua ocupando a vaga ativa do pedido.
insert into public.order_cancellation_requests (order_id, requested_by, requester_role, motivo_solicitacao, idempotency_key)
values (:'failed_order_id'::uuid, :'buyer_id'::uuid, 'comprador', 'solicitacao para falha', gen_random_uuid())
returning id \gset failed_request_
update public.order_cancellation_requests
   set status = 'execucao_falhou', decided_by = :'admin_id'::uuid,
       erro_codigo = 'DEPENDENCIA_CASHBACK', erro_mensagem = 'dependencia ativa',
       decidido_em = now(), atualizado_em = now()
 where id = :'failed_request_id'::uuid;
insert into public.order_cancellation_request_attempts (request_id, operacao, idempotency_key, executor_id, resultado, erro_codigo, erro_mensagem)
values (:'failed_request_id'::uuid, 'aprovacao', gen_random_uuid(), :'admin_id'::uuid, 'falha', 'DEPENDENCIA_CASHBACK', 'dependencia ativa');

-- Aprovacao somente e consistente quando ja existe o cancelamento financeiro.
insert into public.order_cancellations (order_id, idempotency_key, status_anterior, executado_por, motivo)
values (:'seller_order_id'::uuid, gen_random_uuid(), 'confirmado', :'admin_id'::uuid, 'fixture de aprovacao')
returning id \gset cancellation_
update public.order_cancellation_requests
   set status = 'aprovada', decided_by = :'admin_id'::uuid,
       financial_execution_key = gen_random_uuid(), order_cancellation_id = :'cancellation_id'::uuid,
       decidido_em = now(), atualizado_em = now()
 where id = :'seller_request_id'::uuid;
insert into public.order_cancellation_request_attempts (request_id, operacao, idempotency_key, executor_id, resultado, order_cancellation_id)
values (:'seller_request_id'::uuid, 'aprovacao', gen_random_uuid(), :'admin_id'::uuid, 'sucesso', :'cancellation_id'::uuid);

select set_config('gemn.test.buyer_order', :'buyer_order_id', false);
select set_config('gemn.test.buyer_id', :'buyer_id', false);
select set_config('gemn.test.replacement_request', :'replacement_request_id', false);
select set_config('gemn.test.seller_request', :'seller_request_id', false);
select set_config('gemn.test.other_request', :'other_request_id', false);
select set_config('gemn.test.admin_id', :'admin_id', false);
select set_config('gemn.test.total_requests', count(*)::text, false) from public.order_cancellation_requests;
select set_config('gemn.test.total_attempts', count(*)::text, false) from public.order_cancellation_request_attempts;

do $$
declare v_failed boolean;
begin
  v_failed := false;
  begin
    insert into public.order_cancellation_requests (order_id, requested_by, requester_role, motivo_solicitacao, idempotency_key)
    values (current_setting('gemn.test.buyer_order')::uuid, current_setting('gemn.test.buyer_id')::uuid, 'comprador', 'duplicada', gen_random_uuid());
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'active request uniqueness was bypassed'; end if;
end $$;

do $$
declare v_failed boolean;
begin
  v_failed := false;
  begin
    update public.order_cancellation_requests
       set motivo_solicitacao = 'alterado'
     where id = current_setting('gemn.test.replacement_request')::uuid;
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'request immutable fields were changed'; end if;
end $$;

-- A partir daqui, o teste roda como authenticated para validar RLS e grants.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'buyer_id', true);
do $$
begin
  if (select count(*) from public.order_cancellation_requests) <> 5 then raise exception 'buyer request visibility mismatch'; end if;
  begin
    insert into public.order_cancellation_requests (order_id, requested_by, requester_role, motivo_solicitacao, idempotency_key)
    values (current_setting('gemn.test.other_request')::uuid, auth.uid(), 'comprador', 'write attempt', gen_random_uuid());
    raise exception 'authenticated insert was accepted';
  exception when others then null; end;
end $$;

select set_config('request.jwt.claim.sub', :'seller_user_id', true);
do $$
begin
  if (select count(*) from public.order_cancellation_requests) <> 3 then raise exception 'seller isolation mismatch'; end if;
end $$;

select set_config('request.jwt.claim.sub', :'other_user_id', true);
do $$
begin
  if (select count(*) from public.order_cancellation_requests) <> 0 then raise exception 'other user isolation mismatch'; end if;
end $$;

select set_config('request.jwt.claim.sub', :'admin_id', true);
do $$
begin
  if (select count(*) from public.order_cancellation_requests) <> current_setting('gemn.test.total_requests')::integer then raise exception 'admin visibility mismatch'; end if;
  if (select count(*) from public.order_cancellation_request_attempts) <> current_setting('gemn.test.total_attempts')::integer then raise exception 'attempt visibility mismatch'; end if;
end $$;

rollback;
select 'SPRINT24C_CANCELLATION_REQUESTS_MODEL_OK' as result;
