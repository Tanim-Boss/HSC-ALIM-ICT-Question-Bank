#!/usr/bin/env bash
#
# REAL-POSTGRESQL verification of the mandatory migration-history checksum gate.
#
# WHY THIS EXISTS
#
# `tests/unit/tooling/deploy-gate.test.ts` proves the gate's logic with controlled
# fixtures: a `psql` stub answers the three queries the gate issues, and a fake
# `npx` sentinel proves deployment is not reached when verification refuses. That
# covers the decision logic, but a stub cannot prove that the *real* queries are
# valid SQL, that the history predicate matches PostgreSQL's behaviour, or that a
# genuine first deployment to an empty database takes the determination branch.
#
# This script closes exactly that gap. It runs the real `psql` against a real
# PostgreSQL 16 server, on disposable databases it creates and drops itself, and
# drives the real gate script.
#
# It never touches a shared or production database: every case gets a database
# named `hsc_gate_check_<case>_<pid>` and is dropped at the end of the case. Point
# it at a disposable cluster with PG_ADMIN_URL (or DATABASE_URL). Do NOT point it
# at production.
#
# The positive control for deployment uses a FAKE `npx` on PATH, so no Prisma
# CLI is invoked and no migration is ever applied by the deploy step. That is the
# point: this proves *whether* the deploy command is reached, which needs no
# Prisma at all.
#
# Usage:
#   PG_ADMIN_URL='postgresql://postgres@localhost:5432/postgres' \
#     bash scripts/ci/deploy-gate-pg-check.sh
#
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$ROOT/scripts/db/deploy-gate.sh"
MIGRATION_NAME="0001_phase04a_question_bank"
MIGRATION_SQL="$ROOT/prisma/migrations/$MIGRATION_NAME/migration.sql"

ADMIN_URL="${PG_ADMIN_URL:-${DATABASE_URL:-}}"
if [ -z "$ADMIN_URL" ]; then
  echo "REFUSED: set PG_ADMIN_URL (or DATABASE_URL) to a DISPOSABLE PostgreSQL server." >&2
  exit 2
fi
command -v psql >/dev/null 2>&1 || {
  echo "REFUSED: psql is not on PATH; this check needs a real client." >&2
  exit 2
}
[ -f "$MIGRATION_SQL" ] || {
  echo "REFUSED: $MIGRATION_SQL not found." >&2
  exit 2
}

WORK="$(mktemp -d)"
FAKE_BIN="$WORK/bin"
mkdir -p "$FAKE_BIN"
DEPLOY_MARKER="$WORK/deploy-ran"
DEPLOY_LOG="$WORK/deploy-args.log"
trap 'rm -rf "$WORK"' EXIT

# The deployment sentinel. It records that `migrate deploy` was reached and with
# which arguments, then exits 0 without touching the database.
cat > "$FAKE_BIN/npx" <<FAKE
#!/usr/bin/env bash
touch "$DEPLOY_MARKER"
printf '%s\n' "\$*" >> "$DEPLOY_LOG"
exit 0
FAKE
chmod +x "$FAKE_BIN/npx"

# NOTICE chatter from DROP DATABASE IF EXISTS would bury the result lines.
export PGOPTIONS="-c client_min_messages=warning"

PASS=0
FAIL=0
CASE_DB=""

green() { printf '%s\n' "PASS  $1"; PASS=$((PASS + 1)); }
red() { printf '%s\n' "FAIL  $1" >&2; FAIL=$((FAIL + 1)); }

q() { psql "$CASE_DB" -v ON_ERROR_STOP=1 -tAq -c "$1"; }

new_db() {
  local name="hsc_gate_check_$1_$$"
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS \"$name\";" >/dev/null
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"$name\";" >/dev/null
  # Reuse the admin URL but swap the database component via PG* env is fragile;
  # build the case URL explicitly by replacing the trailing path.
  local base="${ADMIN_URL%%\?*}"
  local query=""
  [[ "$ADMIN_URL" == *"?"* ]] && query="?${ADMIN_URL#*\?}"
  local root="${base%/*}"
  CASE_DB="${root}/${name}${query}"
}

