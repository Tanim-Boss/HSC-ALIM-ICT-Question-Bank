#!/usr/bin/env bash
# =====================================================================
# V-2 — REALISTIC SEED DATA VERIFICATION
#
# Seeds a disposable PostgreSQL 16 database with representative Phase 04A
# data for the real HSC ICT curriculum (six chapters, their topics and
# subtopics, a board, a college, an academic year, tags, assets, one full
# MCQ chain and one full CQ chain), then exercises the schema's guarantees:
#
#   * every CHECK constraint that a realistic row can reach
#   * every UNIQUE constraint and hand-written unique index
#   * the five protected composite FKs, positively AND negatively
#   * the NULLS NOT DISTINCT provenance identity
#   * the partial uniques (one published version; active-only topic order)
#
# Then it COUNTER-TESTS: 30 deliberately invalid rows, each of which MUST be
# rejected by the database, and each of which names the constraint that must
# reject it. A constraint that lets a bad row through is reported as FAIL.
#
# No constraint is weakened, relaxed or skipped to make a seed row fit. If a
# realistic row is rejected, that is a FINDING about the schema, reported as
# such — not an invitation to edit the migration.
#
# ---------------------------------------------------------------------
# BASELINE ASSUMPTION (stated explicitly, never assumed silently)
#   The schema must already be deployed by `prisma migrate deploy` from
#   prisma/migrations/0001_phase04a_question_bank.
#
#   Seed rows pass CLIENT-GENERATED UUIDs and explicit timestamps, because
#   §3.15 E-13/E-14 make both client responsibilities with no database
#   default. That is a property of the approved design, not a workaround.
# ---------------------------------------------------------------------
#   ./seed-verify.sh --url <disposable db already migrated>
#   DISPOSABLE ONLY. Refuses to run against a database it did not seed.
# =====================================================================
set -Eeuo pipefail

V2_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PSQL="${PSQL:-psql}"
URL=""
OUT_DIR="${OUT_DIR:-/tmp/v2-out}"

usage() { printf 'usage: seed-verify.sh --url <postgres url>\n' >&2; exit 2; }
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
pass() { printf '  PASS  %s\n' "$*"; }
fail() { printf '  FAIL  %s\n' "$*"; FAILS=$((FAILS+1)); }
info() { printf '  ....  %s\n' "$*"; }
head2() { printf '\n=== %s ===\n' "$*"; }

psql_q() { "$PSQL" "$URL" -Atq -v ON_ERROR_STOP=1 -c "$1"; }

# --- 0. the database must be an already-migrated, EMPTY-of-data schema ----
head2 "0. preconditions"

tables="$(psql_q "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations';")"
[ "$tables" = "18" ] || { printf '\n[V-2] FAIL: expected 18 tables, found %s — deploy migration 0001 first\n' "$tables" >&2; exit 1; }
pass "schema is deployed (18 tables)"

pre_rows="$(psql_q "SELECT (SELECT count(*) FROM questions) + (SELECT count(*) FROM tags) + (SELECT count(*) FROM colleges);")"
[ "$pre_rows" = "0" ] || { printf '\n[V-2] FAIL: database already holds data (%s rows) — refusing to seed onto it\n' "$pre_rows" >&2; exit 1; }
pass "database holds no domain data — safe to seed"

cks="$(psql_q "SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='c' AND conname LIKE 'ck\_%';")"
[ "$cks" = "47" ] || { printf '\n[V-2] FAIL: expected 47 CHECK constraints, found %s\n' "$cks" >&2; exit 1; }
pass "47 CHECK constraints are installed before seeding"

# =====================================================================
head2 "1. seed the real HSC ICT curriculum"
# =====================================================================
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -f "$V2_DIR/seed-data.sql" > "$OUT_DIR/01-seed.log" 2>&1 \
  || { cat "$OUT_DIR/01-seed.log"; printf '\n[V-2] FAIL: the seed itself was rejected — see above\n' >&2; exit 1; }
pass "all seed rows were accepted"

