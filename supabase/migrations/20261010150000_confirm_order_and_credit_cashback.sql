-- GEMN: confirmação administrativa simulada, consumo de reserva e cashback.
-- Nenhum valor desta migration representa dinheiro real.

alter table public.orders
  add column confirmacao_idempotency_key uuid,
  add column confirmado_em timestamptz,
  add column confirmado_por uuid references public.profiles (id);

create unique index orders_confirmation_idempotency_idx
  on public.orders (confirmacao_idempotency_key)
  where confirmacao_idempotency_key is not null;

comment on column public.orders.confirmacao_idempotency_key is
  'Chave idempotente da confirmação simulada autorizada.';
comment on column public.orders.confirmado_por is
  'Administrador GEMN que executou a confirmação simulada.';

create or replace function public.confirm_order_payment(
  p_order_id uuid,
  p_idempotency_key uuid
)
returns table (
  order_id uuid,
  status text,
  confirmacao_idempotency_key uuid,
  confirmado_por uuid,
  gemn_consumido numeric(18, 2),
  cashback_creditado numeric(18, 2),
  cashback_recuperado numeric(18, 2)
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
  v_allocation record;
  v_item record;
  v_lot public.cashback_lots%rowtype;
  v_cashback_total numeric(18, 2) := 0.00;
  v_cashback_recovered numeric(18, 2) := 0.00;
  v_cashback_net numeric(18, 2) := 0.00;
  v_item_recovered numeric(18, 2);
  v_remaining_recovery numeric(18, 2);
  v_gemn_consumed numeric(18, 2) := 0.00;
begin
  if v_executor_id is null then
    raise exception using errcode = 'P0001', message = 'administrador autenticado é obrigatório';
  end if;

  if p_order_id is null or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'pedido e idempotency_key são obrigatórios';
  end if;

  select p.is_admin
    into v_is_admin
    from public.profiles as p
   where p.id = v_executor_id;

  if not coalesce(v_is_admin, false) then
    raise exception using errcode = 'P0001', message = 'administrador GEMN não autorizado';
  end if;

  select o.*
    into v_order
    from public.orders as o
   where o.id = p_order_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'pedido não encontrado';
  end if;

  if v_order.status in ('confirmado', 'concluido') then
    if v_order.confirmacao_idempotency_key = p_idempotency_key then
      return query
      select v_order.id,
             v_order.status,
             v_order.confirmacao_idempotency_key,
             v_order.confirmado_por,
             v_order.gemn_utilizado,
             coalesce((
               select sum(oi.cashback_previsto)
                 from public.order_items as oi
                where oi.order_id = v_order.id
             ), 0.00)::numeric(18, 2),
             0.00::numeric(18, 2);
      return;
    end if;

    raise exception using errcode = 'P0001', message = 'pedido já foi confirmado com outra chave';
  end if;

  if v_order.status <> 'pendente' then
    raise exception using errcode = 'P0001', message = 'somente pedidos pendentes podem ser confirmados';
  end if;

  select coalesce(sum(oi.cashback_previsto), 0.00)::numeric(18, 2)
    into v_cashback_total
    from public.order_items as oi
   where oi.order_id = v_order.id;

  if v_order.gemn_utilizado > 0 then
    select r.*
      into v_reservation
      from public.gemn_reservations as r
     where r.order_id = v_order.id
     for update;

    if not found
       or v_reservation.status <> 'ativa'
       or v_reservation.valor_gemn <> v_order.gemn_utilizado
       or v_reservation.buyer_id <> v_order.buyer_id then
      raise exception using errcode = 'P0001', message = 'reserva GEMN ativa e consistente é obrigatória';
    end if;
  else
    if exists (
      select 1
        from public.gemn_reservations as r
       where r.order_id = v_order.id
         and r.status = 'ativa'
    ) then
      raise exception using errcode = 'P0001', message = 'pedido sem GEMN possui reserva ativa inconsistente';
    end if;
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
    raise exception using errcode = 'P0001', message = 'carteira do comprador não encontrada';
  end if;

  if v_order.gemn_utilizado > 0 then
    for v_allocation in
      select a.id,
             a.cashback_lot_id,
             a.seller_origem_id,
             a.seller_recebedor_id,
             a.valor_gemn
        from public.gemn_reservation_allocations as a
       where a.reservation_id = v_reservation.id
         and a.status = 'ativa'
       order by a.ordem_fifo asc
       for update
    loop
      update public.cashback_lots as cl
         set valor_reservado = cl.valor_reservado - v_allocation.valor_gemn,
             valor_consumido = cl.valor_consumido + v_allocation.valor_gemn,
             status = case
               when cl.valor_disponivel = 0
                and cl.valor_reservado = v_allocation.valor_gemn
                and cl.valor_a_recuperar = 0
               then 'esgotado'
               else cl.status
             end
       where cl.id = v_allocation.cashback_lot_id
         and cl.valor_reservado >= v_allocation.valor_gemn;

      if not found then
        raise exception using errcode = 'P0001', message = 'lote reservado está inconsistente';
      end if;

      update public.gemn_reservation_allocations
         set status = 'consumida', atualizado_em = now()
       where id = v_allocation.id
         and status = 'ativa';

      if not found then
        raise exception using errcode = 'P0001', message = 'alocação da reserva está inconsistente';
      end if;

      v_gemn_consumed := v_gemn_consumed + v_allocation.valor_gemn;
    end loop;

    if v_gemn_consumed <> v_reservation.valor_gemn then
      raise exception using errcode = 'P0001', message = 'alocações FIFO não cobrem o valor reservado';
    end if;

    update public.wallets
       set saldo_reservado = saldo_reservado - v_reservation.valor_gemn,
           versao = versao + 1
     where id = v_wallet.id
       and saldo_reservado >= v_reservation.valor_gemn;

    if not found then
      raise exception using errcode = 'P0001', message = 'saldo reservado insuficiente para consumo';
    end if;

    update public.gemn_reservations
       set status = 'efetivada', atualizado_em = now()
     where id = v_reservation.id
       and status = 'ativa';

    if not found then
      raise exception using errcode = 'P0001', message = 'reserva já foi processada';
    end if;

    select w.* into v_wallet
      from public.wallets as w
     where w.id = v_wallet.id;

    for v_allocation in
      select a.id,
             a.cashback_lot_id,
             a.seller_origem_id,
             a.seller_recebedor_id,
             a.valor_gemn
        from public.gemn_reservation_allocations as a
       where a.reservation_id = v_reservation.id
       order by a.ordem_fifo asc
    loop
      insert into public.wallet_transactions (
        wallet_id, order_id, reservation_id, cashback_lot_id, tipo, valor,
        saldo_disponivel_apos, saldo_reservado_apos, saldo_a_recuperar_apos,
        idempotency_key, seller_origem_id, seller_recebedor_id,
        executado_por, descricao
      )
      values (
        v_wallet.id, v_order.id, v_reservation.id, v_allocation.cashback_lot_id,
        'debito_gemn', v_allocation.valor_gemn,
        v_wallet.saldo_disponivel, v_wallet.saldo_reservado, v_wallet.saldo_a_recuperar,
        md5(p_idempotency_key::text || ':debito:' || v_allocation.id::text)::uuid,
        v_allocation.seller_origem_id, v_allocation.seller_recebedor_id,
        v_executor_id, 'Consumo simulado de GEMN reservado por confirmação administrativa'
      );
    end loop;
  end if;

  v_cashback_recovered := least(v_cashback_total, v_wallet.saldo_a_recuperar);
  v_cashback_net := v_cashback_total - v_cashback_recovered;
  v_remaining_recovery := v_cashback_recovered;

  for v_item in
    select oi.*
      from public.order_items as oi
     where oi.order_id = v_order.id
     order by oi.id
     for update
  loop
    v_item_recovered := least(v_item.cashback_previsto, v_remaining_recovery);
    v_remaining_recovery := v_remaining_recovery - v_item_recovered;

    insert into public.cashback_lots (
      wallet_id, order_id, order_item_id, seller_origem_id,
      valor_original, valor_disponivel, valor_a_recuperar, status
    )
    values (
      v_wallet.id, v_order.id, v_item.id, v_item.seller_id,
      v_item.cashback_previsto,
      v_item.cashback_previsto - v_item_recovered,
      v_item_recovered,
      case when v_item.cashback_previsto - v_item_recovered > 0
           then 'disponivel' else 'esgotado' end
    );
  end loop;

  update public.wallets
     set saldo_disponivel = saldo_disponivel + v_cashback_net,
         saldo_a_recuperar = saldo_a_recuperar - v_cashback_recovered,
         versao = versao + case when v_cashback_total > 0 then 1 else 0 end
   where id = v_wallet.id
   and saldo_a_recuperar >= v_cashback_recovered;

  if not found then
    raise exception using errcode = 'P0001', message = 'saldo a recuperar inconsistente';
  end if;

  select w.* into v_wallet
    from public.wallets as w
   where w.id = v_wallet.id;

  for v_lot in
    select cl.*
      from public.cashback_lots as cl
     where cl.order_id = v_order.id
     order by cl.id
  loop
    if v_lot.valor_a_recuperar > 0 then
      insert into public.wallet_transactions (
        wallet_id, order_id, cashback_lot_id, tipo, valor,
        saldo_disponivel_apos, saldo_reservado_apos, saldo_a_recuperar_apos,
        idempotency_key, seller_origem_id, executado_por, descricao
      )
      values (
        v_wallet.id, v_order.id, v_lot.id, 'cashback_recuperacao', v_lot.valor_a_recuperar,
        v_wallet.saldo_disponivel, v_wallet.saldo_reservado, v_wallet.saldo_a_recuperar,
        md5(p_idempotency_key::text || ':recuperacao:' || v_lot.id::text)::uuid,
        v_lot.seller_origem_id, v_executor_id,
        'Abatimento simulado de cashback utilizado anteriormente'
      );
    end if;

    if v_lot.valor_disponivel > 0 then
      insert into public.wallet_transactions (
        wallet_id, order_id, cashback_lot_id, tipo, valor,
        saldo_disponivel_apos, saldo_reservado_apos, saldo_a_recuperar_apos,
        idempotency_key, seller_origem_id, executado_por, descricao
      )
      values (
        v_wallet.id, v_order.id, v_lot.id, 'cashback_credito', v_lot.valor_disponivel,
        v_wallet.saldo_disponivel, v_wallet.saldo_reservado, v_wallet.saldo_a_recuperar,
        md5(p_idempotency_key::text || ':cashback:' || v_lot.id::text)::uuid,
        v_lot.seller_origem_id, v_executor_id,
        'Cashback GEMN liberado após confirmação administrativa simulada'
      );
    end if;
  end loop;

  update public.orders
     set status = 'confirmado',
         confirmado_em = now(),
         confirmado_por = v_executor_id,
         confirmacao_idempotency_key = p_idempotency_key,
         atualizado_em = now()
   where id = v_order.id
     and status = 'pendente';

  if not found then
    raise exception using errcode = 'P0001', message = 'pedido já foi processado';
  end if;

  return query
  select v_order.id,
         'confirmado'::text,
         p_idempotency_key,
         v_executor_id,
         v_gemn_consumed,
         v_cashback_net,
         v_cashback_recovered;
end;
$$;

comment on function public.confirm_order_payment(uuid, uuid) is
  'Confirma pagamento simulado exclusivamente para administrador GEMN; consome reserva FIFO e credita cashback atomicamente.';

revoke all on function public.confirm_order_payment(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_order_payment(uuid, uuid)
  to authenticated;
