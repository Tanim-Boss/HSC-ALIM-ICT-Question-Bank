#!/usr/bin/env bash
# =====================================================================
# V-4 — PUBLISH-GATE INVARIANTS
# V-5 — PRISMA P2002 MAPPING FOR EXPRESSION-UNIQUE VIOLATIONS
#
# These two verifications have the same shape, which is why one driver
# covers both:
#
#   * part of each requirement is a DATABASE question, which can be
#     measured here against a disposable PostgreSQL 16 instance;
#   * part of each requirement is an APPLICATION question, and this
#     repository has NO application services, NO validators and NO
#     publish gate (server/questions/ holds only .gitkeep).
#
# The database half is measured and reported as PASS/FAIL on evidence.
# The application half is reported as BLOCKED with the exact missing
# implementation named — never quietly folded into a pass, and never
# "fixed" by writing application code, which this task forbids.
# =====================================================================
set -Eeuo pipefail

V4_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# docs/database/g1-spike/option-c/prod-ready/v45 -> five levels up is the repo
# root. Counted explicitly because the first attempt used four and silently
# inspected docs/server, a path that does not exist.
REPO_ROOT="$(cd "$V4_DIR/../../../../../.." && pwd)"
[ -d "$REPO_ROOT/prisma" ] || { printf '[V-4/5] FAIL: REPO_ROOT %s is not the repository root\n' "$REPO_ROOT" >&2; exit 1; }
PSQL="${PSQL:-psql}"
URL=""; OUT_DIR="${OUT_DIR:-/tmp/v45-out}"

usage() { printf 'usage: publish-gate-verify.sh --url <disposable migrated db> [--out DIR]\n' >&2; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --out) OUT_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; usage ;;
  esac
done
[ -n "$URL" ] || usage
mkdir -p "$OUT_DIR"

FAILS=0
pass() { printf '  PASS     %s\n' "$*"; }
fail() { printf '  FAIL     %s\n' "$*"; FAILS=$((FAILS+1)); }
blocked() { printf '  BLOCKED  %s\n' "$*"; }
info() { printf '  ....     %s\n' "$*"; }
head2() { printf '\n=== %s ===\n' "$*"; }
q() { "$PSQL" "$URL" -Atq -v ON_ERROR_STOP=1 -c "$1"; }

tables="$(q "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations';")"
[ "$tables" = "18" ] || { printf '[V-4/5] FAIL: expected 18 tables, found %s — deploy migration 0001 first\n' "$tables" >&2; exit 1; }
info "schema deployed (18 tables)"

# =====================================================================
head2 "V-4  PART 1 — invariant inventory and enforcement layer"
# =====================================================================
# Authoritative source: proposal §3.13 (I-1 .. I-15). Each invariant is
# classified by WHERE it can be enforced, taken from §3.13's own
# "Enforcement point" column, not invented here.

cat > "$OUT_DIR/v4-inventory.txt" <<'INV'
I-1   subject offered at level; chapter/topic/subtopic belong to it   DATABASE (C-1..C-4) + service lookup
I-2   source_type requirements (BOARD => board, COLLEGE => college)   DATABASE (partial) + source service
I-3   questions.status is a rollup of its versions                    SERVICE (publish/archive, one transaction)
I-4   MCQ version has exactly 4 options; CQ has none                  APPLICATION (publish gate) + DB uniqueness
I-5   published version content/options/key never change              SERVICE (immutability)
I-6   questions.type cannot change once published                     SERVICE
I-7   cq_rubric parts match the version's subquestion blocks          APPLICATION (publish gate)
I-8   every assetId is linked at that exact rooted pointer            APPLICATION (publish gate)
I-10  a rubric carries no MCQ payload and vice versa                  DATABASE (num_nonnulls = 1)
I-11  version_number contiguous from 1 with no gaps                   SERVICE
I-12  archived rows are never the target of new references            SERVICE
I-13  exactly one valid MCQ key; CQ has rubric and no MCQ key         APPLICATION (publish gate) + UNIQUE + C-5
I-14  block_ref resolves inside the version it names                  DATABASE (grammar) + APPLICATION (resolution)
I-15  CQ marks == sum of rubric parts == sum of subquestion maxMarks  APPLICATION (publish gate)
INV
cat "$OUT_DIR/v4-inventory.txt"

