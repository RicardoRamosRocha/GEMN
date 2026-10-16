-- Sprint 6.1-D3-R1: testes financeiros funcionais em Supabase local isolado.
-- Variaveis obrigatorias: run_id, buyer_a_email, buyer_b_email.
\set ON_ERROR_STOP on

select id as buyer_a_id from auth.users where email=:'buyer_a_email' \gset
select id as buyer_b_id from auth.users where email=:'buyer_b_email' \gset
select id as seller_a_id from public.sellers where user_id=:'buyer_a_id'::uuid \gset
select id as category_id from public.categories where nome=concat('GEMN_S22_',:'run_id','_CATEGORY') \gset
select id as listing_real_id from public.listings where nome=concat('GEMN_S22_',:'run_id','_ACTIVE_REAL') \gset
select id as listing_gemn_id from public.listings where nome=concat('GEMN_S22_',:'run_id','_ACTIVE_GEMN') \gset

begin;
update public.sellers set aceita_gemn=true where id=:'seller_a_id'::uuid;
insert into public.cashback_rules(seller_id,percentual,idempotency_key,vigente_desde,criado_por)
values (:'seller_a_id'::uuid,10,'31000000-0000-0000-0000-000000000001'::uuid,clock_timestamp(),:'buyer_a_id'::uuid);
insert into public.wallets(user_id,saldo_disponivel,saldo_reservado,saldo_a_recuperar)
values (:'buyer_a_id'::uuid,30,0,0),(:'buyer_b_id'::uuid,50,0,0);
insert into public.listings(seller_id,category_id,tipo,nome,descricao,preco_real,aceita_gemn,preco_gemn,status)
values (:'seller_a_id'::uuid,:'category_id'::uuid,'produto',concat('D3_',:'run_id','_SECOND'),'second',8,true,3,'ativo') returning id \gset listing_second_
insert into public.listings(seller_id,category_id,tipo,nome,descricao,preco_real,aceita_gemn,preco_gemn,status)
values (:'seller_a_id'::uuid,:'category_id'::uuid,'produto',concat('D3_',:'run_id','_CENT_A'),'cent a',.10,true,.10,'ativo') returning id \gset listing_cent_a_
insert into public.listings(seller_id,category_id,tipo,nome,descricao,preco_real,aceita_gemn,preco_gemn,status)
values (:'seller_a_id'::uuid,:'category_id'::uuid,'produto',concat('D3_',:'run_id','_CENT_B'),'cent b',.10,true,.10,'ativo') returning id \gset listing_cent_b_
insert into public.listings(seller_id,category_id,tipo,nome,descricao,preco_real,aceita_gemn,preco_gemn,status)
values (:'seller_a_id'::uuid,:'category_id'::uuid,'produto',concat('D3_',:'run_id','_FIFO_A'),'fifo a',100,true,100,'ativo') returning id \gset listing_fifo_a_
insert into public.listings(seller_id,category_id,tipo,nome,descricao,preco_real,aceita_gemn,preco_gemn,status)
values (:'seller_a_id'::uuid,:'category_id'::uuid,'produto',concat('D3_',:'run_id','_FIFO_B'),'fifo b',400,true,400,'ativo') returning id \gset listing_fifo_b_
commit;

select set_config('gemn.d3.listing_gemn', :'listing_gemn_id', false),
       set_config('gemn.d3.listing_second', :'listing_second_id', false),
       set_config('gemn.d3.listing_cent_a', :'listing_cent_a_id', false),
       set_config('gemn.d3.listing_cent_b', :'listing_cent_b_id', false);

select nome,tipo,preco_real,preco_gemn from public.listings where id=:'listing_fifo_a_id'::uuid \gset fifo_a_
select nome,tipo,preco_real,preco_gemn from public.listings where id=:'listing_fifo_b_id'::uuid \gset fifo_b_

begin;
insert into public.orders(id,buyer_id,idempotency_key,status,forma_pagamento,total_real,total_gemn,gemn_utilizado,valor_devido_real)
values ('41000000-0000-0000-0000-000000000001'::uuid,:'buyer_a_id'::uuid,'41000000-0000-0000-0000-000000000001'::uuid,'pendente','real',20,7.5,0,20),
       ('41000000-0000-0000-0000-000000000002'::uuid,:'buyer_b_id'::uuid,'41000000-0000-0000-0000-000000000002'::uuid,'pendente','real',100,100,0,100),
       ('41000000-0000-0000-0000-000000000003'::uuid,:'buyer_b_id'::uuid,'41000000-0000-0000-0000-000000000003'::uuid,'pendente','real',400,400,0,400);
