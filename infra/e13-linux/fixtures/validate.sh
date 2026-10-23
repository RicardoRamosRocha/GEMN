#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
source "$SCRIPT_DIR/common.sh"
MODE=plan
RUN_ID=""
while (($#)); do
  case "$1" in
    --plan) MODE=plan; shift ;;
    --apply) MODE=apply; shift ;;
    --run-id) RUN_ID=${2:?--run-id exige valor}; shift 2 ;;
    *) die "opção desconhecida: $1" ;;
  esac
done
if [[ "$MODE" == plan ]]; then
  cat <<'EOF'
Modo plano: validação futura sem chamadas ao E13.
Execução futura: validate.sh --apply --run-id <id>
IDs vêm do manifesto; tokens devem vir somente de variáveis de ambiente.
EOF
  exit 0
fi

require_tools; require_e13_context; validate_run_id "$RUN_ID"
MANIFEST="$LOCAL_STATE_DIR/$RUN_ID.json"
[[ -f "$MANIFEST" ]] || die 'manifesto não encontrado'
BUYER_ID=$(jq -er '.ids.buyer_id' "$MANIFEST")
SELLER_USER_ID=$(jq -er '.ids.seller_user_id' "$MANIFEST")
ADMIN_ID=$(jq -er '.ids.admin_id' "$MANIFEST")
LISTING_ID=$(jq -er '.ids.listing_id' "$MANIFEST")
ORDER_ID=$(jq -er '.ids.order_id' "$MANIFEST")
for token_name in E13_FIXTURE_BUYER_TOKEN E13_FIXTURE_SELLER_TOKEN E13_FIXTURE_ADMIN_TOKEN; do
  [[ -n "${!token_name:-}" ]] || die "$token_name deve ser fornecido por ambiente"
done

sql -c "
  select 1 from public.profiles where id='$BUYER_ID';
  select 1 from public.profiles where id='$SELLER_USER_ID';
  select 1 from public.profiles where id='$ADMIN_ID' and is_admin;
  select 1 from public.listings where id='$LISTING_ID' and status='ativo';
  select 1 from public.orders where id='$ORDER_ID' and buyer_id='$BUYER_ID' and status='pendente';
" >/dev/null

cross_read=$(curl -fsS "$E13_API_URL/rest/v1/orders?select=id&buyer_id=eq.$BUYER_ID" \
  -H "apikey: $E13_PUBLISHABLE_KEY" -H "Authorization: Bearer $E13_FIXTURE_SELLER_TOKEN")
[[ "$(jq 'length' <<<"$cross_read")" == 0 ]] || die 'RLS permitiu leitura cruzada de pedido'
log "Fixtures e isolamento RLS básicos válidos para run_id=$RUN_ID"
