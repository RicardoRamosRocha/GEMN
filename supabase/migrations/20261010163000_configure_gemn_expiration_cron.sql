-- GEMN: configura o job pg_cron da expiração automática.
-- Não habilita a extensão. Em ambientes sem pg_cron, apenas informa e continua.

do $migration$
declare
  v_job record;
  v_expected_schedule constant text := '*/5 * * * *';
  v_expected_command constant text := 'select public.expire_pending_orders(100);';
begin
  if not exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    raise notice 'pg_cron indisponível; job gemn-expire-pending-orders não foi criado';
    return;
  end if;

  -- SECURITY DEFINER não elimina a necessidade de EXECUTE para o usuário
  -- que chama a função. A migration deve ser executada por um role que tenha
  -- esse privilégio; normalmente postgres, proprietário da RPC.
  if not has_function_privilege(
    current_user,
    'public.expire_pending_orders(integer)',
    'EXECUTE'
  ) then
    raise exception using
      errcode = '42501',
      message = format(
        'o usuário executor do pg_cron (%s) não possui EXECUTE em expire_pending_orders(integer)',
        current_user
      );
  end if;

  select j.*
    into v_job
    from cron.job as j
   where j.jobname = 'gemn-expire-pending-orders';

  if not found then
    perform cron.schedule(
      'gemn-expire-pending-orders',
      v_expected_schedule,
      v_expected_command
    );

    select j.*
      into v_job
      from cron.job as j
     where j.jobname = 'gemn-expire-pending-orders';
  end if;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'pg_cron não confirmou a criação do job gemn-expire-pending-orders';
  end if;

  if v_job.schedule is distinct from v_expected_schedule
     or v_job.command is distinct from v_expected_command
     or coalesce(v_job.active, false) is distinct from true then
    raise exception using
      errcode = 'P0001',
      message = format(
        'conflito no job gemn-expire-pending-orders: schedule=%s, command=%s, active=%s; nenhuma alteração foi feita',
        v_job.schedule, v_job.command, v_job.active
      );
  end if;

  if not has_function_privilege(
    v_job.username,
    'public.expire_pending_orders(integer)',
    'EXECUTE'
  ) then
    raise exception using
      errcode = '42501',
      message = format(
        'o usuário configurado no job (%s) não possui EXECUTE em expire_pending_orders(integer)',
        v_job.username
      );
  end if;

  raise notice 'job gemn-expire-pending-orders validado: usuário %, schedule %, ativo %',
    v_job.username, v_job.schedule, v_job.active;
end;
$migration$;
