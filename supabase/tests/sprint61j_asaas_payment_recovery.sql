-- Contrato da recuperação auditada; não chama o Asaas.
do $$
begin
  if to_regprocedure('public.recover_failed_asaas_payment_after_negative_reconciliation(uuid,text,integer,integer)') is null then
    raise exception 'audited recovery RPC is missing';
  end if;
  if has_function_privilege('anon', 'public.recover_failed_asaas_payment_after_negative_reconciliation(uuid,text,integer,integer)', 'EXECUTE') then
    raise exception 'recovery RPC is exposed to anon';
  end if;
  if has_function_privilege('authenticated', 'public.recover_failed_asaas_payment_after_negative_reconciliation(uuid,text,integer,integer)', 'EXECUTE') then
    raise exception 'recovery RPC is exposed to authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.recover_failed_asaas_payment_after_negative_reconciliation(uuid,text,integer,integer)', 'EXECUTE') then
    raise exception 'recovery RPC is not available to service_role';
  end if;
end;
$$;
