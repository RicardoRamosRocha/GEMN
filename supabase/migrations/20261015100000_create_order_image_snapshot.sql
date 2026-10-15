-- GEMN: preserva a referência da imagem do anúncio no momento da compra.
-- Esta migration não altera cálculos, reservas, cashback ou a assinatura da
-- RPC pública create_order.

alter table public.order_items
  add column if not exists imagem_principal_snapshot text null;

grant select (imagem_principal_snapshot)
on table public.order_items
to authenticated;

create index if not exists order_items_image_snapshot_idx
  on public.order_items (imagem_principal_snapshot)
  where imagem_principal_snapshot is not null;

comment on column public.order_items.imagem_principal_snapshot is
  'Caminho imutável da imagem do anúncio capturado no momento da criação do pedido.';

-- O snapshot é preenchido exclusivamente pelo núcleo transacional chamado
-- pela RPC pública. O cliente não envia nem influencia este valor.
create or replace function public.create_order_3b_internal(
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
    l.aceita_gemn, l.imagem_principal, l.status as listing_status,
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
    cashback_rule_id, cashback_percentual, cashback_previsto,
    imagem_principal_snapshot
  )
  values (
    v_order.id, v_listing.id, v_listing.seller_id, v_listing.nome, v_listing.tipo,
    p_quantidade, v_listing.preco_real, v_listing.preco_gemn, v_total_real,
    case when v_listing.preco_gemn is null
         then null else round(v_listing.preco_gemn * p_quantidade, 2) end,
    case when v_rule.id is null then null else v_rule.id end,
    v_cashback_percentual, v_cashback_previsto,
    v_listing.imagem_principal
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

comment on function public.create_order_3b_internal(uuid, integer, text, uuid, numeric) is
  'Núcleo interno de criação de pedido com snapshot financeiro, cashback, reserva GEMN e imagem histórica.';

-- O item de pedido é um snapshot histórico. Os fluxos internos existentes
-- continuam podendo atualizar somente os campos de cashback previstos para
-- isso; o caminho da imagem nunca pode ser alterado depois da inserção.
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
       or new.imagem_principal_snapshot is distinct from old.imagem_principal_snapshot
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'intenção e snapshot do item não podem ser alterados';
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

-- A política de retenção do MVP remove qualquer possibilidade de UPDATE ou
-- DELETE para usuários autenticados no bucket de imagens. A substituição é
-- feita por INSERT de um novo caminho e posterior atualização de
-- listings.imagem_principal, sem depender da remoção do objeto antigo.
drop policy if exists listing_images_update_owned_active_seller
  on storage.objects;

drop policy if exists listing_images_delete_owned_active_seller
  on storage.objects;

create schema if not exists private;

create or replace function private.listing_image_is_referenced(
  p_bucket_id text,
  p_object_name text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.order_items as oi
     where p_bucket_id = 'listing-images'
       and oi.imagem_principal_snapshot = p_object_name
  );
$$;

-- O helper permanece disponível apenas para uso administrativo futuro. Como
-- não há mais policy de DELETE que o invoque, authenticated não precisa de
-- EXECUTE e não pode consultá-lo diretamente.
revoke all on function private.listing_image_is_referenced(text, text)
  from public, anon, authenticated, service_role;

comment on function private.listing_image_is_referenced(text, text) is
  'Consulta administrativa que verifica bucket e caminho de imagem referenciados por pedidos.';