insert into public.order_items(id,order_id,listing_id,seller_id,nome_item,tipo,quantidade,preco_real_unitario,preco_gemn_unitario,subtotal_real,subtotal_gemn,cashback_percentual,cashback_previsto,gemn_utilizado_item)
values ('51000000-0000-0000-0000-000000000001'::uuid,'41000000-0000-0000-0000-000000000001'::uuid,:'listing_gemn_id'::uuid,:'seller_a_id'::uuid,concat('GEMN_S22_',:'run_id','_ACTIVE_GEMN'),'produto',1,20,7.5,20,7.5,10,2,0),
       ('51000000-0000-0000-0000-000000000002'::uuid,'41000000-0000-0000-0000-000000000002'::uuid,:'listing_fifo_a_id'::uuid,:'seller_a_id'::uuid,:'fifo_a_nome',:'fifo_a_tipo',1,:'fifo_a_preco_real',:'fifo_a_preco_gemn',:'fifo_a_preco_real',:'fifo_a_preco_gemn',10,10,0),
       ('51000000-0000-0000-0000-000000000003'::uuid,'41000000-0000-0000-0000-000000000003'::uuid,:'listing_fifo_b_id'::uuid,:'seller_a_id'::uuid,:'fifo_b_nome',:'fifo_b_tipo',1,:'fifo_b_preco_real',:'fifo_b_preco_gemn',:'fifo_b_preco_real',:'fifo_b_preco_gemn',10,40,0);
insert into public.cashback_lots(wallet_id,order_id,order_item_id,seller_origem_id,valor_original,valor_disponivel,valor_reservado,valor_consumido,valor_a_recuperar,status)
select w.id,x.order_id,x.order_item_id,:'seller_a_id'::uuid,x.valor,x.valor,0,0,0,'disponivel'
from public.wallets w cross join (values ('41000000-0000-0000-0000-000000000001'::uuid,'51000000-0000-0000-0000-000000000001'::uuid,30),('41000000-0000-0000-0000-000000000002'::uuid,'51000000-0000-0000-0000-000000000002'::uuid,10),('41000000-0000-0000-0000-000000000003'::uuid,'51000000-0000-0000-0000-000000000003'::uuid,40)) x(order_id,order_item_id,valor)
where w.user_id=case when x.order_id='41000000-0000-0000-0000-000000000001'::uuid then :'buyer_a_id'::uuid else :'buyer_b_id'::uuid end;
commit;

begin;
set role authenticated;
select set_config('request.jwt.claim.sub',:'buyer_a_id',true);
select * from public.create_order_from_items(jsonb_build_array(jsonb_build_object('listing_id',:'listing_gemn_id'::uuid,'quantidade',1),jsonb_build_object('listing_id',:'listing_second_id'::uuid,'quantidade',3)),10,'61000000-0000-0000-0000-000000000001'::uuid);
commit;
reset role;
select id as partial_order_id from public.orders where idempotency_key='61000000-0000-0000-0000-000000000001'::uuid \gset
select set_config('gemn.d3.partial_order', :'partial_order_id', false);

begin;
set role authenticated;
select set_config('request.jwt.claim.sub',:'buyer_a_id',true);
do $$
declare v_failed boolean:=false; v_rows integer; v_orders integer;
begin
  select count(*),count(distinct order_id) into v_rows,v_orders from public.create_order_from_items(jsonb_build_array(jsonb_build_object('listing_id',current_setting('gemn.d3.listing_gemn')::uuid,'quantidade',1),jsonb_build_object('listing_id',current_setting('gemn.d3.listing_second')::uuid,'quantidade',3)),10,'61000000-0000-0000-0000-000000000001'::uuid);
  if v_rows<>2 or v_orders<>1 then raise exception 'retry identico falhou'; end if;
  begin
    perform * from public.create_order_from_items(jsonb_build_array(jsonb_build_object('listing_id',current_setting('gemn.d3.listing_gemn')::uuid,'quantidade',2)),10,'61000000-0000-0000-0000-000000000001'::uuid);
  exception when sqlstate 'P0001' then v_failed:=true; end;
  if not v_failed then raise exception 'retry divergente aceito'; end if;
end
$$;
commit;
reset role;

update public.profiles set is_admin=true where id=:'buyer_a_id'::uuid;
begin;
set role authenticated;
select set_config('request.jwt.claim.sub',:'buyer_b_id',true);
select * from public.create_order_from_items(jsonb_build_array(jsonb_build_object('listing_id',:'listing_gemn_id'::uuid,'quantidade',1)),20,'61000000-0000-0000-0000-000000000002'::uuid);
select * from public.create_order_from_items(jsonb_build_array(jsonb_build_object('listing_id',:'listing_cent_a_id'::uuid,'quantidade',1),jsonb_build_object('listing_id',:'listing_cent_b_id'::uuid,'quantidade',1)),.15,'61000000-0000-0000-0000-000000000003'::uuid);
commit;
reset role;
select id as full_order_id from public.orders where idempotency_key='61000000-0000-0000-0000-000000000002'::uuid \gset
select id as cents_order_id from public.orders where idempotency_key='61000000-0000-0000-0000-000000000003'::uuid \gset
select set_config('gemn.d3.full_order', :'full_order_id', false),
       set_config('gemn.d3.cents_order', :'cents_order_id', false);

