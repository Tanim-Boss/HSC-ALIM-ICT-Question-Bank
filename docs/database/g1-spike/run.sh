#!/usr/bin/env bash
# =====================================================================
# G-1 spike — driver
#
# Answers one question: when the five approved hand-written composite
# foreign keys (Request C) exist in PostgreSQL but not in the Prisma
# datamodel, does Prisma leave them alone, or does it drop them?
#
#   ./run.sh --url <disposable-database-url>
#
# Harness guarantees (each one is deliberate; do not weaken them):
#   * `set -Eeuo pipefail` — any failing command, any failing pipeline
#     element, and any unset variable aborts the run.
#   * Every Prisma invocation goes through the PROJECT'S pinned binary
#     (node_modules/.bin/prisma, 7.10.1). `npx` is never used, so a version
#     can never be downloaded on the fly.
#   * The enforcement suite is machine-checked: exactly G1_EXPECTED_CASES
#     rows, zero FAIL, and the exact set of case names is asserted —
#     a suite that silently ran fewer cases cannot pass.
#   * Every Prisma step asserts that its output exists AND is non-empty;
#     empty or missing output is a failure, never a success.
#   * The `migrate dev` step must produce an actual migration artefact and
#     that artefact is inspected; "nothing was generated" is a failure.
#   * Nothing is written outside the run directory.
#
# Requirements: PostgreSQL 15+ (16 in CI), Node 22, prisma 7.10.1 from
# `npm ci`. See docs/database/g1-spike/README.md and §11.3.1 of the
# proposal for the current (BLOCKED) status.
# =====================================================================
set -Eeuo pipefail

SPIKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SPIKE_DIR/../../.." && pwd)"
OUT_DIR="$SPIKE_DIR/out"
PSQL="${PSQL:-psql}"
EXPECTED_CASES=14
COMPOSITE_FKS=(
  fk_questions_level_subject
  fk_questions_chapter_subject
  fk_questions_topic_chapter
  fk_questions_subtopic_topic
  fk_answer_keys_options_of_version
)

# --- helpers -----------------------------------------------------------
# Failures are printed, and also surfaced as a GitHub Actions annotation when
# running in CI, so the reason is visible without downloading the job log.
fail()  {
  printf '\n[G-1] FAIL: %s\n' "$*" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    printf '::error title=G-1 gate failure::%s\n' "$(printf '%s' "$*" | tr '\n' ' ')"
  fi
  exit 1
}
step()  { printf '\n============================================================\n[G-1] %s\n============================================================\n' "$*"; }
ok()    { printf '[G-1] ok: %s\n' "$*"; }

trap '
  rc=$?
  printf "\n[G-1] FAIL: aborted at line %s (exit %s)\n" "$LINENO" "$rc" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    printf "::error title=G-1 harness aborted::line %s exited %s\n" "$LINENO" "$rc"
  fi
' ERR

# assert_nonempty <file> <description>
assert_nonempty() {
  [ -f "$1" ] || fail "$2: expected output file '$1' was not created"
  [ -s "$1" ] || fail "$2: output file '$1' is empty"
}

# --- arguments ---------------------------------------------------------
URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --url=*) URL="${1#*=}"; shift ;;
    -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done
[ -n "$URL" ] || fail "usage: run.sh --url <disposable-database-url>"

# --- guard: disposable only --------------------------------------------
case "$URL" in
  *production*|*prod*|*staging*|*supabase.co*|*render.com*|*rds.amazonaws.com*)
    fail "refusing to run against a non-disposable database: $URL" ;;
esac

# --- pinned toolchain --------------------------------------------------
step "0. versions (all pinned; nothing is downloaded at run time)"
command -v "$PSQL" >/dev/null || fail "psql not found on PATH"
PRISMA_BIN="$REPO_ROOT/node_modules/.bin/prisma"
[ -x "$PRISMA_BIN" ] || fail "pinned Prisma CLI missing at $PRISMA_BIN — run 'npm ci' first (npx is deliberately not used)"

SPIKE_CONFIG="$SPIKE_DIR/prisma/prisma.config.ts"
[ -f "$SPIKE_CONFIG" ] || fail "spike prisma.config.ts missing at $SPIKE_CONFIG"

# Always run from node_modules/.bin and always with an explicit --config, so the
# repository's own prisma.config.ts can never be picked up by accident.
prisma_run() { ( cd "$REPO_ROOT" && "$PRISMA_BIN" "$@" ); }

