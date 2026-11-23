#!/usr/bin/env bash
# V-1 diagnostic: which `prisma migrate diff` invocation actually sees a
# datamodel-to-datamodel delta?
#
# Why this exists
#   `migrate diff --from-schema prev.prisma --to-schema next.prisma --script`
#   returned exit 0 and an EMPTY script although the two files differ by one
#   `@@index`. Empty means "no difference", so the command ran, parsed, and
#   concluded nothing changed — which then produced an empty migration 0002.
#   The CLI's own runtime help says `--from-schema` "uses the datamodel for the
#   diff", so the intent was right and the flag was right; something else made
#   the comparison degenerate. This records what each plausible invocation does
#   so the fix is chosen from evidence rather than guessed.
#
# Config files are written INSIDE the repository: `prisma/config` is a bare
# specifier that Node resolves by walking up from the config file, so a config
# under /tmp cannot see node_modules and the command dies before diffing.
#
# Read-only: no database is written, nothing is deployed.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../../../../.." && pwd)"
[ -f "$REPO_ROOT/prisma/schema.prisma" ] || { echo "FATAL: REPO_ROOT=$REPO_ROOT has no prisma/schema.prisma"; exit 2; }

SESS="$REPO_ROOT/.v1-session/probe.$$"
mkdir -p "$SESS"
trap 'rm -rf "$SESS"; rmdir "$REPO_ROOT/.v1-session" 2>/dev/null || true' EXIT

cp "$REPO_ROOT/prisma/schema.prisma" "$SESS/prev.prisma"
python3 - "$SESS/prev.prisma" "$SESS/next.prisma" <<'PY'
import io, sys
s = io.open(sys.argv[1], encoding='utf-8').read()
anchor = '  @@index([status, type, difficulty], map: "ix_questions_status_type_difficulty")'
assert anchor in s, "anchor not found"
s = s.replace(anchor, anchor + '\n  @@index([createdAt(sort: Desc)], map: "ix_questions_created_at_desc")', 1)
io.open(sys.argv[2], 'w', encoding='utf-8').write(s)
PY

cat > "$SESS/next.config.ts" <<CFG
import { defineConfig } from 'prisma/config';
export default defineConfig({ schema: '$SESS/next.prisma' });
CFG

echo "prev indexes: $(grep -c '@@index' "$SESS/prev.prisma")"
echo "next indexes: $(grep -c '@@index' "$SESS/next.prisma")"
echo "delta lines:  $(diff "$SESS/prev.prisma" "$SESS/next.prisma" | grep -c '^>')"
echo

P="$REPO_ROOT/node_modules/.bin/prisma"
run() { # <label> <args...>
  local label="$1"; shift
  echo "===== $label"
  # Do NOT truncate: the schema engine's diagnostic follows a blank
  # "Error in Schema engine:" line, and cutting it hid the only useful text.
  ( cd "$REPO_ROOT" && "$P" migrate diff "$@" ) 2>&1
  echo "----- exit=$?"
  echo
}

run "A  --from-schema/--to-schema (space form) + config" \
  --from-schema "$SESS/prev.prisma" --to-schema "$SESS/next.prisma" --script --config "$SESS/next.config.ts"
run "B  --from-schema=/--to-schema= (equals form) + config" \
  --from-schema="$SESS/prev.prisma" --to-schema="$SESS/next.prisma" --script --config "$SESS/next.config.ts"
run "C  equals form, no --config" \
  --from-schema="$SESS/prev.prisma" --to-schema="$SESS/next.prisma" --script
run "D  CONTROL --from-empty --to-schema= (must emit the whole schema)" \
  --from-empty --to-schema="$SESS/next.prisma" --script --config "$SESS/next.config.ts"
run "E  human-readable summary, no --script" \
  --from-schema="$SESS/prev.prisma" --to-schema="$SESS/next.prisma" --config "$SESS/next.config.ts"
run "F  --exit-code (2 = changes detected, 0 = empty)" \
  --from-schema="$SESS/prev.prisma" --to-schema="$SESS/next.prisma" --exit-code --config "$SESS/next.config.ts"
run "G  -o writes the script to a FILE (bypasses stdout handling)" \
  --from-schema="$SESS/prev.prisma" --to-schema="$SESS/next.prisma" --script -o "$SESS/g.sql" --config "$SESS/next.config.ts"
echo "G file: $( [ -f "$SESS/g.sql" ] && wc -c < "$SESS/g.sql" || echo 0 ) bytes"
[ -f "$SESS/g.sql" ] && sed -n '1,10p' "$SESS/g.sql"
echo
run "H  NO-OP CONTROL: prev -> prev (an empty diff is the CORRECT answer)" \
  --from-schema="$SESS/prev.prisma" --to-schema="$SESS/prev.prisma" --script --config "$SESS/next.config.ts"
