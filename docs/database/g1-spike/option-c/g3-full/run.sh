#!/usr/bin/env bash
# =====================================================================
# G-3 FULL-SCHEMA — production-readiness gate for the Option C workflow,
# run against the REAL 18-table Phase 04A schema.
#
# The reduced 10-table prototype passed in CI run 45263567929, and the
# proposal (§11.6) says explicitly that this does NOT close G-3: the prototype
# used a local DDL transcription that had already diverged from Prisma's real
# output twice. This driver removes that uncertainty by using:
#
#   * prisma/schema.prisma          — the real 18-table datamodel
#   * prisma/migrations/0001_phase04a_question_bank/migration.sql — the real,
#     committed baseline (Prisma-generated DDL + hand-written artifacts)
#
# PHASE 04B: the committed history now has a second migration,
# 0002_identity_audit (profiles, user_roles, audit_events, authorship columns).
# The gate deploys and replays the WHOLE committed history, so the expected
# inventory is 21 tables / 8 enums / 33 FKs (28 single + 5 composite) /
# 54 CHECKs / 6 hand-written Phase 04A indexes. The tamper test's own migration
# is numbered 0003 so it sorts after the committed history.
#
# and by DEPLOYING IT WITH `prisma migrate deploy`. No transcription, no
# baseline_ddl.py, no hand-applied schema.
#
# Six mandatory criteria (proposal §11.6.6). A criterion is PASS only when the
# step that tests it ran and succeeded. Skipped is NOT TESTED, never a pass.
#
#   ./run.sh --url <empty disposable db> --shadow-url <empty db> \
#            [--replay-url <empty db>]
#
# DISPOSABLE ONLY. The primary database must be empty; the script refuses
# otherwise and never drops an existing schema.
# =====================================================================
set -Eeuo pipefail

G3F_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OC_DIR="$(cd "$G3F_DIR/.." && pwd)"
SPIKE_DIR="$(cd "$OC_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SPIKE_DIR/../../.." && pwd)"
PSQL="${PSQL:-psql}"
PRISMA_BIN="$REPO_ROOT/node_modules/.bin/prisma"
GUARD="$OC_DIR/guard.py"
PROD_SCHEMA="$REPO_ROOT/prisma/schema.prisma"
MIG_SRC="$REPO_ROOT/prisma/migrations/0001_phase04a_question_bank/migration.sql"
MIG_ROOT="$REPO_ROOT/prisma/migrations"
# Every committed migration, in order. The gate tests the history as committed.
# Phase 04D added 0003_staff_list_search_performance. The gate fails if this
# list and the directory disagree, so a new migration must be added here.
COMMITTED_MIGRATIONS=(0001_phase04a_question_bank 0002_identity_audit 0003_staff_list_search_performance 0004_rls_lockdown)

G3F_EXPECTED_CASES=33
EXPECTED_TABLES=21          # 18 (0001) + profiles, user_roles, audit_events (0002)
EXPECTED_ENUMS=8            # 7 (0001) + AppRole (0002)
EXPECTED_FKS_SINGLE=28      # 21 (0001) + 7 references to profiles(id) (0002)
EXPECTED_FKS_COMPOSITE=5
EXPECTED_CHECKS=54          # 47 (0001) + 7 (0002)
EXPECTED_HAND_INDEXES=6

# --- helpers ----------------------------------------------------------
RUN_LOG="${RUN_LOG:-${TMPDIR:-/tmp}/g3f-$$.log}"
: > "$RUN_LOG"
exec > >(tee -a "$RUN_LOG") 2>&1
CURRENT_CMD=""
trap 'CURRENT_CMD="$BASH_COMMAND"' DEBUG

fail() {
  printf '\n[G-3F] FAIL: %s\n' "$*" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    printf '::error title=G-3 full-schema failure::%s\n' "$(printf '%s' "$*" | tr '\n' ' ')"
  fi
  exit 1
}
step()  { printf '\n============================================================\n[G-3F] %s\n============================================================\n' "$*"; }
ok()    { printf '[G-3F] ok: %s\n' "$*"; }
info()  { printf '[G-3F]     %s\n' "$*"; }
crit()  { printf '\n[G-3F] >>> CRITERION %s: %s\n' "$1" "$2"; }
ci_note() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    printf '::warning title=G-3 full-schema evidence::%s\n' "$(printf '%s' "$*" | tr '\n' ' ' | cut -c1-900)"
  fi
  printf '[G-3F] evidence: %s\n' "$(printf '%s' "$*" | tr '\n' ' ' | cut -c1-400)"
}

# shellcheck disable=SC2154
trap '
  rc=$?
  printf "\n[G-3F] FAIL: aborted (exit %s) — last line: $CURRENT_CMD\n" "$rc" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    [ -n "${OUT_DIR:-}" ] && cp "$RUN_LOG" "$OUT_DIR/run.log" 2>/dev/null
    tail_txt="no log"; [ -f "$RUN_LOG" ] && { sleep 0.1; tail_txt="$(tail -c 1500 "$RUN_LOG" | tr "\n" " " | tr -s " ")"; }
    printf "::error title=G-3 full-schema aborted (exit %s)::%s\n" "$rc" "$(printf "%s" "$tail_txt" | cut -c1-1400)"
  fi