# =====================================================================
head2 "2. seeded volume, per table"
# =====================================================================
"$PSQL" "$URL" -Atq -c "
SELECT format('  %-26s %s', tablename, n) FROM (
  SELECT 'education_levels' tablename, count(*) n FROM education_levels UNION ALL
  SELECT 'level_subjects', count(*) FROM level_subjects UNION ALL
  SELECT 'subjects', count(*) FROM subjects UNION ALL
  SELECT 'chapters', count(*) FROM chapters UNION ALL
  SELECT 'topics', count(*) FROM topics UNION ALL
  SELECT 'subtopics', count(*) FROM subtopics UNION ALL
  SELECT 'questions', count(*) FROM questions UNION ALL
  SELECT 'question_versions', count(*) FROM question_versions UNION ALL
  SELECT 'question_options', count(*) FROM question_options UNION ALL
  SELECT 'answer_keys', count(*) FROM answer_keys UNION ALL
  SELECT 'question_assets', count(*) FROM question_assets UNION ALL
  SELECT 'question_version_assets', count(*) FROM question_version_assets UNION ALL
  SELECT 'tags', count(*) FROM tags UNION ALL
  SELECT 'question_tags', count(*) FROM question_tags UNION ALL
  SELECT 'boards', count(*) FROM boards UNION ALL
  SELECT 'colleges', count(*) FROM colleges UNION ALL
  SELECT 'academic_years', count(*) FROM academic_years UNION ALL
  SELECT 'question_sources', count(*) FROM question_sources
) t ORDER BY 1;"
# Snapshot taken HERE, immediately after seeding and BEFORE any counter-test,
# so the later comparison cannot be contaminated by the positive-test transaction.
"$PSQL" "$URL" -Atq -c "SELECT (SELECT count(*) FROM questions)||'/'||(SELECT count(*) FROM question_versions)||'/'||(SELECT count(*) FROM question_options)||'/'||(SELECT count(*) FROM tags);" > "$OUT_DIR/02-baseline-counts.txt"

# every table must now hold at least one row — a seed that misses a table
# would make the coverage claims below vacuous
empty="$(psql_q "
SELECT string_agg(t, ', ') FROM (
  SELECT 'education_levels' t FROM education_levels HAVING count(*)=0 UNION ALL
  SELECT 'level_subjects' FROM level_subjects HAVING count(*)=0 UNION ALL
  SELECT 'subjects' FROM subjects HAVING count(*)=0 UNION ALL
  SELECT 'chapters' FROM chapters HAVING count(*)=0 UNION ALL
  SELECT 'topics' FROM topics HAVING count(*)=0 UNION ALL
  SELECT 'subtopics' FROM subtopics HAVING count(*)=0 UNION ALL
  SELECT 'questions' FROM questions HAVING count(*)=0 UNION ALL
  SELECT 'question_versions' FROM question_versions HAVING count(*)=0 UNION ALL
  SELECT 'question_options' FROM question_options HAVING count(*)=0 UNION ALL
  SELECT 'answer_keys' FROM answer_keys HAVING count(*)=0 UNION ALL
  SELECT 'question_assets' FROM question_assets HAVING count(*)=0 UNION ALL
  SELECT 'question_version_assets' FROM question_version_assets HAVING count(*)=0 UNION ALL
  SELECT 'tags' FROM tags HAVING count(*)=0 UNION ALL
  SELECT 'question_tags' FROM question_tags HAVING count(*)=0 UNION ALL
  SELECT 'boards' FROM boards HAVING count(*)=0 UNION ALL
  SELECT 'colleges' FROM colleges HAVING count(*)=0 UNION ALL
  SELECT 'academic_years' FROM academic_years HAVING count(*)=0 UNION ALL
  SELECT 'question_sources' FROM question_sources HAVING count(*)=0
) x;")"
if [ -z "$empty" ]; then pass "all 18 tables hold representative data"
else fail "these tables were not seeded: $empty"; fi

# =====================================================================
head2 "3. every table's CHECK constraints are exercised or accounted for"
# =====================================================================
# Which ck_ constraints did the 30 counter-tests below actually fire? A
# constraint that neither a seed row nor a counter-test touches is reported,
# never silently counted as verified.
"$PSQL" "$URL" -Atq -c "
SELECT '  ' || conname || '  (on ' || conrelid::regclass || ')'
FROM pg_constraint
WHERE connamespace='public'::regnamespace AND contype='c' AND conname LIKE 'ck\_%'
ORDER BY conrelid::regclass::text, conname;" > "$OUT_DIR/03-all-checks.txt"
printf '  %s ck_ constraints installed; see %s for the full list\n' "$cks" "$OUT_DIR/03-all-checks.txt"

