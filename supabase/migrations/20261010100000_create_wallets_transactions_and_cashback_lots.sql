-- GEMN: persistência inicial da carteira e dos lotes de cashback.
--
-- Esta migration cria somente a estrutura financeira simulada. Nenhuma RPC
-- existente, inclusive create_order, é alterada nesta etapa. As tabelas não
-- recebem escrita direta de clientes; futuras movimentações deverão ocorrer
-- em funções transacionais SECURITY DEFINER.

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  saldo_disponivel numeric(18, 2) not null default 0,
  saldo_reservado numeric(18, 2) not null default 0,
  saldo_a_recuperar numeric(18, 2) not null default 0,
  versao bigint not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint wallets_user_unique
    unique (user_id),
  constraint wallets_saldo_disponivel_check
    check (
      saldo_disponivel >= 0
      and saldo_disponivel <> 'NaN'::numeric
      and saldo_disponivel <> 'Infinity'::numeric
      and saldo_disponivel <> '-Infinity'::numeric
    ),
  constraint wallets_saldo_reservado_check
    check (
      saldo_reservado >= 0
      and saldo_reservado <> 'NaN'::numeric
      and saldo_reservado <> 'Infinity'::numeric
      and saldo_reservado <> '-Infinity'::numeric
    ),
  constraint wallets_saldo_a_recuperar_check
    check (
      saldo_a_recuperar >= 0
      and saldo_a_recuperar <> 'NaN'::numeric
      and saldo_a_recuperar <> 'Infinity'::numeric
      and saldo_a_recuperar <> '-Infinity'::numeric
    ),
  constraint wallets_versao_nonnegative_check
    check (versao >= 0)
);

comment on table public.wallets is
  'Carteiras GEMN simuladas; o saldo é controlado exclusivamente por funções do backend.';
comment on column public.wallets.saldo_disponivel is
  'GEMN disponível para novas reservas ou utilizações; nunca pode ser negativo.';
comment on column public.wallets.saldo_reservado is
  'GEMN bloqueado por pedidos pendentes.';
comment on column public.wallets.saldo_a_recuperar is
  'GEMN de cashback já utilizado que deverá ser compensado por créditos futuros.';
comment on column public.wallets.versao is
  'Versão lógica para concorrência otimista; locks de linha continuam sendo obrigatórios.';

create index wallets_user_idx
  on public.wallets (user_id);

create or replace function public.set_wallet_updated_at()
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

create trigger set_wallets_updated_at
  before update on public.wallets
  for each row
  execute function public.set_wallet_updated_at();

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id),
  order_id uuid null references public.orders (id),
  cashback_lot_id uuid null,
  tipo text not null,
  valor numeric(18, 2) not null,
  saldo_disponivel_apos numeric(18, 2) not null,
  saldo_reservado_apos numeric(18, 2) not null,
  saldo_a_recuperar_apos numeric(18, 2) not null,
  idempotency_key uuid not null,
  seller_origem_id uuid null references public.sellers (id),
  seller_recebedor_id uuid null references public.sellers (id),
  descricao text not null,
  executado_por uuid null references public.profiles (id),
  criado_em timestamptz not null default now(),
  constraint wallet_transactions_tipo_check
    check (tipo in (
      'cashback_credito',
      'reserva_gemn',
      'liberacao_reserva',
      'debito_gemn',
      'credito_venda_gemn',
      'estorno_gemn',
      'cashback_recuperacao',
      'ajuste_administrativo',
      'compensacao_simulada'
    )),
  constraint wallet_transactions_valor_positive_check
    check (
      valor > 0
      and valor <> 'NaN'::numeric
      and valor <> 'Infinity'::numeric
      and valor <> '-Infinity'::numeric
    ),
  constraint wallet_transactions_saldo_disponivel_check
    check (
      saldo_disponivel_apos >= 0
      and saldo_disponivel_apos <> 'NaN'::numeric
      and saldo_disponivel_apos <> 'Infinity'::numeric
      and saldo_disponivel_apos <> '-Infinity'::numeric
    ),
  constraint wallet_transactions_saldo_reservado_check
    check (
      saldo_reservado_apos >= 0
      and saldo_reservado_apos <> 'NaN'::numeric
      and saldo_reservado_apos <> 'Infinity'::numeric
      and saldo_reservado_apos <> '-Infinity'::numeric
    ),
  constraint wallet_transactions_saldo_a_recuperar_check
    check (
      saldo_a_recuperar_apos >= 0
      and saldo_a_recuperar_apos <> 'NaN'::numeric
      and saldo_a_recuperar_apos <> 'Infinity'::numeric
      and saldo_a_recuperar_apos <> '-Infinity'::numeric
    ),
  constraint wallet_transactions_descricao_not_blank_check
    check (btrim(descricao) <> ''),
  constraint wallet_transactions_operation_unique
    unique (wallet_id, idempotency_key, tipo)
);

comment on table public.wallet_transactions is
  'Ledger imutável da carteira GEMN; valores são simulados e não representam dinheiro real.';
comment on column public.wallet_transactions.seller_origem_id is
  'Vendedor que originou o lote ou obrigação de cashback, quando aplicável.';
comment on column public.wallet_transactions.seller_recebedor_id is
  'Vendedor que receberá GEMN em um consumo futuro; preenchido na alocação/compensação.';
comment on column public.wallet_transactions.saldo_disponivel_apos is
  'Snapshot auditável do saldo disponível após a movimentação.';

create index wallet_transactions_wallet_created_idx
  on public.wallet_transactions (wallet_id, criado_em desc, id desc);

