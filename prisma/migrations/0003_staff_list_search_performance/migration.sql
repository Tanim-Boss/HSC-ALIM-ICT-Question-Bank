-- =====================================================================
-- Phase 04D — staff-list performance, independent College filter and
--              Bangla/English question-content search
-- Migration 0003 (ADDITIVE ONLY: nothing in 0001 or 0002 is altered,
--              renamed, dropped or replaced)
--
-- WHAT IT ADDS, AND WHY EACH PIECE EXISTS
-- ---------------------------------------
--   PART A — the two datamodel changes Prisma can express:
--              question_versions.search_text  (the search projection)
--              questions(created_at DESC, id DESC)  (the list's ordering)
--
--   PART B — everything Prisma cannot express, hand-written and reviewed:
--              the pg_trgm extension, the two IMMUTABLE projection
--              functions, the backfill of existing rows, and the GIN
--              trigram index over the projection.
--
-- EVIDENCE
-- --------
-- The index set is the residue of a MEASURED search, not a guess. Every
-- candidate was created on the 50,000-question dataset
-- (scripts/db/seed-perf.ts), the real list query was re-measured
-- (scripts/db/perf-list-questions.ts), and the candidates that did not pay
-- for themselves were dropped again and are recorded as rejected in
-- docs/database/perf/04d-after.md §"Index decisions":
--
--   KEPT      questions(created_at DESC, id DESC)
--             no-filter 24.90 ms -> 0.70 ms; page 50 23.52 ms -> 0.71 ms
--   REJECTED  questions(chapter_id, type, status, created_at DESC, id DESC)
--             chapter+type+status 0.63 ms with it, 0.72 ms without it
--   REJECTED  question_sources(board_id, academic_year_id, question_id)
--             board+year 4.48 ms vs 3.57 ms — inside run-to-run noise
--   REJECTED  question_sources(college_id, question_id)
--             college 1.08 ms vs 0.89 ms — noise
--   REJECTED  question_tags(tag_id, question_id)
--             tag 0.99 ms vs 0.92 ms — noise
--   KEPT      question_versions USING gin (search_text gin_trgm_ops)
--             the only way a Bangla or English substring search avoids a
--             sequential scan of 150,212 version rows
--
-- Nothing in this migration drops an index, a constraint, a table or a
-- column. `docs/database/g1-spike/option-c/guard.py sql` is clean for it, and
-- the Phase 04A inventory (21 tables / 8 enums / 33 FKs / 54 CHECKs) is
-- unchanged: this migration adds NO CHECK constraint, deliberately — see the
-- note at the end of PART B.
--
-- HOW PART A WAS PRODUCED — a stated deviation
-- --------------------------------------------
-- The approved Option C workflow derives PART A from
--   prisma migrate diff --from-schema <prev>.prisma --to-schema prisma/schema.prisma
-- The Prisma schema engine could not be downloaded in this authoring
-- sandbox (binaries.prisma.sh is unreachable — the same limitation that
-- .github/workflows/phase04a-v45-application.yml records for `prisma
-- generate`), so the two statements below were written by hand in Prisma's
-- own DDL style and reviewed statement by statement. They are the whole of
-- PART A: one ADD COLUMN and one CREATE INDEX. Re-running the diff in an
-- environment with engine access is a recommended pre-deployment check; it
-- must produce no `DROP CONSTRAINT` for C-1…C-5 and no other difference.
--
-- EXTENSION PREREQUISITE
-- ----------------------
-- `CREATE EXTENSION IF NOT EXISTS pg_trgm` needs a role that may install
-- extensions. On Supabase that is the project owner, and extensions may be
-- expected in the `extensions` schema; if the deployer's role cannot create
-- it, the owner must enable pg_trgm for the project first. The statement is
-- IF NOT EXISTS so a pre-enabled database is not disturbed, and the GIN
-- index depends on it (operator class gin_trgm_ops).
-- =====================================================================

-- =====================================================================
-- PART A — datamodel DDL (Prisma-expressible)
-- =====================================================================

-- The maintained plain-text projection of a version's content and options.
-- It is maintained by the authoring service (server/questions/authoring/
-- search-text.ts) inside the same transaction that writes `content`; the
-- DEFAULT '' exists so the column can be added to a non-empty table and so
-- that a future out-of-band INSERT cannot fail, not because an empty
-- projection is acceptable — the backfill below fills every existing row and
-- the drift query at the end of this file detects any row that is stale.
ALTER TABLE "question_versions" ADD COLUMN "search_text" TEXT NOT NULL DEFAULT '';

-- The staff list's ordering key. Keyset pagination over (created_at, id)
-- needs exactly this index to stop sorting 50,000 rows for the first page.
CREATE INDEX "ix_questions_created_at_id" ON "questions"("created_at" DESC,"id" DESC);

-- =====================================================================
-- PART B — hand-written artifacts
-- =====================================================================

-- ── B1. Trigram matching for Bangla and English ──────────────────────
-- pg_trgm gives substring matching (`LIKE '%…%'`) an index. A tsvector
-- index cannot do that: it matches lexemes, so a partial word, a Bangla
-- conjunct inside a longer word, or a phrase that spans two blocks would
-- need a second, differently-shaped index. One GIN trigram index answers
-- every case the staff list needs, and it also matches the operator Prisma
-- can express (`contains`), so the query stays in the ORM.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── B2. The projection rule, in SQL ─────────────────────────────────
-- ONE RULE, TWO IMPLEMENTATIONS, PINNED BY A TEST.
-- server/questions/authoring/search-text.ts implements this rule for the
-- service; the functions below implement it for the backfill and for
-- operational re-derivation. An integration test asserts both produce
-- byte-identical text for documents covering every block type, so a change
-- on one side that is not mirrored on the other fails the build.
--
-- The rule: every STRING value whose key is "text", "alt", "longDescription"
-- or "caption", anywhere in the document (blocks, list items, table cells,
-- nested blocks), bucketed by key in that order, buckets joined with a
-- single space, then NFC → lower case → whitespace collapsed → trimmed.
-- Key-name driven on purpose: it covers all ten approved block types without
-- enumerating them, and a new block type that shows text to a student must
-- use one of those field names (§7.4).
--
-- NOT indexed: answer_keys (mcq_correct_option_key, cq_rubric). The
-- projection is derived from `content` and `question_options` only, so it
-- cannot contain an answer even though it is stored beside one.

CREATE FUNCTION ict_normalize_search_text(input text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT btrim(regexp_replace(lower(normalize(input, NFC)), '\s+', ' ', 'g'))
$$;

COMMENT ON FUNCTION ict_normalize_search_text(text) IS
  'Phase 04D: the normalisation shared by the stored projection and staff queries (NFC, lower, collapse whitespace). Mirrors normalizeSearchText() in server/questions/authoring/search-text.ts.';

-- WHY `strict` AND NOT `lax`
-- LAX mode auto-unwraps arrays, so a text value inside an array is visited
-- twice — once as the array member and once through the unwrapped array — and
-- `$.**."text"` returns every list item and every table cell TWICE. Measured
-- on PostgreSQL 16.16:
--   jsonb_path_query_array('{"a":[{...},{"items":[{"text":"a"},{"text":"b"}]}]}',
--                          '$.**."text"')        -> ["one","a","b","a","b"]
--   jsonb_path_query_array(…, 'strict $.**."text"') -> ["one","a","b"]
-- STRICT mode visits each node once, in document order, and — checked against
-- scalars, missing keys, empty arrays, nested blocks, table rows and list
-- items — does not raise for a document that simply has no "text" somewhere.
-- It is therefore safe here, and it is what makes the SQL result identical to
-- the TypeScript walk (which visits each node once by construction).
CREATE FUNCTION ict_search_text_of(doc jsonb) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT concat_ws(' ',
      (SELECT string_agg(value, ' ')
         FROM jsonb_array_elements_text(
                jsonb_path_query_array(doc, 'strict $.**."text" ? (@.type() == "string")')) AS value),
      (SELECT string_agg(value, ' ')
         FROM jsonb_array_elements_text(
                jsonb_path_query_array(doc, 'strict $.**."alt" ? (@.type() == "string")')) AS value),
      (SELECT string_agg(value, ' ')
         FROM jsonb_array_elements_text(
                jsonb_path_query_array(doc, 'strict $.**."longDescription" ? (@.type() == "string")')) AS value),
      (SELECT string_agg(value, ' ')
         FROM jsonb_array_elements_text(
                jsonb_path_query_array(doc, 'strict $.**."caption" ? (@.type() == "string")')) AS value));
$$;

COMMENT ON FUNCTION ict_search_text_of(jsonb) IS
  'Phase 04D: text-bearing fields of one content-block document, bucketed text→alt→longDescription→caption.';

-- The whole projection for one version: its content document plus its option
-- documents (in display order). `options` is a JSON array of option content
-- documents — exactly what question_options holds, aggregated by the caller.
CREATE FUNCTION ict_version_search_text(content jsonb, options jsonb) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT left(
      ict_normalize_search_text(
        ict_search_text_of(jsonb_build_array(content, COALESCE(options, '[]'::jsonb)))),
      20000)
$$;

COMMENT ON FUNCTION ict_version_search_text(jsonb, jsonb) IS
  'Phase 04D: the staff search projection of one question version (content + options, 20,000 code-point cap). Must equal buildVersionSearchText() in server/questions/authoring/search-text.ts.';

-- ── B3. Backfill ────────────────────────────────────────────────────
-- Every existing version is projected now, inside the migration, so search is
-- correct the moment the migration lands. The option aggregate is ordered so
-- the result is deterministic (sort_order, then key as a tiebreaker).
--
-- On the Phase 04D performance dataset (150,212 versions, 422,636 options)
-- this statement took 1.9 s; on a pre-production database (B2 is withheld) it
-- is trivial.
UPDATE question_versions v
   SET search_text = ict_version_search_text(
         v.content,
         COALESCE(
           (SELECT jsonb_agg(o.content ORDER BY o.sort_order, o.key)
              FROM question_options o
             WHERE o.version_id = v.id),
           '[]'::jsonb))
 WHERE v.search_text = '';

-- ── B4. The search index ────────────────────────────────────────────
-- GIN over trigrams: `search_text LIKE '%…%'` becomes an index scan instead of
-- a sequential scan of every version row. Write cost: one GIN entry set per
-- version INSERT/UPDATE, which happens only when a draft is saved or a
-- revision created — not on publish, not on archive, not on a read.
CREATE INDEX "ix_question_versions_search_text_trgm"
  ON "question_versions" USING gin ("search_text" gin_trgm_ops);

COMMENT ON INDEX ix_question_versions_search_text_trgm IS
  'Phase 04D: substring search for staff (Bangla and English) over the maintained search_text projection. Requires pg_trgm.';

-- ── B5. Why this migration adds no CHECK constraint ─────────────────
-- A CHECK (char_length(search_text) <= 20000) would be a third encoding of a
-- limit that both producers already enforce (the SQL function's `left(…,20000)`
-- and the TypeScript cap in search-text.ts). It would also change the Phase
-- 04A inventory that two CI gates assert by name — 21 tables / 8 enums /
-- 33 FKs / 54 CHECKs — for a guarantee the producers give by construction.
-- The compensating control is the drift query below, which is also what
-- detects a projection written by anything other than the two producers.
--
-- ── B6. Operational checks ──────────────────────────────────────────
-- The projection is DERIVED data. If a future write path forgets to maintain
-- it, search silently returns stale results — so this query belongs in any
-- post-deployment check and is documented in docs/database/perf/04d-after.md:
--
--   SELECT count(*) AS drifted
--     FROM question_versions v
--    WHERE v.search_text IS DISTINCT FROM ict_version_search_text(
--            v.content,
--            COALESCE((SELECT jsonb_agg(o.content ORDER BY o.sort_order, o.key)
--                        FROM question_options o WHERE o.version_id = v.id),
--                     '[]'::jsonb));
--
-- It must return 0 immediately after this migration. After a deploy that
-- changes the projection rule it will report the rows the rule change did not
-- reach — which is the point.
--
-- Plans are planned from statistics; run ANALYZE question_versions once after
-- applying this migration on a large existing database:
--
--   ANALYZE question_versions;
