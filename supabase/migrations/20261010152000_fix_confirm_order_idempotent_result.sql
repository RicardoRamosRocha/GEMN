-- Mantém a resposta de retries idempotentes igual à confirmação original,
-- distinguindo cashback líquido disponibilizado do valor recuperado.
do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.confirm_order_payment(uuid, uuid)'::regprocedure
  );

  v_definition := replace(
    v_definition,
    'coalesce((
               select sum(oi.cashback_previsto)
                 from public.order_items as oi
                where oi.order_id = v_order.id
             ), 0.00)::numeric(18, 2),
             0.00::numeric(18, 2);',
    'coalesce((
               select sum(wt.valor)
                 from public.wallet_transactions as wt
                where wt.order_id = v_order.id
                  and wt.tipo = ''cashback_credito''
             ), 0.00)::numeric(18, 2),
             coalesce((
               select sum(wt.valor)
                 from public.wallet_transactions as wt
                where wt.order_id = v_order.id
                  and wt.tipo = ''cashback_recuperacao''
             ), 0.00)::numeric(18, 2);'
  );

  execute v_definition;
end;
$$;