' ERR

assert_nonempty() {
  [ -f "$1" ] || fail "$2: expected file '$1' was not created"
  [ -s "$1" ] || fail "$2: '$1' is empty"
}

# assert_catalog <db-url> <label> — authoritative post-deployment check.
# Uses guard.py, the SAME module the repository guard uses, so the definition
# of "approved" cannot drift between the two.
assert_catalog() {
  local url="$1" label="$2" json
  json="$OUT_DIR/catalog-$(printf '%s' "$label" | tr ' /' '__').json"
  "$PSQL" "$url" -Atc "SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM ($CATALOG_QUERY) t;" > "$json" \
    || fail "could not read the catalog for $label"
  if python3 "$GUARD" catalog "$json" >> "$OUT_DIR/catalog.log" 2>&1; then
    ok "catalog assertion ($label): all five protected FKs match the approved definitions"
  else
    tail -20 "$OUT_DIR/catalog.log"
    fail "catalog assertion ($label) FAILED — see catalog.log"
  fi
}

# assert_shape <db-url> <label> — the full-schema inventory. A count of five
# constraints would pass even if the other 13 tables were missing, so the whole
# shape is asserted, not just the protected part.
assert_shape() {
  local url="$1" label="$2" t e f c i
  # NOTE: _prisma_migrations is a real table in public and would make the count
  # 19. It is Prisma's own bookkeeping, not part of the approved 18-table model,
  # so it is excluded BY NAME. (Found by CI run 45272402867, which reported
  # 19 tables. The reduced prototype never counted tables, so it never saw this.)
  t="$("$PSQL" "$url" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations';")"
  e="$("$PSQL" "$url" -Atc "SELECT count(*) FROM pg_type WHERE typtype='e' AND typnamespace='public'::regnamespace;")"
  f="$("$PSQL" "$url" -Atc "SELECT count(*) FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace;")"
  c="$("$PSQL" "$url" -Atc "SELECT count(*) FROM pg_constraint WHERE contype='c' AND connamespace='public'::regnamespace AND conname LIKE 'ck\_%';")"
  i="$("$PSQL" "$url" -Atc "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('uq_question_versions_one_published_per_question','uq_question_sources_identity','uq_topics_chapter_order','uq_tags_name_lower','uq_colleges_name_lower','ix_question_assets_checksum');")"
  info "shape ($label): tables=$t enums=$e fks=$f checks=$c hand_indexes=$i"
  [ "$t" = "$EXPECTED_TABLES" ]           || fail "shape ($label): $t tables, expected $EXPECTED_TABLES"
  [ "$e" = "$EXPECTED_ENUMS" ]            || fail "shape ($label): $e enums, expected $EXPECTED_ENUMS"
  [ "$f" = "$((EXPECTED_FKS_SINGLE + EXPECTED_FKS_COMPOSITE))" ] \
    || fail "shape ($label): $f foreign keys, expected $((EXPECTED_FKS_SINGLE + EXPECTED_FKS_COMPOSITE)) ($EXPECTED_FKS_SINGLE single + $EXPECTED_FKS_COMPOSITE composite)"
  [ "$c" = "$EXPECTED_CHECKS" ]           || fail "shape ($label): $c CHECK constraints, expected $EXPECTED_CHECKS"
  [ "$i" = "$EXPECTED_HAND_INDEXES" ]     || fail "shape ($label): $i hand-written indexes, expected $EXPECTED_HAND_INDEXES"
  ok "shape ($label): $EXPECTED_TABLES tables, $EXPECTED_ENUMS enums, $((EXPECTED_FKS_SINGLE + EXPECTED_FKS_COMPOSITE)) FKs ($EXPECTED_FKS_SINGLE+$EXPECTED_FKS_COMPOSITE), $EXPECTED_CHECKS CHECKs, $EXPECTED_HAND_INDEXES hand-written indexes"
}

# --- arguments --------------------------------------------------------
URL=""; SHADOW_URL=""; REPLAY_URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --url=*) URL="${1#*=}"; shift ;;
    --shadow-url) SHADOW_URL="${2:-}"; shift 2 ;;
    --shadow-url=*) SHADOW_URL="${1#*=}"; shift ;;
    --replay-url) REPLAY_URL="${2:-}"; shift 2 ;;
    --replay-url=*) REPLAY_URL="${1#*=}"; shift ;;
    -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done
[ -n "$URL" ] || fail "usage: run.sh --url <empty db> --shadow-url <empty db> [--replay-url <empty db>]"
[ -n "$SHADOW_URL" ] || fail "--shadow-url is required"

case "$URL$SHADOW_URL$REPLAY_URL" in
  *production*|*prod*|*staging*|*supabase.co*|*render.com*|*rds.amazonaws.com*)
    fail "refusing to run against a non-disposable database" ;;
esac

WORK="${WORK:-$G3F_DIR/out}"
rm -rf "$WORK"; mkdir -p "$WORK"
OUT_DIR="$WORK"
: > "$OUT_DIR/catalog.log"

