\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_rejected(p_sql text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'expected statement to be rejected: %', p_sql;
exception
  when others then
    if sqlerrm like 'expected statement to be rejected:%' then
      raise;
    end if;
end;
$$;

-- Fixtures mínimos: o runner cria os usuários via Auth; o restante é criado
-- pelo postgres dentro desta transação e revertido ao final.
insert into public.seller_applications (
  user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao
)
values (
  :'user_a_id'::uuid,
  'empreendedor',
  concat('GEMN_S24B_', :'run_id', '_SELLER'),
  concat('S24B', :'run_id'),
  '11999990001',
  'categoria-teste',
  'Fixture Sprint 2.4B.'
)
returning id \gset application_

insert into public.sellers (
  user_id, application_id, tipo_membro, nome_negocio, descricao, telefone
)
values (
  :'user_a_id'::uuid,
  :'application_id'::uuid,
  'empreendedor',
  concat('GEMN_S24B_', :'run_id', '_SELLER'),
  'Fixture Sprint 2.4B.',
  '11999990001'
)
returning id \gset seller_

insert into public.categories (nome, ativo)
values (concat('GEMN_S24B_', :'run_id', '_CATEGORY'), true)
returning id \gset category_

insert into public.listings (
  seller_id, category_id, tipo, nome, descricao,
  preco_real, aceita_gemn, preco_gemn, status
)
values (
  :'seller_id'::uuid,
  :'category_id'::uuid,
  'produto',
  concat('GEMN_S24B_', :'run_id', '_LISTING'),
  'Fixture de lote de cashback.',
  10.00,
  false,
  null,
  'ativo'
)
returning id \gset listing_

insert into public.orders (
  buyer_id, idempotency_key, status, forma_pagamento, total_real, total_gemn
)
values (
  :'user_b_id'::uuid, gen_random_uuid(), 'pendente', 'real', 10.00, null
)
returning id \gset order_

insert into public.order_items (
  order_id, listing_id, seller_id, nome_item, tipo, quantidade,
  preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn
)
values (
  :'order_id'::uuid,
  :'listing_id'::uuid,
  :'seller_id'::uuid,
  concat('GEMN_S24B_', :'run_id', '_LISTING'),
  'produto',
  1,
  10.00,
  null,
  10.00,
  null
)
returning id \gset item_

insert into public.wallets (user_id)
values (:'user_a_id'::uuid)
returning id \gset wallet_a_

insert into public.wallets (user_id)
values (:'user_b_id'::uuid)
returning id \gset wallet_b_

select 'PASS' as result, 'one wallet per user' as test
where (select count(*) from public.wallets where user_id = :'user_a_id'::uuid) = 1;

select pg_temp.assert_rejected(
  format('insert into public.wallets (user_id) values (%L::uuid)', :'user_a_id')
);

select 'PASS' as result, 'wallet balance constraints' as test
where exists (
  select 1 from pg_constraint
   where conname in (
     'wallets_saldo_disponivel_check',
     'wallets_saldo_reservado_check',
     'wallets_saldo_a_recuperar_check'
   )
   group by conrelid
  having count(*) = 3
);

insert into public.cashback_lots (
  wallet_id, order_id, order_item_id, seller_origem_id,
  valor_original, valor_disponivel, status
)
values (
  :'wallet_a_id'::uuid,
  :'order_id'::uuid,
  :'item_id'::uuid,
  :'seller_id'::uuid,
  10.00,
  10.00,
  'disponivel'
)
returning id \gset lot_

select 'PASS' as result, 'cashback lot FIFO index' as test
where exists (
  select 1 from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'cashback_lots_fifo_idx'
);

select pg_temp.assert_rejected(format($sql$
  insert into public.cashback_lots (
    wallet_id, order_id, order_item_id, seller_origem_id,
    valor_original, valor_disponivel, status
  ) values (%L::uuid, %L::uuid, %L::uuid, %L::uuid, 11.00, 11.00, 'disponivel')
$sql$, :'wallet_a_id', :'order_id', :'item_id', :'seller_id'));

insert into public.wallet_transactions (
  wallet_id, order_id, cashback_lot_id, tipo, valor,
  saldo_disponivel_apos, saldo_reservado_apos, saldo_a_recuperar_apos,
  idempotency_key, seller_origem_id, descricao
)
values (
  :'wallet_a_id'::uuid,
  :'order_id'::uuid,
  :'lot_id'::uuid,
  'cashback_credito',
  10.00,
  10.00,
  0.00,
  0.00,
  gen_random_uuid(),
  :'seller_id'::uuid,
  'Fixture cashback'
);

select pg_temp.assert_rejected(format($sql$
  update public.wallet_transactions
     set descricao = 'alterado'
   where wallet_id = %L::uuid
$sql$, :'wallet_a_id'));
select pg_temp.assert_rejected(format($sql$
  delete from public.wallet_transactions
   where wallet_id = %L::uuid
$sql$, :'wallet_a_id'));

-- RLS e grants: o usuário A só pode ler a própria carteira, lote e ledger;
-- nenhum caminho direto de escrita é concedido.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_a_id', true);

select 'PASS' as result, 'RLS wallet isolation' as test
where (select count(*) from public.wallets) = 1;
select 'PASS' as result, 'RLS lot isolation' as test
where (select count(*) from public.cashback_lots) = 1;
select 'PASS' as result, 'RLS transaction isolation' as test
where (select count(*) from public.wallet_transactions) = 1;

select pg_temp.assert_rejected(
  format('insert into public.wallets (user_id) values (%L::uuid)', :'user_a_id')
);
select pg_temp.assert_rejected(format($sql$
  update public.wallets set saldo_disponivel = 99.00
   where user_id = %L::uuid
$sql$, :'user_a_id'));
select pg_temp.assert_rejected(format($sql$
  delete from public.cashback_lots
   where wallet_id = %L::uuid
$sql$, :'wallet_a_id'));

reset role;

select 'PASS' as result, 'financial tables deny direct writes' as test
where not has_table_privilege('authenticated', 'public.wallets', 'INSERT')
  and not has_table_privilege('authenticated', 'public.wallets', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.wallet_transactions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.wallet_transactions', 'DELETE')
  and not has_table_privilege('authenticated', 'public.cashback_lots', 'INSERT');

rollback;

\echo SPRINT24B_WALLET_PERSISTENCE_OK
