\set ON_ERROR_STOP on
begin;

select count(*) > 0 as cleanup_refused
  from public.orders as o
  join auth.users as u on u.id = o.buyer_id
 where u.email in (:'buyer_a_email', :'buyer_b_email');
\gset

\if :cleanup_refused
  \echo 'cleanup refused: fixture users have order history; no rows were deleted'
  rollback;
  \quit
\endif

delete from public.listings
 where nome like concat('GEMN_S22_', :'run_id', '_%');

delete from public.sellers
 where nome_negocio like concat('GEMN_S22_', :'run_id', '_%');

delete from public.seller_applications
 where nome_negocio like concat('GEMN_S22_', :'run_id', '_%');

delete from public.categories
 where nome like concat('GEMN_S22_', :'run_id', '_%');

delete from auth.users
 where email in (:'buyer_a_email', :'buyer_b_email');

commit;
