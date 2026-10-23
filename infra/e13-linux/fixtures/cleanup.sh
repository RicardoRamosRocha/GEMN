#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
source "$SCRIPT_DIR/common.sh"

[[ "${1:-}" == --apply ]] || { log 'Modo plano: cleanup.sh --apply --run-id <id> executará limpeza restrita.'; exit 0; }
[[ "${2:-}" == --run-id ]] || die 'uso: cleanup.sh --apply --run-id <id>'
RUN_ID=${3:?--run-id exige valor}
validate_run_id "$RUN_ID"; require_tools; require_e13_context
MANIFEST="$LOCAL_STATE_DIR/$RUN_ID.json"
[[ -f "$MANIFEST" ]] || die 'manifesto não encontrado'

BUYER_ID=$(jq -er '.ids.buyer_id' "$MANIFEST"); SELLER_USER_ID=$(jq -er '.ids.seller_user_id' "$MANIFEST")
ADMIN_ID=$(jq -er '.ids.admin_id' "$MANIFEST"); APPLICATION_ID=$(jq -er '.ids.application_id' "$MANIFEST")
SELLER_ID=$(jq -er '.ids.seller_id' "$MANIFEST"); CATEGORY_ID=$(jq -er '.ids.category_id' "$MANIFEST")
LISTING_ID=$(jq -er '.ids.listing_id' "$MANIFEST"); ORDER_ID=$(jq -er '.ids.order_id' "$MANIFEST")
for value in "$BUYER_ID" "$SELLER_USER_ID" "$ADMIN_ID" "$APPLICATION_ID" "$SELLER_ID" "$CATEGORY_ID" "$LISTING_ID" "$ORDER_ID"; do validate_uuid "$value"; done

sql -c "
begin;
delete from public.order_items where order_id='$ORDER_ID';
delete from public.orders where id='$ORDER_ID' and buyer_id='$BUYER_ID';
delete from public.listings where id='$LISTING_ID' and nome like ('E13 D1 ' || '$RUN_ID' || '%');
delete from public.sellers where id='$SELLER_ID' and user_id='$SELLER_USER_ID';
delete from public.seller_applications where id='$APPLICATION_ID' and user_id='$SELLER_USER_ID';
delete from public.wallets where user_id='$BUYER_ID';
update public.categories set ativo=false where id='$CATEGORY_ID' and nome=('E13_D1_' || '$RUN_ID' || '_CATEGORY');
delete from auth.users where id in ('$BUYER_ID', '$SELLER_USER_ID', '$ADMIN_ID');
commit;
" >/dev/null
rm -f -- "$MANIFEST"
log "Somente fixtures do run_id=$RUN_ID foram removidas do E13."
