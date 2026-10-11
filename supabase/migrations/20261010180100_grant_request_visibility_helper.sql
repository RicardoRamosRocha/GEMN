-- A funcao usada pelas policies RLS precisa ser executavel pelo papel que
-- consulta as linhas. Ela retorna somente boolean e valida auth.uid() dentro
-- de SECURITY DEFINER; nao concede leitura ou escrita direta nas tabelas.
revoke all on function public.can_view_order_cancellation_request(uuid, uuid)
  from public, anon;

grant execute on function public.can_view_order_cancellation_request(uuid, uuid)
  to authenticated;
