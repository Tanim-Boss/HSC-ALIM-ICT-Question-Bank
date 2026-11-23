#!/usr/bin/env bash
# =====================================================================
# LOCAL SQL-level verification for the full-schema G-3 harness.
#
# THIS IS NOT G-3 EVIDENCE AND CAN NEVER BE. It applies the migration with
# psql instead of `prisma migrate deploy`, so it exercises:
#
#     the migration SQL, the schema shape, the live-catalog control,
#     the enforcement suite, and the textual guard — all negative-tested.
#
# It does NOT exercise: migration history, `migrate status`, reproducibility
# through Prisma, or `prisma migrate diff` visibility. Those require the Prisma
# schema engine and are covered only by the CI workflow
# (.github/workflows/phase04a-g3-full-schema-gate.yml).
#
# Its purpose is to catch harness defects locally before burning a CI run —
# exactly the role the prototype's --partial-postgres-only mode plays.
#
#   bash local-verify.sh --url <empty disposable db>
# =====================================================================
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OC_DIR="$(cd "$HERE/.." && pwd)"
SPIKE_DIR="$(cd "$OC_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SPIKE_DIR/../../.." && pwd)"
PSQL="${PSQL:-psql}"
GUARD="$OC_DIR/guard.py"
MIG="$REPO_ROOT/prisma/migrations/0001_phase04a_question_bank/migration.sql"

fail() { printf '\n[local] FAIL: %s\n' "$*" >&2; exit 1; }
ok()   { printf '[local] ok: %s\n' "$*"; }
info() { printf '[local]     %s\n' "$*"; }

URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --url=*) URL="${1#*=}"; shift ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done
[ -n "$URL" ] || fail "usage: local-verify.sh --url <empty disposable db>"
case "$URL" in *production*|*prod*|*staging*) fail "refusing to run against a non-disposable database" ;; esac

OUT="$HERE/out-local"
rm -rf "$OUT"; mkdir -p "$OUT"

objs="$("$PSQL" "$URL" -Atc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','i','S','v','m');")"
[ "$objs" = "0" ] || fail "the database is not empty ($objs objects)"

printf '\n=== 1. apply the committed migration SQL ===\n'
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -f "$MIG" > "$OUT/apply.log" 2>&1 \
  || { cat "$OUT/apply.log"; fail "the committed migration failed to apply"; }
ok "migration applies cleanly to PostgreSQL $("$PSQL" "$URL" -Atc 'SHOW server_version;' | cut -d' ' -f1)"

