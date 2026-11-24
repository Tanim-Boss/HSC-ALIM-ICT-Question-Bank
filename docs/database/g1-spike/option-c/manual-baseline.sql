-- =====================================================================
-- G-1 experiment 2 — MANUALLY APPENDED SQL
--
-- This file is appended, byte for byte and without modification, to the
-- migration SQL that the pinned Prisma 7.10.1 CLI generates. It is the
-- entire content of the "hand-written part" of the experiment, so that
-- exactly what was added to Prisma's own migration is auditable.
--
-- It is NOT a production migration. It never runs against production.
--
-- The five composite foreign keys below are copied verbatim from the
-- approved proposal (§3.11.6) and from
-- ../sql/0001-schema.sql, which is the reference copy. run.sh asserts
-- that every FK block here is byte-identical to the reference copy, so
-- this file cannot silently drift away from the approved design.
--
-- What is in here, and why each item could not be expressed in the
-- Prisma datamodel:
--
--   1. the two chain CHECKs            — Prisma 7 has no CHECK support
--   2. the active-only partial index   — Prisma has no partial-index support
--   3. the five composite FKs C-1..C-5 — Prisma has no composite-FK support
--
-- Note what is NOT here: the three support unique keys
-- (uq_chapters_id_subject, uq_topics_id_chapter, uq_subtopics_id_topic).
-- They ARE expressible in Prisma and are declared in schema.prisma with
-- their approved names, so Prisma creates them itself. That is the whole
-- point of experiment 2's design — it removes them as an excuse.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The chain CHECKs that make C-2/C-3/C-4 meaningful. Without these a
--    topic could be attached to a question with no chapter at all, and the
--    composite FK would be skipped by MATCH SIMPLE.
-- ---------------------------------------------------------------------
ALTER TABLE "questions"
  ADD CONSTRAINT "ck_questions_topic_requires_chapter"
  CHECK ("topic_id" IS NULL OR "chapter_id" IS NOT NULL);

ALTER TABLE "questions"
  ADD CONSTRAINT "ck_questions_subtopic_requires_topic"
  CHECK ("subtopic_id" IS NULL OR "topic_id" IS NOT NULL);

-- ---------------------------------------------------------------------
-- 2. E-7 as corrected in Revision 5: display order is ACTIVE-ONLY unique.
--    A partial unique index; Prisma cannot model it.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX "uq_topics_chapter_order"
  ON "topics" ("chapter_id", "order_index")
  WHERE "is_active";

-- =====================================================================
-- 3. Request C — the five composite foreign keys, verbatim from §3.11.6
--
--    None of these definitions may be weakened, relaxed or altered. If
--    they must be changed, that is a design change requiring re-approval,
--    not a change to a test.
-- =====================================================================

-- C-1 education level + subject membership
ALTER TABLE "questions"
  ADD CONSTRAINT "fk_questions_level_subject"
  FOREIGN KEY ("education_level_id", "subject_id")
  REFERENCES "level_subjects" ("level_id", "subject_id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- C-2 chapter belongs to the question's subject
ALTER TABLE "questions"
  ADD CONSTRAINT "fk_questions_chapter_subject"
  FOREIGN KEY ("chapter_id", "subject_id")
  REFERENCES "chapters" ("id", "subject_id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- C-3 topic belongs to the question's chapter
ALTER TABLE "questions"
  ADD CONSTRAINT "fk_questions_topic_chapter"
  FOREIGN KEY ("topic_id", "chapter_id")
  REFERENCES "topics" ("id", "chapter_id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- C-4 subtopic belongs to the question's topic
ALTER TABLE "questions"
  ADD CONSTRAINT "fk_questions_subtopic_topic"
  FOREIGN KEY ("subtopic_id", "topic_id")
  REFERENCES "subtopics" ("id", "topic_id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- C-5 the authoritative MCQ key names an option of the same version
ALTER TABLE "answer_keys"
  ADD CONSTRAINT "fk_answer_keys_options_of_version"
  FOREIGN KEY ("version_id", "mcq_correct_option_key")
  REFERENCES "question_options" ("version_id", "key")
  ON UPDATE CASCADE ON DELETE RESTRICT;
