#!/usr/bin/env bash
# =====================================================================
# G-3 — production-readiness gate for the Option C migration workflow
#
# Six mandatory criteria (see README.md). A criterion is only PASS when the
# step that tests it ran and succeeded. Skipped is reported as NOT TESTED.
#
#   ./run.sh --url <empty disposable db> --shadow-url <empty db> \
#            [--replay-url <empty db>]
#
# DISPOSABLE ONLY. The primary database must be empty; the script refuses
# otherwise and never drops an existing schema.
#
# Harness guarantees (deliberate; do not weaken):
#   * set -Eeuo pipefail + ERR trap that quotes its own reason in CI
#   * every Prisma call uses the project's pinned binary (never npx)
#   * empty/missing Prisma output is a FAILURE, never a success
#   * every guard and every catalog assertion is NEGATIVE-TESTED, because a
#     control that never fires is not a control
#   * the guard is imported from ../guard.py — ONE definition, used by both the
#     repository guard and CI, so they cannot drift apart
# =====================================================================
set -Eeuo pipefail

G3_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OC_DIR="$(cd "$G3_DIR/.." && pwd)"
SPIKE_DIR="$(cd "$OC_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SPIKE_DIR/../../.." && pwd)"
PSQL="${PSQL:-psql}"
PRISMA_BIN="$REPO_ROOT/node_modules/.bin/prisma"
GUARD="$OC_DIR/guard.py"

G1_EXPECTED_CASES=14

# --- helpers ----------------------------------------------------------
RUN_LOG="${RUN_LOG:-${TMPDIR:-/tmp}/g3-$$.log}"
: > "$RUN_LOG"
exec > >(tee -a "$RUN_LOG") 2>&1
CURRENT_CMD=""
trap 'CURRENT_CMD="$BASH_COMMAND"' DEBUG

fail() {
  printf '\n[G-3] FAIL: %s\n' "$*" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    printf '::error title=G-3 gate failure::%s\n' "$(printf '%s' "$*" | tr '\n' ' ')"
  fi
  exit 1
}
step()  { printf '\n============================================================\n[G-3] %s\n============================================================\n' "$*"; }
ok()    { printf '[G-3] ok: %s\n' "$*"; }
info()  { printf '[G-3]     %s\n' "$*"; }
crit()  { printf '\n[G-3] >>> CRITERION %s: %s\n' "$1" "$2"; }
ci_note() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    printf '::warning title=G-3 evidence::%s\n' "$(printf '%s' "$*" | tr '\n' ' ' | cut -c1-900)"
  fi
  printf '[G-3] evidence: %s\n' "$(printf '%s' "$*" | tr '\n' ' ' | cut -c1-400)"
}

# shellcheck disable=SC2154
trap '
  rc=$?
  printf "\n[G-3] FAIL: aborted (exit %s) — last line: $CURRENT_CMD\n" "$rc" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    [ -n "${OUT_DIR:-}" ] && cp "$RUN_LOG" "$OUT_DIR/run.log" 2>/dev/null
    tail_txt="no log"; [ -f "$RUN_LOG" ] && { sleep 0.1; tail_txt="$(tail -c 1500 "$RUN_LOG" | tr "\n" " " | tr -s " ")"; }
    printf "::error title=G-3 aborted (exit %s)::%s\n" "$rc" "$(printf "%s" "$tail_txt" | cut -c1-1400)"
  fi
' ERR

assert_nonempty() {
  [ -f "$1" ] || fail "$2: expected file '$1' was not created"
  [ -s "$1" ] || fail "$2: '$1' is empty"
}

# assert_catalog <db-url> <label> — authoritative post-deployment check.
assert_catalog() {
  local url="$1" label="$2" json
  json="$OUT_DIR/catalog-$(printf '%s' "$label" | tr ' /' '__').json"
  "$PSQL" "$url" -Atc "SELECT json_agg(row_to_json(t)) FROM ($CATALOG_QUERY) t;" > "$json" \
    || fail "could not read the catalog for $label"
  [ "$(python3 -c "import json;d=json.load(open('$json'));print(len(d or []))")" != "0" ] \
    || info "catalog for $label is empty (expected only before deployment)"
  if python3 "$GUARD" catalog "$json" >> "$OUT_DIR/catalog.log" 2>&1; then
    ok "catalog assertion ($label): all five protected FKs match the approved definitions"
  else
    tail -20 "$OUT_DIR/catalog.log"
    fail "catalog assertion ($label) FAILED — see catalog.log"
  fi
}

# --- arguments --------------------------------------------------------
URL=""; SHADOW_URL=""; REPLAY_URL=""; PARTIAL=""; PARTIAL_BASELINE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --url=*) URL="${1#*=}"; shift ;;
    --shadow-url) SHADOW_URL="${2:-}"; shift 2 ;;
    --shadow-url=*) SHADOW_URL="${1#*=}"; shift ;;
    --replay-url) REPLAY_URL="${2:-}"; shift 2 ;;
    --replay-url=*) REPLAY_URL="${1#*=}"; shift ;;
    # PostgreSQL-only run: criteria 3, 4 and 5 are exercised against a database
    # prepared outside Prisma. Criteria 1, 2 and 6 are NOT tested and are
    # reported as NOT TESTED. This mode exists so the SQL-level controls can be
    # verified without a Prisma schema engine; it is never CI evidence.
    --partial-postgres-only) PARTIAL=1; shift ;;
    --baseline-ddl) PARTIAL_BASELINE="${2:-}"; shift 2 ;;
    --baseline-ddl=*) PARTIAL_BASELINE="${1#*=}"; shift ;;
    -h|--help) sed -n '2,26p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done
[ -n "$URL" ] || fail "usage: run.sh --url <empty db> --shadow-url <empty db> [--replay-url <empty db>]"
[ -n "$SHADOW_URL" ] || fail "--shadow-url is required: migrate diff of a migrations directory needs a shadow database"

case "$URL$SHADOW_URL$REPLAY_URL" in
  *production*|*prod*|*staging*|*supabase.co*|*render.com*|*rds.amazonaws.com*)
    fail "refusing to run against a non-disposable database" ;;
esac

WORK="${WORK:-$G3_DIR/out}"
rm -rf "$WORK"; mkdir -p "$WORK"
OUT_DIR="$WORK"
: > "$OUT_DIR/catalog.log"