drop_db() {
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS \"$(basename "${CASE_DB%%\?*}")\";" >/dev/null || true
  CASE_DB=""
}

# Applies the committed migration 0001 directly with psql, exactly as the V-2/V-3
# job does, and records a Prisma-shaped history row carrying the true checksum.
seed_migrated_db() {
  psql "$CASE_DB" -v ON_ERROR_STOP=1 -q -f "$MIGRATION_SQL" >/dev/null
  local sha
  sha="$(sha256sum "$MIGRATION_SQL" | cut -d' ' -f1)"
  psql "$CASE_DB" -v ON_ERROR_STOP=1 -q <<SQL >/dev/null
CREATE TABLE IF NOT EXISTS _prisma_migrations (
  id                  varchar(36) PRIMARY KEY,
  checksum            varchar(64) NOT NULL,
  finished_at         timestamptz,
  migration_name      varchar(255) NOT NULL,
  logs                text,
  rolled_back_at      timestamptz,
  started_at          timestamptz NOT NULL DEFAULT now(),
  applied_steps_count integer NOT NULL DEFAULT 0
);
INSERT INTO _prisma_migrations
  (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text, '$sha', now(), '$MIGRATION_NAME', now(), 1);
SQL
}

# Runs the gate in the requested mode and leaves rc/output in RUN_RC / RUN_OUT.
run_gate() {
  local mode="$1"
  shift
  rm -f "$DEPLOY_MARKER" "$DEPLOY_LOG"
  set +e
  RUN_OUT="$(PATH="$FAKE_BIN:$PATH" DATABASE_URL="$CASE_DB" \
    bash "$GATE" "$mode" "$@" 2>&1)"
  RUN_RC=$?
  set -e
}

echo "PostgreSQL: $(psql "$ADMIN_URL" -tAq -v ON_ERROR_STOP=1 -c 'SHOW server_version;')"
echo

# ---------------------------------------------------------------------------
# 1. Matching history passes
# ---------------------------------------------------------------------------
new_db match
seed_migrated_db
run_gate verify
if [ "$RUN_RC" -eq 0 ] && [[ "$RUN_OUT" == *"VERIFIED"* ]]; then
  green "matching history verifies (exit 0)"
else
  red "matching history should verify — exit=$RUN_RC"; printf '%s\n' "$RUN_OUT" | sed 's/^/      /'
fi
drop_db

# ---------------------------------------------------------------------------
# 2. A modified applied migration fails
# ---------------------------------------------------------------------------
new_db modified
seed_migrated_db
# Simulate the file having been edited after it was applied: the recorded
# checksum stays as Prisma wrote it, the bytes on disk differ. The gate compares
# the record against the tree, so a copy of the tree is edited here.
MUT="$WORK/migrations_modified"
mkdir -p "$MUT/$MIGRATION_NAME"
printf -- '-- edited after it was applied\n' > "$MUT/$MIGRATION_NAME/migration.sql"
run_gate verify --migrations-dir "$MUT"
if [ "$RUN_RC" -eq 1 ] && [[ "$RUN_OUT" == *"MODIFIED"* ]]; then
  green "a modified applied migration is refused (exit 1)"
else
  red "modified migration should be refused — exit=$RUN_RC"; printf '%s\n' "$RUN_OUT" | sed 's/^/      /'
fi
drop_db

# ---------------------------------------------------------------------------
# 3. A migration recorded as applied whose file is missing fails
# ---------------------------------------------------------------------------
new_db missingfile
seed_migrated_db
q "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
     VALUES (gen_random_uuid()::text, repeat('a',64), now(), '9999_vanished', now(), 1);" >/dev/null
run_gate verify
if [ "$RUN_RC" -eq 1 ] && [[ "$RUN_OUT" == *"does not exist"* ]]; then
  green "a vanished migration file is refused (exit 1)"
else
  red "missing migration file should be refused — exit=$RUN_RC"; printf '%s\n' "$RUN_OUT" | sed 's/^/      /'
fi
drop_db

# ---------------------------------------------------------------------------
# 4a. A history row with no checksum fails
# ---------------------------------------------------------------------------
new_db nocksum
seed_migrated_db
q "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
     VALUES (gen_random_uuid()::text, '', now(), '0002_empty_checksum', now(), 1);" >/dev/null