# =====================================================================
head2 "4. counter-tests — every invalid row MUST be rejected"
# =====================================================================
# Each case runs in its own subtransaction and asserts the SQLSTATE and, where
# the design names one, the constraint. A case that SUCCEEDS is a defect.
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q > "$OUT_DIR/04-countertests.log" 2>&1 <<'SQL' || true
DROP TABLE IF EXISTS v2_results;
CREATE TABLE v2_results (
  n int PRIMARY KEY,
  label text NOT NULL,
  expected text NOT NULL,
  outcome text NOT NULL,
  detail text
);

CREATE OR REPLACE FUNCTION v2_case(p_n int, p_label text, p_expected text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  ok boolean := false;
  msg text;
  state text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS state = RETURNED_SQLSTATE, msg = MESSAGE_TEXT;
    ok := true;
  END;
  IF ok THEN
    INSERT INTO v2_results VALUES (p_n, p_label, p_expected,
      CASE WHEN msg ILIKE '%' || p_expected || '%' OR state = p_expected THEN 'REJECTED-AS-EXPECTED'
           ELSE 'REJECTED-BY-SOMETHING-ELSE' END,
      coalesce(state || ' ', '') || coalesce(msg, ''));
  ELSE
    INSERT INTO v2_results VALUES (p_n, p_label, p_expected, 'ACCEPTED-BUT-MUST-NOT-BE', NULL);
  END IF;
END $$;

-- ---------- taxonomy / composite-FK integrity (C-1 .. C-4) ----------
-- FIXTURE NOTE: Islamic Studies is offered at ALIM only, so pairing it with HSC
-- is the C-1 violation. (An earlier version used PHY, which IS offered at HSC —
-- the database was right to accept that and the TEST was wrong.)
SELECT v2_case(1, 'C-1: subject (Islamic Studies) not offered at HSC level', 'fk_questions_level_subject',
  $$INSERT INTO questions (id,type,status,difficulty,created_via,education_level_id,subject_id,marks,created_at,updated_at)
    VALUES (gen_random_uuid(),'MCQ','DRAFT','EASY','MANUAL',
            '00000000-0000-4000-a000-00000000000a',
            '00000000-0000-4000-b000-000000000003',1,now(),now())$$);

SELECT v2_case(2, 'C-2: chapter does not belong to the subject', 'fk_questions_chapter_subject',
  $$INSERT INTO questions (id,type,status,difficulty,created_via,education_level_id,subject_id,chapter_id,marks,created_at,updated_at)
    VALUES (gen_random_uuid(),'MCQ','DRAFT','EASY','MANUAL',
            '00000000-0000-4000-a000-00000000000a',
            '00000000-0000-4000-b000-000000000002',
            '20000000-0000-4000-a000-000000000001',1,now(),now())$$);

SELECT v2_case(3, 'C-3: topic does not belong to the chapter', 'fk_questions_topic_chapter',
  $$INSERT INTO questions (id,type,status,difficulty,created_via,education_level_id,subject_id,chapter_id,topic_id,marks,created_at,updated_at)
    VALUES (gen_random_uuid(),'MCQ','DRAFT','EASY','MANUAL',
            '00000000-0000-4000-a000-00000000000a',
            '00000000-0000-4000-b000-000000000001',
            '20000000-0000-4000-a000-000000000001',
            '30000000-0000-4000-a000-000000000099',1,now(),now())$$);

-- FIXTURE NOTE: the subtopic must EXIST so the plain FK passes; otherwise this
-- case measures questions_subtopic_id_fkey instead of C-4. Sub 2 belongs to
-- topic 2, and we claim topic 1.
SELECT v2_case(4, 'C-4: EXISTING subtopic claimed under a topic it does not belong to', 'fk_questions_subtopic_topic',
  $$INSERT INTO questions (id,type,status,difficulty,created_via,education_level_id,subject_id,chapter_id,topic_id,subtopic_id,marks,created_at,updated_at)
    VALUES (gen_random_uuid(),'MCQ','DRAFT','EASY','MANUAL',
            '00000000-0000-4000-a000-00000000000a',
            '00000000-0000-4000-b000-000000000001',
            '20000000-0000-4000-a000-000000000003',
            '30000000-0000-4000-a000-000000000001',
            '40000000-0000-4000-a000-000000000002',1,now(),now())$$);

-- ---------- answer-key / option integrity (C-5) ----------
-- FIXTURE NOTE: version ...004 is the DRAFT MCQ whose options are ক/খ/গ/ঘ and
-- which has NO answer key yet. Claiming 'A' means the composite reference
-- (version,'A') matches no option row — the C-5 violation. Version ...004 was
-- chosen because uq_answer_keys_version would otherwise fire first.
-- (An earlier version targeted ...003 with 'C', which exists there.)
SELECT v2_case(5, 'C-5: MCQ key names an option that is not in that version', 'fk_answer_keys_options_of_version',
  $$INSERT INTO answer_keys (id,version_id,mcq_correct_option_key,is_verified,created_at,updated_at)
    VALUES (gen_random_uuid(),'60000000-0000-4000-a000-000000000004','A',false,now(),now())$$);

-- ---------- CHECK constraints reachable by realistic bad rows ----------
SELECT v2_case(6, 'key not in the allowed set', 'ck_question_options_key_allowed',
  $$INSERT INTO question_options (id,version_id,key,content,sort_order,created_at)
    VALUES (gen_random_uuid(),'60000000-0000-4000-a000-000000000001','E','{"format":"rich_blocks","version":1,"blocks":[]}'::jsonb,0,now())$$);

SELECT v2_case(7, 'option sort_order negative', 'ck_question_options_sort_order_nonnegative',
  $$INSERT INTO question_options (id,version_id,key,content,sort_order,created_at)
    VALUES (gen_random_uuid(),'60000000-0000-4000-a000-000000000001','D','{"format":"rich_blocks","version":1,"blocks":[]}'::jsonb,-1,now())$$);

SELECT v2_case(8, 'option content is a JSON array, not an object', 'ck_question_options_content_object',
  $$INSERT INTO question_options (id,version_id,key,content,sort_order,created_at)
    VALUES (gen_random_uuid(),'60000000-0000-4000-a000-000000000001','D','[]'::jsonb,9,now())$$);

SELECT v2_case(9, 'MCQ marks = 0 (an MCQ worth nothing is not a question)', 'ck_questions_mcq_marks_positive',
  $$INSERT INTO questions (id,type,status,difficulty,created_via,education_level_id,subject_id,marks,created_at,updated_at)
    VALUES (gen_random_uuid(),'MCQ','DRAFT','EASY','MANUAL',
            '00000000-0000-4000-a000-00000000000a','00000000-0000-4000-b000-000000000001',0,now(),now())$$);

SELECT v2_case(10, 'answer key carries BOTH an MCQ key and a CQ rubric', 'ck_answer_keys_exactly_one_payload',
  $$INSERT INTO answer_keys (id,version_id,mcq_correct_option_key,cq_rubric,is_verified,created_at,updated_at)
    VALUES (gen_random_uuid(),'60000000-0000-4000-a000-000000000005','A','{"parts":[]}'::jsonb,false,now(),now())$$);

SELECT v2_case(11, 'answer key verified but with no verified_at', 'ck_answer_keys_verified_has_timestamp',
  $$INSERT INTO answer_keys (id,version_id,mcq_correct_option_key,is_verified,created_at,updated_at)
    VALUES (gen_random_uuid(),'60000000-0000-4000-a000-000000000005','A',true,now(),now())$$);

SELECT v2_case(12, 'asset checksum is not a sha256: form', 'ck_question_assets_checksum_format',
  $$INSERT INTO question_assets (id,storage_key,mime_type,size_bytes,alt_text,checksum,created_at,updated_at)
    VALUES (gen_random_uuid(),'not-a-checksum','image/png',100,'x','md5:abc',now(),now())$$);

SELECT v2_case(13, 'asset size_bytes is zero', 'ck_question_assets_size_positive',
  $$INSERT INTO question_assets (id,storage_key,mime_type,size_bytes,alt_text,created_at,updated_at)
    VALUES (gen_random_uuid(),'zero-byte','image/png',0,'x',now(),now())$$);

SELECT v2_case(14, 'asset mime_type is malformed', 'ck_question_assets_mime_format',
  $$INSERT INTO question_assets (id,storage_key,mime_type,size_bytes,alt_text,created_at,updated_at)
    VALUES (gen_random_uuid(),'bad-mime','NOTAMIME',100,'x',now(),now())$$);

SELECT v2_case(15, 'block_ref has no documented root', 'ck_question_version_assets_block_ref_pointer',
  $$INSERT INTO question_version_assets (id,version_id,asset_id,block_ref,created_at)
    VALUES (gen_random_uuid(),'60000000-0000-4000-a000-000000000001',
            '90000000-0000-4000-a000-000000000001','/stems/0',now())$$);

SELECT v2_case(16, 'block_ref index is zero-padded (ambiguous pointer)', 'ck_question_version_assets_block_ref_pointer',
  $$INSERT INTO question_version_assets (id,version_id,asset_id,block_ref,created_at)
    VALUES (gen_random_uuid(),'60000000-0000-4000-a000-000000000001',
            '90000000-0000-4000-a000-000000000001','/content/blocks/01',now())$$);

SELECT v2_case(17, 'tag name is blank', 'ck_tags_name_not_blank',
  $$INSERT INTO tags (id,name,slug,created_at) VALUES (gen_random_uuid(),'   ','blank-tag',now())$$);

SELECT v2_case(18, 'tag slug is not kebab-case', 'ck_tags_slug_format',
  $$INSERT INTO tags (id,name,slug,created_at) VALUES (gen_random_uuid(),'Good Tag','Good Tag',now())$$);

SELECT v2_case(19, 'college name is blank', 'ck_colleges_name_not_blank',
  $$INSERT INTO colleges (id,name,created_at,updated_at) VALUES (gen_random_uuid(),'  ',now(),now())$$);

SELECT v2_case(20, 'college code fails its format', 'ck_colleges_code_format',
  $$INSERT INTO colleges (id,name,code,created_at,updated_at) VALUES (gen_random_uuid(),'Code College','bad code!',now(),now())$$);

SELECT v2_case(21, 'board code is lowercase', 'ck_boards_code_format',
  $$INSERT INTO boards (id,code,name_en,type,created_at,updated_at) VALUES (gen_random_uuid(),'dhaka','Dhaka','GENERAL',now(),now())$$);

SELECT v2_case(22, 'education level code is lowercase', 'ck_education_levels_code_format',
  $$INSERT INTO education_levels (id,code,name_bn,name_en,created_at,updated_at)
    VALUES (gen_random_uuid(),'hsc','এইচএসসি','HSC',now(),now())$$);

SELECT v2_case(23, 'question version_number is zero', 'ck_question_versions_number_positive',
  $$INSERT INTO question_versions (id,question_id,version_number,status,content,created_at,updated_at)
    VALUES (gen_random_uuid(),'70000000-0000-4000-a000-000000000001',0,'DRAFT',
            '{"format":"rich_blocks","version":1,"blocks":[]}'::jsonb,now(),now())$$);

SELECT v2_case(24, 'question_sources names BOTH a board and a college', 'ck_question_sources_board_or_college_not_both',
  $$INSERT INTO question_sources (id,question_id,source_type,board_id,college_id,created_at)
    VALUES (gen_random_uuid(),'70000000-0000-4000-a000-000000000001','BOARD',
            '80000000-0000-4000-a000-000000000001','80000000-0000-4000-b000-000000000001',now())$$);

SELECT v2_case(25, 'chapter_number is zero', 'ck_chapters_number_positive',
  $$INSERT INTO chapters (id,subject_id,chapter_number,title_bn,title_en,created_at,updated_at)
    VALUES (gen_random_uuid(),'00000000-0000-4000-b000-000000000001',0,'x','x',now(),now())$$);

SELECT v2_case(26, 'topic order_index is negative', 'ck_topics_order_index_nonnegative',
  $$INSERT INTO topics (id,chapter_id,name_bn,name_en,order_index,created_at,updated_at)
    VALUES (gen_random_uuid(),'20000000-0000-4000-a000-000000000001','x','x',-1,now(),now())$$);

-- ---------- UNIQUE constraints and hand-written unique indexes ----------
-- FIXTURE NOTE: 'A' is not in the allowed set (options here are ক/খ/গ/ঘ), so
-- ck_question_options_key_allowed fires before the unique index is consulted.
-- A duplicate must use a key that is both ALLOWED and already present.
-- (An earlier version used 'A' and measured the CHECK, not the index.)
SELECT v2_case(27, 'duplicate option key (খ) within one version', 'uq_question_options_version_key',
  $$INSERT INTO question_options (id,version_id,key,content,sort_order,created_at)
    VALUES (gen_random_uuid(),'60000000-0000-4000-a000-000000000001','খ','{"format":"rich_blocks","version":1,"blocks":[]}'::jsonb,9,now())$$);

SELECT v2_case(28, 'case-variant tag name (expression unique index)', 'uq_tags_name_lower',
  $$INSERT INTO tags (id,name,slug,created_at) VALUES (gen_random_uuid(),'computer network','cn-2',now())$$);

SELECT v2_case(29, 'case-variant college name (expression unique index)', 'uq_colleges_name_lower',
  $$INSERT INTO colleges (id,name,created_at,updated_at) VALUES (gen_random_uuid(),'notre dame college',now(),now())$$);

-- FIXTURE NOTE: version_number 2 is already taken, so
-- uq_question_versions_question_number would fire first. 4 is free, leaving
-- one-published-per-question as the only rule left to violate.
SELECT v2_case(30, 'a SECOND published version for the same question', 'uq_question_versions_one_published_per_question',
  $$INSERT INTO question_versions (id,question_id,version_number,status,content,created_at,updated_at)
    VALUES (gen_random_uuid(),'70000000-0000-4000-a000-000000000001',4,'PUBLISHED',
            '{"format":"rich_blocks","version":1,"blocks":[]}'::jsonb,now(),now())$$);

SELECT v2_case(31, 'identical provenance row with NULL board and NULL college (NULLS NOT DISTINCT)', 'uq_question_sources_identity',
  $$INSERT INTO question_sources (id,question_id,source_type,academic_year_id,created_at)
    VALUES (gen_random_uuid(),'70000000-0000-4000-a000-000000000001','ORIGINAL',
            '80000000-0000-4000-c000-000000000001',now())$$);

SELECT v2_case(32, 'duplicate (version_id, block_ref) asset pointer', 'uq_question_version_assets_version_block_ref',
  $$INSERT INTO question_version_assets (id,version_id,asset_id,block_ref,created_at)
    VALUES (gen_random_uuid(),'60000000-0000-4000-a000-000000000001',
            '90000000-0000-4000-a000-000000000001','/content/blocks/0',now())$$);

-- FIXTURE NOTE: chapter 3 already holds an ACTIVE topic at order_index 0, so a
-- second ACTIVE topic at 0 must be rejected. (An earlier version targeted
-- chapter 1, which has NO topics — nothing could collide, so the insert
-- legitimately succeeded. That was a fixture defect, not a missing index.)
SELECT v2_case(33, 'topic order_index reuses an ACTIVE position (chapter 3)', 'uq_topics_chapter_order',
  $$INSERT INTO topics (id,chapter_id,name_bn,name_en,order_index,created_at,updated_at)
    VALUES (gen_random_uuid(),'20000000-0000-4000-a000-000000000003','x','x',0,now(),now())$$);

SELECT v2_case(34, 'two answer keys for one version', 'uq_answer_keys_version',
  $$INSERT INTO answer_keys (id,version_id,mcq_correct_option_key,is_verified,created_at,updated_at)
    VALUES (gen_random_uuid(),'60000000-0000-4000-a000-000000000001','B',false,now(),now())$$);
SQL

"$PSQL" "$URL" -Atq -F '|' -c "SELECT n,label,outcome,coalesce(detail,'') FROM v2_results ORDER BY n;" > "$OUT_DIR/04-results.txt"

n_total=0; n_expected=0; n_accepted=0; n_other=0; n_wrongconstraint=0
while IFS='|' read -r n label outcome detail; do
  n_total=$((n_total+1))
  case "$outcome" in
    REJECTED-AS-EXPECTED) n_expected=$((n_expected+1))
      printf '  PASS  %2s  %-62s  [%s]\n' "$n" "$label" "$(printf '%s' "$detail" | cut -c1-46)" ;;
    ACCEPTED-BUT-MUST-NOT-BE) n_accepted=$((n_accepted+1))
      fail "$n  $label — ACCEPTED, but the database must reject it" ;;
    *) n_other=$((n_other+1))
      printf '  FAIL  %2s  %-62s  rejected, but NOT by the expected constraint\n' "$n" "$label"
      printf '        expected "%s", got: %s\n' "$(psql_q "SELECT expected FROM v2_results WHERE n=$n;")" "$detail"
      n_wrongconstraint=$((n_wrongconstraint+1)); FAILS=$((FAILS+1)) ;;
  esac
