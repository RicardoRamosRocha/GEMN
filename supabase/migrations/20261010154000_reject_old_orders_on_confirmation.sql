-- Pedidos com 24 horas ou mais não podem ser confirmados.
do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.confirm_order_payment(uuid, uuid)'::regprocedure
  );

  v_definition := replace(
    v_definition,
    'if v_order.status <> ''pendente'' then
    raise exception using errcode = ''P0001'', message = ''somente pedidos pendentes podem ser confirmados'';
  end if;',
    'if v_order.status <> ''pendente'' then
    raise exception using errcode = ''P0001'', message = ''somente pedidos pendentes podem ser confirmados'';
  end if;

  if v_order.criado_em <= clock_timestamp() - interval ''24 hours'' then
    raise exception using errcode = ''P0001'', message = ''pedido expirado para confirmação administrativa'';
  end if;'
  );

  execute v_definition;
end;
$$;