# --- 0. toolchain and preconditions -----------------------------------
step "0. toolchain — pinned Prisma, real schema, real committed migration"
command -v "$PSQL" >/dev/null || fail "psql not found on PATH"
[ -f "$GUARD" ] || fail "guard.py missing at $GUARD"
[ -f "$PROD_SCHEMA" ] || fail "the real schema is missing at $PROD_SCHEMA"
for m in "${COMMITTED_MIGRATIONS[@]}"; do
  [ -f "$MIG_ROOT/$m/migration.sql" ] || fail "the committed migration is missing at $MIG_ROOT/$m"
done
# Every directory on disk must be in the list above, or the gate would test
# less than what is committed.
on_disk_committed="$(find "$MIG_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort | tr '\n' ' ')"
[ "$on_disk_committed" = "$(printf '%s\n' "${COMMITTED_MIGRATIONS[@]}" | sort | tr '\n' ' ')" ] \
  || fail "committed migrations on disk ($on_disk_committed) differ from the gate's list — update COMMITTED_MIGRATIONS"
[ -x "$PRISMA_BIN" ] || fail "pinned Prisma CLI missing — run 'npm ci' (npx is deliberately not used)"
PRISMA_VERSION="$(node -p "require('$REPO_ROOT/node_modules/prisma/package.json').version")"
[ "$PRISMA_VERSION" = "7.10.1" ] || fail "pinned Prisma is $PRISMA_VERSION, expected 7.10.1"
PG_VERSION="$("$PSQL" "$URL" -Atc 'SHOW server_version;')"
ok "prisma $PRISMA_VERSION, node $(node -v), PostgreSQL $PG_VERSION"
info "schema under test: prisma/schema.prisma (18 models)"
info "migrations under test: ${COMMITTED_MIGRATIONS[*]}"

step "0b. preconditions — every database must be empty"
for pair in "primary:$URL" "shadow:$SHADOW_URL"; do
  name="${pair%%:*}"; dburl="${pair#*:}"
  "$PSQL" "$dburl" -Atc 'SELECT 1' >/dev/null 2>&1 || fail "cannot connect to the $name database"
  objs="$("$PSQL" "$dburl" -Atc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','i','S','v','m');")"
  [ "$objs" = "0" ] || fail "the $name database is not empty ($objs objects) — refusing to run"
  ok "$name database is empty"
done

CATALOG_QUERY="$(python3 -c "import sys;sys.path.insert(0,'$OC_DIR');import guard;print(guard.CATALOG_QUERY)")"

# The driver works on a COPY of the committed migration history so that the
# tampering tests in criterion 5 cannot touch the repository.
MIGRATIONS="$OUT_DIR/migrations"
SESS="$OUT_DIR/session"
MIG_NAME="0001_phase04a_question_bank"
mkdir -p "$SESS"
for m in "${COMMITTED_MIGRATIONS[@]}"; do
  mkdir -p "$MIGRATIONS/$m"
  cp "$MIG_ROOT/$m/migration.sql" "$MIGRATIONS/$m/migration.sql"
done
printf 'provider = "postgresql"\n' > "$MIGRATIONS/migration_lock.toml"
cp "$PROD_SCHEMA" "$SESS/baseline.prisma"

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
mk_config "$SESS/baseline.prisma" "$SESS/deploy.config.ts"
prisma_run() { ( cd "$REPO_ROOT" && G3_DATABASE_URL="$URL" G3_SHADOW_DATABASE_URL="$SHADOW_URL" "$PRISMA_BIN" "$@" ); }

# =====================================================================
# CRITERION 1 — workflow enforcement
# =====================================================================
crit "1" "workflow enforcement: 'prisma migrate dev' must be rejected by automation"
info "Three independent controls, because a rule that lives only in a document"
info "is not enforced:"
info "  (a) a repository guard that scans every executed surface"
info "  (b) it must FIRE on an injected unsafe script (no vacuous control)"
info "  (c) it must NOT fire on the approved commands (no false positive)"

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
prisma migrate deploy --config prisma.config.ts
prisma migrate status --config prisma.config.ts
prisma migrate diff --from-schema snapshots/prev.prisma --to-schema prisma/schema.prisma --script
GOODS
if bash "$REPO_GUARD" "$GOODREPO" > "$OUT_DIR/01c-repo-guard-good.log" 2>&1; then
  ok "the approved commands (deploy / status / snapshot diff) are accepted"
else
  cat "$OUT_DIR/01c-repo-guard-good.log"
  fail "the repository guard rejects the APPROVED commands — it would block legitimate deployments"
fi
C1_STATUS="PASS (guard clean, negative-tested, no false positive)"
ci_note "criterion 1: guard clean, rejects migrate dev, accepts approved commands"

# =====================================================================
# CRITERION 2 — migration-history consistency
# =====================================================================
crit "2" "migration-history consistency: 'migrate status' before and after a real deploy"
info "This is a REAL 'prisma migrate deploy' of the committed baseline. There is"
info "no transcription step and no hand-applied DDL: if the history is wrong, the"
info "schema is wrong."

