#!/usr/bin/env bash
# =====================================================================
# Phase 04A — Option C prototype (controlled Prisma migration workflow)
#
# QUESTION
#   Can the five approved composite FKs C-1..C-5 be retained, using Prisma
#   as the application ORM, in a workflow where:
#     * Prisma generates the baseline migration,
#     * C-1..C-5 are appended as reviewed SQL,
#     * later changes come from SCHEMA-TO-SCHEMA diffs
#       (never database-to-datamodel diffs),
#     * `migrate dev` is prohibited after the constraints are introduced.
#
#   The premise to falsify: a schema-to-schema diff compares two DATA MODELS.
#   It never reads the live catalog, so it cannot see C-1..C-5 and therefore
#   cannot propose dropping them.
#
#   ./run.sh --url <fresh disposable database>
#
# DISPOSABLE ONLY. The database must be empty; the script refuses otherwise
# and never drops an existing schema.
#
# Harness guarantees (deliberate; do not weaken):
#   * set -Eeuo pipefail + ERR trap that quotes its own reason in CI
#   * every Prisma call uses the project's pinned binary (no npx)
#   * empty/missing Prisma output is a FAILURE, never a success
#   * the enforcement suite must report exactly 14 cases, zero FAIL
#   * the CI guard is NEGATIVE-TESTED: a deliberately destructive migration
#     must be detected, otherwise "CI detects removal" is an unproven claim
# =====================================================================
set -Eeuo pipefail

EXP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPIKE_DIR="$(cd "$EXP_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SPIKE_DIR/../../.." && pwd)"
PSQL="${PSQL:-psql}"
PRISMA_BIN="$REPO_ROOT/node_modules/.bin/prisma"

G1_EXPECTED_CASES=14
PROTECTED=(
  fk_questions_level_subject
  fk_questions_chapter_subject
  fk_questions_topic_chapter
  fk_questions_subtopic_topic
  fk_answer_keys_options_of_version
)

# --- helpers ----------------------------------------------------------
RUN_LOG="${RUN_LOG:-${TMPDIR:-/tmp}/g1-oc-$$.log}"
: > "$RUN_LOG"
exec > >(tee -a "$RUN_LOG") 2>&1
CURRENT_CMD=""
trap 'CURRENT_CMD="$BASH_COMMAND"' DEBUG

fail() {
  printf '\n[OC] FAIL: %s\n' "$*" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    printf '::error title=Option C prototype failure::%s\n' "$(printf '%s' "$*" | tr '\n' ' ')"
  fi
  exit 1
}
step() { printf '\n============================================================\n[OC] %s\n============================================================\n' "$*"; }
ok()   { printf '[OC] ok: %s\n' "$*"; }
info() { printf '[OC]     %s\n' "$*"; }
ci_note() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    printf '::warning title=Option C evidence::%s\n' "$(printf '%s' "$*" | tr '\n' ' ' | cut -c1-900)"
  fi
  printf '[OC] evidence: %s\n' "$(printf '%s' "$*" | tr '\n' ' ' | cut -c1-400)"
}

# shellcheck disable=SC2154
trap '
  rc=$?
  printf "\n[OC] FAIL: aborted (exit %s) — last line: $CURRENT_CMD\n" "$rc" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    cp_ok=1; [ -n "${OUT_DIR:-}" ] && { cp "$RUN_LOG" "$OUT_DIR/run.log" 2>/dev/null || cp_ok=0; }
    tail_txt="no log"; [ -f "$RUN_LOG" ] && { sleep 0.1; tail_txt="$(tail -c 1500 "$RUN_LOG" | tr "\n" " " | tr -s " ")"; }
    printf "::error title=Option C prototype aborted (exit %s)::%s\n" "$rc" "$(printf "%s" "$tail_txt" | cut -c1-1400)"
  fi
' ERR

assert_nonempty() {
  [ -f "$1" ] || fail "$2: expected file '$1' was not created"
  [ -s "$1" ] || fail "$2: '$1' is empty"
}

