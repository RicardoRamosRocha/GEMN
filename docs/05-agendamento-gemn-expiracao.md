# Agendamento da expiração automática GEMN

## Objetivo

Executar `public.expire_pending_orders(100)` a cada cinco minutos para expirar pedidos pendentes com 24 horas ou mais e liberar reservas GEMN.

## Ativação no Supabase hospedado

1. Habilitar o módulo Supabase Cron (`pg_cron`) no Dashboard do projeto.
2. Publicar as migrations pendentes.
3. Confirmar que o job `gemn-expire-pending-orders` foi criado.
4. Não criar um segundo job manualmente com outro nome.

A migration usa a configuração estável:

```sql
select cron.schedule(
  'gemn-expire-pending-orders',
  '*/5 * * * *',
  'select public.expire_pending_orders(100);'
);
```

Se já existir um job com esse nome e configuração diferente, a migration falha explicitamente e não o sobrescreve.

## Autorização

`expire_pending_orders(integer)` continua sem `EXECUTE` para `public`, `anon` e `authenticated`. O job deve ser criado por um usuário de banco que possua `EXECUTE` na função; a migration valida esse privilégio antes e depois do agendamento.

A função permanece `SECURITY DEFINER` com `search_path` fixo. Nenhuma `service_role key` é usada no aplicativo ou armazenada em job HTTP.

## Monitoramento

```sql
select jobid, jobname, schedule, command, active, username
from cron.job
where jobname = 'gemn-expire-pending-orders';
```

```sql
select jobid, runid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (
  select jobid from cron.job
  where jobname = 'gemn-expire-pending-orders'
)
order by start_time desc
limit 50;
```

Falhas são repetidas no próximo ciclo. A RPC usa locks, estados e idempotência para impedir liberação duplicada.

## Diagnóstico

- `cron.job` ausente: `pg_cron` não está habilitado.
- `active = false`: o job está desativado.
- `status = 'failed'`: consultar `return_message` e os logs do PostgreSQL.
- Erro de permissão: validar `has_function_privilege(username, 'public.expire_pending_orders(integer)', 'EXECUTE')`.
- Conflito de configuração: corrigir o job manualmente após revisão; a migration não altera jobs divergentes.

## Ambiente local

O PostgreSQL local atual não possui `pg_cron`. A migration não habilita extensões automaticamente e emite `NOTICE`. A RPC continua testável manualmente com `service_role`, mas não há execução automática local até que a extensão seja disponibilizada.

Referências: [Supabase Cron](https://supabase.com/docs/guides/cron), [Quickstart](https://supabase.com/docs/guides/cron/quickstart), [Segurança de funções](https://supabase.com/docs/guides/database/functions).