info ""
info "--- 2a: 'migrate status' BEFORE deployment (pending migration expected) ---"
set +e
prisma_run migrate status --config "$SESS/deploy.config.ts" > "$OUT_DIR/02a-status-before.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/02a-status-before.log"
[ "$rc" -eq 1 ] || fail "expected 'migrate status' to exit 1 with a pending migration, got $rc"
grep -qiE 'not yet been applied|following migration' "$OUT_DIR/02a-status-before.log" \
  || fail "status exited 1 but did not report a pending migration — refusing to guess"
ok "before deployment: status reports the pending migration (exit 1, as expected)"

info ""
info "--- 2b: deploy the committed baseline ---"
set +e
prisma_run migrate deploy --config "$SESS/deploy.config.ts" > "$OUT_DIR/02b-deploy.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/02b-deploy.log"
[ "$rc" -eq 0 ] || fail "migrate deploy failed (exit $rc) — the committed baseline does not apply"
grep -qiE '1 migration found|applied|Applying migration' "$OUT_DIR/02b-deploy.log" \
  || info "deploy printed no 'Applying' line (already-migrated database?) — continuing to the catalog check"
ok "migrate deploy of the committed baseline succeeded"

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
on_disk="$(find "$MIGRATIONS" -mindepth 1 -maxdepth 1 -type d -name '2*_*' -o -mindepth 1 -maxdepth 1 -type d -name '0*_*' | wc -l)"
in_db="$("$PSQL" "$URL" -Atc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
unfinished="$("$PSQL" "$URL" -Atc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;")"
info "migrations on disk: $on_disk, applied in database: $in_db, unfinished: $unfinished"
[ "$on_disk" = "$in_db" ] || fail "history mismatch: $on_disk migration(s) on disk but $in_db applied"
[ "$unfinished" = "0" ] || fail "$unfinished unfinished migration(s) in _prisma_migrations"
ok "migration history is consistent: $in_db applied, none unfinished, none rolled back"

info ""
info "--- 2e: the checksum control passes on the REAL applied baseline ---"
"$PSQL" "$URL" -Atc \
  "SELECT json_agg(row_to_json(t)) FROM (SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) t;" \
  > "$OUT_DIR/02e-history.json" || fail "could not read _prisma_migrations"
python3 "$GUARD" history "$OUT_DIR/02e-history.json" "$MIGRATIONS" > "$OUT_DIR/02e-history.log" 2>&1 \
  || { cat "$OUT_DIR/02e-history.log"; fail "the real applied baseline does not match its recorded checksum"; }
cat "$OUT_DIR/02e-history.log"
ok "the checksum control passes on unmodified real history (the control is not vacuous)"
C2_STATUS="PASS (pending→clean, ${#COMMITTED_MIGRATIONS[@]} applied, checksums verified)"
ci_note "criterion 2: status pending→clean, ${#COMMITTED_MIGRATIONS[@]} applied, checksum verified"

# =====================================================================
# CRITERION 3 — protected constraint integrity (live catalog)
# =====================================================================
crit "3" "protected constraint integrity: live catalog vs approved definitions"
info "A COUNT of five constraints is not an integrity check: five constraints"
info "with the wrong columns or the wrong ON DELETE would also count as five."

info ""
info "--- 3a: full inventory on the deployed real schema ---"
assert_shape "$URL" "after deploying the real baseline"
assert_catalog "$URL" "after deploying the real baseline"

info ""
info "--- 3b: the catalog assertion must FIRE on a tampered catalog ---"
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q \
  -c 'ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_subtopic_topic";' \
  -c 'ALTER TABLE "questions" ADD CONSTRAINT "fk_questions_subtopic_topic" FOREIGN KEY ("subtopic_id","topic_id") REFERENCES "subtopics"("id","topic_id") ON UPDATE CASCADE ON DELETE CASCADE;'
"$PSQL" "$URL" -Atc "SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM ($CATALOG_QUERY) t;" > "$OUT_DIR/03b-tampered.json"
if python3 "$GUARD" catalog "$OUT_DIR/03b-tampered.json" > "$OUT_DIR/03b-tampered.log" 2>&1; then
  fail "the catalog assertion ACCEPTED a weakened constraint (ON DELETE CASCADE) — the control does not work"
fi
info "assertion reported: $(head -2 "$OUT_DIR/03b-tampered.log" | tr '\n' ' ')"
ok "the catalog assertion detects a weakened ON DELETE action"

info ""
info "--- 3c: a DROPPED protected FK must also be detected ---"
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q \
  -c 'ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_level_subject";'
"$PSQL" "$URL" -Atc "SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM ($CATALOG_QUERY) t;" > "$OUT_DIR/03c-dropped.json"
if python3 "$GUARD" catalog "$OUT_DIR/03c-dropped.json" > "$OUT_DIR/03c-dropped.log" 2>&1; then
  fail "the catalog assertion ACCEPTED a missing protected FK — the control does not work"
fi
info "assertion reported: $(head -2 "$OUT_DIR/03c-dropped.log" | tr '\n' ' ')"
ok "the catalog assertion reports a MISSING protected FK"

