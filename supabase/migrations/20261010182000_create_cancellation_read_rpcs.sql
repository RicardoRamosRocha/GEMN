-- GEMN Sprint 2.4C Etapa 4B: consultas protegidas para interfaces de cancelamento.
-- Nenhuma consulta expõe buyer_id ou concede SELECT adicional nas tabelas base.

create or replace function public.list_my_cancellation_requests()
returns table (
  request_id uuid,
  order_id uuid,
  requested_by uuid,
  requester_role text,
  requester_seller_id uuid,
  motivo_solicitacao text,
  status text,
  decision_idempotency_key uuid,
  decided_by uuid,
  motivo_decisao text,
  order_cancellation_id uuid,
  erro_codigo text,
  erro_mensagem text,
  order_status text,
  total_real numeric,
  gemn_utilizado numeric,
  valor_devido_real numeric,
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
  select r.id, r.order_id, r.requested_by, r.requester_role,
         r.requester_seller_id, r.motivo_solicitacao, r.status,
         r.decision_idempotency_key, r.decided_by, r.motivo_decisao,
         r.order_cancellation_id, r.erro_codigo, r.erro_mensagem,
         o.status, o.total_real, o.gemn_utilizado, o.valor_devido_real,
         r.criado_em, r.atualizado_em, r.decidido_em
    from public.order_cancellation_requests as r
    join public.orders as o on o.id = r.order_id
   where public.can_view_order_cancellation_request(r.order_id, r.requester_seller_id)
   order by r.criado_em desc, r.id desc;
end;
$$;

create or replace function public.list_seller_related_orders()
returns table (
  order_id uuid,
  order_status text,
  forma_pagamento text,
  total_real numeric,
  total_gemn numeric,
  gemn_utilizado numeric,
  valor_devido_real numeric,
  order_criado_em timestamptz,
  item_id uuid,
  listing_id uuid,
  seller_id uuid,
  nome_item text,
  tipo text,
  quantidade integer,
  subtotal_real numeric,
  subtotal_gemn numeric,
  cashback_percentual numeric,
  cashback_previsto numeric,
  item_criado_em timestamptz
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
  select o.id, o.status, o.forma_pagamento, o.total_real, o.total_gemn,
         o.gemn_utilizado, o.valor_devido_real, o.criado_em,
         oi.id, oi.listing_id, oi.seller_id, oi.nome_item, oi.tipo,
         oi.quantidade, oi.subtotal_real, oi.subtotal_gemn,
         oi.cashback_percentual, oi.cashback_previsto, oi.criado_em
    from public.sellers as s
    join public.order_items as oi on oi.seller_id = s.id
    join public.orders as o on o.id = oi.order_id
   where s.user_id = auth.uid()
   order by o.criado_em desc, o.id desc, oi.id;
end;
$$;

create or replace function public.list_admin_cancellation_requests(
  p_status text default null
)
returns table (
  request_id uuid,
  order_id uuid,
  requested_by uuid,
  requester_role text,
  requester_seller_id uuid,
  motivo_solicitacao text,
  status text,
  decided_by uuid,
  motivo_decisao text,
  order_cancellation_id uuid,
  erro_codigo text,
  erro_mensagem text,
  order_status text,
  total_real numeric,
  gemn_utilizado numeric,
  valor_devido_real numeric,
  order_criado_em timestamptz,
  criado_em timestamptz,
  atualizado_em timestamptz,
  decidido_em timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_is_admin boolean;
begin
  select p.is_admin into v_is_admin
    from public.profiles as p
   where p.id = auth.uid();
  if not coalesce(v_is_admin, false) then
    raise exception using errcode = 'P0001', message = 'administrador GEMN nao autorizado';
  end if;
  if p_status is not null and p_status not in ('pendente', 'aprovada', 'rejeitada', 'execucao_falhou') then
    raise exception using errcode = 'P0001', message = 'status de filtro invalido';
  end if;

  return query
  select r.id, r.order_id, r.requested_by, r.requester_role,
         r.requester_seller_id, r.motivo_solicitacao, r.status,
         r.decided_by, r.motivo_decisao, r.order_cancellation_id,
         r.erro_codigo, r.erro_mensagem, o.status, o.total_real,
         o.gemn_utilizado, o.valor_devido_real, o.criado_em,
         r.criado_em, r.atualizado_em, r.decidido_em
    from public.order_cancellation_requests as r
    join public.orders as o on o.id = r.order_id
   where p_status is null or r.status = p_status
   order by r.criado_em desc, r.id desc;
end;
$$;

create or replace function public.list_cancellation_request_attempts(
  p_request_id uuid
)
returns table (
  attempt_id uuid,
  request_id uuid,
  operacao text,
  resultado text,
  order_cancellation_id uuid,
  erro_codigo text,
  erro_mensagem text,
  criado_em timestamptz,
  finalizado_em timestamptz
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
  select a.id, a.request_id, a.operacao, a.resultado,
         a.order_cancellation_id, a.erro_codigo, a.erro_mensagem,
         a.criado_em, a.finalizado_em
    from public.order_cancellation_request_attempts as a
    join public.order_cancellation_requests as r on r.id = a.request_id
   where a.request_id = p_request_id
     and public.can_view_order_cancellation_request(r.order_id, r.requester_seller_id)
   order by a.criado_em asc, a.id asc;
end;
$$;

revoke all on function public.list_my_cancellation_requests() from public, anon, authenticated;
grant execute on function public.list_my_cancellation_requests() to authenticated;

revoke all on function public.list_seller_related_orders() from public, anon, authenticated;
grant execute on function public.list_seller_related_orders() to authenticated;

revoke all on function public.list_admin_cancellation_requests(text) from public, anon, authenticated;
grant execute on function public.list_admin_cancellation_requests(text) to authenticated;

revoke all on function public.list_cancellation_request_attempts(uuid) from public, anon, authenticated;
grant execute on function public.list_cancellation_request_attempts(uuid) to authenticated;