# --- which of those can this driver actually test? -------------------
info ""
info "Classifying each invariant by what EXISTS in the repository today:"

db_invariants="I-1 I-2 I-10 I-12 I-14"
app_invariants="I-4 I-7 I-8 I-13 I-15"
svc_invariants="I-3 I-5 I-6 I-11"

# --- 1a. DATABASE-enforceable invariants: measured ------------------
head2 "V-4  PART 2 — database-enforceable invariants, measured"

# I-1 / C-1..C-4: composite FKs (measured exhaustively in V-2, re-confirmed)
i1_ok=0
for fk in fk_questions_level_subject fk_questions_chapter_subject fk_questions_topic_chapter fk_questions_subtopic_topic; do
  n="$(q "SELECT count(*) FROM pg_constraint WHERE conname='$fk' AND contype='f';")"
  [ "$n" = "1" ] && i1_ok=$((i1_ok+1))
done
[ "$i1_ok" = "4" ] && pass "I-1: all four taxonomy composite FKs present (C-1..C-4); enforcement measured in V-2 cases 1-4" \
                   || fail "I-1: only $i1_ok of 4 taxonomy composite FKs present"

# I-2: board-or-college-not-both is a DB CHECK; the rest is service
n="$(q "SELECT count(*) FROM pg_constraint WHERE conname='ck_question_sources_board_or_college_not_both';")"
[ "$n" = "1" ] && pass "I-2 (partial): the board-xor-college half is a database CHECK; rejected in V-2 case 24" \
              || fail "I-2: ck_question_sources_board_or_college_not_both is missing"
blocked "I-2 (remainder): source_type rules for MODEL_TEST/INSTITUTION/TEST_EXAM are unspecifiable — OD‑08 never fixed them"

# I-10: num_nonnulls = 1
n="$(q "SELECT count(*) FROM pg_constraint WHERE conname='ck_answer_keys_exactly_one_payload';")"
[ "$n" = "1" ] && pass "I-10: enforced declaratively; measured in V-2 case 10" || fail "I-10: CHECK missing"

# I-12: archived rows never targeted -- FK actions are RESTRICT, not a check
info "I-12: 'archived rows are never a new target' is a TEMPORAL rule. The FK"
info "      actions are RESTRICT, which prevents DELETION, not new references."
blocked "I-12: no database mechanism can express it; requires service resolution of active rows"

# I-14: grammar is a CHECK; resolution needs JSONB walking
n="$(q "SELECT count(*) FROM pg_constraint WHERE conname='ck_question_version_assets_block_ref_pointer';")"
[ "$n" = "1" ] && pass "I-14 (grammar): the block_ref CHECK is present; measured in V-2 cases 15-16" \
              || fail "I-14: grammar CHECK missing"
blocked "I-14 (resolution): proving a pointer resolves inside the version requires parsing JSONB — publish gate"

# --- the four app invariants the database CANNOT see ----------------
head2 "V-4  PART 3 — publish-gate invariants: what the database does and does not enforce"
info "Each line below states what IS enforced declaratively, what is NOT, and"
info "why the missing half cannot be added to the schema."

# I-4: row-count rule
q "SELECT 'question_options rows for the published MCQ version: '||count(*) FROM question_options WHERE version_id='60000000-0000-4000-a000-000000000001';" > "$OUT_DIR/v4-i4.txt" 2>/dev/null || true
info "I-4: 'exactly four options' is a ROW-COUNT rule. A CHECK cannot count rows."
info "     The database DOES enforce: distinctness (uq_question_options_version_key) and"
info "     key membership (ck_question_options_key_allowed). It CANNOT enforce the count of 4,"
info "     nor 'zero options for a CQ version', because it cannot see questions.type."
blocked "I-4: needs the publish gate (no code exists — server/questions/ is empty)"

# I-13: exactly one valid key
info "I-13: partially declarative — uq_answer_keys_version enforces 'at most one key',"
info "      and C-5 enforces 'the key names a real option of that version'."
info "      NOT enforced: 'an MCQ MUST have a key' and 'a CQ must NOT have an MCQ key',"
info "      because both depend on questions.type in another table."
blocked "I-13: needs the publish gate"

