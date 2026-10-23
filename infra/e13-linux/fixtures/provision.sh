#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
source "$SCRIPT_DIR/common.sh"

MODE=plan
RESUME=0
RUN_ID="e13-d1-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
while (($#)); do
  case "$1" in
    --plan) MODE=plan; shift ;;
    --apply) MODE=apply; shift ;;
    --resume) RESUME=1; shift ;;
    --run-id) RUN_ID=${2:?--run-id exige valor}; shift 2 ;;
    *) die "opção desconhecida: $1" ;;
  esac
done
validate_run_id "$RUN_ID"
MANIFEST="$LOCAL_STATE_DIR/$RUN_ID.json"

if [[ "$MODE" == plan ]]; then
  if ((RESUME)); then
    [[ -f "$MANIFEST" ]] || die 'retomada exige manifesto existente'
    [[ "$(jq -r '.project_id' "$MANIFEST")" == "$E13_PROJECT_ID" ]] || die 'manifesto não pertence ao E13'
    [[ "$(jq -r '.run_id' "$MANIFEST")" == "$RUN_ID" ]] || die 'run_id divergente do manifesto'
    cat <<EOF
Modo plano de retomada: $RUN_ID
Reutilizará os três usuários/IDs já registrados no manifesto.
Executará somente as etapas ainda vazias: administrador, categoria, candidatura,
aprovação, anúncio, carteira e pedido pendente.
Não haverá novo signup, novo run_id, payment_intent, Pix ou chamada Asaas.
EOF
  else
    cat <<'EOF'
Modo plano: nenhuma chamada Auth, PostgREST ou SQL mutável será executada.
Execução futura: provision.sh --apply --run-id <id>
Ordem: Auth -> profiles -> admin local -> categoria -> candidatura -> aprovação
-> anúncio -> carteira -> pedido pendente.
Não são criados payment_intents, Pix, chamadas Asaas ou webhooks.
EOF
  fi
  exit 0
fi

require_tools
require_e13_context
[[ "$MODE" == apply ]] || die 'modo de execução inválido'

BUYER_ID= SELLER_USER_ID= ADMIN_ID= APPLICATION_ID= SELLER_ID= CATEGORY_ID= LISTING_ID= WALLET_ID= ORDER_ID=

if ((RESUME)); then
  [[ -f "$MANIFEST" ]] || die 'retomada exige manifesto existente'
  [[ "$(jq -r '.project_id' "$MANIFEST")" == "$E13_PROJECT_ID" ]] || die 'manifesto não pertence ao E13'
  [[ "$(jq -r '.run_id' "$MANIFEST")" == "$RUN_ID" ]] || die 'run_id divergente do manifesto'
  BUYER_ID=$(jq -er '.ids.buyer_id' "$MANIFEST"); SELLER_USER_ID=$(jq -er '.ids.seller_user_id' "$MANIFEST"); ADMIN_ID=$(jq -er '.ids.admin_id' "$MANIFEST")
  APPLICATION_ID=$(jq -er '.ids.application_id' "$MANIFEST"); SELLER_ID=$(jq -er '.ids.seller_id' "$MANIFEST")
  CATEGORY_ID=$(jq -er '.ids.category_id' "$MANIFEST"); LISTING_ID=$(jq -er '.ids.listing_id' "$MANIFEST")
  WALLET_ID=$(jq -er '.ids.wallet_id' "$MANIFEST"); ORDER_ID=$(jq -er '.ids.order_id' "$MANIFEST")
  for value in "$BUYER_ID" "$SELLER_USER_ID" "$ADMIN_ID"; do validate_uuid "$value"; done
  BUYER_EMAIL="gemn.e13.${RUN_ID}.buyer@example.test"
  SELLER_EMAIL="gemn.e13.${RUN_ID}.seller@example.test"
  ADMIN_EMAIL="gemn.e13.${RUN_ID}.admin@example.test"
  [[ "$(sql -Atc "select count(*) from auth.users where id='$BUYER_ID' and email='$BUYER_EMAIL';")" == 1 ]] || die 'buyer do manifesto não corresponde ao Auth E13'
  [[ "$(sql -Atc "select count(*) from auth.users where id='$SELLER_USER_ID' and email='$SELLER_EMAIL';")" == 1 ]] || die 'seller do manifesto não corresponde ao Auth E13'
  [[ "$(sql -Atc "select count(*) from auth.users where id='$ADMIN_ID' and email='$ADMIN_EMAIL';")" == 1 ]] || die 'admin do manifesto não corresponde ao Auth E13'
  [[ "$(sql -Atc "select count(*) from public.profiles where id in ('$BUYER_ID','$SELLER_USER_ID','$ADMIN_ID');")" == 3 ]] || die 'profiles do manifesto não correspondem aos usuários'
  [[ -n "${E13_PUBLISHABLE_KEY:-}" ]] || die 'E13_PUBLISHABLE_KEY ausente'
  [[ -n "${E13_FIXTURE_PASSWORD:-}" ]] || E13_FIXTURE_PASSWORD=$(openssl rand -hex 24)
  auth_local_set_password "$BUYER_ID" "$E13_FIXTURE_PASSWORD"
  auth_local_set_password "$SELLER_USER_ID" "$E13_FIXTURE_PASSWORD"
  auth_local_set_password "$ADMIN_ID" "$E13_FIXTURE_PASSWORD"
  auth_signin "$BUYER_EMAIL" "$E13_FIXTURE_PASSWORD"; BUYER_TOKEN=$AUTH_ACCESS_TOKEN
  auth_signin "$SELLER_EMAIL" "$E13_FIXTURE_PASSWORD"; SELLER_TOKEN=$AUTH_ACCESS_TOKEN
  auth_signin "$ADMIN_EMAIL" "$E13_FIXTURE_PASSWORD"; ADMIN_TOKEN=$AUTH_ACCESS_TOKEN
