-- GEMN Sprint 2.4C.4C.2: consulta redigida de solicitacoes para vendedores.
-- O retorno nao contem identificadores do comprador nem dados financeiros.

create or replace function public.list_seller_cancellation_requests()
returns table (
  request_id uuid,
  order_id uuid,
  requester_role text,
  motivo_solicitacao text,
  status text,
  motivo_decisao text,
  order_status text,
  criado_em timestamptz,
  atualizado_em timestamptz,
  decidido_em timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'usuario autenticado e obrigatorio';
  end if;

  return query
  select r.id,
         r.order_id,
         r.requester_role,
         r.motivo_solicitacao,
         r.status,
         r.motivo_decisao,
         o.status,
         r.criado_em,
         r.atualizado_em,
         r.decidido_em
    from public.order_cancellation_requests as r
    join public.orders as o on o.id = r.order_id
   where exists (
     select 1
       from public.sellers as s
       join public.order_items as oi on oi.seller_id = s.id
      where s.user_id = auth.uid()
        and oi.order_id = r.order_id
   )
   order by r.criado_em desc, r.id desc;
end;
$$;

revoke all on function public.list_seller_cancellation_requests() from public, anon, authenticated;
grant execute on function public.list_seller_cancellation_requests() to authenticated;
