\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'assertion failed: %', p_message;
  end if;
end;
$$;

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

begin;

-- A preparação é confirmada para que duas sessões independentes possam testar
-- a serialização por seller. Os dados usam usuários criados exclusivamente
-- pelo runner desta suíte.
insert into public.seller_applications (
  user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao, status
)
values
  (
    :'user_a_id'::uuid, 'empreendedor',
    concat('GEMN_S24B_RULES_', :'run_id', '_A'),
    concat('S24BR', :'run_id', 'A'), '11999990001', 'teste',
    'Fixture de regras de cashback A', 'aprovada'
  ),
  (
    :'user_b_id'::uuid, 'empreendedor',
    concat('GEMN_S24B_RULES_', :'run_id', '_B'),
    concat('S24BR', :'run_id', 'B'), '11999990002', 'teste',
    'Fixture de regras de cashback B', 'aprovada'
  );

insert into public.sellers (
  user_id, application_id, tipo_membro, nome_negocio, descricao, telefone
)
select sa.user_id, sa.id, sa.tipo_membro, sa.nome_negocio, sa.descricao, sa.telefone
  from public.seller_applications as sa
 where sa.nome_negocio in (
   concat('GEMN_S24B_RULES_', :'run_id', '_A'),
   concat('GEMN_S24B_RULES_', :'run_id', '_B')
 );

commit;

begin;

-- Carteira: criação, retry idempotente e isolamento.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_a_id', true);
select * from public.ensure_my_wallet();
select * from public.ensure_my_wallet();
select pg_temp.assert_true(
  (select count(*) = 1 from public.wallets where user_id = :'user_a_id'::uuid),
  'ensure_my_wallet must create exactly one wallet'
);

select set_config('request.jwt.claim.sub', :'user_b_id', true);
select * from public.ensure_my_wallet();

select set_config('request.jwt.claim.sub', :'user_a_id', true);
select pg_temp.assert_true(
  (select count(*) = 1 from public.wallets),
  'wallet RLS must hide the other user wallet'
);
select pg_temp.assert_rejected(format(
  'insert into public.wallets (user_id) values (%L::uuid)', :'user_b_id'
));
select pg_temp.assert_rejected(format(
  'update public.wallets set saldo_disponivel = 1.00 where user_id = %L::uuid', :'user_a_id'
));

rollback;

-- Regras: versionamento, limites e histórico.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_a_id', true);

select * from public.set_seller_cashback(0.00, gen_random_uuid());
select * from public.set_seller_cashback(5.00, gen_random_uuid());
select * from public.set_seller_cashback(20.00, gen_random_uuid());
select * from public.set_seller_cashback(4.00, '00000000-0000-0000-0000-000000000024');
select * from public.set_seller_cashback(4.00, '00000000-0000-0000-0000-000000000024');

select pg_temp.assert_rejected(
  'select * from public.set_seller_cashback(-0.01, gen_random_uuid())'
);
select pg_temp.assert_rejected(
  'select * from public.set_seller_cashback(20.01, gen_random_uuid())'
);
select pg_temp.assert_rejected(
  'select * from public.set_seller_cashback(5.123, gen_random_uuid())'
);

select pg_temp.assert_true(
  (select count(*) = 4
     from public.cashback_rules cr
     join public.sellers s on s.id = cr.seller_id
    where s.user_id = :'user_a_id'::uuid),
  'cashback history must preserve all previous rules'
);
select pg_temp.assert_true(
  (select count(*) = 1
     from public.cashback_rules cr
     join public.sellers s on s.id = cr.seller_id
    where s.user_id = :'user_a_id'::uuid
      and cr.vigente_ate is null
      and cr.percentual = 4.00),
  'only the latest cashback rule must be current'
);

-- O vendedor B cria sua própria regra. O vendedor A não pode alterar a regra
-- de B por escrita direta nem por parâmetro oculto da RPC.
select set_config('request.jwt.claim.sub', :'user_b_id', true);
select * from public.set_seller_cashback(7.00, gen_random_uuid());
select set_config('request.jwt.claim.sub', :'user_a_id', true);
select pg_temp.assert_rejected(format($sql$
  update public.cashback_rules
     set percentual = 8.00
   where seller_id = (select id from public.sellers where user_id = %L::uuid)
$sql$, :'user_b_id'));
select set_config('request.jwt.claim.sub', :'user_b_id', true);
select pg_temp.assert_true(
  (select count(*) = 1
     from public.cashback_rules cr
     join public.sellers s on s.id = cr.seller_id
    where s.user_id = :'user_b_id'::uuid
      and cr.percentual = 7.00),
  'seller A must not change seller B rule'
);
select set_config('request.jwt.claim.sub', :'user_a_id', true);

commit;

-- Seller suspenso não pode alterar sua configuração. O rollback restaura o
-- status original e preserva as regras já versionadas para o teste concorrente.
begin;
reset role;
update public.sellers
   set status = 'suspenso'
 where user_id = :'user_b_id'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_b_id', true);
select pg_temp.assert_rejected(
  'select * from public.set_seller_cashback(9.00, gen_random_uuid())'
);
rollback;

\echo SPRINT24B_WALLET_CASHBACK_RULES_SEQUENTIAL_OK
