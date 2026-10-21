#!/usr/bin/env bash
set -Eeuo pipefail
C=gemn-sql-test-e6; DB=postgres; USER=postgres; PORT=55432
RUN_ID="$(date +%s)_$$"; PREFIX="gemn-e9c1c2-$RUN_ID"
W="$(mktemp -d /tmp/gemn-e9c1c2.XXXXXX)"; AIN="$W/a"; BIN="$W/b"; GIN="$W/g"; REL="$W/r"; AO="$W/ao"; BO="$W/bo"; GO="$W/go"; BASE="$W/base"; AFTER="$W/after"
APID=; BPID=; GPID=; GWPID=; CLEAN=0
die(){ printf 'ERRO: %s\n' "$*" >&2; exit 1; }
target(){
 command -v docker >/dev/null||die docker; command -v timeout >/dev/null||die timeout
 [[ -z "${DOCKER_HOST-}" ]]||die DOCKER_HOST; [[ -z "${DOCKER_CONTEXT-}" ]]||die DOCKER_CONTEXT
 x="$(docker context show)"||die context; ep="$(docker context inspect "$x" --format '{{(index .Endpoints "docker").Host}}')"||die endpoint
 [[ "$ep" == unix://* ]]||die remote; sock="$(printf '%s' "$ep"|sed 's#^unix://##')"; [[ -S "$sock" ]]||die socket
 id="$(docker inspect --format '{{.Name}}|{{.State.Running}}' "$C")"||die container; [[ "$id" == "/$C|true" ]]||die target
 port="$(docker inspect --format '{{range $p, $b := .NetworkSettings.Ports}}{{if eq $p "5432/tcp"}}{{range $b}}{{.HostIp}}:{{.HostPort}}{{"\n"}}{{end}}{{end}}{{end}}' "$C")"
 [[ "$port" == "127.0.0.1:$PORT" ]]||die port
}
psql(){ timeout --foreground 30s docker exec -i -e "PGAPPNAME=$PREFIX-check" "$C" psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$USER" -d "$DB" "$@"; }
preflight(){
 x="$(psql <<'SQL'
select current_database()||'|'||current_user;
SQL
)"||die postgres; [[ "$x" == postgres\|postgres ]]||die "$x"
 psql <<'SQL' >/dev/null
do $$
begin
 if to_regprocedure('public.ingest_asaas_webhook_event_v2(text,text,text,text,text,numeric,numeric,timestamptz,text,text)') is null then raise exception 'v2 ausente'; end if;
 if to_regclass('public.payment_webhook_event_conflicts') is null then raise exception 'conflicts ausente'; end if;
 if exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and (application_name like 'gemn-e8c6%' or application_name like 'gemn-e9c1%')) then raise exception 'sessões antigas'; end if;
 if (select count(*) from public.orders)+(select count(*) from public.payment_intents)+(select count(*) from public.wallets)+(select count(*) from public.wallet_transactions)+(select count(*) from public.cashback_lots)+(select count(*) from public.gemn_reservations)+(select count(*) from public.gemn_reservation_allocations)+(select count(*) from auth.users)<>0 then raise exception 'banco não vazio'; end if;
end; $$;
SQL
}
snap(){ psql <<'SQL'
select 'orders|'||count(*)||'|'||md5(coalesce(string_agg(id::text||':'||status||':'||total_real::text||':'||total_gemn::text||':'||valor_devido_real::text,',' order by id),'') ) from public.orders;
select 'payment_intents|'||count(*)||'|'||md5(coalesce(string_agg(id::text||':'||status||':'||coalesce(asaas_payment_id,'')||':'||amount_due_real::text||':'||coalesce(net_value::text,''),',' order by id),'') ) from public.payment_intents;
select 'wallets|'||count(*)||'|'||md5(coalesce(string_agg(id::text||':'||saldo_disponivel::text||':'||saldo_reservado::text||':'||saldo_a_recuperar::text||':'||versao::text,',' order by id),'') ) from public.wallets;
select 'wallet_transactions|'||count(*)||'|'||md5(coalesce(string_agg(id::text||':'||valor::text||':'||saldo_disponivel_apos::text||':'||saldo_reservado_apos::text,',' order by id),'') ) from public.wallet_transactions;
select 'cashback_lots|'||count(*)||'|'||md5(coalesce(string_agg(id::text||':'||status||':'||valor_original::text||':'||valor_disponivel::text||':'||valor_reservado::text,',' order by id),'') ) from public.cashback_lots;
select 'gemn_reservations|'||count(*)||'|'||md5(coalesce(string_agg(id::text||':'||status||':'||valor_gemn::text,',' order by id),'') ) from public.gemn_reservations;
select 'gemn_reservation_allocations|'||count(*)||'|'||md5(coalesce(string_agg(id::text||':'||status||':'||valor_gemn::text,',' order by id),'') ) from public.gemn_reservation_allocations;
SQL
}
wp(){ p=$1; d=$((SECONDS+$2)); while kill -0 "$p" 2>/dev/null; do ((SECONDS<d))||return 124; sleep .1; done; wait "$p" 2>/dev/null; }
wg(){ p=$1; d=$((SECONDS+$2)); while kill -0 "$p" 2>/dev/null; do ((SECONDS<d))||return 124; sleep .1; done; wait "$p" 2>/dev/null||true; }
wm(){ f=$1; m=$2; d=$((SECONDS+20)); while ((SECONDS<d)); do grep -Fqx "$m" "$f" 2>/dev/null&&return 0; sleep .1; done; return 1; }
wb(){ f=$1; m=$2; d=$((SECONDS+20)); while ((SECONDS<d)); do grep -Eq "^$m[|][0-9]+$" "$f" 2>/dev/null&&return 0; sleep .1; done; return 1; }
ss(){ timeout --foreground 90s bash -c 'exec docker exec -i -e "$1" "$2" psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$3" -d "$4" <"$5" >"$6" 2>&1' _ "PGAPPNAME=$1" "$C" "$USER" "$DB" "$2" "$3"& LAST=$!; }
send(){ timeout --foreground 20s bash -c 'cat "$1" >"$2"' _ "$1" "$2"; }
block(){
 b=$1; a=$2; ba=$3; aa=$4; d=$((SECONDS+15))
 while ((SECONDS<d)); do x="$(psql <<SQL
select count(*) from pg_stat_activity b where b.pid=$b and b.application_name='$ba' and b.state='active' and $a=any(pg_blocking_pids(b.pid)) and exists(select 1 from pg_stat_activity a where a.pid=$a and a.application_name='$aa');
SQL
)"||return 1; [[ "$x" == 1 ]]&&return 0; sleep .1; done; return 1
}
cleanup(){
 set +e; s=0; PGAPPNAME="$PREFIX-clean" psql <<SQL >/dev/null
select pg_terminate_backend(pid) from pg_stat_activity where application_name like '$PREFIX-%' and pid<>pg_backend_pid();
SQL
 (( $?==0 ))||s=1; d=$((SECONDS+15)); n=1
 while ((SECONDS<d)); do n="$(psql <<SQL
select count(*) from pg_stat_activity where application_name like '$PREFIX-%' and pid<>pg_backend_pid();
SQL
)"; [[ "$n" == 0 ]]&&break; sleep .1; done
 [[ "$n" == 0 ]]||s=1
 for p in "$APID" "$BPID" "$GPID" "$GWPID"; do [[ -n "$p" ]]&&kill -TERM "$p" 2>/dev/null; done
 for p in "$APID" "$BPID" "$GPID" "$GWPID"; do if [[ -n "$p" ]]; then wg "$p" 15||s=1; fi; done
 ((s==0))||{ printf 'limpeza não confirmada\n' >&2; return 1; }
 psql <<SQL >/dev/null