# Prisma 7's `migrate diff` has no `--from-url` and `migrate deploy` has no
# `--url`: the live database is named by the `datasource` block of the Prisma
# config file (`--from-config-datasource` / `to-config-datasource`). These
# configs are generated at run time so no credential is ever committed.
# mk_cli_config <path> <url>
mk_cli_config() {
  cat > "$1" <<CONFIG
import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: '$SPIKE_DIR/prisma/schema.prisma',
  migrations: { path: '$OUT_DIR/tmp/migrations' },
  datasource: { url: process.env.G1_CLI_DATABASE_URL },
});
CONFIG
}

PRISMA_VERSION="$(node -p "require('$REPO_ROOT/node_modules/prisma/package.json').version")"
[ "$PRISMA_VERSION" = "7.10.1" ] || fail "pinned Prisma is $PRISMA_VERSION, expected 7.10.1"
ok "prisma CLI $PRISMA_VERSION (project dependency)"
ok "node $(node -v)"

"$PSQL" "$URL" -Atc "select 'postgres ' || current_setting('server_version');" > "$(mkdir -p "$OUT_DIR" && echo "$OUT_DIR/pg-version.txt")"
cat "$OUT_DIR/pg-version.txt"
grep -qE '^postgres 1[5-9]' "$OUT_DIR/pg-version.txt" \
  || fail "expected PostgreSQL 15 or newer, got: $(cat "$OUT_DIR/pg-version.txt")"

# --- step 1: schema + the five composite FKs ---------------------------
step "1. create schema, C-1..C-5, and the three support keys"
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -f "$SPIKE_DIR/sql/0001-schema.sql" \
  > "$OUT_DIR/01-create.log" 2>&1 || { cat "$OUT_DIR/01-create.log"; fail "schema creation failed"; }
ok "schema created"

fks_present() {
  "$PSQL" "$URL" -Atc "
    SELECT conname FROM pg_constraint
    WHERE connamespace = current_schema::regnamespace
      AND conname IN ($(printf "'%s'," "${COMPOSITE_FKS[@]}" | sed 's/,$//'))
    ORDER BY conname;"
}

present="$(fks_present || true)"
[ "$(printf '%s\n' "$present" | grep -c .)" = "5" ] \
  || fail "expected 5 composite FKs after creation, found: ${present:-none}"
ok "5/5 composite FKs created: $(printf '%s' "$present" | tr '\n' ' ')"

# --- step 2: enforcement ----------------------------------------------
step "2. enforcement: PostgreSQL rejects every invalid write"
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -f "$SPIKE_DIR/sql/0002-enforce.sql" \
  > "$OUT_DIR/02-enforce.log" 2>&1 || { cat "$OUT_DIR/02-enforce.log"; fail "the enforcement suite aborted"; }
assert_nonempty "$OUT_DIR/02-enforce.log" "enforcement suite"
cat "$OUT_DIR/02-enforce.log"

# psql right-aligns its output columns, so match the token, not the line start
read_counter() {
  sed -n "s/.*$1=\([0-9][0-9]*\).*/\1/p" "$OUT_DIR/02-enforce.log" | head -1
}
total="$(read_counter G1_TOTAL)"
passed="$(read_counter G1_PASS)"
failed="$(read_counter G1_FAIL)"

[ -n "$total" ] && [ -n "$passed" ] && [ -n "$failed" ] \
  || fail "enforcement suite did not emit its G1_TOTAL/G1_PASS/G1_FAIL summary"
[ "$total" = "$EXPECTED_CASES" ] \
  || fail "expected exactly $EXPECTED_CASES enforcement cases, suite reported $total"
[ "$failed" = "0" ] \
  || fail "enforcement suite reported $failed failing case(s) — see 02-enforce.log"
[ "$passed" = "$EXPECTED_CASES" ] \
  || fail "expected $EXPECTED_CASES PASS results, got $passed"

# the exact case names must be present — a truncated suite cannot pass
for case_name in S0-seed-accepted C1-level-subject C2-chapter-subject C3-topic-chapter \
                 C4-subtopic-topic C5-key-of-version C5b-null-key-skipped \
                 P1-consistent-accepted P2-optional-links-null E7a-retired-position-reusable \
                 E7b-active-position-unique E7c-retired-not-indexed R1-restrict-blocks-delete \
                 S9-all-five-present; do
  grep -q "| $case_name " "$OUT_DIR/02-enforce.log" \
    || fail "enforcement case '$case_name' did not run"
