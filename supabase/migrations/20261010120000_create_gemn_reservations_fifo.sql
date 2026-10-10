-- GEMN: reservas de GEMN e alocações FIFO por lote.
--
-- Esta migration não altera create_order. As RPCs abaixo permitem testar a
-- infraestrutura com pedidos pendentes já existentes e serão chamadas pela
-- futura integração transacional de criação de pedidos.

create table public.gemn_reservations (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id),
  order_id uuid not null references public.orders (id),
  buyer_id uuid not null references public.profiles (id),
  seller_recebedor_id uuid not null references public.sellers (id),
  valor_gemn numeric(18, 2) not null,
  status text not null default 'ativa',
  idempotency_key uuid not null,
  expira_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  liberado_em timestamptz,
  liberado_por uuid references public.profiles (id),
  liberacao_idempotency_key uuid,
  constraint gemn_reservations_one_per_order_unique
    unique (order_id),
  constraint gemn_reservations_operation_unique
    unique (wallet_id, idempotency_key),
  constraint gemn_reservations_release_operation_unique
    unique (liberacao_idempotency_key),
  constraint gemn_reservations_status_check
    check (status in ('ativa', 'efetivada', 'liberada', 'expirada')),
  constraint gemn_reservations_value_positive_check
    check (
      valor_gemn > 0
      and valor_gemn <> 'NaN'::numeric
      and valor_gemn <> 'Infinity'::numeric
      and valor_gemn <> '-Infinity'::numeric
    ),
  constraint gemn_reservations_expiration_check
    check (expira_em is null or expira_em > criado_em)
);

comment on table public.gemn_reservations is
  'Reservas simuladas de GEMN vinculadas a pedidos pendentes; não representam dinheiro real.';
comment on column public.gemn_reservations.seller_recebedor_id is
  'Vendedor do pedido que receberá o desconto GEMN; validado contra o item do pedido.';
comment on column public.gemn_reservations.status is
  'ativa aguarda confirmação, efetivada será consumida, liberada devolve saldo e expirada representa timeout.';

create unique index gemn_reservations_active_order_idx
  on public.gemn_reservations (order_id)
  where status = 'ativa';

create index gemn_reservations_buyer_created_idx
  on public.gemn_reservations (buyer_id, criado_em desc, id desc);

create index gemn_reservations_wallet_status_idx
  on public.gemn_reservations (wallet_id, status, criado_em desc);

create table public.gemn_reservation_allocations (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.gemn_reservations (id),
  cashback_lot_id uuid not null references public.cashback_lots (id),
  seller_origem_id uuid not null references public.sellers (id),
  seller_recebedor_id uuid not null references public.sellers (id),
  valor_gemn numeric(18, 2) not null,
  ordem_fifo integer not null,
  status text not null default 'ativa',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint gemn_reservation_allocations_lot_unique
    unique (reservation_id, cashback_lot_id),
  constraint gemn_reservation_allocations_fifo_unique
    unique (reservation_id, ordem_fifo),
  constraint gemn_reservation_allocations_status_check
    check (status in ('ativa', 'consumida', 'liberada')),
  constraint gemn_reservation_allocations_value_positive_check
    check (
      valor_gemn > 0
      and valor_gemn <> 'NaN'::numeric
      and valor_gemn <> 'Infinity'::numeric
      and valor_gemn <> '-Infinity'::numeric
    ),
  constraint gemn_reservation_allocations_fifo_positive_check
    check (ordem_fifo > 0)
);

comment on table public.gemn_reservation_allocations is
  'Alocações por lote de uma reserva; a ordem_fifo registra o consumo dos lotes mais antigos primeiro.';
comment on column public.gemn_reservation_allocations.seller_origem_id is
  'Vendedor que originou o lote de cashback alocado.';
comment on column public.gemn_reservation_allocations.seller_recebedor_id is
  'Vendedor do pedido que recebe o desconto GEMN; usado na futura compensação simulada.';

create index gemn_reservation_allocations_reservation_idx
  on public.gemn_reservation_allocations (reservation_id, ordem_fifo);

create index gemn_reservation_allocations_lot_idx
  on public.gemn_reservation_allocations (cashback_lot_id, status);