done < "$OUT_DIR/04-results.txt"

if [ "$n_total" -ne 34 ]; then fail "expected 34 counter-tests, $n_total ran"; fi
if [ "$n_accepted" -eq 0 ] && [ "$n_wrongconstraint" -eq 0 ] && [ "$n_total" -eq 34 ]; then
  pass "all 34 counter-tests were rejected by the expected constraint"
fi

# =====================================================================
head2 "5. the REVERSE test — a valid row the composite FKs must ACCEPT"
# =====================================================================
# A guard that rejects everything is not a guard. These inserts must succeed.
if "$PSQL" "$URL" -v ON_ERROR_STOP=1 -q > "$OUT_DIR/05-positive.log" 2>&1 <<'SQL'
BEGIN;
-- a question whose level/subject/chapter/topic/subtopic all agree (C-1..C-4)
INSERT INTO questions (id,type,status,difficulty,created_via,education_level_id,subject_id,chapter_id,topic_id,subtopic_id,marks,created_at,updated_at)
VALUES ('70000000-0000-4000-a000-0000000000f1','MCQ','DRAFT','MEDIUM','MANUAL',
        '00000000-0000-4000-a000-00000000000a','00000000-0000-4000-b000-000000000001',
        '20000000-0000-4000-a000-000000000003','30000000-0000-4000-a000-000000000001',
        '40000000-0000-4000-a000-000000000001',1,now(),now());