count_composite() {
  "$PSQL" "$1" -Atc "
    SELECT count(*) FROM pg_constraint
    WHERE connamespace='public'::regnamespace AND contype='f'
      AND conname IN ('fk_questions_level_subject','fk_questions_chapter_subject',
                      'fk_questions_topic_chapter','fk_questions_subtopic_topic',
                      'fk_answer_keys_options_of_version');" 2>/dev/null || echo 0
}

# guard_migration <file> — the CI check that Option C depends on.
# Rejects a migration that drops/alters any protected constraint, or that
# contains a blanket destructive statement against the questions/answer_keys
# tables. Returns 0 = clean, 1 = violation (reason printed).
guard_migration() {
  local f="$1" violation=""
  for c in "${PROTECTED[@]}"; do
    if grep -qiE "DROP[[:space:]]+CONSTRAINT[[:space:]]+\"?$c\"?" "$f"; then
      violation="$violation drop:$c"
    fi
  done
  if grep -qiE 'DROP[[:space:]]+TABLE[[:space:]]+"?(questions|answer_keys|question_options|topics|chapters|subtopics|level_subjects)"?' "$f"; then
    violation="$violation drop-table"
  fi
  if grep -qiE 'ALTER[[:space:]]+TABLE.*DROP[[:space:]]+COLUMN' "$f"; then
    violation="$violation drop-column"
  fi
  if [ -n "$violation" ]; then
    printf '%s\n' "$violation"
    return 1
  fi
  return 0
}

# --- arguments --------------------------------------------------------
URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --url=*) URL="${1#*=}"; shift ;;
    -h|--help) sed -n '2,32p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done
[ -n "$URL" ] || fail "usage: run.sh --url <fresh disposable database>"
case "$URL" in
  *production*|*prod*|*staging*|*supabase.co*|*render.com*|*rds.amazonaws.com*)
    fail "refusing to run against a non-disposable database" ;;
esac

WORK="${WORK:-$EXP_DIR/out}"
rm -rf "$WORK"; mkdir -p "$WORK"
OUT_DIR="$WORK"

# --- 0. toolchain -----------------------------------------------------
step "0. toolchain — pinned, nothing downloaded except the Prisma engine"
command -v "$PSQL" >/dev/null || fail "psql not found on PATH"
[ -x "$PRISMA_BIN" ] || fail "pinned Prisma CLI missing — run 'npm ci' (npx is deliberately not used)"
PRISMA_VERSION="$(node -p "require('$REPO_ROOT/node_modules/prisma/package.json').version")"
[ "$PRISMA_VERSION" = "7.10.1" ] || fail "pinned Prisma is $PRISMA_VERSION, expected 7.10.1"
PG_VERSION="$("$PSQL" "$URL" -Atc 'SHOW server_version;')"
ok "prisma $PRISMA_VERSION, node $(node -v), PostgreSQL $PG_VERSION"

step "0b. precondition — the database must be empty"
objs="$("$PSQL" "$URL" -Atc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','i','S','v','m');")"
[ "$objs" = "0" ] || fail "database is not empty ($objs objects) — this prototype needs a fresh disposable database"
ok "database is empty"

MIGRATIONS="$OUT_DIR/migrations"
mkdir -p "$MIGRATIONS"
SESS="$OUT_DIR/session"
mkdir -p "$SESS"

# Session config. Datasource URL comes from the environment; the config file
# itself carries no credential.
mk_config() { # mk_config <schema-path> <config-path>
  cat > "$2" <<CFG
import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: '$1',
  migrations: { path: '$MIGRATIONS' },
  datasource: { url: process.env.OC_DATABASE_URL },
});
CFG
}

prisma_run() { ( cd "$REPO_ROOT" && OC_DATABASE_URL="$URL" "$PRISMA_BIN" "$@" ); }

