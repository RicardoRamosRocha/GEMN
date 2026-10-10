-- Corrige referências ambíguas a status na RPC de confirmação.
-- A função retorna uma coluna chamada status; os UPDATEs precisam qualificar
-- a coluna da tabela para não depender da resolução de nomes do PL/pgSQL.
do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.confirm_order_payment(uuid, uuid)'::regprocedure
  );

  v_definition := replace(
    v_definition,
    'update public.gemn_reservation_allocations
         set status = ''consumida'', atualizado_em = now()
       where id = v_allocation.id
         and status = ''ativa'';',
    'update public.gemn_reservation_allocations as gra
         set status = ''consumida'', atualizado_em = now()
       where gra.id = v_allocation.id
         and gra.status = ''ativa'';'
  );

  v_definition := replace(
    v_definition,
    'update public.gemn_reservations
       set status = ''efetivada'', atualizado_em = now()
     where id = v_reservation.id
       and status = ''ativa'';',
    'update public.gemn_reservations as gr
       set status = ''efetivada'', atualizado_em = now()
     where gr.id = v_reservation.id
       and gr.status = ''ativa'';'
  );

  v_definition := replace(
    v_definition,
    'update public.orders
     set status = ''confirmado'',',
    'update public.orders as ord
     set status = ''confirmado'', '
  );

  v_definition := replace(
    v_definition,
    'where id = v_order.id
     and status = ''pendente'';',
    'where ord.id = v_order.id
     and ord.status = ''pendente'';'
  );

  execute v_definition;
end;
$$;
