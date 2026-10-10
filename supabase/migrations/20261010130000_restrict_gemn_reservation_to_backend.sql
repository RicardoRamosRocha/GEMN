-- Até a integração da reserva à create_order, compradores não podem iniciar
-- reservas diretamente. O backend deverá chamar esta RPC somente depois de
-- persistir e validar a intenção de pagamento GEMN.

revoke execute on function public.reserve_gemn_for_order(uuid, numeric, uuid, timestamptz)
  from public, anon, authenticated;

grant execute on function public.reserve_gemn_for_order(uuid, numeric, uuid, timestamptz)
  to service_role;

comment on function public.reserve_gemn_for_order(uuid, numeric, uuid, timestamptz) is
  'Reserva GEMN por lotes FIFO; disponível somente ao backend até a integração transacional com create_order.';