# --- 1. baseline from EMPTY -> schema ---------------------------------
step "1. BASELINE — Prisma generates the initial migration from an empty model"
info "tests: does the Option C premise hold at step one — can Prisma emit a"
info "       complete baseline SQL script without a live database?"
BASELINE_SCHEMA="$SESS/baseline.prisma"
cp "$EXP_DIR/schema.prisma" "$BASELINE_SCHEMA"
mk_config "$BASELINE_SCHEMA" "$SESS/baseline.config.ts"

set +e
prisma_run migrate diff --from-empty --to-schema "$BASELINE_SCHEMA" --script \
  --config "$SESS/baseline.config.ts" > "$OUT_DIR/01-baseline.sql" 2> "$OUT_DIR/01-baseline.err"
rc=$?
set -e
[ "$rc" -eq 0 ] || { cat "$OUT_DIR/01-baseline.err"; fail "migrate diff --from-empty failed (exit $rc)"; }
assert_nonempty "$OUT_DIR/01-baseline.sql" "baseline script"
info "generated $(wc -c < "$OUT_DIR/01-baseline.sql") bytes, $(grep -c ';' "$OUT_DIR/01-baseline.sql" || true) statements"
grep -qiE 'CREATE TABLE' "$OUT_DIR/01-baseline.sql" || fail "baseline script contains no CREATE TABLE"
ok "baseline SQL generated from the datamodel alone (no live database consulted)"

# --- 2. append the approved SQL ---------------------------------------
step "2. APPEND — the five approved composite FKs, verbatim, as reviewed SQL"
info "tests: is the hand-written part still byte-identical to the approved design?"
extract_fk() {
  awk -v want="$2" 'index($0,"ADD CONSTRAINT") && index($0,want){grab=1} grab{print; if ($0 ~ /;[[:space:]]*$/) exit}' "$1"
}
norm_sql() { tr -d '"' | tr -s '[:space:]' ' ' | sed 's/^ //;s/ $//'; }
for fk in "${PROTECTED[@]}"; do
  a="$(extract_fk "$SPIKE_DIR/experiment-2/manual/001_composite_fks.sql" "$fk" | norm_sql)"
  b="$(extract_fk "$EXP_DIR/manual-baseline.sql" "$fk" | norm_sql)"
  [ -n "$a" ] && [ -n "$b" ] && [ "$a" = "$b" ] \
    || fail "the prototype's appended definition of '$fk' differs from the approved copy"
done
ok "all five appended definitions are identical to the approved reference"

BASE_DIR="$MIGRATIONS/20260101000000_init"
mkdir -p "$BASE_DIR"
{ cat "$OUT_DIR/01-baseline.sql"; echo; cat "$EXP_DIR/manual-baseline.sql"; } > "$BASE_DIR/migration.sql"
assert_nonempty "$BASE_DIR/migration.sql" "baseline migration"
ok "baseline migration assembled ($(wc -l < "$BASE_DIR/migration.sql") lines)"

# --- 3. deploy the baseline -------------------------------------------
step "3. DEPLOY — 'prisma migrate deploy' applies the reviewed migration and records history"
info "tests: does a migration that Prisma did not fully write still deploy and"
info "       produce consistent migration history? Note: migrate deploy does NOT"
info "       look for drift and does NOT use a shadow database (Prisma v7 docs)."
mk_config "$BASELINE_SCHEMA" "$SESS/deploy.config.ts"
set +e
prisma_run migrate deploy --config "$SESS/deploy.config.ts" > "$OUT_DIR/03-deploy.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/03-deploy.log"
[ "$rc" -eq 0 ] || fail "migrate deploy failed on the baseline (exit $rc)"
n="$(count_composite "$URL")"
[ "$n" = "5" ] || fail "baseline deploy produced $n/5 composite FKs"
ok "baseline deployed; 5/5 composite FKs present"

step "3b. HISTORY — the migration is recorded exactly once"
applied="$("$PSQL" "$URL" -Atc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
[ "$applied" = "1" ] || fail "expected exactly 1 applied migration, found $applied"
ok "1 migration applied and finished, no rollbacks"

