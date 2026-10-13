\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

-- Este teste recebe IDs de fixtures já existentes e não executa confirmação.
-- Variáveis obrigatórias: admin_id, buyer_id, pending_order_id,
-- expired_order_id, confirmed_order_id, cancelled_order_id.
select set_config('gemn.test.admin', :'admin_id', false);
select set_config('gemn.test.buyer', :'buyer_id', false);
select set_config('gemn.test.pending_order', :'pending_order_id', false);
select set_config('gemn.test.expired_order', :'expired_order_id', false);
select set_config('gemn.test.confirmed_order', :'confirmed_order_id', false);
select set_config('gemn.test.cancelled_order', :'cancelled_order_id', false);

-- A RPC fica disponível somente para authenticated. A checagem usa o catálogo
-- de privilégios real, sem depender de ocultação da interface.
do $$
declare
  v_function regprocedure := 'public.list_admin_pending_orders(integer, integer)'::regprocedure;
  v_columns text[];
begin
  if not has_function_privilege('authenticated', v_function, 'EXECUTE') then
    raise exception 'authenticated cannot execute administrative read RPC';
  end if;
  if has_function_privilege('anon', v_function, 'EXECUTE') then
    raise exception 'anon can execute administrative read RPC';
  end if;
  if has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'service_role can execute administrative read RPC';
  end if;

  select array_agg(argument_name order by ordinal_position)
    into v_columns
    from information_schema.parameters
   where specific_schema = 'public'
     and specific_name like 'list_admin_pending_orders(integer, integer)%'
     and parameter_mode = 'OUT';

  if v_columns is distinct from array[
    'order_id', 'buyer_id', 'item_id', 'listing_id', 'nome_item', 'tipo',
    'quantidade', 'forma_pagamento', 'total_real', 'total_gemn',
    'gemn_utilizado', 'valor_devido_real', 'criado_em', 'expira_em',
    'confirmavel'
  ] then
    raise exception 'administrative RPC returned an unexpected field contract: %', v_columns;
  end if;
end;
$$;

-- Usuário não autenticado deve ser recusado.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin
    perform * from public.list_admin_pending_orders(50, 0);
    raise exception 'unauthenticated access unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'unauthenticated access unexpectedly succeeded' then raise; end if;
  end;
end;
$$;
rollback;

-- Comprador autenticado não pode consultar pedidos de terceiros.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.buyer'), true);
do $$
begin
  begin
    perform * from public.list_admin_pending_orders(50, 0);
    raise exception 'buyer access unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'buyer access unexpectedly succeeded' then raise; end if;
  end;
end;
$$;
rollback;

-- Administrador vê somente pedidos pendentes, com vencimento sinalizado.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.admin'), true);
create temporary table gemn_admin_pending_result on commit drop as
  select * from public.list_admin_pending_orders(100, 0);

do $$
declare
  v_pending_status text;
  v_pending_count integer;
  v_expired_confirmable boolean;
  v_confirmed_count integer;
  v_cancelled_count integer;
  v_wallet_count_before bigint;
  v_wallet_transaction_count_before bigint;
  v_reservation_count_before bigint;
  v_wallet_count_after bigint;
  v_wallet_transaction_count_after bigint;
  v_reservation_count_after bigint;
begin
  select count(*) into v_wallet_count_before from public.wallets;
  select count(*) into v_wallet_transaction_count_before from public.wallet_transactions;
  select count(*) into v_reservation_count_before from public.gemn_reservations;

  select count(*) into v_pending_count
    from gemn_admin_pending_result
   where order_id = current_setting('gemn.test.pending_order')::uuid;
  if v_pending_count <> 1 then raise exception 'pending order missing from administrative queue'; end if;

  select confirmavel into v_expired_confirmable
    from gemn_admin_pending_result
   where order_id = current_setting('gemn.test.expired_order')::uuid;
  if v_expired_confirmable is distinct from false then raise exception 'expired order was marked confirmable'; end if;

  select count(*) into v_confirmed_count
    from gemn_admin_pending_result
   where order_id = current_setting('gemn.test.confirmed_order')::uuid;
  select count(*) into v_cancelled_count
    from gemn_admin_pending_result
   where order_id = current_setting('gemn.test.cancelled_order')::uuid;
  if v_confirmed_count <> 0 or v_cancelled_count <> 0 then raise exception 'non-pending order leaked into queue'; end if;

  select o.status into v_pending_status
    from public.orders as o
   where o.id = current_setting('gemn.test.pending_order')::uuid;
  if v_pending_status <> 'pendente' then raise exception 'fixture pending status changed'; end if;

  select count(*) into v_wallet_count_after from public.wallets;
  select count(*) into v_wallet_transaction_count_after from public.wallet_transactions;
  select count(*) into v_reservation_count_after from public.gemn_reservations;
  if v_wallet_count_before <> v_wallet_count_after
     or v_wallet_transaction_count_before <> v_wallet_transaction_count_after
     or v_reservation_count_before <> v_reservation_count_after then
    raise exception 'read RPC changed financial tables';
  end if;
end;
$$;
rollback;

-- Limites de paginação são rejeitados e não há alteração financeira.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.test.admin'), true);
do $$
begin
  begin
    perform * from public.list_admin_pending_orders(101, 0);
    raise exception 'invalid limit unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'invalid limit unexpectedly succeeded' then raise; end if;
  end;
end;
$$;
rollback;

select 'SPRINT43A_ADMIN_PENDING_ORDERS_OK';
