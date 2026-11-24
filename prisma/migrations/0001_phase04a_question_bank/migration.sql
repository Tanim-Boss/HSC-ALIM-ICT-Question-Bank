-- =====================================================================
-- Phase 04A — Question Bank physical schema
-- Migration 0001 (baseline)
--
-- Generated from prisma/schema.prisma by the pinned Prisma 7.10.1 CLI:
--
--   prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma \
--     --script > prisma/migrations/0001_phase04a_question_bank/migration.sql
--
-- ...and then, in the SAME file and below a clearly marked boundary, the
-- reviewed hand-written artifacts Prisma cannot express:
--
--   PART A — Prisma-generated DDL (this section, unmodified).
--   PART B — 47 domain CHECK constraints (§3.9).
--   PART C — 5 partial / expression unique indexes and 1 NL...UNIQUE (§3.10).
--   PART D — the 5 composite foreign keys of Request C and their support
--            keys (§3.11.6).
--
-- Do NOT run `prisma migrate dev` or `prisma db push` against this migration
-- history. They would generate DROP CONSTRAINT statements for every artifact
-- in PART B/C/D that Prisma cannot see. See §11.4.3 of
-- docs/database/phase-04a-question-bank-physical-schema-proposal.md.
-- =====================================================================

-- =====================================================================
-- PART A — Prisma-generated DDL
-- =====================================================================

-- CreateEnum
CREATE TYPE "BoardType" AS ENUM ('GENERAL', 'MADRASAH', 'TECHNICAL');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'CQ');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "QuestionOrigin" AS ENUM ('MANUAL', 'BULK_IMPORT', 'AI_PARSER');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('BOARD', 'COLLEGE', 'MODEL_TEST', 'TEST_EXAM', 'INSTITUTION', 'ORIGINAL');