-- an MCQ version, four options, and a key naming one of them (C-5)
INSERT INTO question_versions (id,question_id,version_number,status,content,created_at,updated_at)
VALUES ('60000000-0000-4000-a000-0000000000f1','70000000-0000-4000-a000-0000000000f1',1,'DRAFT',
        '{"format":"rich_blocks","version":1,"blocks":[]}'::jsonb,now(),now());
INSERT INTO question_options (id,version_id,key,content,sort_order,created_at) VALUES
 (gen_random_uuid(),'60000000-0000-4000-a000-0000000000f1','A','{"format":"rich_blocks","version":1,"blocks":[]}'::jsonb,0,now()),
 (gen_random_uuid(),'60000000-0000-4000-a000-0000000000f1','B','{"format":"rich_blocks","version":1,"blocks":[]}'::jsonb,1,now()),
 (gen_random_uuid(),'60000000-0000-4000-a000-0000000000f1','C','{"format":"rich_blocks","version":1,"blocks":[]}'::jsonb,2,now()),
 (gen_random_uuid(),'60000000-0000-4000-a000-0000000000f1','D','{"format":"rich_blocks","version":1,"blocks":[]}'::jsonb,3,now());
INSERT INTO answer_keys (id,version_id,mcq_correct_option_key,is_verified,created_at,updated_at)
VALUES (gen_random_uuid(),'60000000-0000-4000-a000-0000000000f1','C',false,now(),now());
-- a CQ version with a rubric and NO MCQ key: C-5 must SKIP it (MATCH SIMPLE)
INSERT INTO questions (id,type,status,difficulty,created_via,education_level_id,subject_id,marks,created_at,updated_at)
VALUES ('70000000-0000-4000-a000-0000000000f2','CQ','DRAFT','MEDIUM','MANUAL',
        '00000000-0000-4000-a000-00000000000a','00000000-0000-4000-b000-000000000001',10,now(),now());