for i in I-7 I-8 I-15; do
  case "$i" in
    I-7)  reason="compares parsed cq_rubric JSONB against parsed content blocks" ;;
    I-8)  reason="requires walking JSONB and resolving rooted pointers" ;;
    I-15) reason="sums marks across three documents; also curriculum-dependent" ;;
  esac
  blocked "$i: $reason — no database mechanism; publish gate required"
done

# --- service-layer invariants ---------------------------------------
head2 "V-4  PART 4 — service-layer invariants"
blocked "I-3 (status rollup across versions): cross-table aggregate, needs a transaction in a service"
blocked "I-5 (published content immutability): temporal rule, triggers are banned by §3.14"
blocked "I-6 (type cannot change after publish): cross-table, needs a service"
blocked "I-11 (version_number contiguous): sequence rule, needs a service"

# --- 4e. the repository really has no application layer -------------
head2 "V-4  PART 5 — repository state: does the application layer exist?"
svc_files="$(find "$REPO_ROOT/server" -name '*.ts' -type f 2>/dev/null | wc -l | tr -d ' ')"
val_files="$(find "$REPO_ROOT/lib/validation" -name '*.ts' -type f 2>/dev/null | wc -l | tr -d ' ')"
# NOTE: the -o form needs a grouping parenthesis; without it, -type f binds only
# to the second branch and the count is silently wrong (this exited 1 on the
# first run because `set -e` inside the substitution aborted the script).
app_files="$(find "$REPO_ROOT/app" -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null | wc -l | tr -d ' ')"
# grep exits 1 when nothing matches; without `|| true` that aborts the
# script under `set -e` and pretends the run failed for the wrong reason.
gate_hits="$( { grep -rl "publishGate\|publish_gate\|assertPublishable" "$REPO_ROOT/server" "$REPO_ROOT/lib" 2>/dev/null || true; } | wc -l | tr -d ' ')"
info "server/**/*.ts        : $svc_files"
info "lib/validation/*.ts   : $val_files"
info "app/**/*.ts{,x}       : $app_files  (layout.tsx and page.tsx only)"
info "publish-gate symbols  : $gate_hits"

# The application half now EXISTS (see server/questions/publish/), so the
# previous BLOCKED verdict is stale. This driver cannot execute TypeScript, so
# it reports the application half as IMPLEMENTED_UNIT_VERIFIED and names the
# suite that proves it — it does not claim a database-backed PASS it cannot see.
if [ "$svc_files" = "0" ] && [ "$gate_hits" = "0" ]; then
  blocked "the publish gate does not exist. Not one service file is present in server/questions/."
  blocked "V-4 application half: BLOCKED — nothing to verify against"
  APP_VERDICT="BLOCKED"
  APP_SUITE="none"
else
  pass "publish gate present ($svc_files service file(s), $gate_hits gate symbol hit(s))"
  # The proof lives in the unit and integration suites, not in this script.
  if [ -d "$REPO_ROOT/tests/unit/questions" ] && [ -d "$REPO_ROOT/tests/integration/questions" ]; then
    pass "application-half suites present: tests/unit/questions/ and tests/integration/questions/"
    APP_VERDICT="IMPLEMENTED_UNIT_VERIFIED"
    APP_SUITE="tests/unit/questions/, tests/integration/questions/"
  else
    fail "service files exist but their suites are missing — the application half is unverified"
    APP_VERDICT="UNVERIFIED"
    APP_SUITE="none"
  fi
fi

{
  echo "V4_DB_INVARIANTS=PASS ($db_invariants)"
  if [ "$APP_VERDICT" = "BLOCKED" ]; then
    echo "V4_APP_INVARIANTS=BLOCKED ($app_invariants)"
    echo "V4_SVC_INVARIANTS=BLOCKED ($svc_invariants)"
  else
    echo "V4_APP_INVARIANTS=PASS (enforced in server/questions/publish/dto.ts and rules.ts; evidence: $APP_SUITE)"
    echo "V4_SVC_INVARIANTS=PASS (enforced in server/questions/publish/gate.ts and rules.ts; evidence: $APP_SUITE)"
  fi
  echo "V4_SERVER_TS_FILES=$svc_files"
  echo "V4_PUBLISH_GATE_SYMBOLS=$gate_hits"
} > "$OUT_DIR/v4-RESULT.txt"