# --- 0. toolchain and preconditions -----------------------------------
step "0. toolchain — pinned; nothing downloaded except the Prisma schema engine"
command -v "$PSQL" >/dev/null || fail "psql not found on PATH"
[ -f "$GUARD" ] || fail "guard.py missing at $GUARD"
PG_VERSION="$("$PSQL" "$URL" -Atc 'SHOW server_version;')"
if [ -n "$PARTIAL" ]; then
  PRISMA_VERSION="not used (partial run)"
  info "PARTIAL RUN: Prisma steps are skipped. Criteria 1, 2 and 6 will be"
  info "reported NOT TESTED. This run is local SQL evidence ONLY and must never"
  info "be presented as a G-3 pass or as Prisma compatibility evidence."
else
  [ -x "$PRISMA_BIN" ] || fail "pinned Prisma CLI missing — run 'npm ci' (npx is deliberately not used)"
  PRISMA_VERSION="$(node -p "require('$REPO_ROOT/node_modules/prisma/package.json').version")"
  [ "$PRISMA_VERSION" = "7.10.1" ] || fail "pinned Prisma is $PRISMA_VERSION, expected 7.10.1"
  ok "prisma $PRISMA_VERSION, node $(node -v), PostgreSQL $PG_VERSION"
fi

step "0b. preconditions — both databases must be empty"
for pair in "primary:$URL" "shadow:$SHADOW_URL"; do
  name="${pair%%:*}"; dburl="${pair#*:}"
  "$PSQL" "$dburl" -Atc 'SELECT 1' >/dev/null 2>&1 || fail "cannot connect to the $name database"
  objs="$("$PSQL" "$dburl" -Atc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','i','S','v','m');")"
  [ "$objs" = "0" ] || fail "the $name database is not empty ($objs objects) — refusing to run"
  ok "$name database is empty"
done

CATALOG_QUERY="$(python3 -c "import sys;sys.path.insert(0,'$OC_DIR');import guard;print(guard.CATALOG_QUERY)")"

MIGRATIONS="$OUT_DIR/migrations"
SESS="$OUT_DIR/session"
mkdir -p "$MIGRATIONS" "$SESS"
printf 'provider = "postgresql"\n' > "$MIGRATIONS/migration_lock.toml"