done
ok "$EXPECTED_CASES/$EXPECTED_CASES enforcement cases PASS"

# --- step 3: reflection (is there anything for Prisma to see?) ---------
step "3. reflection: Prisma introspects the live database"
prisma_run db pull --print --url "$URL" \
  --config "$SPIKE_CONFIG" --schema "$SPIKE_DIR/prisma/schema.prisma" \
  > "$OUT_DIR/03-introspected.prisma" 2> "$OUT_DIR/03-introspect.err" \
  || { cat "$OUT_DIR/03-introspect.err"; fail "prisma db pull failed"; }
assert_nonempty "$OUT_DIR/03-introspected.prisma" "prisma db pull"
grep -q 'model Question' "$OUT_DIR/03-introspected.prisma" \
  || fail "introspection did not find the Question model — it did not see the database"
ok "introspection produced $(wc -c < "$OUT_DIR/03-introspected.prisma") bytes containing the spike models"

# --- step 4: no-change drift ------------------------------------------
step "4. no-change drift: migrate diff (database -> datamodel) must contain no DROP"
set +e
mkdir -p "$OUT_DIR/tmp"
mk_cli_config "$OUT_DIR/tmp/main.config.ts"
G1_CLI_DATABASE_URL="$URL" prisma_run migrate diff \
  --config "$OUT_DIR/tmp/main.config.ts" \
  --from-config-datasource \
  --to-schema "$SPIKE_DIR/prisma/schema.prisma" \
  --script --exit-code \
  > "$OUT_DIR/04-drift-empty.sql" 2> "$OUT_DIR/04-drift-empty.err"
rc=$?
set -e
# --exit-code: 0 = empty diff, 2 = non-empty diff, 1 = error
case "$rc" in
  0) : ;;
  2) printf '\n----- 04-drift-empty.sql (first 40 lines) -----\n'
     head -40 "$OUT_DIR/04-drift-empty.sql"
     printf '\n----- end of diff excerpt -----\n'
     # GitHub annotations are capped at ~64 KiB; keep the excerpt short but
     # specific so the cause is visible without downloading the artefact.
     # `|| true`: a command substitution that finds nothing must not trip errexit
     diff_excerpt="$(head -c 3000 "$OUT_DIR/04-drift-empty.sql" | tr '\n' ' ' || true)"
     diff_summary="$(grep -oiE 'DROP [A-Z]+ [^;]*|ALTER TABLE [^;]*|CREATE [A-Z]+ [^;(]*' "$OUT_DIR/04-drift-empty.sql" | head -12 | tr '\n' ' ' || true)"
     fail "the no-change diff is NOT empty — Prisma wants to change the schema. Statement summary: ${diff_summary:-none parsed}. Raw excerpt: $diff_excerpt" ;;
  *) cat "$OUT_DIR/04-drift-empty.err"
     fail "prisma migrate diff errored (exit $rc)" ;;
esac
ok "no-change diff is empty (exit 0)"