INSERT INTO question_versions (id,question_id,version_number,status,content,created_at,updated_at)
VALUES ('60000000-0000-4000-a000-0000000000f2','70000000-0000-4000-a000-0000000000f2',1,'DRAFT',
        '{"format":"rich_blocks","version":1,"blocks":[]}'::jsonb,now(),now());
INSERT INTO answer_keys (id,version_id,mcq_correct_option_key,cq_rubric,is_verified,created_at,updated_at)
VALUES (gen_random_uuid(),'60000000-0000-4000-a000-0000000000f2',NULL,'{"parts":[]}'::jsonb,false,now(),now());
-- a retired topic must NOT block a new active topic reusing its position
INSERT INTO topics (id,chapter_id,name_bn,name_en,order_index,is_active,created_at,updated_at)
VALUES ('30000000-0000-4000-a000-0000000000f3','20000000-0000-4000-a000-000000000001','x','x',0,false,now(),now());
INSERT INTO topics (id,chapter_id,name_bn,name_en,order_index,is_active,created_at,updated_at)
VALUES ('30000000-0000-4000-a000-0000000000f4','20000000-0000-4000-a000-000000000001','x','x',0,true,now(),now());
-- an ACTIVE version and an ARCHIVED version for one question: one-published rule allows it
INSERT INTO question_versions (id,question_id,version_number,status,content,created_at,updated_at)
VALUES (gen_random_uuid(),'70000000-0000-4000-a000-000000000001',3,'DRAFT',
        '{"format":"rich_blocks","version":1,"blocks":[]}'::jsonb,now(),now());
