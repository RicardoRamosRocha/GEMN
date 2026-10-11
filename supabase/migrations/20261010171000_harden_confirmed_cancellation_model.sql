-- GEMN: endurece a integridade do modelo de cancelamento confirmado.

alter table public.gemn_reservations
  add constraint gemn_reservations_estorno_metadata_check
  check (
    (status = 'estornada') = (
      order_cancellation_id is not null
      and estornada_em is not null
      and estornada_por is not null
      and estorno_idempotency_key is not null
    )
  );

alter table public.gemn_reservation_allocations
  add constraint gemn_reservation_allocations_estorno_metadata_check
  check (
    (status = 'estornada') = (
      order_cancellation_id is not null
      and estornada_em is not null
      and estornada_por is not null
    )
  );

create or replace function public.validate_order_cancellation_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_status text;
  v_is_admin boolean;
begin
  select o.status into v_order_status
    from public.orders as o
   where o.id = new.order_id;

  if v_order_status is distinct from 'confirmado'
     or new.status_anterior <> 'confirmado' then
    raise exception using
      errcode = 'P0001',
      message = 'cancelamento administrativo exige pedido confirmado';
  end if;

  select p.is_admin into v_is_admin
    from public.profiles as p
   where p.id = new.executado_por;

  if not coalesce(v_is_admin, false) then
    raise exception using
      errcode = 'P0001',
      message = 'executor do cancelamento não é administrador GEMN';
  end if;

  return new;
end;
$$;

create trigger validate_order_cancellation_insert_trigger
  before insert on public.order_cancellations
  for each row
  execute function public.validate_order_cancellation_insert();

create or replace function public.validate_order_cancellation_allocation_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cancellation_order_id uuid;
  v_allocation record;
begin
  select oc.order_id into v_cancellation_order_id
    from public.order_cancellations as oc
   where oc.id = new.order_cancellation_id;

  if v_cancellation_order_id is distinct from new.order_id then
    raise exception using
      errcode = 'P0001',
      message = 'alocação de estorno não pertence ao pedido cancelado';
  end if;

  select a.reservation_id, a.cashback_lot_id, a.seller_origem_id,
         a.seller_recebedor_id, a.valor_gemn, a.status
    into v_allocation
    from public.gemn_reservation_allocations as a
   where a.id = new.reservation_allocation_id;

  if not found
     or v_allocation.reservation_id is distinct from new.reservation_id
     or v_allocation.cashback_lot_id is distinct from new.cashback_lot_id
     or v_allocation.seller_origem_id is distinct from new.seller_origem_id
     or v_allocation.seller_recebedor_id is distinct from new.seller_recebedor_id
     or v_allocation.valor_gemn is distinct from new.valor_gemn
     or v_allocation.status <> 'consumida' then
    raise exception using
      errcode = 'P0001',
      message = 'vínculo de alocação FIFO não corresponde à alocação consumida';
  end if;

  return new;
end;
$$;

create trigger validate_order_cancellation_allocation_insert_trigger
  before insert on public.order_cancellation_allocations
  for each row
  execute function public.validate_order_cancellation_allocation_insert();

create or replace function public.prevent_order_cancellation_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'histórico de cancelamento não pode ser alterado ou excluído';
end;
$$;

create trigger prevent_order_cancellations_update
  before update on public.order_cancellations
  for each row
  execute function public.prevent_order_cancellation_mutation();

create trigger prevent_order_cancellations_delete
  before delete on public.order_cancellations
  for each row
  execute function public.prevent_order_cancellation_mutation();

create trigger prevent_order_cancellation_allocations_update
  before update on public.order_cancellation_allocations
  for each row
  execute function public.prevent_order_cancellation_mutation();

create trigger prevent_order_cancellation_allocations_delete
  before delete on public.order_cancellation_allocations
  for each row
  execute function public.prevent_order_cancellation_mutation();

grant select (estornada_em, estornada_por, order_cancellation_id)
on table public.gemn_reservations
to authenticated;

grant select (estornada_em, estornada_por, order_cancellation_id)
on table public.gemn_reservation_allocations
to authenticated;

revoke all on function public.validate_order_cancellation_insert() from public;
revoke all on function public.validate_order_cancellation_allocation_insert() from public;
revoke all on function public.prevent_order_cancellation_mutation() from public;
