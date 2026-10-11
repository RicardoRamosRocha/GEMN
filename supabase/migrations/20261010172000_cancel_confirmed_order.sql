-- GEMN: cancelamento administrativo de pedido confirmado.
-- Todas as movimentações são simuladas, transacionais e auditáveis.

create or replace function public.cancel_confirmed_order(
  p_order_id uuid,
  p_idempotency_key uuid,
  p_motivo text
)
returns table (
  order_id uuid,
  status text,
  cancelamento_id uuid,
  executado_por uuid,
  gemn_estornado numeric(18, 2),
  cashback_retirado numeric(18, 2),
  cashback_divida_criada numeric(18, 2),
  cashback_divida_restaurada numeric(18, 2)
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_executor_id uuid := auth.uid();
  v_is_admin boolean;
  v_order public.orders%rowtype;
  v_wallet public.wallets%rowtype;
  v_reservation public.gemn_reservations%rowtype;
  v_existing public.order_cancellations%rowtype;
  v_allocation record;
  v_lot public.cashback_lots%rowtype;
  v_cancellation_id uuid;
  v_gemn_estornado numeric(18, 2) := 0.00;
  v_cashback_retirado numeric(18, 2) := 0.00;
  v_cashback_divida_criada numeric(18, 2) := 0.00;
  v_cashback_divida_restaurada numeric(18, 2) := 0.00;
  v_order_cashback_lots integer := 0;
  v_order_items integer := 0;
begin
  if v_executor_id is null then
    raise exception using errcode = 'P0001', message = 'administrador autenticado e obrigatorio';
  end if;

  if p_order_id is null or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'pedido e idempotency_key sao obrigatorios';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception using errcode = 'P0001', message = 'motivo do cancelamento e obrigatorio';
  end if;

  select p.is_admin
    into v_is_admin
    from public.profiles as p
   where p.id = v_executor_id;

  if not coalesce(v_is_admin, false) then
    raise exception using errcode = 'P0001', message = 'administrador GEMN nao autorizado';
  end if;

  -- Ordem de bloqueio: pedido -> reserva -> carteira -> alocacoes -> lotes.
  select o.*
    into v_order
    from public.orders as o
   where o.id = p_order_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'pedido nao encontrado';
  end if;

  select oc.*
    into v_existing
    from public.order_cancellations as oc
   where oc.order_id = v_order.id
   for update;

  if found then
    if v_existing.idempotency_key = p_idempotency_key then
      return query
      select v_order.id,
             'cancelado'::text,
             v_existing.id,
             v_existing.executado_por,
             v_existing.gemn_estornado,
             v_existing.cashback_retirado,
             v_existing.cashback_divida_criada,
             v_existing.cashback_divida_restaurada;
      return;
    end if;

    raise exception using errcode = 'P0001', message = 'pedido ja possui cancelamento com outra chave';
  end if;

  if v_order.status <> 'confirmado' then
    raise exception using errcode = 'P0001', message = 'somente pedidos confirmados podem ser cancelados nesta etapa';
  end if;

  insert into public.wallets (user_id)
  values (v_order.buyer_id)
  on conflict (user_id) do nothing;

  select w.*
    into v_wallet
    from public.wallets as w
   where w.user_id = v_order.buyer_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'carteira do comprador nao encontrada';
  end if;

  select r.*
    into v_reservation
    from public.gemn_reservations as r
   where r.order_id = v_order.id
   for update;

  if v_order.gemn_utilizado > 0 then
    if not found
       or v_reservation.status <> 'efetivada'
       or v_reservation.valor_gemn <> v_order.gemn_utilizado
       or v_reservation.buyer_id <> v_order.buyer_id
       or v_reservation.wallet_id <> v_wallet.id then
      raise exception using errcode = 'P0001', message = 'reserva efetivada e consistente e obrigatoria';
    end if;

    for v_allocation in
      select a.*
        from public.gemn_reservation_allocations as a
       where a.reservation_id = v_reservation.id
       order by a.id
       for update
    loop
      if v_allocation.status <> 'consumida' then
        raise exception using errcode = 'P0001', message = 'todas as alocacoes da reserva devem estar consumidas';
      end if;
      v_gemn_estornado := v_gemn_estornado + v_allocation.valor_gemn;
    end loop;

    if v_gemn_estornado <> v_reservation.valor_gemn then
      raise exception using errcode = 'P0001', message = 'alocacoes consumidas nao cobrem a reserva';
    end if;
  elsif found and v_reservation.status not in ('liberada', 'expirada') then
    raise exception using errcode = 'P0001', message = 'pedido real possui reserva GEMN inconsistente';
  end if;

  select count(*) into v_order_items
    from public.order_items as oi
   where oi.order_id = v_order.id;

  select count(*) into v_order_cashback_lots
    from public.cashback_lots as cl
   where cl.order_id = v_order.id
     and cl.wallet_id = v_wallet.id;

  if v_order_cashback_lots <> v_order_items then
    raise exception using errcode = 'P0001', message = 'lotes de cashback do pedido estao incompletos';
  end if;

  -- Todos os lotes envolvidos sao bloqueados em ordem global de id, evitando
  -- inversao de locks quando um lote de cashback e usado por outro pedido.
  for v_lot in
    select cl.*
      from public.cashback_lots as cl
     where cl.id in (
       select a.cashback_lot_id
         from public.gemn_reservation_allocations as a
        where a.reservation_id = v_reservation.id
       union
       select own_lot.id
         from public.cashback_lots as own_lot
        where own_lot.order_id = v_order.id
          and own_lot.wallet_id = v_wallet.id
     )
     order by cl.id
     for update
  loop
    null;
  end loop;

  if exists (
    select 1
      from public.cashback_lots as cl
     where cl.order_id = v_order.id
       and cl.wallet_id = v_wallet.id
       and cl.valor_reservado > 0
  ) then
    raise exception using errcode = 'P0001', message = 'cashback deste pedido esta reservado em outro pedido pendente';
  end if;

  select coalesce(sum(cl.valor_disponivel), 0.00)::numeric(18, 2),
         coalesce(sum(cl.valor_consumido), 0.00)::numeric(18, 2),
         coalesce(sum(cl.valor_a_recuperar), 0.00)::numeric(18, 2)
    into v_cashback_retirado, v_cashback_divida_criada, v_cashback_divida_restaurada
    from public.cashback_lots as cl
   where cl.order_id = v_order.id
     and cl.wallet_id = v_wallet.id;

  insert into public.order_cancellations (
    order_id, idempotency_key, status_anterior, executado_por, motivo,
    gemn_estornado, cashback_retirado, cashback_divida_criada,
    cashback_divida_restaurada
  )
  values (
    v_order.id, p_idempotency_key, v_order.status, v_executor_id, p_motivo,
    v_gemn_estornado, v_cashback_retirado, v_cashback_divida_criada,
    v_cashback_divida_restaurada
  )
  returning id into v_cancellation_id;

  -- O vinculo e inserido antes de alterar a alocacao, pois a trigger exige
  -- que o identificador original ainda esteja no estado consumida.
  if v_order.gemn_utilizado > 0 then
    for v_allocation in
      select a.*
        from public.gemn_reservation_allocations as a
       where a.reservation_id = v_reservation.id
       order by a.ordem_fifo asc, a.id asc
    loop
      insert into public.order_cancellation_allocations (
        order_cancellation_id, order_id, reservation_id,
        reservation_allocation_id, cashback_lot_id,
        seller_origem_id, seller_recebedor_id, valor_gemn
      )
      values (
        v_cancellation_id, v_order.id, v_allocation.reservation_id,
        v_allocation.id, v_allocation.cashback_lot_id,
        v_allocation.seller_origem_id, v_allocation.seller_recebedor_id,
        v_allocation.valor_gemn
      );

      update public.cashback_lots as cl
         set valor_disponivel = cl.valor_disponivel + v_allocation.valor_gemn,
             valor_consumido = cl.valor_consumido - v_allocation.valor_gemn,
             status = case
               when cl.status = 'esgotado' then 'disponivel'
               else cl.status
             end,
             atualizado_em = now()
       where cl.id = v_allocation.cashback_lot_id
         and cl.valor_consumido >= v_allocation.valor_gemn
         and cl.status <> 'estornado';

      if not found then
        raise exception using errcode = 'P0001', message = 'lote de origem inconsistente para estorno GEMN';
      end if;

      update public.gemn_reservation_allocations as a
         set status = 'estornada', estornada_em = now(),
             estornada_por = v_executor_id,
             order_cancellation_id = v_cancellation_id,
             atualizado_em = now()
       where a.id = v_allocation.id
         and a.status = 'consumida';

      if not found then
        raise exception using errcode = 'P0001', message = 'alocacao ja foi estornada';
      end if;
    end loop;

    update public.gemn_reservations as r
       set status = 'estornada', estornada_em = now(),
           estornada_por = v_executor_id,
           estorno_idempotency_key = p_idempotency_key,
           order_cancellation_id = v_cancellation_id,
           atualizado_em = now()
     where r.id = v_reservation.id
       and r.status = 'efetivada';

    if not found then
      raise exception using errcode = 'P0001', message = 'reserva ja foi estornada';
    end if;
  end if;

  update public.wallets as w
     set saldo_disponivel = w.saldo_disponivel + v_gemn_estornado - v_cashback_retirado,
         saldo_a_recuperar = w.saldo_a_recuperar
           + v_cashback_divida_criada
           + v_cashback_divida_restaurada,
         versao = w.versao + 1
   where w.id = v_wallet.id
     and w.saldo_disponivel + v_gemn_estornado >= v_cashback_retirado;

  if not found then
    raise exception using errcode = 'P0001', message = 'saldo disponivel insuficiente para estorno';
  end if;

  select w.* into v_wallet
    from public.wallets as w
   where w.id = v_wallet.id;

  if v_gemn_estornado > 0 then
    for v_allocation in
      select a.*
        from public.gemn_reservation_allocations as a
       where a.reservation_id = v_reservation.id
       order by a.ordem_fifo asc, a.id asc
    loop
      insert into public.wallet_transactions (
        wallet_id, order_id, reservation_id, cashback_lot_id, tipo, valor,
        saldo_disponivel_apos, saldo_reservado_apos, saldo_a_recuperar_apos,
        idempotency_key, seller_origem_id, seller_recebedor_id,
        executado_por, descricao
      )
      values (
        v_wallet.id, v_order.id, v_reservation.id, v_allocation.cashback_lot_id,
        'estorno_gemn', v_allocation.valor_gemn,
        v_wallet.saldo_disponivel, v_wallet.saldo_reservado,
        v_wallet.saldo_a_recuperar,
        md5(p_idempotency_key::text || ':estorno-gemn:' || v_allocation.id::text)::uuid,
        v_allocation.seller_origem_id, v_allocation.seller_recebedor_id,
        v_executor_id, 'Estorno simulado de GEMN consumido por cancelamento administrativo'
      );
    end loop;
  end if;

  for v_lot in
    select cl.*
      from public.cashback_lots as cl
     where cl.order_id = v_order.id
       and cl.wallet_id = v_wallet.id
     order by cl.id
  loop
    if v_lot.valor_disponivel > 0 then
      insert into public.wallet_transactions (
        wallet_id, order_id, cashback_lot_id, tipo, valor,
        saldo_disponivel_apos, saldo_reservado_apos, saldo_a_recuperar_apos,
        idempotency_key, seller_origem_id, executado_por, descricao
      )
      values (
        v_wallet.id, v_order.id, v_lot.id, 'estorno_cashback', v_lot.valor_disponivel,
        v_wallet.saldo_disponivel, v_wallet.saldo_reservado,
        v_wallet.saldo_a_recuperar,
        md5(p_idempotency_key::text || ':estorno-cashback:' || v_lot.id::text)::uuid,
        v_lot.seller_origem_id, v_executor_id,
        'Retirada simulada de cashback disponivel por cancelamento administrativo'
      );
    end if;

    if v_lot.valor_consumido > 0 then
      insert into public.wallet_transactions (
        wallet_id, order_id, cashback_lot_id, tipo, valor,
        saldo_disponivel_apos, saldo_reservado_apos, saldo_a_recuperar_apos,
        idempotency_key, seller_origem_id, executado_por, descricao
      )
      values (
        v_wallet.id, v_order.id, v_lot.id, 'cashback_divida_criada', v_lot.valor_consumido,
        v_wallet.saldo_disponivel, v_wallet.saldo_reservado,
        v_wallet.saldo_a_recuperar,
        md5(p_idempotency_key::text || ':divida-consumida:' || v_lot.id::text)::uuid,
        v_lot.seller_origem_id, v_executor_id,
        'Divida simulada por cashback consumido antes do cancelamento'
      );
    end if;

    if v_lot.valor_a_recuperar > 0 then
      insert into public.wallet_transactions (
        wallet_id, order_id, cashback_lot_id, tipo, valor,
        saldo_disponivel_apos, saldo_reservado_apos, saldo_a_recuperar_apos,
        idempotency_key, seller_origem_id, executado_por, descricao
      )
      values (
        v_wallet.id, v_order.id, v_lot.id, 'cashback_divida_criada', v_lot.valor_a_recuperar,
        v_wallet.saldo_disponivel, v_wallet.saldo_reservado,
        v_wallet.saldo_a_recuperar,
        md5(p_idempotency_key::text || ':divida-restaurada:' || v_lot.id::text)::uuid,
        v_lot.seller_origem_id, v_executor_id,
        'Divida de cashback anteriormente abatida e restaurada pelo cancelamento'
      );
    end if;
  end loop;

  -- O lote permanece como evidencia historica: valor_consumido nao e zerado.
  -- Apenas o saldo ainda disponivel deixa de existir apos o cancelamento.
  update public.cashback_lots as cl
     set valor_disponivel = 0.00,
         status = 'estornado',
         liberado_em = now(),
         atualizado_em = now()
   where cl.order_id = v_order.id
     and cl.wallet_id = v_wallet.id
     and cl.valor_reservado = 0;

  update public.orders as o
     set status = 'cancelado', atualizado_em = now()
   where o.id = v_order.id
     and o.status = 'confirmado';

  if not found then
    raise exception using errcode = 'P0001', message = 'pedido ja foi processado';
  end if;

  return query
  select v_order.id,
         'cancelado'::text,
         v_cancellation_id,
         v_executor_id,
         v_gemn_estornado,
         v_cashback_retirado,
         v_cashback_divida_criada,
         v_cashback_divida_restaurada;
end;
$$;

comment on function public.cancel_confirmed_order(uuid, uuid, text) is
  'Cancela administrativamente pedido confirmado e estorna GEMN/cashback de forma simulada, atomica e idempotente.';

revoke all on function public.cancel_confirmed_order(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_confirmed_order(uuid, uuid, text)
  to authenticated;