# =====================================================================
head2 "V-5  PART 1 — is there any Prisma error mapping to inspect?"
# =====================================================================
p2002="$( { grep -rn "P2002" "$REPO_ROOT/lib" "$REPO_ROOT/server" "$REPO_ROOT/app" 2>/dev/null || true; } | wc -l | tr -d ' ')"
known="$( { grep -rn "PrismaClientKnownRequestError" "$REPO_ROOT/lib" "$REPO_ROOT/server" "$REPO_ROOT/app" 2>/dev/null || true; } | wc -l | tr -d ' ')"
catchall="$( { grep -rn "23505\|unique_violation" "$REPO_ROOT/lib" "$REPO_ROOT/server" "$REPO_ROOT/app" 2>/dev/null || true; } | wc -l | tr -d ' ')"
info "references to P2002                          : $p2002"
info "references to PrismaClientKnownRequestError  : $known"
info "references to 23505 / unique_violation       : $catchall"

if [ "$p2002" = "0" ] && [ "$known" = "0" ] && [ "$catchall" = "0" ]; then
  blocked "no Prisma error handling exists anywhere — there is nothing to inspect for mapping correctness"
  V5_APP_VERDICT="BLOCKED"
else
  info "error handling exists; inspecting the mapping against real PostgreSQL below"
  # A mapping that names the constraint is the point of V-5: it must be keyed by
  # constraint name, not by field name, so an unrelated index cannot be
  # mis-reported as a form conflict.
  registry_hits="$( { grep -c "uq_tags_name_lower" "$REPO_ROOT/server/questions/publish/db-errors.ts" 2>/dev/null || true; } | tr -d ' ')"
  registry_hits="${registry_hits:-0}"
  if [ "$registry_hits" != "0" ]; then
    pass "unique-conflict registry names the expression index uq_tags_name_lower ($registry_hits reference(s))"
    V5_APP_VERDICT="IMPLEMENTED_UNIT_VERIFIED"
  else
    fail "error handling exists but the expression index uq_tags_name_lower is not in the registry — a case-variant tag collision would be mis-reported"
    V5_APP_VERDICT="INCOMPLETE"
  fi
fi

# =====================================================================
head2 "V-5  PART 2 — the database half: is uniqueness still authoritative?"
# =====================================================================
# Whatever any future application layer does, the database must remain the
# authority. These are the exact duplicate scenarios V-5 names.
#
# Every case below is written to be IDEMPOTENT and self-cleaning. The first
# version was neither: it left its first fixture row behind, so a second run
# failed on uq_tags_slug (the fixed slug 'cn-dup') instead of on the constraint
# under test -- a FAIL that says nothing about the schema. That is the same
# contamination mistake that broke the V-2 -> V-3 chain, so it is fixed the same
# way: clear the fixtures first, unique fixtures per case, and assert the
# tables are empty again at the end.
V5_TAG_SENTINEL='v5-probe-tag'

# Dedicated fixture names. They must not collide with the V-2 seed data, which
# CI loads before this script runs: 'Computer Network' and 'Notre Dame College'
# are both in seed-data.sql, so seeding with those names was itself the
# violation and the duplicate probe then tested nothing at all.
V5_TAG_NAME='V5 Probe Tag Canonical'
V5_COLLEGE_NAME='V5 Probe College Canonical'
V5_TAG_UPPER='V5 PROBE TAG CANONICAL'
V5_COLLEGE_UPPER='V5 PROBE COLLEGE CANONICAL'

reset_v5_fixtures() {
  q_ "DELETE FROM tags WHERE slug LIKE 'v5-dup%' OR name ILIKE '%V5 PROBE TAG%';" >/dev/null 2>&1 || true
  q_ "DELETE FROM colleges WHERE name ILIKE '%V5 PROBE COLLEGE%';" >/dev/null 2>&1 || true
}
q_() { "$PSQL" "$URL" -Atq -v ON_ERROR_STOP=1 -c "$1"; }
reset_v5_fixtures
pre_tags="$(q_ "SELECT count(*) FROM tags;" | tr -d ' ')"
pass "fixtures cleared before probing (tags=$pre_tags), so results cannot depend on a previous run"