begin;
set role authenticated;
select set_config('request.jwt.claim.sub',:'buyer_a_id',true);
select * from public.confirm_order_payment(current_setting('gemn.d3.partial_order')::uuid,'62000000-0000-0000-0000-000000000001'::uuid);
select * from public.cancel_confirmed_order(current_setting('gemn.d3.partial_order')::uuid,'63000000-0000-0000-0000-000000000001'::uuid,'D3-R1 multi-item');
commit;
reset role;

begin;
set role authenticated;
select set_config('request.jwt.claim.sub',:'buyer_b_id',true);
select * from public.cancel_pending_order(current_setting('gemn.d3.cents_order')::uuid,'64000000-0000-0000-0000-000000000001'::uuid);
commit;
reset role;

begin;
set role authenticated;
select set_config('request.jwt.claim.sub',:'buyer_b_id',true);
select * from public.create_order_from_items(jsonb_build_array(jsonb_build_object('listing_id',:'listing_cent_a_id'::uuid,'quantidade',1)),.05,'66000000-0000-0000-0000-000000000001'::uuid);
commit;
reset role;
select id as expire_order_id from public.orders where idempotency_key='66000000-0000-0000-0000-000000000001'::uuid \gset
select set_config('gemn.d3.expire_order', :'expire_order_id', false);
update public.orders set criado_em=clock_timestamp()-interval '25 hours' where id=:'expire_order_id'::uuid;
begin;
set role service_role;
select public.expire_pending_orders(100);
commit;
reset role;

begin;
set role authenticated;
select set_config('request.jwt.claim.sub',:'buyer_b_id',true);
select * from public.create_order(:'listing_real_id'::uuid,1,'real','67000000-0000-0000-0000-000000000001'::uuid,0);
commit;
reset role;

do $$
declare v_count integer; v_sum numeric; v_cash numeric; v_fifo text;
begin
  if (select count(*) from public.order_items where order_id=current_setting('gemn.d3.partial_order')::uuid)<>2 then raise exception 'parcial sem dois itens'; end if;
  select count(*),round(sum(a.valor_gemn),2),string_agg(a.ordem_fifo::text,',' order by a.ordem_fifo)
    into v_count,v_sum,v_fifo
    from public.gemn_reservation_allocations a
    join public.gemn_reservations r on r.id=a.reservation_id
   where r.order_id=current_setting('gemn.d3.full_order')::uuid;
  if v_count<>2 or v_sum<>20 or v_fifo<>'1,2' then raise exception 'FIFO multi-lote inconsistente'; end if;
  if (select round(sum(gemn_utilizado_item),2) from public.order_items where order_id=current_setting('gemn.d3.partial_order')::uuid)<>10 then raise exception 'GEMN parcial inconsistente'; end if;
  if (select round(sum(gemn_utilizado_item),2) from public.order_items where order_id=current_setting('gemn.d3.full_order')::uuid)<>20 then raise exception 'GEMN integral inconsistente'; end if;
  if (select round(sum(gemn_utilizado_item),2) from public.order_items where order_id=current_setting('gemn.d3.cents_order')::uuid)<>.15 then raise exception 'centavos inconsistentes'; end if;
  select round(sum(cashback_previsto),2) into v_cash from public.order_items where order_id=current_setting('gemn.d3.partial_order')::uuid;
  if v_cash<>3.40 then raise exception 'cashback por item inconsistente'; end if;
  if (select status from public.orders where id=current_setting('gemn.d3.partial_order')::uuid)<>'cancelado' then raise exception 'cancelamento confirmado falhou'; end if;
  if (select status from public.gemn_reservations where order_id=current_setting('gemn.d3.partial_order')::uuid)<>'estornada' then raise exception 'reserva confirmada nao estornada'; end if;
  if (select status from public.orders where id=current_setting('gemn.d3.expire_order')::uuid)<>'expirado' then raise exception 'expiracao falhou'; end if;
  if (select status from public.gemn_reservations where order_id=current_setting('gemn.d3.expire_order')::uuid)<>'expirada' then raise exception 'reserva expirada falhou'; end if;
  if (select count(*) from public.order_items oi join public.orders o on o.id=oi.order_id where o.idempotency_key='67000000-0000-0000-0000-000000000001'::uuid)<>1 then raise exception 'regressao individual falhou'; end if;
  if exists (select 1 from public.wallets where saldo_disponivel<0 or saldo_reservado<0 or saldo_a_recuperar<0) then raise exception 'saldo negativo'; end if;
  if exists (select 1 from public.order_items where cashback_previsto is distinct from round((subtotal_real-gemn_utilizado_item)*cashback_percentual/100,2)) then raise exception 'cashback divergente'; end if;
  raise notice 'SPRINT61D3R1_FINANCIAL_OK';
end
$$;
