-- Reforça a idempotência da assinatura de create_order com GEMN.

create or replace function public.create_order(
  p_listing_id uuid,
  p_quantidade integer,
  p_forma_pagamento text,
  p_idempotency_key uuid,
  p_gemn_utilizado numeric
)
returns table (
  order_id uuid,
  status text,
  forma_pagamento text,
  quantidade integer,
  total_real numeric(12, 2),
  total_gemn numeric(12, 2),
  gemn_utilizado numeric(12, 2),
  valor_devido_real numeric(12, 2),
  cashback_percentual numeric(5, 2),
  cashback_previsto numeric(12, 2)
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_buyer_id uuid := auth.uid();
  v_existing_order public.orders%rowtype;
  v_existing_item public.order_items%rowtype;
  v_result record;
  v_seller_id uuid;
  v_rule public.cashback_rules%rowtype;
  v_percentual numeric(5, 2) := 0;
  v_previsto numeric(12, 2);
begin
  if v_buyer_id is null then
    raise exception using errcode = 'P0001', message = 'usuário autenticado é obrigatório';
  end if;

  select o.* into v_existing_order
    from public.orders as o
   where o.buyer_id = v_buyer_id
     and o.idempotency_key = p_idempotency_key;

  if found then
    select oi.* into v_existing_item
      from public.order_items as oi
     where oi.order_id = v_existing_order.id;

    if not found then
      raise exception using errcode = 'P0001', message = 'pedido idempotente está sem item';
    end if;

    if v_existing_item.listing_id is distinct from p_listing_id
       or v_existing_item.quantidade is distinct from p_quantidade
       or v_existing_order.forma_pagamento is distinct from p_forma_pagamento
       or v_existing_order.gemn_utilizado is distinct from p_gemn_utilizado::numeric(12, 2) then
      raise exception using errcode = 'P0001', message = 'idempotency_key já foi usada com outra intenção de compra';
    end if;

    return query
    select o.id, o.status, o.forma_pagamento, oi.quantidade,
           o.total_real, o.total_gemn, o.gemn_utilizado,
           o.valor_devido_real, oi.cashback_percentual, oi.cashback_previsto
      from public.orders as o
      join public.order_items as oi on oi.order_id = o.id
     where o.id = v_existing_order.id;
    return;
  end if;

  select l.seller_id into v_seller_id
    from public.listings as l
   where l.id = p_listing_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'listing não encontrado';
  end if;

  perform 1 from public.sellers as s where s.id = v_seller_id for update;

  select * into v_result
    from public.create_order_3b_internal(
      p_listing_id, p_quantidade, p_forma_pagamento,
      p_idempotency_key, p_gemn_utilizado
    );

  if p_gemn_utilizado = 0 then
    select cr.* into v_rule
      from public.cashback_rules as cr
     where cr.seller_id = v_seller_id
       and cr.vigente_ate is null
     order by cr.vigente_desde desc, cr.id desc
     limit 1;

    if found then
      v_percentual := v_rule.percentual;
    end if;

    v_previsto := round(v_result.valor_devido_real * v_percentual / 100, 2);

    update public.order_items as oi
       set cashback_rule_id = case when v_rule.id is null then null else v_rule.id end,
           cashback_percentual = v_percentual,
           cashback_previsto = v_previsto
     where oi.order_id = v_result.order_id;
  end if;

  return query
  select o.id, o.status, o.forma_pagamento, oi.quantidade,
         o.total_real, o.total_gemn, o.gemn_utilizado,
         o.valor_devido_real, oi.cashback_percentual, oi.cashback_previsto
    from public.orders as o
    join public.order_items as oi on oi.order_id = o.id
   where o.id = v_result.order_id;
end;
$$;

revoke all on function public.create_order(uuid, integer, text, uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.create_order(uuid, integer, text, uuid, numeric)
  to authenticated;