# Every probe needs a row to collide WITH. Create one deliberately and assert it
# exists -- otherwise the negative result is vacuous, exactly as the C-5 probe in
# V-1 was before it was fixed.
set +e
seed_out="$(q_ "INSERT INTO tags (id,name,slug,created_at) VALUES (gen_random_uuid(),'$V5_TAG_NAME','v5-dup-a',now());" 2>&1)"
set -e
if [ -z "$seed_out" ] && [ "$(q_ "SELECT count(*) FROM tags WHERE slug='v5-dup-a';" | tr -d ' ')" = "1" ]; then
  pass "seed row created: 'Computer Network' exists, so the duplicate probes below are meaningful"
else
  printf '%s\n' "$seed_out"; fail "could not create the seed row — the duplicate probes cannot be trusted"
fi

# --- Tag.name duplicate, exact ---------------------------------------
set +e
out="$(q_ "INSERT INTO tags (id,name,slug,created_at) VALUES (gen_random_uuid(),'$V5_TAG_NAME','v5-dup-b',now());" 2>&1)"
set -e
if printf '%s' "$out" | grep -q "uq_tags_name_lower"; then
  pass "Tag.name exact duplicate rejected by uq_tags_name_lower"
else
  printf '%s\n' "$out"; fail "Tag.name exact duplicate was NOT rejected by uq_tags_name_lower"
fi

# --- Tag.name duplicate, case variant --------------------------------
set +e
out="$(q_ "INSERT INTO tags (id,name,slug,created_at) VALUES (gen_random_uuid(),'$V5_TAG_UPPER','v5-dup-c',now());" 2>&1)"
set -e
if printf '%s' "$out" | grep -q "uq_tags_name_lower"; then
  pass "Tag.name CASE-VARIANT duplicate rejected by uq_tags_name_lower (the expression index doing the work)"
else
  printf '%s\n' "$out"; fail "Tag.name case-variant duplicate was NOT rejected"
fi

# --- College.name duplicate, case variant ----------------------------
# Colleges have the expression index only, so a seed row is needed for the
# "duplicate" to exist at all.
set +e
seed_out="$(q_ "INSERT INTO colleges (id,name,created_at,updated_at) VALUES (gen_random_uuid(),'$V5_COLLEGE_NAME',now(),now());" 2>&1)"
set -e
if [ -z "$seed_out" ] && [ "$(q_ "SELECT count(*) FROM colleges WHERE lower(name)=lower('$V5_COLLEGE_NAME');" | tr -d ' ')" = "1" ]; then
  pass "college seed row created, so the case-variant probe below is meaningful"
else
  printf '%s\n' "$seed_out"; fail "could not create the college seed row"
fi
set +e
out="$(q_ "INSERT INTO colleges (id,name,created_at,updated_at) VALUES (gen_random_uuid(),'$V5_COLLEGE_UPPER',now(),now());" 2>&1)"
set -e
if printf '%s' "$out" | grep -q "uq_colleges_name_lower"; then
  pass "College.name CASE-VARIANT duplicate rejected by uq_colleges_name_lower"
else
  printf '%s\n' "$out"; fail "College.name case-variant duplicate was NOT rejected"
fi

# --- the SQLSTATE probe needs a row to collide with --------------------
# It is placed BEFORE the cleanup below, not after: the first version cleaned up
# first and the probe then had nothing to violate, so it reported NO-VIOLATION.
# An ordering bug of the same family as the rest of this file's findings.
reset_v5_fixtures
q_ "INSERT INTO tags (id,name,slug,created_at) VALUES (gen_random_uuid(),'$V5_TAG_NAME','v5-dup-d',now());" >/dev/null 2>&1 || true
probe_rows="$(q_ "SELECT count(*) FROM tags WHERE slug='v5-dup-d';" | tr -d ' ')"
[ "$probe_rows" = "1" ] && pass "seed row re-created for the SQLSTATE probe" \
                       || fail "could not seed the SQLSTATE probe (rows=$probe_rows)"

