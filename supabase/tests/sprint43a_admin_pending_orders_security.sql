\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

-- Teste isolado: não cria fixtures, não altera dados e não executa confirmação.
-- Variáveis obrigatórias: admin_id e buyer_id.
select set_config('gemn.security.admin', :'admin_id', false) as configured \gset
select set_config('gemn.security.buyer', :'buyer_id', false) as configured \gset

-- O contrato de execução é restrito ao papel authenticated.
do $$
declare
  v_function regprocedure := 'public.list_admin_pending_orders(integer, integer)'::regprocedure;
begin
  if not has_function_privilege('authenticated', v_function, 'EXECUTE') then
    raise exception 'authenticated cannot execute list_admin_pending_orders';
  end if;
  if has_function_privilege('anon', v_function, 'EXECUTE') then
    raise exception 'anon can execute list_admin_pending_orders';
  end if;
  if has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'service_role can execute list_admin_pending_orders';
  end if;
end;
$$;

-- A chamada com o papel anon deve ser rejeitada pelo privilégio da função.
begin;
set local role anon;
do $$
begin
  begin
    perform * from public.list_admin_pending_orders(50, 0);
    raise exception 'anon invocation unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'anon invocation unexpectedly succeeded' then raise; end if;
  end;
end;
$$;
rollback;

-- O papel service_role também não recebe EXECUTE nesta RPC de leitura.
begin;
set local role service_role;
do $$
begin
  begin
    perform * from public.list_admin_pending_orders(50, 0);
    raise exception 'service_role invocation unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'service_role invocation unexpectedly succeeded' then raise; end if;
  end;
end;
$$;
rollback;

-- Usuário não autenticado: authenticated sem claim sub deve ser rejeitado pela RPC.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin
    perform * from public.list_admin_pending_orders(50, 0);
    raise exception 'unauthenticated invocation unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'unauthenticated invocation unexpectedly succeeded' then raise; end if;
  end;
end;
$$;
rollback;

-- Comprador comum autenticado não pode consultar a fila administrativa.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.security.buyer'), true);
do $$
begin
  begin
    perform * from public.list_admin_pending_orders(50, 0);
    raise exception 'buyer invocation unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'buyer invocation unexpectedly succeeded' then raise; end if;
  end;
end;
$$;
rollback;

-- Administrador consulta a fila e o retorno possui exatamente o contrato público.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.security.admin'), true);
create temporary table gemn_security_pending_result on commit drop as
  select * from public.list_admin_pending_orders(100, 0);

do $$
declare
  v_columns text[];
  v_count integer;
  v_confirmable_count integer;
begin
  select array_agg(column_name order by ordinal_position)
    into v_columns
    from (
      select attname as column_name, attnum as ordinal_position
        from pg_catalog.pg_attribute
       where attrelid = 'pg_temp.gemn_security_pending_result'::regclass
         and attnum > 0
         and not attisdropped
    ) as columns;

  if v_columns is distinct from array[
    'order_id', 'buyer_id', 'item_id', 'listing_id', 'nome_item', 'tipo',
    'quantidade', 'forma_pagamento', 'total_real', 'total_gemn',
    'gemn_utilizado', 'valor_devido_real', 'criado_em', 'expira_em',
    'confirmavel'
  ] then
    raise exception 'unexpected RPC field contract: %', v_columns;
  end if;

  select count(*) into v_count from gemn_security_pending_result;
  if v_count < 1 then raise exception 'expected one existing pending order'; end if;

  select count(*) into v_confirmable_count
    from gemn_security_pending_result
   where confirmavel;
  if v_confirmable_count <> v_count then
    raise exception 'existing pending order was not confirmable';
  end if;
end;
$$;
rollback;

-- Parâmetros inválidos devem ser rejeitados sem qualquer alteração.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.security.admin'), true);
do $$
begin
  begin
    perform * from public.list_admin_pending_orders(0, 0);
    raise exception 'zero limit unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'zero limit unexpectedly succeeded' then raise; end if;
  end;
  begin
    perform * from public.list_admin_pending_orders(101, 0);
    raise exception 'limit above maximum unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'limit above maximum unexpectedly succeeded' then raise; end if;
  end;
  begin
    perform * from public.list_admin_pending_orders(50, -1);
    raise exception 'negative offset unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'negative offset unexpectedly succeeded' then raise; end if;
  end;
end;
$$;
rollback;

-- A RPC é somente leitura: os snapshots de pedidos, carteiras, reservas e ledger
-- permanecem iguais dentro da transação que executa a consulta administrativa.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gemn.security.admin'), true);
do $$
declare
  v_orders_before bigint;
  v_wallets_before bigint;
  v_transactions_before bigint;
  v_reservations_before bigint;
  v_orders_after bigint;
  v_wallets_after bigint;
  v_transactions_after bigint;
  v_reservations_after bigint;
begin
  select count(*) into v_orders_before from public.orders;
  select count(*) into v_wallets_before from public.wallets;
  select count(*) into v_transactions_before from public.wallet_transactions;
  select count(*) into v_reservations_before from public.gemn_reservations;
  perform * from public.list_admin_pending_orders(50, 0);
  select count(*) into v_orders_after from public.orders;
  select count(*) into v_wallets_after from public.wallets;
  select count(*) into v_transactions_after from public.wallet_transactions;
  select count(*) into v_reservations_after from public.gemn_reservations;
  if v_orders_before <> v_orders_after
     or v_wallets_before <> v_wallets_after
     or v_transactions_before <> v_transactions_after
     or v_reservations_before <> v_reservations_after then
    raise exception 'administrative read changed financial state';
  end if;
end;
$$;
rollback;

select 'SPRINT43A_ADMIN_PENDING_ORDERS_SECURITY_OK';
