# Roteiro de testes da RPC `create_order`

Este roteiro depende de um PostgreSQL/Supabase local com a migration de tabelas
e a migration da RPC aplicadas. Os valores abaixo são placeholders e devem ser
substituídos por IDs de fixtures reais.

## Preparação

Use duas sessões autenticadas distintas:

- `BUYER_A`: comprador dono de `LISTING_ATIVO`;
- `BUYER_B`: outro comprador;
- `LISTING_ATIVO`: listing com seller ativo;
- `LISTING_INATIVO`: listing com status `inativo`;
- `LISTING_SELLER_SUSPENSO`: listing cujo seller está `suspenso`;
- `KEY_1`: UUID de idempotência novo.

As chamadas autenticadas devem ser executadas pelo cliente Supabase da sessão
correspondente, para que `auth.uid()` represente o comprador correto.

## Casos funcionais

```sql
-- a) pedido válido: deve retornar uma linha com status pendente
select * from public.create_order(
  'LISTING_ATIVO'::uuid,
  2,
  'real',
  'KEY_1'::uuid
);

-- b) usuário não autenticado: deve falhar
select * from public.create_order(
  'LISTING_ATIVO'::uuid,
  1,
  'real',
  'KEY_2'::uuid
);

-- c) listing inativo: deve falhar
select * from public.create_order(
  'LISTING_INATIVO'::uuid,
  1,
  'real',
  'KEY_3'::uuid
);

-- d) seller suspenso: deve falhar
select * from public.create_order(
  'LISTING_SELLER_SUSPENSO'::uuid,
  1,
  'real',
  'KEY_4'::uuid
);

-- e) quantidade inválida: deve falhar
select * from public.create_order(
  'LISTING_ATIVO'::uuid,
  0,
  'real',
  'KEY_5'::uuid
);

-- f) modalidade inválida: deve falhar
select * from public.create_order(
  'LISTING_ATIVO'::uuid,
  1,
  'misto',
  'KEY_6'::uuid
);

-- GEMN em listing sem preco_gemn: deve falhar
select * from public.create_order(
  'LISTING_ATIVO_SEM_GEMN'::uuid,
  1,
  'gemn',
  'KEY_7'::uuid
);

-- g) retry com mesma chave e mesmos dados: deve retornar o mesmo order_id
select * from public.create_order(
  'LISTING_ATIVO'::uuid,
  2,
  'real',
  'KEY_1'::uuid
);

-- h) mesma chave com listing, quantidade ou modalidade diferente: deve falhar
select * from public.create_order(
  'LISTING_ATIVO'::uuid,
  3,
  'real',
  'KEY_1'::uuid
);
```

Depois do primeiro pedido, alterar o preço ou desativar o listing e repetir a
chamada com `KEY_1` e os mesmos parâmetros deve retornar o mesmo pedido. O
retry não deve recalcular nem comparar o preço atual.

Se o pedido original for alterado para `cancelado` por um fixture administrativo,
o retry com a mesma chave e os mesmos parâmetros deve retornar o pedido
cancelado; não deve criar um novo pedido.

## Concorrência

Execute simultaneamente, em duas sessões autenticadas do mesmo comprador, a
mesma chamada com `KEY_CONCORRENTE`:

```sql
select * from public.create_order(
  'LISTING_ATIVO'::uuid,
  1,
  'real',
  'KEY_CONCORRENTE'::uuid
);
```

As duas sessões devem terminar com o mesmo `order_id`, e a consulta abaixo deve
retornar exatamente uma linha de item:

```sql
select o.id, count(oi.id)
  from public.orders as o
  join public.order_items as oi on oi.order_id = o.id
 where o.idempotency_key = 'KEY_CONCORRENTE'::uuid
 group by o.id;
```

## Segurança e isolamento

Executados como `authenticated`, os comandos abaixo devem falhar:

```sql
insert into public.orders (
  buyer_id, idempotency_key, status, forma_pagamento, total_real
)
values (
  auth.uid(), 'KEY_DIRETA'::uuid, 'pendente', 'real', 1.00
);

update public.orders
   set status = 'confirmado'
 where buyer_id = auth.uid();

delete from public.order_items;
```

Como `BUYER_B`, a consulta abaixo não deve retornar pedidos de `BUYER_A`:

```sql
select *
  from public.orders
 where buyer_id = 'BUYER_A'::uuid;
```

Também deve ser verificado que `authenticated` possui `EXECUTE` na RPC, mas
`anon` e `public` não possuem esse privilégio.
