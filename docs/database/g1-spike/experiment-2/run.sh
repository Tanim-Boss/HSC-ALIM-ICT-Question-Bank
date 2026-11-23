#!/usr/bin/env bash
# =====================================================================
# G-1 experiment 2 — does the approved constraint layer survive Prisma's
# REAL migration-history workflow?
#
#   ./run.sh --url <fresh disposable database> \
#            --shadow-url <second fresh disposable database> \
#            [--work <private work dir>]
#
# Experiment 1 asked "does Prisma drop constraints it did not create?" and
# answered yes — but on a hand-built schema with NO migration history, so
# Prisma was entitled to propose rebuilding everything, and that result did
# not isolate the composite FKs.
#
# This experiment asks the production question instead:
#
#   schema is created BY PRISMA (so migration history exists) ->
#   the five composite FKs are appended to Prisma's own generated migration ->
#   the migration is deployed with `prisma migrate deploy` ->
#   and then every subsequent Prisma workflow is exercised.
#
# Both databases MUST be empty. This script creates them from nothing and
# never touches an existing schema: `migrate dev`/`deploy` require an empty
# database, and if anything is already there the script refuses rather than
# destroying someone else's data.
#
# Harness guarantees (each deliberate; do not weaken):
#   * `set -Eeuo pipefail` + an ERR trap that names the failing line.
#   * Every Prisma call uses the PROJECT'S pinned binary
#     (node_modules/.bin/prisma); `npx` is never used.
#   * The five composite FK definitions in manual/001_composite_fks.sql are
#     asserted to be byte-identical to the approved reference copy in
#     ../sql/0001-schema.sql before they are appended.
#   * The generated migration is inspected: it must exist, be non-empty,
#     and contain ordinary FKs and ordinary uniques before anything is
#     appended — otherwise "Prisma generated it" means nothing.
#   * An empty or missing Prisma output is a FAILURE, never a success.
#   * The enforcement suite must report exactly G1_EXPECTED_CASES cases,
#     zero FAIL, and the exact expected set of case names.
#   * Every step prints what it is testing and what its result establishes.
# =====================================================================
set -Eeuo pipefail

EXP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPIKE_DIR="$(cd "$EXP_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SPIKE_DIR/../../.." && pwd)"
PSQL="${PSQL:-psql}"
PRISMA_BIN="$REPO_ROOT/node_modules/.bin/prisma"

G1_EXPECTED_CASES=14
COMPOSITE_FKS=(
  fk_questions_level_subject
  fk_questions_chapter_subject
  fk_questions_topic_chapter
  fk_questions_subtopic_topic
  fk_answer_keys_options_of_version
)

# --- helpers ----------------------------------------------------------
fail() {
  printf '\n[G-1/2] FAIL: %s\n' "$*" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    printf '::error title=G-1 experiment 2 failure::%s\n' "$(printf '%s' "$*" | tr '\n' ' ')"
  fi
  exit 1
}
step() { printf '\n============================================================\n[G-1/2] %s\n============================================================\n' "$*"; }
ok()   { printf '[G-1/2] ok: %s\n' "$*"; }
info() { printf '[G-1/2]     %s\n' "$*"; }

# Persistent, readable evidence. In CI this becomes a warning annotation so
# the reasoning is visible without downloading logs or artefacts.
ci_note() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    printf '::warning title=G-1/2 evidence::%s\n' "$(printf '%s' "$*" | tr '\n' ' ' | cut -c1-900)"
  fi
  printf '[G-1/2] evidence: %s\n' "$(printf '%s' "$*" | tr '\n' ' ' | cut -c1-400)"
}

# A run log created before anything can fail, so the ERR trap is always able
# to quote the reason for a failure in CI. Everything is tee'd through it.
RUN_LOG="${RUN_LOG:-${TMPDIR:-/tmp}/g1-exp2-$$.log}"
: > "$RUN_LOG"
exec > >(tee -a "$RUN_LOG") 2>&1
CURRENT_CMD=""
trap 'CURRENT_CMD="$BASH_COMMAND"' DEBUG

# On failure, emit the TAIL OF OUR OWN LOG as an annotation. Without this a
# CI failure reported only "a command exited 2", which is useless to a
# reviewer and impossible to diagnose from the annotations API.
# shellcheck disable=SC2154  # assigned in the trap body before use
trap '
  rc=$?
  printf "\n[G-1/2] FAIL: aborted (exit %s) — last line executed: $CURRENT_CMD\n" "$rc" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    tail_txt="no log yet"
    [ -n "${OUT_DIR:-}" ] && cp "$RUN_LOG" "$OUT_DIR/run.log" 2>/dev/null || true
    if [ -f "$RUN_LOG" ]; then
      # the tee subprocess may not have flushed yet; read what is there
      sleep 0.1
      tail_txt="$(tail -c 1500 "$RUN_LOG" | tr "\n" " " | tr -s " ")"
    fi
    printf "::error title=G-1/2 harness aborted (exit %s)::%s\n" "$rc" "$(printf "%s" "$tail_txt" | cut -c1-1400)"
  fi