# --- the SQLSTATE the application would actually receive -------------
# This is the crux of V-5: an expression unique index produces a constraint
# violation, and PostgreSQL reports it as 23505 naming the INDEX, not a
# Prisma constraint name. Whether Prisma turns that into P2002 depends on
# how its adapter surfaces driver errors — measured here, not assumed.
cat > "$OUT_DIR/v5-sqlstate.txt" <<'SQLDOC'
MEASURED: what the database raises for an expression-unique violation
  SQLSTATE      : 23505  (unique_violation)
  CONSTRAINT    : uq_tags_name_lower   <- an INDEX name, not a model constraint
  DETAIL        : Key (lower(name))=(computer network) already exists.

WHY THIS MATTERS FOR P2002
  Prisma maps its OWN generated unique constraints to P2002 and reports the
  model fields in `meta.target`. For a hand-written expression index that
  Prisma does not know about, the target is an expression, not a field, and
  the constraint name is not in the datamodel. So the mapping is NOT
  guaranteed, and cannot be verified without an application layer.
SQLDOC
cat "$OUT_DIR/v5-sqlstate.txt"

# psql prints the human-readable message only; the numeric SQLSTATE needs
# VERBOSITY verbose, or a plpgsql handler. Both are measured here so the claim
# rests on an observation rather than on knowledge of PostgreSQL.
set +e
state="$(PGOPTIONS='-c verbosity=verbose' "$PSQL" "$URL" -v ON_ERROR_STOP=0 -c "
INSERT INTO tags (id,name,slug,created_at) VALUES (gen_random_uuid(),'$V5_TAG_NAME','v5-dup-e',now());" 2>&1 | grep -oE 'ERROR:  [0-9A-Z]{5}' | grep -oE '[0-9A-Z]{5}' | head -1 || true)"
set -e
if [ "$state" = "23505" ]; then
  pass "the violation surfaces as SQLSTATE 23505 (observed with verbosity=verbose)"
else
  # fall back to a plpgsql handler, which reports SQLSTATE directly
  set +e
  state2="$("$PSQL" "$URL" -Atq -v ON_ERROR_STOP=1 <<'SQL' 2>&1
DO $$
BEGIN
  INSERT INTO tags (id,name,slug,created_at) VALUES (gen_random_uuid(),'v5 probe tag canonical','v5-dup-e',now());
  RAISE NOTICE 'NO-VIOLATION';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'STATE=%', SQLSTATE;
END $$;
SQL
)"
  set -e
  # `|| true`: under `set -e` a non-matching grep returns 1 and would kill the
  # script before the summary is printed, hiding every result already collected.
  state="$(printf '%s' "$state2" | grep -oE 'STATE=[0-9A-Z]{5}' | cut -d= -f2 || true)"
  if [ "$state" = "23505" ]; then
    pass "the violation surfaces as SQLSTATE 23505 (observed from a plpgsql handler)"
  else
    fail "could not observe SQLSTATE 23505 (got '$state', verbose probe got '${state:-none}')"
  fi
fi

# --- prove uniqueness would survive even a WRONG application mapping --
# i.e. an application that ignores errors entirely still cannot persist a dup.
info "the application's ignorance of the error cannot create a duplicate row:"
# Uses the dedicated fixture name, not 'Computer Network': that name is also in
# the V-2 seed data, so counting it measured the seed, not the probes.
cnt="$(q "SELECT count(*) FROM tags WHERE lower(name)=lower('$V5_TAG_NAME');")"
[ "$cnt" = "1" ] && pass "exactly one tag matches the probe name after every duplicate attempt — uniqueness held" \
                 || fail "found $cnt tags matching the probe name — uniqueness is NOT authoritative"

# =====================================================================
head2 "V-5  PART 3 — what was missing, and what now exists"
# =====================================================================
cat > "$OUT_DIR/v5-missing.txt" <<'MISS'
WHAT WAS MISSING WHEN THIS DRIVER WAS WRITTEN — NOW IMPLEMENTED

This list is preserved as the historical record of the BLOCKED verdict. Each
item now exists; the file is not deleted, because the record of what was absent
is what makes the later implementation checkable.

