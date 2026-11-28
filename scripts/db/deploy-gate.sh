#!/usr/bin/env bash
# =====================================================================
# Mandatory migration-history checksum gate, and the gated deploy path.
#
#   ./deploy-gate.sh verify [--history-json FILE] [--migrations-dir DIR]
#   ./deploy-gate.sh deploy
#
# Exit codes: 0 = verified / deployed, 1 = verification failed or refused,
#             2 = usage error.
#
# WHY THIS EXISTS
# ---------------
# `prisma migrate deploy` and `prisma migrate status` were MEASURED not to
# notice that an already-applied migration file had been edited: both exited 0
# against a rewritten migration (G-3 criterion 5, run 45263567929). Prisma
# therefore is not a control for tampering with applied history, and the only
# thing that catches it is comparing `_prisma_migrations.checksum` (the SHA-256
# Prisma recorded at apply time) against the file on disk.
#
# That check already existed as `guard.py history`, but it ran only inside the
# V-3 backup/restore drill — a test, not a gate. `npm run db:deploy` went
# straight to `prisma migrate deploy` with no history verification at all.
# This script is that missing gate.
#
# NO SECOND ALGORITHM
# -------------------
# The comparison is delegated to `docs/database/g1-spike/option-c/guard.py
# history`, the authoritative utility, which is shared with the V-3 drill. This
# script only (a) obtains the recorded history, and (b) refuses to continue
# unless that utility passes. Re-implementing SHA-256 comparison here would
# create the second source of truth this project has already been burned by.
#
# FAIL CLOSED
# -----------
# Every "I cannot verify" condition is a refusal, never a pass:
#   · authoritative guard.py missing            → refuse
#   · python3 missing                           → refuse
#   · psql missing (database mode)              → refuse
#   · DATABASE_URL missing (database mode)      → refuse
#   · history query error                       → refuse
#   · guard.py non-zero exit, or crash          → refuse
#   · history table absent on a NON-empty schema→ refuse (inconsistent state)
#
# THE ONE NON-VACUOUS PASS
# ------------------------
# A brand-new database has no `_prisma_migrations` and nothing applied. There is
# then no applied history that could have been edited, so there is nothing to
# protect — but this is DETERMINED, not skipped: the gate requires the public
# schema to contain zero tables. If tables exist while the history table does
# not, the state is inconsistent and the gate refuses. The determination is
# always printed, so it can never be mistaken for a silent skip.
#
# WHAT THIS GATE CANNOT DO
# ------------------------
# It cannot stop a human typing `npx prisma migrate deploy` in a terminal. It
# makes the *repository-controlled* deployment path (`npm run db:deploy`) gated
# and provable; the direct-CLI path remains an unresolved bypass, documented in
# docs/development/database-migrations.md. Do not claim otherwise.
# =====================================================================
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GUARD_PY="$ROOT/docs/database/g1-spike/option-c/guard.py"

# The exact query the V-3 drill uses, so both paths agree on what "applied"
# means: finished, and not rolled back.
HISTORY_SQL="SELECT coalesce(json_agg(row_to_json(t)),'[]'::json)
  FROM (SELECT migration_name, checksum
          FROM _prisma_migrations
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) t;"

HISTORY_TABLE_SQL="SELECT to_regclass('public._prisma_migrations') IS NOT NULL;"
PUBLIC_TABLE_COUNT_SQL="SELECT count(*) FROM pg_tables WHERE schemaname = 'public';"

usage() {
  cat >&2 <<'USAGE'
usage: deploy-gate.sh verify [--history-json FILE] [--migrations-dir DIR]
       deploy-gate.sh deploy [-- PRISMA_ARGS...]

  verify   run the migration-history checksum verification and exit non-zero
           on any problem. --history-json reads a recorded history from a file
           (diagnostics / CI fixtures); otherwise it is read from the database.
  deploy   verify against the DATABASE, then run `prisma migrate deploy`.
           There is deliberately NO file override in this mode. Arguments after
           `--` are forwarded verbatim to `prisma migrate deploy`, so a caller
           needing `--config prisma.config.ts` still deploys THROUGH this gate
           instead of around it.

Environment:
  DIRECT_URL     the direct/session connection (port 5432 on Supabase). Used for
                 verification and deploy when set — the same precedence as
                 prisma.config.ts, so the gate checks the database it deploys to.
  DATABASE_URL   used when DIRECT_URL is not set (CI, local).
USAGE
}

fail() {
  local msg="$1"
  echo "REFUSED: $msg" >&2
  echo "Nothing was deployed." >&2
  exit 1
}

# ---------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------
MODE="${1:-}"
[ -n "$MODE" ] || { usage; exit 2; }
shift || true

HISTORY_JSON=""
MIGRATIONS_DIR="$ROOT/prisma/migrations"
PRISMA_ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --history-json)
      [ "${2:-}" != "" ] || { usage; exit 2; }
      HISTORY_JSON="$2"
      shift 2
      ;;
    --history-json=*)
      HISTORY_JSON="${1#--history-json=}"
      shift
      ;;
    --migrations-dir)
      [ "${2:-}" != "" ] || { usage; exit 2; }
      MIGRATIONS_DIR="$2"
      shift 2
      ;;
    --migrations-dir=*)
      MIGRATIONS_DIR="${1#--migrations-dir=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      PRISMA_ARGS=("$@")
      break
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

