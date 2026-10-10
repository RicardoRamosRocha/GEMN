-- The 3B core is an implementation detail called by the public wrapper.
-- Keep it unavailable to all API roles, including service_role.
revoke all on function public.create_order_3b_internal(uuid, integer, text, uuid, numeric)
  from public, anon, authenticated, service_role;

comment on function public.create_order_3b_internal(uuid, integer, text, uuid, numeric) is
  'Internal transaction core for create_order; callable only by its owning database role.';
