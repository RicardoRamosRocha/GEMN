# Sprint 6.1-D4 — checklist de aplicação controlada

Este documento prepara uma futura aplicação das migrations multi-item no Supabase DEV. Ele não executa conexão, backup, migration ou alteração de dados.

## Migrations em ordem

1. `20261016100000_enable_multi_item_orders_same_seller.sql`
2. `20261016110000_create_admin_pending_orders_v2.sql`

Aplicar cada migration em transação conforme o mecanismo oficial do projeto e registrar o identificador da versão aplicada. Não usar `db reset` no DEV.

## Preflight read-only no DEV

Executar com uma conexão explicitamente somente leitura, sem `supabase link` ou `db push` nesta etapa:

```sql
select current_database(), current_user, inet_server_addr(), inet_server_port();

select count(*) as pedidos,
       count(*) filter (where status = 'pendente') as pendentes,
       count(*) filter (where status in ('confirmado', 'concluido')) as confirmados,
       count(*) filter (where gemn_utilizado > 0) as com_gemn
  from public.orders;

select oi.order_id, count(*) as itens
  from public.order_items oi
 group by oi.order_id
having count(*) <> 1
 order by itens desc, oi.order_id;

select oi.order_id, count(distinct oi.seller_id) as vendedores
  from public.order_items oi
 group by oi.order_id
having count(distinct oi.seller_id) <> 1;

select o.id,
       o.total_real,
       round(sum(oi.subtotal_real), 2) as itens_real,
       o.total_gemn,
       case when count(*) filter (where oi.subtotal_gemn is null) = count(*)
            then null else round(sum(oi.subtotal_gemn), 2) end as itens_gemn,
       o.gemn_utilizado,
       round(sum(oi.subtotal_real - coalesce(oi.gemn_utilizado_item, 0)), 2) as itens_devido
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
 group by o.id, o.total_real, o.total_gemn, o.gemn_utilizado
having o.total_real is distinct from round(sum(oi.subtotal_real), 2)
    or o.total_gemn is distinct from
       case when count(*) filter (where oi.subtotal_gemn is null) = count(*)
            then null else round(sum(oi.subtotal_gemn), 2) end
    or o.valor_devido_real is distinct from round(sum(oi.subtotal_real - coalesce(oi.gemn_utilizado_item, 0)), 2);

select o.id, o.gemn_utilizado, r.valor_gemn, r.status
  from public.orders o
  left join public.gemn_reservations r on r.order_id = o.id
 where o.gemn_utilizado > 0
   and (r.id is null or r.valor_gemn is distinct from o.gemn_utilizado);

select w.user_id, w.saldo_disponivel, w.saldo_reservado,
       coalesce(sum(cl.valor_disponivel), 0) as lotes_disponiveis,
       coalesce(sum(cl.valor_reservado), 0) as lotes_reservados
  from public.wallets w
  left join public.cashback_lots cl on cl.wallet_id = w.id
 group by w.user_id, w.saldo_disponivel, w.saldo_reservado
having w.saldo_disponivel < 0
    or w.saldo_reservado < 0
    or w.saldo_disponivel is distinct from coalesce(sum(cl.valor_disponivel), 0);

select o.id, o.idempotency_key, count(*) as pedidos
  from public.orders o
 group by o.id, o.idempotency_key
having count(*) > 1;
```

Qualquer linha retornada pelas consultas de cardinalidade, totais, reservas ou saldos bloqueia a aplicação até investigação. A ausência de linhas é necessária, mas não substitui backup e smoke tests.

## Backup e aplicação

- Confirmar o projeto, host, porta e database por canal independente.
- Confirmar backup verificável e ponto de restauração antes da janela.
- Registrar contagens e hashes/relatórios do preflight.
- Pausar operações de checkout durante a janela.
- Aplicar as migrations em ordem cronológica, sem editar SQL manualmente.
- Confirmar que a execução terminou sem erro antes de reabrir operações.

## Smoke tests pós-aplicação

- Verificar existência de `gemn_utilizado_item` e do índice único `(order_id, listing_id)`.
- Verificar `create_order` individual com retry idêntico.
- Verificar leitura administrativa antiga e `list_admin_pending_orders_v2`.
- Verificar um pedido multi-item em ambiente controlado, sem habilitar o checkout público.
- Confirmar que pedido pendente com GEMN possui exatamente uma reserva.
- Confirmar que `sum(gemn_utilizado_item) = orders.gemn_utilizado`.
- Confirmar cashback por item usando somente o valor pago em reais.
- Reexecutar as consultas de invariantes do preflight.

## Recuperação

Rollback automático não é presumido como seguro depois que pedidos multi-item forem criados. A migration altera funções, triggers, índice e adiciona coluna; remover esses objetos pode quebrar dados persistidos.

Se houver falha antes de qualquer pedido multi-item:

1. interromper o checkout;
2. preservar logs e estado;
3. avaliar restauração para o backup somente com aprovação operacional;
4. validar pedidos individuais e reservas após a recuperação.

Se já houver pedidos multi-item, não remover a migration nem reativar a restrição de item único. O caminho seguro é uma migration corretiva compatível, preservando snapshots, reservas, cashback e histórico.

## Lacunas conhecidas

- O runner funcional cria fixtures locais e exige autenticação simulada; não deve ser apontado para DEV.
- A concorrência divergente pode ser repetida pelo runner `supabase/tests/sprint61d4_concurrent_idempotency.ps1`, sempre com container local exclusivo e duas listings distintas.
- O teste FIFO agora verifica explicitamente `ordem_fifo = 1,2`, mas não cobre ainda três ou mais lotes.
- O checkout do carrinho permanece desabilitado.

Exemplo de execução local, após obter duas listings de fixture:

```powershell
.\supabase\tests\sprint61d4_concurrent_idempotency.ps1 `
  -Container supabase_db_gemn-sprint61d3r1-local `
  -DbHost 127.0.0.1 -DbPort 55522 `
  -ListingA <uuid-a> -ListingB <uuid-b> `
  -IdempotencyKey <uuid-nova>
```