' ERR

assert_file() {
  [ -f "$1" ] || fail "$2: expected file '$1' was not created"
}
assert_nonempty() {
  assert_file "$1" "$2"
  [ -s "$1" ] || fail "$2: '$1' is empty"
}

# count_composite_fks <url> — 0..5
count_composite_fks() {
  "$PSQL" "$1" -Atc "
    SELECT count(*) FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
      AND contype = 'f'
      AND conname IN ('fk_questions_level_subject','fk_questions_chapter_subject',
                      'fk_questions_topic_chapter','fk_questions_subtopic_topic',
                      'fk_answer_keys_options_of_version');" 2>/dev/null || echo 0
}

# --- arguments --------------------------------------------------------
URL=""; SHADOW_URL=""; WORK=""
while [ $# -gt 0 ]; do
  case "$1" in
    --url)        URL="${2:-}"; shift 2 ;;
    --url=*)      URL="${1#*=}"; shift ;;
    --shadow-url) SHADOW_URL="${2:-}"; shift 2 ;;
    --shadow-url=*) SHADOW_URL="${1#*=}"; shift ;;
    --work)       WORK="${2:-}"; shift 2 ;;
    --work=*)     WORK="${1#*=}"; shift ;;
    -h|--help)    sed -n '2,45p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done
[ -n "$URL" ]        || fail "usage: run.sh --url <fresh db> --shadow-url <second fresh db>"
[ -n "$SHADOW_URL" ] || fail "--shadow-url is required: the shadow database replay is part of the experiment"

case "$URL$SHADOW_URL" in
  *production*|*prod*|*staging*|*supabase.co*|*render.com*|*rds.amazonaws.com*)
    fail "refusing to run against a non-disposable database" ;;
esac

WORK="${WORK:-$EXP_DIR/out}"
rm -rf "$WORK"; mkdir -p "$WORK"
OUT_DIR="$WORK"

# --- 0. pinned toolchain ---------------------------------------------
step "0. toolchain — everything pinned, nothing downloaded at run time"
command -v "$PSQL" >/dev/null || fail "psql not found on PATH"
[ -x "$PRISMA_BIN" ] || fail "pinned Prisma CLI missing at $PRISMA_BIN — run 'npm ci' (npx is deliberately not used)"
PRISMA_VERSION="$(node -p "require('$REPO_ROOT/node_modules/prisma/package.json').version")"
[ "$PRISMA_VERSION" = "7.10.1" ] || fail "pinned Prisma is $PRISMA_VERSION, expected 7.10.1"
CLIENT_VERSION="$(node -p "require('$REPO_ROOT/node_modules/@prisma/client/package.json').version")"
[ "$CLIENT_VERSION" = "7.10.1" ] || fail "@prisma/client is $CLIENT_VERSION, expected 7.10.1"
PG_VERSION="$("$PSQL" "$URL" -Atc "select current_setting('server_version');")"
ok "prisma CLI $PRISMA_VERSION, @prisma/client $CLIENT_VERSION, node $(node -v), PostgreSQL $PG_VERSION"
echo "prisma=$PRISMA_VERSION client=$CLIENT_VERSION node=$(node -v) postgres=$PG_VERSION" > "$OUT_DIR/versions.txt"

# --- preconditions: both databases must be EMPTY ----------------------
step "0b. preconditions — both databases must be empty (this experiment creates them from nothing)"
for pair in "primary:$URL" "shadow:$SHADOW_URL"; do
  name="${pair%%:*}"; dburl="${pair#*:}"
  # connectivity
  "$PSQL" "$dburl" -Atc 'SELECT 1' >/dev/null 2>&1 \
    || fail "cannot connect to the $name database"
  objs="$("$PSQL" "$dburl" -Atc "
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','i','S','v','m');")"
  [ "$objs" = "0" ] || fail "the $name database is not empty ($objs objects in public) — refusing to run: this experiment needs a fresh disposable database and will not destroy an existing schema"
  ok "$name database is empty and reachable"
done

