-- GEMN: habilita pedidos com ate 20 listings do mesmo vendedor.
--
-- Esta migration e deliberadamente incremental. A RPC create_order existente
-- continua sendo o caminho do checkout individual. Nenhuma operacao financeira
-- e executada por esta migration durante a aplicacao alem do comportamento
-- transacional das novas funcoes chamadas posteriormente.

alter table public.order_items
  add column if not exists gemn_utilizado_item numeric(12, 2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'order_items_gemn_used_item_check'
       and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_gemn_used_item_check
      check (
        gemn_utilizado_item >= 0
        and gemn_utilizado_item <= subtotal_real
        and gemn_utilizado_item = round(gemn_utilizado_item, 2)
        and gemn_utilizado_item <> 'NaN'::numeric
        and gemn_utilizado_item <> 'Infinity'::numeric
        and gemn_utilizado_item <> '-Infinity'::numeric
      );
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'order_items_quantity_max_check'
       and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_quantity_max_check
      check (quantidade <= 99);
  end if;
end;
$$;

comment on column public.order_items.gemn_utilizado_item is
  'Snapshot do desconto GEMN efetivamente distribuido para este item; nao e o preco de catalogo em GEMN.';

grant select (gemn_utilizado_item)
on table public.order_items
to authenticated;

-- Substitui a protecao unitariamente orientada por uma validacao agregada.
-- O trigger permanece deferred para permitir inserir o cabecalho e todos os
-- itens em uma unica transacao sem abrir uma janela de estado inconsistente.
drop trigger if exists validate_order_totals_after_order_write
  on public.orders;
drop trigger if exists validate_order_totals_after_item_write
  on public.order_items;

create or replace function public.validate_order_totals_multi_item()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_item_count integer;
  v_seller_count integer;
  v_gemn_price_count integer;
  v_total_real numeric(12, 2);
  v_total_gemn numeric(12, 2);
  v_gemn_utilizado numeric(12, 2);
  v_valor_devido_real numeric(12, 2);
  v_expected_forma_pagamento text;
begin
  if tg_table_name = 'orders' then
    v_order_id := new.id;
  else
    v_order_id := new.order_id;
  end if;

  select *
    into v_order
    from public.orders
   where id = v_order_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'item deve pertencer a um pedido existente';
  end if;

  select count(*)::integer,
         count(distinct seller_id)::integer,
         count(*) filter (where subtotal_gemn is not null)::integer,
         round(coalesce(sum(subtotal_real), 0), 2),
         round(coalesce(sum(subtotal_gemn), 0), 2),
         round(coalesce(sum(gemn_utilizado_item), 0), 2),
         round(coalesce(sum(subtotal_real - gemn_utilizado_item), 0), 2)
    into v_item_count, v_seller_count, v_gemn_price_count,
         v_total_real, v_total_gemn, v_gemn_utilizado,
         v_valor_devido_real
    from public.order_items as oi
   where oi.order_id = v_order_id;

  if v_item_count = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'pedido deve possuir ao menos um item';
  end if;

  if v_item_count > 20 then
    raise exception using
      errcode = 'P0001',
      message = 'pedido nao pode possuir mais de 20 listings distintos';
  end if;

  if v_seller_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'todos os itens do pedido devem pertencer ao mesmo vendedor';
  end if;

  v_expected_forma_pagamento := case
    when v_gemn_utilizado = 0 then 'real'
    when v_gemn_utilizado = v_total_real then 'gemn'
    else 'misto'
  end;

  -- Pedidos antigos com valor real zero e forma GEMN sao preservados; esse
  -- caso era aceito pela RPC individual anterior.
  if (v_order.forma_pagamento = 'real' and v_gemn_utilizado <> 0)
     or (v_order.forma_pagamento = 'gemn'
         and not (v_total_real = 0 and v_gemn_utilizado = 0)
         and v_gemn_utilizado <> v_total_real)
     or (v_order.forma_pagamento = 'misto'
         and (v_gemn_utilizado <= 0 or v_gemn_utilizado >= v_total_real))
     or (v_order.forma_pagamento not in ('real', 'gemn', 'misto')) then
    raise exception using
      errcode = 'P0001',
      message = 'forma de pagamento nao corresponde ao GEMN utilizado';
  end if;

  if v_order.forma_pagamento <> v_expected_forma_pagamento
     and not (v_total_real = 0 and v_order.forma_pagamento = 'gemn'
              and v_gemn_utilizado = 0) then
    raise exception using
      errcode = 'P0001',
      message = 'forma de pagamento nao corresponde ao total do pedido';
  end if;

  if v_order.total_real is distinct from v_total_real
     or v_order.total_gemn is distinct from
        (case when v_gemn_price_count = 0 then null else v_total_gemn end)
     or v_order.gemn_utilizado is distinct from v_gemn_utilizado
     or v_order.valor_devido_real is distinct from v_valor_devido_real then
    raise exception using
      errcode = 'P0001',
      message = 'totais do pedido nao correspondem a soma dos itens';
  end if;

  if exists (
    select 1
      from public.order_items as oi
     where oi.order_id = v_order_id
       and oi.cashback_previsto is distinct from
           round((oi.subtotal_real - oi.gemn_utilizado_item)
                 * oi.cashback_percentual / 100, 2)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'cashback previsto nao corresponde ao valor pago em reais por item';
  end if;

  return new;
end;
$$;

create constraint trigger validate_order_totals_after_order_write
  after insert or update on public.orders
  deferrable initially deferred
  for each row
  execute function public.validate_order_totals_multi_item();

create constraint trigger validate_order_totals_after_item_write
  after insert or update on public.order_items
  deferrable initially deferred
  for each row
  execute function public.validate_order_totals_multi_item();

-- A restricao anterior bloqueava qualquer segundo item. Ela so e removida
-- depois que a validacao agregada acima ja esta instalada na mesma migration.
alter table public.order_items
  drop constraint if exists order_items_one_item_per_order_unique;

create unique index if not exists order_items_order_listing_unique
  on public.order_items (order_id, listing_id);

create index if not exists order_items_order_id_idx
  on public.order_items (order_id);

comment on table public.order_items is
  'Snapshot dos listings comprados; todos os itens de um pedido pertencem ao mesmo vendedor.';

-- A reserva continua sendo uma por pedido. A unica alteracao e validar o
-- conjunto inteiro de itens e derivar seller_recebedor_id somente quando
-- houver exatamente um vendedor.
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
  v_item_count integer;
  v_seller_count integer;
  v_ineligible_count integer;
  v_lot record;
  v_remaining numeric(18, 2);
  v_allocation numeric(18, 2);
  v_available_lots numeric(18, 2);
  v_allocation_order integer := 0;
  v_reservation_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'usuario autenticado e obrigatorio';
  end if;
  if p_order_id is null then
    raise exception using errcode = 'P0001', message = 'pedido e obrigatorio';
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
    raise exception using errcode = 'P0001', message = 'idempotency_key e obrigatoria';
  end if;
  if p_expira_em is not null and p_expira_em <= clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'expiracao da reserva deve estar no futuro';
  end if;

  select o.* into v_order
    from public.orders as o
   where o.id = p_order_id and o.buyer_id = v_user_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'pedido nao pertence ao usuario autenticado ou nao existe';
  end if;
  if v_order.status <> 'pendente' then
    raise exception using errcode = 'P0001', message = 'somente pedidos pendentes podem reservar GEMN';
  end if;
  if v_order.gemn_utilizado is distinct from p_valor_gemn::numeric(12, 2) then
    raise exception using errcode = 'P0001', message = 'valor da reserva nao corresponde ao GEMN persistido no pedido';
  end if;

  select count(*)::integer,
         count(distinct oi.seller_id)::integer,
         (array_agg(oi.seller_id order by oi.seller_id))[1],
         count(*) filter (
           where l.aceita_gemn is not true
              or l.status <> 'ativo'
              or l.preco_gemn is null
              or s.aceita_gemn is not true
              or s.status <> 'ativo'
         )::integer
    into v_item_count, v_seller_count, v_seller_recebedor_id,
         v_ineligible_count
    from public.order_items as oi
    join public.listings as l on l.id = oi.listing_id
    join public.sellers as s on s.id = oi.seller_id
   where oi.order_id = v_order.id;

  if v_item_count = 0 then
    raise exception using errcode = 'P0001', message = 'pedido deve possuir itens para reservar GEMN';
  end if;
  if v_seller_count <> 1 then
    raise exception using errcode = 'P0001', message = 'reserva GEMN exige um unico vendedor por pedido';
  end if;
  if v_ineligible_count > 0 then
    raise exception using errcode = 'P0001', message = 'todos os itens devem aceitar GEMN para usar GEMN no pedido';
  end if;
  if p_valor_gemn > v_order.total_real then
    raise exception using errcode = 'P0001', message = 'reserva GEMN nao pode superar o valor real do pedido';
  end if;

  insert into public.wallets (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select w.* into v_wallet
    from public.wallets as w
   where w.user_id = v_user_id
   for update;

  select r.* into v_existing
    from public.gemn_reservations as r
   where r.order_id = v_order.id
   for update;
  if found then
    if v_existing.idempotency_key = p_idempotency_key
       and v_existing.valor_gemn = p_valor_gemn
       and v_existing.seller_recebedor_id = v_seller_recebedor_id then
      return query select v_existing.id, v_existing.order_id, v_existing.status,
                          v_existing.valor_gemn, v_existing.seller_recebedor_id,
                          v_existing.expira_em;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'pedido ja possui uma reserva com outra intencao';
  end if;

  if v_wallet.saldo_disponivel < p_valor_gemn then
    raise exception using errcode = 'P0001', message = 'saldo GEMN disponivel insuficiente';
  end if;
  select coalesce(sum(cl.valor_disponivel), 0) into v_available_lots
    from public.cashback_lots as cl
   where cl.wallet_id = v_wallet.id and cl.valor_disponivel > 0;
  if v_available_lots <> v_wallet.saldo_disponivel then
    raise exception using errcode = 'P0001', message = 'saldo da carteira e saldo dos lotes estao inconsistentes';
  end if;
  if v_available_lots < p_valor_gemn then
    raise exception using errcode = 'P0001', message = 'lotes de cashback disponiveis insuficientes';
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
     where cl.wallet_id = v_wallet.id and cl.valor_disponivel > 0
     order by cl.criado_em asc, cl.id asc
     for update
  loop
    exit when v_remaining = 0;
    v_allocation := least(v_remaining, v_lot.valor_disponivel);
    v_allocation_order := v_allocation_order + 1;
    insert into public.gemn_reservation_allocations (
      reservation_id, cashback_lot_id, seller_origem_id,
      seller_recebedor_id, valor_gemn, ordem_fifo
    ) values (
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
    raise exception using errcode = 'P0001', message = 'nao foi possivel alocar integralmente os lotes FIFO';
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
    from public.wallets as w where w.id = v_wallet.id;

  return query
  select r.id, r.order_id, r.status, r.valor_gemn,
         r.seller_recebedor_id, r.expira_em
    from public.gemn_reservations as r where r.id = v_reservation_id;
end;
$$;

comment on function public.reserve_gemn_for_order(uuid, numeric, uuid, timestamptz) is
  'Reserva GEMN FIFO de um pedido de um vendedor, validando todos os itens do pedido.';

-- Cria um pedido multi-item para um unico vendedor. O cliente fornece somente
-- listing_id e quantidade; precos, seller, cashback e snapshots sao derivados
-- de listings/sellers bloqueados nesta transacao.
create or replace function public.create_order_from_items(
  p_items jsonb,
  p_gemn_utilizado numeric,
  p_idempotency_key uuid
)
returns table (
  order_id uuid,
  status text,
  forma_pagamento text,
  seller_id uuid,
  total_real numeric(12, 2),
  total_gemn numeric(12, 2),
  gemn_utilizado numeric(12, 2),
  valor_devido_real numeric(12, 2),
  order_item_id uuid,
  listing_id uuid,
  quantidade integer,
  preco_real_unitario numeric(12, 2),
  preco_gemn_unitario numeric(12, 2),
  subtotal_real numeric(12, 2),
  subtotal_gemn numeric(12, 2),
  gemn_utilizado_item numeric(12, 2),
  cashback_rule_id uuid,
  cashback_percentual numeric(5, 2),
  cashback_previsto numeric(12, 2),
  imagem_principal_snapshot text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_buyer_id uuid := auth.uid();
  v_existing_order public.orders%rowtype;
  v_input record;
  v_listing record;
  v_rule public.cashback_rules%rowtype;
  v_seller_id uuid;
  v_seller_status text;
  v_seller_accepts boolean;
  v_item_count integer;
  v_distinct_listing_count integer;
  v_existing_item_count integer;
  v_total_real numeric(12, 2) := 0;
  v_total_gemn numeric(12, 2) := 0;
  v_gemn_utilizado numeric(12, 2);
  v_remaining_gemn numeric(12, 2);
  v_item_subtotal_real numeric(12, 2);
  v_item_subtotal_gemn numeric(12, 2);
  v_item_gemn numeric(12, 2);
  v_cashback_percentual numeric(5, 2) := 0;
  v_cashback_previsto numeric(12, 2);
  v_has_gemn_price boolean := false;
  v_all_items_accept_gemn boolean := true;
  v_order public.orders%rowtype;
begin
  if v_buyer_id is null then
    raise exception using errcode = 'P0001', message = 'usuario autenticado e obrigatorio';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'idempotency_key e obrigatoria';
  end if;
  if p_gemn_utilizado is null
     or p_gemn_utilizado < 0
     or p_gemn_utilizado <> round(p_gemn_utilizado, 2)
     or p_gemn_utilizado = 'NaN'::numeric
     or p_gemn_utilizado = 'Infinity'::numeric
     or p_gemn_utilizado = '-Infinity'::numeric then
    raise exception using errcode = 'P0001', message = 'GEMN utilizado deve ser nao negativo e possuir duas casas decimais';
  end if;
  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 20 then
    raise exception using errcode = 'P0001', message = 'o pedido deve possuir entre 1 e 20 listings';
  end if;

  select count(*)::integer,
         count(distinct x.listing_id)::integer
    into v_item_count, v_distinct_listing_count
    from jsonb_to_recordset(p_items) as x(listing_id uuid, quantidade integer);
  if v_item_count <> v_distinct_listing_count then
    raise exception using errcode = 'P0001', message = 'listing duplicado no pedido';
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(p_items) as x(listing_id uuid, quantidade integer)
     where x.listing_id is null or x.quantidade is null
        or x.quantidade <= 0 or x.quantidade > 99
  ) then
    raise exception using errcode = 'P0001', message = 'cada quantidade deve ser um inteiro entre 1 e 99';
  end if;

  -- O retry e resolvido antes de consultar precos ou status atuais. Assim,
  -- uma chave ja confirmada continua retornando o snapshot persistido mesmo
  -- que o listing tenha sido alterado depois do commit original.
  select o.* into v_existing_order
    from public.orders as o
   where o.buyer_id = v_buyer_id
     and o.idempotency_key = p_idempotency_key;
  if found then
    select count(*)::integer into v_existing_item_count
       from public.order_items as oi where oi.order_id = v_existing_order.id;
    if v_existing_item_count <> v_item_count
       or v_existing_order.gemn_utilizado is distinct from p_gemn_utilizado::numeric(12, 2)
       or exists (
         select 1
           from public.order_items as oi
          where oi.order_id = v_existing_order.id
            and not exists (
              select 1
                from jsonb_to_recordset(p_items) as x(listing_id uuid, quantidade integer)
               where x.listing_id = oi.listing_id
                 and x.quantidade = oi.quantidade
            )
       ) then
      raise exception using errcode = 'P0001', message = 'idempotency_key ja foi usada com outra intencao de compra';
    end if;
    return query
    select o.id, o.status, o.forma_pagamento, oi.seller_id,
           o.total_real, o.total_gemn, o.gemn_utilizado, o.valor_devido_real,
           oi.id, oi.listing_id, oi.quantidade, oi.preco_real_unitario,
           oi.preco_gemn_unitario, oi.subtotal_real, oi.subtotal_gemn,
           oi.gemn_utilizado_item, oi.cashback_rule_id,
           oi.cashback_percentual, oi.cashback_previsto,
           oi.imagem_principal_snapshot
      from public.orders as o
      join public.order_items as oi on oi.order_id = o.id
     where o.id = v_existing_order.id
     order by oi.listing_id;
    return;
  end if;

  -- Primeira passagem: locks deterministas e validacao de seller/status.
  for v_input in
    select x.listing_id, x.quantidade
      from jsonb_to_recordset(p_items) as x(listing_id uuid, quantidade integer)
     order by x.listing_id
  loop
    select l.id, l.seller_id, l.tipo, l.nome, l.preco_real, l.preco_gemn,
           l.aceita_gemn, l.imagem_principal, l.status as listing_status,
           s.status as seller_status, s.aceita_gemn as seller_accepts
      into v_listing
      from public.listings as l
      join public.sellers as s on s.id = l.seller_id
     where l.id = v_input.listing_id
     for update of l;
    if not found then
      raise exception using errcode = 'P0001', message = 'listing nao encontrado';
    end if;
    if v_listing.listing_status <> 'ativo'
       or v_listing.seller_status <> 'ativo' then
      raise exception using errcode = 'P0001', message = 'listing e seller devem estar ativos';
    end if;
    if v_seller_id is null then
      v_seller_id := v_listing.seller_id;
    elsif v_seller_id is distinct from v_listing.seller_id then
      raise exception using errcode = 'P0001', message = 'todos os itens devem pertencer ao mesmo vendedor';
    end if;
  end loop;

  -- Todos os listings sao bloqueados antes do seller. Isso evita a inversao
  -- listing -> seller -> outro listing quando duas compras compartilham o
  -- mesmo vendedor.
  select s.status, s.aceita_gemn
    into v_seller_status, v_seller_accepts
    from public.sellers as s
   where s.id = v_seller_id
   for update;
  if not found or v_seller_status <> 'ativo' then
    raise exception using errcode = 'P0001', message = 'seller deve estar ativo';
  end if;

  -- O retry e resolvido antes de consultar precos ou status atuais.
  select o.* into v_existing_order
    from public.orders as o
   where o.buyer_id = v_buyer_id
     and o.idempotency_key = p_idempotency_key;
  if found then
    select count(*)::integer into v_existing_item_count
       from public.order_items as oi where oi.order_id = v_existing_order.id;
    if v_existing_item_count <> v_item_count
       or v_existing_order.gemn_utilizado is distinct from p_gemn_utilizado::numeric(12, 2)
       or exists (
         select 1
           from public.order_items as oi
          where oi.order_id = v_existing_order.id
            and not exists (
              select 1
                from jsonb_to_recordset(p_items) as x(listing_id uuid, quantidade integer)
               where x.listing_id = oi.listing_id
                 and x.quantidade = oi.quantidade
            )
       ) then
      raise exception using errcode = 'P0001', message = 'idempotency_key ja foi usada com outra intencao de compra';
    end if;
    return query
    select o.id, o.status, o.forma_pagamento, oi.seller_id,
           o.total_real, o.total_gemn, o.gemn_utilizado, o.valor_devido_real,
           oi.id, oi.listing_id, oi.quantidade, oi.preco_real_unitario,
           oi.preco_gemn_unitario, oi.subtotal_real, oi.subtotal_gemn,
           oi.gemn_utilizado_item, oi.cashback_rule_id,
           oi.cashback_percentual, oi.cashback_previsto,
           oi.imagem_principal_snapshot
      from public.orders as o
      join public.order_items as oi on oi.order_id = o.id
     where o.id = v_existing_order.id
     order by oi.listing_id;
    return;
  end if;

  v_gemn_utilizado := p_gemn_utilizado::numeric(12, 2);

  -- Segunda passagem: os listings continuam bloqueados durante todo o
  -- calculo. A ordem por listing_id torna a distribuicao GEMN deterministica.
  for v_input in
    select x.listing_id, x.quantidade
      from jsonb_to_recordset(p_items) as x(listing_id uuid, quantidade integer)
     order by x.listing_id
  loop
    select l.id, l.seller_id, l.tipo, l.nome, l.preco_real, l.preco_gemn,
           l.aceita_gemn, l.imagem_principal,
           s.aceita_gemn as seller_accepts
      into v_listing
      from public.listings as l
      join public.sellers as s on s.id = l.seller_id
     where l.id = v_input.listing_id;

    v_item_subtotal_real := round(v_listing.preco_real * v_input.quantidade, 2);
    v_total_real := v_total_real + v_item_subtotal_real;
    if v_listing.preco_gemn is not null then
      v_has_gemn_price := true;
      v_item_subtotal_gemn := round(v_listing.preco_gemn * v_input.quantidade, 2);
      v_total_gemn := v_total_gemn + v_item_subtotal_gemn;
    end if;
    if not v_listing.aceita_gemn or not v_listing.seller_accepts
       or v_listing.preco_gemn is null then
      v_all_items_accept_gemn := false;
    end if;
  end loop;

  if v_gemn_utilizado > v_total_real then
    raise exception using errcode = 'P0001', message = 'GEMN utilizado nao pode superar o valor do pedido';
  end if;
  if v_gemn_utilizado > 0 and not v_all_items_accept_gemn then
    raise exception using errcode = 'P0001', message = 'todos os itens devem aceitar GEMN; tente novamente com pagamento em reais';
  end if;

  select cr.* into v_rule
    from public.cashback_rules as cr
   where cr.seller_id = v_seller_id and cr.vigente_ate is null
   order by cr.vigente_desde desc, cr.id desc
   limit 1;
  if found then
    v_cashback_percentual := v_rule.percentual;
  end if;

  begin
    insert into public.orders (
      buyer_id, idempotency_key, status, forma_pagamento,
      total_real, total_gemn, gemn_utilizado, valor_devido_real
    ) values (
      v_buyer_id, p_idempotency_key, 'pendente',
      case when v_gemn_utilizado = 0 then 'real'
           when v_gemn_utilizado = v_total_real then 'gemn'
           else 'misto' end,
      v_total_real,
      case when v_has_gemn_price then v_total_gemn else null end,
      v_gemn_utilizado,
      round(v_total_real - v_gemn_utilizado, 2)
    ) returning * into v_order;
  exception
    when unique_violation then
      -- Duas intenções divergentes podem ter listings disjuntos e, portanto,
      -- não compartilhar locks antes do INSERT. A unicidade continua sendo
      -- a proteção final; aqui transformamos a corrida em retry deterministico.
      select o.* into v_existing_order
        from public.orders as o
       where o.buyer_id = v_buyer_id
         and o.idempotency_key = p_idempotency_key;
      if not found then
        raise;
      end if;
      select count(*)::integer into v_existing_item_count
        from public.order_items as oi where oi.order_id = v_existing_order.id;
      if v_existing_item_count <> v_item_count
         or v_existing_order.gemn_utilizado is distinct from v_gemn_utilizado
         or exists (
           select 1 from public.order_items as oi
            where oi.order_id = v_existing_order.id
              and not exists (
                select 1
                  from jsonb_to_recordset(p_items) as x(listing_id uuid, quantidade integer)
                 where x.listing_id = oi.listing_id
                   and x.quantidade = oi.quantidade
              )
         ) then
        raise exception using
          errcode = 'P0001',
          message = 'idempotency_key ja foi usada com outra intencao de compra';
      end if;
      return query
      select o.id, o.status, o.forma_pagamento, oi.seller_id,
             o.total_real, o.total_gemn, o.gemn_utilizado, o.valor_devido_real,
             oi.id, oi.listing_id, oi.quantidade, oi.preco_real_unitario,
             oi.preco_gemn_unitario, oi.subtotal_real, oi.subtotal_gemn,
             oi.gemn_utilizado_item, oi.cashback_rule_id,
             oi.cashback_percentual, oi.cashback_previsto,
             oi.imagem_principal_snapshot
        from public.orders as o
        join public.order_items as oi on oi.order_id = o.id
       where o.id = v_existing_order.id
       order by oi.listing_id;
      return;
  end;

  v_remaining_gemn := v_gemn_utilizado;
  for v_input in
    select x.listing_id, x.quantidade
      from jsonb_to_recordset(p_items) as x(listing_id uuid, quantidade integer)
     order by x.listing_id
  loop
    select l.id, l.seller_id, l.tipo, l.nome, l.preco_real, l.preco_gemn,
           l.imagem_principal
      into v_listing
      from public.listings as l where l.id = v_input.listing_id;
    v_item_subtotal_real := round(v_listing.preco_real * v_input.quantidade, 2);
    v_item_subtotal_gemn := case when v_listing.preco_gemn is null then null
                                 else round(v_listing.preco_gemn * v_input.quantidade, 2) end;
    v_item_gemn := least(v_item_subtotal_real, greatest(v_remaining_gemn, 0));
    v_remaining_gemn := v_remaining_gemn - v_item_gemn;
    v_cashback_previsto := round((v_item_subtotal_real - v_item_gemn)
                                 * v_cashback_percentual / 100, 2);

    insert into public.order_items (
      order_id, listing_id, seller_id, nome_item, tipo, quantidade,
      preco_real_unitario, preco_gemn_unitario, subtotal_real, subtotal_gemn,
      gemn_utilizado_item, cashback_rule_id, cashback_percentual,
      cashback_previsto, imagem_principal_snapshot
    ) values (
      v_order.id, v_listing.id, v_listing.seller_id, v_listing.nome,
      v_listing.tipo, v_input.quantidade, v_listing.preco_real,
      v_listing.preco_gemn, v_item_subtotal_real, v_item_subtotal_gemn,
      v_item_gemn, case when v_rule.id is null then null else v_rule.id end,
      v_cashback_percentual, v_cashback_previsto, v_listing.imagem_principal
    );
  end loop;

  if v_remaining_gemn <> 0 then
    raise exception using errcode = 'P0001', message = 'GEMN nao foi distribuido integralmente entre os itens';
  end if;
  if v_gemn_utilizado > 0 then
    perform public.reserve_gemn_for_order(
      v_order.id, v_gemn_utilizado, p_idempotency_key, null
    );
  end if;

  return query
  select o.id, o.status, o.forma_pagamento, oi.seller_id,
         o.total_real, o.total_gemn, o.gemn_utilizado, o.valor_devido_real,
         oi.id, oi.listing_id, oi.quantidade, oi.preco_real_unitario,
         oi.preco_gemn_unitario, oi.subtotal_real, oi.subtotal_gemn,
         oi.gemn_utilizado_item, oi.cashback_rule_id,
         oi.cashback_percentual, oi.cashback_previsto,
         oi.imagem_principal_snapshot
    from public.orders as o
    join public.order_items as oi on oi.order_id = o.id
   where o.id = v_order.id
   order by oi.listing_id;
end;
$$;

revoke all on function public.create_order_from_items(jsonb, numeric, uuid)
  from public, anon, service_role;
grant execute on function public.create_order_from_items(jsonb, numeric, uuid)
  to authenticated;

revoke all on function public.validate_order_totals_multi_item() from public;

-- Mantem create_order individual e apenas preenche o novo snapshot por item
-- depois do nucleo existente. A assinatura e o retorno publico permanecem.
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
  v_result record;
  v_seller_id uuid;
  v_rule public.cashback_rules%rowtype;
  v_percentual numeric(5, 2) := 0;
  v_previsto numeric(12, 2);
begin
  if v_buyer_id is null then
    raise exception using errcode = 'P0001', message = 'usuario autenticado e obrigatorio';
  end if;
  select o.* into v_existing_order from public.orders as o
   where o.buyer_id = v_buyer_id and o.idempotency_key = p_idempotency_key;
  if found then
    select oi.* into v_existing_item from public.order_items as oi
     where oi.order_id = v_existing_order.id;
    if not found or v_existing_item.listing_id is distinct from p_listing_id
       or v_existing_item.quantidade is distinct from p_quantidade
       or v_existing_order.forma_pagamento is distinct from p_forma_pagamento
       or v_existing_order.gemn_utilizado is distinct from p_gemn_utilizado::numeric(12, 2) then
      raise exception using errcode = 'P0001', message = 'idempotency_key ja foi usada com outra intencao de compra';
    end if;
    return query select o.id, o.status, o.forma_pagamento, oi.quantidade,
      o.total_real, o.total_gemn, o.gemn_utilizado, o.valor_devido_real,
      oi.cashback_percentual, oi.cashback_previsto
      from public.orders o join public.order_items oi on oi.order_id = o.id
     where o.id = v_existing_order.id;
    return;
  end if;
  select l.seller_id into v_seller_id from public.listings l
   where l.id = p_listing_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'listing nao encontrado'; end if;
  perform 1 from public.sellers s where s.id = v_seller_id for update;
  select * into v_result from public.create_order_3b_internal(
    p_listing_id, p_quantidade, p_forma_pagamento, p_idempotency_key, p_gemn_utilizado);
   update public.order_items as oi
     set gemn_utilizado_item = p_gemn_utilizado::numeric(12, 2)
    where oi.order_id = v_result.order_id;
  if p_gemn_utilizado = 0 then
    select cr.* into v_rule from public.cashback_rules cr
     where cr.seller_id = v_seller_id and cr.vigente_ate is null
     order by cr.vigente_desde desc, cr.id desc limit 1;
    if found then v_percentual := v_rule.percentual; end if;
    v_previsto := round(v_result.valor_devido_real * v_percentual / 100, 2);
    update public.order_items oi set cashback_rule_id = case when v_rule.id is null then null else v_rule.id end,
      cashback_percentual = v_percentual, cashback_previsto = v_previsto
     where oi.order_id = v_result.order_id;
  end if;
  return query select o.id, o.status, o.forma_pagamento, oi.quantidade,
    o.total_real, o.total_gemn, o.gemn_utilizado, o.valor_devido_real,
    oi.cashback_percentual, oi.cashback_previsto
    from public.orders o join public.order_items oi on oi.order_id = o.id
   where o.id = v_result.order_id;
end;
$$;

revoke all on function public.create_order(uuid, integer, text, uuid, numeric)
  from public, anon, service_role;
grant execute on function public.create_order(uuid, integer, text, uuid, numeric)
  to authenticated;

-- Preflight e backfill executados por ultimo. Nesse ponto os triggers antigos
-- ja foram removidos, os agregados ja estao instalados e nao ha DDL posterior
-- que possa encontrar eventos de trigger diferidos do UPDATE.
do $$
begin
  if exists (
    select 1
      from public.order_items
     group by order_id
    having count(*) <> 1
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'historico possui pedido com cardinalidade diferente de um item';
  end if;

  if exists (
    select 1
      from public.order_items
     where quantidade < 1 or quantidade > 99
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'historico possui quantidade fora do intervalo de 1 a 99';
  end if;

  if exists (
    select 1
      from public.orders as o
      join (
        select order_id,
               round(sum(subtotal_real), 2) as total_real,
               case when count(*) filter (where subtotal_gemn is null) = count(*)
                    then null else round(sum(subtotal_gemn), 2) end as total_gemn
          from public.order_items
         group by order_id
      ) as totals on totals.order_id = o.id
     where o.total_real is distinct from totals.total_real
        or o.total_gemn is distinct from totals.total_gemn
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'historico possui totais de pedido inconsistentes';
  end if;

  if exists (
    select 1
      from public.orders as o
     where o.gemn_utilizado < 0
        or o.gemn_utilizado > o.total_real
        or o.gemn_utilizado <> round(o.gemn_utilizado, 2)
        or o.valor_devido_real is distinct from round(o.total_real - o.gemn_utilizado, 2)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'historico possui GEMN ou valor devido real inconsistente';
  end if;
end;
$$;

update public.order_items as oi
   set gemn_utilizado_item = o.gemn_utilizado
  from public.orders as o
 where o.id = oi.order_id;