info ""
info "--- 3d: restore both, and confirm the assertion passes again ---"
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q \
  -c 'ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_subtopic_topic";' \
  -c 'ALTER TABLE "questions" ADD CONSTRAINT "fk_questions_subtopic_topic" FOREIGN KEY ("subtopic_id","topic_id") REFERENCES "subtopics"("id","topic_id") ON UPDATE CASCADE ON DELETE RESTRICT;' \
  -c 'ALTER TABLE "questions" ADD CONSTRAINT "fk_questions_level_subject" FOREIGN KEY ("education_level_id","subject_id") REFERENCES "level_subjects"("level_id","subject_id") ON UPDATE CASCADE ON DELETE RESTRICT;'
assert_catalog "$URL" "after restoring both constraints"
ok "the catalog assertion is not vacuous: it rejected two tamperings and accepted the restorations"
C3_STATUS="PASS (full inventory + live catalog, negative-tested twice)"
ci_note "criterion 3: inventory 18/7/26/47/6 correct; catalog rejected weakening AND dropping"

# =====================================================================
# CRITERION 4 — constrained-column migration safety
# =====================================================================
crit "4" "constrained-column migration safety on the FULL schema"
info "Representative changes, measured rather than assumed:"
info "   (A) answer_keys.mcq_correct_option_key  text -> varchar(16)"
info "       coercible widening of a column inside C-5 only."
info "   (B) questions.subject_id  uuid -> varchar(64)"
info "       NON-coercible change inside C-1 AND C-2, which also has an"
info "       ordinary single-column FK."
info "Nothing beyond these two is generalised."

info ""
info "--- 4a: does snapshot-to-snapshot diffing SEE a constrained-column change? ---"
# Make the datamodel change on a COPY, so the repository is never touched.
CHANGE_SCHEMA="$SESS/column-change.prisma"
python3 - "$SESS/baseline.prisma" "$CHANGE_SCHEMA" <<'PY'
import sys, io
src, dst = sys.argv[1], sys.argv[2]
s = io.open(src, encoding='utf-8').read()
old = "  mcqCorrectOptionKey String?   @map(\"mcq_correct_option_key\")"
new = "  mcqCorrectOptionKey String?   @map(\"mcq_correct_option_key\") @db.VarChar(16)"
assert old in s, "anchor for the pgvector-free varchar change not found"
io.open(dst, 'w', encoding='utf-8').write(s.replace(old, new, 1))
PY
set +e
prisma_run migrate diff --from-schema "$SESS/baseline.prisma" --to-schema "$CHANGE_SCHEMA" \
  --script --config "$SESS/deploy.config.ts" > "$OUT_DIR/04a-column-diff.sql" 2> "$OUT_DIR/04a.err"
rc=$?
set -e
[ "$rc" -eq 0 ] || { cat "$OUT_DIR/04a.err"; fail "snapshot diff failed (exit $rc)"; }
cat "$OUT_DIR/04a-column-diff.sql"
grep -qi 'ALTER COLUMN' "$OUT_DIR/04a-column-diff.sql" \
  || fail "the snapshot diff did not see the column change at all — the check would be vacuous"
if grep -qi 'DROP CONSTRAINT' "$OUT_DIR/04a-column-diff.sql"; then
  fail "the snapshot diff proposed a DROP CONSTRAINT on a column change (it should be blind to C-1..C-5)"
fi
ok "the snapshot diff sees the ALTER and proposes ZERO DROP CONSTRAINT statements"
C4A_STATUS="PASS (diff sees the change, 0 DROPs)"

info ""
info "--- 4b: is a coercible widening actually accepted, with C-5 intact? ---"
set +e
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q \
  -c 'ALTER TABLE "answer_keys" ALTER COLUMN "mcq_correct_option_key" TYPE varchar(16);' \
  > "$OUT_DIR/04b-coercible.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/04b-coercible.log"
if [ "$rc" -eq 0 ]; then
  ok "PostgreSQL ACCEPTED the coercible widening — C-5 needs no hand-editing"
  assert_catalog "$URL" "after the coercible widening"
  COERCIBLE="accepted"
else
  info "PostgreSQL refused the coercible widening on this build — recorded, not assumed"
  COERCIBLE="refused"
fi

info ""
info "--- 4b1: a NON-coercible change must be REFUSED while C-1/C-2 exist ---"
set +e
"$PSQL" "$URL" -v ON_ERROR_STOP=0 -q \
  -c 'ALTER TABLE "questions" ALTER COLUMN "subject_id" TYPE varchar(64);' \
  > "$OUT_DIR/04b1-noncoercible.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/04b1-noncoercible.log"
[ "$rc" -ne 0 ] || fail "a non-coercible change of a column inside C-1/C-2 was ACCEPTED — C-1/C-2 are not enforcing anything"
grep -qiE 'incompatible types|cannot be cast automatically|foreign key constraint' "$OUT_DIR/04b1-noncoercible.log" \
  || info "refusal message did not mention types/FK; see the log"
ok "the non-coercible change is refused — the composite FK must be dropped and re-added by hand"

