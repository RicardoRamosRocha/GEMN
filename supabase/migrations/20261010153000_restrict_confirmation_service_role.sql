-- A confirmação administrativa usa a identidade do administrador autenticado.
-- O papel service_role não recebe um caminho alternativo para confirmar pedidos.
revoke execute on function public.confirm_order_payment(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.confirm_order_payment(uuid, uuid)
  to authenticated;