# --- 4. THE CORE CLAIM: schema-to-schema diff -------------------------
step "4. SCHEMA-TO-SCHEMA DIFF — the central claim of Option C"
info "tests: does a schema->schema diff propose ANY drop of C-1..C-5?"
info ""
info "The premise: this compares two DATA MODELS. Composite FKs are invisible"
info "to a data model, so they should be invisible to the diff — on both sides."
info "If that holds, later migrations can never propose removing them."
ADDITIVE_SCHEMA="$SESS/additive.prisma"
cp "$BASELINE_SCHEMA" "$ADDITIVE_SCHEMA"
python3 - "$ADDITIVE_SCHEMA" <<'PY'
import sys, io
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
old = "  versions         QuestionVersion[]"
assert s.count(old) == 1, "anchor not unique"
s = s.replace(old, "  ocProbeNote      String?        @map(\"oc_probe_note\")\n  versions         QuestionVersion[]")
io.open(p, 'w', encoding='utf-8').write(s)
PY
ok "added one unrelated nullable column to a copy of the datamodel"

mk_config "$ADDITIVE_SCHEMA" "$SESS/additive.config.ts"
set +e
prisma_run migrate diff --from-schema "$BASELINE_SCHEMA" --to-schema "$ADDITIVE_SCHEMA" --script \
  --config "$SESS/additive.config.ts" > "$OUT_DIR/04-additive.sql" 2> "$OUT_DIR/04-additive.err"
rc=$?
set -e
[ "$rc" -eq 0 ] || { cat "$OUT_DIR/04-additive.err"; fail "schema-to-schema diff failed (exit $rc)"; }
assert_nonempty "$OUT_DIR/04-additive.sql" "schema-to-schema diff"
printf '\n----- schema-to-schema diff -----\n'; cat "$OUT_DIR/04-additive.sql"; printf -- '----- end -----\n'

if grep -qiE 'DROP' "$OUT_DIR/04-additive.sql"; then
  fail "the schema-to-schema diff contains a DROP statement — Option C's premise does NOT hold. See 04-additive.sql"
fi
ok "the schema-to-schema diff contains NO DROP statement at all"
for fk in "${PROTECTED[@]}"; do
  grep -qi "$fk" "$OUT_DIR/04-additive.sql" && fail "the diff mentions protected constraint '$fk'"
done
ok "no protected composite FK appears anywhere in the diff"
ci_note "step4 schema-to-schema diff: 0 DROP statements, 0 mentions of C-1..C-5"

# --- 5. the CI drift check that Option C relies on --------------------
step "5. DRIFT CHECK — 'migrate diff --from-migrations --to-schema' must be clean"
info "tests: can CI detect that migration history has drifted from the"
info "       datamodel WITHOUT the composite FKs producing false positives?"
info ""
info "This is the mechanism that replaces 'migrate dev' as the safety net."
info "It replays history into a shadow database, then compares that data model"
info "with the datamodel. Composite FKs are invisible on BOTH sides, so they"
info "should not appear as drift — that is the claim being tested."
set +e
prisma_run migrate diff --from-migrations "$MIGRATIONS" --to-schema "$BASELINE_SCHEMA" --script \
  --config "$SESS/deploy.config.ts" --exit-code > "$OUT_DIR/05-drift.sql" 2> "$OUT_DIR/05-drift.err"
rc=$?
set -e
info "exit code: $rc (0 = no drift, 2 = drift detected, 1 = error)"
if [ "$rc" -eq 1 ]; then
  cat "$OUT_DIR/05-drift.err"
  ci_note "step5 drift check ERRORED: $(tail -c 900 "$OUT_DIR/05-drift.err" | tr '\n' ' ')"
  fail "the drift check errored: $(tail -c 600 "$OUT_DIR/05-drift.err" | tr '\n' ' ')"