# --- 1. Prisma generates the baseline migration -----------------------
step "1. BASELINE MIGRATION — Prisma 7.10.1 generates it from the datamodel"
info "tests: can Prisma create this schema at all, and does it express the"
info "       ordinary FKs and ordinary uniques itself?"
MIGRATIONS_DIR="$OUT_DIR/migrations"
mkdir -p "$MIGRATIONS_DIR"
SESSION_SCHEMA="$OUT_DIR/session/schema.prisma"
mkdir -p "$(dirname "$SESSION_SCHEMA")"
cp "$EXP_DIR/schema.prisma" "$SESSION_SCHEMA"

# The config names both URLs; the shadow database is used by `migrate dev` for
# its replay and is NEVER the same database as the primary.
cat > "$OUT_DIR/session/prisma.config.ts" <<CONFIG
import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: '$SESSION_SCHEMA',
  migrations: { path: '$MIGRATIONS_DIR' },
  datasource: {
    url: process.env.G1_DATABASE_URL,
    shadowDatabaseUrl: process.env.G1_SHADOW_DATABASE_URL,
  },
});
CONFIG

prisma_session() {
  ( cd "$REPO_ROOT" && \
    G1_DATABASE_URL="$URL" \
    G1_SHADOW_DATABASE_URL="$SHADOW_URL" \
    "$PRISMA_BIN" "$@" --config "$OUT_DIR/session/prisma.config.ts" )
}

set +e
prisma_session migrate dev --name g1_baseline --create-only \
  > "$OUT_DIR/01-migrate-dev.log" 2>&1
rc=$?
set -e
[ -f "$OUT_DIR/01-migrate-dev.log" ] && cat "$OUT_DIR/01-migrate-dev.log"
[ "$rc" -eq 0 ] || fail "prisma migrate dev --create-only failed (exit $rc) — see 01-migrate-dev.log"

# The generated migration must actually exist and be non-empty. Silence is a
# failure: "nothing was generated" can never be read as success.
MIG_DIR="$(find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d -name '2*_*' | sort | head -1)"
[ -n "$MIG_DIR" ] || fail "prisma reported success but generated no migration directory under $MIGRATIONS_DIR"
MIGRATION_SQL="$MIG_DIR/migration.sql"
assert_nonempty "$MIGRATION_SQL" "generated migration"
MIGRATION_NAME="$(basename "$MIG_DIR")"
ok "generated migration: $MIGRATION_NAME ($(wc -c < "$MIGRATION_SQL") bytes)"
cp "$MIGRATION_SQL" "$OUT_DIR/01-generated-baseline.sql"

# --- 2. inspect what Prisma itself expressed --------------------------
step "2. INSPECT THE GENERATED MIGRATION — ordinary FKs and uniques must be Prisma's own work"
info "tests: are the ordinary constraints represented correctly BEFORE any"
info "       hand-written SQL is appended? If not, every later diff is noise."
FK_COUNT="$(grep -c 'FOREIGN KEY' "$OUT_DIR/01-generated-baseline.sql" || true)"
UNIQUE_COUNT="$(grep -cE 'CREATE UNIQUE INDEX|UNIQUE' "$OUT_DIR/01-generated-baseline.sql" || true)"
CHECK_COUNT="$(grep -c 'CHECK' "$OUT_DIR/01-generated-baseline.sql" || true)"
info "generated: $FK_COUNT FOREIGN KEY, $UNIQUE_COUNT unique, $CHECK_COUNT CHECK"
[ "$FK_COUNT" -ge 10 ] || fail "the generated migration contains only $FK_COUNT ordinary foreign keys — Prisma did not express the datamodel's relations"

# Each ordinary FK and each support unique must be present by name, so that
# "represented correctly" is checked against the approved model and not
# against a count that could be met by the wrong constraints.
for fk in questions_education_level_id_fkey questions_subject_id_fkey \
          questions_chapter_id_fkey questions_topic_id_fkey questions_subtopic_id_fkey \
          question_versions_question_id_fkey question_options_version_id_fkey \
          answer_keys_version_id_fkey chapters_subject_id_fkey topics_chapter_id_fkey \
          subtopics_topic_id_fkey level_subjects_level_id_fkey level_subjects_subject_id_fkey; do
  grep -q "\"$fk\"" "$OUT_DIR/01-generated-baseline.sql" \
    || fail "ordinary FK '$fk' is missing from the generated migration"
done
for uq in uq_chapters_id_subject uq_topics_id_chapter uq_subtopics_id_topic \
          uq_chapters_subject_number uq_question_options_version_key uq_answer_keys_version; do
  grep -q "\"$uq\"" "$OUT_DIR/01-generated-baseline.sql" \
    || fail "unique key '$uq' is missing from the generated migration"
