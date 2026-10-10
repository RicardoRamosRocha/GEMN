-- GEMN Sprint 2.4B Etapa 3B: pagamento misto e reserva transacional.

alter table public.sellers
  add column aceita_gemn boolean not null default false;

comment on column public.sellers.aceita_gemn is
  'Indica se o vendedor aceita GEMN como desconto em seus anúncios.';

alter table public.orders
  add column gemn_utilizado numeric(12, 2) not null default 0,
  add column valor_devido_real numeric(12, 2) not null default 0;

update public.orders
   set valor_devido_real = total_real,
       gemn_utilizado = 0;

set constraints all immediate;

alter table public.orders
  drop constraint orders_payment_method_check,
  add constraint orders_payment_method_check
    check (forma_pagamento in ('real', 'gemn', 'misto')),
  add constraint orders_gemn_used_check
    check (
      gemn_utilizado >= 0
      and gemn_utilizado <= total_real
      and gemn_utilizado = round(gemn_utilizado, 2)
      and gemn_utilizado <> 'NaN'::numeric
      and gemn_utilizado <> 'Infinity'::numeric
      and gemn_utilizado <> '-Infinity'::numeric
    ),
  add constraint orders_due_real_check
    check (
      valor_devido_real = round(total_real - gemn_utilizado, 2)
      and valor_devido_real >= 0
      and valor_devido_real <> 'NaN'::numeric
      and valor_devido_real <> 'Infinity'::numeric
      and valor_devido_real <> '-Infinity'::numeric
    );

alter table public.order_items
  add column cashback_rule_id uuid references public.cashback_rules (id),
  add column cashback_percentual numeric(5, 2) not null default 0,
  add column cashback_previsto numeric(12, 2) not null default 0;

alter table public.order_items
  add constraint order_items_cashback_percentual_check
    check (
      cashback_percentual >= 0
      and cashback_percentual <= 20
      and cashback_percentual = round(cashback_percentual, 2)
      and cashback_percentual <> 'NaN'::numeric
      and cashback_percentual <> 'Infinity'::numeric
      and cashback_percentual <> '-Infinity'::numeric
    ),
  add constraint order_items_cashback_previsto_check
    check (
      cashback_previsto >= 0
      and cashback_previsto = round(cashback_previsto, 2)
      and cashback_previsto <> 'NaN'::numeric
      and cashback_previsto <> 'Infinity'::numeric
      and cashback_previsto <> '-Infinity'::numeric
    );

comment on column public.orders.total_real is
  'Snapshot do valor bruto em reais antes do desconto GEMN.';
comment on column public.orders.gemn_utilizado is
  'Quantidade de GEMN reservada no pedido; 1 GEMN equivale a R$ 1,00 de desconto.';
comment on column public.orders.valor_devido_real is
  'Valor restante devido em reais após o desconto GEMN.';
comment on column public.order_items.cashback_percentual is
  'Snapshot da regra vigente do vendedor no momento da criação do pedido.';
comment on column public.order_items.cashback_previsto is
  'Cashback previsto sobre valor_devido_real; não é crédito efetivo nesta etapa.';

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
  v_seller_accepts boolean;
  v_seller_status text;
  v_listing_accepts boolean;
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

  select o.*
    into v_order
    from public.orders as o
   where o.id = p_order_id
     and o.buyer_id = v_user_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'pedido não pertence ao usuário autenticado ou não existe';
  end if;

  if v_order.status <> 'pendente' then
    raise exception using errcode = 'P0001', message = 'somente pedidos pendentes podem reservar GEMN';
  end if;

  if v_order.gemn_utilizado is distinct from p_valor_gemn::numeric(12, 2) then
    raise exception using errcode = 'P0001', message = 'valor da reserva não corresponde ao GEMN persistido no pedido';
  end if;

  select oi.seller_id, l.aceita_gemn, s.aceita_gemn, s.status
    into v_seller_recebedor_id, v_listing_accepts, v_seller_accepts, v_seller_status
    from public.order_items as oi
    join public.listings as l on l.id = oi.listing_id
    join public.sellers as s on s.id = oi.seller_id
   where oi.order_id = v_order.id;

  if not found then
    raise exception using errcode = 'P0001', message = 'pedido deve possuir item, anúncio e vendedor válidos';
  end if;

  if v_seller_status <> 'ativo'
     or not v_seller_accepts
     or not v_listing_accepts then
    raise exception using errcode = 'P0001', message = 'vendedor e anúncio devem aceitar GEMN e estar ativos';
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
      select v_existing.id, v_existing.order_id, v_existing.status,
             v_existing.valor_gemn, v_existing.seller_recebedor_id,
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
    wallet_id, order_id, buyer_id, seller_recebedor_id,
    valor_gemn, idempotency_key, expira_em
  )
  values (
    v_wallet.id, v_order.id, v_user_id, v_seller_recebedor_id,
    p_valor_gemn::numeric(18, 2), p_idempotency_key, p_expira_em
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
      reservation_id, cashback_lot_id, seller_origem_id,
      seller_recebedor_id, valor_gemn, ordem_fifo
    )
    values (
      v_reservation_id, v_lot.id, v_lot.seller_origem_id,
      v_seller_recebedor_id, v_allocation, v_allocation_order
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
    wallet_id, order_id, reservation_id, tipo, valor,
    saldo_disponivel_apos, saldo_reservado_apos, saldo_a_recuperar_apos,
    idempotency_key, seller_recebedor_id, descricao
  )
  select w.id, v_order.id, v_reservation_id, 'reserva_gemn', p_valor_gemn,
         w.saldo_disponivel, w.saldo_reservado, w.saldo_a_recuperar,
         p_idempotency_key, v_seller_recebedor_id,
         'Reserva GEMN de pedido pendente'
    from public.wallets as w
   where w.id = v_wallet.id;

  return query
  select r.id, r.order_id, r.status, r.valor_gemn,
         r.seller_recebedor_id, r.expira_em
    from public.gemn_reservations as r
   where r.id = v_reservation_id;