info ""
info "--- 4b2: which control catches a repair that DELETES the constraint? ---"
info "The tempting 'fix' for 4b1 is to drop C-5/C-1 and never restore them."
cat > "$OUT_DIR/04b2-tampered-repair.sql" <<'SQL'
ALTER TABLE "answer_keys" DROP CONSTRAINT "fk_answer_keys_options_of_version";
ALTER TABLE "answer_keys" ALTER COLUMN "mcq_correct_option_key" TYPE varchar(16);
SQL
if python3 "$GUARD" sql "$OUT_DIR/04b2-tampered-repair.sql" > "$OUT_DIR/04b2-guard.log" 2>&1; then
  fail "the guard ACCEPTED a repair that drops C-5 and never restores it"
fi
info "guard reported: $(tail -1 "$OUT_DIR/04b2-guard.log" | sed 's/^ *//')"
ok "the pre-deployment guard rejects the drop-without-restore repair"

info ""
info "--- 4c: the hand-written SAFE pattern must be ACCEPTED by the guard ---"
cat > "$OUT_DIR/04c-safe-column-change.sql" <<'SQL'
BEGIN;
ALTER TABLE "answer_keys" DROP CONSTRAINT "fk_answer_keys_options_of_version";
ALTER TABLE "question_options" ALTER COLUMN "key" TYPE char(1);
ALTER TABLE "answer_keys" ALTER COLUMN "mcq_correct_option_key" TYPE char(1);
-- re-added with the approved columns and actions, unchanged
ALTER TABLE "answer_keys" ADD CONSTRAINT "fk_answer_keys_options_of_version"
  FOREIGN KEY ("version_id","mcq_correct_option_key")
  REFERENCES "question_options"("version_id","key")
  ON UPDATE CASCADE ON DELETE RESTRICT;
COMMIT;
SQL
python3 "$GUARD" sql "$OUT_DIR/04c-safe-column-change.sql" > "$OUT_DIR/04c-guard.log" 2>&1 \
  || { cat "$OUT_DIR/04c-guard.log"; fail "the guard rejected the SAFE drop+re-add pattern — it would block the only correct fix"; }
ok "the guard accepts the legitimate drop+re-add pattern (no false positive)"

info ""
info "--- 4d: an UNSAFE variant for the same change must be rejected ---"
cat > "$OUT_DIR/04d-unsafe.sql" <<'SQL'
ALTER TABLE "answer_keys" DROP CONSTRAINT "fk_answer_keys_options_of_version";
ALTER TABLE "answer_keys" ALTER COLUMN "mcq_correct_option_key" TYPE varchar(16);
SQL
if python3 "$GUARD" sql "$OUT_DIR/04d-unsafe.sql" > "$OUT_DIR/04d-guard.log" 2>&1; then
  fail "CI ACCEPTED an unsafe migration that drops C-5 without re-adding it"
fi
ok "the guard rejects the unsafe variant"

info ""
info "--- 4e: apply the SAFE migration and prove integrity survived ---"
set +e
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -f "$OUT_DIR/04c-safe-column-change.sql" > "$OUT_DIR/04e-apply.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/04e-apply.log"
[ "$rc" -eq 0 ] || fail "the safe constrained-column migration failed to apply (exit $rc)"
assert_catalog "$URL" "after the constrained-column change"

info ""
info "--- 4f: RESTORE the column types, so the database is left as the migration created it ---"
info "Criterion 4 deliberately narrows question_options.key to char(1). If the"
info "schema is left that way, a LATER step that inserts a deliberately invalid"
info "two-character key gets a length error instead of a CHECK violation and"
info "silently drops a case from the enforcement count. CI run 45273199251 failed"
info "exactly there: 'primary enforcement ran 32 cases, expected 33'."
info "The criterion must not corrupt the state the other criteria measure."
set +e
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q \
  -c 'ALTER TABLE "answer_keys" ALTER COLUMN "mcq_correct_option_key" TYPE text;' \
  -c 'ALTER TABLE "question_options" ALTER COLUMN "key" TYPE text;' \
  > "$OUT_DIR/04f-restore.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/04f-restore.log"
[ "$rc" -eq 0 ] || fail "could not restore the column types after criterion 4 (exit $rc)"
assert_shape "$URL" "after restoring the column types"
assert_catalog "$URL" "after restoring the column types"
ok "the schema is restored to the shape the committed migration produces"
C4_STATUS="PASS (coercible=$COERCIBLE; non-coercible refused; safe pattern accepted+applied; unsafe rejected; schema restored)"

# =====================================================================
# CRITERION 5 — tampering detection
# =====================================================================
crit "5" "tampering detection: unsafe migrations rejected BEFORE deployment"
info "Two distinct tampering modes, caught by different mechanisms:"
info "  (a) a migration that REMOVES or WEAKENS a protected FK -> textual guard"
info "  (b) an edit to an ALREADY-APPLIED migration          -> checksum control"

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
cat > "$TAMPER/drop-protected-parent.sql" <<'SQL'
DROP TABLE "question_options";
SQL
n_rejected=0
for f in "$TAMPER"/*.sql; do
  if python3 "$GUARD" sql "$f" > "$OUT_DIR/05a-$(basename "$f").log" 2>&1; then
    fail "the guard ACCEPTED the tampered migration $(basename "$f")"
  fi
  n_rejected=$((n_rejected+1))
  info "rejected $(basename "$f"): $(tail -1 "$OUT_DIR/05a-$(basename "$f").log" | sed 's/^ *//')"
