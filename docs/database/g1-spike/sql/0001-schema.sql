-- =====================================================================
-- G-1 spike — step 1: schema for the Prisma-drift experiment
--
-- Purpose: reproduce the five approved composite foreign keys (Request C)
-- and their support keys on a DISPOSABLE database, so that the effect of
-- Prisma introspection / migration-diff on them can be observed.
--
-- Scope: this is a REDUCED but faithful reproduction. It contains every
-- column each of C-1..C-5 touches, the two support keys those FKs need,
-- the active-only partial unique of Revision 5 (E-7), and enough identity
-- columns for Prisma introspection to produce models. It is NOT migration
-- 0001 and must never be treated as one.
--
-- The spike uses a DEDICATED DATABASE, not a dedicated schema: the default
-- `public` schema is the only one Prisma sees without the `multiSchema`
-- preview feature, so isolating into a separate schema would make every
-- introspection and diff result ambiguous. run.sh creates and drops the
-- database; this file only owns the objects inside it.
--
-- Disposable only. Never run against a shared, staging or production db.
-- =====================================================================

-- Start from a clean slate *inside* the disposable database.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- ---------------------------------------------------------------------
-- Taxonomy
-- ---------------------------------------------------------------------
CREATE TABLE education_levels (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE
);

CREATE TABLE subjects (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE
);

-- C-1's referenced key: this table's composite PRIMARY KEY.
CREATE TABLE level_subjects (
  level_id   uuid NOT NULL REFERENCES education_levels(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id)        ON DELETE CASCADE,
  PRIMARY KEY (level_id, subject_id)
);

CREATE TABLE chapters (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id     uuid    NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  chapter_number integer NOT NULL,
  title_en       text    NOT NULL DEFAULT '',
  is_active      boolean NOT NULL DEFAULT true,
  -- E-7 (Revision 5): plain global unique, Prisma-native, no reuse of a number
  CONSTRAINT uq_chapters_subject_number UNIQUE (subject_id, chapter_number)
);

CREATE TABLE topics (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id  uuid    NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
  name_en     text    NOT NULL DEFAULT '',
  order_index integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true
);
-- E-7 as corrected in Revision 5: display order is ACTIVE-ONLY uniqueness.
-- Hand-written because Prisma cannot express a partial index.
CREATE UNIQUE INDEX uq_topics_chapter_order
  ON topics (chapter_id, order_index)
  WHERE is_active;

CREATE TABLE subtopics (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  name_en  text NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------
-- Question identity + classification
-- ---------------------------------------------------------------------
CREATE TABLE questions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  education_level_id uuid NOT NULL REFERENCES education_levels(id) ON DELETE RESTRICT,
  subject_id         uuid NOT NULL REFERENCES subjects(id)         ON DELETE RESTRICT,
  chapter_id         uuid          REFERENCES chapters(id)         ON DELETE RESTRICT,
  topic_id           uuid          REFERENCES topics(id)           ON DELETE RESTRICT,
  subtopic_id        uuid          REFERENCES subtopics(id)        ON DELETE RESTRICT,
  -- the chain CHECKs that let C-2/C-3/C-4 be meaningful
  CONSTRAINT ck_questions_topic_requires_chapter
    CHECK (topic_id IS NULL OR chapter_id IS NOT NULL),
  CONSTRAINT ck_questions_subtopic_requires_topic
    CHECK (subtopic_id IS NULL OR topic_id IS NOT NULL)
);

CREATE TABLE question_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE question_options (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid    NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  key        text    NOT NULL,
  -- C-5's referenced key
  CONSTRAINT uq_question_options_version_key UNIQUE (version_id, key)
);

CREATE TABLE answer_keys (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id             uuid NOT NULL,
  mcq_correct_option_key text,
  CONSTRAINT uq_answer_keys_version UNIQUE (version_id),
  CONSTRAINT fk_answer_keys_version
    FOREIGN KEY (version_id) REFERENCES question_versions(id) ON DELETE CASCADE
);

-- =====================================================================
-- Request C — three support unique keys
-- =====================================================================
ALTER TABLE chapters  ADD CONSTRAINT uq_chapters_id_subject  UNIQUE (id, subject_id);
ALTER TABLE topics    ADD CONSTRAINT uq_topics_id_chapter    UNIQUE (id, chapter_id);
ALTER TABLE subtopics ADD CONSTRAINT uq_subtopics_id_topic   UNIQUE (id, topic_id);

-- =====================================================================
-- Request C — the five composite foreign keys, verbatim from §3.11.6
-- =====================================================================
-- C-1 education level + subject membership
ALTER TABLE questions
  ADD CONSTRAINT fk_questions_level_subject
  FOREIGN KEY (education_level_id, subject_id)
  REFERENCES level_subjects (level_id, subject_id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- C-2 chapter belongs to the question's subject
ALTER TABLE questions
  ADD CONSTRAINT fk_questions_chapter_subject
  FOREIGN KEY (chapter_id, subject_id)
  REFERENCES chapters (id, subject_id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- C-3 topic belongs to the question's chapter
ALTER TABLE questions
  ADD CONSTRAINT fk_questions_topic_chapter
  FOREIGN KEY (topic_id, chapter_id)
  REFERENCES topics (id, chapter_id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- C-4 subtopic belongs to the question's topic
ALTER TABLE questions
  ADD CONSTRAINT fk_questions_subtopic_topic
  FOREIGN KEY (subtopic_id, topic_id)
  REFERENCES subtopics (id, topic_id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- C-5 the authoritative MCQ key names an option of the same version
ALTER TABLE answer_keys
  ADD CONSTRAINT fk_answer_keys_options_of_version
  FOREIGN KEY (version_id, mcq_correct_option_key)
  REFERENCES question_options (version_id, key)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- =====================================================================
-- Observable proof of the created state
-- =====================================================================
\echo ''
\echo '### composite FKs present (expect 5)'
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = current_schema::regnamespace
  AND conname IN (
    'fk_questions_level_subject',
    'fk_questions_chapter_subject',
    'fk_questions_topic_chapter',
    'fk_questions_subtopic_topic',
    'fk_answer_keys_options_of_version')
ORDER BY conname;

\echo ''
\echo '### composite FK count (expect 5)'
SELECT count(*) AS composite_fk_count
FROM pg_constraint
WHERE connamespace = current_schema::regnamespace
  AND conname IN (
    'fk_questions_level_subject',
    'fk_questions_chapter_subject',
    'fk_questions_topic_chapter',
    'fk_questions_subtopic_topic',
    'fk_answer_keys_options_of_version');