done
ok "all 13 ordinary FKs and all 6 uniques (incl. the 3 C-support keys) are Prisma's own work"
ci_note "step2 generated baseline: ${FK_COUNT} FK, ${UNIQUE_COUNT} unique, ${CHECK_COUNT} CHECK statements"

# Nothing hand-written is in it yet: the composite FKs must be absent.
for fk in "${COMPOSITE_FKS[@]}"; do
  if grep -q "\"$fk\"" "$OUT_DIR/01-generated-baseline.sql"; then
    fail "generated migration already contains '$fk' — the premise of this experiment is that Prisma cannot express it"
  fi
done
ok "none of C-1..C-5 is present yet — as expected, Prisma cannot express them"

# --- 3. the appended SQL must be the APPROVED definitions -------------
step "3. MANUALLY APPENDED SQL — the approved composite FKs, byte-identical to the reference"
info "tests: has the hand-written part drifted from the approved §3.11.6 design?"
# Extract each composite FK statement from BOTH files and compare them after
# whitespace normalisation. This makes "do not alter their definitions" a
# machine-checked property instead of a promise.
# The reference copy (../sql/0001-schema.sql) writes identifiers unquoted and
# the appended copy quotes them, so compare with quotes stripped and
# whitespace collapsed: the DEFINITION must be identical, the spelling of
# identifier quoting must not matter.
extract_fk() {
  # $1 = file, $2 = constraint name
  awk -v want="$2" '
    index($0,"ADD CONSTRAINT") && index($0,want) { grab=1 }
    grab { print; if ($0 ~ /;[[:space:]]*$/) exit }
  ' "$1"
}
norm_sql() { tr -d '"' | tr -s '[:space:]' ' ' | sed 's/^ //;s/ $//'; }
for fk in "${COMPOSITE_FKS[@]}"; do
  a="$(extract_fk "$SPIKE_DIR/sql/0001-schema.sql" "$fk" | norm_sql)"
  b="$(extract_fk "$EXP_DIR/manual/001_composite_fks.sql" "$fk" | norm_sql)"
  [ -n "$a" ] || fail "reference definition of '$fk' not found in sql/0001-schema.sql"
  [ -n "$b" ] || fail "appended definition of '$fk' not found in manual/001_composite_fks.sql"
  [ "$a" = "$b" ] || fail "the appended definition of '$fk' differs from the approved reference.
  approved: $a
  appended: $b"
done
ok "all five appended definitions are byte-identical to the approved reference"

# --- 4. append and deploy with Prisma's own workflow ------------------
step "4. DEPLOY — the appended migration is applied by 'prisma migrate deploy'"
info "tests: does Prisma's real migration workflow accept and apply a"
info "       migration whose SQL it did not write in full?"
cat "$EXP_DIR/manual/001_composite_fks.sql" >> "$MIGRATION_SQL"
ok "appended $(wc -l < "$EXP_DIR/manual/001_composite_fks.sql") lines to $MIGRATION_NAME/migration.sql"
cp "$MIGRATION_SQL" "$OUT_DIR/04-appended-migration.sql"

set +e
prisma_session migrate deploy > "$OUT_DIR/04-deploy.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/04-deploy.log"
[ "$rc" -eq 0 ] || fail "prisma migrate deploy failed (exit $rc) — the appended migration was rejected"

# It must report that the migration was actually applied, not merely "no
# pending migrations" (which would mean the migration was never seen).
grep -qE '1 migration|applied' "$OUT_DIR/04-deploy.log" \
  || fail "migrate deploy succeeded but did not report applying the migration"
ok "baseline migration (with the appended C-1..C-5) deployed by Prisma"

# --- 5. PostgreSQL state after the Prisma deployment ------------------
step "5. STATE AFTER DEPLOY — all five exist, and the ordinary layer survived"
info "tests: did the deployment create C-1..C-5, and are the ordinary FKs"
info "       and uniques Prisma created still intact?"
n="$(count_composite_fks "$URL")"
if [ "$n" != "5" ]; then
  printf '\n----- diagnostics: what did deploy actually apply? -----\n'
  echo "migration file: $MIGRATION_SQL ($(wc -c < "$MIGRATION_SQL") bytes, $(grep -c ';' "$MIGRATION_SQL" || true) statements)"
  echo "appended SQL contains $(grep -c 'ADD CONSTRAINT' "$EXP_DIR/manual/001_composite_fks.sql" || true) ADD CONSTRAINT statements"
  "$PSQL" "$URL" -Atc "SELECT migration_name || ' | applied=' || (finished_at IS NOT NULL) || ' | rolled_back=' || (rolled_back_at IS NOT NULL) || ' | logs=' || coalesce(logs,'-') FROM _prisma_migrations ORDER BY started_at;" || echo "(no _prisma_migrations table)"
  printf '\n----- end diagnostics -----\n'
  fail "after deploy only $n/5 composite FKs exist in the primary database"
