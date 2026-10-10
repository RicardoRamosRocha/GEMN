\set ON_ERROR_STOP on

begin;

do $$
declare
  v_user_id uuid;
  v_application_id uuid;
  v_seller_id uuid;
  v_category_id uuid;
  v_listing_id uuid;
  v_order_id uuid;
  v_status text;
  v_total_real numeric(12, 2);
  v_item_count integer;
begin
  select id
    into v_user_id
    from auth.users
   order by created_at desc
   limit 1;

  if v_user_id is null then
    raise exception 'regression fixture requires at least one local Auth user';
  end if;

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  insert into public.seller_applications (
    user_id, tipo_membro, nome_negocio, cpf, telefone, categoria, descricao, status
  )
  values (
    v_user_id, 'empreendedor', concat('GEMN_S24B_REG_', v_user_id),
    concat('REG', replace(v_user_id::text, '-', '')), '11999990009',
    'regressao', 'Fixture de regressão Sprint 2.4B', 'aprovada'
  )
  returning id into v_application_id;

  insert into public.sellers (
    user_id, application_id, tipo_membro, nome_negocio, descricao, telefone
  )
  values (
    v_user_id, v_application_id, 'empreendedor',
    concat('GEMN_S24B_REG_', v_user_id),
    'Fixture de regressão Sprint 2.4B', '11999990009'
  )
  returning id into v_seller_id;

  insert into public.categories (nome, ativo)
  values (concat('GEMN_S24B_REG_CAT_', v_user_id), true)
  returning id into v_category_id;

  insert into public.listings (
    seller_id, category_id, tipo, nome, descricao,
    preco_real, aceita_gemn, preco_gemn, status
  )
  values (
    v_seller_id, v_category_id, 'produto',
    concat('GEMN_S24B_REG_LISTING_', v_user_id),
    'Fixture de regressão Sprint 2.4B', 12.50, false, null, 'ativo'
  )
  returning id into v_listing_id;

  select order_id, status, total_real
    into v_order_id, v_status, v_total_real
    from public.create_order(v_listing_id, 1, 'real', gen_random_uuid());

  select count(*)
    into v_item_count
    from public.order_items
   where order_id = v_order_id;

  if v_status <> 'pendente' or v_total_real <> 12.50 or v_item_count <> 1 then
    raise exception 'create_order regression failed: status=%, total=%, items=%',
      v_status, v_total_real, v_item_count;
  end if;
end;
$$;

select 'PASS' as result, 'create_order regression' as test;

rollback;

\echo SPRINT24B_ORDERS_REGRESSION_OK