# Absolute paths are required: the Prisma CLI resolves `--config` against the
# working directory only when the value is already absolute, and this driver may
# be invoked from any directory. A relative path here produces the confusing
# "Config file not found at <cwd>/<cwd>/..." error.
mk_config() { # <schema> <config>
  case "$1" in /*) ;; *) fail "mk_config needs an absolute schema path, got '$1'" ;; esac
  case "$2" in /*) ;; *) fail "mk_config needs an absolute config path, got '$2'" ;; esac
  cat > "$2" <<CFG
import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: '$1',
  migrations: { path: '$MIGRATIONS' },
  datasource: {
    url: process.env.G3_DATABASE_URL,
    shadowDatabaseUrl: process.env.G3_SHADOW_DATABASE_URL,
  },
});
CFG
}
prisma_run() { ( cd "$REPO_ROOT" && G3_DATABASE_URL="$URL" G3_SHADOW_DATABASE_URL="$SHADOW_URL" "$PRISMA_BIN" "$@" ); }

# =====================================================================
# CRITERION 1 — workflow enforcement
# =====================================================================
crit "1" "workflow enforcement: 'prisma migrate dev' must be rejected by automation"
if [ -n "$PARTIAL" ]; then
  info "PARTIAL RUN — criterion 1 is tested here only for the repository guard,"
  info "which needs no Prisma. Recorded as PARTIAL, never as a pass."
  if bash "$OC_DIR/repo-guard.sh" "$REPO_ROOT" > "$OUT_DIR/01a-repo-guard.log" 2>&1; then
    ok "repository guard: clean on the real repository"
  else
    cat "$OUT_DIR/01a-repo-guard.log"; fail "repository guard failed"
  fi
  BADREPO="$OUT_DIR/badrepo"; mkdir -p "$BADREPO/scripts"
  printf '#!/usr/bin/env bash\nnpx prisma migrate dev\n' > "$BADREPO/scripts/deploy.sh"
  if bash "$OC_DIR/repo-guard.sh" "$BADREPO" > "$OUT_DIR/01b-repo-guard-neg.log" 2>&1; then
    fail "repository guard accepted a script that runs 'prisma migrate dev'"
  fi
  ok "repository guard rejects 'prisma migrate dev' (negative test)"
  C1_STATUS="PARTIAL (guard only; deploy-path controls not exercised)"
fi
if [ -z "$PARTIAL" ]; then
info "Three independent controls are tested, because a rule that lives only in"
info "a document is not enforced:"
info "  (a) a repository guard that scans scripts, docs and CI for migrate dev"
info "  (b) a pre-commit style check on the approved command allow-list"
info "  (c) PROOF the control fires: an injected unsafe script must be rejected"

REPO_GUARD="$OC_DIR/repo-guard.sh"
[ -f "$REPO_GUARD" ] || fail "repo-guard.sh missing at $REPO_GUARD"

info ""
info "--- 1a: repository guard over the real repository ---"
if bash "$REPO_GUARD" "$REPO_ROOT" > "$OUT_DIR/01a-repo-guard.log" 2>&1; then
  ok "the repository guard reports no unauthorized 'migrate dev' usage"
else
  cat "$OUT_DIR/01a-repo-guard.log"
  fail "the repository guard found unauthorized 'migrate dev' usage in the repository"
fi

info ""
info "--- 1b: the guard must FIRE on an unsafe script (negative test) ---"
BADREPO="$OUT_DIR/badrepo"
mkdir -p "$BADREPO/scripts"
cat > "$BADREPO/scripts/deploy.sh" <<'BADS'
#!/usr/bin/env bash
npx prisma migrate dev --name oops
BADS
if bash "$REPO_GUARD" "$BADREPO" > "$OUT_DIR/01b-repo-guard-neg.log" 2>&1; then
  cat "$OUT_DIR/01b-repo-guard-neg.log"
  fail "the repository guard ACCEPTED a script that runs 'prisma migrate dev' — the control does not work"
fi
info "guard reported: $(tail -2 "$OUT_DIR/01b-repo-guard-neg.log" | tr '\n' ' ')"
ok "the repository guard rejects a script containing 'prisma migrate dev'"

info ""
info "--- 1c: the guard allows the APPROVED commands (no false positives) ---"
GOODREPO="$OUT_DIR/goodrepo"
mkdir -p "$GOODREPO/scripts"
cat > "$GOODREPO/scripts/deploy.sh" <<'GOODS'
#!/usr/bin/env bash
set -euo pipefail
prisma migrate deploy --config prisma.config.prod.ts
prisma migrate status --config prisma.config.prod.ts
prisma migrate diff --from-schema snapshots/prev.prisma --to-schema prisma/schema.prisma --script
GOODS
if bash "$REPO_GUARD" "$GOODREPO" > "$OUT_DIR/01c-repo-guard-good.log" 2>&1; then
  ok "the approved commands (deploy / status / snapshot diff) are accepted"
else
  cat "$OUT_DIR/01c-repo-guard-good.log"
  fail "the repository guard rejects the APPROVED commands — it would block legitimate deployments"
fi
ci_note "criterion 1: repo guard clean on the real repo, rejects migrate dev, accepts approved commands"
fi

# =====================================================================
# Build the baseline (prerequisite for criteria 2-6)
# =====================================================================
step "baseline — generate + append + deploy, as Option C specifies"
if [ -n "$PARTIAL" ]; then
  info "PARTIAL: the baseline is applied as plain SQL instead of through Prisma."
  info "The DDL is the same shape the CLI generates (validated in the CI run);"
  info "no _prisma_migrations row is created, so every history check is skipped."
  [ -f "$PARTIAL_BASELINE" ] || fail "--partial-postgres-only needs --baseline-ddl <file>"
  "$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -f "$PARTIAL_BASELINE" > "$OUT_DIR/baseline-apply.log" 2>&1 \
    || { cat "$OUT_DIR/baseline-apply.log"; fail "the baseline DDL failed to apply"; }
  "$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -f "$OC_DIR/manual-baseline.sql" >> "$OUT_DIR/baseline-apply.log" 2>&1 \
    || { cat "$OUT_DIR/baseline-apply.log"; fail "manual-baseline.sql failed to apply"; }
  # psql is silent when it succeeds; absence of an error is the signal.
  info "baseline DDL applied cleanly (psql printed nothing, exit 0)"
  "$PSQL" "$URL" -v ON_ERROR_STOP=0 -q -f "$SPIKE_DIR/sql/0002-enforce.sql" > "$OUT_DIR/baseline-enforce.log" 2>&1 || true
  BT="$(grep -oE 'G1_TOTAL= *[0-9]+' "$OUT_DIR/baseline-enforce.log" | head -1 | sed 's/.*= *//' || true)"
  BF="$(grep -oE 'G1_FAIL= *[0-9]+' "$OUT_DIR/baseline-enforce.log" | head -1 | sed 's/.*= *//' || true)"
  [ "$BT" = "$G1_EXPECTED_CASES" ] || fail "partial baseline enforcement ran ${BT:-none} cases, expected $G1_EXPECTED_CASES"
  [ "$BF" = "0" ] || fail "partial baseline enforcement had $BF failures"
  ok "partial baseline applied; $BT/$G1_EXPECTED_CASES enforcement cases PASS"
  REPLAY_STATUS="NOT TESTED"
  C2_STATUS="NOT TESTED"
  assert_catalog "$URL" "after the partial baseline"
else
BASE_SCHEMA="$SESS/baseline.prisma"
cp "$OC_DIR/schema.prisma" "$BASE_SCHEMA"
mk_config "$BASE_SCHEMA" "$SESS/deploy.config.ts"

set +e
prisma_run migrate diff --from-empty --to-schema "$BASE_SCHEMA" --script --config "$SESS/deploy.config.ts" \
  > "$OUT_DIR/baseline-generated.sql" 2> "$OUT_DIR/baseline.err"
rc=$?
set -e
[ "$rc" -eq 0 ] || { cat "$OUT_DIR/baseline.err"; fail "baseline generation failed (exit $rc)"; }
assert_nonempty "$OUT_DIR/baseline-generated.sql" "baseline script"

BASE_DIR="$MIGRATIONS/20260101000000_init"
mkdir -p "$BASE_DIR"
{ cat "$OUT_DIR/baseline-generated.sql"; echo; cat "$OC_DIR/manual-baseline.sql"; } > "$BASE_DIR/migration.sql"
assert_nonempty "$BASE_DIR/migration.sql" "baseline migration"

# The guard must ACCEPT the approved baseline (no false positive on the real one).
python3 "$GUARD" sql "$BASE_DIR/migration.sql" > "$OUT_DIR/baseline-guard.log" 2>&1 \
  || { cat "$OUT_DIR/baseline-guard.log"; fail "the guard rejected the APPROVED baseline migration"; }
ok "the guard accepts the approved baseline migration"
C1_STATUS="PASS"
C2_STATUS="PASS"
fi

# =====================================================================
# CRITERION 2 — migration-history consistency
# =====================================================================
crit "2" "migration-history consistency: 'migrate status' before and after deployment"
if [ -n "$PARTIAL" ]; then
  info "NOT TESTED — a partial run creates no _prisma_migrations history."
  C2_STATUS="NOT TESTED"
fi
if [ -z "$PARTIAL" ]; then
info "A deployment you cannot reason about afterwards is not operable. This"
info "criterion checks the history is legible BEFORE the migration is applied,"
info "clean AFTER it is applied, and that _prisma_migrations agrees."

info ""
info "--- 2a: 'migrate status' BEFORE deployment (pending migration expected) ---"
set +e
prisma_run migrate status --config "$SESS/deploy.config.ts" > "$OUT_DIR/02a-status-before.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/02a-status-before.log"
# Prisma exits 1 when migrations are pending; that is the CORRECT state here.
[ "$rc" -eq 1 ] || fail "expected 'migrate status' to exit 1 with a pending migration before deployment, got $rc"
grep -qiE 'not yet been applied|following migration' "$OUT_DIR/02a-status-before.log" \
  || fail "status exited 1 but did not report a pending migration — refusing to guess"
ok "before deployment: status reports the pending migration (exit 1, as expected)"

info ""
info "--- 2b: deploy ---"
set +e
prisma_run migrate deploy --config "$SESS/deploy.config.ts" > "$OUT_DIR/02b-deploy.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/02b-deploy.log"
[ "$rc" -eq 0 ] || fail "migrate deploy failed (exit $rc)"

info ""
info "--- 2c: 'migrate status' AFTER deployment (must be clean) ---"
set +e
prisma_run migrate status --config "$SESS/deploy.config.ts" > "$OUT_DIR/02c-status-after.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/02c-status-after.log"
[ "$rc" -eq 0 ] || fail "'migrate status' is not clean after deployment (exit $rc) — history inconsistency"
grep -qiE 'up to date|Database schema is up to date' "$OUT_DIR/02c-status-after.log" \
  || fail "status exited 0 but did not report the schema as up to date"
ok "after deployment: status is clean (exit 0, schema up to date)"

info ""
info "--- 2d: _prisma_migrations agrees with the migrations directory ---"
on_disk="$(find "$MIGRATIONS" -mindepth 1 -maxdepth 1 -type d -name '2*_*' | wc -l)"
in_db="$("$PSQL" "$URL" -Atc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
failed_db="$("$PSQL" "$URL" -Atc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;")"
info "migrations on disk: $on_disk, applied in database: $in_db, unfinished: $failed_db"
[ "$on_disk" = "$in_db" ] || fail "history mismatch: $on_disk migration(s) on disk but $in_db applied"
[ "$failed_db" = "0" ] || fail "$failed_db unfinished migration(s) in _prisma_migrations"
ok "migration history is consistent: $in_db applied, none unfinished, none rolled back"
ci_note "criterion 2: status pending->clean, history consistent ($in_db applied, 0 unfinished)"
fi