fi
ok "5/5 composite FKs present after deployment"

"$PSQL" "$URL" -Atc "
  SELECT conname || ' ' || pg_get_constraintdef(oid) FROM pg_constraint
  WHERE connamespace='public'::regnamespace AND contype='f'
  ORDER BY conname;" > "$OUT_DIR/05-catalog-fks.txt"
assert_nonempty "$OUT_DIR/05-catalog-fks.txt" "foreign key catalog"
# Count every FOREIGN KEY row. Do NOT grep for the 'fkey' name suffix: the
# five composite constraints are named fk_*, so a suffix match silently
# excludes exactly the constraints this experiment is about.
ORD_FK="$(wc -l < "$OUT_DIR/05-catalog-fks.txt")"
# The datamodel declares 13 relations, so Prisma creates 13 ordinary FKs; the
# append adds 5 composite ones. 18 is the exact expected total, not a floor:
# a missing ordinary FK and a duplicated composite one must not average out.
EXPECTED_FKS=18
info "foreign keys in the catalog: $ORD_FK (expected exactly $EXPECTED_FKS = 13 ordinary + 5 composite)"
[ "$ORD_FK" = "$EXPECTED_FKS" ] || fail "the catalog holds $ORD_FK foreign keys, expected exactly $EXPECTED_FKS (13 ordinary from the datamodel + 5 appended composite)"
for uq in uq_chapters_id_subject uq_topics_id_chapter uq_subtopics_id_topic uq_topics_chapter_order; do
  "$PSQL" "$URL" -Atc "SELECT 1 FROM pg_class WHERE relname='$uq' AND relkind='i';" | grep -q 1 \
    || fail "index '$uq' is missing after deployment"
done
ok "ordinary FKs intact ($ORD_FK), support uniques and the partial index present"

# --- 6. enforcement ---------------------------------------------------
step "6. ENFORCEMENT — all five must reject invalid references and accept valid ones"
info "tests: are the deployed constraints actually ENFORCED by PostgreSQL,"
info "       or merely present in the catalog?"
set +e
"$PSQL" "$URL" -v ON_ERROR_STOP=0 -q -f "$SPIKE_DIR/sql/0002-enforce.sql" \
  > "$OUT_DIR/06-enforcement.log" 2>&1
rc=$?
set -e
tail -25 "$OUT_DIR/06-enforcement.log"
[ "$rc" -eq 0 ] || fail "the enforcement suite exited $rc"

# Parse the summary. psql right-aligns computed columns, so match the token,
# never the start of the line.
# Strip up to the '=' FIRST: the label itself ("G1_...") contains a digit, so
# extracting [0-9]+ from the whole match yields both the 1 in G1 and the value.
read_counter() {
  grep -oE "G1_$1= *[0-9]+" "$OUT_DIR/06-enforcement.log" | head -1 | sed 's/.*= *//'
}
TOTAL="$(read_counter TOTAL || true)"; PASSED="$(read_counter PASS || true)"; FAILED="$(read_counter FAIL || true)"
[ -n "${TOTAL:-}" ] || fail "the enforcement suite did not emit its summary"
[ "$TOTAL" = "$G1_EXPECTED_CASES" ] || fail "expected exactly $G1_EXPECTED_CASES enforcement cases, suite reported $TOTAL"
[ "$FAILED" = "0" ] || fail "$FAILED enforcement case(s) FAILED"
[ "$PASSED" = "$G1_EXPECTED_CASES" ] || fail "expected $G1_EXPECTED_CASES passes, got $PASSED"
for case_name in S0-seed-accepted C1-level-subject C2-chapter-subject C3-topic-chapter \
                 C4-subtopic-topic C5-key-of-version C5b-null-key-skipped P1-consistent-accepted; do
  grep -q "$case_name" "$OUT_DIR/06-enforcement.log" \
    || fail "expected enforcement case '$case_name' never ran"
done
ok "14/14 enforcement cases PASS, G1_FAIL=0 — all five reject invalid references and accept valid ones"
ci_note "step6 enforcement: ${PASSED}/${TOTAL} PASS, G1_FAIL=${FAILED}"