fi
if [ "$rc" -eq 0 ]; then
  ok "NO drift: migration history matches the datamodel; C-1..C-5 cause no false positive"
  ci_note "step5 drift check: exit 0 (clean)"
else
  printf '\n----- drift reported -----\n'; cat "$OUT_DIR/05-drift.sql"; printf -- '-----\n'
  if grep -qiE 'CONSTRAINT|fk_' "$OUT_DIR/05-drift.sql"; then
    fail "the drift check reports constraint differences — composite FKs DO produce false-positive drift, which breaks this CI mechanism"
  fi
  fail "the drift check reports drift (exit $rc) — see 05-drift.sql"
fi

# --- 6. apply the additive migration ----------------------------------
step "6. APPLY — deploy the schema-to-schema migration and re-verify"
info "tests: can a Prisma-generated, unedited migration be deployed on top of"
info "       the hand-written baseline without disturbing the constraints?"
ADD_DIR="$MIGRATIONS/20260102000000_additive"
mkdir -p "$ADD_DIR"
cp "$OUT_DIR/04-additive.sql" "$ADD_DIR/migration.sql"
guard_migration "$ADD_DIR/migration.sql" > "$OUT_DIR/06-guard.txt" 2>&1 \
  || fail "the CI guard rejected a legitimate additive migration (false positive): $(cat "$OUT_DIR/06-guard.txt")"
ok "the CI guard accepts the legitimate additive migration"

set +e
prisma_run migrate deploy --config "$SESS/additive.config.ts" > "$OUT_DIR/06-deploy.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/06-deploy.log"
[ "$rc" -eq 0 ] || fail "deploy of the additive migration failed (exit $rc)"
n="$(count_composite "$URL")"
[ "$n" = "5" ] || fail "after the additive migration only $n/5 composite FKs remain"
ok "additive migration applied; 5/5 composite FKs still present"
"$PSQL" "$URL" -Atc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='questions' AND column_name='oc_probe_note';" | grep -q 1 \
  || fail "the additive column was not created"
ok "the additive column exists — the change was applied, not merely recorded"

# --- 7. enforcement ---------------------------------------------------
step "7. ENFORCEMENT — the constraints still do real work after the whole workflow"
info "tests: are the five still ENFORCED, not merely present in the catalog?"
set +e
"$PSQL" "$URL" -v ON_ERROR_STOP=0 -q -f "$SPIKE_DIR/sql/0002-enforce.sql" > "$OUT_DIR/07-enforcement.log" 2>&1
rc=$?
set -e
grep -E 'G1_TOTAL|G1_PASS|G1_FAIL' "$OUT_DIR/07-enforcement.log" || true
[ "$rc" -eq 0 ] || fail "enforcement suite exited $rc"
read_counter() { grep -oE "G1_$1= *[0-9]+" "$OUT_DIR/07-enforcement.log" | head -1 | sed 's/.*= *//'; }
TOTAL="$(read_counter TOTAL || true)"; PASSED="$(read_counter PASS || true)"; FAILED="$(read_counter FAIL || true)"
[ -n "${TOTAL:-}" ] || fail "the enforcement suite did not emit its summary"
[ "$TOTAL" = "$G1_EXPECTED_CASES" ] || fail "expected $G1_EXPECTED_CASES cases, suite reported $TOTAL"
[ "$FAILED" = "0" ] || fail "$FAILED enforcement case(s) FAILED"
[ "$PASSED" = "$G1_EXPECTED_CASES" ] || fail "expected $G1_EXPECTED_CASES passes, got $PASSED"
ok "14/14 enforcement cases PASS, G1_FAIL=0"
ci_note "step7 enforcement: ${PASSED}/${TOTAL} PASS, G1_FAIL=${FAILED}"

# --- 8. reproducibility -----------------------------------------------
step "8. REPRODUCIBILITY — a second, independent database must end up identical"
info "tests: is the reviewed SQL replayable from scratch? This is what a new"
info "       developer, a CI job, or a disaster recovery actually does."
REPLAY_DB="${OC_REPLAY_URL:-}"
if [ -z "$REPLAY_DB" ]; then
  info "no --replay-url supplied; skipping the independent replay"
  ci_note "step8 replay: SKIPPED (no second database supplied)"