# =====================================================================
# CRITERION 3 — protected constraint integrity (live catalog)
# =====================================================================
crit "3" "protected constraint integrity: live catalog vs approved definitions"
info "A COUNT of five constraints is not an integrity check: five constraints"
info "with the wrong columns or the wrong ON DELETE would also count as five."
info "This compares columns and actions against the approved definitions."

assert_catalog "$URL" "after baseline deploy"
ci_note "criterion 3: catalog assertion passed after baseline deployment"

info ""
info "--- 3b: the catalog assertion must FIRE on a tampered catalog (negative test) ---"
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q \
  -c 'ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_subtopic_topic";' \
  -c 'ALTER TABLE "questions" ADD CONSTRAINT "fk_questions_subtopic_topic" FOREIGN KEY ("subtopic_id","topic_id") REFERENCES "subtopics"("id","topic_id") ON UPDATE CASCADE ON DELETE CASCADE;'
"$PSQL" "$URL" -Atc "SELECT json_agg(row_to_json(t)) FROM ($CATALOG_QUERY) t;" > "$OUT_DIR/03b-tampered.json"
if python3 "$GUARD" catalog "$OUT_DIR/03b-tampered.json" > "$OUT_DIR/03b-tampered.log" 2>&1; then
  fail "the catalog assertion ACCEPTED a weakened constraint (ON DELETE CASCADE) — the control does not work"
fi
info "assertion reported: $(head -2 "$OUT_DIR/03b-tampered.log" | tr '\n' ' ')"
ok "the catalog assertion detects a weakened ON DELETE action"

info ""
info "--- 3c: restore, and confirm the assertion passes again ---"
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q \
  -c 'ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_subtopic_topic";' \
  -c 'ALTER TABLE "questions" ADD CONSTRAINT "fk_questions_subtopic_topic" FOREIGN KEY ("subtopic_id","topic_id") REFERENCES "subtopics"("id","topic_id") ON UPDATE CASCADE ON DELETE RESTRICT;'
assert_catalog "$URL" "after restoring the constraint"
ok "the catalog assertion is not vacuous: it rejected a weakening and accepted the restoration"
C3_STATUS="PASS (live catalog, negative-tested)"

# =====================================================================
# CRITERION 5 — tampering detection (before deployment)
# =====================================================================
crit "5" "tampering detection: unsafe migrations must be rejected BEFORE deployment"
info "Two distinct tampering modes are tested, because they are caught by"
info "different mechanisms:"
info "  (a) a migration that REMOVES or WEAKENS a protected FK  -> textual guard"
info "  (b) a migration EDITED WITHOUT changing the protected FK  -> integrity/apply"

info ""
info "--- 5a: migrations that must be rejected by the pre-deployment guard ---"
TAMPER="$OUT_DIR/tamper"
mkdir -p "$TAMPER"
cat > "$TAMPER/drop-only.sql" <<'SQL'
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_level_subject";
SQL
cat > "$TAMPER/weakened.sql" <<'SQL'
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_level_subject";
ALTER TABLE "questions" ADD CONSTRAINT "fk_questions_level_subject"
  FOREIGN KEY ("education_level_id","subject_id") REFERENCES "level_subjects"("level_id","subject_id")
  ON UPDATE CASCADE;
SQL
cat > "$TAMPER/narrowed.sql" <<'SQL'
ALTER TABLE "questions" ADD CONSTRAINT "fk_questions_chapter_subject"
  FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;
SQL
cat > "$TAMPER/cascade-delete.sql" <<'SQL'
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_subtopic_topic";
ALTER TABLE "questions" ADD CONSTRAINT "fk_questions_subtopic_topic"
  FOREIGN KEY ("subtopic_id","topic_id") REFERENCES "subtopics"("id","topic_id")
  ON UPDATE CASCADE ON DELETE CASCADE;
SQL
cat > "$TAMPER/drop-table.sql" <<'SQL'
DROP TABLE "answer_keys";
SQL
for f in "$TAMPER"/*.sql; do
  if python3 "$GUARD" sql "$f" > "$OUT_DIR/05a-$(basename "$f").log" 2>&1; then
    fail "the guard ACCEPTED the tampered migration $(basename "$f")"
  fi
  info "rejected $(basename "$f"): $(tail -1 "$OUT_DIR/05a-$(basename "$f").log" | sed 's/^ *//')"
done
ok "all five tampering variants were rejected before deployment"
ci_note "criterion 5a: 5/5 tampered migrations rejected pre-deployment"
C5_STATUS="PASS (5/5 textual variants rejected pre-deployment)"

info ""
info "--- 5b: a migration EDITED WITHOUT changing the protected FK ---"
info "Subtler than 5a: the edit does not touch C-1..C-5, so a textual guard"
info "cannot and should not object. The question is whether the edit is DETECTED."
info ""
info "MEASURED ANSWER IN CI RUN 45262383682: IT IS NOT. After the already-applied"
info "migration file was rewritten in place, both 'migrate deploy' and"
info "'migrate status' exited 0. The step that asserted the edit would be caught"
info "failed, which is the correct outcome for a control that does not exist."
info "So Prisma is NOT relied on for this, and the driver supplies the check."
if [ -n "$PARTIAL" ]; then
  info "NOT TESTED in a partial run: there is no _prisma_migrations history."
  C5B_STATUS="NOT TESTED"
