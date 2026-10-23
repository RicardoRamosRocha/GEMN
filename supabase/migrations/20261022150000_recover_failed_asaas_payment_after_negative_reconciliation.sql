-- Reabre uma tentativa Pix somente após reconciliação negativa auditada.
-- Não chama o Asaas e não altera pedido, carteira ou cashback.

create table if not exists public.asaas_payment_creation_recovery_audit (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null references public.payment_intents(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  previous_status text not null,
  previous_error_code text,
  previous_error_message text,
  idempotency_key uuid not null,
  reconciliation_reference text not null,
  external_reference_matches integer not null default 0,
  customer_payment_matches integer not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  constraint asaas_recovery_audit_no_external_matches_check
    check (external_reference_matches = 0 and customer_payment_matches = 0),
  constraint asaas_recovery_audit_reference_not_blank_check
    check (btrim(reconciliation_reference) <> '')
);

create unique index if not exists asaas_recovery_audit_intent_reference_idx
  on public.asaas_payment_creation_recovery_audit(payment_intent_id, reconciliation_reference);

revoke all on table public.asaas_payment_creation_recovery_audit from public, anon, authenticated;

drop function if exists public.recover_failed_asaas_payment_after_negative_reconciliation(uuid, text, integer, integer);

create or replace function public.recover_failed_asaas_payment_after_negative_reconciliation(
  p_payment_intent_id uuid,
  p_reconciliation_reference text,
  p_external_reference_matches integer default 0,
  p_customer_payment_matches integer default 0
)
returns table (
  recovered_payment_intent_id uuid,
  recovered_status text,
  recovered_idempotency_key uuid,
  recovered_creation_attempts integer,
  recovery_audit_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_intent public.payment_intents%rowtype;
  v_order public.orders%rowtype;
  v_audit_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;
  if p_payment_intent_id is null
     or nullif(btrim(p_reconciliation_reference), '') is null
     or p_external_reference_matches <> 0
     or p_customer_payment_matches <> 0 then
    raise exception 'negative reconciliation evidence is required' using errcode = '22023';
  end if;

  select * into v_intent
    from public.payment_intents
   where id = p_payment_intent_id
   for update;
  if not found then
    raise exception 'payment intent not found' using errcode = 'P0002';
  end if;

  select * into v_order
    from public.orders
   where id = v_intent.order_id
   for update;

  if not found or v_order.status <> 'pendente' then
    raise exception 'order is not pending' using errcode = 'P0001';
  end if;
  if v_intent.status not in ('failed', 'pending_creation')
     or v_intent.provider <> 'asaas'
     or v_intent.method <> 'pix'
     or v_intent.ambiente <> 'sandbox'
     or v_intent.asaas_payment_id is not null
     or v_intent.idempotency_key is null
     or v_intent.amount_due_real is distinct from v_order.valor_devido_real
     or coalesce(v_order.valor_devido_real, 0) <= 0 then
    raise exception 'payment intent is not eligible for audited recovery' using errcode = 'P0001';
  end if;

  insert into public.asaas_payment_creation_recovery_audit (
    payment_intent_id, order_id, previous_status, previous_error_code,
    previous_error_message, idempotency_key, reconciliation_reference,
    external_reference_matches, customer_payment_matches
  ) values (
    v_intent.id, v_intent.order_id, v_intent.status, v_intent.last_error_code,
    v_intent.last_error_message, v_intent.idempotency_key,
    btrim(p_reconciliation_reference), p_external_reference_matches,
    p_customer_payment_matches
  )
  on conflict (payment_intent_id, reconciliation_reference) do nothing
  returning id into v_audit_id;

  if v_audit_id is null then
    select a.id into v_audit_id
      from public.asaas_payment_creation_recovery_audit as a
     where a.payment_intent_id = v_intent.id
       and a.reconciliation_reference = btrim(p_reconciliation_reference);
    if v_intent.status <> 'pending_creation' then
      raise exception 'recovery audit exists but intent is not pending' using errcode = 'P0001';
    end if;
  else
    update public.payment_intents
       set status = 'pending_creation',
           creation_claim_token = null,
           creation_lease_expires_at = null,
           last_error_code = 'RECOVERED_NEGATIVE_RECONCILIATION',
           last_error_message = left('Negative reconciliation: ' || btrim(p_reconciliation_reference), 1000)
     where id = v_intent.id
       and status = v_intent.status
       and asaas_payment_id is null;
    if not found then
      raise exception 'payment intent changed during recovery' using errcode = '40001';
    end if;
  end if;

  return query
  select v_intent.id, 'pending_creation'::text, v_intent.idempotency_key,
    v_intent.creation_attempts, v_audit_id;
end;
$$;

revoke all on function public.recover_failed_asaas_payment_after_negative_reconciliation(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.recover_failed_asaas_payment_after_negative_reconciliation(uuid, text, integer, integer)
  to service_role;