done
[ "$n_rejected" = "6" ] || fail "expected to reject 6 tampering variants, rejected $n_rejected"
ok "all six tampering variants were rejected before deployment"
ci_note "criterion 5a: 6/6 tampered migrations rejected pre-deployment"

info ""
info "--- 5b: a migration EDITED AFTER it was applied ---"
info "Measured in CI run 45262383682: Prisma does NOT detect this. Both"
info "'migrate deploy' and 'migrate status' exited 0 after the applied file was"
info "rewritten. So the project supplies its own checksum control."
EDIT_NAME="0003_g3f_edited"
EDIT_DIR="$MIGRATIONS/$EDIT_NAME"
mkdir -p "$EDIT_DIR"
cat > "$EDIT_DIR/migration.sql" <<'SQL'
-- harmless on its face
ALTER TABLE "question_versions" ADD COLUMN "g3f_edited" text;
SQL
python3 "$GUARD" sql "$EDIT_DIR/migration.sql" > "$OUT_DIR/05b-guard.log" 2>&1 \
  || fail "the guard wrongly rejected a migration that does not touch a protected FK"
ok "the textual guard does not object (correct: it does not touch C-1..C-5)"

set +e
prisma_run migrate deploy --config "$SESS/deploy.config.ts" > "$OUT_DIR/05b-deploy1.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/05b-deploy1.log"
[ "$rc" -eq 0 ] || fail "deployment of the harmless migration failed (exit $rc)"
ok "the migration applied once"

checksum_before="$("$PSQL" "$URL" -Atc "SELECT checksum FROM _prisma_migrations WHERE migration_name='$EDIT_NAME';")"
info "recorded checksum before edit: $checksum_before"
sed -i 's/g3f_edited/g3f_edited_TAMPERED/' "$EDIT_DIR/migration.sql"

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
ok "the checksum control detects the edited applied migration"

info ""
info "control negative-test: with the file restored, the same check must pass"
sed -i 's/g3f_edited_TAMPERED/g3f_edited/' "$EDIT_DIR/migration.sql"
if python3 "$GUARD" history "$OUT_DIR/05b-history.json" "$MIGRATIONS" > "$OUT_DIR/05b-history-ok.log" 2>&1; then
  cat "$OUT_DIR/05b-history-ok.log"
  ok "the checksum control passes on unmodified history (it is not vacuous)"
else
  cat "$OUT_DIR/05b-history-ok.log"
  fail "the checksum control rejects unmodified history — it is unusable"
fi
C5_STATUS="PASS (6/6 textual variants rejected; edited applied migration detected)"
C5B_STATUS="PASS (Prisma does not detect the edit — measured; checksum control does)"
ci_note "criterion 5b: edit detected by checksum control (prisma_detects=$PRISMA_DETECTS)"

# =====================================================================
# CRITERION 6 — reproducibility
# =====================================================================
crit "6" "reproducibility: an independent empty database must replay to a verified state"
if [ -z "$REPLAY_URL" ]; then
  info "NOT TESTED — no --replay-url supplied. NOT recorded as a pass."
  REPLAY_STATUS="NOT TESTED"
else
  objs="$("$PSQL" "$REPLAY_URL" -Atc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','i','S','v','m');")"
  [ "$objs" = "0" ] || fail "the replay database is not empty ($objs objects)"
  # Replay only the REAL baseline — the tampering artefacts in 5b must not
  # contaminate the reproducibility check.
  REPLAY_MIG="$OUT_DIR/replay-migrations"
  for m in "${COMMITTED_MIGRATIONS[@]}"; do
    mkdir -p "$REPLAY_MIG/$m"
    cp "$MIG_ROOT/$m/migration.sql" "$REPLAY_MIG/$m/migration.sql"
  done
  printf 'provider = "postgresql"\n' > "$REPLAY_MIG/migration_lock.toml"
  cat > "$SESS/replay.config.ts" <<CFG