create index wallet_transactions_order_idx
  on public.wallet_transactions (order_id)
  where order_id is not null;

create index wallet_transactions_cashback_lot_idx
  on public.wallet_transactions (cashback_lot_id)
  where cashback_lot_id is not null;

create index wallet_transactions_seller_recebedor_idx
  on public.wallet_transactions (seller_recebedor_id, criado_em desc)
  where seller_recebedor_id is not null;

create table public.cashback_lots (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id),
  order_id uuid not null references public.orders (id),
  order_item_id uuid not null references public.order_items (id),
  seller_origem_id uuid not null references public.sellers (id),
  valor_original numeric(18, 2) not null,
  valor_disponivel numeric(18, 2) not null default 0,
  valor_reservado numeric(18, 2) not null default 0,
  valor_consumido numeric(18, 2) not null default 0,
  valor_a_recuperar numeric(18, 2) not null default 0,
  status text not null default 'pendente',
  criado_em timestamptz not null default now(),
  liberado_em timestamptz null,
  atualizado_em timestamptz not null default now(),
  constraint cashback_lots_one_lot_per_order_item_unique
    unique (order_item_id),
  constraint cashback_lots_status_check
    check (status in ('pendente', 'disponivel', 'esgotado', 'estornado')),
  constraint cashback_lots_values_nonnegative_check
    check (
      valor_original >= 0
      and valor_disponivel >= 0
      and valor_reservado >= 0
      and valor_consumido >= 0
      and valor_a_recuperar >= 0
      and valor_original <> 'NaN'::numeric
      and valor_disponivel <> 'NaN'::numeric
      and valor_reservado <> 'NaN'::numeric
      and valor_consumido <> 'NaN'::numeric
      and valor_a_recuperar <> 'NaN'::numeric
    ),
  constraint cashback_lots_values_within_original_check
    check (
      valor_disponivel
        + valor_reservado
        + valor_consumido
        + valor_a_recuperar <= valor_original
    )
);

comment on table public.cashback_lots is
  'Lotes de cashback por pedido, preparados para reserva e consumo FIFO; não representam dinheiro real.';
comment on column public.cashback_lots.seller_origem_id is
  'Vendedor que financiou/concedeu o cashback deste lote.';
comment on column public.cashback_lots.valor_disponivel is
  'Parte do lote liberada e ainda não reservada, consumida ou enviada para recuperação.';
comment on column public.cashback_lots.valor_reservado is
  'Parte do lote comprometida por uma reserva futura de consumo GEMN.';
comment on column public.cashback_lots.valor_consumido is
  'Parte do lote já utilizada; a alocação deverá consumir lotes por criado_em/id.';

create index cashback_lots_fifo_idx
  on public.cashback_lots (wallet_id, criado_em asc, id asc)
  where valor_disponivel > 0;

create index cashback_lots_order_idx
  on public.cashback_lots (order_id);

create index cashback_lots_origin_seller_idx
  on public.cashback_lots (seller_origem_id, criado_em desc);

alter table public.wallet_transactions
  add constraint wallet_transactions_cashback_lot_fk
    foreign key (cashback_lot_id) references public.cashback_lots (id);

create or replace function public.set_cashback_lot_updated_at()
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

create trigger set_cashback_lots_updated_at
  before update on public.cashback_lots
  for each row
  execute function public.set_cashback_lot_updated_at();

-- O ledger é histórico: nenhuma alteração ou exclusão física é permitida.
-- Correções futuras deverão ser novos lançamentos compensatórios.
create or replace function public.prevent_wallet_transaction_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'movimentações da carteira são imutáveis';
end;
$$;

create trigger prevent_wallet_transactions_update
  before update on public.wallet_transactions
  for each row
  execute function public.prevent_wallet_transaction_mutation();

create trigger prevent_wallet_transactions_delete
  before delete on public.wallet_transactions
  for each row
  execute function public.prevent_wallet_transaction_mutation();

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.cashback_lots enable row level security;

create policy wallets_select_own
  on public.wallets
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy wallet_transactions_select_own
  on public.wallet_transactions
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.wallets as w
       where w.id = wallet_id
         and w.user_id = (select auth.uid())
    )
  );

create policy cashback_lots_select_own
  on public.cashback_lots
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.wallets as w
       where w.id = wallet_id
         and w.user_id = (select auth.uid())
    )
  );

revoke all on table public.wallets from public, anon, authenticated;
revoke all on table public.wallet_transactions from public, anon, authenticated;
revoke all on table public.cashback_lots from public, anon, authenticated;

grant select (
  id,
  user_id,
  saldo_disponivel,
  saldo_reservado,
  saldo_a_recuperar,
  versao,
  criado_em,
  atualizado_em
)
on table public.wallets
to authenticated;

grant select (
  id,
  wallet_id,
  order_id,
  cashback_lot_id,
  tipo,
  valor,
  saldo_disponivel_apos,
  saldo_reservado_apos,
  saldo_a_recuperar_apos,
  seller_origem_id,
  seller_recebedor_id,
  descricao,
  executado_por,
  criado_em
)
on table public.wallet_transactions
to authenticated;

grant select (
  id,
  wallet_id,
  order_id,
  order_item_id,
  seller_origem_id,
  valor_original,
  valor_disponivel,
  valor_reservado,
  valor_consumido,
  valor_a_recuperar,
  status,
  criado_em,
  liberado_em,
  atualizado_em
)
on table public.cashback_lots
to authenticated;

revoke all on function public.set_wallet_updated_at() from public;
revoke all on function public.set_cashback_lot_updated_at() from public;
revoke all on function public.prevent_wallet_transaction_mutation() from public;