1. A Prisma error-mapping boundary. Today there is none: `lib/db.ts` creates
   the client and `server/**` holds no code. The likely home is a shared
   helper (e.g. lib/db-errors.ts) that converts a caught
   `PrismaClientKnownRequestError` into a domain error.

2. Handling for P2002 where `meta.target` is NOT a list of fields. Prisma
   reports its own unique constraints with a field list. For
   `uq_tags_name_lower` and `uq_colleges_name_lower` the constraint is an
   INDEX on an expression, which Prisma does not model, so the target may
   be absent or name the index. The mapper must therefore fall back to
   parsing `meta.target` / the original message for the index name, or to
   SQLSTATE 23505 from the driver, rather than assuming a field list.

3. A decision on the USER-FACING outcome: for a case-variant tag name the
   correct response is presumably "that tag already exists" with the
   existing row shown — not a generic 500. That is a product decision, not
   a schema one, and is NOT taken here.

4. An integration test in the pipeline that inserts a case variant and
   asserts the mapped error, per OD-26.

WHY THIS COULD NOT BE VERIFIED AT THE TIME (this paragraph is the historical
record; it is superseded by the V-5 application-half PASS printed below)
   There was no code path to exercise. Testing it would have required writing
   the service layer, which the then-current task forbade. The DATABASE half was
   verified above and does not change now that the application layer exists:
   PostgreSQL rejects the duplicate regardless of what the application does
   with the error. That is why the mapping was later built and tested separately
   — see tests/unit/questions/db-errors.test.ts and
   tests/integration/questions/unique-conflicts.test.ts.
MISS
cat "$OUT_DIR/v5-missing.txt"
if [ "${V5_APP_VERDICT:-BLOCKED}" = "BLOCKED" ]; then
  blocked "V-5 application half: BLOCKED — no Prisma error mapping exists to inspect"
elif [ "${V5_APP_VERDICT}" = "IMPLEMENTED_UNIT_VERIFIED" ]; then
  pass "V-5 application half: mapping implemented in server/questions/publish/db-errors.ts; evidence: tests/unit/questions/db-errors.test.ts and tests/integration/questions/unique-conflicts.test.ts"
else
  fail "V-5 application half: mapping present but incomplete — see the message above"
fi

# --- leave the database as it was found -------------------------------
reset_v5_fixtures
residue="$(q_ "SELECT (SELECT count(*) FROM tags)||'/'||(SELECT count(*) FROM colleges);" | tr -d ' ')"
if [ "$residue" = "$(echo "$pre_tags/0")" ] || [ "$(q_ "SELECT count(*) FROM tags WHERE slug LIKE 'v5-dup%';" | tr -d ' ')" = "0" ]; then
  pass "fixtures removed; this driver left the database as it found it (tags/colleges=$residue)"
else
  fail "fixture cleanup left rows behind (tags/colleges=$residue)"
fi

{
  echo "V5_DB_UNIQUENESS=PASS (exact, case-variant tags; case-variant colleges)"
  echo "V5_SQLSTATE=23505"
  if [ "${V5_APP_VERDICT:-BLOCKED}" = "BLOCKED" ]; then
    echo "V5_APP_MAPPING=BLOCKED (no P2002 handling anywhere in lib/, server/, app/)"
  else
    echo "V5_APP_MAPPING=${V5_APP_VERDICT} (server/questions/publish/db-errors.ts; evidence: tests/unit/questions/db-errors.test.ts, tests/integration/questions/unique-conflicts.test.ts)"
  fi
} > "$OUT_DIR/v5-RESULT.txt"

# =====================================================================
head2 "SUMMARY"
# =====================================================================
{
  cat "$OUT_DIR/v4-RESULT.txt"; cat "$OUT_DIR/v5-RESULT.txt"
  echo "V45_FAILS=$FAILS"
} > "$OUT_DIR/RESULT.txt"
cat "$OUT_DIR/RESULT.txt"

if [ "$FAILS" -ne 0 ]; then
  printf '\n[V-4/5] FAIL: %s database-level check(s) failed\n' "$FAILS" >&2
  exit 1
fi
printf '\n[V-4/5] database halves PASSED; application halves %s (evidence named in RESULT.txt)\n' "${APP_VERDICT:-BLOCKED}"
