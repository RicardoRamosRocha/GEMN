-- GEMN Sprint 4.5-D: permite cancelar a origem de cashback já consumido.
--
-- A dívida é criada atomica e auditavelmente por cancel_confirmed_order.
-- O pedido consumidor e suas alocações permanecem intactos. A proteção para
-- cashback reservado em pedido pendente continua na RPC financeira.

drop trigger if exists reject_live_cashback_consumption_on_cancellation
  on public.order_cancellations;

drop function if exists public.reject_cancellation_with_live_cashback_consumption();