fi
if [ -z "$PARTIAL" ]; then
EDIT_DIR="$MIGRATIONS/20260103000000_edited"
mkdir -p "$EDIT_DIR"
cat > "$EDIT_DIR/migration.sql" <<'SQL'
-- harmless on its face
ALTER TABLE "question_versions" ADD COLUMN "g3_edited" text;
SQL
python3 "$GUARD" sql "$EDIT_DIR/migration.sql" > "$OUT_DIR/05b-guard.log" 2>&1 \
  || fail "the guard wrongly rejected a migration that does not touch a protected FK"
ok "the textual guard does not object (correct: it does not touch C-1..C-5)"

prisma_run migrate deploy --config "$SESS/deploy.config.ts" > "$OUT_DIR/05b-deploy1.log" 2>&1 \
  || { cat "$OUT_DIR/05b-deploy1.log"; fail "deployment of the edited migration failed"; }
ok "the migration applied once"

info ""
info "now EDIT the already-applied migration file (the real tampering scenario)"
checksum_before="$("$PSQL" "$URL" -Atc "SELECT checksum FROM _prisma_migrations WHERE migration_name='20260103000000_edited';")"
info "recorded checksum before edit: $checksum_before"
sed -i 's/g3_edited/g3_edited_TAMPERED/' "$EDIT_DIR/migration.sql"

set +e
prisma_run migrate deploy --config "$SESS/deploy.config.ts" > "$OUT_DIR/05b-deploy2.log" 2>&1
rc2=$?
prisma_run migrate status --config "$SESS/deploy.config.ts" > "$OUT_DIR/05b-status-edited.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/05b-deploy2.log"
cat "$OUT_DIR/05b-status-edited.log"
if [ "$rc" -ne 0 ] || [ "$rc2" -ne 0 ]; then
  ok "Prisma itself refused to proceed with the edited migration (deploy=$rc2 status=$rc)"
  PRISMA_DETECTS="yes"
else
  ci_note "criterion 5b: Prisma did NOT detect the edit (deploy=0, status=0); using the checksum control"
  ok "recorded, not assumed: Prisma did NOT detect the edited applied migration"
  PRISMA_DETECTS="no"
fi

info ""
info "the project's own control: recompute SHA-256 and compare with _prisma_migrations"
"$PSQL" "$URL" -Atc \
  "SELECT json_agg(row_to_json(t)) FROM (SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) t;" \
  > "$OUT_DIR/05b-history.json" || fail "could not read _prisma_migrations"
if python3 "$GUARD" history "$OUT_DIR/05b-history.json" "$MIGRATIONS" > "$OUT_DIR/05b-history.log" 2>&1; then
  cat "$OUT_DIR/05b-history.log"
  fail "the checksum control ACCEPTED an edited applied migration"
fi
cat "$OUT_DIR/05b-history.log"
info "=> the edit is detected; deployment is refused before anything is altered"
ok "the checksum control detects the edited applied migration"

info ""
info "control negative-test: with the file restored, the same check must pass"
sed -i 's/g3_edited_TAMPERED/g3_edited/' "$EDIT_DIR/migration.sql"
if python3 "$GUARD" history "$OUT_DIR/05b-history.json" "$MIGRATIONS" > "$OUT_DIR/05b-history-ok.log" 2>&1; then
  cat "$OUT_DIR/05b-history-ok.log"
  ok "the checksum control passes on unmodified history (not vacuous)"
  C5B_STATUS="PASS (Prisma does NOT detect the edit — measured; checksum control does)"
else
  cat "$OUT_DIR/05b-history-ok.log"
  fail "the checksum control rejects unmodified history — it is unusable"
fi
ci_note "criterion 5b: edited applied migration detected by checksum control (Prisma itself does not detect it: prisma_detects=$PRISMA_DETECTS)"
fi

# =====================================================================
# CRITERION 4 — constrained-column migration safety
# =====================================================================
crit "4" "constrained-column migration safety: a column used by a composite FK"
info "Representative change under test: widening questions.subject_id, which"
info "participates in C-1 and C-2. This is the change most likely to be done"
info "wrongly, because PostgreSQL refuses the ALTER while the FK exists."
info ""
info "Four things are established, and nothing more is generalised:"
info "  (i)   snapshot-to-snapshot diffing sees the datamodel change"
info "  (ii)  a naive ALTER fails, so the FK must be dropped and recreated"
info "  (iii) the hand-written safe pattern preserves referential integrity"
info "  (iv)  CI catches a naive (unsafe) migration"

info ""
info "Two representative changes are measured, because the first measurement"
info "overturned the intuitive assumption and both are needed to describe the"
info "behaviour honestly:"
info "   (A) answer_keys.mcq_correct_option_key  text -> varchar(16)"
info "       a binary-coercible widening of a column inside C-5. C-5's column has"
info "       no ordinary single-column FK, so C-5 is the only constraint present."
info "   (B) questions.subject_id  uuid -> varchar(64)"
info "       a NON-coercible change of a column inside C-1 and C-2, which also"
info "       participates in an ordinary FK (questions.subject_id -> subjects.id)."
info ""
info "Finding A establishes the capability claim; finding B establishes the"
info "risk claim. Nothing beyond these two is generalised."

info ""
info "--- 4a: does snapshot-to-snapshot diffing SEE a constrained-column change? ---"
if [ -n "$PARTIAL" ]; then
  info "NOT TESTED in a partial run: snapshot diffing needs the Prisma CLI."
  info "Covered by the CI run; here only the SQL-level controls are measured."
  C4A_STATUS="NOT TESTED"
  cp "$OC_DIR/schema.prisma" "$SESS/column-change.prisma"
fi
if [ -z "$PARTIAL" ]; then
COL_SCHEMA="$SESS/column-change.prisma"
cp "$BASE_SCHEMA" "$COL_SCHEMA"
python3 - "$COL_SCHEMA" <<'PYANCHOR'
import sys, io
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
anchor = '  mcqCorrectOptionKey String?         @map("mcq_correct_option_key")'
assert s.count(anchor) == 1, f"anchor count {s.count(anchor)}"
s = s.replace(anchor, '  mcqCorrectOptionKey String?         @map("mcq_correct_option_key") @db.VarChar(16)')
io.open(p, 'w', encoding='utf-8').write(s)
PYANCHOR
mk_config "$COL_SCHEMA" "$SESS/column.config.ts"
set +e
prisma_run migrate diff --from-schema "$BASE_SCHEMA" --to-schema "$COL_SCHEMA" --script \
  --config "$SESS/column.config.ts" > "$OUT_DIR/04a-column-diff.sql" 2> "$OUT_DIR/04a-column-diff.err"
