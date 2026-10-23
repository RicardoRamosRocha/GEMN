# Fixtures sintéticas E13

Scripts para preparar um comprador, vendedor, administrador, anúncio, carteira
e pedido exclusivamente no Supabase E13 local.

Por padrão, `provision.sh`, `validate.sh` e `cleanup.sh` ficam em modo plano.
Nenhum script foi executado em modo de criação nesta sprint.

## Ordem futura

1. `provision.sh --apply --run-id <id>` cria os usuários pelo Auth local.
2. O trigger cria os `profiles` automaticamente.
3. O script promove somente o administrador sintético no banco E13.
4. Cria uma categoria administrativa e uma candidatura autenticada do vendedor.
5. Aprova a candidatura com `review_seller_application` usando o token do admin.
6. Cria o anúncio ativo usando o token autenticado do vendedor.
7. Cria a carteira pelo `ensure_my_wallet`.
8. Cria o pedido pendente pelo `create_order` de quatro argumentos.
9. `validate.sh --apply --run-id <id>` verifica relações e isolamento RLS.
10. `cleanup.sh --apply --run-id <id>` remove somente os IDs do manifesto.

Para uma execução interrompida, use primeiro `provision.sh --resume --plan
--run-id <id>`. Somente após conferir o manifesto, a retomada pode ser feita
com `--resume --apply`. Esse modo exige os três UUIDs de Auth no manifesto,
recusa divergências e não executa novo signup. As sessões temporárias são
obtidas com senha sintética em memória; a promoção e a recuperação de senha
usam somente o PostgreSQL do container E13 validado.

O fluxo não cria `payment_intents`, Pix, webhooks, chamadas Asaas ou finalizer.

## Variáveis de execução

`E13_API_URL` pode ser apenas `http://127.0.0.1:64321` ou
`http://localhost:64321`. `E13_PUBLISHABLE_KEY` e
`E13_FIXTURE_PASSWORD` são fornecidas temporariamente por ambiente/stdin e
nunca são gravadas no manifesto. O manifesto contém apenas IDs sintéticos e
é ignorado pelo Git em `fixtures/.local/`.

Para `validate.sh`, os tokens devem ser fornecidos por ambiente, sem argumentos
ou arquivos:

- `E13_FIXTURE_BUYER_TOKEN`
- `E13_FIXTURE_SELLER_TOKEN`
- `E13_FIXTURE_ADMIN_TOKEN`

## Contratos usados

- `review_seller_application(uuid, text, text) -> uuid`
- `set_seller_gemn_acceptance(boolean)`
- `ensure_my_wallet()`
- `create_order(uuid, integer, text, uuid) -> tabela de pedido`

Não é usado o overload de `create_order` com `p_gemn_utilizado`, pois o cenário
é checkout real sem saldo GEMN e o contrato de quatro argumentos é o habilitado
para `authenticated` no E13.