case "$MODE" in
  verify|deploy) : ;;
  *) usage; exit 2 ;;
esac

# `deploy` must never accept a caller-supplied history file: that would let a
# caller hand over a fabricated history and pass the gate without a database.
if [ "$MODE" = "deploy" ] && [ -n "$HISTORY_JSON" ]; then
  echo "REFUSED: --history-json is not accepted in deploy mode." >&2
  echo "         Deployment always verifies against the real database." >&2
  exit 2
fi

# ---------------------------------------------------------------------
# Preconditions that must never be skipped
# ---------------------------------------------------------------------
[ -d "$MIGRATIONS_DIR" ] || fail "migrations directory not found: $MIGRATIONS_DIR"
[ -f "$GUARD_PY" ] || fail "authoritative checksum utility missing: ${GUARD_PY#"$ROOT"/}"
command -v python3 >/dev/null 2>&1 || fail "python3 is unavailable, so the checksum utility cannot run"

# ---------------------------------------------------------------------
# Obtain the recorded history
# ---------------------------------------------------------------------
TMPDIR_GATE="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_GATE"' EXIT

if [ -n "$HISTORY_JSON" ]; then
  [ -f "$HISTORY_JSON" ] || fail "history file not found: $HISTORY_JSON"
  cp "$HISTORY_JSON" "$TMPDIR_GATE/history.json"
  echo "history source: file ($HISTORY_JSON)"
else
  # Same precedence as prisma.config.ts (DIRECT_URL ?? DATABASE_URL): the
  # history must be read from the database `prisma migrate deploy` will write.
  GATE_URL="${DIRECT_URL:-${DATABASE_URL:-}}"
  [ -n "$GATE_URL" ] || fail "DATABASE_URL is not set (nor DIRECT_URL), so the applied history cannot be read"
  command -v psql >/dev/null 2>&1 || fail "psql is unavailable, so the applied history cannot be read"

  # --- does the history table exist? ---------------------------------
  local_tables=""
  if ! hist_exists="$(psql "$GATE_URL" -v ON_ERROR_STOP=1 -tAq -c "$HISTORY_TABLE_SQL" 2>"$TMPDIR_GATE/psql.err")"; then
    sed 's/^/    /' "$TMPDIR_GATE/psql.err" >&2 || true
    fail "could not query the database (see the message above)"
  fi
  hist_exists="$(printf '%s' "$hist_exists" | tr -d '[:space:]')"

  if [ "$hist_exists" = "t" ]; then
    if ! psql "$GATE_URL" -v ON_ERROR_STOP=1 -tAq -c "$HISTORY_SQL" > "$TMPDIR_GATE/history.json" 2>"$TMPDIR_GATE/psql.err"; then
      sed 's/^/    /' "$TMPDIR_GATE/psql.err" >&2 || true
      fail "could not read _prisma_migrations"
    fi
    echo "history source: database (_prisma_migrations)"
  else
    # No history table. Only a genuinely empty schema is acceptable, and this is
    # a determination, never a skip.
    if ! local_tables="$(psql "$GATE_URL" -v ON_ERROR_STOP=1 -tAq -c "$PUBLIC_TABLE_COUNT_SQL" 2>"$TMPDIR_GATE/psql.err")"; then
      sed 's/^/    /' "$TMPDIR_GATE/psql.err" >&2 || true
      fail "could not count tables in the public schema"
    fi
    local_tables="$(printf '%s' "$local_tables" | tr -d '[:space:]')"
    if [ "$local_tables" != "0" ]; then
      fail "no _prisma_migrations table, but the public schema has ${local_tables} table(s). This is an inconsistent or tampered database; refusing to deploy over it."
    fi
    echo "history source: NONE — no _prisma_migrations table and the public schema is empty."
    echo "DETERMINED: this is a first deployment to an empty database, so no applied"
    echo "            migration can have been edited. There is nothing to verify."
    echo "            (This is a determination, not a skipped check: a non-empty schema"
    echo "            without a history table is refused above.)"
    SKIP_GUARD=1
  fi
fi

# ---------------------------------------------------------------------
# The authoritative check
# ---------------------------------------------------------------------
SKIP_GUARD="${SKIP_GUARD:-0}"
if [ "$SKIP_GUARD" != "1" ]; then
  echo "verifying applied history against the files on disk…"
  set +e
  guard_out="$(python3 "$GUARD_PY" history "$TMPDIR_GATE/history.json" "$MIGRATIONS_DIR" 2>&1)"
  guard_rc=$?
  set -e

  if [ "$guard_rc" -ne 0 ]; then
    printf '%s\n' "$guard_out" | sed 's/^/    /' >&2
    fail "migration-history checksum verification FAILED (guard.py exit $guard_rc)"
  fi

  printf '%s\n' "$guard_out" | sed 's/^/    /'
  echo "VERIFIED: applied migration history matches the files on disk."
fi

# ---------------------------------------------------------------------
# Deploy (only reachable after a successful verification)
# ---------------------------------------------------------------------
if [ "$MODE" = "deploy" ]; then
  command -v npx >/dev/null 2>&1 || fail "npx is unavailable, so prisma cannot be invoked"
  echo "deploying…"
  if [ "${#PRISMA_ARGS[@]}" -gt 0 ]; then
    exec npx prisma migrate deploy "${PRISMA_ARGS[@]}"
  fi
  exec npx prisma migrate deploy
fi

exit 0
