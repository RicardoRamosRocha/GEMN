#!/usr/bin/env bash
set -Eeuo pipefail

# Executor local para a concorrência da ingestão Asaas.
# Este arquivo não aplica migrations e não executa db reset/db push.

readonly TARGET_CONTAINER="gemn-sql-test-e6"
readonly TARGET_DATABASE="postgres"
readonly TARGET_USER="postgres"
readonly TARGET_HOST_PORT="55432"
readonly RUN_ID="$(date +%s)_$$"
readonly APP_PREFIX="gemn-e8c6-$RUN_ID"
readonly PSQL_TIMEOUT_SECONDS=30
readonly OBSERVER_TIMEOUT_SECONDS=3
readonly SESSION_TIMEOUT_SECONDS=90
readonly MARKER_TIMEOUT_SECONDS=20
readonly BLOCK_TIMEOUT_SECONDS=15
readonly PROCESS_WAIT_SECONDS=10
export PGAPPNAME="$APP_PREFIX-check"

if (( $# != 0 )); then
  printf 'Uso: %s\n' "$0" >&2
  exit 64
fi

die() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 1
}

require_target() {
  command -v docker >/dev/null 2>&1 || die 'docker não está disponível.'
  command -v timeout >/dev/null 2>&1 || die 'timeout não está disponível.'

  [[ -z "${DOCKER_HOST:-}" ]] \
    || die 'DOCKER_HOST está definido; daemon remoto ou override não é permitido.'
  [[ -z "${DOCKER_CONTEXT:-}" ]] \
    || die 'DOCKER_CONTEXT está definido; contexto externo não é permitido.'

  local active_context endpoint
  active_context="$(docker context show 2>/dev/null)" \
    || die 'não foi possível identificar o contexto Docker ativo.'
  endpoint="$(docker context inspect "$active_context" \
    --format '{{(index .Endpoints "docker").Host}}' 2>/dev/null)" \
    || die 'não foi possível inspecionar o endpoint Docker ativo.'
  [[ "$endpoint" == unix://* ]] \
    || die "endpoint Docker não local: ${endpoint:-<ausente>}"
  local socket_path="${endpoint#unix://}"
  [[ -S "$socket_path" ]] \
    || die "socket Docker local não está acessível: $socket_path"

  local identity
  identity="$(docker inspect --format '{{.Name}}|{{.State.Running}}' "$TARGET_CONTAINER" 2>/dev/null)" \
    || die "container alvo ausente: $TARGET_CONTAINER"

  [[ "$identity" == "/$TARGET_CONTAINER|true" ]] \
    || die "alvo inválido ou parado: $identity"

  local published_port
  published_port="$(docker inspect --format \
    '{{range $p, $bindings := .NetworkSettings.Ports}}{{if eq $p "5432/tcp"}}{{range $bindings}}{{.HostIp}}:{{.HostPort}}{{"\n"}}{{end}}{{end}}{{end}}' \
    "$TARGET_CONTAINER" 2>/dev/null)" \
    || die 'não foi possível validar o mapeamento de portas do container.'
  # A substituição de comando remove a quebra final; múltiplos bindings
  # permanecem separados por newline e não passam nesta igualdade exata.
  [[ "$published_port" == "127.0.0.1:$TARGET_HOST_PORT" ]] \
    || die "mapeamento exigido ausente ou diferente: ${published_port:-<ausente>}"
}

readonly WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gemn-e8c6-concurrency.XXXXXX")"
readonly A_IN="$WORK_DIR/a.in"
readonly B_IN="$WORK_DIR/b.in"
readonly GATE_IN="$WORK_DIR/gate.in"
readonly GATE_RELEASE="$WORK_DIR/gate.release"
readonly A_OUT="$WORK_DIR/a.out"
readonly B_OUT="$WORK_DIR/b.out"
readonly GATE_OUT="$WORK_DIR/gate.out"
readonly BASELINE="$WORK_DIR/baseline.snapshot"
readonly AFTER="$WORK_DIR/after.snapshot"

cleanup_files() {
  rm -rf "$WORK_DIR"
}

CLEANUP_ENABLED=0
A_SESSION_PID=''
B_SESSION_PID=''
GATE_SESSION_PID=''
GATE_WRITER_PID=''

cleanup_synthetic() {
  set +e
  export PGAPPNAME="$APP_PREFIX-cleanup"
  GEMN_PSQL_TIMEOUT=10 docker_psql <<SQL >/dev/null
select pg_terminate_backend(pid)
from pg_stat_activity
where application_name like '$APP_PREFIX-%'
  and pid <> pg_backend_pid();
SQL
  local terminate_status=$?
  local deadline=$((SECONDS + 15))
  local remaining='1'
  while (( terminate_status == 0 && SECONDS < deadline )); do
    remaining="$(GEMN_PSQL_TIMEOUT=$OBSERVER_TIMEOUT_SECONDS docker_psql <<SQL
select count(*)
from pg_stat_activity
where application_name like '$APP_PREFIX-%'
  and pid <> pg_backend_pid();
SQL
)"
    local observe_status=$?
    if (( observe_status != 0 )); then
      terminate_status=1
      break
    fi
    [[ "$remaining" == '0' ]] && break
    sleep 0.1
  done
  [[ "$remaining" == '0' ]] || terminate_status=1

  for pid in "$A_SESSION_PID" "$B_SESSION_PID" "$GATE_SESSION_PID" "$GATE_WRITER_PID"; do
    [[ -n "$pid" ]] && kill -TERM "$pid" 2>/dev/null
  done
  for pid in "$A_SESSION_PID" "$B_SESSION_PID" "$GATE_SESSION_PID" "$GATE_WRITER_PID"; do
    if [[ -n "$pid" ]]; then
      wait_for_pid "$pid" "$PROCESS_WAIT_SECONDS" || terminate_status=1
    fi
  done

  if (( terminate_status != 0 )) || [[ "$remaining" != '0' ]]; then
    printf 'não foi possível confirmar o encerramento das sessões desta execução; limpeza SQL não será feita\n' >&2
    printf 'Inspecione somente estes IDs: %s, %s, %s, %s\n' \
      "$SAME_EVENT" "$DIFF_EVENT" "$ACCEPTED_EVENT" "$PROCESSED_EVENT" >&2
    return 1
  fi

  GEMN_PSQL_TIMEOUT=10 docker_psql -v same_event="$SAME_EVENT" -v diff_event="$DIFF_EVENT" \
    -v accepted_event="$ACCEPTED_EVENT" -v processed_event="$PROCESSED_EVENT" <<'SQL'
begin;
select set_config('gemn.e8c6.same_event', :'same_event', false),
       set_config('gemn.e8c6.diff_event', :'diff_event', false),
       set_config('gemn.e8c6.accepted_event', :'accepted_event', false),
       set_config('gemn.e8c6.processed_event', :'processed_event', false);
delete from public.payment_webhook_event_conflicts
where asaas_event_id in (:'same_event', :'diff_event', :'accepted_event', :'processed_event');
delete from public.payment_webhook_events
where asaas_event_id in (:'same_event', :'diff_event', :'accepted_event', :'processed_event');

do $$
begin
  if exists (
    select 1 from public.payment_webhook_events
    where asaas_event_id in (
      current_setting('gemn.e8c6.same_event'),
      current_setting('gemn.e8c6.diff_event'),
      current_setting('gemn.e8c6.accepted_event'),
      current_setting('gemn.e8c6.processed_event')
    )
  ) or exists (
    select 1 from public.payment_webhook_event_conflicts
    where asaas_event_id in (
      current_setting('gemn.e8c6.same_event'),
      current_setting('gemn.e8c6.diff_event'),
      current_setting('gemn.e8c6.accepted_event'),
      current_setting('gemn.e8c6.processed_event')
    )
  ) then
    raise exception 'limpeza incompleta dos IDs sintéticos';
  end if;
end;
$$;
commit;
SQL
  local cleanup_status=$?
  (( terminate_status == 0 )) || cleanup_status=1
  if (( cleanup_status != 0 )); then
    printf 'LIMPEZA INCOMPLETA. Inspecione somente estes IDs: %s, %s, %s, %s\n' \
      "$SAME_EVENT" "$DIFF_EVENT" "$ACCEPTED_EVENT" "$PROCESSED_EVENT" >&2
  fi
  return "$cleanup_status"
}

on_exit() {
  local status=$?
  trap - EXIT
  if (( CLEANUP_ENABLED )); then
    if ! cleanup_synthetic; then
      (( status == 0 )) && status=1
    fi
  fi
  cleanup_files
  exit "$status"
}
trap on_exit EXIT
trap 'exit 130' HUP INT TERM

require_target

docker_psql() {
  local operation_timeout="${GEMN_PSQL_TIMEOUT:-$PSQL_TIMEOUT_SECONDS}"
  timeout --foreground "${operation_timeout}s" docker exec -i \
    -e "PGAPPNAME=${PGAPPNAME:-$APP_PREFIX-check}" \
    "$TARGET_CONTAINER" \
    psql -X -q -A -t -v ON_ERROR_STOP=1 \
      -U "$TARGET_USER" -d "$TARGET_DATABASE" "$@"
}

check_database() {
  local identity
  identity="$(docker_psql <<'SQL'
select current_database() || '|' || current_user;
SQL
)" || die 'não foi possível conectar ao PostgreSQL do container alvo.'

  [[ "$identity" == "$TARGET_DATABASE|$TARGET_USER" ]] \
    || die "identidade PostgreSQL inesperada: $identity"

  docker_psql <<'SQL' >/dev/null
do $$
begin
  if to_regprocedure('public.ingest_asaas_webhook_event(text,text,text,text,text,numeric,numeric,timestamptz,text)') is null then
    raise exception 'public.ingest_asaas_webhook_event não existe; aplique a preparação aprovada separadamente';
  end if;

  if to_regclass('public.payment_webhook_event_conflicts') is null then
    raise exception 'public.payment_webhook_event_conflicts não existe; aplique a preparação aprovada separadamente';
  end if;
end;
$$;
SQL
}

snapshot() {
  docker_psql <<'SQL'
select 'orders|' || count(*) || '|' || md5(coalesce(jsonb_agg(jsonb_build_object(
  'id', id, 'buyer_id', buyer_id, 'idempotency_key', idempotency_key,
  'status', status, 'forma_pagamento', forma_pagamento,
  'total_real', total_real, 'total_gemn', total_gemn,
  'criado_em', criado_em, 'atualizado_em', atualizado_em,
  'valor_devido_real', valor_devido_real
) order by id)::text, '')) from public.orders;
select 'payment_intents|' || count(*) || '|' || md5(coalesce(jsonb_agg(jsonb_build_object(
  'id', id, 'order_id', order_id, 'buyer_id', buyer_id,
  'provider', provider, 'method', method, 'ambiente', ambiente,
  'status', status, 'idempotency_key', idempotency_key,
  'external_reference', external_reference, 'asaas_payment_id', asaas_payment_id,
  'amount_due_real', amount_due_real, 'currency', currency,
  'provider_status', provider_status, 'due_at', due_at,
  'net_value', net_value, 'fee_value', fee_value,
  'last_error_code', last_error_code, 'criado_em', criado_em,
  'atualizado_em', atualizado_em, 'confirmed_at', confirmed_at,
  'received_at', received_at, 'canceled_at', canceled_at
) order by id)::text, '')) from public.payment_intents;
select 'wallets|' || count(*) || '|' || md5(coalesce(jsonb_agg(jsonb_build_object(
  'id', id, 'user_id', user_id, 'saldo_disponivel', saldo_disponivel,
  'saldo_reservado', saldo_reservado, 'saldo_a_recuperar', saldo_a_recuperar,
  'versao', versao, 'criado_em', criado_em, 'atualizado_em', atualizado_em
) order by id)::text, '')) from public.wallets;
select 'wallet_transactions|' || count(*) || '|' || md5(coalesce(jsonb_agg(jsonb_build_object(
  'id', id, 'wallet_id', wallet_id, 'order_id', order_id,
  'cashback_lot_id', cashback_lot_id, 'tipo', tipo, 'valor', valor,
  'saldo_disponivel_apos', saldo_disponivel_apos,
  'saldo_reservado_apos', saldo_reservado_apos,
  'saldo_a_recuperar_apos', saldo_a_recuperar_apos,
  'idempotency_key', idempotency_key, 'reservation_id', reservation_id,
  'criado_em', criado_em
) order by id)::text, '')) from public.wallet_transactions;
select 'cashback_lots|' || count(*) || '|' || md5(coalesce(jsonb_agg(jsonb_build_object(
  'id', id, 'wallet_id', wallet_id, 'order_id', order_id,
  'order_item_id', order_item_id, 'seller_origem_id', seller_origem_id,
  'valor_original', valor_original, 'valor_disponivel', valor_disponivel,
  'valor_reservado', valor_reservado, 'valor_consumido', valor_consumido,
  'valor_a_recuperar', valor_a_recuperar, 'status', status,
  'criado_em', criado_em, 'liberado_em', liberado_em,
  'atualizado_em', atualizado_em
) order by id)::text, '')) from public.cashback_lots;
select 'gemn_reservations|' || count(*) || '|' || md5(coalesce(jsonb_agg(jsonb_build_object(
  'id', id, 'wallet_id', wallet_id, 'order_id', order_id,
  'buyer_id', buyer_id, 'seller_recebedor_id', seller_recebedor_id,
  'valor_gemn', valor_gemn, 'status', status,
  'idempotency_key', idempotency_key, 'expira_em', expira_em,
  'criado_em', criado_em, 'atualizado_em', atualizado_em,
  'liberado_em', liberado_em, 'liberacao_idempotency_key', liberacao_idempotency_key
) order by id)::text, '')) from public.gemn_reservations;
select 'gemn_reservation_allocations|' || count(*) || '|' || md5(coalesce(jsonb_agg(jsonb_build_object(
  'id', id, 'reservation_id', reservation_id, 'cashback_lot_id', cashback_lot_id,
  'seller_origem_id', seller_origem_id, 'seller_recebedor_id', seller_recebedor_id,
  'valor_gemn', valor_gemn, 'ordem_fifo', ordem_fifo, 'status', status,
  'criado_em', criado_em, 'atualizado_em', atualizado_em
) order by id)::text, '')) from public.gemn_reservation_allocations;
SQL
}

run_sql() {
  local app_name="$1"
  shift
  PGAPPNAME="$app_name" docker_psql "$@"
}

start_session() {
  local app_name="$1"
  local input_fifo="$2"
  local output_file="$3"
  timeout --foreground "${SESSION_TIMEOUT_SECONDS}s" bash -c \
    'exec docker exec -i -e "$1" "$2" psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$3" -d "$4" <"$5" >"$6" 2>&1' \
    _ "PGAPPNAME=$app_name" "$TARGET_CONTAINER" "$TARGET_USER" \
    "$TARGET_DATABASE" "$input_fifo" "$output_file" &
  LAST_SESSION_PID="$!"
}

start_gate_writer() {
  local input_fifo="$1"
  local release_file="$2"
  local lock_key="$3"
  timeout --foreground "${SESSION_TIMEOUT_SECONDS}s" bash -c \
    'exec 9<>"$1"
     printf "select pg_advisory_lock(%s);\nselect '\''GATE_HELD'\'';\n" "$3" >&9
     while [[ ! -e "$2" ]]; do sleep 0.1; done
     exec 9>&-' \
    _ "$input_fifo" "$release_file" "$lock_key" &
  GATE_WRITER_PID="$!"
}

wait_for_pid() {
  local pid="$1"
  local timeout_seconds="$2"
  local deadline=$((SECONDS + timeout_seconds))
  while kill -0 "$pid" 2>/dev/null; do
    (( SECONDS < deadline )) || return 124
    sleep 0.1
  done
  wait "$pid" 2>/dev/null
}

wait_for_marker() {
  local output_file="$1"
  local marker="$2"
  local deadline=$((SECONDS + MARKER_TIMEOUT_SECONDS))
  while (( SECONDS < deadline )); do
    grep -Fqx "$marker" "$output_file" 2>/dev/null && return 0
    sleep 0.1
  done
  return 1
}

wait_for_backend_marker() {
  local output_file="$1"
  local marker="$2"
  local deadline=$((SECONDS + MARKER_TIMEOUT_SECONDS))
  while (( SECONDS < deadline )); do
    if grep -E "^${marker}[|][0-9]+$" "$output_file" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

wait_for_blocked_session() {
  local app_name="$1"
  local b_backend_pid="$2"
  local a_backend_pid="$3"
  local blocker_app_name="$4"
  local deadline=$((SECONDS + BLOCK_TIMEOUT_SECONDS))
  local blocked
  while (( SECONDS < deadline )); do
    blocked="$(GEMN_PSQL_TIMEOUT=$OBSERVER_TIMEOUT_SECONDS run_sql "$APP_PREFIX-observer" <<SQL
select count(*)
from pg_stat_activity a
join pg_stat_activity blocker
  on blocker.pid = any(pg_blocking_pids(a.pid))
where a.pid = $b_backend_pid
  and blocker.pid = $a_backend_pid
  and a.application_name = '$app_name'
  and a.state = 'active'
  and blocker.application_name = '$blocker_app_name';
SQL
)"
    [[ "$blocked" == '1' ]] && return 0
    sleep 0.1
  done
  return 1
}

run_pair() {
  local label="$1"
  local event_id="$2"
  local first_hash="$3"
  local second_hash="$4"
  local expected_duplicate="$5"
  local expected_conflict="$6"
  local expected_reason="$7"
  local lock_key="$8"
  local a_pid b_pid gate_pid a_backend_pid b_backend_pid
  local gate_app="$APP_PREFIX-gate-$label"
  local a_app="$APP_PREFIX-a-$label"
  local b_app="$APP_PREFIX-b-$label"
  local a_sql="$WORK_DIR/a-$label.sql"
  local b_sql="$WORK_DIR/b-$label.sql"

  rm -f "$A_IN" "$B_IN" "$GATE_IN" "$GATE_RELEASE" "$A_OUT" "$B_OUT" "$GATE_OUT"
  mkfifo "$A_IN" "$B_IN" "$GATE_IN"

  start_session "$gate_app" "$GATE_IN" "$GATE_OUT"
  gate_pid="$LAST_SESSION_PID"
  GATE_SESSION_PID="$gate_pid"
  start_gate_writer "$GATE_IN" "$GATE_RELEASE" "$lock_key"
  wait_for_marker "$GATE_OUT" GATE_HELD \
    || die "gate não foi adquirido no cenário $label"

  start_session "$a_app" "$A_IN" "$A_OUT"
  a_pid="$LAST_SESSION_PID"
  A_SESSION_PID="$a_pid"
  cat >"$a_sql" <<SQL
begin;
set local role service_role;
do \$\$
declare
  v_result record;
begin
  select * into v_result
  from public.ingest_asaas_webhook_event(
    '$event_id', 'PAYMENT_RECEIVED', 'pay-$label',
    'reference-$label', 'RECEIVED', 25, 24.50, now(), '$first_hash'
  );
  if v_result.webhook_event_id is null
     or v_result.duplicate is distinct from false
     or v_result.hash_conflict is distinct from false
     or v_result.persisted is distinct from true
     or v_result.processing_status <> 'needs_review'
     or v_result.reason_code <> 'PAYMENT_INTENT_NOT_FOUND'
     or v_result.payment_intent_id is not null then
    raise exception 'primeira chamada não foi uma inserção original';
  end if;
end;
\$\$;
select 'A_BACKEND|' || pg_backend_pid();
select 'A_READY';
select pg_advisory_lock($lock_key);
commit;
select 'A_COMMITTED';
SQL
  timeout --foreground "${MARKER_TIMEOUT_SECONDS}s" bash -c 'cat "$1" >"$2"' \
    _ "$a_sql" "$A_IN" \
    || die "timeout ao enviar comandos para a sessão A no cenário $label"
  wait_for_marker "$A_OUT" A_READY \
    || die "sessão A não alcançou o ponto de sincronização no cenário $label"
  a_backend_pid="$(awk -F'|' '/^A_BACKEND[|][0-9]+$/{print $2; exit}' "$A_OUT")"
  [[ "$a_backend_pid" =~ ^[0-9]+$ ]] \
    || die "backend PID de A inválido no cenário $label"

  start_session "$b_app" "$B_IN" "$B_OUT"
  b_pid="$LAST_SESSION_PID"
  B_SESSION_PID="$b_pid"
  cat >"$b_sql" <<SQL
begin;
set local role service_role;
set local lock_timeout = '30s';
set local statement_timeout = '60s';
select 'B_BACKEND|' || pg_backend_pid();
do \$\$
declare
  v_result record;
begin
  select * into v_result
  from public.ingest_asaas_webhook_event(
    '$event_id', 'PAYMENT_RECEIVED', 'pay-$label',
    'reference-$label', 'RECEIVED', 25, 24.50, now(), '$second_hash'
  );
  if v_result.webhook_event_id is null
     or v_result.duplicate is distinct from $expected_duplicate
     or v_result.hash_conflict is distinct from $expected_conflict
     or v_result.persisted is distinct from true
     or v_result.processing_status <> 'needs_review'
     or v_result.reason_code <> '$expected_reason'
     or v_result.payment_intent_id is not null then
    raise exception 'resposta inesperada da segunda chamada';
  end if;
end;
\$\$;
commit;
select 'B_DONE';
SQL
  timeout --foreground "${MARKER_TIMEOUT_SECONDS}s" bash -c 'cat "$1" >"$2"' \
    _ "$b_sql" "$B_IN" \
    || die "timeout ao enviar comandos para a sessão B no cenário $label"

  wait_for_backend_marker "$B_OUT" B_BACKEND \
    || die "sessão B não forneceu o backend PID no cenário $label"
  b_backend_pid="$(awk -F'|' '/^B_BACKEND[|][0-9]+$/{print $2; exit}' "$B_OUT")"
  [[ "$b_backend_pid" =~ ^[0-9]+$ ]] \
    || die "backend PID de B inválido no cenário $label"

  wait_for_blocked_session "$b_app" "$b_backend_pid" "$a_backend_pid" "$a_app" \
    || die "não foi observado bloqueio efetivo da sessão B no cenário $label"

  : >"$GATE_RELEASE"
  if wait_for_pid "$GATE_WRITER_PID" "$PROCESS_WAIT_SECONDS"; then
    GATE_WRITER_PID=''
  else
    local gate_writer_status=$?
    die "escritor do gate não encerrou no cenário $label (código $gate_writer_status)"
  fi
  if wait_for_pid "$a_pid" "$PROCESS_WAIT_SECONDS"; then
    :
  else
    local a_status=$?
    die "sessão A falhou no cenário $label (código $a_status): $(cat "$A_OUT")"
  fi
  if wait_for_pid "$b_pid" "$PROCESS_WAIT_SECONDS"; then
    :
  else
    local b_status=$?
    die "sessão B falhou no cenário $label (código $b_status): $(cat "$B_OUT")"
  fi
  if wait_for_pid "$gate_pid" "$PROCESS_WAIT_SECONDS"; then
    :
  else
    local gate_status=$?
    die "gate falhou no cenário $label (código $gate_status): $(cat "$GATE_OUT")"
  fi

  grep -Fqx A_COMMITTED "$A_OUT" \
    || die "sessão A não confirmou commit no cenário $label"
  grep -Fqx B_DONE "$B_OUT" \
    || die "sessão B não concluiu no cenário $label"
  A_SESSION_PID=''
  B_SESSION_PID=''
  GATE_SESSION_PID=''
  GATE_WRITER_PID=''
}

check_database

readonly SAME_EVENT="gemn_e8c6_same_$RUN_ID"
readonly DIFF_EVENT="gemn_e8c6_diff_$RUN_ID"
readonly ACCEPTED_EVENT="gemn_e8c6_accepted_$RUN_ID"
readonly PROCESSED_EVENT="gemn_e8c6_processed_$RUN_ID"
readonly SAME_HASH="hash_same_$RUN_ID"
readonly DIFF_HASH="hash_diff_$RUN_ID"
readonly ACCEPTED_HASH="hash_accepted_$RUN_ID"
readonly PROCESSED_HASH="hash_processed_$RUN_ID"

export PGAPPNAME="$APP_PREFIX-setup"
docker_psql -v same_event="$SAME_EVENT" -v diff_event="$DIFF_EVENT" \
  -v accepted_event="$ACCEPTED_EVENT" -v processed_event="$PROCESSED_EVENT" \
  -v same_hash="$SAME_HASH" -v diff_hash="$DIFF_HASH" \
  -v accepted_hash="$ACCEPTED_HASH" -v processed_hash="$PROCESSED_HASH" <<'SQL' >/dev/null
select set_config('gemn.e8c6.same_event', :'same_event', false),
       set_config('gemn.e8c6.diff_event', :'diff_event', false),
       set_config('gemn.e8c6.accepted_event', :'accepted_event', false),
       set_config('gemn.e8c6.processed_event', :'processed_event', false);
do $$
begin
  if exists (
    select 1 from public.payment_webhook_events
    where asaas_event_id in (
      current_setting('gemn.e8c6.same_event'),
      current_setting('gemn.e8c6.diff_event'),
      current_setting('gemn.e8c6.accepted_event'),
      current_setting('gemn.e8c6.processed_event')
    )
  ) then
    raise exception 'IDs sintéticos já existem; limpeza não é segura';
  end if;
end;
$$;
SQL
CLEANUP_ENABLED=1

export PGAPPNAME="$APP_PREFIX-setup"
docker_psql -v same_event="$SAME_EVENT" -v diff_event="$DIFF_EVENT" \
  -v accepted_event="$ACCEPTED_EVENT" -v processed_event="$PROCESSED_EVENT" \
  -v same_hash="$SAME_HASH" -v diff_hash="$DIFF_HASH" \
  -v accepted_hash="$ACCEPTED_HASH" -v processed_hash="$PROCESSED_HASH" <<'SQL'
insert into public.payment_webhook_events (
  provider, asaas_event_id, event_type, asaas_payment_id,
  external_reference, provider_status, payment_value, net_value,
  occurred_at, payload_hash, processing_status
) values
  ('asaas', :'accepted_event', 'PAYMENT_RECEIVED', null, null, 'RECEIVED', 25, 24.50, now(), :'accepted_hash', 'accepted'),
  ('asaas', :'processed_event', 'PAYMENT_RECEIVED', null, null, 'RECEIVED', 25, 24.50, now(), :'processed_hash', 'processed');
SQL

snapshot >"$BASELINE"

same_key="$(printf '%s' "$SAME_EVENT" | cksum | awk '{print $1}')"
diff_key="$(printf '%s' "$DIFF_EVENT" | cksum | awk '{print $1}')"
run_pair same "$SAME_EVENT" "$SAME_HASH" "$SAME_HASH" true false DUPLICATE_SAME_HASH "$same_key"
run_pair different "$DIFF_EVENT" "$DIFF_HASH" "${DIFF_HASH}_conflict" true true DUPLICATE_HASH_CONFLICT "$diff_key"

export PGAPPNAME="$APP_PREFIX-serial"
docker_psql -v same_event="$SAME_EVENT" -v diff_event="$DIFF_EVENT" \
  -v accepted_event="$ACCEPTED_EVENT" -v processed_event="$PROCESSED_EVENT" \
  -v accepted_hash="$ACCEPTED_HASH" -v processed_hash="$PROCESSED_HASH" <<'SQL'
begin;
set local role service_role;
select set_config('gemn.e8c6.accepted_event', :'accepted_event', false),
       set_config('gemn.e8c6.processed_event', :'processed_event', false),
       set_config('gemn.e8c6.accepted_hash', :'accepted_hash', false),
       set_config('gemn.e8c6.processed_hash', :'processed_hash', false);
do $$
declare
  v_result record;
  v_count bigint;
begin
  select * into v_result
  from public.ingest_asaas_webhook_event(
    current_setting('gemn.e8c6.accepted_event'), 'PAYMENT_RECEIVED', null, null,
    'RECEIVED', 25, 24.50, now(), current_setting('gemn.e8c6.accepted_hash') || '_conflict'
  );
  if v_result.webhook_event_id is null
     or v_result.duplicate is distinct from true
     or v_result.processing_status <> 'accepted'
     or v_result.hash_conflict is distinct from true
     or v_result.persisted is distinct from true
     or v_result.payment_intent_id is not null
     or v_result.reason_code <> 'DUPLICATE_HASH_CONFLICT' then
    raise exception 'estado accepted não foi preservado';
  end if;

  select * into v_result
  from public.ingest_asaas_webhook_event(
    current_setting('gemn.e8c6.accepted_event'), 'PAYMENT_RECEIVED', null, null,
    'RECEIVED', 25, 24.50, now(), current_setting('gemn.e8c6.accepted_hash') || '_conflict'
  );
  if v_result.webhook_event_id is null
     or v_result.duplicate is distinct from true
     or v_result.hash_conflict is distinct from true
     or v_result.persisted is distinct from true
     or v_result.processing_status <> 'accepted'
     or v_result.reason_code <> 'DUPLICATE_HASH_CONFLICT'
     or v_result.payment_intent_id is not null then
    raise exception 'repetição accepted retornou contrato inesperado';
  end if;
  select count(*) into v_count from public.payment_webhook_event_conflicts
    where asaas_event_id = current_setting('gemn.e8c6.accepted_event');
  if v_count <> 1 then raise exception 'evidência accepted duplicada'; end if;

  select * into v_result
  from public.ingest_asaas_webhook_event(
    current_setting('gemn.e8c6.processed_event'), 'PAYMENT_RECEIVED', null, null,
    'RECEIVED', 25, 24.50, now(), current_setting('gemn.e8c6.processed_hash') || '_conflict'
  );
  if v_result.webhook_event_id is null
     or v_result.duplicate is distinct from true
     or v_result.processing_status <> 'processed'
     or v_result.hash_conflict is distinct from true
     or v_result.persisted is distinct from true
     or v_result.payment_intent_id is not null
     or v_result.reason_code <> 'DUPLICATE_HASH_CONFLICT' then
    raise exception 'estado processed não foi preservado';
  end if;

  select * into v_result
  from public.ingest_asaas_webhook_event(
    current_setting('gemn.e8c6.processed_event'), 'PAYMENT_RECEIVED', null, null,
    'RECEIVED', 25, 24.50, now(), current_setting('gemn.e8c6.processed_hash') || '_conflict'
  );
  if v_result.webhook_event_id is null
     or v_result.duplicate is distinct from true
     or v_result.hash_conflict is distinct from true
     or v_result.persisted is distinct from true
     or v_result.processing_status <> 'processed'
     or v_result.reason_code <> 'DUPLICATE_HASH_CONFLICT'
     or v_result.payment_intent_id is not null then
    raise exception 'repetição processed retornou contrato inesperado';
  end if;
  select count(*) into v_count from public.payment_webhook_event_conflicts
    where asaas_event_id = current_setting('gemn.e8c6.processed_event');
  if v_count <> 1 then raise exception 'evidência processed duplicada'; end if;
end;
$$;
commit;
SQL

docker_psql -v same_event="$SAME_EVENT" -v diff_event="$DIFF_EVENT" \
  -v accepted_event="$ACCEPTED_EVENT" -v processed_event="$PROCESSED_EVENT" <<'SQL'
select set_config('gemn.e8c6.same_event', :'same_event', false),
       set_config('gemn.e8c6.diff_event', :'diff_event', false),
       set_config('gemn.e8c6.accepted_event', :'accepted_event', false),
       set_config('gemn.e8c6.processed_event', :'processed_event', false);
do $$
declare
  v_count bigint;
begin
  select count(*) into v_count from public.payment_webhook_events
    where asaas_event_id = current_setting('gemn.e8c6.same_event');
  if v_count <> 1 then raise exception 'cardinalidade canônica same inválida'; end if;

  select count(*) into v_count from public.payment_webhook_event_conflicts
    where asaas_event_id = current_setting('gemn.e8c6.same_event');
  if v_count <> 0 then raise exception 'conflito inesperado no caso same'; end if;

  select count(*) into v_count from public.payment_webhook_events
    where asaas_event_id = current_setting('gemn.e8c6.diff_event');
  if v_count <> 1 then raise exception 'cardinalidade canônica different inválida'; end if;

  select count(*) into v_count from public.payment_webhook_event_conflicts
    where asaas_event_id = current_setting('gemn.e8c6.diff_event');
  if v_count <> 1 then raise exception 'evidência different ausente ou duplicada'; end if;

  select count(*) into v_count from public.payment_webhook_event_conflicts
    where asaas_event_id in (
      current_setting('gemn.e8c6.accepted_event'),
      current_setting('gemn.e8c6.processed_event')
    );
  if v_count <> 2 then raise exception 'evidências accepted/processed inválidas'; end if;
end;
$$;
SQL

snapshot >"$AFTER"

cmp -s "$BASELINE" "$AFTER" \
  || die 'snapshot financeiro divergente após os testes; a limpeza restrita será tentada pelo handler de falha'

cleanup_synthetic || die 'não foi possível limpar com segurança os IDs sintéticos'
CLEANUP_ENABLED=0

printf 'sprint61e8c6_concurrency_ok\n'
