-- GEMN: modelo auditável para cancelamento administrativo de pedidos confirmados.
-- Esta migration não executa estornos e não cria a RPC de cancelamento.

create table public.order_cancellations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  idempotency_key uuid not null,
  status_anterior text not null,
  executado_por uuid not null references public.profiles (id),
  motivo text not null,
  gemn_estornado numeric(18, 2) not null default 0.00,
  cashback_retirado numeric(18, 2) not null default 0.00,
  cashback_divida_criada numeric(18, 2) not null default 0.00,
  cashback_divida_restaurada numeric(18, 2) not null default 0.00,
  criado_em timestamptz not null default now(),
  executado_em timestamptz not null default now(),
  constraint order_cancellations_order_unique
    unique (order_id),
  constraint order_cancellations_idempotency_unique
    unique (idempotency_key),
  constraint order_cancellations_previous_status_check
    check (status_anterior = 'confirmado'),
  constraint order_cancellations_reason_not_blank_check
    check (btrim(motivo) <> ''),
  constraint order_cancellations_values_check
    check (
      gemn_estornado >= 0
      and cashback_retirado >= 0
      and cashback_divida_criada >= 0
      and cashback_divida_restaurada >= 0
      and gemn_estornado = round(gemn_estornado, 2)
      and cashback_retirado = round(cashback_retirado, 2)
      and cashback_divida_criada = round(cashback_divida_criada, 2)
      and cashback_divida_restaurada = round(cashback_divida_restaurada, 2)
    )
);

comment on table public.order_cancellations is
  'Registro imutável do cancelamento administrativo de pedido confirmado; não representa dinheiro real.';
comment on column public.order_cancellations.status_anterior is
  'Snapshot do status antes do estorno; nesta etapa deve ser confirmado.';
comment on column public.order_cancellations.gemn_estornado is
  'GEMN devolvido aos lotes de origem por estorno administrativo.';
comment on column public.order_cancellations.cashback_retirado is
  'Cashback ainda disponível removido durante o cancelamento.';
comment on column public.order_cancellations.cashback_divida_criada is
  'Cashback já consumido convertido em saldo_a_recuperar.';
comment on column public.order_cancellations.cashback_divida_restaurada is
  'Dívida anteriormente abatida pela confirmação e restaurada pelo cancelamento.';

create index order_cancellations_executor_created_idx
  on public.order_cancellations (executado_por, criado_em desc);

create index order_cancellations_order_created_idx
  on public.order_cancellations (order_id, criado_em desc);

create table public.order_cancellation_allocations (
  id uuid primary key default gen_random_uuid(),
  order_cancellation_id uuid not null references public.order_cancellations (id),
  order_id uuid not null references public.orders (id),
  reservation_id uuid not null references public.gemn_reservations (id),
  reservation_allocation_id uuid not null references public.gemn_reservation_allocations (id),
  cashback_lot_id uuid not null references public.cashback_lots (id),
  seller_origem_id uuid not null references public.sellers (id),
  seller_recebedor_id uuid not null references public.sellers (id),
  valor_gemn numeric(18, 2) not null,
  criado_em timestamptz not null default now(),
  constraint order_cancellation_allocations_allocation_unique
    unique (reservation_allocation_id),
  constraint order_cancellation_allocations_value_check
    check (
      valor_gemn > 0
      and valor_gemn = round(valor_gemn, 2)
      and valor_gemn <> 'NaN'::numeric
      and valor_gemn <> 'Infinity'::numeric
      and valor_gemn <> '-Infinity'::numeric
    )
);

comment on table public.order_cancellation_allocations is
  'Rastreabilidade imutável de cada alocação FIFO revertida por cancelamento administrativo.';
comment on column public.order_cancellation_allocations.reservation_allocation_id is
  'Identificador da alocação consumida originalmente; uma alocação só pode ser estornada uma vez.';

create index order_cancellation_allocations_cancellation_idx
  on public.order_cancellation_allocations (order_cancellation_id, criado_em, id);

create index order_cancellation_allocations_lot_idx
  on public.order_cancellation_allocations (cashback_lot_id, criado_em, id);

create index order_cancellation_allocations_seller_idx
  on public.order_cancellation_allocations (seller_origem_id, seller_recebedor_id, criado_em desc);

alter table public.gemn_reservations
  drop constraint gemn_reservations_status_check;

alter table public.gemn_reservations
  add constraint gemn_reservations_status_check
  check (status in ('ativa', 'efetivada', 'liberada', 'expirada', 'estornada'));

alter table public.gemn_reservations
  add column estornada_em timestamptz,
  add column estornada_por uuid references public.profiles (id),
  add column estorno_idempotency_key uuid,
  add column order_cancellation_id uuid references public.order_cancellations (id);

create unique index gemn_reservations_cancellation_unique_idx
  on public.gemn_reservations (order_cancellation_id)
  where order_cancellation_id is not null;

create unique index gemn_reservations_reversal_idempotency_idx
  on public.gemn_reservations (estorno_idempotency_key)
  where estorno_idempotency_key is not null;

alter table public.gemn_reservation_allocations
  drop constraint gemn_reservation_allocations_status_check;

alter table public.gemn_reservation_allocations
  add constraint gemn_reservation_allocations_status_check
  check (status in ('ativa', 'consumida', 'liberada', 'estornada'));

alter table public.gemn_reservation_allocations
  add column estornada_em timestamptz,
  add column estornada_por uuid references public.profiles (id),
  add column order_cancellation_id uuid references public.order_cancellations (id);

create index gemn_reservation_allocations_cancellation_idx
  on public.gemn_reservation_allocations (order_cancellation_id, criado_em, id)
  where order_cancellation_id is not null;

alter table public.wallet_transactions
  drop constraint wallet_transactions_tipo_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_tipo_check
  check (tipo in (
    'cashback_credito',
    'reserva_gemn',
    'liberacao_reserva',
    'debito_gemn',
    'credito_venda_gemn',
    'estorno_gemn',
    'estorno_cashback',
    'cashback_divida_criada',
    'cashback_recuperacao',
    'ajuste_administrativo',
    'compensacao_simulada'
  ));

comment on column public.wallet_transactions.tipo is
  'Tipo imutável da movimentação; estorno_cashback remove crédito disponível e cashback_divida_criada aumenta saldo_a_recuperar.';

alter table public.order_cancellations enable row level security;
alter table public.order_cancellation_allocations enable row level security;

create policy order_cancellations_select_own
  on public.order_cancellations
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.orders as o
       where o.id = order_id
         and o.buyer_id = (select auth.uid())
    )
  );

create policy order_cancellation_allocations_select_own
  on public.order_cancellation_allocations
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.orders as o
       where o.id = order_id
         and o.buyer_id = (select auth.uid())
    )
  );

revoke all on table public.order_cancellations from public, anon, authenticated;
revoke all on table public.order_cancellation_allocations from public, anon, authenticated;

grant select (
  id,
  order_id,
  idempotency_key,
  status_anterior,
  executado_por,
  motivo,
  gemn_estornado,
  cashback_retirado,
  cashback_divida_criada,
  cashback_divida_restaurada,
  criado_em,
  executado_em
)
on table public.order_cancellations
to authenticated;

grant select (
  id,
  order_cancellation_id,
  order_id,
  reservation_id,
  reservation_allocation_id,
  cashback_lot_id,
  seller_origem_id,
  seller_recebedor_id,
  valor_gemn,
  criado_em
)
on table public.order_cancellation_allocations
to authenticated;

revoke all on function public.set_gemn_reservation_updated_at() from public;