mkdir -p "$WORK/migrations_nocksum/0002_empty_checksum"
printf -- '-- whatever\n' > "$WORK/migrations_nocksum/0002_empty_checksum/migration.sql"
run_gate verify --migrations-dir "$WORK/migrations_nocksum"
if [ "$RUN_RC" -eq 1 ] && [[ "$RUN_OUT" == *"no checksum"* ]]; then
  green "a history row with no checksum is refused (exit 1)"
else
  red "missing checksum should be refused — exit=$RUN_RC"; printf '%s\n' "$RUN_OUT" | sed 's/^/      /'
fi
drop_db

# ---------------------------------------------------------------------------
# 4b. A mismatched checksum fails
# ---------------------------------------------------------------------------
new_db mismatch
seed_migrated_db
q "UPDATE _prisma_migrations SET checksum = repeat('f',64);" >/dev/null
run_gate verify
if [ "$RUN_RC" -eq 1 ] && [[ "$RUN_OUT" == *"MODIFIED"* ]]; then
  green "a mismatched recorded checksum is refused (exit 1)"
else
  red "mismatched checksum should be refused — exit=$RUN_RC"; printf '%s\n' "$RUN_OUT" | sed 's/^/      /'
fi
drop_db

# ---------------------------------------------------------------------------
# 5. Non-empty schema with no migration history fails
# ---------------------------------------------------------------------------
new_db dirty
psql "$CASE_DB" -v ON_ERROR_STOP=1 -q -c "CREATE TABLE not_recorded (id integer primary key);" >/dev/null
run_gate verify
if [ "$RUN_RC" -eq 1 ] && [[ "$RUN_OUT" == *"inconsistent or tampered"* ]]; then
  green "a non-empty schema with no history is refused (exit 1)"
else
  red "dirty schema should be refused — exit=$RUN_RC"; printf '%s\n' "$RUN_OUT" | sed 's/^/      /'
fi
drop_db

# ---------------------------------------------------------------------------
# 6. Failed verification prevents deployment
# ---------------------------------------------------------------------------
new_db deployrefused
seed_migrated_db
q "UPDATE _prisma_migrations SET checksum = repeat('9',64);" >/dev/null
run_gate deploy
if [ "$RUN_RC" -eq 1 ] && [ ! -f "$DEPLOY_MARKER" ]; then
  green "failed verification prevents deployment (no deploy reached)"
else
  red "deployment was reached after a failed verification — exit=$RUN_RC marker=$([ -f "$DEPLOY_MARKER" ] && echo present || echo absent)"
fi
drop_db

# ---------------------------------------------------------------------------
# 7. Successful verification permits deployment (positive control)
# ---------------------------------------------------------------------------
new_db deployok
seed_migrated_db
run_gate deploy -- --config prisma.config.ts
if [ "$RUN_RC" -eq 0 ] && [ -f "$DEPLOY_MARKER" ] \
   && grep -q 'prisma migrate deploy --config prisma.config.ts' "$DEPLOY_LOG"; then
  green "successful verification reaches the deploy command with forwarded args"
else
  red "deployment should be reached after a pass — exit=$RUN_RC"; printf '%s\n' "$RUN_OUT" | sed 's/^/      /'
  [ -f "$DEPLOY_LOG" ] && sed 's/^/      args: /' "$DEPLOY_LOG"
fi
drop_db

# ---------------------------------------------------------------------------
# 8. First deployment to an empty database: determined, then deployed
# ---------------------------------------------------------------------------
new_db empty
run_gate deploy
if [ "$RUN_RC" -eq 0 ] && [[ "$RUN_OUT" == *"DETERMINED"* ]] && [ -f "$DEPLOY_MARKER" ]; then
  green "an empty database is determined and the first deployment proceeds"
else
  red "empty-database first deployment should proceed — exit=$RUN_RC"; printf '%s\n' "$RUN_OUT" | sed 's/^/      /'
fi
drop_db

echo
echo "checksum gate vs real PostgreSQL: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