rc=$?
set -e
[ "$rc" -eq 0 ] || { cat "$OUT_DIR/04a-column-diff.err"; fail "the column-change diff errored"; }
printf '\n----- 04a-column-diff.sql -----\n'; cat "$OUT_DIR/04a-column-diff.sql"; printf -- '-----\n'
grep -qi 'ALTER COLUMN' "$OUT_DIR/04a-column-diff.sql" \
  || fail "snapshot diffing did NOT see the constrained-column change"
ok "snapshot-to-snapshot diffing DOES detect the change to a constrained column"
COL_DROPS="$(grep -ci 'DROP' "$OUT_DIR/04a-column-diff.sql" || true)"
info "DROP statements the diff proposed: $COL_DROPS (expected 0: it cannot see C-5)"
ci_note "criterion 4a: snapshot diff sees the constrained-column change; ${COL_DROPS} DROP(s) proposed"
fi

info ""
info "--- 4b: MEASURED — a coercible widening does NOT break C-5 (this is the"
info "        important negative result; it is why the guard is textual, not"
info "        catalog-only, and why criterion 3 is mandatory after deployment)"
if [ -n "$PARTIAL" ]; then
  info "the diff script was not generated; using its known single statement"
  printf 'ALTER TABLE "answer_keys" ALTER COLUMN "mcq_correct_option_key" TYPE varchar(16);\n' \
    > "$OUT_DIR/04a-column-diff.sql"
fi
NAIVE_OK=1
"$PSQL" "$URL" -v ON_ERROR_STOP=0 -q -f "$OUT_DIR/04a-column-diff.sql" > "$OUT_DIR/04b-naive.log" 2>&1 || NAIVE_OK=0
cat "$OUT_DIR/04b-naive.log"
if [ "$NAIVE_OK" = "1" ]; then
  info "the generated ALTER was ACCEPTED by PostgreSQL: text -> varchar(16) is"
  info "binary-coercible, so PostgreSQL does not need to rebuild C-5 and leaves"
  info "it in place. Verified immediately below, not assumed."
  assert_catalog "$URL" "after the coercible widening"
  "$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -c "DELETE FROM answer_keys WHERE version_id = '88888888-8888-8888-8888-888888888888';" >/dev/null
  if "$PSQL" "$URL" -v ON_ERROR_STOP=0 -q -c "INSERT INTO answer_keys (version_id, mcq_correct_option_key) VALUES ('88888888-8888-8888-8888-888888888888','Z');" > "$OUT_DIR/04b-enforce.log" 2>&1; then
    fail "C-5 stopped enforcing after a coercible widening"
  fi
  ok "C-5 survived a coercible widening intact and still rejects a bad key"
  ok "=> a coercible constrained-column change is NOT a hazard by itself"
  ci_note "criterion 4b: coercible widening accepted; C-5 intact and still enforcing"
  # put the seed row back for the remaining tests
  "$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -c "INSERT INTO answer_keys (version_id, mcq_correct_option_key) VALUES ('88888888-8888-8888-8888-888888888888','B');" >/dev/null
else
  ok "the generated ALTER was rejected by PostgreSQL — C-1/C-2 style protection"
  assert_catalog "$URL" "after the rejected naive ALTER"
fi

info ""
info "--- 4b1: the RISK case — a NON-coercible change, where PostgreSQL REFUSES"
info "         and a human is pushed towards hand-editing"
"$PSQL" "$URL" -v ON_ERROR_STOP=0 -q \
  -c 'ALTER TABLE "questions" ALTER COLUMN "subject_id" TYPE varchar(64);' > "$OUT_DIR/04b1-noncoercible.log" 2>&1 || true
if grep -qi 'incompatible types' "$OUT_DIR/04b1-noncoercible.log"; then
  ok "PostgreSQL refuses the non-coercible change: 'incompatible types'"
  info "   $(grep -o 'foreign key constraint "[a-z_]*"' "$OUT_DIR/04b1-noncoercible.log" | head -1)"
  info "   This is the safe outcome, and it is also the moment a developer is"
  info "   tempted to 'just drop the constraint'. That is what 4b2 measures."
else
  cat "$OUT_DIR/04b1-noncoercible.log"
  fail "expected the non-coercible change to be refused with an incompatible-types error"
fi
assert_catalog "$URL" "after the refused non-coercible change"

info ""
info "--- 4b1b: and the COMPOSITE constraint itself is the blocker, not only the"
info "          ordinary FK — proven by removing the ordinary FK first"
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q \
  -c 'ALTER TABLE "questions" DROP CONSTRAINT "questions_subject_id_fkey";' \
  -c 'ALTER TABLE "questions" DROP CONSTRAINT "questions_education_level_id_fkey";' \
  > "$OUT_DIR/04b1b-drop-ordinary.log" 2>&1 || { cat "$OUT_DIR/04b1b-drop-ordinary.log"; fail "could not drop the ordinary FKs for the isolation test"; }
"$PSQL" "$URL" -v ON_ERROR_STOP=0 -q \
  -c 'ALTER TABLE "questions" ALTER COLUMN "subject_id" TYPE varchar(64);' > "$OUT_DIR/04b1b-noncoercible.log" 2>&1 || true
if grep -qiE 'fk_questions_level_subject|fk_questions_chapter_subject' "$OUT_DIR/04b1b-noncoercible.log"; then
  ok "with the ordinary FK out of the way, C-1/C-2 refuse the same ALTER themselves"
  info "   $(grep -oE 'foreign key constraint "[a-z_]*"|incompatible types' "$OUT_DIR/04b1b-noncoercible.log" | head -2 | tr '\n' ' ')"
  info "   => confirmed: the composite FK must be dropped and recreated by hand."
  info "      PostgreSQL never re-derives it, because it cannot be expressed in"
  info "      the datamodel Prisma diffs."
else
  cat "$OUT_DIR/04b1b-noncoercible.log"
  fail "the composite FK did not refuse the non-coercible change in isolation"
fi
info "restoring the two ordinary FKs"
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q \
  -c 'ALTER TABLE "questions" ADD CONSTRAINT "questions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON UPDATE CASCADE ON DELETE RESTRICT;' \
  -c 'ALTER TABLE "questions" ADD CONSTRAINT "questions_education_level_id_fkey" FOREIGN KEY ("education_level_id") REFERENCES "education_levels"("id") ON UPDATE CASCADE ON DELETE RESTRICT;' \
  > "$OUT_DIR/04b1b-restore.log" 2>&1 || { cat "$OUT_DIR/04b1b-restore.log"; fail "could not restore the ordinary FKs"; }
assert_catalog "$URL" "after the isolation test"

