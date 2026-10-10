-- Usa o prazo do pedido quando a reserva não possui expira_em explícito.
-- A alteração preserva a idempotência e a liberação FIFO existentes.

create or replace function public.release_gemn_reservation(
  p_reservation_id uuid,
  p_motivo text,
  p_idempotency_key uuid
)
returns table (
  reservation_id uuid,
  order_id uuid,
  status text,
  valor_gemn numeric(18, 2),
  seller_recebedor_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reservation public.gemn_reservations%rowtype;
  v_wallet public.wallets%rowtype;
  v_order_created_at timestamptz;
  v_allocation record;
  v_new_status text;
  v_executor_id uuid := auth.uid();
begin
  if p_reservation_id is null then
    raise exception using errcode = 'P0001', message = 'reserva é obrigatória';
  end if;
  if p_motivo not in ('cancelamento', 'expiracao') then
    raise exception using errcode = 'P0001', message = 'motivo de liberação inválido';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'idempotency_key é obrigatória';
  end if;

  select r.* into v_reservation
    from public.gemn_reservations as r
   where r.id = p_reservation_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'reserva não encontrada';
  end if;

  if v_reservation.status <> 'ativa' then
    if v_reservation.liberacao_idempotency_key = p_idempotency_key
       and v_reservation.status in ('liberada', 'expirada') then
      return query select v_reservation.id, v_reservation.order_id,
        v_reservation.status, v_reservation.valor_gemn,
        v_reservation.seller_recebedor_id;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'reserva já foi consumida ou liberada';
  end if;

  select o.criado_em into v_order_created_at
    from public.orders as o
   where o.id = v_reservation.order_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'pedido da reserva não encontrado';
  end if;

  if p_motivo = 'expiracao'
     and coalesce(v_reservation.expira_em, v_order_created_at + interval '24 hours') > clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'reserva ainda não expirou';
  end if;

  select w.* into v_wallet
    from public.wallets as w
   where w.id = v_reservation.wallet_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'carteira da reserva não encontrada';
  end if;

  for v_allocation in
    select a.id, a.cashback_lot_id, a.valor_gemn
      from public.gemn_reservation_allocations as a
     where a.reservation_id = v_reservation.id
       and a.status = 'ativa'
     order by a.ordem_fifo asc
     for update
  loop
    update public.cashback_lots as cl
       set valor_disponivel = cl.valor_disponivel + v_allocation.valor_gemn,
           valor_reservado = cl.valor_reservado - v_allocation.valor_gemn,
           status = case when cl.status = 'esgotado' then 'disponivel' else cl.status end
     where cl.id = v_allocation.cashback_lot_id
       and cl.valor_reservado >= v_allocation.valor_gemn;
    if not found then
      raise exception using errcode = 'P0001', message = 'lote da reserva está inconsistente';
    end if;
    update public.gemn_reservation_allocations set status = 'liberada'
     where id = v_allocation.id;
  end loop;

  update public.wallets
     set saldo_disponivel = saldo_disponivel + v_reservation.valor_gemn,
         saldo_reservado = saldo_reservado - v_reservation.valor_gemn,
         versao = versao + 1
   where id = v_wallet.id and saldo_reservado >= v_reservation.valor_gemn;
  if not found then
    raise exception using errcode = 'P0001', message = 'saldo reservado da carteira está inconsistente';
  end if;

  v_new_status := case when p_motivo = 'expiracao' then 'expirada' else 'liberada' end;
  insert into public.wallet_transactions (
    wallet_id, order_id, reservation_id, tipo, valor,
    saldo_disponivel_apos, saldo_reservado_apos, saldo_a_recuperar_apos,
    idempotency_key, seller_recebedor_id, executado_por, descricao
  )
  select w.id, v_reservation.order_id, v_reservation.id, 'liberacao_reserva',
         v_reservation.valor_gemn, w.saldo_disponivel, w.saldo_reservado,
         w.saldo_a_recuperar, p_idempotency_key, v_reservation.seller_recebedor_id,
         v_executor_id,
         case when p_motivo = 'expiracao'
              then 'Liberação de reserva GEMN expirada'
              else 'Liberação de reserva GEMN por cancelamento' end
    from public.wallets as w where w.id = v_wallet.id;

  update public.gemn_reservations
     set status = v_new_status, atualizado_em = now(), liberado_em = now(),
         liberado_por = v_executor_id, liberacao_idempotency_key = p_idempotency_key
   where id = v_reservation.id;

  return query select r.id, r.order_id, r.status, r.valor_gemn, r.seller_recebedor_id
    from public.gemn_reservations as r where r.id = v_reservation.id;
end;
$$;

revoke all on function public.release_gemn_reservation(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.release_gemn_reservation(uuid, text, uuid)
  to service_role;