create index gemn_reservation_allocations_receiver_idx
  on public.gemn_reservation_allocations (seller_recebedor_id, criado_em desc);

alter table public.wallet_transactions
  add column reservation_id uuid references public.gemn_reservations (id);

comment on column public.wallet_transactions.reservation_id is
  'Reserva que originou a movimentação de reserva ou liberação, quando aplicável.';

create index wallet_transactions_reservation_idx
  on public.wallet_transactions (reservation_id)
  where reservation_id is not null;

create or replace function public.set_gemn_reservation_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger set_gemn_reservations_updated_at
  before update on public.gemn_reservations
  for each row
  execute function public.set_gemn_reservation_updated_at();

create trigger set_gemn_reservation_allocations_updated_at
  before update on public.gemn_reservation_allocations
  for each row
  execute function public.set_gemn_reservation_updated_at();

create or replace function public.reserve_gemn_for_order(
  p_order_id uuid,
  p_valor_gemn numeric,
  p_idempotency_key uuid,
  p_expira_em timestamptz default null
)
returns table (
  reservation_id uuid,
  order_id uuid,
  status text,
  valor_gemn numeric(18, 2),
  seller_recebedor_id uuid,
  expira_em timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_wallet public.wallets%rowtype;
  v_existing public.gemn_reservations%rowtype;
  v_seller_recebedor_id uuid;
  v_lot record;
  v_remaining numeric(18, 2);
  v_allocation numeric(18, 2);
  v_available_lots numeric(18, 2);
  v_allocation_order integer := 0;
  v_reservation_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'usuário autenticado é obrigatório';
  end if;

  if p_order_id is null then
    raise exception using errcode = 'P0001', message = 'pedido é obrigatório';
  end if;

  if p_valor_gemn is null
     or p_valor_gemn = 'NaN'::numeric
     or p_valor_gemn = 'Infinity'::numeric
     or p_valor_gemn = '-Infinity'::numeric
     or p_valor_gemn <= 0
     or p_valor_gemn <> round(p_valor_gemn, 2) then
    raise exception using errcode = 'P0001', message = 'valor GEMN deve ser positivo e possuir duas casas decimais';
  end if;

  if p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'idempotency_key é obrigatória';
  end if;

  if p_expira_em is not null and p_expira_em <= clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'expiração da reserva deve estar no futuro';
  end if;

  -- O pedido é bloqueado antes da carteira em todas as operações desta etapa.
  select o.*
    into v_order
    from public.orders as o
   where o.id = p_order_id
     and o.buyer_id = v_user_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'pedido não pertence ao usuário autenticado ou não existe';
  end if;

  select oi.seller_id
    into v_seller_recebedor_id
    from public.order_items as oi
   where oi.order_id = v_order.id;

  if not found then
    raise exception using errcode = 'P0001', message = 'pedido deve possuir um item para reservar GEMN';
  end if;

  if v_order.status <> 'pendente' then
    raise exception using errcode = 'P0001', message = 'somente pedidos pendentes podem reservar GEMN';
  end if;

  if p_valor_gemn > v_order.total_real then
    raise exception using errcode = 'P0001', message = 'reserva GEMN não pode superar o valor real do pedido';
  end if;

  insert into public.wallets (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select w.*
    into v_wallet
    from public.wallets as w
   where w.user_id = v_user_id
   for update;

  select r.*
    into v_existing
    from public.gemn_reservations as r
   where r.order_id = v_order.id
   for update;

  if found then
    if v_existing.idempotency_key = p_idempotency_key
       and v_existing.valor_gemn = p_valor_gemn
       and v_existing.seller_recebedor_id = v_seller_recebedor_id then
      return query
      select v_existing.id,
             v_existing.order_id,
             v_existing.status,
             v_existing.valor_gemn,
             v_existing.seller_recebedor_id,
             v_existing.expira_em;
      return;
    end if;

    raise exception using errcode = 'P0001', message = 'pedido já possui uma reserva com outra intenção';
  end if;

  if v_wallet.saldo_disponivel < p_valor_gemn then
    raise exception using errcode = 'P0001', message = 'saldo GEMN disponível insuficiente';
  end if;

  select coalesce(sum(cl.valor_disponivel), 0)
    into v_available_lots
    from public.cashback_lots as cl
   where cl.wallet_id = v_wallet.id
     and cl.valor_disponivel > 0;

  if v_available_lots <> v_wallet.saldo_disponivel then
    raise exception using errcode = 'P0001', message = 'saldo da carteira e saldo dos lotes estão inconsistentes';
  end if;

  if v_available_lots < p_valor_gemn then
    raise exception using errcode = 'P0001', message = 'lotes de cashback disponíveis insuficientes';
  end if;

  insert into public.gemn_reservations (
    wallet_id,
    order_id,
    buyer_id,
    seller_recebedor_id,
    valor_gemn,
    idempotency_key,
    expira_em
  )
  values (
    v_wallet.id,
    v_order.id,
    v_user_id,
    v_seller_recebedor_id,
    p_valor_gemn::numeric(18, 2),
    p_idempotency_key,
    p_expira_em
  )
  returning id into v_reservation_id;

  v_remaining := p_valor_gemn;

  for v_lot in
    select cl.id, cl.seller_origem_id, cl.valor_disponivel
      from public.cashback_lots as cl
     where cl.wallet_id = v_wallet.id
       and cl.valor_disponivel > 0
     order by cl.criado_em asc, cl.id asc
     for update
  loop
    exit when v_remaining = 0;
    v_allocation := least(v_remaining, v_lot.valor_disponivel);
    v_allocation_order := v_allocation_order + 1;

    insert into public.gemn_reservation_allocations (
      reservation_id,
      cashback_lot_id,
      seller_origem_id,
      seller_recebedor_id,
      valor_gemn,
      ordem_fifo
    )
    values (
      v_reservation_id,
      v_lot.id,
      v_lot.seller_origem_id,
      v_seller_recebedor_id,
      v_allocation,
      v_allocation_order
    );

    update public.cashback_lots
       set valor_disponivel = valor_disponivel - v_allocation,
           valor_reservado = valor_reservado + v_allocation
     where id = v_lot.id;

    v_remaining := v_remaining - v_allocation;
  end loop;

  if v_remaining <> 0 then
    raise exception using errcode = 'P0001', message = 'não foi possível alocar integralmente os lotes FIFO';
  end if;

  update public.wallets
     set saldo_disponivel = saldo_disponivel - p_valor_gemn,
         saldo_reservado = saldo_reservado + p_valor_gemn,
         versao = versao + 1
   where id = v_wallet.id;

  insert into public.wallet_transactions (
    wallet_id,
    order_id,
    reservation_id,
    tipo,
    valor,
    saldo_disponivel_apos,
    saldo_reservado_apos,
    saldo_a_recuperar_apos,
    idempotency_key,
    seller_recebedor_id,
    descricao
  )
  select w.id,
         v_order.id,
         v_reservation_id,
         'reserva_gemn',
         p_valor_gemn,
         w.saldo_disponivel,
         w.saldo_reservado,
         w.saldo_a_recuperar,
         p_idempotency_key,
         v_seller_recebedor_id,
         'Reserva GEMN de pedido pendente'
    from public.wallets as w
   where w.id = v_wallet.id;

  return query
  select r.id,
         r.order_id,
         r.status,
         r.valor_gemn,
         r.seller_recebedor_id,
         r.expira_em
    from public.gemn_reservations as r
   where r.id = v_reservation_id;
end;
$$;

comment on function public.reserve_gemn_for_order(uuid, numeric, uuid, timestamptz) is
  'Reserva GEMN do comprador autenticado por lotes FIFO, com atualização atômica da carteira e ledger.';

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

  select r.*
    into v_reservation
    from public.gemn_reservations as r
   where r.id = p_reservation_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'reserva não encontrada';
  end if;

  if v_reservation.status <> 'ativa' then
    if v_reservation.liberacao_idempotency_key = p_idempotency_key
       and v_reservation.status in ('liberada', 'expirada') then
      return query
      select v_reservation.id,
             v_reservation.order_id,
             v_reservation.status,
             v_reservation.valor_gemn,
             v_reservation.seller_recebedor_id;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'reserva já foi consumida ou liberada';
  end if;

  if p_motivo = 'expiracao'
     and (v_reservation.expira_em is null or v_reservation.expira_em > clock_timestamp()) then
    raise exception using errcode = 'P0001', message = 'reserva ainda não expirou';
  end if;

  select w.*
    into v_wallet
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

    update public.gemn_reservation_allocations
       set status = 'liberada'
     where id = v_allocation.id;
  end loop;

  update public.wallets
     set saldo_disponivel = saldo_disponivel + v_reservation.valor_gemn,
         saldo_reservado = saldo_reservado - v_reservation.valor_gemn,
         versao = versao + 1
   where id = v_wallet.id
     and saldo_reservado >= v_reservation.valor_gemn;

  if not found then
    raise exception using errcode = 'P0001', message = 'saldo reservado da carteira está inconsistente';
  end if;

  v_new_status := case when p_motivo = 'expiracao' then 'expirada' else 'liberada' end;

  insert into public.wallet_transactions (
    wallet_id,
    order_id,
    reservation_id,
    tipo,
    valor,
    saldo_disponivel_apos,
    saldo_reservado_apos,
    saldo_a_recuperar_apos,
    idempotency_key,
    seller_recebedor_id,
    executado_por,
    descricao
  )
  select w.id,
         v_reservation.order_id,
         v_reservation.id,
         'liberacao_reserva',
         v_reservation.valor_gemn,
         w.saldo_disponivel,
         w.saldo_reservado,
         w.saldo_a_recuperar,
         p_idempotency_key,
         v_reservation.seller_recebedor_id,
         v_executor_id,
         case when p_motivo = 'expiracao'
              then 'Liberação de reserva GEMN expirada'
              else 'Liberação de reserva GEMN por cancelamento'
          end
    from public.wallets as w
   where w.id = v_wallet.id;

  update public.gemn_reservations
     set status = v_new_status,
         atualizado_em = now(),
         liberado_em = now(),
         liberado_por = v_executor_id,
         liberacao_idempotency_key = p_idempotency_key
   where id = v_reservation.id;

  return query
  select r.id,
         r.order_id,
         r.status,
         r.valor_gemn,
         r.seller_recebedor_id
    from public.gemn_reservations as r
   where r.id = v_reservation.id;
end;
$$;

comment on function public.release_gemn_reservation(uuid, text, uuid) is
  'Libera atomicamente uma reserva ativa, devolvendo GEMN aos lotes FIFO; não é exposta ao comprador.';

alter table public.gemn_reservations enable row level security;
alter table public.gemn_reservation_allocations enable row level security;

create policy gemn_reservations_select_own
  on public.gemn_reservations
  for select
  to authenticated
  using ((select auth.uid()) = buyer_id);

create policy gemn_reservation_allocations_select_own
  on public.gemn_reservation_allocations
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.gemn_reservations as r
       where r.id = reservation_id
         and r.buyer_id = (select auth.uid())
    )
  );

revoke all on table public.gemn_reservations from public, anon, authenticated;
revoke all on table public.gemn_reservation_allocations from public, anon, authenticated;

grant select (
  id,
  wallet_id,
  order_id,
  buyer_id,
  seller_recebedor_id,
  valor_gemn,
  status,
  idempotency_key,
  expira_em,
  criado_em,
  atualizado_em,
  liberado_em,
  liberado_por,
  liberacao_idempotency_key
)
on table public.gemn_reservations
to authenticated;

grant select (
  id,
  reservation_id,
  cashback_lot_id,
  seller_origem_id,
  seller_recebedor_id,
  valor_gemn,
  ordem_fifo,
  status,
  criado_em,
  atualizado_em
)
on table public.gemn_reservation_allocations
to authenticated;

grant select (reservation_id)
on table public.wallet_transactions
to authenticated;

revoke all on function public.reserve_gemn_for_order(uuid, numeric, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reserve_gemn_for_order(uuid, numeric, uuid, timestamptz)
  to authenticated;

revoke all on function public.release_gemn_reservation(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.release_gemn_reservation(uuid, text, uuid)
  to service_role;

revoke all on function public.set_gemn_reservation_updated_at() from public;