-- CreateTable
CREATE TABLE "education_levels" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_bn" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "education_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_bn" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_subjects" (
    "level_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "level_subjects_pkey" PRIMARY KEY ("level_id","subject_id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "chapter_number" INTEGER NOT NULL DEFAULT 1,
    "title_bn" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "name_bn" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtopics" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "name_bn" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subtopics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "type" "QuestionType" NOT NULL,
    "status" "QuestionStatus" NOT NULL DEFAULT 'DRAFT',
    "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "created_via" "QuestionOrigin" NOT NULL DEFAULT 'MANUAL',
    "education_level_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "chapter_id" UUID,
    "topic_id" UUID,
    "subtopic_id" UUID,
    "marks" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_versions" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "question_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_keys" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "mcq_correct_option_key" TEXT,
    "cq_rubric" JSONB,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ(3),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "answer_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_assets" (
    "id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "alt_text" TEXT NOT NULL,
    "long_description" TEXT,
    "checksum" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "question_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_version_assets" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "block_ref" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_version_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_tags" (
    "question_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_tags_pkey" PRIMARY KEY ("question_id","tag_id")
);

-- CreateTable
CREATE TABLE "boards" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_bn" TEXT,
    "name_en" TEXT NOT NULL,
    "type" "BoardType" NOT NULL DEFAULT 'GENERAL',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colleges" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "colleges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "year" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_sources" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "board_id" UUID,
    "college_id" UUID,
    "academic_year_id" UUID,
    "source_name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_education_levels_code" ON "education_levels"("code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_subjects_code" ON "subjects"("code");

-- CreateIndex
CREATE INDEX "ix_level_subjects_subject_id" ON "level_subjects"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_chapters_subject_number" ON "chapters"("subject_id", "chapter_number");

-- CreateIndex
CREATE UNIQUE INDEX "uq_chapters_id_subject" ON "chapters"("id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_topics_id_chapter" ON "topics"("id", "chapter_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_subtopics_id_topic" ON "subtopics"("id", "topic_id");

-- CreateIndex
CREATE INDEX "ix_subtopics_topic_id" ON "subtopics"("topic_id");

-- CreateIndex
CREATE INDEX "ix_questions_education_level_id" ON "questions"("education_level_id");

-- CreateIndex
CREATE INDEX "ix_questions_subject_id" ON "questions"("subject_id");

-- CreateIndex
CREATE INDEX "ix_questions_chapter_id" ON "questions"("chapter_id");

-- CreateIndex
CREATE INDEX "ix_questions_topic_id" ON "questions"("topic_id");

-- CreateIndex
CREATE INDEX "ix_questions_subtopic_id" ON "questions"("subtopic_id");

-- CreateIndex
CREATE INDEX "ix_questions_education_level_id_subject_id" ON "questions"("education_level_id", "subject_id");

-- CreateIndex
CREATE INDEX "ix_questions_subject_id_chapter_id_topic_id" ON "questions"("subject_id", "chapter_id", "topic_id");

-- CreateIndex
CREATE INDEX "ix_questions_type_status" ON "questions"("type", "status");

-- CreateIndex
CREATE INDEX "ix_questions_status_type_difficulty" ON "questions"("status", "type", "difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "uq_question_versions_question_number" ON "question_versions"("question_id", "version_number");

-- CreateIndex
CREATE INDEX "ix_question_versions_question_id" ON "question_versions"("question_id");

-- CreateIndex
CREATE INDEX "ix_question_versions_status" ON "question_versions"("status");

-- CreateIndex
CREATE INDEX "ix_question_versions_question_id_status" ON "question_versions"("question_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_question_options_version_key" ON "question_options"("version_id", "key");

-- CreateIndex
CREATE INDEX "ix_question_options_version_id" ON "question_options"("version_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_answer_keys_version" ON "answer_keys"("version_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_question_assets_storage_key" ON "question_assets"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "uq_question_version_assets_version_block_ref" ON "question_version_assets"("version_id", "block_ref");

-- CreateIndex
CREATE INDEX "ix_question_version_assets_asset_id" ON "question_version_assets"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_tags_slug" ON "tags"("slug");

-- CreateIndex
CREATE INDEX "ix_question_tags_tag_id" ON "question_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_boards_code" ON "boards"("code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_academic_years_label" ON "academic_years"("label");

-- CreateIndex
CREATE UNIQUE INDEX "uq_academic_years_year" ON "academic_years"("year");

-- CreateIndex
CREATE INDEX "ix_question_sources_question_id" ON "question_sources"("question_id");

-- CreateIndex
CREATE INDEX "ix_question_sources_source_type" ON "question_sources"("source_type");

-- CreateIndex
CREATE INDEX "ix_question_sources_board_id" ON "question_sources"("board_id");

-- CreateIndex
CREATE INDEX "ix_question_sources_college_id" ON "question_sources"("college_id");

-- CreateIndex
CREATE INDEX "ix_question_sources_academic_year_id" ON "question_sources"("academic_year_id");

-- CreateIndex
CREATE INDEX "ix_question_sources_board_id_academic_year_id" ON "question_sources"("board_id", "academic_year_id");

-- AddForeignKey (single-column relations only — Prisma stops here)
ALTER TABLE "level_subjects" ADD CONSTRAINT "level_subjects_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "education_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_subjects" ADD CONSTRAINT "level_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtopics" ADD CONSTRAINT "subtopics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_education_level_id_fkey" FOREIGN KEY ("education_level_id") REFERENCES "education_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_subtopic_id_fkey" FOREIGN KEY ("subtopic_id") REFERENCES "subtopics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "question_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_keys" ADD CONSTRAINT "answer_keys_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "question_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_version_assets" ADD CONSTRAINT "question_version_assets_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "question_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_version_assets" ADD CONSTRAINT "question_version_assets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "question_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "colleges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- PART B — 47 domain CHECK constraints (§3.9)
--
-- Prisma cannot express CHECK. These are copied verbatim from §3.9, which is
-- the authoritative list; the count is asserted by the G-3 driver so a
-- constraint that silently stops being created is a hard failure, not a
-- quiet pass.
-- =====================================================================

-- ── Taxonomy format guards ────────────────────────────────────────────────
ALTER TABLE education_levels
  ADD CONSTRAINT ck_education_levels_code_format
    CHECK (code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  ADD CONSTRAINT ck_education_levels_name_en_not_blank CHECK (btrim(name_en) <> ''),
  ADD CONSTRAINT ck_education_levels_name_bn_not_blank CHECK (btrim(name_bn) <> '');

ALTER TABLE subjects
  ADD CONSTRAINT ck_subjects_code_format
    CHECK (code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  ADD CONSTRAINT ck_subjects_name_en_not_blank CHECK (btrim(name_en) <> ''),
  ADD CONSTRAINT ck_subjects_name_bn_not_blank CHECK (btrim(name_bn) <> '');

ALTER TABLE chapters
  ADD CONSTRAINT ck_chapters_number_positive CHECK (chapter_number > 0),
  ADD CONSTRAINT ck_chapters_title_en_not_blank CHECK (btrim(title_en) <> ''),
  ADD CONSTRAINT ck_chapters_title_bn_not_blank CHECK (btrim(title_bn) <> '');

ALTER TABLE topics
  ADD CONSTRAINT ck_topics_order_index_nonnegative CHECK (order_index >= 0),
  ADD CONSTRAINT ck_topics_name_en_not_blank CHECK (btrim(name_en) <> ''),
  ADD CONSTRAINT ck_topics_name_bn_not_blank CHECK (btrim(name_bn) <> '');

ALTER TABLE subtopics
  ADD CONSTRAINT ck_subtopics_name_en_not_blank CHECK (btrim(name_en) <> ''),
  ADD CONSTRAINT ck_subtopics_name_bn_not_blank CHECK (btrim(name_bn) <> '');

-- ── Questions: marks, hierarchy chain ─────────────────────────────────────
-- REVISION 13: negative_marks is NOT a column of this table. Negative marking
-- is configurable per examination/marking profile, defaults to OFF, and its
-- penalty rule is configured independently of the on/off switch. It is deferred
-- to the examination model (§3.15.4). Consequently the two constraints that
-- used to live here — ck_questions_negative_marks_nonnegative (E-12) and
-- ck_questions_negative_marks_not_above_marks (E-9) — are REMOVED from Phase 04A.
--
-- They are not rejected. Both were measured as load-bearing and both must be
-- re-expressed wherever the penalty value eventually lives (§3.15.4.4):
--   * E-12 alone does NOT exclude NaN: 'NaN'::numeric >= 0 is TRUE.
--   * E-9 (penalty <= the applicable question marks) IS what excludes it.
-- The Revision 12 numeric(4,2) research is preserved in §3.15.3 as historical
-- research only — it is not an approved implementation decision.
ALTER TABLE questions
  ADD CONSTRAINT ck_questions_marks_nonnegative CHECK (marks >= 0),
  -- an optional parent chain may not have holes: topic requires chapter, subtopic requires topic
  ADD CONSTRAINT ck_questions_topic_requires_chapter
    CHECK (topic_id IS NULL OR chapter_id IS NOT NULL),
  ADD CONSTRAINT ck_questions_subtopic_requires_topic
    CHECK (subtopic_id IS NULL OR topic_id IS NOT NULL),
  -- (E-10 REJECTED) no ck_questions_cq_total_marks: the 1+2+3+4 = 10 structure
  -- belongs to the cq_stem content profile and to publish-time check I-15, not
  -- to the CQ question type globally.
  -- (E-11) an MCQ is worth at least one mark
  ADD CONSTRAINT ck_questions_mcq_marks_positive CHECK (type <> 'MCQ' OR marks >= 1);

-- ── Versions and options ─────────────────────────────────────────────────
ALTER TABLE question_versions
  ADD CONSTRAINT ck_question_versions_number_positive CHECK (version_number > 0),
  ADD CONSTRAINT ck_question_versions_content_object
    CHECK (jsonb_typeof(content) = 'object'),
  -- envelope guard only; block shapes are validated by Zod (§7.11)
  ADD CONSTRAINT ck_question_versions_content_envelope
    CHECK (content ? 'format' AND content ? 'version' AND content ? 'blocks'),
  -- hard ceiling matching the §7.12 content limit
  ADD CONSTRAINT ck_question_versions_content_size
    CHECK (pg_column_size(content) <= 262144);

ALTER TABLE question_options
  ADD CONSTRAINT ck_question_options_key_single_char CHECK (char_length(key) = 1),
  -- only the two approved labelling alphabets
  ADD CONSTRAINT ck_question_options_key_allowed
    CHECK (key IN ('A','B','C','D','ক','খ','গ','ঘ')),
  ADD CONSTRAINT ck_question_options_sort_order_nonnegative CHECK (sort_order >= 0),
  ADD CONSTRAINT ck_question_options_content_object
    CHECK (jsonb_typeof(content) = 'object');

-- ── Answer keys: exactly one payload, verified implies timestamp ──────────
ALTER TABLE answer_keys
  ADD CONSTRAINT ck_answer_keys_exactly_one_payload
    CHECK (num_nonnulls(mcq_correct_option_key, cq_rubric) = 1),
  ADD CONSTRAINT ck_answer_keys_mcq_key_single_char
    CHECK (mcq_correct_option_key IS NULL OR char_length(mcq_correct_option_key) = 1),
  ADD CONSTRAINT ck_answer_keys_verified_has_timestamp
    CHECK (NOT is_verified OR verified_at IS NOT NULL),
  ADD CONSTRAINT ck_answer_keys_rubric_object
    CHECK (cq_rubric IS NULL OR jsonb_typeof(cq_rubric) = 'object');

-- ── Assets ───────────────────────────────────────────────────────────────
ALTER TABLE question_assets
  ADD CONSTRAINT ck_question_assets_size_positive CHECK (size_bytes > 0),
  ADD CONSTRAINT ck_question_assets_mime_format
    CHECK (mime_type ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'),
  ADD CONSTRAINT ck_question_assets_width_positive CHECK (width IS NULL OR width > 0),
  ADD CONSTRAINT ck_question_assets_height_positive CHECK (height IS NULL OR height > 0),
  ADD CONSTRAINT ck_question_assets_alt_not_blank CHECK (btrim(alt_text) <> ''),
  ADD CONSTRAINT ck_question_assets_checksum_format
    CHECK (checksum IS NULL OR checksum ~ '^sha256:[0-9a-f]{64}$');

-- (review) block_ref is NOT NULL; this CHECK proves the pointer is *rooted and
-- well-formed*, never that it resolves. Resolution is I-8 at the publish gate.
--
-- DEVIATION FROM §3.9 — REQUIRED, and reported rather than silently applied.
-- §3.9 writes the pattern as
--     block_ref ~ '^(...)?' || '|/options/[...]...)$'
-- which is INVALID SQL: `~` and `||` have equal precedence and both are
-- left-associative, so that parses as `(block_ref ~ '^(...)?') || '|/options...'`
-- — a text expression — and PostgreSQL rejects it with
--     ERROR: argument of CHECK must be type boolean, not type text
-- (measured on PostgreSQL 16.2). The parentheses below are the minimal fix that
-- preserves the intended pattern byte for byte. The resulting regex is the one
-- §3.9 intends; nothing about the rule was relaxed. See the audit report in
-- docs/database/phase-04a-question-bank-physical-schema-proposal.md §11.9.
ALTER TABLE question_version_assets
  ADD CONSTRAINT ck_question_version_assets_block_ref_pointer
    CHECK (block_ref ~ ('^(/content/blocks/(0|[1-9][0-9]{0,2})(/data/blocks/(0|[1-9][0-9]{0,2}))?'
                    || '|/options/[ABCDকখগঘ]/blocks/(0|[1-9][0-9]{0,2}))$'));

-- ── Tags and provenance dimensions ───────────────────────────────────────
ALTER TABLE tags
  ADD CONSTRAINT ck_tags_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT ck_tags_name_not_blank CHECK (btrim(name) <> '');

ALTER TABLE boards
  ADD CONSTRAINT ck_boards_code_format CHECK (code ~ '^[A-Z][A-Z0-9_]{1,15}$'),
  ADD CONSTRAINT ck_boards_name_en_not_blank CHECK (btrim(name_en) <> '');

ALTER TABLE colleges
  ADD CONSTRAINT ck_colleges_name_not_blank CHECK (btrim(name) <> ''),
  ADD CONSTRAINT ck_colleges_code_format
    CHECK (code IS NULL OR code ~ '^[A-Z0-9][A-Z0-9_-]{1,15}$');

ALTER TABLE academic_years
  ADD CONSTRAINT ck_academic_years_label_not_blank CHECK (btrim(label) <> ''),
  -- four-digit format guard only, not a curriculum claim
  ADD CONSTRAINT ck_academic_years_year_range
    CHECK (year IS NULL OR (year >= 1000 AND year <= 9999));

-- ── Provenance: the approved OD-08 guard ─────────────────────────────────
ALTER TABLE question_sources
  ADD CONSTRAINT ck_question_sources_board_or_college_not_both
    CHECK (board_id IS NULL OR college_id IS NULL),
  ADD CONSTRAINT ck_question_sources_name_not_blank
    CHECK (source_name IS NULL OR btrim(source_name) <> '');

-- =====================================================================
-- PART C — partial and expression unique indexes (§3.10)
--
-- Prisma cannot express a partial index (WHERE ...), an expression index
-- (lower(x)) or NULLS NOT DISTINCT. All are hand-written.
-- =====================================================================

-- Required by the task: at most ONE published version per question.
-- A plain UNIQUE (question_id, status) would forbid two DRAFT versions (which
-- OD-10 allows); a plain UNIQUE (question_id) would forbid versioning at all.
CREATE UNIQUE INDEX "uq_question_versions_one_published_per_question"
  ON "question_versions" ("question_id")
  WHERE "status" = 'PUBLISHED';

-- Provenance de-duplication. NULLS NOT DISTINCT (PostgreSQL 15+) is what makes
-- partial sources (board + year, no college) de-duplicate too.
CREATE UNIQUE INDEX "uq_question_sources_identity"
  ON "question_sources" ("question_id", "source_type", "board_id", "college_id", "academic_year_id")
  NULLS NOT DISTINCT;

-- E-7 as corrected in Revision 5: topic display order is ACTIVE-ONLY unique.
-- A retired topic's position is reusable; two ACTIVE topics may not share one.
CREATE UNIQUE INDEX "uq_topics_chapter_order"
  ON "topics" ("chapter_id", "order_index")
  WHERE "is_active";

-- Human-facing uniqueness must ignore case.
CREATE UNIQUE INDEX "uq_tags_name_lower" ON "tags" (lower("name"));
CREATE UNIQUE INDEX "uq_colleges_name_lower" ON "colleges" (lower("name"));

-- Asset de-duplication path (§3.3.11). Partial because an unknown checksum is
-- not a duplicate.
CREATE INDEX "ix_question_assets_checksum"
  ON "question_assets" ("checksum")
  WHERE "checksum" IS NOT NULL;

-- =====================================================================
-- PART D — the five composite foreign keys of Request C (§3.11.6)
--
-- THE MOST IMPORTANT PART OF THIS FILE. Prisma cannot model a foreign key over
-- a composite key that is not the referenced model's own @@id, cannot express
-- two relations sharing a column, and does not understand MATCH SIMPLE skip
-- semantics. These five constraints therefore exist ONLY here.
--
-- Consequences, both of which the project accepted in §11.4.3:
--   * Prisma will never manage, verify or warn about them;
--   * `prisma migrate dev` generates a migration that DROPS all five, which is
--     why it is prohibited. G-1 measured this twice and it is recorded as
--     FAILED, not rationalised away.
--
-- The support unique keys these FKs reference (uq_chapters_id_subject,
-- uq_topics_id_chapter, uq_subtopics_id_topic) are declared in schema.prisma
-- because Prisma CAN express a plain composite UNIQUE and creates them itself
-- in PART A. C-1 and C-5 need no support key: their referenced keys are
-- level_subjects' own primary key and question_options' UNIQUE (version_id, key).
-- =====================================================================

-- C-1 — the question's (level, subject) pair must be an offered membership.
-- Both referencing columns are NOT NULL, so MATCH SIMPLE can never skip it.
ALTER TABLE "questions"
  ADD CONSTRAINT "fk_questions_level_subject"
  FOREIGN KEY ("education_level_id", "subject_id")
  REFERENCES "level_subjects" ("level_id", "subject_id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- C-2 — the question's chapter must belong to the question's subject.
ALTER TABLE "questions"
  ADD CONSTRAINT "fk_questions_chapter_subject"
  FOREIGN KEY ("chapter_id", "subject_id")
  REFERENCES "chapters" ("id", "subject_id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- C-3 — the question's topic must belong to the question's chapter.
ALTER TABLE "questions"
  ADD CONSTRAINT "fk_questions_topic_chapter"
  FOREIGN KEY ("topic_id", "chapter_id")
  REFERENCES "topics" ("id", "chapter_id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- C-4 — the question's subtopic must belong to the question's topic.
ALTER TABLE "questions"
  ADD CONSTRAINT "fk_questions_subtopic_topic"
  FOREIGN KEY ("subtopic_id", "topic_id")
  REFERENCES "subtopics" ("id", "topic_id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- C-5 — the authoritative MCQ key must name an option of the SAME version.
-- Since Request D removed question_options.is_correct, this is the ONLY
-- declarative guarantee that the key points at an option that exists.
-- mcq_correct_option_key is nullable, so MATCH SIMPLE skips a CQ rubric row —
-- which is correct: presence is I-13 at the publish gate.
ALTER TABLE "answer_keys"
  ADD CONSTRAINT "fk_answer_keys_options_of_version"
  FOREIGN KEY ("version_id", "mcq_correct_option_key")
  REFERENCES "question_options" ("version_id", "key")
  ON UPDATE CASCADE ON DELETE RESTRICT;