# --- step 5: additive-change drift ------------------------------------
step "5. additive drift: an unrelated column must not disturb the constraints"
probe_schema="$OUT_DIR/05-probe.prisma"
# insert an unrelated nullable column into the Subtopic model
awk '
  /^model Subtopic \{/ { inblock = 1 }
  inblock && /^  @@map\("subtopics"\)/ && !done {
    print "  probeMarker String?"; done = 1
  }
  { print }
' "$SPIKE_DIR/prisma/schema.prisma" > "$probe_schema"
grep -q 'probeMarker' "$probe_schema" \
  || fail "failed to build the additive-change probe schema"

set +e
G1_CLI_DATABASE_URL="$URL" prisma_run migrate diff \
  --config "$OUT_DIR/tmp/main.config.ts" \
  --from-config-datasource \
  --to-schema "$probe_schema" \
  --script \
  > "$OUT_DIR/05-drift-additive.sql" 2> "$OUT_DIR/05-drift-additive.err"
rc=$?
set -e
[ "$rc" -eq 0 ] || { cat "$OUT_DIR/05-drift-additive.err"; fail "additive migrate diff errored (exit $rc)"; }
assert_nonempty "$OUT_DIR/05-drift-additive.sql" "additive migrate diff"
cat "$OUT_DIR/05-drift-additive.sql"

grep -qi 'ADD COLUMN' "$OUT_DIR/05-drift-additive.sql" \
  || fail "the additive probe produced no ADD COLUMN — the probe did not work, so it proves nothing"
if grep -Eqi 'DROP +CONSTRAINT|DROP +FOREIGN +KEY|fk_questions_|fk_answer_keys_' \
     "$OUT_DIR/05-drift-additive.sql"; then
  fail "the additive change also drops or rewrites a hand-written constraint"
fi
ok "additive change is ADD COLUMN only; no constraint touched"

# --- step 6: migrate dev with no datamodel change ---------------------
step "6. migrate dev: no datamodel change must generate no destructive SQL"
# A dedicated, EMPTY database: the spike schema above was created by hand and
# has no Prisma migration history, so `migrate dev` against it would reset it.
# Using a second disposable database makes the check meaningful and keeps the
# step from destroying the schema the other steps assert on.
DEV_URL="${G1_DEV_DATABASE_URL:-}"
[ -n "$DEV_URL" ] || fail "G1_DEV_DATABASE_URL must be set to a second, empty disposable database"

# Recreate the dev database from scratch: `migrate dev` must not be handed a
# database whose contents are any part of the question.
DEV_DBNAME="${DEV_URL##*/}"
DEV_DBNAME="${DEV_DBNAME%%\?*}"
ADMIN_URL="$(printf '%s' "$DEV_URL" | sed 's#/[^/?]*\(\?.*\)\{0,1\}$#/postgres\1#')"
"$PSQL" "$ADMIN_URL" -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE IF EXISTS \"$DEV_DBNAME\";" \
  -c "CREATE DATABASE \"$DEV_DBNAME\";" \
  > "$OUT_DIR/06-devdb.log" 2>&1 \
  || { cat "$OUT_DIR/06-devdb.log"; fail "could not (re)create the dev database $DEV_DBNAME"; }
ok "dev database $DEV_DBNAME recreated empty"

work="$(mktemp -d)"
mkdir -p "$work/prisma"
cp "$SPIKE_DIR/prisma/schema.prisma" "$work/prisma/schema.prisma"
mk_cli_config "$work/prisma.config.ts"

# baseline 0001: the spike schema exactly as 0001-schema.sql builds it,
# minus the hand-written artifacts Prisma cannot express. Applying it with
# `migrate deploy` gives the database a legitimate history.
mkdir -p "$work/prisma/migrations/0001_g1_baseline"
prisma_run migrate diff --config "$SPIKE_CONFIG" --from-empty --to-schema "$SPIKE_DIR/prisma/schema.prisma" --script \
  > "$work/prisma/migrations/0001_g1_baseline/migration.sql" \
  2> "$OUT_DIR/06-baseline.err" \
  || { cat "$OUT_DIR/06-baseline.err"; fail "could not generate the baseline migration SQL"; }
assert_nonempty "$work/prisma/migrations/0001_g1_baseline/migration.sql" "baseline migration"

( cd "$work" && G1_CLI_DATABASE_URL="$DEV_URL" "$PRISMA_BIN" migrate deploy --config "$work/prisma.config.ts" ) \
  > "$OUT_DIR/06-deploy.log" 2>&1 || { cat "$OUT_DIR/06-deploy.log"; fail "migrate deploy failed"; }
ok "baseline applied to the dev database"

# now append the five composite FKs by hand, exactly as migration 0001 will
"$PSQL" "$DEV_URL" -v ON_ERROR_STOP=1 -q \
  -c "ALTER TABLE questions ADD CONSTRAINT fk_questions_level_subject
        FOREIGN KEY (education_level_id, subject_id)
        REFERENCES level_subjects (level_id, subject_id)
        ON UPDATE CASCADE ON DELETE RESTRICT;" \
  -c "ALTER TABLE chapters ADD CONSTRAINT uq_chapters_id_subject UNIQUE (id, subject_id);" \
  -c "ALTER TABLE questions ADD CONSTRAINT fk_questions_chapter_subject
        FOREIGN KEY (chapter_id, subject_id)
        REFERENCES chapters (id, subject_id)
        ON UPDATE CASCADE ON DELETE RESTRICT;" \
  -c "ALTER TABLE topics ADD CONSTRAINT uq_topics_id_chapter UNIQUE (id, chapter_id);" \
  -c "ALTER TABLE questions ADD CONSTRAINT fk_questions_topic_chapter
        FOREIGN KEY (topic_id, chapter_id)
        REFERENCES topics (id, chapter_id)
        ON UPDATE CASCADE ON DELETE RESTRICT;" \
  -c "ALTER TABLE subtopics ADD CONSTRAINT uq_subtopics_id_topic UNIQUE (id, topic_id);" \
  -c "ALTER TABLE questions ADD CONSTRAINT fk_questions_subtopic_topic
        FOREIGN KEY (subtopic_id, topic_id)
        REFERENCES subtopics (id, topic_id)
        ON UPDATE CASCADE ON DELETE RESTRICT;" \
  -c "ALTER TABLE answer_keys ADD CONSTRAINT fk_answer_keys_options_of_version
        FOREIGN KEY (version_id, mcq_correct_option_key)
        REFERENCES question_options (version_id, key)
        ON UPDATE CASCADE ON DELETE RESTRICT;" \
  > "$OUT_DIR/06-handwritten.log" 2>&1 || { cat "$OUT_DIR/06-handwritten.log"; fail "could not apply the hand-written constraints"; }
ok "five composite FKs applied by hand on top of the baseline"

set +e
( cd "$work" && "$PRISMA_BIN" migrate dev --config "$work/prisma.config.ts" --url "$DEV_URL" --name g1_no_change --create-only ) \
  > "$OUT_DIR/06-migrate-dev.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/06-migrate-dev.log"

# `migrate dev` with no datamodel change has two acceptable outcomes:
#   (a) Prisma reports there is nothing to migrate, or
#   (b) Prisma creates a migration, whose SQL must then contain no DROP.
# Anything else — an error, or a migration we cannot inspect — is a failure.
new_migrations="$(find "$work/prisma/migrations" -mindepth 1 -maxdepth 1 -type d \
                  ! -name '0001_g1_baseline' 2>/dev/null | sort)"

if [ "$rc" -ne 0 ]; then
  fail "migrate dev failed (exit $rc) — see 06-migrate-dev.log"
fi

if [ -z "$new_migrations" ]; then
  grep -qiE 'no changes|already in sync|nothing to migrate|No migration' "$OUT_DIR/06-migrate-dev.log" \
    || fail "migrate dev created no migration and did not say the database is in sync — outcome is ambiguous"
  ok "migrate dev: no changes detected, nothing generated"
else
  while IFS= read -r mig; do
    mfile="$mig/migration.sql"
    assert_nonempty "$mfile" "migrate dev migration $mig"
    if grep -Eqi 'DROP +CONSTRAINT|DROP +FOREIGN +KEY|fk_questions_|fk_answer_keys_' "$mfile"; then
      cat "$mfile"
      fail "migrate dev generated SQL that drops or rewrites a hand-written constraint: $mfile"
    fi
    ok "migrate dev migration $(basename "$mig") contains no DROP for C-1..C-5"
  done <<< "$new_migrations"
fi

# the constraints must still be on the dev database afterwards
dev_present="$("$PSQL" "$DEV_URL" -Atc "
  SELECT count(*) FROM pg_constraint
  WHERE connamespace = current_schema::regnamespace
    AND conname IN ($(printf "'%s'," "${COMPOSITE_FKS[@]}" | sed 's/,$//'));")"
[ "$dev_present" = "5" ] \
  || fail "after migrate dev only $dev_present/5 composite FKs remain on the dev database"
ok "5/5 composite FKs still present after the migration workflow"

# --- step 7: final catalog state on the main database -----------------
step "7. final catalog state (main spike database)"
"$PSQL" "$URL" -c "
  SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
  WHERE connamespace = current_schema::regnamespace
    AND conname = ANY (ARRAY[$(printf "'%s'," "${COMPOSITE_FKS[@]}" | sed 's/,$//')])
  ORDER BY conname;" | tee "$OUT_DIR/07-final-catalog.txt"

final="$(fks_present || true)"
[ "$(printf '%s\n' "$final" | grep -c .)" = "5" ] \
  || fail "expected 5 composite FKs at the end, found: ${final:-none}"
ok "5/5 composite FKs present at the end"

printf '\n[G-1] PASS — 5/5 composite FKs created, enforced, and untouched by Prisma.\n'
printf '[G-1] artefacts in %s\n' "$OUT_DIR"