begin;
delete from public.payment_webhook_event_conflicts where asaas_event_id in ('$SAME','$DIFF','$ACCEPTED','$PROCESSED','$PENDING','$FAILED');
delete from public.payment_webhook_events where asaas_event_id in ('$SAME','$DIFF','$ACCEPTED','$PROCESSED','$PENDING','$FAILED');
commit;
SQL
}
finish(){ s=$?; trap - EXIT HUP INT TERM; ((CLEAN))&&{ cleanup||{ ((s==0))&&s=1; }; }; rm -rf "$W"; exit "$s"; }
trap finish EXIT; trap 'exit 130' HUP INT TERM
target; preflight
SAME="gemn_e9c1c2_same_$RUN_ID"; DIFF="gemn_e9c1c2_diff_$RUN_ID"; ACCEPTED="gemn_e9c1c2_accepted_$RUN_ID"; PROCESSED="gemn_e9c1c2_processed_$RUN_ID"; PENDING="gemn_e9c1c2_pending_$RUN_ID"; FAILED="gemn_e9c1c2_failed_$RUN_ID"
H1="gemn_e9c1c2_hash_$RUN_ID"; H2="gemn_e9c1c2_hash_conflict_$RUN_ID"; H1A="$H1"_accepted; H1P="$H1"_processed; H1N="$H1"_pending; H1F="$H1"_failed
psql <<SQL >/dev/null
do \$\$ begin
if exists(select 1 from public.payment_webhook_events where asaas_event_id in ('$SAME','$DIFF','$ACCEPTED','$PROCESSED','$PENDING','$FAILED')) or exists(select 1 from public.payment_webhook_event_conflicts where asaas_event_id in ('$SAME','$DIFF','$ACCEPTED','$PROCESSED','$PENDING','$FAILED')) then raise exception 'colisão sintética'; end if;
end; \$\$;
SQL
CLEAN=1
psql <<SQL >/dev/null
insert into public.payment_webhook_events(asaas_event_id,event_type,payment_value,payload_hash,processing_status,source_date_created,occurred_at) values
('$ACCEPTED','PAYMENT_RECEIVED',25,'$H1A','accepted','2026-10-21 12:34:56',null),('$PROCESSED','PAYMENT_RECEIVED',25,'$H1P','processed','2026-10-21 12:34:56',null),('$PENDING','PAYMENT_RECEIVED',25,'$H1N','pending','2026-10-21 12:34:56',null),('$FAILED','PAYMENT_RECEIVED',25,'$H1F','failed','2026-10-21 12:34:56',null);
SQL
snap >"$BASE"
pair(){
 label=$1; event=$2; first=$3; second=$4; key=$5; dup=$6; conf=$7; why=$8; aa="$PREFIX-a-$label"; ba="$PREFIX-b-$label"; ga="$PREFIX-g-$label"; as="$W/a-$label.sql"; bs="$W/b-$label.sql"
 rm -f "$AIN" "$BIN" "$GIN" "$REL" "$AO" "$BO" "$GO"; mkfifo "$AIN" "$BIN" "$GIN"
 ss "$ga" "$GIN" "$GO"; gp=$LAST; GPID=$gp
 timeout --foreground 90s bash -c 'exec 9<>"$1"; printf "select pg_advisory_lock('"$key"');\nselect '\''GATE_HELD'\'';\n" >&9; while [[ ! -e "$2" ]]; do sleep .1; done; exec 9>&-' _ "$GIN" "$REL"& GWPID=$!
 wm "$GO" GATE_HELD||die gate
 cat >"$as" <<SQL
begin; set local role service_role; set local statement_timeout='60s';
do \$\$
declare r record; begin
select * into r from public.ingest_asaas_webhook_event_v2('$event','PAYMENT_RECEIVED','pay-$label','ref-$label','RECEIVED',25,24.5,null,'$first','2026-10-21 12:34:56');
if r.webhook_event_id is null or r.duplicate is distinct from false or r.hash_conflict is distinct from false or r.persisted is distinct from true or r.processing_status<>'needs_review' or r.reason_code<>'DATE_CREATED_TIMEZONE_MISSING' then raise exception 'A inesperada'; end if;
end; \$\$; select 'A_BACKEND|'||pg_backend_pid(); select 'A_READY'; select pg_advisory_lock($key); commit; select 'A_COMMITTED';
SQL
 ss "$aa" "$AIN" "$AO"; ap=$LAST; APID=$ap; send "$as" "$AIN"||die A; wm "$AO" A_READY||die Aready; ab="$(awk -F'|' '/^A_BACKEND[|][0-9]+$/{print $2;exit}' "$AO")"; [[ "$ab" =~ ^[0-9]+$ ]]||die Apid
 cat >"$bs" <<SQL
begin; set local role service_role; set local lock_timeout='30s'; set local statement_timeout='60s'; select 'B_BACKEND|'||pg_backend_pid();
do \$\$
declare r record; begin
select * into r from public.ingest_asaas_webhook_event_v2('$event','PAYMENT_RECEIVED','pay-$label','ref-$label','RECEIVED',25,24.5,null,'$second','2026-10-21 12:34:56');
if r.webhook_event_id is null or r.duplicate is distinct from $dup or r.hash_conflict is distinct from $conf or r.persisted is distinct from true or r.processing_status<>'needs_review' or r.reason_code<>'$why' then raise exception 'B inesperada'; end if;
end; \$\$; commit; select 'B_DONE';
SQL
 ss "$ba" "$BIN" "$BO"; bp=$LAST; BPID=$bp; send "$bs" "$BIN"||die B; wb "$BO" B_BACKEND||{ sed -n '1,40p' "$BO" >&2; die Bpid; }; bb="$(awk -F'|' '/^B_BACKEND[|][0-9]+$/{print $2;exit}' "$BO")"; [[ "$bb" =~ ^[0-9]+$ ]]||die Bpid
 block "$bb" "$ab" "$ba" "$aa"||die "bloqueio não observado $label"; : >"$REL"; wp "$GWPID" 15||die gatewriter; wp "$ap" 15||die A; wp "$bp" 15||die B; wp "$gp" 15||die gate; grep -Fqx A_COMMITTED "$AO"||die Acommit; grep -Fqx B_DONE "$BO"||die Bdone
 APID=; BPID=; GPID=; GWPID=
}
K1="$(printf '%s' "$SAME"|cksum|awk '{print $1}')"; K2="$(printf '%s' "$DIFF"|cksum|awk '{print $1}')"
pair same "$SAME" "$H1" "$H1" "$K1" true false DUPLICATE_SAME_HASH
pair diff "$DIFF" "$H2" "$H2-other" "$K2" true true DUPLICATE_HASH_CONFLICT
psql <<SQL >/dev/null
begin; set local role service_role;
do \$\$
declare r record; begin
select * into r from public.ingest_asaas_webhook_event_v2('$ACCEPTED','PAYMENT_RECEIVED',null,null,'RECEIVED',25,null,null,'$H1A-conflict','2026-10-21 12:34:56'); if r.processing_status<>'accepted' then raise exception 'accepted'; end if;
select * into r from public.ingest_asaas_webhook_event_v2('$PROCESSED','PAYMENT_RECEIVED',null,null,'RECEIVED',25,null,null,'$H1P-conflict','2026-10-21 12:34:56'); if r.processing_status<>'processed' then raise exception 'processed'; end if;
select * into r from public.ingest_asaas_webhook_event_v2('$PENDING','PAYMENT_RECEIVED',null,null,'RECEIVED',25,null,null,'$H1N-conflict','2026-10-21 12:34:56'); if r.processing_status<>'needs_review' then raise exception 'pending'; end if;
select * into r from public.ingest_asaas_webhook_event_v2('$FAILED','PAYMENT_RECEIVED',null,null,'RECEIVED',25,null,null,'$H1F-conflict','2026-10-21 12:34:56'); if r.processing_status<>'needs_review' then raise exception 'failed'; end if;
end; \$\$; commit;
SQL
snap >"$AFTER"; cmp -s "$BASE" "$AFTER"||die snapshot
psql <<SQL >/dev/null
do \$\$ declare n bigint; begin
select count(*) into n from public.payment_webhook_events where asaas_event_id in ('$SAME','$DIFF','$ACCEPTED','$PROCESSED','$PENDING','$FAILED'); if n<>6 then raise exception 'cardinality'; end if;
select count(*) into n from public.payment_webhook_event_conflicts where asaas_event_id='$SAME'; if n<>0 then raise exception 'same conflict'; end if;
select count(*) into n from public.payment_webhook_event_conflicts where asaas_event_id='$DIFF'; if n<>1 then raise exception 'diff conflict'; end if;
if not exists(select 1 from public.payment_webhook_event_conflicts where asaas_event_id='$DIFF' and conflicting_source_date_created='2026-10-21 12:34:56') then raise exception 'source evidence'; end if;
select count(*) into n from public.payment_webhook_event_conflicts where asaas_event_id in ('$ACCEPTED','$PROCESSED','$PENDING','$FAILED'); if n<>4 then raise exception 'serial conflicts'; end if;
if not exists(select 1 from public.payment_webhook_events where asaas_event_id in ('$SAME','$DIFF') and occurred_at is null and source_date_created='2026-10-21 12:34:56') then raise exception 'ambiguous source evidence'; end if;
end; \$\$;
SQL
cleanup||die cleanup; CLEAN=0
PGAPPNAME="$PREFIX-final" psql <<SQL
select 'active_sessions='||count(*) from pg_stat_activity where pid<>pg_backend_pid() and application_name like '$PREFIX-%';
select 'synthetic_events='||count(*) from public.payment_webhook_events where asaas_event_id like 'gemn_e9c1c2_%';
select 'synthetic_conflicts='||count(*) from public.payment_webhook_event_conflicts where asaas_event_id like 'gemn_e9c1c2_%';
SQL
printf 'sprint61e9c1_asaas_temporal_concurrency_ok\n'
