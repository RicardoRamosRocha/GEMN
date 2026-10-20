-- Reconciliação administrativa de claims Asaas sem chamadas ao provedor.
-- Estas RPCs são backend-only: o backend deriva p_admin_id da sessão
-- administrativa validada e o banco revalida profiles.is_admin.

create table if not exists public.asaas_customer_provisioning_reconciliation_audit (
  id uuid primary key default gen_random_uuid(),
  provisioning_id uuid not null
    references public.asaas_customer_provisioning(id) on delete restrict,
  admin_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  criado_em timestamptz not null default now(),
  constraint asaas_customer_reconciliation_action_check
    check (action in ('reopen_without_customer', 'link_existing_customer')),
  constraint asaas_customer_reconciliation_once_unique
    unique (provisioning_id, action)
);

alter table public.asaas_customer_provisioning_reconciliation_audit enable row level security;
revoke all on table public.asaas_customer_provisioning_reconciliation_audit
  from public, anon, authenticated;

create or replace function public.reopen_asaas_customer_provisioning(
  p_provisioning_id uuid,
  p_admin_id uuid,
  p_confirmed_no_provider_customer boolean
)
returns table (provisioning_id uuid, status text, changed boolean, attempts integer)
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_claim public.asaas_customer_provisioning%rowtype;
  v_identity public.billing_identities%rowtype;
  v_customer public.asaas_customers%rowtype;
  v_identity_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;
  if p_provisioning_id is null or p_admin_id is null
     or p_confirmed_no_provider_customer is not true then
    raise exception 'administrative confirmation is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_admin_id and is_admin) then
    raise exception 'administrative authorization required' using errcode = '42501';
  end if;

  select billing_identity_id into v_identity_id
  from public.asaas_customer_provisioning where id = p_provisioning_id;
  if not found then
    raise exception 'provisioning claim not found' using errcode = 'P0002';
  end if;
  select * into v_identity from public.billing_identities
  where id = v_identity_id for update;
  if not found or v_identity.status <> 'active' then
    raise exception 'provisioning identity is invalid' using errcode = '42501';
  end if;
  select * into v_claim from public.asaas_customer_provisioning
  where id = p_provisioning_id for update;
  if not found or v_identity.user_id <> v_claim.user_id then
    raise exception 'provisioning identity is invalid' using errcode = '42501';
  end if;
  if v_claim.status = 'pending' then
    return query select v_claim.id, v_claim.status, false, v_claim.attempts;
    return;
  end if;
  if v_claim.status <> 'needs_review' then
    raise exception 'provisioning state cannot be reopened' using errcode = 'P0001';
  end if;
  if v_claim.asaas_customer_record_id is not null
     or nullif(btrim(v_claim.provider_customer_id), '') is not null then
    raise exception 'provisioning already has a customer reference' using errcode = 'P0001';
  end if;

  select * into v_customer from public.asaas_customers
  where user_id = v_claim.user_id and ambiente = v_claim.ambiente for update;
  if found then
    raise exception 'local customer must be reconciled first' using errcode = 'P0001';
  end if;

  update public.asaas_customer_provisioning
  set status = 'pending', claim_token = null, lease_expires_at = null
  where id = v_claim.id;
  insert into public.asaas_customer_provisioning_reconciliation_audit
    (provisioning_id, admin_user_id, action)
  values (v_claim.id, p_admin_id, 'reopen_without_customer')
  on conflict on constraint asaas_customer_reconciliation_once_unique do nothing;
  return query select v_claim.id, 'pending'::text, true, v_claim.attempts;
end;
$$;

create or replace function public.link_asaas_customer_provisioning(
  p_provisioning_id uuid,
  p_admin_id uuid,
  p_provider_customer_id text
)
returns table (provisioning_id uuid, status text, changed boolean)
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_claim public.asaas_customer_provisioning%rowtype;
  v_identity public.billing_identities%rowtype;
  v_customer public.asaas_customers%rowtype;
  v_identity_id uuid;
  v_provider_id text := nullif(btrim(p_provider_customer_id), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;
  if p_provisioning_id is null or p_admin_id is null or v_provider_id is null then
    raise exception 'reconciliation fields are required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_admin_id and is_admin) then
    raise exception 'administrative authorization required' using errcode = '42501';
  end if;

  select billing_identity_id into v_identity_id
  from public.asaas_customer_provisioning where id = p_provisioning_id;
  if not found then
    raise exception 'provisioning claim not found' using errcode = 'P0002';
  end if;
  select * into v_identity from public.billing_identities
  where id = v_identity_id for update;
  if not found or v_identity.status <> 'active' then
    raise exception 'provisioning identity is invalid' using errcode = '42501';
  end if;
  select * into v_claim from public.asaas_customer_provisioning
  where id = p_provisioning_id for update;
  if not found or v_identity.user_id <> v_claim.user_id then
    raise exception 'provisioning identity is invalid' using errcode = '42501';
  end if;

  select * into v_customer from public.asaas_customers
  where user_id = v_claim.user_id and ambiente = v_claim.ambiente for update;
  if v_claim.status = 'ready' then
    if not found or v_customer.asaas_customer_id <> v_provider_id
       or v_claim.provider_customer_id <> v_provider_id then
      raise exception 'ready provisioning does not match customer' using errcode = 'P0001';
    end if;
    return query select v_claim.id, 'ready'::text, false;
    return;
  end if;
  if v_claim.status <> 'needs_review' then
    raise exception 'provisioning state cannot be reconciled' using errcode = 'P0001';
  end if;
  if v_claim.provider_customer_id is not null
     and v_claim.provider_customer_id <> v_provider_id then
    raise exception 'provider customer mismatch' using errcode = '23505';
  end if;
  if found then
    if v_customer.asaas_customer_id <> v_provider_id
       or (v_customer.billing_identity_id is not null
           and v_customer.billing_identity_id <> v_identity.id)
       or v_customer.status <> 'active' then
      raise exception 'local customer does not match reconciliation' using errcode = '23505';
    end if;
    update public.asaas_customers
    set billing_identity_id = v_identity.id, provisioning_state = 'ready',
        provisioning_claim_token = null, provisioning_lease_expires_at = null
    where id = v_customer.id;
  else
    insert into public.asaas_customers (
      user_id, ambiente, asaas_customer_id, status, billing_identity_id,
      provisioning_state
    ) values (
      v_claim.user_id, v_claim.ambiente, v_provider_id, 'active',
      v_identity.id, 'ready'
    ) returning * into v_customer;
  end if;

  update public.asaas_customer_provisioning
  set status = 'ready', claim_token = null, lease_expires_at = null,
      asaas_customer_record_id = v_customer.id, provider_customer_id = v_provider_id
  where id = v_claim.id;
  insert into public.asaas_customer_provisioning_reconciliation_audit
    (provisioning_id, admin_user_id, action)
  values (v_claim.id, p_admin_id, 'link_existing_customer')
  on conflict on constraint asaas_customer_reconciliation_once_unique do nothing;
  return query select v_claim.id, 'ready'::text, true;
end;
$$;

alter function public.reopen_asaas_customer_provisioning(uuid, uuid, boolean) owner to postgres;
alter function public.link_asaas_customer_provisioning(uuid, uuid, text) owner to postgres;
revoke all on function public.reopen_asaas_customer_provisioning(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.link_asaas_customer_provisioning(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reopen_asaas_customer_provisioning(uuid, uuid, boolean)
  to service_role;
grant execute on function public.link_asaas_customer_provisioning(uuid, uuid, text)
  to service_role;
