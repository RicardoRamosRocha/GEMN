# Sprint 6.1-D3-R1 — testes financeiros locais

O runner `supabase/tests/sprint61d3_financial_run.ps1` recebe o container do banco local e recusa o projeto `gemn` original.

```powershell
.\supabase\tests\sprint61d3_financial_run.ps1 `
  -Container supabase_db_gemn-sprint61d3-local `
  -DbHost 127.0.0.1 -DbPort 55422 `
  -RunId d3r1_local_01
```

As fixtures criam usuários no Auth local, vendedores, anúncios, regras de cashback, carteiras e lotes FIFO. Nenhuma credencial do DEV é carregada. Os cenários cobrem pedidos parcial/integral, centavos, cashback, FIFO com dois lotes, retries, confirmação, cancelamento, expiração, validações negativas e regressão de `create_order`.

O runner valida `DbHost`/`DbPort`, usa `docker exec` com o container informado e não depende de `supabase_db_gemn`. Não executa `supabase link`, `db push` ou reset. Concorrência divergente exige duas sessões simultâneas usando a mesma chave; o resultado esperado é um único pedido e uma única reserva.