else
  [[ -n "${E13_PUBLISHABLE_KEY:-}" ]] || die 'E13_PUBLISHABLE_KEY ausente'
  [[ -n "${E13_FIXTURE_PASSWORD:-}" ]] || { read -r -s -p 'Senha sintética temporária: ' E13_FIXTURE_PASSWORD; printf '\n'; }
  BUYER_EMAIL="gemn.e13.${RUN_ID}.buyer@example.test"
  SELLER_EMAIL="gemn.e13.${RUN_ID}.seller@example.test"
  ADMIN_EMAIL="gemn.e13.${RUN_ID}.admin@example.test"
  auth_signup "$BUYER_EMAIL" "$E13_FIXTURE_PASSWORD"; BUYER_ID=$AUTH_USER_ID; BUYER_TOKEN=$AUTH_ACCESS_TOKEN; write_manifest
  auth_signup "$SELLER_EMAIL" "$E13_FIXTURE_PASSWORD"; SELLER_USER_ID=$AUTH_USER_ID; SELLER_TOKEN=$AUTH_ACCESS_TOKEN; write_manifest
  auth_signup "$ADMIN_EMAIL" "$E13_FIXTURE_PASSWORD"; ADMIN_ID=$AUTH_USER_ID; ADMIN_TOKEN=$AUTH_ACCESS_TOKEN; write_manifest
fi

if [[ "$(sql -Atc "select is_admin from public.profiles where id='$ADMIN_ID';")" != true ]]; then
  [[ "$(sql -Atc "update public.profiles set is_admin=true where id='$ADMIN_ID' returning id;")" == "$ADMIN_ID" ]] || die 'promoção administrativa não confirmada'
fi
write_manifest

CATEGORY_NAME="E13_D1_${RUN_ID}_CATEGORY"
if [[ -z "$CATEGORY_ID" ]]; then
  category_rows=$(sql -Atc "select id from public.categories where nome='$CATEGORY_NAME';")
  [[ "$(wc -l <<<"$category_rows" | tr -d ' ')" -le 1 ]] || die 'múltiplas categorias para o run_id'
  CATEGORY_ID=${category_rows:-}
  if [[ -z "$CATEGORY_ID" ]]; then
    CATEGORY_ID=$(sql -Atc "insert into public.categories (nome, ativo) values ('$CATEGORY_NAME', true) returning id;")
  fi
else
  validate_uuid "$CATEGORY_ID"
fi
validate_uuid "$CATEGORY_ID"; write_manifest

if [[ -z "$APPLICATION_ID" ]]; then
  application_rows=$(sql -Atc "select id from public.seller_applications where user_id='$SELLER_USER_ID' and descricao='Fixture sintética E13; sem valor financeiro.';")
  [[ "$(wc -l <<<"$application_rows" | tr -d ' ')" -le 1 ]] || die 'múltiplas candidaturas para o run_id'
  APPLICATION_ID=${application_rows:-}
  if [[ -z "$APPLICATION_ID" ]]; then
    APPLICATION_RESPONSE=$(rest_post '/rest/v1/seller_applications' "$SELLER_TOKEN" "$(jq -cn --arg user_id "$SELLER_USER_ID" --arg name "E13 D1 $RUN_ID Seller" '{user_id:$user_id,tipo_membro:"empreendedor",nome_negocio:$name,cpf:("E13-TEST-CPF-"+$user_id),responsavel:$name,telefone:"E13-TEST-TELEFONE",categoria:"E13-TEST-CATEGORIA",descricao:"Fixture sintética E13; sem valor financeiro."}')")
    APPLICATION_ID=$(jq -er '.[0].id // empty' <<<"$APPLICATION_RESPONSE") || die 'candidatura não criada'
  fi
