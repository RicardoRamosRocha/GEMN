-- GEMN: corrige a qualificação do RETURNING da RPC de cashback.
--
-- A migration anterior já foi aplicada e não é editada. Esta migration
-- substitui somente a função, evitando colisão entre a coluna de saída
-- seller_id e a coluna seller_id da tabela cashback_rules.

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
  insert into public.cashback_rules as inserted (
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
    inserted.id,
    inserted.seller_id,
    inserted.percentual,
    inserted.vigente_desde,
    inserted.vigente_ate;
end;
$$;

comment on function public.set_seller_cashback(numeric, uuid) is
  'Versiona o percentual do seller autenticado entre 0% e 20%; retries retornam a mesma regra.';

revoke all on function public.set_seller_cashback(numeric, uuid) from public, anon, authenticated;
grant execute on function public.set_seller_cashback(numeric, uuid) to authenticated;