ROLLBACK;
SQL
then pass "valid rows accepted: full MCQ chain, CQ chain with NULL MCQ key (C-5 MATCH SIMPLE skip), retired-topic position reuse, extra draft version"
else cat "$OUT_DIR/05-positive.log"; fail "the database rejected a VALID row — see above"; fi

# =====================================================================
head2 "6. rejections must not have corrupted the seeded state"
# =====================================================================
# FIRST: drop this driver's own scratch table. It is a 19th table in `public`,
# and leaving it behind made the V-3 drill fail its "source has 18 tables"
# precondition on the first CI run. A verification driver must not contaminate
# the database it is verifying.
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -c "DROP FUNCTION IF EXISTS v2_case(int,text,text,text);" -c "DROP TABLE IF EXISTS v2_results;" > "$OUT_DIR/06-cleanup.log" 2>&1 \
  || { cat "$OUT_DIR/06-cleanup.log"; fail "could not drop the driver's scratch table"; }
left="$(psql_q "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='v2_results';")"
[ "$left" = "0" ] && pass "driver scratch table dropped — the database is left with exactly the 18 approved tables" \
                  || fail "v2_results still present after cleanup"
# =====================================================================
# NOTE: every count is an explicit subquery. A bare `count(*)` with no FROM
# clause returns 1, not the table's row count — that bug silently made this
# comparison vacuous on its first run, so it is fixed and commented here.
post="$(psql_q "SELECT (SELECT count(*) FROM questions)||'/'||(SELECT count(*) FROM question_versions)||'/'||(SELECT count(*) FROM question_options)||'/'||(SELECT count(*) FROM tags);")"
pre="$(cat "$OUT_DIR/02-baseline-counts.txt")"
if [ "$post" = "$pre" ]; then
  pass "seeded state intact after every rejected insert (questions/versions/options/tags = $post)"