else
  validate_uuid "$APPLICATION_ID"
fi
validate_uuid "$APPLICATION_ID"; write_manifest

application_status=$(sql -Atc "select status from public.seller_applications where id='$APPLICATION_ID' and user_id='$SELLER_USER_ID';")
[[ -n "$application_status" ]] || die 'candidatura do manifesto não corresponde ao vendedor'
if [[ -z "$SELLER_ID" ]]; then
  if [[ "$application_status" == pendente ]]; then
    REVIEW_RESPONSE=$(rest_post '/rest/v1/rpc/review_seller_application' "$ADMIN_TOKEN" "$(jq -cn --arg id "$APPLICATION_ID" '{p_application_id:$id,p_decisao:"aprovar",p_observacao_admin:"E13 fixture sintética"}')")
  elif [[ "$application_status" != aprovada ]]; then
    die 'candidatura existente não está pendente nem aprovada'
  fi
  SELLER_ID=$(sql -Atc "select id from public.sellers where application_id='$APPLICATION_ID';")
fi
validate_uuid "$SELLER_ID"; write_manifest

if [[ -z "$LISTING_ID" ]]; then
  LISTING_NAME="E13 D1 ${RUN_ID} Produto"
  listing_rows=$(sql -Atc "select id from public.listings where nome='$LISTING_NAME' and seller_id='$SELLER_ID';")
  [[ "$(wc -l <<<"$listing_rows" | tr -d ' ')" -le 1 ]] || die 'múltiplos anúncios para o run_id'
  LISTING_ID=${listing_rows:-}
  if [[ -z "$LISTING_ID" ]]; then
    LISTING_RESPONSE=$(rest_post '/rest/v1/listings' "$SELLER_TOKEN" "$(jq -cn --arg seller_id "$SELLER_ID" --arg category_id "$CATEGORY_ID" --arg name "$LISTING_NAME" '{seller_id:$seller_id,category_id:$category_id,tipo:"produto",nome:$name,descricao:"Produto sintético para checkout local E13.",preco_real:5.00,aceita_gemn:false,preco_gemn:null,status:"ativo"}')")
    LISTING_ID=$(jq -er '.[0].id // empty' <<<"$LISTING_RESPONSE") || die 'anúncio não criado'
  fi
fi
validate_uuid "$LISTING_ID"; write_manifest

WALLET_RESPONSE=$(rest_post '/rest/v1/rpc/ensure_my_wallet' "$BUYER_TOKEN" '{}')
WALLET_ID=$(jq -er '.[0].wallet_id // empty' <<<"$WALLET_RESPONSE") || die 'carteira não criada'
validate_uuid "$WALLET_ID"; write_manifest

if [[ -z "$ORDER_ID" ]]; then
  order_rows=$(sql -Atc "select o.id from public.orders o join public.order_items oi on oi.order_id=o.id where o.buyer_id='$BUYER_ID' and oi.listing_id='$LISTING_ID' and o.status='pendente';")
  [[ "$(wc -l <<<"$order_rows" | tr -d ' ')" -le 1 ]] || die 'múltiplos pedidos pendentes para o run_id'
  ORDER_ID=${order_rows:-}
  if [[ -z "$ORDER_ID" ]]; then
    ORDER_KEY=$(cat /proc/sys/kernel/random/uuid)
    ORDER_RESPONSE=$(rest_post '/rest/v1/rpc/create_order' "$BUYER_TOKEN" "$(jq -cn --arg listing "$LISTING_ID" --arg key "$ORDER_KEY" '{p_listing_id:$listing,p_quantidade:1,p_forma_pagamento:"real",p_idempotency_key:$key}')")
    ORDER_ID=$(jq -er '.[0].order_id // empty' <<<"$ORDER_RESPONSE") || die 'pedido não criado'
  fi
fi
validate_uuid "$ORDER_ID"; write_manifest

[[ "$(sql -Atc "select count(*) from public.orders where id='$ORDER_ID' and buyer_id='$BUYER_ID' and status='pendente';")" == 1 ]] || die 'pedido final não está pendente'
[[ "$(sql -Atc "select count(*) from public.payment_intents where order_id='$ORDER_ID';")" == 0 ]] || die 'payment_intent inesperado'

unset E13_FIXTURE_PASSWORD BUYER_TOKEN SELLER_TOKEN ADMIN_TOKEN AUTH_ACCESS_TOKEN
log "Fixtures E13 concluídas para run_id=$RUN_ID; manifesto local: $MANIFEST"
