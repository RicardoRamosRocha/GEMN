do $$
declare
  v_intent public.payment_intents%rowtype;
  v_order public.orders%rowtype;
  v_customer public.asaas_customers%rowtype;
begin
  if to_regprocedure('public.reconcile_asaas_payment_after_external_creation(uuid,text,text,text,numeric,text)') is null then
    raise exception 'reconciliation RPC is missing';
  end if;
  if has_function_privilege('anon', 'public.reconcile_asaas_payment_after_external_creation(uuid,text,text,text,numeric,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reconcile_asaas_payment_after_external_creation(uuid,text,text,text,numeric,text)', 'EXECUTE') then
    raise exception 'reconciliation RPC is exposed to a client role';
  end if;

  select pi.* into v_intent
    from public.payment_intents pi
   where pi.id = '8196965c-a8d8-4796-bd8c-32d8879846be';
  if not found or v_intent.status <> 'created'
     or v_intent.asaas_payment_id <> 'pay_j2qysys7q3bndatn'
     or v_intent.amount_due_real <> 5.00
     or v_intent.provider_status <> 'PENDING' then
    raise exception 'reconciled payment intent is inconsistent';
  end if;

  select o.* into v_order from public.orders o where o.id = v_intent.order_id;
  if not found or v_order.status <> 'pendente'
     or v_order.valor_devido_real <> 5.00
     or v_order.gemn_utilizado <> 0 then
    raise exception 'order changed during reconciliation';
  end if;

  select c.* into v_customer
    from public.asaas_customers c
   where c.id = v_intent.asaas_customer_id;
  if not found or v_customer.asaas_customer_id <> 'cus_000009645172'
     or v_customer.ambiente <> 'sandbox'
     or v_customer.status <> 'active' then
    raise exception 'customer binding is inconsistent';
  end if;

  if (select count(*) from public.payment_intents
      where external_reference = 'gemn-order-3dee8cdf-0e3b-4f33-8827-3d536fdde32b') <> 1 then
    raise exception 'duplicate payment intent reference detected';
  end if;
end;
$$;
