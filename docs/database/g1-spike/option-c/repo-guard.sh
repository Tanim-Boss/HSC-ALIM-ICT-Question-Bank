#!/usr/bin/env bash
# =====================================================================
# Option C / G-3 — repository guard for the migration workflow
#
#   ./repo-guard.sh [repo-root]
#
# Enforces the two rules that Option C depends on and that nothing in Prisma
# enforces for us:
#
#   1. NO invocation of `prisma migrate dev` (or `migrate reset`, or `db push`)
#      may appear in an executable script or CI workflow. These commands read
#      the live catalog, cannot see C-1..C-5, and generate a migration that
#      drops them — proven twice in G-1.
#
#   2. Every migration-bearing script must use the approved commands
#      (`migrate deploy`, `migrate status`, `migrate diff`).
#
# Documentation is deliberately NOT scanned for these phrases: the proposal and
# the READMEs must be able to discuss the prohibited commands. Only executed
# surfaces are checked. Prose about a rule is not a violation of it.
#
# Exit codes: 0 = clean, 1 = violation found, 2 = usage error.
# =====================================================================
set -Eeuo pipefail

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)}"
[ -d "$ROOT" ] || { echo "usage: repo-guard.sh <repo-root>" >&2; exit 2; }

# Surfaces that are actually executed by a human or by CI.
SCAN_DIRS=(scripts .github/workflows)
SCAN_GLOBS=('deploy*.sh' 'migrate*.sh' '*.yml' '*.yaml')

# A command is prohibited when an actual invocation appears: the phrase, not a
# mention inside a comment or a quotation about policy.
#   - `prisma migrate dev` / `npx prisma migrate dev` / `node_modules/.bin/prisma migrate dev`
#   - the same for `migrate reset` and `db push`
PROHIBITED_RE='(^|[^[:alnum:]_-])(prisma|npx[[:space:]]+prisma|pnpm[[:space:]]+prisma|yarn[[:space:]]+prisma|bunx?[[:space:]]+prisma)[[:space:]]+(migrate[[:space:]]+(dev|reset)|db[[:space:]]+push)([^[:alnum:]_-]|$)'

violations=0
declare -a offenders=()

scan_file() {
  local file="$1"
  # Skip comment-only lines: a comment saying "never run prisma migrate dev"
  # is documentation inside code, not an invocation.
  local hits
  hits="$(grep -nEi "$PROHIBITED_RE" "$file" 2>/dev/null | grep -vE '^[0-9]+:[[:space:]]*#' || true)"
  if [ -n "$hits" ]; then
    offenders+=("$file")
    printf 'PROHIBITED COMMAND  %s\n' "${file#"$ROOT"/}"
    printf '%s\n' "$hits" | sed 's/^/    /'
    violations=$((violations + 1))
  fi
}

for dir in "${SCAN_DIRS[@]}"; do
  full="$ROOT/$dir"
  [ -d "$full" ] || continue
  for glob in "${SCAN_GLOBS[@]}"; do
    while IFS= read -r -d '' f; do
      scan_file "$f"
    done < <(find "$full" -type f -name "$glob" -print0 2>/dev/null)
  done
done

if [ "$violations" -gt 0 ]; then
  echo
  echo "FAIL: $violations file(s) invoke a prohibited Prisma migration command."
  echo "Option C forbids 'prisma migrate dev', 'migrate reset' and 'db push' for this"
  echo "schema: they diff the live catalog, cannot see C-1..C-5, and generate a"
  echo "migration that drops them. Use 'migrate deploy', 'migrate status', or a"
  echo "schema-to-schema 'migrate diff'."
  exit 1
fi

echo "OK: no prohibited Prisma migration command in any executed surface"
exit 0
