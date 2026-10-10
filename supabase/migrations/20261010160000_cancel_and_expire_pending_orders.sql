-- GEMN: cancelamento seguro e expiração de pedidos pendentes.
-- Todas as operações são simuladas e permanecem dentro de uma transação.

alter table public.orders
  drop constraint orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pendente', 'confirmado', 'concluido', 'cancelado', 'expirado'));

alter table public.orders
  add column cancelamento_idempotency_key uuid,
  add column cancelado_em timestamptz,
  add column cancelado_por uuid references public.profiles (id),
  add column expirado_em timestamptz,
  add column expirado_por uuid references public.profiles (id);

create unique index orders_cancellation_idempotency_idx
  on public.orders (cancelamento_idempotency_key)
  where cancelamento_idempotency_key is not null;

create index orders_pending_expiration_idx
  on public.orders (criado_em, id)
  where status = 'pendente';

comment on column public.orders.cancelamento_idempotency_key is
  'Chave idempotente do cancelamento de pedido pendente.';
comment on column public.orders.expirado_em is
  'Instante em que a rotina automática marcou o pedido como expirado.';

create or replace function public.cancel_pending_order(
  p_order_id uuid,
  p_idempotency_key uuid
)
returns table (
  order_id uuid,
  status text,
  gemn_liberado numeric(18, 2),
  cancelado_por uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_executor_id uuid := auth.uid();
  v_is_admin boolean;
  v_order public.orders%rowtype;
  v_reservation public.gemn_reservations%rowtype;
begin
  if v_executor_id is null then
    raise exception using errcode = 'P0001', message = 'usuário autenticado é obrigatório';
  end if;

  if p_order_id is null or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'pedido e idempotency_key são obrigatórios';
  end if;

  select p.is_admin into v_is_admin
    from public.profiles as p
   where p.id = v_executor_id;

  if not (v_executor_id = (select o.buyer_id from public.orders as o where o.id = p_order_id)
          or coalesce(v_is_admin, false)) then
    raise exception using errcode = 'P0001', message = 'usuário não pode cancelar este pedido';
  end if;

  select o.* into v_order
    from public.orders as o
   where o.id = p_order_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'pedido não encontrado';
  end if;

  if v_order.status = 'cancelado' then
    if v_order.cancelamento_idempotency_key = p_idempotency_key then
      return query select v_order.id, v_order.status,
        coalesce(v_order.gemn_utilizado, 0.00)::numeric(18, 2), v_order.cancelado_por;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'pedido já foi cancelado com outra chave';
  end if;

  if v_order.status <> 'pendente' then
    raise exception using errcode = 'P0001', message = 'somente pedidos pendentes podem ser cancelados';
  end if;

  if coalesce(v_order.gemn_utilizado, 0.00) > 0 then
    select r.* into v_reservation
      from public.gemn_reservations as r
     where r.order_id = v_order.id
     for update;

    if not found
       or v_reservation.buyer_id <> v_order.buyer_id
       or v_reservation.valor_gemn <> v_order.gemn_utilizado
       or v_reservation.status <> 'ativa' then
      raise exception using errcode = 'P0001', message = 'reserva GEMN ativa e consistente é obrigatória';
    end if;

    -- A RPC subjacente é SECURITY DEFINER e só tem EXECUTE para service_role.
    -- A chamada interna preserva auth.uid() no ledger, sem expor a RPC ao cliente.
    perform public.release_gemn_reservation(
      v_reservation.id, 'cancelamento', p_idempotency_key
    );
  end if;

  update public.orders
     set status = 'cancelado',
         cancelamento_idempotency_key = p_idempotency_key,
         cancelado_em = clock_timestamp(),
         cancelado_por = v_executor_id
   where id = v_order.id and status = 'pendente';

  if not found then
    raise exception using errcode = 'P0001', message = 'pedido foi processado concorrentemente';
  end if;

  return query select v_order.id, 'cancelado'::text,
    coalesce(v_order.gemn_utilizado, 0.00)::numeric(18, 2), v_executor_id;
end;
$$;
comment on function public.cancel_pending_order(uuid, uuid) is
  'Cancela pedido pendente pelo comprador ou administrador e libera reserva GEMN atomicamente.';

create or replace function public.expire_pending_orders(
  p_batch_size integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_reservation public.gemn_reservations%rowtype;
  v_expired integer := 0;
  v_release_key uuid;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 1000 then
    raise exception using errcode = 'P0001', message = 'batch_size deve estar entre 1 e 1000';
  end if;

  for v_order_id in
    select o.id
      from public.orders as o
     where o.status = 'pendente'
       and o.criado_em <= clock_timestamp() - interval '24 hours'
     order by o.criado_em asc, o.id asc
     limit p_batch_size
     for update skip locked
  loop
    select o.* into v_order
      from public.orders as o
     where o.id = v_order_id
     for update;

    if v_order.status <> 'pendente'
       or v_order.criado_em > clock_timestamp() - interval '24 hours' then
      continue;
    end if;

    if coalesce(v_order.gemn_utilizado, 0.00) > 0 then
      select r.* into v_reservation
        from public.gemn_reservations as r
       where r.order_id = v_order.id
       for update;

      if not found
         or v_reservation.buyer_id <> v_order.buyer_id
         or v_reservation.valor_gemn <> v_order.gemn_utilizado
         or v_reservation.status <> 'ativa' then
        raise exception using errcode = 'P0001', message = 'reserva GEMN ativa e consistente é obrigatória';
      end if;

      v_release_key := md5('gemn-expiracao:' || v_order.id::text)::uuid;
      perform public.release_gemn_reservation(
        v_reservation.id, 'expiracao', v_release_key
      );
    end if;

    update public.orders
       set status = 'expirado',
           expirado_em = clock_timestamp()
     where id = v_order.id and status = 'pendente';

    if found then
      v_expired := v_expired + 1;
    end if;
  end loop;

  return v_expired;
end;
$$;
comment on function public.expire_pending_orders(integer) is
  'Expira pedidos pendentes com 24 horas ou mais; destinada exclusivamente a scheduler privilegiado.';

revoke all on function public.cancel_pending_order(uuid, uuid) from public, anon;
grant execute on function public.cancel_pending_order(uuid, uuid) to authenticated;

revoke all on function public.expire_pending_orders(integer) from public, anon, authenticated;
grant execute on function public.expire_pending_orders(integer) to service_role;

-- O Supabase local deste projeto não possui pg_cron instalado. Em ambientes
-- que o disponibilizarem, o agendamento é registrado de forma idempotente;
-- caso contrário, a migration não falha e o scheduler externo deve chamar a
-- RPC com service_role a cada cinco minutos.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'gemn-expire-pending-orders') then
      perform cron.schedule(
        'gemn-expire-pending-orders',
        '*/5 * * * *',
        $job$select public.expire_pending_orders(100);$job$
      );
    end if;
  else
    raise notice 'pg_cron indisponível; expire_pending_orders requer scheduler externo service_role';
  end if;
end;
$$;
