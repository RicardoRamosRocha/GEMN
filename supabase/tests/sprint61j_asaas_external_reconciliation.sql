do $$
begin
  if to_regprocedure('public.reconcile_asaas_payment_after_external_creation(uuid,text,text,text,numeric,text)') is null then
    raise exception 'external reconciliation RPC is missing';
  end if;
  if has_function_privilege('anon', 'public.reconcile_asaas_payment_after_external_creation(uuid,text,text,text,numeric,text)', 'EXECUTE') then
    raise exception 'external reconciliation RPC is exposed to anon';
  end if;
  if has_function_privilege('authenticated', 'public.reconcile_asaas_payment_after_external_creation(uuid,text,text,text,numeric,text)', 'EXECUTE') then
    raise exception 'external reconciliation RPC is exposed to authenticated';
  end if;
end;
$$;
