-- As novas colunas permanecem somente leitura para o comprador, seguindo o
-- modelo de privilégios por coluna das tabelas de pedidos.

grant select (gemn_utilizado, valor_devido_real)
on table public.orders to authenticated;

grant select (cashback_rule_id, cashback_percentual, cashback_previsto)
on table public.order_items to authenticated;

grant select (aceita_gemn)
on table public.sellers to authenticated;