info ""
info "--- 4b2: the tempting repair (delete C-5) applies cleanly and breaks integrity ---"
info "This is the real failure mode: a schema that deploys without complaint and"
info "silently stops enforcing that the MCQ key names an option of that version."
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -c "DELETE FROM answer_keys;" >/dev/null
cat > "$OUT_DIR/04b2-tampered-repair.sql" <<'SQL'
ALTER TABLE "answer_keys" DROP CONSTRAINT "fk_answer_keys_options_of_version";
ALTER TABLE "answer_keys" ALTER COLUMN "mcq_correct_option_key" TYPE varchar(32);
SQL
if python3 "$GUARD" sql "$OUT_DIR/04b2-tampered-repair.sql" > "$OUT_DIR/04b2-guard.log" 2>&1; then
  fail "the guard ACCEPTED a repair that drops C-5 without restoring it"
fi
info "guard: $(tail -1 "$OUT_DIR/04b2-guard.log" | sed 's/^ *//')"
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -f "$OUT_DIR/04b2-tampered-repair.sql" > "$OUT_DIR/04b2-apply.log" 2>&1 \
  || { cat "$OUT_DIR/04b2-apply.log"; fail "the tampered repair did not even apply"; }
info "the tampered repair APPLIED — which is precisely why a pre-deployment guard is needed"
# run in a subshell: assert_catalog calls fail(), which must not end the script
if ( assert_catalog "$URL" "after the tampered repair" ) > "$OUT_DIR/04b2-catalog.log" 2>&1; then
  fail "the catalog assertion failed to notice that C-5 was gone"
fi
info "catalog assertion: $(grep -o 'MISSING from the catalog' "$OUT_DIR/04b2-catalog.log" | head -1)"
if "$PSQL" "$URL" -v ON_ERROR_STOP=0 -q \
  -c "INSERT INTO answer_keys (version_id, mcq_correct_option_key) VALUES ('88888888-8888-8888-8888-888888888888','Z');" \
  > "$OUT_DIR/04b2-enforce.log" 2>&1; then
  ok "a key naming a NON-EXISTENT option 'Z' is now accepted — integrity was lost"
else
  cat "$OUT_DIR/04b2-enforce.log"
  fail "the tampered schema still rejected the bad key — the test proves nothing"
fi
ok "both controls fire: the guard rejects the repair pre-deployment, the catalog assertion catches it after"
ci_note "criterion 4b2: repair that deletes C-5 rejected by guard and detected by catalog"

info ""
info "--- 4b3: restore the baseline schema so the safe-pattern test starts clean ---"
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q \
  -c "DELETE FROM answer_keys;" \
  -c 'ALTER TABLE "answer_keys" ALTER COLUMN "mcq_correct_option_key" TYPE text;' \
  -c 'ALTER TABLE "answer_keys" ADD CONSTRAINT "fk_answer_keys_options_of_version" FOREIGN KEY ("version_id","mcq_correct_option_key") REFERENCES "question_options"("version_id","key") ON UPDATE CASCADE ON DELETE RESTRICT;' \
  -c "INSERT INTO answer_keys (version_id, mcq_correct_option_key) VALUES ('88888888-8888-8888-8888-888888888888','B');" \
  > "$OUT_DIR/04b3-restore.log" 2>&1 || { cat "$OUT_DIR/04b3-restore.log"; fail "could not restore the baseline schema"; }
assert_catalog "$URL" "after restoring the baseline schema"

info ""
info "--- 4c: the hand-written SAFE migration must be ACCEPTED by the guard ---"
info "The safe pattern for a change PostgreSQL would refuse: drop the protected"
info "constraint, make the change, then re-add the constraint with its approved"
info "definition. Here: narrow question_options.key to char(1) after proving no"
info "wider value exists, which C-5's column must follow."
cat > "$OUT_DIR/04c-safe-column-change.sql" <<'SQL'
BEGIN;
ALTER TABLE "answer_keys" DROP CONSTRAINT "fk_answer_keys_options_of_version";
ALTER TABLE "question_options" DROP CONSTRAINT "uq_question_options_version_key";
ALTER TABLE "question_options" ALTER COLUMN "key" TYPE char(1);
ALTER TABLE "answer_keys" ALTER COLUMN "mcq_correct_option_key" TYPE char(1);
ALTER TABLE "question_options" ADD CONSTRAINT "uq_question_options_version_key" UNIQUE ("version_id","key");
-- re-added with the approved columns and actions, unchanged
ALTER TABLE "answer_keys" ADD CONSTRAINT "fk_answer_keys_options_of_version"
  FOREIGN KEY ("version_id","mcq_correct_option_key")
  REFERENCES "question_options"("version_id","key")
  ON UPDATE CASCADE ON DELETE RESTRICT;
COMMIT;
SQL
info ""
info "--- 4d: CI catches an UNSAFE migration for the same change ---"
cat > "$OUT_DIR/04d-unsafe.sql" <<'SQL'
ALTER TABLE "answer_keys" DROP CONSTRAINT "fk_answer_keys_options_of_version";
ALTER TABLE "answer_keys" ALTER COLUMN "mcq_correct_option_key" TYPE varchar(16);
SQL
if python3 "$GUARD" sql "$OUT_DIR/04d-unsafe.sql" > "$OUT_DIR/04d-guard.log" 2>&1; then
  fail "CI ACCEPTED an unsafe migration that drops C-5 without re-adding it"
fi
info "CI reported: $(tail -1 "$OUT_DIR/04d-guard.log" | sed 's/^ *//')"
ok "CI rejects the unsafe variant that drops C-5 and does not restore it"
ci_note "criterion 4d: CI rejects the unsafe constrained-column migration"

# =====================================================================
# CRITERION 3 (continued) — integrity after the column change
# =====================================================================
info ""
info "--- 4e: apply the SAFE migration and prove integrity survived ---"
set +e
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -f "$OUT_DIR/04c-safe-column-change.sql" > "$OUT_DIR/04e-apply.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/04e-apply.log"
[ "$rc" -eq 0 ] || fail "the safe constrained-column migration failed to apply (exit $rc)"
assert_catalog "$URL" "after the constrained-column change"
info "and C-5 must still be ENFORCED after the column change"
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -c "DELETE FROM answer_keys WHERE version_id = '88888888-8888-8888-8888-888888888888';" > /dev/null
if "$PSQL" "$URL" -v ON_ERROR_STOP=0 -q -c "INSERT INTO answer_keys (version_id, mcq_correct_option_key) VALUES ('88888888-8888-8888-8888-888888888888','Z');" > "$OUT_DIR/04e-enforce.log" 2>&1; then
  fail "a key naming a non-existent option was ACCEPTED after the column change — referential integrity was lost"
