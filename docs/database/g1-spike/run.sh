#!/usr/bin/env bash
# =====================================================================
# G-1 spike — driver
#
# Runs the Prisma-drift experiment for the five composite foreign keys
# (Request C) against a DISPOSABLE PostgreSQL database.
#
#   ./run.sh <empty-disposable-database-url>
#
# It deliberately refuses to run against anything that does not look like
# a throwaway instance, because step 4 drops and recreates the schema.
#
# Requirements:
#   PostgreSQL 15+ (16.x is what this was written against)
#   Prisma CLI at the version pinned by the project (7.10.1 at the time)
#   A reachable Prisma engine binary
#
# Steps 1-3 always run. Steps 4-7 need the Prisma CLI to be able to start
# its schema engine; if it cannot, the script stops with a clear message
# instead of pretending the drift checks passed.
# =====================================================================
set -uo pipefail

URL="${1:-}"
SPIKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PSQL="${PSQL:-psql}"
PRISMA="${PRISMA:-npx prisma}"

fail() { printf '\n[G-1] FAIL: %s\n' "$*" >&2; exit 1; }
step() { printf '\n============================================================\n[G-1] %s\n============================================================\n' "$*"; }

[ -n "$URL" ] || fail "usage: run.sh <empty-disposable-database-url>"

# --- guard: disposable only --------------------------------------------
case "$URL" in
  *prod*|*production*|*staging*|*supabase.co*) fail "refusing to run against a non-disposable database: $URL" ;;
  *localhost*|*127.0.0.1*) : ;;
  *) printf '[G-1] warning: %s does not look local; press Ctrl-C to abort.\n' "$URL"; sleep 5 ;;
esac

export G1_SPIKE_DATABASE_URL="$URL"

# --- versions ----------------------------------------------------------
step "0. versions"
"$PSQL" "$URL" -Atc "select 'PostgreSQL ' || version();"
$PRISMA --version || fail "the Prisma CLI cannot start (see docs §11.3 'G-1' for the known engine-download blocker)"

# --- step 1: create the schema + the five composite FKs ----------------
step "1. create schema, apply C-1..C-5 and the three support keys"
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -f "$SPIKE_DIR/sql/0001-schema.sql" \
  || fail "schema creation failed"

count_composite_fks() {
  "$PSQL" "$URL" -Atc "
    SELECT count(*) FROM pg_constraint
    WHERE connamespace = 'g1'::regnamespace
      AND conname IN (
        'fk_questions_level_subject','fk_questions_chapter_subject',
        'fk_questions_topic_chapter','fk_questions_subtopic_topic',
        'fk_answer_keys_options_of_version');"
}

before="$(count_composite_fks)"
[ "$before" = "5" ] || fail "expected 5 composite FKs after creation, found $before"
printf '[G-1] 5/5 composite FKs created\n'

# --- step 2: enforcement ------------------------------------------------
step "2. enforcement: every constraint rejects an invalid write"
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -f "$SPIKE_DIR/sql/0002-enforce.sql" \
  | tee "$SPIKE_DIR/expected/enforcement.log"
grep -q 'FAIL' "$SPIKE_DIR/expected/enforcement.log" \
  && fail "the enforcement suite reported a FAIL line"

# --- step 3: introspect -------------------------------------------------
step "3. introspection must not choke on the constraints"
$PRISMA db pull --print \
  --schema "$SPIKE_DIR/prisma/schema.prisma" \
  > "$SPIKE_DIR/expected/introspected.prisma" \
  || fail "prisma db pull failed"
printf '[G-1] introspection produced expected/introspected.prisma\n'

# --- step 4: drift must be EMPTY with no datamodel change ---------------
step "4. migrate diff (database -> datamodel) must be EMPTY (no DROP CONSTRAINT)"
$PRISMA migrate diff \
  --from-url "$URL" \
  --to-schema-datamodel "$SPIKE_DIR/prisma/schema.prisma" \
  --script > "$SPIKE_DIR/expected/drift-empty.sql" || fail "migrate diff failed"

if grep -Eiq 'DROP +CONSTRAINT|DROP +FOREIGN +KEY|fk_questions_|fk_answer_keys_' \
     "$SPIKE_DIR/expected/drift-empty.sql"; then
  printf '[G-1] drift output:\n'; cat "$SPIKE_DIR/expected/drift-empty.sql"
  fail "Prisma proposes dropping the hand-written composite FKs"
fi
printf '[G-1] no DROP CONSTRAINT for C-1..C-5 — pass\n'

# --- step 5: additive change must not disturb the constraints ----------
step "5. additive model change must leave the five constraints alone"
tmp_schema="$(mktemp --suffix=.prisma)"
sed 's/^  @@map("subtopics")/  marker String? \/\/ G-1 additive-change probe\n  @@map("subtopics")/' \
  "$SPIKE_DIR/prisma/schema.prisma" > "$tmp_schema"

$PRISMA migrate diff \
  --from-url "$URL" \
  --to-schema-datamodel "$tmp_schema" \
  --script > "$SPIKE_DIR/expected/drift-additive.sql" || fail "additive migrate diff failed"

if grep -Eiq 'DROP +CONSTRAINT|DROP +FOREIGN +KEY' "$SPIKE_DIR/expected/drift-additive.sql"; then
  printf '[G-1] drift output:\n'; cat "$SPIKE_DIR/expected/drift-additive.sql"
  fail "the additive change also drops a hand-written constraint"
fi
grep -qi 'ADD COLUMN' "$SPIKE_DIR/expected/drift-additive.sql" \
  || fail "the additive change produced no ADD COLUMN — the probe did not work"
printf '[G-1] additive change is ADD COLUMN only — pass\n'

after="$(count_composite_fks)"
[ "$after" = "5" ] || fail "expected 5 composite FKs after the diffing, found $after"
printf '[G-1] 5/5 composite FKs still present\n'

# --- step 6: migrate dev must generate an empty migration --------------
step "6. migrate dev with no schema change must generate an empty migration"
tmp_root="$(mktemp -d)"
cp -r "$SPIKE_DIR/prisma" "$tmp_root/prisma"
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -c 'CREATE SCHEMA IF NOT EXISTS g1_migrations;'
( cd "$tmp_root" && $PRISMA migrate dev --skip-generate --name g1_empty_check ) \
  || fail "migrate dev failed"

newest="$(ls -d "$tmp_root"/prisma/migrations/*/ 2>/dev/null | sort | tail -1)"
if [ -n "$newest" ] && grep -Eiq 'DROP +CONSTRAINT|DROP +FOREIGN +KEY' "$newest/migration.sql"; then
  fail "migrate dev generated a DROP for a hand-written constraint: $newest"
fi
printf '[G-1] migrate dev produced no DROP for C-1..C-5 — pass\n'

# --- step 7: final catalog state ---------------------------------------
step "7. final catalog state"
"$PSQL" "$URL" -c "
  SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
  WHERE connamespace = 'g1'::regnamespace
    AND conname LIKE 'fk\_%' ESCAPE '\'
  ORDER BY conname;"

final="$(count_composite_fks)"
[ "$final" = "5" ] || fail "expected 5 composite FKs at the end, found $final"

printf '\n[G-1] PASS — 5/5 composite FKs created, enforced, and untouched by Prisma.\n'
