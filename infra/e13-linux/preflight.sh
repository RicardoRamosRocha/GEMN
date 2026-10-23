#!/usr/bin/env bash
set -u

# Read-only only. No compose up/down, supabase start/stop, db push/reset,
# migrations, or Asaas calls are allowed in this script.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
E13_DIR="$ROOT_DIR/infra/e13-linux"
CONFIG="$E13_DIR/supabase/config.toml"
EXPECTED_BRANCH="feat/redesign-ui-gemn"
EXPECTED_PROJECT="gemn-e13-linux"
PORTS=(64321 64322 64323 64324 64327 68083 68001)
CONTAINERS=(gemn-e13-linux-postgres gemn-e13-linux-kong gemn-e13-linux-auth gemn-e13-linux-rest gemn-e13-linux-edge gemn-e13-linux-finalizer)
NETWORK="gemn-e13-linux-net"
VOLUMES=(gemn-e13-linux-pgdata gemn-e13-linux-storage gemn-e13-linux-edge)

failures=0
warn() { printf 'WARN|%s\n' "$*"; }
fail() { printf 'FAIL|%s\n' "$*"; failures=$((failures + 1)); }
ok() { printf 'OK|%s\n' "$*"; }

printf '%s\n' 'E13 Linux preflight (read-only)'
printf 'root=%s\n' "$ROOT_DIR"

if [[ -f "$CONFIG" ]]; then ok 'config exists'; else fail "missing $CONFIG"; fi
if rg -q "^project_id = \"$EXPECTED_PROJECT\"$" "$CONFIG"; then ok "isolated project_id=$EXPECTED_PROJECT"; else fail 'unexpected project_id'; fi

branch="$(git -C "$ROOT_DIR" branch --show-current 2>/dev/null || true)"
if [[ "$branch" == "$EXPECTED_BRANCH" ]]; then ok "branch=$branch"; else fail "branch is '$branch', expected '$EXPECTED_BRANCH'"; fi
if [[ -z "$(git -C "$ROOT_DIR" status --short 2>/dev/null)" ]]; then ok 'working tree clean'; else warn 'working tree has changes; review before E3-B'; fi

for p in "${PORTS[@]}"; do
  if command -v ss >/dev/null 2>&1; then
    if ss -ltnH "sport = :$p" 2>/dev/null | rg -q .; then fail "TCP port $p is occupied"; else ok "TCP port $p is free in this snapshot"; fi
  else
    warn "cannot inspect TCP port $p: ss is unavailable"
  fi
done

if command -v supabase >/dev/null 2>&1; then
  printf 'supabase_cli='; supabase --version 2>&1 || true
else
  warn 'supabase CLI not installed; exact CLI compatibility is unverified'
fi

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    existing_containers="$(docker ps -a --format '{{.Names}}' 2>/dev/null || true)"
    existing_networks="$(docker network ls --format '{{.Name}}' 2>/dev/null || true)"
    existing_volumes="$(docker volume ls --format '{{.Name}}' 2>/dev/null || true)"
    for name in "${CONTAINERS[@]}"; do
      if printf '%s\n' "$existing_containers" | rg -Fxq "$name"; then fail "container exists: $name"; else ok "container available: $name"; fi
    done
    if printf '%s\n' "$existing_networks" | rg -Fxq "$NETWORK"; then fail "network exists: $NETWORK"; else ok "network available: $NETWORK"; fi
    for name in "${VOLUMES[@]}"; do
      if printf '%s\n' "$existing_volumes" | rg -Fxq "$name"; then fail "volume exists: $name"; else ok "volume available: $name"; fi
    done
  else
    warn 'Docker daemon access unavailable; names/networks/volumes unverified'
  fi
else
  warn 'Docker CLI not installed; names/networks/volumes unverified'
fi

for forbidden in supabase_db_gemn gemn-e10 gemn-sql-test-e6 supabase_network_gemn gemn_local_secure supabase_edge_runtime_gemn; do
  if rg -n -F "$forbidden" "$CONFIG" "$E13_DIR/secrets.example" >/dev/null 2>&1; then fail "E13 configuration references existing resource: $forbidden"; fi
done
if [[ "$failures" -eq 0 ]]; then ok 'no known E6/E10/local resource references'; fi

if rg -n '^(ASAAS_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY)=' "$E13_DIR/secrets.example" | rg -v '<[^>]+>' >/dev/null 2>&1; then
  fail 'possible non-placeholder secret found under E13 directory'
else
  ok 'secret template contains placeholders only'
fi

printf 'result=%s\n' "$([[ "$failures" -eq 0 ]] && echo PASS || echo REVIEW)"
exit 0
