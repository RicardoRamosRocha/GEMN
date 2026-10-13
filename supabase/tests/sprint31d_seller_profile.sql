-- GEMN Sprint 3.1-D Etapa 3: contrato da RPC de perfil comercial.
-- Executar somente em banco local/isolado apos as migrations, com psql vars:
-- seller_a_user_id, seller_b_user_id, buyer_id, run_id.

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin;

insert into public.profiles (id, is_admin)
values
  (:'seller_a_user_id'::uuid, false),
  (:'seller_b_user_id'::uuid, false),
  (:'buyer_id'::uuid, false)
on conflict (id) do update set is_admin = excluded.is_admin;

insert into public.seller_applications (user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao)
values
  (:'seller_a_user_id'::uuid, 'empreendedor', concat('S31D_', :'run_id', '_A'), concat('S31D', :'run_id', 'A'), '11999990001', 'teste', 'descricao A'),
  (:'seller_b_user_id'::uuid, 'empreendedor', concat('S31D_', :'run_id', '_B'), concat('S31D', :'run_id', 'B'), '11999990002', 'teste', 'descricao B');

insert into public.sellers (user_id, application_id, tipo_membro, nome_negocio, descricao, telefone, status)
select sa.user_id, sa.id, sa.tipo_membro, sa.nome_negocio, sa.descricao, sa.telefone, 'ativo'
  from public.seller_applications as sa
 where sa.user_id in (:'seller_a_user_id'::uuid, :'seller_b_user_id'::uuid)
   and sa.nome_negocio like concat('S31D_', :'run_id', '_%');

select id as seller_a_id from public.sellers where user_id = :'seller_a_user_id'::uuid and nome_negocio like concat('S31D_', :'run_id', '_A') \gset
select id as seller_b_id from public.sellers where user_id = :'seller_b_user_id'::uuid and nome_negocio like concat('S31D_', :'run_id', '_B') \gset
select application_id as seller_a_application_id from public.sellers where id = :'seller_a_id'::uuid \gset
select application_id as seller_b_application_id from public.sellers where id = :'seller_b_id'::uuid \gset

-- Proprietario ativo atualiza somente os dois campos comerciais e normaliza espacos.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'seller_a_user_id', true);
select * from public.set_seller_profile('  Loja   A  ', '  Nova   descricao  ') \gset updated_
select 1 / case
  when :'updated_nome_negocio' = 'Loja A'
   and :'updated_descricao' = 'Nova descricao'
  then 1
  else 0
end as normalized_result;

-- Descricao opcional vira vazio, respeitando sellers.descricao NOT NULL.
select * from public.set_seller_profile('Loja A sem descricao', null) \gset optional_
select 1 / case when :'optional_descricao' = '' then 1 else 0 end as optional_description_result;

reset role;

-- A RPC nao aceita chamada anonima nem sem identidade autenticada.
set local role anon;
select set_config('request.jwt.claim.sub', :'seller_a_user_id', true);
do $$ begin
  begin perform * from public.set_seller_profile('Nao', 'Nao'); exception when insufficient_privilege then return; end;
  raise exception 'anon foi aceito';
end $$;
reset role;

set local role authenticated;
reset request.jwt.claim.sub;
do $$
begin
  begin perform * from public.set_seller_profile('Sem identidade', 'Nao'); exception when others then return; end;
  raise exception 'usuario nao autenticado foi aceito';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'buyer_id', true);
do $$
begin
  begin perform * from public.set_seller_profile('Sem loja', 'Nao'); exception when others then return; end;
  raise exception 'comprador sem loja foi aceito';
end $$;

select set_config('request.jwt.claim.sub', :'seller_b_user_id', true);
reset role;
update public.sellers set status = 'suspenso' where id = :'seller_b_id'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'seller_b_user_id', true);
do $$ begin
  if exists (select 1 from public.set_seller_profile('Suspenso', 'Nao')) then raise exception 'vendedor suspenso foi aceito'; end if;
exception when others then
  if sqlerrm = 'vendedor suspenso foi aceito' then raise; end if;
end $$;

select set_config('request.jwt.claim.sub', :'seller_a_user_id', true);
do $$
declare v_rejected boolean;
begin
  v_rejected := false;
  begin perform * from public.set_seller_profile('   ', 'invalido'); exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'nome vazio foi aceito'; end if;
  v_rejected := false;
  begin perform * from public.set_seller_profile(repeat('x', 256), 'invalido'); exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'nome longo foi aceito'; end if;
  v_rejected := false;
  begin perform * from public.set_seller_profile('Valido', repeat('x', 5001)); exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'descricao longa foi aceita'; end if;
end $$;

-- O vendedor B permanece inalterado e os campos administrativos de A sao preservados.
select 1 / case
  when (select count(*)
          from public.sellers
         where id = :'seller_a_id'::uuid
           and user_id = :'seller_a_user_id'::uuid
           and application_id = :'seller_a_application_id'::uuid
           and tipo_membro = 'empreendedor'
           and telefone = '11999990001'
           and status = 'ativo') = 1
   and (select count(*)
          from public.sellers
         where id = :'seller_b_id'::uuid
           and user_id = :'seller_b_user_id'::uuid
           and application_id = :'seller_b_application_id'::uuid
           and nome_negocio = concat('S31D_', :'run_id', '_B')
           and descricao = 'descricao B'
           and status = 'suspenso') = 1
  then 1
  else 0
end as administrative_integrity_result;
reset role;

do $$
begin
  if has_function_privilege('public', 'public.set_seller_profile(text,text)', 'EXECUTE') then raise exception 'PUBLIC possui EXECUTE'; end if;
  if has_function_privilege('anon', 'public.set_seller_profile(text,text)', 'EXECUTE') then raise exception 'anon possui EXECUTE'; end if;
  if not has_function_privilege('authenticated', 'public.set_seller_profile(text,text)', 'EXECUTE') then raise exception 'authenticated nao possui EXECUTE'; end if;
  if has_table_privilege('authenticated', 'public.sellers', 'UPDATE') then raise exception 'authenticated possui UPDATE direto em sellers'; end if;
  if pg_get_function_result('public.set_seller_profile(text,text)'::regprocedure) <> 'TABLE(seller_id uuid, nome_negocio text, descricao text, atualizado_em timestamp with time zone)' then raise exception 'assinatura de retorno incorreta'; end if;
end $$;

rollback;