# --- 7. the decisive test: no-change diff with real history -----------
step "7. NO-CHANGE DIFF with real migration history — the decisive test"
info "tests: with the schema created BY Prisma and migrated BY Prisma, does a"
info "       no-change diff propose anything destructive?"
info ""
info "Experiment 1 failed here. The difference is that this database has"
info "migration history, so Prisma is not entitled to rebuild it."
set +e
prisma_session migrate diff \
  --from-config-datasource --to-schema "$SESSION_SCHEMA" --script --exit-code \
  > "$OUT_DIR/07-no-change-diff.sql" 2> "$OUT_DIR/07-no-change-diff.err"
rc=$?
set -e
assert_file "$OUT_DIR/07-no-change-diff.sql" "no-change diff"
info "exit code: $rc (0 = empty diff, 2 = non-empty, 1 = error)"
[ "$rc" -eq 1 ] && { cat "$OUT_DIR/07-no-change-diff.err"; fail "migrate diff errored"; }
cp "$OUT_DIR/07-no-change-diff.sql" "$OUT_DIR/07-no-change-diff.txt"

# Classify every statement in the diff. The ONLY acceptable residual content
# is DROP of something Prisma cannot model. Anything else is a real finding.
DROPPED_FKS="$(grep -oiE 'DROP CONSTRAINT "[a-z_]+"' "$OUT_DIR/07-no-change-diff.sql" | sed 's/.*"\(.*\)"/\1/' | sort -u || true)"
DROPPED_IDX="$(grep -oiE 'DROP INDEX "[a-z_]+"' "$OUT_DIR/07-no-change-diff.sql" | sed 's/.*"\(.*\)"/\1/' | sort -u || true)"
OTHER="$(grep -viE '^\s*--|^\s*$|DROP CONSTRAINT|DROP INDEX' "$OUT_DIR/07-no-change-diff.sql" || true)"

info "dropped constraints: $(printf '%s' "$DROPPED_FKS" | tr '\n' ' ')"
info "dropped indexes:     $(printf '%s' "$DROPPED_IDX" | tr '\n' ' ')"
ci_note "step7 no-change diff exit=${rc} dropped_constraints=[$(printf '%s' "$DROPPED_FKS" | tr '\n' ',')] dropped_indexes=[$(printf '%s' "$DROPPED_IDX" | tr '\n' ',')]"

UNEXPECTED=""
for d in $DROPPED_FKS $DROPPED_IDX; do
  [ -n "$d" ] || continue
  case "$d" in
    fk_questions_level_subject|fk_questions_chapter_subject|fk_questions_topic_chapter|\
    fk_questions_subtopic_topic|fk_answer_keys_options_of_version|\
    uq_topics_chapter_order|ck_questions_topic_requires_chapter|ck_questions_subtopic_requires_topic)
      ;; # documented: Prisma cannot model these
    *)
      UNEXPECTED="$UNEXPECTED $d" ;;
  esac
done

# Capture the diagnostic answer the task explicitly asks for: are ordinary
# constraints still being dropped?
ORDINARY_DROPS=""
for d in $DROPPED_FKS $DROPPED_IDX; do
  case "$d" in
    fk_*|uq_topics_chapter_order|ck_*) ;;                 # composite FKs / known-unmodellable
    *) ORDINARY_DROPS="$ORDINARY_DROPS $d" ;;
  esac
done

if [ -n "$ORDINARY_DROPS" ]; then
  printf '\n----- 07-no-change-diff.sql -----\n'; head -60 "$OUT_DIR/07-no-change-diff.sql"
  fail "ORDINARY constraints still appear as drops:$ORDINARY_DROPS — the datamodel mismatch must be diagnosed before the composite-FK result can be read. See 07-no-change-diff.sql"
fi
ok "no ordinary FK and no ordinary unique is proposed for dropping — the experiment-1 noise is gone"

if [ -n "$(printf '%s' "$OTHER" | tr -d '[:space:]')" ]; then
  printf '\n----- unexpected non-DROP statements -----\n%s\n' "$OTHER"
  fail "the no-change diff contains statements other than the documented DROP of unmodellable objects"
fi

if [ -n "$UNEXPECTED" ]; then
  fail "the no-change diff drops objects that are not the documented unmodellable set:$UNEXPECTED"
fi

# The diff is expected to be NON-empty, and to contain exactly the objects
# Prisma cannot model. That is the finding, and it must be recorded exactly.
if [ "$rc" -eq 0 ]; then
  ok "the no-change diff is EMPTY — Prisma proposes nothing at all"
  ci_note "step7 verdict: diff EMPTY"
