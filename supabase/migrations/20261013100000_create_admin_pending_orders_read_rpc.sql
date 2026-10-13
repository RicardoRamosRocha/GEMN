-- GEMN Sprint 4.3-A: fila administrativa protegida de pedidos pendentes.
-- Esta RPC somente consulta dados; não altera pedidos, carteiras, reservas ou cashback.

create or replace function public.list_admin_pending_orders(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  order_id uuid,
  buyer_id uuid,
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

  select p.is_admin
    into v_is_admin
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
         oi.id,
         oi.listing_id,
         oi.nome_item,
         oi.tipo,
         oi.quantidade,
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
   order by o.criado_em asc, o.id asc
   limit p_limit
  offset p_offset;
end;
$$;

comment on function public.list_admin_pending_orders(integer, integer) is
  'Lista pedidos pendentes para administradores, sinalizando pedidos vencidos sem permitir confirmação pelo cliente.';

revoke all on function public.list_admin_pending_orders(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_admin_pending_orders(integer, integer)
  to authenticated;