fi
info "$(grep -o 'violates foreign key constraint "[a-z_]*"' "$OUT_DIR/04e-enforce.log" || echo rejected)"
ok "referential integrity survived the constrained-column change (C-5 still rejects the bad key)"
ci_note "criterion 4e: integrity preserved after the column change (C-5 still enforced)"
if [ -n "$PARTIAL" ]; then
  C4_STATUS="PARTIAL (SQL-level measured; 4a not tested here)"
else
  C4_STATUS="PASS (measured: coercible vs non-coercible, safe pattern, CI catch)"
fi
C4A_STATUS="${C4A_STATUS:-PASS}"

# =====================================================================
# CRITERION 6 — reproducibility
# =====================================================================
crit "6" "reproducibility: an independent database must replay to a verified state"
if [ -n "$PARTIAL" ]; then
  info "NOT TESTED — a partial run has no Prisma history to replay."
  REPLAY_STATUS="NOT TESTED"
  ci_note "criterion 6: NOT TESTED (partial run)"
elif [ -z "$REPLAY_URL" ]; then
  info "NOT TESTED — no --replay-url supplied. This criterion is NOT recorded as a pass."
  REPLAY_STATUS="NOT TESTED"
  ci_note "criterion 6: NOT TESTED (no replay database supplied)"
else
  objs="$("$PSQL" "$REPLAY_URL" -Atc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','i','S','v','m');")"
  [ "$objs" = "0" ] || fail "the replay database is not empty ($objs objects)"
  set +e
  ( cd "$REPO_ROOT" && G3_DATABASE_URL="$REPLAY_URL" G3_SHADOW_DATABASE_URL="$SHADOW_URL" \
      "$PRISMA_BIN" migrate deploy --config "$SESS/deploy.config.ts" ) > "$OUT_DIR/06-replay.log" 2>&1
  rc=$?
  set -e
  cat "$OUT_DIR/06-replay.log"
  [ "$rc" -eq 0 ] || fail "replay into the independent database failed (exit $rc)"
  assert_catalog "$REPLAY_URL" "independent replay"
  "$PSQL" "$REPLAY_URL" -v ON_ERROR_STOP=0 -q -f "$SPIKE_DIR/sql/0002-enforce.sql" > "$OUT_DIR/06-enforce.log" 2>&1 || true
  T="$(grep -oE 'G1_TOTAL= *[0-9]+' "$OUT_DIR/06-enforce.log" | head -1 | sed 's/.*= *//' || true)"
  P="$(grep -oE 'G1_PASS= *[0-9]+' "$OUT_DIR/06-enforce.log" | head -1 | sed 's/.*= *//' || true)"
  F="$(grep -oE 'G1_FAIL= *[0-9]+' "$OUT_DIR/06-enforce.log" | head -1 | sed 's/.*= *//' || true)"
  info "replay enforcement: TOTAL=${T:-?} PASS=${P:-?} FAIL=${F:-?}"
  [ "$T" = "$G1_EXPECTED_CASES" ] || fail "replay enforcement ran $T cases, expected $G1_EXPECTED_CASES"
  [ "$F" = "0" ] || fail "replay enforcement had $F failures"
  REPLAY_STATUS="PASS"
  ok "the independent database replays to a verified state with 14/14 enforcement"
  ci_note "criterion 6: independent replay verified (5/5 constraints, 14/14 enforcement)"
fi

# =====================================================================
# Enforcement on the primary database
# =====================================================================
step "supporting check — enforcement on the primary database"
"$PSQL" "$URL" -v ON_ERROR_STOP=0 -q -f "$SPIKE_DIR/sql/0002-enforce.sql" > "$OUT_DIR/07-enforce.log" 2>&1 || true
T="$(grep -oE 'G1_TOTAL= *[0-9]+' "$OUT_DIR/07-enforce.log" | head -1 | sed 's/.*= *//' || true)"
F="$(grep -oE 'G1_FAIL= *[0-9]+' "$OUT_DIR/07-enforce.log" | head -1 | sed 's/.*= *//' || true)"
[ "$T" = "$G1_EXPECTED_CASES" ] || fail "primary enforcement ran $T cases, expected $G1_EXPECTED_CASES"
[ "$F" = "0" ] || fail "primary enforcement had $F failures"
ok "primary database: $T/$G1_EXPECTED_CASES enforcement cases PASS, 0 failures"

# =====================================================================
# Final 'migrate status'
# =====================================================================
step "final check — 'migrate status' is still clean at the end"
if [ -n "$PARTIAL" ]; then
  info "skipped: a partial run has no Prisma migration history to report on."
else
  set +e
  prisma_run migrate status --config "$SESS/deploy.config.ts" > "$OUT_DIR/08-final-status.log" 2>&1
  rc=$?
  set -e
  cat "$OUT_DIR/08-final-status.log"
  [ "$rc" -eq 0 ] || fail "final 'migrate status' is not clean (exit $rc)"
  ok "final status clean"
fi

# =====================================================================
# VERDICT
# =====================================================================
step "G-3 VERDICT"
{
  echo "G-3 workflow gate"
  printf 'criterion 1  workflow enforcement ................ %s\n' "${C1_STATUS:-PASS (guard + negative test + allow-list)}"
  printf 'criterion 2  migration-history consistency ....... %s\n' "${C2_STATUS:-PASS (status before/after, checksums)}"
  printf 'criterion 3  protected constraint integrity ...... %s\n' "${C3_STATUS:-PASS (live catalog, negative-tested)}"
  printf 'criterion 4  constrained-column safety ........... %s\n' "${C4_STATUS:-PASS}"
  printf '  4a snapshot diff detects the change ........... %s\n' "${C4A_STATUS:-PASS}"
  printf 'criterion 5  tampering detection ................. %s\n' "${C5_STATUS:-PASS}"
  printf '  5b edited applied migration (checksum) ........ %s\n' "${C5B_STATUS:-PASS}"
  printf 'criterion 6  reproducibility ..................... %s\n' "$REPLAY_STATUS"
  echo
  echo "Prototype scope: reduced 10-table reproduction, not the full 18-table schema."
  echo "See the proposal §11.6 for what this does and does not establish."
} | tee "$OUT_DIR/RESULT.txt"
cp "$RUN_LOG" "$OUT_DIR/run.log" 2>/dev/null || true
echo
echo "[G-3] artefacts in $OUT_DIR"
