\set ON_ERROR_STOP on
begin;

create temporary table gemn_s22_fixture_ids (
  kind text primary key,
  id uuid not null
) on commit preserve rows;

select count(*) as fixture_user_count
  from auth.users
 where email in (:'buyer_a_email', :'buyer_b_email');

insert into public.categories (nome, ativo)
values (concat('GEMN_S22_', :'run_id', '_CATEGORY'), true)
returning id \gset category_

insert into public.seller_applications (
  user_id,
  tipo_membro,
  nome_negocio,
  cpf,
  telefone,
  categoria,
  descricao
)
select
  u.id,
  'empreendedor',
  concat('GEMN_S22_', :'run_id', '_SELLER_A'),
  concat('S22', :'run_id', '0001'),
  '11999990001',
  'categoria-teste',
  concat('Fixture Sprint 2.2 ', :'run_id', ' A')
from auth.users as u
where u.email = :'buyer_a_email'
returning id \gset application_a_

insert into public.seller_applications (
  user_id,
  tipo_membro,
  nome_negocio,
  cpf,
  telefone,
  categoria,
  descricao
)
select
  u.id,
  'empreendedor',
  concat('GEMN_S22_', :'run_id', '_SELLER_B'),
  concat('S22', :'run_id', '0002'),
  '11999990002',
  'categoria-teste',
  concat('Fixture Sprint 2.2 ', :'run_id', ' B')
from auth.users as u
where u.email = :'buyer_b_email'
returning id \gset application_b_

-- Usa o fluxo administrativo existente para criar os sellers, mas somente
-- durante a preparacao dos fixtures. Os testes de permissao usam JWTs reais.
update public.profiles as p
   set is_admin = true
 where p.id = (select id from auth.users where email = :'buyer_a_email');

select set_config(
  'request.jwt.claim.sub',
  (select id::text from auth.users where email = :'buyer_a_email'),
  true
);

select public.review_seller_application(
  :'application_a_id'::uuid,
  'aprovar',
  concat('Fixture Sprint 2.2 ', :'run_id')
);

select public.review_seller_application(
  :'application_b_id'::uuid,
  'aprovar',
  concat('Fixture Sprint 2.2 ', :'run_id')
);

update public.profiles as p
   set is_admin = false
 where p.id = (select id from auth.users where email = :'buyer_a_email');

insert into gemn_s22_fixture_ids (kind, id)
select 'seller_a', s.id
  from public.sellers as s
 where s.application_id = :'application_a_id'::uuid;

insert into gemn_s22_fixture_ids (kind, id)
select 'seller_b', s.id
  from public.sellers as s
 where s.application_id = :'application_b_id'::uuid;

insert into public.listings (
  seller_id,
  category_id,
  tipo,
  nome,
  descricao,
  preco_real,
  aceita_gemn,
  preco_gemn,
  status
)
values (
  (select id from gemn_s22_fixture_ids where kind = 'seller_a'),
  :'category_id'::uuid,
  'produto',
  concat('GEMN_S22_', :'run_id', '_ACTIVE_REAL'),
  'Fixture ativo para teste de preco no servidor.',
  12.50,
  false,
  null,
  'ativo'
)
returning id \gset listing_active_real_

insert into public.listings (
  seller_id,
  category_id,
  tipo,
  nome,
  descricao,
  preco_real,
  aceita_gemn,
  preco_gemn,
  status
)
values (
  (select id from gemn_s22_fixture_ids where kind = 'seller_a'),
  :'category_id'::uuid,
  'produto',
  concat('GEMN_S22_', :'run_id', '_ACTIVE_GEMN'),
  'Fixture ativo para teste de pagamento GEMN.',
  20.00,
  true,
  7.50,
  'ativo'
)
returning id \gset listing_active_gemn_

insert into public.listings (
  seller_id,
  category_id,
  tipo,
  nome,
  descricao,
  preco_real,
  aceita_gemn,
  preco_gemn,
  status
)
values (
  (select id from gemn_s22_fixture_ids where kind = 'seller_a'),
  :'category_id'::uuid,
  'produto',
  concat('GEMN_S22_', :'run_id', '_INACTIVE'),
  'Fixture inativo para teste de rejeicao.',
  9.99,
  false,
  null,
  'inativo'
)
returning id \gset listing_inactive_

insert into public.listings (
  seller_id,
  category_id,
  tipo,
  nome,
  descricao,
  preco_real,
  aceita_gemn,
  preco_gemn,
  status
)
values (
  (select id from gemn_s22_fixture_ids where kind = 'seller_b'),
  :'category_id'::uuid,
  'produto',
  concat('GEMN_S22_', :'run_id', '_SUSPENDED_SELLER'),
  'Fixture de seller suspenso.',
  15.00,
  false,
  null,
  'ativo'
)
returning id \gset listing_suspended_seller_

update public.sellers
   set status = 'suspenso'
 where id = (select id from gemn_s22_fixture_ids where kind = 'seller_b');

commit;

\echo FIXTURE_READY
select 'buyer_a' as kind, id, email from auth.users where email = :'buyer_a_email'
union all
select 'buyer_b', id, email from auth.users where email = :'buyer_b_email'
union all
select 'category', :'category_id'::uuid, null
union all
select 'application_a', :'application_a_id'::uuid, null
union all
select 'application_b', :'application_b_id'::uuid, null
union all
select kind, id, null from gemn_s22_fixture_ids
union all
select 'listing_active_real', :'listing_active_real_id'::uuid, null
union all
select 'listing_active_gemn', :'listing_active_gemn_id'::uuid, null
union all
select 'listing_inactive', :'listing_inactive_id'::uuid, null
union all
select 'listing_suspended_seller', :'listing_suspended_seller_id'::uuid, null;
