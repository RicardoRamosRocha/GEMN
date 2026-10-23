begin;

do $$
declare
  v_event uuid := gen_random_uuid();
  v_intent uuid := gen_random_uuid();
  v_order uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_customer uuid := gen_random_uuid();
  v_result record;
begin
  -- Contract presence and least privilege.
  if to_regprocedure('public.reprocess_asaas_webhook_event_after_verification(uuid,uuid,text,text,text,numeric,text)') is null then
    raise exception 'temporal recovery RPC is missing';
  end if;
  if has_function_privilege('anon', 'public.reprocess_asaas_webhook_event_after_verification(uuid,uuid,text,text,text,numeric,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reprocess_asaas_webhook_event_after_verification(uuid,uuid,text,text,text,numeric,text)', 'EXECUTE') then
    raise exception 'temporal recovery RPC is exposed to a client role';
  end if;
  if to_regprocedure('public.complete_asaas_webhook_event_after_finalization(uuid,uuid)') is null then
    raise exception 'temporal completion RPC is missing';
  end if;

  -- The live event is covered by the migration and has been recovered through
  -- the authenticated path; its source timestamp remains ambiguous evidence.
  if not exists (
    select 1 from public.payment_webhook_events
    where asaas_event_id = 'evt_d26e303b238e509335ac9ba210e51b0f&23150631'
      and payment_intent_id = '8196965c-a8d8-4796-bd8c-32d8879846be'
      and processing_status in ('pending', 'processed')
      and occurred_at is null
  ) then
    raise exception 'live recovered event evidence changed';
  end if;

  -- No timestamp inference is permitted by the function contract.
  if (select prosrc from pg_proc where oid = 'public.reprocess_asaas_webhook_event_after_verification(uuid,uuid,text,text,text,numeric,text)'::regprocedure)
     not like '%processing_status = ''pending''%' then
    raise exception 'recovery does not release only to pending';
  end if;

  if (select prosrc from pg_proc where oid = 'public.reprocess_asaas_webhook_event_after_verification(uuid,uuid,text,text,text,numeric,text)'::regprocedure)
     like '%occurred_at =%' then
    raise exception 'recovery must not infer occurred_at';
  end if;
end;
$$;

rollback;

select 'sprint61r_asaas_temporal_recovery_contract_ok' as result;
