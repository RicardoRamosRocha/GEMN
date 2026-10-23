#!/usr/bin/env bash
set -u

# Aditive E13 source sync. Never deletes destination files or uses rsync --delete.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT_DIR" ]]; then
  printf 'FAIL|cannot identify repository root\n' >&2
  exit 1
fi

SOURCE_ROOT="$ROOT_DIR/supabase"
TARGET_ROOT="$SCRIPT_DIR/supabase"
SOURCE_MIGRATIONS="$SOURCE_ROOT/migrations"
SOURCE_FUNCTIONS="$SOURCE_ROOT/functions"
TARGET_MIGRATIONS="$TARGET_ROOT/migrations"
TARGET_FUNCTIONS="$TARGET_ROOT/functions"

fail() { printf 'FAIL|%s\n' "$*" >&2; exit 1; }
ok() { printf 'OK|%s\n' "$*"; }

for required in "$SOURCE_MIGRATIONS" "$SOURCE_FUNCTIONS" "$TARGET_ROOT"; do
  [[ -d "$required" ]] || fail "missing directory: $required"
done

for source_dir in "$SOURCE_MIGRATIONS" "$SOURCE_FUNCTIONS"; do
  if find "$source_dir" -type f \( \
    -name '.env' -o -name '.env.*' -o -iname '*secret*' -o -iname '*token*' \
    -o -path '*/node_modules/*' -o -path '*/.cache/*' -o -path '*/tmp/*' \
  \) -print -quit | grep -q .; then
    fail "sensitive/cache candidate found in source: $source_dir"
  fi
done

mkdir -p "$TARGET_MIGRATIONS" "$TARGET_FUNCTIONS"

sync_tree() {
  local source_dir="$1"
  local target_dir="$2"
  local source_file relative target_file target_parent

  while IFS= read -r -d '' target_file; do
    relative="${target_file#"$target_dir/"}"
    [[ -f "$source_dir/$relative" ]] || fail "unexpected destination file: $target_file"
  done < <(find "$target_dir" -type f -print0 | sort -z)

  while IFS= read -r -d '' source_file; do
    relative="${source_file#"$source_dir/"}"
    target_file="$target_dir/$relative"
    target_parent="$(dirname "$target_file")"
    if [[ -e "$target_file" && ! -f "$target_file" ]]; then
      fail "destination is not a regular file: $target_file"
    fi
    if [[ -f "$target_file" ]]; then
      cmp -s "$source_file" "$target_file" || fail "divergent destination file: $target_file"
    else
      mkdir -p "$target_parent"
      cp -p "$source_file" "$target_file"
      printf 'COPIED|%s\n' "$target_file"
    fi
  done < <(find "$source_dir" -type f -print0 | sort -z)
}

sync_tree "$SOURCE_MIGRATIONS" "$TARGET_MIGRATIONS"
sync_tree "$SOURCE_FUNCTIONS" "$TARGET_FUNCTIONS"

source_migrations="$(find "$SOURCE_MIGRATIONS" -type f -name '*.sql' | wc -l)"
target_migrations="$(find "$TARGET_MIGRATIONS" -type f -name '*.sql' | wc -l)"
source_functions="$(find "$SOURCE_FUNCTIONS" -type f | wc -l)"
target_functions="$(find "$TARGET_FUNCTIONS" -type f | wc -l)"
[[ "$source_migrations" == "$target_migrations" && "$target_migrations" == 66 ]] || fail "migration count mismatch: source=$source_migrations target=$target_migrations"
[[ "$source_functions" == "$target_functions" && "$target_functions" == 38 ]] || fail "function count mismatch: source=$source_functions target=$target_functions"

source_manifest="$(mktemp)"
target_manifest="$(mktemp)"
trap 'rm -f "$source_manifest" "$target_manifest"' EXIT

(cd "$SOURCE_MIGRATIONS" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$source_manifest"
(cd "$TARGET_MIGRATIONS" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$target_manifest"
cmp -s "$source_manifest" "$target_manifest" || fail 'migration SHA-256 mismatch'

(cd "$SOURCE_FUNCTIONS" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$source_manifest"
(cd "$TARGET_FUNCTIONS" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$target_manifest"
cmp -s "$source_manifest" "$target_manifest" || fail 'function SHA-256 mismatch'

ok "migrations=$target_migrations"
ok "functions=$target_functions"
ok 'SHA-256 source/destination match'
ok 'no deletion performed'
