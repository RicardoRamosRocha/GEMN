#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
E13_DIR="$ROOT_DIR/infra/e13-linux"
STATUS_FILE=$(mktemp /tmp/gemn-e13-status.XXXXXX)
STATUS_ERR=$(mktemp /tmp/gemn-e13-status-error.XXXXXX)
TEMP_ROOT=$(mktemp -d /tmp/gemn-e13-web.XXXXXX)
E13_KEY=''

cleanup() {
  rm -f -- "$STATUS_FILE" "$STATUS_ERR"
  rm -rf -- "$TEMP_ROOT"
  unset E13_KEY
}

trap cleanup EXIT

fail() {
  echo "E13 Web launcher: $1" >&2
  exit 1
}

command -v npx >/dev/null 2>&1 || fail 'npx não encontrado.'
[[ -x "$ROOT_DIR/node_modules/.bin/expo" ]] || fail 'Expo local não encontrado em node_modules.'
[[ -f "$E13_DIR/supabase/config.toml" ]] || fail 'configuração Supabase E13 ausente.'

if ! (
  cd -- "$E13_DIR"
  npx --yes supabase status -o env >"$STATUS_FILE" 2>"$STATUS_ERR"
); then
  fail 'supabase status -o env falhou; nenhuma chave foi exibida.'
fi

E13_API_URL=$(sed -n 's/^API_URL=//p' "$STATUS_FILE" | head -n 1 | sed -E 's/^"//; s/"$//')
E13_KEY=$(sed -n 's/^PUBLISHABLE_KEY=//p' "$STATUS_FILE" | head -n 1 | sed -E 's/^"//; s/"$//')

[[ "$E13_API_URL" == 'http://127.0.0.1:64321' ]] || fail 'API_URL não corresponde ao endpoint E13 autorizado.'
[[ -n "$E13_KEY" ]] || fail 'PUBLISHABLE_KEY local não foi retornada pelo status E13.'

# O Metro Web SDK 57 inclui .env* no módulo virtual de ambiente mesmo quando
# EXPO_NO_DOTENV=1 está definido. Uma raiz temporária sem esses arquivos faz
# o módulo virtual usar exclusivamente as variáveis explícitas do processo.
while IFS= read -r -d '' entry; do
  name=$(basename -- "$entry")
  case "$name" in
    .env|.env.*|.expo|.git)
      continue
      ;;
  esac
  ln -s -- "$entry" "$TEMP_ROOT/$name"
done < <(find "$ROOT_DIR" -mindepth 1 -maxdepth 1 -print0)

echo "E13 Web launcher: endpoint local confirmado; chave pública carregada (${#E13_KEY} caracteres)."
echo 'E13 Web launcher: raiz temporária sem arquivos .env criada.'
echo 'E13 Web launcher: iniciando Expo Web na porta 19000 com cache limpo.'

cd -- "$TEMP_ROOT"
exec env \
  EXPO_NO_DOTENV=1 \
  EXPO_PUBLIC_SUPABASE_URL='http://127.0.0.1:64321' \
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$E13_KEY" \
  ./node_modules/.bin/expo start --web --localhost --port 19000 --clear