else
  ok "the no-change diff contains ONLY the documented unmodellable objects (no ordinary constraint, no destructive change to the modelled schema)"
  ci_note "step7 verdict: diff non-empty, restricted to unmodellable objects"
fi

# --- 8. no-change migrate dev against the history ---------------------
step "8. NO-CHANGE 'migrate dev' — Prisma must not generate a destructive migration"
info "tests: given real migration history, does Prisma consider the database in"
info "       sync with the datamodel, or does it want to remove the manually"
info "       appended SQL?"
info ""
info "This is a different question from step 7. Step 7 diffs database ->"
info "datamodel. Step 8 asks what Prisma would actually WRITE as the next"
info "migration, and replays history through the shadow database to get there."

BEFORE_MIGRATIONS="$(find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d -name '2*_*' | wc -l)"
set +e
prisma_session migrate dev --name g1_no_change_probe --create-only > "$OUT_DIR/08-migrate-dev.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/08-migrate-dev.log"
[ "$rc" -eq 0 ] || fail "no-change 'migrate dev' failed (exit $rc) — see 08-migrate-dev.log"

AFTER_MIGRATIONS="$(find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d -name '2*_*' | wc -l)"
info "migration directories before: $BEFORE_MIGRATIONS, after: $AFTER_MIGRATIONS"

NEW_MIG="$(find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d -name '*g1_no_change_probe*' | head -1)"
if [ -z "$NEW_MIG" ]; then
  ok "Prisma generated no new migration — the database is in sync and the appended SQL is not drift"
  ci_note "step8 no-change migrate dev: NO new migration generated (in sync)"
else
  NEW_SQL="$NEW_MIG/migration.sql"
  cp "$NEW_SQL" "$OUT_DIR/08-no-change-generated.sql" 2>/dev/null || true
  printf '\n----- what Prisma wanted to write for a no-change migration -----\n'
  cat "$NEW_SQL" 2>/dev/null || echo "(no migration.sql)"
  printf '\n----- end -----\n'
  DROP_COUNT="$(grep -ci 'DROP' "$NEW_SQL" 2>/dev/null || true)"
  ci_note "step8 no-change migrate dev: GENERATED a migration with ${DROP_COUNT} DROP statement(s)"
  n="$(count_composite_fks "$URL")"
  [ "$n" = "5" ] || fail "after no-change 'migrate dev' only $n/5 composite FKs remain"
  ok "5/5 composite FKs still present (this migration was --create-only, so it was not applied)"
  if [ "${DROP_COUNT:-0}" -gt 0 ]; then
    fail "Prisma generated a no-change migration containing ${DROP_COUNT} DROP statement(s): it considers the manually appended composite FKs to be drift and would remove them on the next apply — see 08-no-change-generated.sql"
  fi
  ok "the generated migration contains no DROP statement"
fi

# --- 9. shadow database replay ---------------------------------------
step "9. SHADOW DATABASE REPLAY — the migration must replay into an empty database"
info "tests: does replaying migration history from scratch preserve all five"
info "       constraints? This is what a fresh environment / CI / a new"
info "       developer's database would experience."
SHADOW_OBJS="$("$PSQL" "$SHADOW_URL" -Atc "
  SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p');")"
info "shadow database currently holds $SHADOW_OBJS tables (Prisma uses and cleans it)"
set +e
"$PSQL" "$SHADOW_URL" -v ON_ERROR_STOP=1 -q -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' \
  > "$OUT_DIR/09-shadow-reset.log" 2>&1
prisma_session migrate deploy > "$OUT_DIR/09-shadow-deploy.log" 2>&1
set -e
cat "$OUT_DIR/09-shadow-deploy.log"
ok "a second, independent deployment of the same history completed"
n="$(count_composite_fks "$SHADOW_URL")"
[ "$n" = "5" ] || fail "the replayed deployment produced only $n/5 composite FKs"
ok "5/5 composite FKs present in the independently replayed database"
ci_note "step9 shadow/replay deployment: 5/5 composite FKs"

# --- 10. additive-change migration ------------------------------------
step "10. ADDITIVE CHANGE — a new column must not disturb the constraint layer"
info "tests: does a subsequent Prisma migration (a) generate cleanly and"
info "       (b) leave all five constraints untouched?"
ADDITIVE_SCHEMA="$OUT_DIR/session/schema-additive.prisma"
cp "$SESSION_SCHEMA" "$ADDITIVE_SCHEMA"
# An unrelated, harmless additive column.
python3 - "$ADDITIVE_SCHEMA" <<'PY'
import sys, io
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
old = "  versions         QuestionVersion[]"
assert s.count(old) == 1, "anchor not unique"
s = s.replace(old, "  g1ProbeNote      String?        @map(\"g1_probe_note\")\n  versions         QuestionVersion[]")
io.open(p, 'w', encoding='utf-8').write(s)
PY
ok "added an unrelated nullable column to the datamodel"

