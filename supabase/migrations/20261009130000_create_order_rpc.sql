-- GEMN: criaÃ§Ã£o transacional de pedidos do MVP.
--
-- A funÃ§Ã£o cria um pedido para um Ãºnico listing, sem processar pagamento,
-- debitar GEMN ou alterar carteira. O comprador e todos os valores derivados
-- sÃ£o obtidos no banco; o cliente fornece somente a intenÃ§Ã£o da compra e uma
-- chave de idempotÃªncia.

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
declare
  v_buyer_id uuid := auth.uid();
  v_existing_order public.orders%rowtype;
  v_existing_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_listing record;
  v_seller_id uuid;
  v_seller_status text;
  v_constraint_name text;
  v_total_real numeric(12, 2);
  v_total_gemn numeric(12, 2);
begin
  if v_buyer_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'usuÃ¡rio autenticado Ã© obrigatÃ³rio';
  end if;

  if p_listing_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'listing Ã© obrigatÃ³rio';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception using
      errcode = 'P0001',
      message = 'quantidade deve ser positiva';
  end if;

  if p_forma_pagamento is null
     or p_forma_pagamento not in ('real', 'gemn') then
    raise exception using
      errcode = 'P0001',
      message = 'forma de pagamento invÃ¡lida';
  end if;

  if p_idempotency_key is null then
    raise exception using
      errcode = 'P0001',
      message = 'idempotency_key Ã© obrigatÃ³ria';
  end if;

  -- Um retry Ã© resolvido antes de validar o estado atual do listing. Assim,
  -- repetir uma requisiÃ§Ã£o jÃ¡ persistida continua determinÃ­stico mesmo se o
  -- anÃºncio foi desativado ou teve o preÃ§o alterado depois da primeira compra.
  select o.*
    into v_existing_order
    from public.orders as o
   where o.buyer_id = v_buyer_id
     and o.idempotency_key = p_idempotency_key;

  if found then
    select oi.*
      into v_existing_item
      from public.order_items as oi
     where oi.order_id = v_existing_order.id;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'pedido idempotente estÃ¡ sem item';
    end if;

    if v_existing_item.listing_id is distinct from p_listing_id
       or v_existing_item.quantidade is distinct from p_quantidade
       or v_existing_order.forma_pagamento is distinct from p_forma_pagamento then
      raise exception using
        errcode = 'P0001',
        message = 'idempotency_key jÃ¡ foi usada com outra intenÃ§Ã£o de compra';
    end if;

    return query
    select v_existing_order.id,
           v_existing_order.status,
           v_existing_order.forma_pagamento,
           v_existing_item.quantidade,
           v_existing_order.total_real,
           v_existing_order.total_gemn;
    return;
  end if;

  -- Todas as chamadas desta RPC usam a mesma ordem de locks: seller e depois
  -- listing. Assim, chamadas concorrentes para listings do mesmo seller nÃ£o
  -- criam ciclos de lock entre si.
  select l.seller_id
    into v_seller_id
    from public.listings as l
   where l.id = p_listing_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'listing nÃ£o encontrado';
  end if;

  select s.status
    into v_seller_status
    from public.sellers as s
   where s.id = v_seller_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'seller do listing nÃ£o encontrado';
  end if;

  -- O listing e o seller jÃ¡ estÃ£o bloqueados antes da leitura dos dados que
  -- formarÃ£o o snapshot. O seller permanece bloqueado desde a consulta acima.
  select
    l.id,
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
   where l.id = p_listing_id
     and l.seller_id = v_seller_id
   for update of l;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'listing nÃ£o encontrado';
  end if;

  -- A segunda consulta Ã© necessÃ¡ria para a corrida em que outra chamada
  -- usou a mesma chave enquanto esta chamada aguardava os locks do listing.
  select o.*
    into v_existing_order
    from public.orders as o
   where o.buyer_id = v_buyer_id
     and o.idempotency_key = p_idempotency_key;

  if found then
    select oi.*
      into v_existing_item
      from public.order_items as oi
     where oi.order_id = v_existing_order.id;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'pedido idempotente estÃ¡ sem item';
    end if;

    if v_existing_item.listing_id is distinct from p_listing_id
       or v_existing_item.quantidade is distinct from p_quantidade
       or v_existing_order.forma_pagamento is distinct from p_forma_pagamento then
      raise exception using
        errcode = 'P0001',
        message = 'idempotency_key jÃ¡ foi usada com outra intenÃ§Ã£o de compra';
    end if;

    return query
    select v_existing_order.id,
           v_existing_order.status,
           v_existing_order.forma_pagamento,
           v_existing_item.quantidade,
           v_existing_order.total_real,
           v_existing_order.total_gemn;
    return;
  end if;

  if v_listing.listing_status <> 'ativo'
     or v_listing.seller_status <> 'ativo' then
    raise exception using
      errcode = 'P0001',
      message = 'listing e seller devem estar ativos';
  end if;

  if p_forma_pagamento = 'gemn' and v_listing.preco_gemn is null then
    raise exception using
      errcode = 'P0001',
      message = 'listing nÃ£o aceita pagamento em GEMN';
  end if;

  v_total_real := round(v_listing.preco_real * p_quantidade, 2);
  v_total_gemn := case
    when v_listing.preco_gemn is null then null
    else round(v_listing.preco_gemn * p_quantidade, 2)
  end;

  -- A constraint e o trigger da migration anterior garantem status pendente,
  -- um item por pedido, snapshots coerentes e totais consistentes. Se qualquer
  -- INSERT falhar, a chamada inteira falha e a transaÃ§Ã£o Ã© revertida.
  begin
    insert into public.orders (
      buyer_id,
      idempotency_key,
      status,
      forma_pagamento,
      total_real,
      total_gemn
    )
    values (
      v_buyer_id,
      p_idempotency_key,
      'pendente',
      p_forma_pagamento,
      v_total_real,
      v_total_gemn
    )
    returning * into v_order;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;

      if v_constraint_name <> 'orders_buyer_idempotency_key_unique' then
        raise;
      end if;

      select o.*
        into v_existing_order
        from public.orders as o
       where o.buyer_id = v_buyer_id
         and o.idempotency_key = p_idempotency_key;

      select oi.*
        into v_existing_item
        from public.order_items as oi
       where oi.order_id = v_existing_order.id;

      if not found then
        raise exception using
          errcode = 'P0001',
          message = 'pedido idempotente estÃ¡ sem item';
      end if;

      if v_existing_item.listing_id is distinct from p_listing_id
         or v_existing_item.quantidade is distinct from p_quantidade
         or v_existing_order.forma_pagamento is distinct from p_forma_pagamento then
        raise exception using
          errcode = 'P0001',
          message = 'idempotency_key jÃ¡ foi usada com outra intenÃ§Ã£o de compra';
      end if;

      return query
      select v_existing_order.id,
             v_existing_order.status,
             v_existing_order.forma_pagamento,
             v_existing_item.quantidade,
             v_existing_order.total_real,
             v_existing_order.total_gemn;
      return;
  end;

  insert into public.order_items (
    order_id,
    listing_id,
    seller_id,
    nome_item,
    tipo,
    quantidade,
    preco_real_unitario,
    preco_gemn_unitario,
    subtotal_real,
    subtotal_gemn
  )
  values (
    v_order.id,
    v_listing.id,
    v_listing.seller_id,
    v_listing.nome,
    v_listing.tipo,
    p_quantidade,
    v_listing.preco_real,
    v_listing.preco_gemn,
    v_total_real,
    v_total_gemn
  );

  return query
  select v_order.id,
         v_order.status,
         v_order.forma_pagamento,
         p_quantidade,
         v_order.total_real,
         v_order.total_gemn;
end;
$$;

comment on function public.create_order(uuid, integer, text, uuid) is
  'Cria atomicamente um pedido pendente para um listing, sem processar pagamento; retries usam buyer_id e idempotency_key.';

revoke all on function public.create_order(uuid, integer, text, uuid)
  from public, anon, authenticated;

grant execute on function public.create_order(uuid, integer, text, uuid)
  to authenticated;