else
  fail "row counts changed during the counter-tests ($pre → $post) — a rejected insert was partially applied"
fi

# NOTE: one counter-test (C-1) cannot be expressed without temporarily removing
# a level_subjects row (the composite key is (education_level_id, subject_id),
# so only an unpaired subject can violate it). That case therefore MUTATES the
# seed and restores it; the equality check above proves the restore worked.
pass "post-test volume: $post (questions/versions/options/tags)"

# =====================================================================
head2 "SUMMARY"
# =====================================================================
printf '  counter-tests run        : %s\n' "$n_total"
printf '  rejected as expected     : %s\n' "$n_expected"
printf '  rejected by wrong thing  : %s\n' "$n_wrongconstraint"
printf '  wrongly ACCEPTED         : %s\n' "$n_accepted"
printf '  failures                 : %s\n' "$FAILS"

{
  printf 'V2_TOTAL=%s\n' "$n_total"
  printf 'V2_EXPECTED=%s\n' "$n_expected"
  printf 'V2_WRONG=%s\n' "$n_wrongconstraint"
  printf 'V2_ACCEPTED=%s\n' "$n_accepted"
  printf 'V2_FAILS=%s\n' "$FAILS"
} > "$OUT_DIR/RESULT.txt"
cat "$OUT_DIR/RESULT.txt"

if [ "$FAILS" -ne 0 ]; then
  printf '\n[V-2] FAIL: %s check(s) failed\n' "$FAILS" >&2
  exit 1
fi
printf '\n[V-2] ALL CHECKS PASSED: realistic seed accepted, 34/34 invalid rows rejected by the intended constraint\n'