import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: '$SESS/baseline.prisma',
  migrations: { path: '$REPLAY_MIG' },
  datasource: {
    url: process.env.G3_DATABASE_URL,
    shadowDatabaseUrl: process.env.G3_SHADOW_DATABASE_URL,
  },
});
CFG
  set +e
  ( cd "$REPO_ROOT" && G3_DATABASE_URL="$REPLAY_URL" G3_SHADOW_DATABASE_URL="$SHADOW_URL" \
      "$PRISMA_BIN" migrate deploy --config "$SESS/replay.config.ts" ) > "$OUT_DIR/06-replay.log" 2>&1
  rc=$?
  set -e
  cat "$OUT_DIR/06-replay.log"
  [ "$rc" -eq 0 ] || fail "replay into the independent database failed (exit $rc)"
  assert_shape "$REPLAY_URL" "independent replay"
  assert_catalog "$REPLAY_URL" "independent replay"
  "$PSQL" "$REPLAY_URL" -v ON_ERROR_STOP=0 -q -f "$G3F_DIR/enforce.sql" > "$OUT_DIR/06-enforce.log" 2>&1 || true
  T="$(grep -oE 'G3F_TOTAL= *[0-9]+' "$OUT_DIR/06-enforce.log" | head -1 | sed 's/.*= *//' || true)"
  P="$(grep -oE 'G3F_PASS= *[0-9]+' "$OUT_DIR/06-enforce.log" | head -1 | sed 's/.*= *//' || true)"
  F="$(grep -oE 'G3F_FAIL= *[0-9]+' "$OUT_DIR/06-enforce.log" | head -1 | sed 's/.*= *//' || true)"
  info "replay enforcement: TOTAL=${T:-?} PASS=${P:-?} FAIL=${F:-?}"
  [ "$T" = "$G3F_EXPECTED_CASES" ] || fail "replay enforcement ran ${T:-0} cases, expected $G3F_EXPECTED_CASES"
  [ "$F" = "0" ] || fail "replay enforcement had ${F:-?} failures"
  REPLAY_STATUS="PASS"
  ok "the independent database replays to a verified state with $P/$G3F_EXPECTED_CASES enforcement"
  ci_note "criterion 6: independent replay verified ($EXPECTED_TABLES tables, 5/5 constraints, $P/$G3F_EXPECTED_CASES enforcement)"
fi

# =====================================================================
# Enforcement on the primary database
# =====================================================================
step "supporting check — full 18-table enforcement on the primary database"
"$PSQL" "$URL" -v ON_ERROR_STOP=0 -q -f "$G3F_DIR/enforce.sql" > "$OUT_DIR/07-enforce.log" 2>&1 || true
T="$(grep -oE 'G3F_TOTAL= *[0-9]+' "$OUT_DIR/07-enforce.log" | head -1 | sed 's/.*= *//' || true)"
P="$(grep -oE 'G3F_PASS= *[0-9]+' "$OUT_DIR/07-enforce.log" | head -1 | sed 's/.*= *//' || true)"
F="$(grep -oE 'G3F_FAIL= *[0-9]+' "$OUT_DIR/07-enforce.log" | head -1 | sed 's/.*= *//' || true)"
[ "$T" = "$G3F_EXPECTED_CASES" ] || fail "primary enforcement ran ${T:-0} cases, expected $G3F_EXPECTED_CASES"
[ "$F" = "0" ] || { grep '|' "$OUT_DIR/07-enforce.log" | grep FAIL || true; fail "primary enforcement had ${F:-?} failures"; }
ok "primary database: $P/$G3F_EXPECTED_CASES full-schema enforcement cases PASS, 0 failures"
assert_shape "$URL" "primary, after the whole gate"

# =====================================================================
# Final 'migrate status'
# =====================================================================
step "final check — 'migrate status' is still clean at the end"
set +e
prisma_run migrate status --config "$SESS/deploy.config.ts" > "$OUT_DIR/08-final-status.log" 2>&1
rc=$?
set -e
cat "$OUT_DIR/08-final-status.log"
[ "$rc" -eq 0 ] || fail "final 'migrate status' is not clean (exit $rc)"
ok "final status clean"

# =====================================================================
# VERDICT
# =====================================================================
step "G-3 FULL-SCHEMA VERDICT"
{
  echo "G-3 workflow gate — FULL 18-TABLE SCHEMA"
  echo
  printf 'criterion 1  workflow enforcement ................ %s\n' "$C1_STATUS"
  printf 'criterion 2  migration-history consistency ....... %s\n' "$C2_STATUS"
  printf 'criterion 3  protected constraint integrity ...... %s\n' "$C3_STATUS"
  printf 'criterion 4  constrained-column safety ........... %s\n' "$C4_STATUS"
  printf '  4a snapshot diff detects the change ........... %s\n' "$C4A_STATUS"
  printf 'criterion 5  tampering detection ................. %s\n' "$C5_STATUS"
  printf '  5b edited applied migration (checksum) ........ %s\n' "$C5B_STATUS"
  printf 'criterion 6  reproducibility ..................... %s\n' "$REPLAY_STATUS"
  echo
  echo "Schema under test: prisma/schema.prisma — $EXPECTED_TABLES tables, $EXPECTED_ENUMS enums,"
  echo "$EXPECTED_FKS_SINGLE single-column FKs + $EXPECTED_FKS_COMPOSITE composite FKs, $EXPECTED_CHECKS CHECK constraints,"
  echo "$EXPECTED_HAND_INDEXES hand-written partial/expression indexes."
  echo "Migrations under test: ${COMMITTED_MIGRATIONS[*]},"
  echo "deployed with 'prisma migrate deploy' — no transcription."
  echo
  echo "G-1 remains FAILED and is not re-scored by this run."
} | tee "$OUT_DIR/RESULT.txt"
cp "$RUN_LOG" "$OUT_DIR/run.log" 2>/dev/null || true
echo
echo "[G-3F] artefacts in $OUT_DIR"