printf '\n=== 2. schema shape (18 / 7 / 26 / 47 / 6) ===\n'
shape="$("$PSQL" "$URL" -Atc "
SELECT (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations') || '/' ||
       (SELECT count(*) FROM pg_type WHERE typtype='e' AND typnamespace='public'::regnamespace) || '/' ||
       (SELECT count(*) FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace) || '/' ||
       (SELECT count(*) FROM pg_constraint WHERE contype='c' AND connamespace='public'::regnamespace AND conname LIKE 'ck\_%') || '/' ||
       (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN
          ('uq_question_versions_one_published_per_question','uq_question_sources_identity',
           'uq_topics_chapter_order','uq_tags_name_lower','uq_colleges_name_lower',
           'ix_question_assets_checksum'));")"
info "tables/enums/fks/checks/hand_indexes = $shape"
[ "$shape" = "18/7/26/47/6" ] || fail "shape is $shape, expected 18/7/26/47/6"
ok "shape is exactly 18 tables / 7 enums / 26 FKs (21+5) / 47 CHECKs / 6 hand indexes"

printf '\n=== 3. live-catalog assertion, positive and negative ===\n'
Q="$(python3 -c "import sys;sys.path.insert(0,'$OC_DIR');import guard;print(guard.CATALOG_QUERY)")"
cat_catalog() { "$PSQL" "$URL" -Atc "SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM ($Q) t;"; }

cat_catalog > "$OUT/cat-ok.json"
python3 "$GUARD" catalog "$OUT/cat-ok.json" > "$OUT/cat-ok.log" 2>&1 \
  || { cat "$OUT/cat-ok.log"; fail "the catalog assertion rejected the real schema"; }
ok "catalog assertion passes on the real deployed schema"

"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q \
  -c 'ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_subtopic_topic";' \
  -c 'ALTER TABLE "questions" ADD CONSTRAINT "fk_questions_subtopic_topic" FOREIGN KEY ("subtopic_id","topic_id") REFERENCES "subtopics"("id","topic_id") ON UPDATE CASCADE ON DELETE CASCADE;'
cat_catalog > "$OUT/cat-weakened.json"
if python3 "$GUARD" catalog "$OUT/cat-weakened.json" > "$OUT/cat-weakened.log" 2>&1; then
  fail "the catalog assertion ACCEPTED an ON DELETE CASCADE weakening"
fi
ok "catalog assertion rejects a weakened ON DELETE action"

"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q \
  -c 'ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_subtopic_topic";' \
  -c 'ALTER TABLE "questions" ADD CONSTRAINT "fk_questions_subtopic_topic" FOREIGN KEY ("subtopic_id","topic_id") REFERENCES "subtopics"("id","topic_id") ON UPDATE CASCADE ON DELETE RESTRICT;'
cat_catalog > "$OUT/cat-restored.json"
python3 "$GUARD" catalog "$OUT/cat-restored.json" > "$OUT/cat-restored.log" 2>&1 \
  || { cat "$OUT/cat-restored.log"; fail "the catalog assertion rejected the restoration"; }
ok "catalog assertion accepts the restoration (not vacuous)"

printf '\n=== 4. full-schema enforcement suite (33 cases) ===\n'
"$PSQL" "$URL" -v ON_ERROR_STOP=0 -f "$HERE/enforce.sql" > "$OUT/enforce.log" 2>&1 || true
T="$(grep -oE 'G3F_TOTAL= *[0-9]+' "$OUT/enforce.log" | head -1 | sed 's/.*= *//')"
P="$(grep -oE 'G3F_PASS= *[0-9]+' "$OUT/enforce.log" | head -1 | sed 's/.*= *//')"
F="$(grep -oE 'G3F_FAIL= *[0-9]+' "$OUT/enforce.log" | head -1 | sed 's/.*= *//')"
info "TOTAL=${T:-?} PASS=${P:-?} FAIL=${F:-?}"
[ "$T" = "33" ] || fail "the enforcement suite ran ${T:-0} cases, expected 33"
[ "$F" = "0" ] || { grep '|' "$OUT/enforce.log" | grep FAIL || true; fail "the enforcement suite had ${F:-?} failures"; }
ok "33/33 enforcement cases PASS on the real 18-table schema"

printf '\n=== 5. textual guard: the real baseline, plus negative tests ===\n'
python3 "$GUARD" sql "$MIG" > "$OUT/guard-baseline.log" 2>&1 \
  || { cat "$OUT/guard-baseline.log"; fail "the guard rejected the committed baseline"; }
ok "the guard accepts the committed baseline (no false positive)"

mkdir -p "$OUT/tamper"
cat > "$OUT/tamper/drop-only.sql" <<'SQL'
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_level_subject";
SQL
cat > "$OUT/tamper/weakened.sql" <<'SQL'
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_level_subject";
ALTER TABLE "questions" ADD CONSTRAINT "fk_questions_level_subject"
  FOREIGN KEY ("education_level_id","subject_id") REFERENCES "level_subjects"("level_id","subject_id")
  ON UPDATE CASCADE;
SQL
cat > "$OUT/tamper/narrowed.sql" <<'SQL'
ALTER TABLE "questions" ADD CONSTRAINT "fk_questions_chapter_subject"
  FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;
SQL
cat > "$OUT/tamper/cascade-delete.sql" <<'SQL'
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_subtopic_topic";
ALTER TABLE "questions" ADD CONSTRAINT "fk_questions_subtopic_topic"
  FOREIGN KEY ("subtopic_id","topic_id") REFERENCES "subtopics"("id","topic_id")
  ON UPDATE CASCADE ON DELETE CASCADE;
SQL
cat > "$OUT/tamper/drop-table.sql" <<'SQL'
DROP TABLE "answer_keys";
SQL
cat > "$OUT/tamper/drop-protected-parent.sql" <<'SQL'
DROP TABLE "question_options";
SQL
n=0
for f in "$OUT/tamper"/*.sql; do
  python3 "$GUARD" sql "$f" > "$OUT/neg-$(basename "$f").log" 2>&1 && fail "the guard ACCEPTED $(basename "$f")"
  n=$((n+1))
done
[ "$n" = "6" ] || fail "expected 6 negative tests, ran $n"
ok "6/6 tampering variants rejected (drop-only, weakened, narrowed, cascade-delete, drop-table, drop-protected-parent)"

printf '\n=== 6. the safe drop+re-add pattern must be ACCEPTED ===\n'
cat > "$OUT/safe.sql" <<'SQL'
BEGIN;
ALTER TABLE "answer_keys" DROP CONSTRAINT "fk_answer_keys_options_of_version";
ALTER TABLE "question_options" ALTER COLUMN "key" TYPE char(1);
ALTER TABLE "answer_keys" ALTER COLUMN "mcq_correct_option_key" TYPE char(1);
ALTER TABLE "answer_keys" ADD CONSTRAINT "fk_answer_keys_options_of_version"
  FOREIGN KEY ("version_id","mcq_correct_option_key")
  REFERENCES "question_options"("version_id","key")
  ON UPDATE CASCADE ON DELETE RESTRICT;
COMMIT;
SQL
python3 "$GUARD" sql "$OUT/safe.sql" > "$OUT/safe-guard.log" 2>&1 \
  || { cat "$OUT/safe-guard.log"; fail "the guard rejected the SAFE drop+re-add pattern"; }
ok "the guard accepts the legitimate drop+re-add pattern"
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -f "$OUT/safe.sql" > "$OUT/safe-apply.log" 2>&1 \
  || { cat "$OUT/safe-apply.log"; fail "the safe constrained-column migration failed to apply"; }
cat_catalog > "$OUT/cat-after-change.json"
python3 "$GUARD" catalog "$OUT/cat-after-change.json" > "$OUT/cat-after-change.log" 2>&1 \
  || { cat "$OUT/cat-after-change.log"; fail "integrity was lost after the constrained-column change"; }
ok "integrity preserved after the constrained-column change"

printf '\n=== RESULT (local SQL evidence only) ===\n'
{
  echo "local SQL-level verification — NOT G-3 evidence"
  echo "shape                         PASS ($shape)"
  echo "catalog assertion             PASS (positive + 2 negative)"
  echo "enforcement suite             PASS ($P/$T)"
  echo "textual guard                 PASS (baseline accepted, 6/6 rejected)"
  echo "constrained-column safety     PASS (safe pattern applied, integrity kept)"
  echo
  echo "NOT tested here: migration history, migrate status, reproducibility"
  echo "through Prisma, migrate-diff visibility. Those require the Prisma schema"
  echo "engine and are covered only by the CI full-schema gate."
} | tee "$OUT/RESULT-local.txt"
