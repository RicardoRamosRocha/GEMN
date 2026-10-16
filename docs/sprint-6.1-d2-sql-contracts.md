# Sprint 6.1-D2 — Contratos SQL multi-item

## Escopo

A migration `20261016100000_enable_multi_item_orders_same_seller.sql` habilita
pedidos com ate 20 listings distintos, todos do mesmo vendedor, e ate 99
unidades por listing. Produtos e servicos continuam aceitos.

`create_order` preserva a assinatura e o fluxo individual. A nova RPC e
`create_order_from_items(jsonb, numeric, uuid)` e recebe somente um array de
`listing_id` e `quantidade`, o valor GEMN solicitado e uma chave UUID de
idempotencia.

## Regras financeiras

Precos, seller, cashback, imagem e subtotais sao derivados de listings e
cashback_rules bloqueados pelo PostgreSQL. `subtotal_gemn` continua sendo o
preco de catalogo em GEMN. `gemn_utilizado_item` registra o desconto efetivo
alocado ao item, em ordem deterministica por `listing_id`.

Cashback e calculado por item sobre `subtotal_real - gemn_utilizado_item`, com
arredondamento monetario em duas casas. Se algum item nao aceitar GEMN, uma
tentativa com GEMN positivo e rejeitada e deve ser repetida com pagamento em
reais; o banco nao altera silenciosamente a intencao financeira recebida.

## Compatibilidade e rollback

O preenchimento inicial de `gemn_utilizado_item` copia somente o valor ja
registrado em `orders.gemn_utilizado` para o item existente. Nao recalcula
totais, cashback, saldo ou reservas.

A restricao de item unico e removida somente depois da instalacao dos triggers
agregados, na mesma migration. O rollback seguro exige que ainda nao existam
pedidos multi-item: restaurar a funcao anterior, remover o indice composto e
recriar a restricao antiga. Nao executar rollback destrutivo depois que houver
pedidos com mais de um item.

## Aplicacao segura

1. Revisar a migration em ambiente isolado.
2. Executar os cenarios descritos em `supabase/tests/sprint61d2_multi_item_orders.sql`.
3. Verificar compatibilidade dos leitores administrativos e do historico.
4. Fazer backup e janela de aplicacao antes de qualquer `db push`.
5. Aplicar primeiro em DEV somente apos aprovacao explicita.

Nesta sprint nenhum comando de aplicacao remota deve ser executado.

## Revisao R1

Antes do backfill, a migration instala a validacao agregada e executa
preflight de cardinalidade, quantidade e totais historicos. O backfill ocorre
ao final, depois de todos os comandos DDL que removem os triggers antigos,
para nao deixar eventos diferidos pendentes durante `ALTER TABLE`.

Os locks da RPC multi-item sao adquiridos em duas fases: todos os listings em
ordem deterministica e depois o seller. Isso evita adquirir seller entre dois
locks de listing e reduz deadlocks com `create_order` individual.

A leitura administrativa multi-item foi adicionada em
`list_admin_pending_orders_v2`; a RPC anterior permanece disponivel para
clientes antigos. O servico TypeScript usa a versao agregada e o normalizador
aceita tanto o formato antigo quanto o novo.

Ainda e obrigatorio executar os testes funcionais em PostgreSQL isolado antes
de qualquer aplicacao no DEV. O repositorio nao possui estoque, e o fluxo de
checkout do carrinho continua desabilitado nesta etapa.
