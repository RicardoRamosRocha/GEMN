-- GEMN: leitura administrativa agregada para pedidos multi-item.
-- A RPC antiga permanece intacta para compatibilidade de clientes existentes.

create or replace function public.list_admin_pending_orders_v2(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  order_id uuid,
  buyer_id uuid,
  seller_id uuid,
  item_count integer,
  items jsonb,
  item_id uuid,
  listing_id uuid,
  nome_item text,
  tipo text,
  quantidade integer,
  forma_pagamento text,
  total_real numeric(12, 2),
  total_gemn numeric(12, 2),
  gemn_utilizado numeric(12, 2),
  valor_devido_real numeric(12, 2),
  criado_em timestamptz,
  expira_em timestamptz,
  confirmavel boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'usuario autenticado e obrigatorio';
  end if;

  select p.is_admin into v_is_admin
    from public.profiles as p
   where p.id = auth.uid();
  if not coalesce(v_is_admin, false) then
    raise exception using errcode = 'P0001', message = 'administrador GEMN nao autorizado';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = 'P0001', message = 'limite deve estar entre 1 e 100';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception using errcode = 'P0001', message = 'offset nao pode ser negativo';
  end if;

  return query
  select o.id,
         o.buyer_id,
         (array_agg(oi.seller_id order by oi.id))[1],
         count(*)::integer,
         jsonb_agg(jsonb_build_object(
           'id', oi.id,
           'listing_id', oi.listing_id,
           'seller_id', oi.seller_id,
           'nome_item', oi.nome_item,
           'tipo', oi.tipo,
           'quantidade', oi.quantidade,
           'subtotal_real', oi.subtotal_real,
           'subtotal_gemn', oi.subtotal_gemn,
           'gemn_utilizado_item', oi.gemn_utilizado_item,
           'cashback_previsto', oi.cashback_previsto
         ) order by oi.id),
         (array_agg(oi.id order by oi.id))[1],
         (array_agg(oi.listing_id order by oi.id))[1],
         (array_agg(oi.nome_item order by oi.id))[1],
         (array_agg(oi.tipo order by oi.id))[1],
         (array_agg(oi.quantidade order by oi.id))[1],
         o.forma_pagamento,
         o.total_real,
         o.total_gemn,
         o.gemn_utilizado,
         o.valor_devido_real,
         o.criado_em,
         o.criado_em + interval '24 hours',
         o.criado_em > clock_timestamp() - interval '24 hours'
    from public.orders as o
    join public.order_items as oi on oi.order_id = o.id
   where o.status = 'pendente'
   group by o.id, o.buyer_id, o.forma_pagamento, o.total_real,
            o.total_gemn, o.gemn_utilizado, o.valor_devido_real, o.criado_em
   order by o.criado_em asc, o.id asc
   limit p_limit offset p_offset;
end;
$$;

revoke all on function public.list_admin_pending_orders_v2(integer, integer)
  from public, anon, service_role;
grant execute on function public.list_admin_pending_orders_v2(integer, integer)
  to authenticated;

comment on function public.list_admin_pending_orders_v2(integer, integer) is
  'Lista um registro por pedido pendente, agregando todos os itens para a fila administrativa.';
