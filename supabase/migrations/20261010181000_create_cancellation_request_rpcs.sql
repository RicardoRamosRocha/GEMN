-- GEMN Sprint 2.4C Etapa 4C.2: solicitacao, aprovacao e rejeicao.
-- A aprovacao reutiliza cancel_confirmed_order; nenhuma logica financeira e duplicada.

create or replace function public.request_order_cancellation(
  p_order_id uuid,
  p_idempotency_key uuid,
  p_motivo text
)
returns table (
  request_id uuid,
  order_id uuid,
  status text,
  requester_role text,
  requester_seller_id uuid,
  motivo_solicitacao text,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requester_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_existing public.order_cancellation_requests%rowtype;
  v_seller_id uuid;
  v_role text;
begin
  if v_requester_id is null then
    raise exception using errcode = 'P0001', message = 'usuario autenticado e obrigatorio';
  end if;
  if p_order_id is null or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'pedido e idempotency_key sao obrigatorios';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception using errcode = 'P0001', message = 'motivo da solicitacao e obrigatorio';
  end if;

  -- Ordem de lock compartilhada com as RPCs financeiras: pedido antes da solicitacao.
  select o.* into v_order
    from public.orders as o
   where o.id = p_order_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'pedido nao encontrado';
  end if;

  select r.* into v_existing
    from public.order_cancellation_requests as r
   where r.requested_by = v_requester_id
     and r.idempotency_key = p_idempotency_key
   for update;
  if found then
    if v_existing.order_id <> p_order_id
       or v_existing.motivo_solicitacao <> p_motivo then
      raise exception using errcode = 'P0001', message = 'idempotency_key reutilizada com parametros diferentes';
    end if;
    return query select v_existing.id, v_existing.order_id, v_existing.status,
                        v_existing.requester_role, v_existing.requester_seller_id,
                        v_existing.motivo_solicitacao, v_existing.criado_em;
    return;
  end if;

  if v_order.status <> 'confirmado' then
    raise exception using errcode = 'P0001', message = 'solicitacao exige pedido confirmado';
  end if;

  select s.id into v_seller_id
    from public.sellers as s
    join public.order_items as oi on oi.seller_id = s.id
   where s.user_id = v_requester_id
     and oi.order_id = p_order_id
   order by s.id
   limit 1;

  if v_order.buyer_id = v_requester_id then
    v_role := 'comprador';
    v_seller_id := null;
  elsif v_seller_id is not null then
    v_role := 'vendedor';
  else
    raise exception using errcode = 'P0001', message = 'usuario nao pertence ao pedido';
  end if;

  if exists (
    select 1 from public.order_cancellation_requests as r
     where r.order_id = p_order_id
       and r.status in ('pendente', 'execucao_falhou')
  ) then
    raise exception using errcode = 'P0001', message = 'pedido ja possui solicitacao ativa';
  end if;

  insert into public.order_cancellation_requests (
    order_id, requested_by, requester_role, requester_seller_id,
    motivo_solicitacao, idempotency_key
  )
  values (
    p_order_id, v_requester_id, v_role, v_seller_id,
    p_motivo, p_idempotency_key
  )
  returning id into v_existing.id;

  select r.id, r.order_id, r.status, r.requester_role,
         r.requester_seller_id, r.motivo_solicitacao, r.criado_em
    into request_id, order_id, status, requester_role,
         requester_seller_id, motivo_solicitacao, criado_em
    from public.order_cancellation_requests as r
   where r.id = v_existing.id;

  return next;
end;
$$;

create or replace function public.approve_order_cancellation_request(
  p_request_id uuid,
  p_idempotency_key uuid
)
returns table (
  request_id uuid,
  order_id uuid,
  status text,
  attempt_id uuid,
  order_cancellation_id uuid,
  gemn_estornado numeric(18, 2),
  cashback_retirado numeric(18, 2),
  cashback_divida_criada numeric(18, 2),
  cashback_divida_restaurada numeric(18, 2),
  erro_codigo text,
  erro_mensagem text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_executor_id uuid := auth.uid();
  v_is_admin boolean;
  v_request public.order_cancellation_requests%rowtype;
  v_order public.orders%rowtype;
  v_attempt public.order_cancellation_request_attempts%rowtype;
  v_existing_cancel public.order_cancellations%rowtype;
  v_result record;
  v_attempt_id uuid;
  v_financial_key uuid;
  v_error_code text;
  v_error_message text;
begin
  if v_executor_id is null or p_request_id is null or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'administrador, solicitacao e chave sao obrigatorios';
  end if;

  select p.is_admin into v_is_admin
    from public.profiles as p where p.id = v_executor_id;
  if not coalesce(v_is_admin, false) then
    raise exception using errcode = 'P0001', message = 'administrador GEMN nao autorizado';
  end if;

  -- Pedido antes da solicitacao evita inversao com request_order_cancellation.
  select r.order_id into v_request.order_id
    from public.order_cancellation_requests as r
   where r.id = p_request_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'solicitacao nao encontrada';
  end if;

  select o.* into v_order
    from public.orders as o
   where o.id = v_request.order_id
   for update;

  select r.* into v_request
    from public.order_cancellation_requests as r
   where r.id = p_request_id
   for update;

  select a.* into v_attempt
    from public.order_cancellation_request_attempts as a
   where a.request_id = p_request_id
     and a.idempotency_key = p_idempotency_key
   for update;
  if found then
    if v_attempt.operacao <> 'aprovacao' then
      raise exception using errcode = 'P0001', message = 'chave de decisao ja usada em outra operacao';
    end if;
    return query
    select v_request.id, v_request.order_id, v_request.status, v_attempt.id,
           v_attempt.order_cancellation_id, oc.gemn_estornado,
           oc.cashback_retirado, oc.cashback_divida_criada,
           oc.cashback_divida_restaurada, v_attempt.erro_codigo,
           v_attempt.erro_mensagem
      from (select v_attempt.order_cancellation_id) x
      left join public.order_cancellations oc on oc.id = x.order_cancellation_id;
    return;
  end if;

  if v_request.status in ('aprovada', 'rejeitada') then
    raise exception using errcode = 'P0001', message = 'solicitacao ja possui decisao terminal';
  end if;
  if v_request.status not in ('pendente', 'execucao_falhou') then
    raise exception using errcode = 'P0001', message = 'status da solicitacao nao permite aprovacao';
  end if;
  if v_request.decision_idempotency_key is not null
     and v_request.decision_idempotency_key <> p_idempotency_key
     and v_request.status = 'pendente' then
    raise exception using errcode = 'P0001', message = 'solicitacao ja esta em outra decisao';
  end if;

  v_financial_key := coalesce(v_request.financial_execution_key, gen_random_uuid());
  update public.order_cancellation_requests
     set decision_idempotency_key = p_idempotency_key,
         financial_execution_key = v_financial_key,
         atualizado_em = now()
   where id = v_request.id;

  select oc.* into v_existing_cancel
    from public.order_cancellations as oc
   where oc.order_id = v_order.id
   for update;

  if v_order.status = 'cancelado' and found then
    update public.order_cancellation_requests
       set status = 'aprovada', decided_by = v_executor_id,
           decidido_em = now(), atualizado_em = now(),
           order_cancellation_id = v_existing_cancel.id,
           erro_codigo = null, erro_mensagem = null
     where id = v_request.id;

    insert into public.order_cancellation_request_attempts (
      request_id, operacao, idempotency_key, executor_id, resultado,
      order_cancellation_id
    ) values (
      v_request.id, 'aprovacao', p_idempotency_key, v_executor_id,
      'sucesso', v_existing_cancel.id
    ) returning id into v_attempt_id;

    return query
    select v_request.id, v_order.id, 'aprovada'::text, v_attempt_id,
           v_existing_cancel.id, v_existing_cancel.gemn_estornado,
           v_existing_cancel.cashback_retirado,
           v_existing_cancel.cashback_divida_criada,
           v_existing_cancel.cashback_divida_restaurada, null::text, null::text;
    return;
  end if;

  if v_order.status <> 'confirmado' then
    v_error_code := 'PEDIDO_NAO_CONFIRMADO';
    v_error_message := 'o pedido nao esta mais confirmado para estorno';
  else
    begin
      select * into v_result
        from public.cancel_confirmed_order(
          v_order.id,
          v_financial_key,
          'Solicitacao de cancelamento aprovada: ' || v_request.motivo_solicitacao
        );
    exception when others then
      v_error_code := 'CANCELAMENTO_FINANCEIRO_FALHOU';
      v_error_message := 'estorno financeiro nao concluido; a solicitacao pode ser tentada novamente';
    end;
  end if;

  if v_error_code is not null then
    update public.order_cancellation_requests
       set status = 'execucao_falhou', decided_by = v_executor_id,
           decidido_em = now(), atualizado_em = now(),
           erro_codigo = v_error_code, erro_mensagem = v_error_message
     where id = v_request.id;

    insert into public.order_cancellation_request_attempts (
      request_id, operacao, idempotency_key, executor_id, resultado,
      erro_codigo, erro_mensagem
    ) values (
      v_request.id, 'aprovacao', p_idempotency_key, v_executor_id, 'falha',
      v_error_code, v_error_message
    ) returning id into v_attempt_id;

    return query
    select v_request.id, v_order.id, 'execucao_falhou'::text, v_attempt_id,
           null::uuid, 0.00::numeric(18,2), 0.00::numeric(18,2),
           0.00::numeric(18,2), 0.00::numeric(18,2),
           v_error_code, v_error_message;
    return;
  end if;

  update public.order_cancellation_requests
     set status = 'aprovada', decided_by = v_executor_id,
         decidido_em = now(), atualizado_em = now(),
         order_cancellation_id = v_result.cancelamento_id,
         erro_codigo = null, erro_mensagem = null
   where id = v_request.id;

  insert into public.order_cancellation_request_attempts (
    request_id, operacao, idempotency_key, executor_id, resultado,
    order_cancellation_id
  ) values (
    v_request.id, 'aprovacao', p_idempotency_key, v_executor_id,
    'sucesso', v_result.cancelamento_id
  ) returning id into v_attempt_id;

  return query
  select v_request.id, v_order.id, 'aprovada'::text, v_attempt_id,
         v_result.cancelamento_id, v_result.gemn_estornado,
         v_result.cashback_retirado, v_result.cashback_divida_criada,
         v_result.cashback_divida_restaurada, null::text, null::text;
end;
$$;

create or replace function public.reject_order_cancellation_request(
  p_request_id uuid,
  p_idempotency_key uuid,
  p_motivo text
)
returns table (
  request_id uuid,
  order_id uuid,
  status text,
  attempt_id uuid,
  motivo_decisao text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_executor_id uuid := auth.uid();
  v_is_admin boolean;
  v_request public.order_cancellation_requests%rowtype;
  v_order_id uuid;
  v_attempt public.order_cancellation_request_attempts%rowtype;
  v_attempt_id uuid;
begin
  if v_executor_id is null or p_request_id is null or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'administrador, solicitacao e chave sao obrigatorios';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception using errcode = 'P0001', message = 'motivo da rejeicao e obrigatorio';
  end if;

  select p.is_admin into v_is_admin
    from public.profiles as p where p.id = v_executor_id;
  if not coalesce(v_is_admin, false) then
    raise exception using errcode = 'P0001', message = 'administrador GEMN nao autorizado';
  end if;

  select r.order_id into v_order_id
    from public.order_cancellation_requests as r where r.id = p_request_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'solicitacao nao encontrada';
  end if;
  perform 1 from public.orders where id = v_order_id for update;
  select r.* into v_request
    from public.order_cancellation_requests as r
   where r.id = p_request_id for update;

  select a.* into v_attempt
    from public.order_cancellation_request_attempts as a
   where a.request_id = p_request_id
     and a.idempotency_key = p_idempotency_key
   for update;
  if found then
    if v_attempt.operacao <> 'rejeicao' then
      raise exception using errcode = 'P0001', message = 'chave de decisao ja usada em outra operacao';
    end if;
    return query select v_request.id, v_request.order_id, v_request.status,
                        v_attempt.id, v_request.motivo_decisao;
    return;
  end if;

  if v_request.status in ('aprovada', 'rejeitada') then
    raise exception using errcode = 'P0001', message = 'solicitacao ja possui decisao terminal';
  end if;
  if v_request.status not in ('pendente', 'execucao_falhou') then
    raise exception using errcode = 'P0001', message = 'status da solicitacao nao permite rejeicao';
  end if;

  update public.order_cancellation_requests
     set status = 'rejeitada', decision_idempotency_key = p_idempotency_key,
         decided_by = v_executor_id, motivo_decisao = p_motivo,
         decidido_em = now(), atualizado_em = now(),
         erro_codigo = null, erro_mensagem = null
   where id = v_request.id;

  insert into public.order_cancellation_request_attempts (
    request_id, operacao, idempotency_key, executor_id, resultado
  ) values (
    v_request.id, 'rejeicao', p_idempotency_key, v_executor_id, 'sucesso'
  ) returning id into v_attempt_id;

  return query select v_request.id, v_request.order_id, 'rejeitada'::text,
                       v_attempt_id, p_motivo;
end;
$$;

revoke all on function public.request_order_cancellation(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.request_order_cancellation(uuid, uuid, text)
  to authenticated;

revoke all on function public.approve_order_cancellation_request(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_order_cancellation_request(uuid, uuid)
  to authenticated;

revoke all on function public.reject_order_cancellation_request(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reject_order_cancellation_request(uuid, uuid, text)
  to authenticated;