end;
$$;

create or replace function public.create_order(
  p_listing_id uuid,
  p_quantidade integer,
  p_forma_pagamento text,
  p_idempotency_key uuid,
  p_gemn_utilizado numeric
)
returns table (
  order_id uuid,
  status text,
  forma_pagamento text,
  quantidade integer,
  total_real numeric(12, 2),
  total_gemn numeric(12, 2),
  gemn_utilizado numeric(12, 2),
  valor_devido_real numeric(12, 2),
  cashback_percentual numeric(5, 2),
  cashback_previsto numeric(12, 2)
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_buyer_id uuid := auth.uid();
  v_existing_order public.orders%rowtype;
  v_existing_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_listing record;
  v_rule public.cashback_rules%rowtype;
  v_seller_id uuid;
  v_seller_status text;
  v_total_real numeric(12, 2);
  v_gemn_utilizado numeric(12, 2);
  v_valor_devido_real numeric(12, 2);
  v_cashback_percentual numeric(5, 2) := 0;
  v_cashback_previsto numeric(12, 2);
begin
  if v_buyer_id is null then
    raise exception using errcode = 'P0001', message = 'usuário autenticado é obrigatório';
  end if;

  if p_listing_id is null or p_quantidade is null or p_quantidade <= 0 then
    raise exception using errcode = 'P0001', message = 'listing e quantidade válida são obrigatórios';
  end if;

  if p_forma_pagamento is null
     or p_forma_pagamento not in ('real', 'gemn', 'misto') then
    raise exception using errcode = 'P0001', message = 'forma de pagamento inválida';
  end if;

  if p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'idempotency_key é obrigatória';
  end if;

  if p_gemn_utilizado is null
     or p_gemn_utilizado < 0
     or p_gemn_utilizado <> round(p_gemn_utilizado, 2)
     or p_gemn_utilizado = 'NaN'::numeric
     or p_gemn_utilizado = 'Infinity'::numeric
     or p_gemn_utilizado = '-Infinity'::numeric then
    raise exception using errcode = 'P0001', message = 'GEMN utilizado deve ser não negativo e possuir duas casas decimais';
  end if;

  select o.* into v_existing_order
    from public.orders as o
   where o.buyer_id = v_buyer_id
     and o.idempotency_key = p_idempotency_key;

  if found then
    select oi.* into v_existing_item
      from public.order_items as oi where oi.order_id = v_existing_order.id;

    if not found then
      raise exception using errcode = 'P0001', message = 'pedido idempotente está sem item';
    end if;

    if v_existing_item.listing_id is distinct from p_listing_id
       or v_existing_item.quantidade is distinct from p_quantidade
       or v_existing_order.forma_pagamento is distinct from p_forma_pagamento
       or v_existing_order.gemn_utilizado is distinct from p_gemn_utilizado::numeric(12, 2) then
      raise exception using errcode = 'P0001', message = 'idempotency_key já foi usada com outra intenção de compra';
    end if;

    return query
    select v_existing_order.id, v_existing_order.status,
           v_existing_order.forma_pagamento, v_existing_item.quantidade,
           v_existing_order.total_real, v_existing_order.total_gemn,
           v_existing_order.gemn_utilizado, v_existing_order.valor_devido_real,
           v_existing_item.cashback_percentual, v_existing_item.cashback_previsto;
    return;
  end if;

  select l.seller_id
    into v_seller_id
    from public.listings as l
   where l.id = p_listing_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'listing não encontrado';
  end if;

  select s.status
    into v_seller_status
    from public.sellers as s
   where s.id = v_seller_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'seller do listing não encontrado';
  end if;

  select
    l.id, l.seller_id, l.tipo, l.nome, l.preco_real, l.preco_gemn,
    l.aceita_gemn, l.status as listing_status,
    s.status as seller_status, s.aceita_gemn as seller_accepts
    into v_listing
    from public.listings as l
    join public.sellers as s on s.id = l.seller_id
   where l.id = p_listing_id and l.seller_id = v_seller_id
   for update of l;

  if not found
     or v_listing.listing_status <> 'ativo'
     or v_listing.seller_status <> 'ativo' then
    raise exception using errcode = 'P0001', message = 'listing e seller devem estar ativos';
  end if;

  v_total_real := round(v_listing.preco_real * p_quantidade, 2);
  v_gemn_utilizado := p_gemn_utilizado::numeric(12, 2);

  if v_gemn_utilizado > v_total_real then
    raise exception using errcode = 'P0001', message = 'GEMN utilizado não pode superar o valor do pedido';
  end if;

  if p_forma_pagamento = 'real' and v_gemn_utilizado <> 0 then
    raise exception using errcode = 'P0001', message = 'pagamento em reais não pode utilizar GEMN';
  end if;

  if p_forma_pagamento = 'gemn' and v_gemn_utilizado <> v_total_real then
    raise exception using errcode = 'P0001', message = 'pagamento 100% GEMN exige o valor total do pedido';
  end if;

  if p_forma_pagamento = 'misto'
     and (v_gemn_utilizado <= 0 or v_gemn_utilizado >= v_total_real) then
    raise exception using errcode = 'P0001', message = 'pagamento misto deve utilizar GEMN entre 0% e 100% do pedido';
  end if;

  if v_gemn_utilizado > 0
     and (not v_listing.aceita_gemn
          or v_listing.preco_gemn is null
          or not v_listing.seller_accepts) then
    raise exception using errcode = 'P0001', message = 'vendedor e anúncio não aceitam GEMN';
  end if;

  if v_gemn_utilizado > 0 then
    select cr.*
      into v_rule
      from public.cashback_rules as cr
     where cr.seller_id = v_seller_id
       and cr.vigente_ate is null
     order by cr.vigente_desde desc, cr.id desc
     limit 1;

    if found then
      v_cashback_percentual := v_rule.percentual;
    end if;
  end if;

  v_valor_devido_real := round(v_total_real - v_gemn_utilizado, 2);
  v_cashback_previsto := round(v_valor_devido_real * v_cashback_percentual / 100, 2);

  insert into public.orders (
    buyer_id, idempotency_key, status, forma_pagamento,
    total_real, total_gemn, gemn_utilizado, valor_devido_real
  )
  values (
    v_buyer_id, p_idempotency_key, 'pendente', p_forma_pagamento,
    v_total_real,
    case when v_listing.preco_gemn is null
         then null else round(v_listing.preco_gemn * p_quantidade, 2) end,
    v_gemn_utilizado,
    v_valor_devido_real
  )
  returning * into v_order;

  insert into public.order_items (
    order_id, listing_id, seller_id, nome_item, tipo, quantidade,
    preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn,
    cashback_rule_id, cashback_percentual, cashback_previsto
  )
  values (
    v_order.id, v_listing.id, v_listing.seller_id, v_listing.nome, v_listing.tipo,
    p_quantidade, v_listing.preco_real, v_listing.preco_gemn, v_total_real,
    case when v_listing.preco_gemn is null
         then null else round(v_listing.preco_gemn * p_quantidade, 2) end,
    case when v_rule.id is null then null else v_rule.id end,
    v_cashback_percentual, v_cashback_previsto
  );

  if v_gemn_utilizado > 0 then
    perform public.reserve_gemn_for_order(
      v_order.id, v_gemn_utilizado, p_idempotency_key, null
    );
  end if;

  return query
  select v_order.id, v_order.status, v_order.forma_pagamento, p_quantidade,
         v_order.total_real, v_order.total_gemn, v_order.gemn_utilizado,
         v_order.valor_devido_real, v_cashback_percentual, v_cashback_previsto;
end;
$$;

create or replace function public.create_order(
  p_listing_id uuid,
  p_quantidade integer,
  p_forma_pagamento text,
  p_idempotency_key uuid
)
returns table (
  order_id uuid,
  status text,
  forma_pagamento text,
  quantidade integer,
  total_real numeric(12, 2),
  total_gemn numeric(12, 2)
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select r.order_id, r.status, r.forma_pagamento, r.quantidade,
         r.total_real, r.total_gemn
    from public.create_order(
      p_listing_id, p_quantidade, p_forma_pagamento,
      p_idempotency_key, 0.00
    ) as r;
end;
$$;

comment on function public.create_order(uuid, integer, text, uuid, numeric) is
  'Cria pedido com snapshot financeiro, cashback e reserva GEMN atômica quando aplicável.';
comment on function public.create_order(uuid, integer, text, uuid) is
  'Compatibilidade da API anterior; cria pedidos 100% em reais sem reserva GEMN.';

revoke all on function public.create_order(uuid, integer, text, uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.create_order(uuid, integer, text, uuid, numeric)
  to authenticated;

revoke all on function public.create_order(uuid, integer, text, uuid)
  from public, anon, authenticated;
grant execute on function public.create_order(uuid, integer, text, uuid)
  to authenticated;

