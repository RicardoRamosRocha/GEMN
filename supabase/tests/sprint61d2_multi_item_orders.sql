-- Sprint 6.1-D2-R1: contrato e cenarios multi-item.
--
-- A primeira secao pode ser executada em qualquer banco que ja tenha a
-- migration aplicada. A secao funcional exige fixtures locais e deve ser
-- executada somente em PostgreSQL isolado. Nao executar no DEV compartilhado.

do $$
declare
  v_definition text;
  v_exists boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'order_items'
       and column_name = 'gemn_utilizado_item'
  ) into v_exists;
  if not v_exists then raise exception 'gemn_utilizado_item nao encontrado'; end if;

  select exists (
    select 1 from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname = 'create_order_from_items'
  ) into v_exists;
  if not v_exists then raise exception 'create_order_from_items nao encontrada'; end if;

  select exists (
    select 1 from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname = 'list_admin_pending_orders_v2'
  ) into v_exists;
  if not v_exists then raise exception 'list_admin_pending_orders_v2 nao encontrada'; end if;

  select exists (
    select 1 from pg_trigger
     where tgname = 'validate_order_totals_after_item_write'
       and tgrelid = 'public.order_items'::regclass
  ) into v_exists;
  if not v_exists then raise exception 'trigger agregado de itens nao encontrado'; end if;

  select exists (
    select 1 from pg_constraint
     where conname = 'order_items_one_item_per_order_unique'
       and conrelid = 'public.order_items'::regclass
  ) into v_exists;
  if v_exists then raise exception 'restricao antiga de item unico ainda existe'; end if;

  select pg_get_functiondef(p.oid) into v_definition
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname = 'create_order_from_items'
   limit 1;
  if lower(v_definition) not like '%security definer%' then
    raise exception 'RPC multi-item nao e SECURITY DEFINER';
  end if;
  if lower(v_definition) not like '%order by x.listing_id%' then
    raise exception 'distribuicao nao esta ordenada por listing_id';
  end if;
  if lower(v_definition) not like '%jsonb_to_recordset%' then
    raise exception 'entrada multi-item nao usa contrato JSONB esperado';
  end if;
  if lower(v_definition) not like '%reserve_gemn_for_order%' then
    raise exception 'RPC multi-item nao integra reserva GEMN';
  end if;
end;
$$;

-- Harness funcional para banco isolado.
-- O runner deve fornecer IDs de fixtures e executar o bloco abaixo como um
-- comprador autenticado. O bloco e transacional: o ROLLBACK impede efeitos
-- financeiros persistentes no banco local de teste.
--
-- begin;
-- select set_config('request.jwt.claim.sub', '<buyer-id>', true);
-- set local role authenticated;
--
-- -- Dois itens do mesmo seller, reais: verificar soma e cashback por item.
-- select * from public.create_order_from_items(
--   jsonb_build_array(
--     jsonb_build_object('listing_id', '<listing-a>', 'quantidade', 2),
--     jsonb_build_object('listing_id', '<listing-b>', 'quantidade', 1)
--   ), 0.00, '<idempotency-real>'::uuid
-- );
--
-- -- GEMN parcial: verificar sum(gemn_utilizado_item) = 10.00 e
-- -- cashback = round((subtotal_real - gemn_utilizado_item) * percentual / 100, 2).
-- select * from public.create_order_from_items(
--   jsonb_build_array(
--     jsonb_build_object('listing_id', '<gemn-listing-a>', 'quantidade', 1),
--     jsonb_build_object('listing_id', '<gemn-listing-b>', 'quantidade', 3)
--   ), 10.00, '<idempotency-partial>'::uuid
-- );
--
-- -- GEMN integral: verificar forma_pagamento = gemn, valor devido zero e
-- -- cashback zero.
-- select * from public.create_order_from_items(
--   jsonb_build_array(jsonb_build_object('listing_id', '<gemn-listing-a>', 'quantidade', 1)),
--   '<subtotal-real>'::numeric, '<idempotency-full>'::uuid
-- );
--
-- -- FIFO: consultar gemn_reservations, allocations e cashback_lots; a soma
-- -- das allocations deve ser exatamente o valor reservado e a ordem deve ser
-- -- criado_em, id do lote.
-- select * from public.gemn_reservation_allocations
--  where reservation_id = (select id from public.gemn_reservations where order_id = '<order-id>'::uuid)
--  order by ordem_fifo;
--
-- -- Retry idempotente apos alteracao de preco: repetir a mesma chave e
-- -- comparar os snapshots retornados, sem consultar preco atual.
-- -- Retry divergente: mesma chave com quantidade/listing/GEMN diferente deve
-- -- retornar P0001 e nao criar pedido adicional.
--
-- -- Concorrencia: executar duas sessoes com a mesma chave. Espera-se um
-- -- order_id, uma reserva e nenhum duplicate financeiro.
--
-- -- Confirmacao: como administrador isolado, executar confirm_order_payment
-- -- e verificar um cashback_lot por order_item.
-- -- Expiracao: chamar expire_pending_orders e verificar liberacao integral.
-- -- Cancelamento: chamar cancel_pending_order ou cancel_confirmed_order e
-- -- verificar estorno de todos os itens/lotes.
-- -- Regressao: executar create_order individual real, misto e GEMN e comparar
-- -- totals, gemn_utilizado_item, reserva e retorno com o contrato anterior.
--
-- rollback;
