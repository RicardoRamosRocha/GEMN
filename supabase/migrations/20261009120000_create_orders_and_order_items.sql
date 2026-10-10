-- GEMN: estrutura persistente de pedidos para o MVP.
--
-- Esta etapa modela uma compra de um único listing por pedido. A criação
-- segura será exposta posteriormente por uma função transacional; portanto,
-- authenticated recebe somente leitura do próprio histórico.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id),
  idempotency_key uuid not null,
  status text not null default 'pendente',
  forma_pagamento text not null,
  total_real numeric(12, 2) not null,
  total_gemn numeric(12, 2),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint orders_status_check
    check (status in ('pendente', 'confirmado', 'concluido', 'cancelado')),
  constraint orders_buyer_idempotency_key_unique
    unique (buyer_id, idempotency_key),
  constraint orders_payment_method_check
    check (forma_pagamento in ('real', 'gemn')),
  constraint orders_total_real_nonnegative_check
    check (
      total_real >= 0
      and total_real <> 'NaN'::numeric
      and total_real <> 'Infinity'::numeric
      and total_real <> '-Infinity'::numeric
    ),
  constraint orders_total_gemn_nonnegative_check
    check (
      total_gemn is null
      or (
        total_gemn >= 0
        and total_gemn <> 'NaN'::numeric
        and total_gemn <> 'Infinity'::numeric
        and total_gemn <> '-Infinity'::numeric
      )
    ),
  constraint orders_gemn_payment_requires_total_check
    check (forma_pagamento <> 'gemn' or total_gemn is not null)
);

comment on table public.orders is
  'Pedidos do MVP; cada pedido possui exatamente um item nesta etapa.';
comment on column public.orders.idempotency_key is
  'Chave de retry por comprador; a futura RPC deve comparar listing, quantidade e forma de pagamento persistidos, sem usar precos atuais para decidir se a intencao e a mesma.';
comment on column public.orders.buyer_id is
  'Usuário do Supabase Auth que realizou o pedido, via profiles.id.';
comment on column public.orders.total_real is
  'Snapshot do subtotal em reais no momento da compra.';
comment on column public.orders.total_gemn is
  'Snapshot do subtotal em GEMN quando o listing aceitar GEMN.';
comment on column public.orders.status is
  'Estado operacional: pendente, confirmado, concluido ou cancelado.';

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  listing_id uuid not null references public.listings (id),
  seller_id uuid not null references public.sellers (id),
  nome_item text not null,
  tipo text not null,
  quantidade integer not null,
  preco_real_unitario numeric(12, 2) not null,
  preco_gemn_unitario numeric(12, 2),
  subtotal_real numeric(12, 2) not null,
  subtotal_gemn numeric(12, 2),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint order_items_one_item_per_order_unique
    unique (order_id),
  constraint order_items_name_not_blank_check
    check (btrim(nome_item) <> ''),
  constraint order_items_type_check
    check (tipo in ('produto', 'servico')),
  constraint order_items_quantity_positive_check
    check (quantidade > 0),
  constraint order_items_real_price_nonnegative_check
    check (
      preco_real_unitario >= 0
      and subtotal_real >= 0
      and preco_real_unitario <> 'NaN'::numeric
      and preco_real_unitario <> 'Infinity'::numeric
      and preco_real_unitario <> '-Infinity'::numeric
      and subtotal_real <> 'NaN'::numeric
      and subtotal_real <> 'Infinity'::numeric
      and subtotal_real <> '-Infinity'::numeric
    ),
  constraint order_items_real_subtotal_consistency_check
    check (subtotal_real = round(preco_real_unitario * quantidade, 2)),
  constraint order_items_gemn_price_consistency_check
    check (
      (preco_gemn_unitario is null and subtotal_gemn is null)
      or (
        preco_gemn_unitario is not null
        and preco_gemn_unitario >= 0
        and subtotal_gemn is not null
        and subtotal_gemn >= 0
        and preco_gemn_unitario <> 'NaN'::numeric
        and preco_gemn_unitario <> 'Infinity'::numeric
        and preco_gemn_unitario <> '-Infinity'::numeric
        and subtotal_gemn <> 'NaN'::numeric
        and subtotal_gemn <> 'Infinity'::numeric
        and subtotal_gemn <> '-Infinity'::numeric
        and subtotal_gemn = round(preco_gemn_unitario * quantidade, 2)
      )
    )
);

comment on table public.order_items is
  'Snapshot do listing comprado; o MVP limita cada pedido a um item.';
comment on column public.order_items.nome_item is
  'Nome do listing no momento da compra; não depende de alterações futuras.';
comment on column public.order_items.seller_id is
  'Snapshot relacional do vendedor responsável pelo listing no momento da compra.';
comment on column public.order_items.preco_real_unitario is
  'Preço unitário em reais capturado no momento da compra.';
comment on column public.order_items.preco_gemn_unitario is
  'Preço unitário em GEMN capturado quando aplicável.';

create index orders_buyer_created_at_idx
  on public.orders (buyer_id, criado_em desc);

create index order_items_seller_created_at_idx
  on public.order_items (seller_id, criado_em desc);

create index order_items_listing_idx
  on public.order_items (listing_id);

create or replace function public.set_order_updated_at()
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

-- Todo pedido nasce pendente. Nenhum caminho de INSERT, inclusive
-- privilegiado, pode criar diretamente um pedido confirmado.
create or replace function public.validate_order_insert_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status <> 'pendente' then
    raise exception using
      errcode = 'P0001',
      message = 'novo pedido deve iniciar com status pendente';
  end if;

  return new;
end;
$$;

create trigger validate_orders_insert_status
  before insert on public.orders
  for each row
  execute function public.validate_order_insert_status();

