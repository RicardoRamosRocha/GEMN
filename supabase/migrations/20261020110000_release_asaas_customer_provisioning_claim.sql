-- Libera um claim somente quando nenhum POST /customers foi iniciado.
-- A posse do token e o lock impedem liberar um claim concorrente.

create or replace function public.release_asaas_customer_provisioning_claim(
  p_provisioning_id uuid,
  p_claim_token uuid
)
returns table (provisioning_id uuid, status text, changed boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_claim public.asaas_customer_provisioning%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'backend authorization required' using errcode = '42501';
  end if;
  if p_provisioning_id is null or p_claim_token is null then
    raise exception 'claim fields are required' using errcode = '22023';
  end if;

  select * into v_claim
  from public.asaas_customer_provisioning
  where id = p_provisioning_id
  for update;
  if not found or v_claim.status <> 'creating'
     or v_claim.claim_token <> p_claim_token then
    raise exception 'stale or invalid provisioning claim' using errcode = 'P0001';
  end if;

  update public.asaas_customer_provisioning
  set status = 'pending', claim_token = null, lease_expires_at = null
  where public.asaas_customer_provisioning.id = v_claim.id
    and public.asaas_customer_provisioning.status = 'creating'
    and public.asaas_customer_provisioning.claim_token = p_claim_token;
  if not found then
    raise exception 'provisioning claim was superseded' using errcode = 'P0001';
  end if;

  return query select v_claim.id, 'pending'::text, true;
end;
$$;

alter function public.release_asaas_customer_provisioning_claim(uuid, uuid)
  owner to postgres;
revoke all on function public.release_asaas_customer_provisioning_claim(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_asaas_customer_provisioning_claim(uuid, uuid)
  to service_role;