run "I  --from-migrations vs --to-schema (the real workflow shape)" \
  --from-migrations "$REPO_ROOT/prisma/migrations" --to-schema="$SESS/next.prisma" --script --config "$SESS/next.config.ts"

# ---------------------------------------------------------------------------
# The decisive experiment.
#
# Cases A-I are ambiguous: an empty script could mean "no difference", or it
# could mean "your --from/--to flags were ignored and something else was
# compared". A one-model datamodel cannot be identical to the 18-model target,
# so if diffing it against next.prisma ALSO yields nothing, the flags are not
# being honoured and every empty result above is worthless as evidence.
# ---------------------------------------------------------------------------
cat > "$SESS/tiny.prisma" <<'TINY'
datasource db {
  provider = "postgresql"
  url      = "postgresql://user:pass@localhost:5432/db"
}

model OnlyOne {
  id UUID @id @default(uuid()) @db.Uuid
  @@map("only_one")
}
TINY

run "J  DECISIVE: one-model datamodel -> next.prisma (empty output = flags ignored)" \
  --from-schema="$SESS/tiny.prisma" --to-schema="$SESS/next.prisma" --script --config "$SESS/next.config.ts"

# Same, but with no config at all and from a directory with no config above it.
echo "===== K  one-model -> next, run from /tmp with no config anywhere"
( cd /tmp && "$P" migrate diff \
    --from-schema="$SESS/tiny.prisma" --to-schema="$SESS/next.prisma" --script ) 2>&1
echo "----- exit=$?"
echo

# Determinism: the same invocation three times.
for i in 1 2 3; do
  echo "===== L$i  determinism repeat of A"
  ( cd "$REPO_ROOT" && "$P" migrate diff \
      --from-schema="$SESS/prev.prisma" --to-schema="$SESS/next.prisma" --script \
      --config "$SESS/next.config.ts" ) 2>&1
  echo "----- exit=$?"
  echo
done

# Engine logging, to see whether the schema engine is even starting.
echo "===== M  same as A with DEBUG=* (engine diagnostics)"
( cd "$REPO_ROOT" && DEBUG='*' "$P" migrate diff \
    --from-schema="$SESS/prev.prisma" --to-schema="$SESS/next.prisma" --script \
    --config "$SESS/next.config.ts" ) 2>&1 | grep -viE "^\s*$" | sed -n '1,60p'
echo
echo "===== N  environment"
node -v 2>/dev/null; echo "prisma: $("$P" --version 2>/dev/null | tr '\n' ' ')"
echo "DATABASE_URL set: ${DATABASE_URL:+yes}${DATABASE_URL:-no}"
echo "engines present: $(ls "$REPO_ROOT/node_modules/@prisma/engines" 2>/dev/null | tr '\n' ' ')"
"$P" migrate diff --help 2>&1 | grep -A2 "from-schema " | head -6

# ---------------------------------------------------------------------------
# Is the schema engine itself able to run, or is the CLI merely unable to use
# it? "Error in Schema engine:" with an EMPTY message is what a crash before
# any diagnostic looks like. Run the binary directly.
# ---------------------------------------------------------------------------
ENG="$REPO_ROOT/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x"
echo
echo "===== O  schema engine binary"
ls -l "$ENG" 2>&1 | sed 's/^/  /'
echo "--- --version:"
"$ENG" --version 2>&1 | sed -n '1,12p'
echo "----- exit=$?"
echo "--- missing shared libraries (ldd):"
ldd "$ENG" 2>&1 | grep -i "not found" || echo "  none missing"
echo "--- direct diff request (JSON-RPC 'diff' as the CLI would send it):"
printf '%s' '{"jsonrpc":"2.0","id":1,"method":"diff","params":{"from":{"tag":"schemaDatamodel","schema":{"schemaFiles":[{"path":"tiny.prisma","content":"datasource db { provider = \"postgresql\" url = \"postgresql://u:p@localhost:5432/d\" }\nmodel OnlyOne { id String @id }"}]}},"to":{"tag":"empty"},"script":true,"shadowDatabaseUrl":null}}' | timeout 60 "$ENG" --datamodel-path=/dev/null 2>&1 | sed -n '1,25p'
echo "----- exit=$?"
echo "--- same, using --version style flags:"
timeout 60 "$ENG" cli --version 2>&1 | sed -n '1,6p'
echo "----- exit=$?"