else
  objs="$("$PSQL" "$REPLAY_DB" -Atc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','i','S','v','m');")"
  [ "$objs" = "0" ] || fail "the replay database is not empty ($objs objects)"
  set +e
  ( cd "$REPO_ROOT" && OC_DATABASE_URL="$REPLAY_DB" "$PRISMA_BIN" migrate deploy --config "$SESS/additive.config.ts" ) > "$OUT_DIR/08-replay.log" 2>&1
  rc=$?
  set -e
  cat "$OUT_DIR/08-replay.log"
  [ "$rc" -eq 0 ] || fail "replay into the second database failed (exit $rc)"
  n="$(count_composite "$REPLAY_DB")"
  [ "$n" = "5" ] || fail "the replayed database has $n/5 composite FKs"
  ok "a second, independent database replays to 5/5 composite FKs"
  ci_note "step8 replay: 5/5 composite FKs on an independent database"
fi

# --- 9. NEGATIVE TEST of the CI guard ---------------------------------
step "9. CI GUARD, NEGATIVE TEST — a destructive migration MUST be caught"
info "tests: does the guard actually work? A guard that never fires is not a"
info "       control. This step deliberately builds a migration that drops a"
info "       protected constraint and asserts that the guard rejects it."
BAD_DIR="$OUT_DIR/negative-test"
mkdir -p "$BAD_DIR"
cat > "$BAD_DIR/migration.sql" <<'BADSQL'
-- deliberately destructive: simulates what `migrate dev` generates on its own
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_level_subject";
BADSQL
if guard_migration "$BAD_DIR/migration.sql" > "$OUT_DIR/09-guard-neg.txt" 2>&1; then
  fail "the CI guard ACCEPTED a migration that drops a protected constraint — the control does not work"
fi
info "guard reported: $(cat "$OUT_DIR/09-guard-neg.txt")"
ok "the CI guard correctly rejects a migration that drops a protected constraint"
ci_note "step9 negative test: guard rejected the injected destructive migration"

# --- 10. what Option C does NOT protect against -----------------------
step "10. LIMITATION — 'migrate dev' remains destructive (this is why it is PROHIBITED)"
info "This step is a recorded observation, not a test to pass."
info ""
info "Option C works only because every migration goes through a schema-to-schema"
info "diff or the reviewed baseline. If somebody runs 'prisma migrate dev' against"
info "this database, experiment 2 already proved what happens: Prisma compares the"
info "LIVE CATALOG to the datamodel, sees five constraints it cannot express, and"
info "writes a migration to drop them. The prohibition is therefore load-bearing,"
info "not stylistic. It must be enforced culturally and, ideally, by tooling."
ci_note "step10 limitation: 'migrate dev' remains destructive here and is prohibited by design"

# --- summary ----------------------------------------------------------
step "RESULT — Option C prototype"
cat > "$OUT_DIR/RESULT.txt" <<'RESULT'
Option C prototype: central claims HELD
1 baseline generated from the datamodel alone ............ OK
2 approved C-1..C-5 appended verbatim ................... OK
3 baseline deployed by migrate deploy, history clean ..... OK
4 schema-to-schema diff contains NO DROP ................ OK
5 drift check (from-migrations -> schema) clean ......... OK
6 additive migration applied, 5/5 preserved ............. OK
7 all five still enforced (14/14) ...................... OK
8 second database replays to 5/5 ....................... OK (when supplied)
9 CI guard detects a destructive migration .............. OK (negative-tested)
RESULT
cat "$OUT_DIR/RESULT.txt"
cp "$RUN_LOG" "$OUT_DIR/run.log" 2>/dev/null || true
echo
echo "[OC] artefacts in $OUT_DIR"