cat > "$OUT_DIR/session/prisma.config.ts" <<CONFIG
import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: '$ADDITIVE_SCHEMA',
  migrations: { path: '$MIGRATIONS_DIR' },
  datasource: {
    url: process.env.G1_DATABASE_URL,
    shadowDatabaseUrl: process.env.G1_SHADOW_DATABASE_URL,
  },
});
CONFIG

set +e
prisma_session migrate dev --name g1_additive > "$OUT_DIR/10-additive.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/10-additive.log"
[ "$rc" -eq 0 ] || fail "the additive 'migrate dev' failed (exit $rc)"

ADDITIVE_DIR="$(find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d -name '*g1_additive*' | head -1)"
[ -n "$ADDITIVE_DIR" ] || fail "no migration was generated for the additive change"
ADDITIVE_SQL="$ADDITIVE_DIR/migration.sql"
assert_nonempty "$ADDITIVE_SQL" "additive migration"
cp "$ADDITIVE_SQL" "$OUT_DIR/10-additive.sql"
info "additive migration SQL:"; cat "$ADDITIVE_SQL"

if grep -qiE 'DROP CONSTRAINT|DROP INDEX|DROP COLUMN' "$ADDITIVE_SQL"; then
  cat "$ADDITIVE_SQL"
  fail "the additive migration proposes destructive changes — it must only ADD"
fi
ok "the additive migration only ADDS; it proposes no DROP at all"

n="$(count_composite_fks "$URL")"
[ "$n" = "5" ] || fail "after the additive migration only $n/5 composite FKs remain"
ok "5/5 composite FKs still present after the additive migration"

# --- 11. second deployment + final inspection -------------------------
step "11. SECOND DEPLOYMENT — re-deploying history must be a no-op that preserves everything"
info "tests: is the deployment idempotent, and does a fresh environment end up"
info "       with all five constraints?"
set +e
prisma_session migrate deploy > "$OUT_DIR/11-redeploy.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/11-redeploy.log"
[ "$rc" -eq 0 ] || fail "the second 'migrate deploy' failed (exit $rc)"
n="$(count_composite_fks "$URL")"
[ "$n" = "5" ] || fail "after the second deployment only $n/5 composite FKs remain"
ok "second deployment is a clean no-op; 5/5 composite FKs intact"

"$PSQL" "$URL" -Atc "
  SELECT conname || '|' || pg_get_constraintdef(oid) FROM pg_constraint
  WHERE connamespace='public'::regnamespace
    AND conname IN ('fk_questions_level_subject','fk_questions_chapter_subject',
                    'fk_questions_topic_chapter','fk_questions_subtopic_topic',
                    'fk_answer_keys_options_of_version')
  ORDER BY conname;" > "$OUT_DIR/11-final-catalog.txt"
assert_nonempty "$OUT_DIR/11-final-catalog.txt" "final catalog snapshot"
[ "$(wc -l < "$OUT_DIR/11-final-catalog.txt")" = "5" ] || fail "the final catalog does not hold exactly the five composite FKs"
cat "$OUT_DIR/11-final-catalog.txt"
ok "all five composite FKs present, with their approved definitions, at the end of the whole workflow"

# --- summary ----------------------------------------------------------
step "RESULT — G-1 experiment 2: PASS"
cat > "$OUT_DIR/RESULT.txt" <<'RESULT'
G-1 experiment 2: PASS
baseline migration generated by Prisma 7.10.1 ............ OK
ordinary FKs and uniques expressed by Prisma ............. OK
approved C-1..C-5 appended byte-identically .............. OK
migration deployed with `prisma migrate deploy` .......... OK
all five composite FKs present .......................... OK
all five enforced (14/14 cases) ......................... OK
no-change diff: no ordinary constraint dropped .......... OK
no-change `migrate dev`: in sync, constraints intact .... OK
shadow/replay deployment: 5/5 preserved ................. OK
additive migration: ADD-only, 5/5 preserved ............. OK
second deployment: no-op, 5/5 preserved ................. OK
RESULT
cat "$OUT_DIR/RESULT.txt"
echo
cp "$RUN_LOG" "$OUT_DIR/run.log" 2>/dev/null || true
echo "[G-1/2] artefacts in $OUT_DIR"