create trigger set_orders_updated_at
  before update on public.orders
  for each row
  execute function public.set_order_updated_at();

create trigger set_order_items_updated_at
  before update on public.order_items
  for each row
  execute function public.set_order_updated_at();

-- seller_id, tipo e preços são derivados do listing, não de dados confiados
-- pelo cliente. O listing precisa estar publicável no instante da inclusão.
-- A futura RPC deve selecionar o listing e o seller com FOR UPDATE OF l, s
-- antes de calcular o snapshot, para serializar compra contra alteracoes de
-- preco/status do listing ou do seller.
create or replace function public.validate_order_item_listing()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_listing record;
begin
  if tg_op = 'UPDATE'
     and (
       new.order_id is distinct from old.order_id
       or new.listing_id is distinct from old.listing_id
       or new.seller_id is distinct from old.seller_id
       or new.nome_item is distinct from old.nome_item
       or new.tipo is distinct from old.tipo
       or new.quantidade is distinct from old.quantidade
       or new.preco_real_unitario is distinct from old.preco_real_unitario
       or new.preco_gemn_unitario is distinct from old.preco_gemn_unitario
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'intencao e snapshot do item nao podem ser alterados';
  end if;

  select
    l.seller_id,
    l.tipo,
    l.nome,
    l.preco_real,
    l.preco_gemn,
    l.status as listing_status,
    s.status as seller_status
    into v_listing
    from public.listings as l
    join public.sellers as s on s.id = l.seller_id
   where l.id = new.listing_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'listing do pedido não foi encontrado';
  end if;

  if v_listing.listing_status <> 'ativo' or v_listing.seller_status <> 'ativo' then
    raise exception using
      errcode = 'P0001',
      message = 'pedido exige listing e seller ativos';
  end if;

  if new.seller_id is distinct from v_listing.seller_id
     or new.tipo is distinct from v_listing.tipo
     or new.nome_item is distinct from v_listing.nome
     or new.preco_real_unitario is distinct from v_listing.preco_real
     or new.preco_gemn_unitario is distinct from v_listing.preco_gemn then
    raise exception using
      errcode = 'P0001',
      message = 'snapshot do item não corresponde ao listing atual';
  end if;

  return new;
end;
$$;

create trigger validate_order_item_listing_before_write
  before insert or update on public.order_items
  for each row
  execute function public.validate_order_item_listing();

-- Pedidos fazem parte do historico e nao devem perder seu unico item. A
-- exclusao fisica nao e um fluxo do MVP: cancelamento deve ser representado
-- pelo status, preservando o pedido e seu snapshot.
create or replace function public.prevent_order_item_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
      from public.orders as o
     where o.id = old.order_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'item de pedido nao pode ser excluido; cancele o pedido';
  end if;

  return old;
end;
$$;

create trigger prevent_order_item_delete_trigger
  before delete on public.order_items
  for each row
  execute function public.prevent_order_item_delete();

-- Como cada pedido possui um único item nesta etapa, estes triggers deferred
-- garantem a consistência entre os totais do cabeçalho e os subtotais do item
-- ao final da transação que será usada pela futura função de criação.
create or replace function public.validate_order_totals_from_order()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item public.order_items%rowtype;
begin
  select * into v_item
    from public.order_items
   where order_id = new.id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'pedido deve possuir exatamente um item';
  end if;

  if new.total_real is distinct from v_item.subtotal_real
     or new.total_gemn is distinct from v_item.subtotal_gemn then
    raise exception using
      errcode = 'P0001',
      message = 'totais do pedido não correspondem ao item';
  end if;

  return new;
end;
$$;

create or replace function public.validate_order_totals_from_item()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order
    from public.orders
   where id = new.order_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'item deve pertencer a um pedido existente';
  end if;

  if v_order.total_real is distinct from new.subtotal_real
     or v_order.total_gemn is distinct from new.subtotal_gemn then
    raise exception using
      errcode = 'P0001',
      message = 'subtotal do item não corresponde aos totais do pedido';
  end if;

  return new;
end;
$$;

create constraint trigger validate_order_totals_after_order_write
  after insert or update on public.orders
  deferrable initially deferred
  for each row
  execute function public.validate_order_totals_from_order();

create constraint trigger validate_order_totals_after_item_write
  after insert or update on public.order_items
  deferrable initially deferred
  for each row
  execute function public.validate_order_totals_from_item();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy orders_select_own
  on public.orders
  for select
  to authenticated
  using ((select auth.uid()) = buyer_id);

create policy order_items_select_own_order
  on public.order_items
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

-- Nenhuma policy de INSERT, UPDATE ou DELETE é criada nesta etapa. A função
-- transacional da Sprint 2.2 será o único caminho de criação/modificação para
-- usuários autenticados, após validação de preço, listing e pagamento.
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.orders from public;
revoke all on table public.order_items from public;

grant select (
  id,
  buyer_id,
  status,
  forma_pagamento,
  total_real,
  total_gemn,
  criado_em,
  atualizado_em
)
on table public.orders
to authenticated;

grant select (
  id,
  order_id,
  listing_id,
  seller_id,
  nome_item,
  tipo,
  quantidade,
  preco_real_unitario,
  preco_gemn_unitario,
  subtotal_real,
  subtotal_gemn,
  criado_em,
  atualizado_em
)
on table public.order_items
to authenticated;

revoke all on function public.set_order_updated_at() from public;
revoke all on function public.validate_order_insert_status() from public;
revoke all on function public.validate_order_item_listing() from public;
revoke all on function public.validate_order_totals_from_order() from public;
revoke all on function public.validate_order_totals_from_item() from public;
revoke all on function public.prevent_order_item_delete() from public;
