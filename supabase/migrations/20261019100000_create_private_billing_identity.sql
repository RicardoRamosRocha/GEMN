-- Sprint 6.1-E6-B: estrutura privada da identificação de cobrança.
--
-- Esta migration não implementa coleta de documento, criptografia, chamadas ao
-- Asaas ou criação de cobrança. document_ciphertext deve receber somente um
-- ciphertext produzido pelo backend com uma chave fora do banco.
--
-- A unicidade legada (user_id, ambiente) de asaas_customers é preservada para
-- manter compatibilidade com o adapter atual, que consulta essa chave com
-- maybeSingle(). A identidade é versionada separadamente; uma troca exige
-- revisão/provisionamento explícito antes de alterar o customer corrente.

create table if not exists public.billing_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  identity_version integer not null default 1,
  document_type text not null,
  document_ciphertext text not null,
  document_fingerprint text not null,
  document_last4 text not null,
  key_version integer not null,
  status text not null default 'active',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint billing_identities_version_check
    check (identity_version > 0),
  constraint billing_identities_document_type_check
    check (document_type in ('cpf', 'cnpj')),
  constraint billing_identities_ciphertext_check
    check (length(btrim(document_ciphertext)) > 0),
  constraint billing_identities_fingerprint_check
    check (length(btrim(document_fingerprint)) > 0),
  constraint billing_identities_last4_check
    check (document_last4 ~ '^[0-9]{4}$'),
  constraint billing_identities_key_version_check
    check (key_version > 0),
  constraint billing_identities_status_check
    check (status in ('active', 'superseded', 'needs_review', 'deleted')),
  constraint billing_identities_user_version_unique
    unique (user_id, identity_version)
);

create unique index if not exists billing_identities_one_active_per_user_idx
  on public.billing_identities (user_id)
  where status = 'active';

create index if not exists billing_identities_user_status_idx
  on public.billing_identities (user_id, status, atualizado_em desc);

comment on table public.billing_identities is
  'Identidade privada de cobrança. O ciphertext é produzido fora do banco; nunca armazenar CPF/CNPJ em texto claro.';
comment on column public.billing_identities.document_ciphertext is
  'Ciphertext opaco produzido pelo backend. A chave não pertence ao banco nem ao repositório.';
comment on column public.billing_identities.document_fingerprint is
  'Fingerprint cego, preferencialmente HMAC com chave fora do banco; não usar hash simples de CPF/CNPJ.';

