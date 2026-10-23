#!/usr/bin/env bash
set -euo pipefail

FIXTURE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
E13_ROOT=$(cd -- "$FIXTURE_DIR/.." && pwd)
E13_API_URL=${E13_API_URL:-http://127.0.0.1:64321}
E13_CONTAINER=${E13_CONTAINER:-supabase_db_gemn-e13-linux}
E13_PROJECT_ID=gemn-e13-linux
LOCAL_STATE_DIR="$FIXTURE_DIR/.local"

die() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }
log() { printf '%s\n' "$*"; }

require_tools() {
  command -v curl >/dev/null || die 'curl não encontrado'
  command -v jq >/dev/null || die 'jq não encontrado'
  command -v docker >/dev/null || die 'docker não encontrado'
}

validate_run_id() {
  [[ "${1:-}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$ ]] || die 'run_id inválido'
}

require_e13_context() {
  case "$E13_API_URL" in
    http://127.0.0.1:64321|http://localhost:64321) ;;
    *) die 'E13_API_URL deve apontar para o endpoint local E13 na porta 64321' ;;
  esac
  [[ -f "$E13_ROOT/supabase/config.toml" ]] || die 'config.toml E13 ausente'
  grep -q '^project_id = "gemn-e13-linux"$' "$E13_ROOT/supabase/config.toml" || die 'project_id E13 inesperado'
  docker inspect "$E13_CONTAINER" >/dev/null 2>&1 || die "container E13 ausente: $E13_CONTAINER"
  [[ "$E13_CONTAINER" == supabase_db_gemn-e13-linux ]] || die 'container fora do nome E13 permitido'
}

sql() {
  docker exec -i "$E13_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

validate_uuid() {
  [[ "${1:-}" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] || die 'UUID E13 inválido'
}

auth_signup() {
  local email=$1 password=$2 response
  response=$(curl -fsS "$E13_API_URL/auth/v1/signup" \
    -H "apikey: ${E13_PUBLISHABLE_KEY:?E13_PUBLISHABLE_KEY ausente}" \
    -H 'Content-Type: application/json' \
    --data "$(jq -cn --arg email "$email" --arg password "$password" '{email:$email,password:$password}')") \
    || die "falha no signup local para ${email}"
  AUTH_USER_ID=$(jq -er '.user.id // empty' <<<"$response") || die 'Auth não retornou user.id'
  AUTH_ACCESS_TOKEN=$(jq -er '.access_token // empty' <<<"$response") || die 'Auth local não retornou sessão'
  validate_uuid "$AUTH_USER_ID"
}

auth_signin() {
  local email=$1 password=$2 response
  response=$(curl -fsS "$E13_API_URL/auth/v1/token?grant_type=password" \
    -H "apikey: ${E13_PUBLISHABLE_KEY:?E13_PUBLISHABLE_KEY ausente}" \
    -H 'Content-Type: application/json' \
    --data "$(jq -cn --arg email "$email" --arg password "$password" '{email:$email,password:$password}')") \
    || die "falha no signin local para ${email}"
  AUTH_ACCESS_TOKEN=$(jq -er '.access_token // empty' <<<"$response") || die 'Auth local não retornou sessão'
}

auth_local_set_password() {
  local user_id=$1 password=$2 escaped_password
  validate_uuid "$user_id"
  [[ "$password" =~ ^[A-Za-z0-9._-]{16,128}$ ]] || die 'senha sintética deve usar somente caracteres seguros'
  escaped_password=${password//\'/\'\'}
  printf "update auth.users set encrypted_password=crypt('%s', gen_salt('bf')), updated_at=now() where id='%s';\n" \
    "$escaped_password" "$user_id" | sql >/dev/null \
    || die 'não foi possível definir senha temporária no PostgreSQL E13'
}

rest_post() {
  local path=$1 token=$2 body=$3
  curl -fsS "$E13_API_URL$path" \
    -H "apikey: ${E13_PUBLISHABLE_KEY:?E13_PUBLISHABLE_KEY ausente}" \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    -H 'Prefer: return=representation' \
    --data "$body"
}

write_manifest() {
  mkdir -p "$LOCAL_STATE_DIR"
  umask 077
  jq -n \
    --arg run_id "${RUN_ID:-}" --arg buyer_id "${BUYER_ID:-}" \
    --arg seller_user_id "${SELLER_USER_ID:-}" --arg admin_id "${ADMIN_ID:-}" \
    --arg application_id "${APPLICATION_ID:-}" --arg seller_id "${SELLER_ID:-}" \
    --arg category_id "${CATEGORY_ID:-}" --arg listing_id "${LISTING_ID:-}" \
    --arg wallet_id "${WALLET_ID:-}" --arg order_id "${ORDER_ID:-}" \
    '{schema:1,project_id:"gemn-e13-linux",run_id:$run_id,ids:{buyer_id:$buyer_id,seller_user_id:$seller_user_id,admin_id:$admin_id,application_id:$application_id,seller_id:$seller_id,category_id:$category_id,listing_id:$listing_id,wallet_id:$wallet_id,order_id:$order_id}}' \
    > "$LOCAL_STATE_DIR/$RUN_ID.json"
}
