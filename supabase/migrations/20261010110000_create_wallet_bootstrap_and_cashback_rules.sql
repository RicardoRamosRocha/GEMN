-- GEMN: bootstrap seguro de carteiras e regras versionadas de cashback.
--
-- Esta etapa não altera create_order nem movimenta saldos. As carteiras e as
-- regras são escritas somente pelas RPCs abaixo; os clientes recebem apenas
-- leitura restrita às próprias entidades.

create table public.cashback_rules (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers (id),
  percentual numeric(5, 2) not null,
  idempotency_key uuid not null,
  vigente_desde timestamptz not null,
  vigente_ate timestamptz,
  criado_por uuid not null references public.profiles (id),
  criado_em timestamptz not null default now(),
  constraint cashback_rules_percentual_check
    check (
      percentual >= 0
      and percentual <= 20
      and percentual <> 'NaN'::numeric
      and percentual <> 'Infinity'::numeric
      and percentual <> '-Infinity'::numeric
    ),
  constraint cashback_rules_vigencia_check
    check (vigente_ate is null or vigente_ate > vigente_desde),
  constraint cashback_rules_operation_unique
    unique (seller_id, idempotency_key)
);

comment on table public.cashback_rules is
  'Histórico versionado do percentual de cashback configurado pelo seller; pedidos futuros devem capturar um snapshot.';
comment on column public.cashback_rules.percentual is
  'Percentual entre 0% e 20%, com duas casas decimais.';
comment on column public.cashback_rules.vigente_ate is
  'Nulo somente na regra atualmente vigente do seller.';
comment on column public.cashback_rules.idempotency_key is
  'Chave da operação de configuração; retries retornam a mesma regra.';

create unique index cashback_rules_one_current_per_seller_idx
  on public.cashback_rules (seller_id)
  where vigente_ate is null;

create index cashback_rules_seller_history_idx
  on public.cashback_rules (seller_id, vigente_desde desc, id desc);

create or replace function public.ensure_my_wallet()
returns table (
  wallet_id uuid,
  owner_id uuid,
  saldo_disponivel numeric(18, 2),
  saldo_reservado numeric(18, 2),
  saldo_a_recuperar numeric(18, 2),
  versao bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'usuário autenticado é obrigatório';
  end if;

  insert into public.wallets (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  return query
  select w.id,
         w.user_id,
         w.saldo_disponivel,
         w.saldo_reservado,
         w.saldo_a_recuperar,
         w.versao
    from public.wallets as w
   where w.user_id = v_user_id;
end;
$$;

comment on function public.ensure_my_wallet() is
  'Cria ou retorna atomicamente a carteira do usuário autenticado; retries são idempotentes pela unicidade de wallets.user_id.';

create or replace function public.set_seller_cashback(
  p_percentual numeric,
  p_idempotency_key uuid
)
returns table (
  rule_id uuid,
  seller_id uuid,
  percentual numeric(5, 2),
  vigente_desde timestamptz,
  vigente_ate timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_seller public.sellers%rowtype;
  v_existing public.cashback_rules%rowtype;
  v_current public.cashback_rules%rowtype;
  v_now timestamptz;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'usuário autenticado é obrigatório';
  end if;

  if p_percentual is null
     or p_percentual = 'NaN'::numeric
     or p_percentual = 'Infinity'::numeric
     or p_percentual = '-Infinity'::numeric
     or p_percentual < 0
     or p_percentual > 20 then
    raise exception using
      errcode = 'P0001',
      message = 'percentual de cashback deve estar entre 0 e 20';
  end if;

  if p_percentual <> round(p_percentual, 2) then
    raise exception using
      errcode = 'P0001',
      message = 'percentual de cashback deve possuir no máximo duas casas decimais';
  end if;

  if p_idempotency_key is null then
    raise exception using
      errcode = 'P0001',
      message = 'idempotency_key é obrigatória';
  end if;

  -- Toda configuração do mesmo seller usa a mesma ordem de lock. Assim,
  -- duas chamadas concorrentes não conseguem criar duas regras vigentes.
  select s.*
    into v_seller
    from public.sellers as s
   where s.user_id = v_user_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'usuário autenticado não possui vendedor';
  end if;

  if v_seller.status <> 'ativo' then
    raise exception using
      errcode = 'P0001',
      message = 'vendedor suspenso não pode configurar cashback';
  end if;

  select cr.*
    into v_existing
    from public.cashback_rules as cr
   where cr.seller_id = v_seller.id
     and cr.idempotency_key = p_idempotency_key;

  if found then
    return query
    select v_existing.id,
           v_existing.seller_id,
           v_existing.percentual,
           v_existing.vigente_desde,
           v_existing.vigente_ate;
    return;
  end if;

  v_now := clock_timestamp();

  select cr.*
    into v_current
    from public.cashback_rules as cr
   where cr.seller_id = v_seller.id
     and cr.vigente_ate is null
   for update;

  if found then
    update public.cashback_rules
       set vigente_ate = v_now
     where id = v_current.id;
  end if;

  return query
  insert into public.cashback_rules (
    seller_id,
    percentual,
    idempotency_key,
    vigente_desde,
    criado_por
  )
  values (
    v_seller.id,
    p_percentual::numeric(5, 2),
    p_idempotency_key,
    v_now,
    v_user_id
  )
  returning
    id,
    seller_id,
    percentual,
    vigente_desde,
    vigente_ate;
end;
$$;

comment on function public.set_seller_cashback(numeric, uuid) is
  'Versiona o percentual do seller autenticado entre 0% e 20%; retries retornam a mesma regra.';

alter table public.cashback_rules enable row level security;

create policy cashback_rules_select_own_seller
  on public.cashback_rules
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.sellers as s
       where s.id = seller_id
         and s.user_id = (select auth.uid())
    )
  );

-- Não há policies de INSERT, UPDATE ou DELETE. A única escrita é a RPC
-- SECURITY DEFINER, que valida o seller autenticado e seu status.
revoke all on table public.cashback_rules from public, anon, authenticated;

grant select (
  id,
  seller_id,
  percentual,
  idempotency_key,
  vigente_desde,
  vigente_ate,
  criado_por,
  criado_em
)
on table public.cashback_rules
to authenticated;

revoke all on function public.ensure_my_wallet() from public, anon, authenticated;
grant execute on function public.ensure_my_wallet() to authenticated;

revoke all on function public.set_seller_cashback(numeric, uuid) from public, anon, authenticated;
grant execute on function public.set_seller_cashback(numeric, uuid) to authenticated;