alter table public.asaas_customers
  add column if not exists billing_identity_id uuid,
  add column if not exists provisioning_state text not null default 'ready',
  add column if not exists provisioning_claim_token uuid,
  add column if not exists provisioning_lease_expires_at timestamptz,
  add column if not exists provisioning_attempts integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.asaas_customers'::regclass
      and conname = 'asaas_customers_billing_identity_fk'
  ) then
    alter table public.asaas_customers
      add constraint asaas_customers_billing_identity_fk
      foreign key (billing_identity_id)
      references public.billing_identities(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.asaas_customers'::regclass
      and conname = 'asaas_customers_provisioning_state_check'
  ) then
    alter table public.asaas_customers
      add constraint asaas_customers_provisioning_state_check
      check (provisioning_state in ('ready', 'provisioning', 'needs_review'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.asaas_customers'::regclass
      and conname = 'asaas_customers_provisioning_attempts_check'
  ) then
    alter table public.asaas_customers
      add constraint asaas_customers_provisioning_attempts_check
      check (provisioning_attempts >= 0);
  end if;
end;
$$;

create unique index if not exists asaas_customers_identity_environment_unique
  on public.asaas_customers (billing_identity_id, ambiente)
  where billing_identity_id is not null;

create index if not exists asaas_customers_identity_idx
  on public.asaas_customers (billing_identity_id, ambiente)
  where billing_identity_id is not null;

-- Claim separado para impedir duas tentativas externas de provisionamento da
-- mesma identidade/ambiente. Um lease expirado vira needs_review; nunca volta
-- automaticamente a pending, pois o POST anterior pode ter sido aceito.
create table if not exists public.asaas_customer_provisioning (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  billing_identity_id uuid not null references public.billing_identities(id) on delete restrict,
  ambiente text not null,
  status text not null default 'pending',
  claim_token uuid,
  lease_expires_at timestamptz,
  attempts integer not null default 0,
  asaas_customer_record_id uuid references public.asaas_customers(id) on delete restrict,
  provider_customer_id text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint asaas_customer_provisioning_environment_check
    check (ambiente in ('sandbox', 'production')),
  constraint asaas_customer_provisioning_status_check
    check (status in ('pending', 'creating', 'ready', 'needs_review')),
  constraint asaas_customer_provisioning_attempts_check
    check (attempts >= 0),
  constraint asaas_customer_provisioning_user_identity_unique
    unique (user_id, billing_identity_id, ambiente)
);

create index if not exists asaas_customer_provisioning_status_idx
  on public.asaas_customer_provisioning (status, lease_expires_at)
  where status in ('pending', 'creating');

alter table public.billing_identities enable row level security;
alter table public.asaas_customer_provisioning enable row level security;

revoke all on table public.billing_identities from public, anon, authenticated;
revoke all on table public.asaas_customer_provisioning from public, anon, authenticated;

create or replace function public.set_billing_identity_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists billing_identities_set_updated_at on public.billing_identities;
create trigger billing_identities_set_updated_at
before update on public.billing_identities
for each row execute function public.set_billing_identity_updated_at();

drop trigger if exists asaas_customer_provisioning_set_updated_at on public.asaas_customer_provisioning;
create trigger asaas_customer_provisioning_set_updated_at
before update on public.asaas_customer_provisioning
for each row execute function public.set_asaas_payment_updated_at();

-- Associa uma identidade ativa ao customer corrente. A operação só é exposta
-- ao backend e valida ambos os lados do vínculo sob lock.
create or replace function public.associate_asaas_customer_billing_identity(
  p_asaas_customer_record_id uuid,
  p_billing_identity_id uuid
)
returns table (asaas_customer_record_id uuid, billing_identity_id uuid, status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_customer public.asaas_customers%rowtype;
  v_identity public.billing_identities%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;
  if p_asaas_customer_record_id is null or p_billing_identity_id is null then
    raise exception 'customer and billing identity are required' using errcode = '22023';
  end if;

  select * into v_identity
  from public.billing_identities
  where id = p_billing_identity_id
  for update;
  if not found then
    raise exception 'billing identity not found' using errcode = 'P0002';
  end if;
  if v_identity.status <> 'active' then
    raise exception 'billing identity is not active' using errcode = 'P0001';
  end if;

  select * into v_customer
  from public.asaas_customers
  where id = p_asaas_customer_record_id
  for update;
  if not found then
    raise exception 'asaas customer not found' using errcode = 'P0002';
  end if;
  if v_customer.user_id <> v_identity.user_id then
    raise exception 'customer and billing identity owner mismatch' using errcode = '42501';
  end if;
  if v_customer.status <> 'active' or v_customer.provisioning_state <> 'ready' then
    raise exception 'asaas customer is not ready' using errcode = 'P0001';
  end if;
  if v_customer.billing_identity_id is not null
     and v_customer.billing_identity_id <> v_identity.id then
    raise exception 'asaas customer is linked to another billing identity' using errcode = '23505';
  end if;

  update public.asaas_customers
  set billing_identity_id = v_identity.id
  where id = v_customer.id;

  return query select v_customer.id, v_identity.id, 'active'::text;
end;
$$;

-- Associa o customer local ao payment_intent sem aceitar IDs de comprador do
-- cliente. O dono e o ambiente são derivados dos registros persistidos.
create or replace function public.associate_asaas_customer_payment_intent(
  p_payment_intent_id uuid,
  p_asaas_customer_record_id uuid
)
returns table (payment_intent_id uuid, asaas_customer_record_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_intent public.payment_intents%rowtype;
  v_customer public.asaas_customers%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;
  if p_payment_intent_id is null or p_asaas_customer_record_id is null then
    raise exception 'payment intent and customer are required' using errcode = '22023';
  end if;

  select * into v_intent
  from public.payment_intents
  where id = p_payment_intent_id
  for update;
  if not found then
    raise exception 'payment intent not found' using errcode = 'P0002';
  end if;
  if v_intent.provider <> 'asaas'
     or v_intent.method <> 'pix'
     or v_intent.status not in ('pending_creation', 'creating') then
    raise exception 'payment intent is not eligible for customer association' using errcode = 'P0001';
  end if;

  select * into v_customer
  from public.asaas_customers
  where id = p_asaas_customer_record_id
  for update;
  if not found then
    raise exception 'asaas customer not found' using errcode = 'P0002';
  end if;
  if v_customer.user_id <> v_intent.buyer_id
     or v_customer.ambiente <> v_intent.ambiente
     or v_customer.status <> 'active'
     or v_customer.provisioning_state <> 'ready'
     or v_customer.billing_identity_id is null then
    raise exception 'customer is not valid for payment intent' using errcode = '42501';
  end if;

  if v_intent.asaas_customer_id is not null
     and v_intent.asaas_customer_id <> v_customer.id then
    raise exception 'payment intent is linked to another customer' using errcode = '23505';
  end if;

  update public.payment_intents
  set asaas_customer_id = v_customer.id
  where id = v_intent.id
    and (asaas_customer_id is null or asaas_customer_id = v_customer.id);

  return query select v_intent.id, v_customer.id;
end;
$$;

create or replace function public.claim_asaas_customer_provisioning(
  p_billing_identity_id uuid,
  p_ambiente text default 'sandbox',
  p_lease_seconds integer default 120
)
returns table (
  provisioning_id uuid,
  status text,
  claim_granted boolean,
  claim_token uuid,
  lease_expires_at timestamptz,
  attempts integer,
  asaas_customer_record_id uuid,
  provider_customer_id text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_identity public.billing_identities%rowtype;
  v_claim public.asaas_customer_provisioning%rowtype;
  v_customer public.asaas_customers%rowtype;
  v_now timestamptz := clock_timestamp();
  v_token uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;
  if p_billing_identity_id is null or p_ambiente not in ('sandbox', 'production') then
    raise exception 'billing identity and environment are required' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 600 then
    raise exception 'lease must be between 30 and 600 seconds' using errcode = '22023';
  end if;

  select * into v_identity
  from public.billing_identities
  where id = p_billing_identity_id
  for update;
  if not found or v_identity.status <> 'active' then
    raise exception 'billing identity is not active' using errcode = 'P0001';
  end if;

  insert into public.asaas_customer_provisioning (user_id, billing_identity_id, ambiente)
  values (v_identity.user_id, v_identity.id, p_ambiente)
  on conflict (user_id, billing_identity_id, ambiente) do nothing;

  select * into v_claim
  from public.asaas_customer_provisioning
  where user_id = v_identity.user_id
    and billing_identity_id = v_identity.id
    and ambiente = p_ambiente
  for update;

  select * into v_customer
  from public.asaas_customers
  where user_id = v_identity.user_id
    and ambiente = p_ambiente
  for update;

  if found and v_customer.billing_identity_id = v_identity.id
     and v_customer.status = 'active'
     and v_customer.provisioning_state = 'ready' then
    update public.asaas_customer_provisioning
    set status = 'ready', asaas_customer_record_id = v_customer.id,
        provider_customer_id = v_customer.asaas_customer_id,
        claim_token = null, lease_expires_at = null
    where id = v_claim.id;
    return query select v_claim.id, 'ready'::text, false, null::uuid,
      null::timestamptz, v_claim.attempts, v_customer.id, v_customer.asaas_customer_id;
    return;
  end if;

  if v_claim.status = 'creating' then
    if v_claim.lease_expires_at is null or v_claim.lease_expires_at <= v_now then
      update public.asaas_customer_provisioning
      set status = 'needs_review', claim_token = null, lease_expires_at = null
      where id = v_claim.id;
      return query select v_claim.id, 'needs_review'::text, false, null::uuid,
        null::timestamptz, v_claim.attempts, v_claim.asaas_customer_record_id,
        v_claim.provider_customer_id;
    end if;
    return query select v_claim.id, v_claim.status, false, null::uuid,
      v_claim.lease_expires_at, v_claim.attempts, v_claim.asaas_customer_record_id,
      v_claim.provider_customer_id;
    return;
  end if;

  if v_claim.status in ('ready', 'needs_review') then
    return query select v_claim.id, v_claim.status, false, null::uuid,
      v_claim.lease_expires_at, v_claim.attempts, v_claim.asaas_customer_record_id,
      v_claim.provider_customer_id;
    return;
  end if;

  v_token := gen_random_uuid();
  update public.asaas_customer_provisioning
  set status = 'creating', claim_token = v_token,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      attempts = public.asaas_customer_provisioning.attempts + 1
  where public.asaas_customer_provisioning.id = v_claim.id
    and public.asaas_customer_provisioning.status = 'pending';

  return query select v_claim.id, 'creating'::text, true, v_token,
    v_now + make_interval(secs => p_lease_seconds), v_claim.attempts + 1,
    null::uuid, null::text;
end;
$$;

create or replace function public.finalize_asaas_customer_provisioning(
  p_provisioning_id uuid,
  p_claim_token uuid,
  p_provider_customer_id text
)
returns table (provisioning_id uuid, status text, asaas_customer_record_id uuid, provider_customer_id text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_claim public.asaas_customer_provisioning%rowtype;
  v_identity public.billing_identities%rowtype;
  v_customer public.asaas_customers%rowtype;
  v_customer_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;
  if p_provisioning_id is null or p_claim_token is null
     or nullif(btrim(p_provider_customer_id), '') is null then
    raise exception 'provisioning finalization fields are required' using errcode = '22023';
  end if;

  select * into v_claim
  from public.asaas_customer_provisioning
  where id = p_provisioning_id
  for update;
  if not found or v_claim.status <> 'creating'
     or v_claim.claim_token <> p_claim_token
     or v_claim.lease_expires_at is null
     or v_claim.lease_expires_at <= clock_timestamp() then
    raise exception 'stale or invalid provisioning claim' using errcode = 'P0001';
  end if;

  select * into v_identity
  from public.billing_identities
  where id = v_claim.billing_identity_id
  for update;
  if not found or v_identity.user_id <> v_claim.user_id or v_identity.status <> 'active' then
    raise exception 'billing identity is not valid for provisioning' using errcode = '42501';
  end if;

  select * into v_customer
  from public.asaas_customers
  where user_id = v_claim.user_id and ambiente = v_claim.ambiente
  for update;

  if found then
    if v_customer.billing_identity_id is not null
       and v_customer.billing_identity_id <> v_identity.id then
      raise exception 'existing customer belongs to another billing identity' using errcode = '23505';
    end if;
    if v_customer.asaas_customer_id <> btrim(p_provider_customer_id) then
      raise exception 'existing customer provider ID mismatch' using errcode = '23505';
    end if;
    v_customer_id := v_customer.id;
    update public.asaas_customers
    set billing_identity_id = v_identity.id,
        provisioning_state = 'ready',
        provisioning_claim_token = null,
        provisioning_lease_expires_at = null
    where id = v_customer.id;
  else
    insert into public.asaas_customers (
      user_id, ambiente, asaas_customer_id, status, billing_identity_id,
      provisioning_state
    ) values (
      v_claim.user_id, v_claim.ambiente, btrim(p_provider_customer_id),
      'active', v_identity.id, 'ready'
    ) returning id into v_customer_id;
  end if;

  update public.asaas_customer_provisioning
  set status = 'ready', claim_token = null, lease_expires_at = null,
      asaas_customer_record_id = v_customer_id,
      provider_customer_id = btrim(p_provider_customer_id)
  where public.asaas_customer_provisioning.id = v_claim.id
    and public.asaas_customer_provisioning.status = 'creating'
    and public.asaas_customer_provisioning.claim_token = p_claim_token;

  if not found then
    raise exception 'provisioning claim was superseded' using errcode = 'P0001';
  end if;

  return query select v_claim.id, 'ready'::text, v_customer_id, btrim(p_provider_customer_id);
end;
$$;

create or replace function public.mark_asaas_customer_provisioning_needs_review(
  p_provisioning_id uuid,
  p_claim_token uuid
)
returns table (provisioning_id uuid, status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;
  update public.asaas_customer_provisioning
  set status = 'needs_review', claim_token = null, lease_expires_at = null
  where public.asaas_customer_provisioning.id = p_provisioning_id
    and public.asaas_customer_provisioning.status = 'creating'
    and public.asaas_customer_provisioning.claim_token = p_claim_token;
  if not found then
    raise exception 'stale or invalid provisioning claim' using errcode = 'P0001';
  end if;
  return query select p_provisioning_id, 'needs_review'::text;
end;
$$;

alter function public.associate_asaas_customer_billing_identity(uuid, uuid) owner to postgres;
alter function public.associate_asaas_customer_payment_intent(uuid, uuid) owner to postgres;
alter function public.claim_asaas_customer_provisioning(uuid, text, integer) owner to postgres;
alter function public.finalize_asaas_customer_provisioning(uuid, uuid, text) owner to postgres;
alter function public.mark_asaas_customer_provisioning_needs_review(uuid, uuid) owner to postgres;

revoke all on function public.set_billing_identity_updated_at() from public, anon, authenticated;
revoke all on function public.associate_asaas_customer_billing_identity(uuid, uuid) from public, anon, authenticated;
revoke all on function public.associate_asaas_customer_payment_intent(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_asaas_customer_provisioning(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.finalize_asaas_customer_provisioning(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.mark_asaas_customer_provisioning_needs_review(uuid, uuid) from public, anon, authenticated;

grant execute on function public.associate_asaas_customer_billing_identity(uuid, uuid) to service_role;
grant execute on function public.associate_asaas_customer_payment_intent(uuid, uuid) to service_role;
grant execute on function public.claim_asaas_customer_provisioning(uuid, text, integer) to service_role;
grant execute on function public.finalize_asaas_customer_provisioning(uuid, uuid, text) to service_role;
grant execute on function public.mark_asaas_customer_provisioning_needs_review(uuid, uuid) to service_role;
