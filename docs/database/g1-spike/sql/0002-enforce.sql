-- =====================================================================
-- G-1 spike — step 2: does PostgreSQL actually ENFORCE C-1..C-5?
--
-- Every negative case runs inside a savepoint and is EXPECTED to raise
-- SQLSTATE 23503 (foreign_key_violation) with a specific constraint name.
-- Expected failures are converted into one-line 'PASS' / 'FAIL' output via
-- a DO block, so the run is self-checking: any 'FAIL' line is a defect in
-- the approved design, not a passing result.
--
-- Disposable database only.
-- =====================================================================

SET search_path TO g1;

-- ---------------------------------------------------------------------
-- Seed: a fully consistent ICT question, correct by all five constraints
-- ---------------------------------------------------------------------
DELETE FROM answer_keys;
DELETE FROM question_options;
DELETE FROM question_versions;
DELETE FROM questions;
DELETE FROM subtopics;
DELETE FROM topics;
DELETE FROM chapters;
DELETE FROM level_subjects;
DELETE FROM subjects;
DELETE FROM education_levels;

INSERT INTO education_levels (id, code) VALUES
  ('11111111-1111-1111-1111-111111111111', 'HSC'),
  ('22222222-2222-2222-2222-222222222222', 'ALIM');

INSERT INTO subjects (id, code) VALUES
  ('33333333-3333-3333-3333-333333333333', 'ICT'),
  ('99999999-9999-9999-9999-999999999999', 'PHY');

-- ICT is offered at HSC only; PHY at HSC only as well, but in its own chapter
INSERT INTO level_subjects (level_id, subject_id) VALUES
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333'),
  ('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999');

INSERT INTO chapters (id, subject_id, chapter_number, title_en) VALUES
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 1, 'ICT ch1'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '99999999-9999-9999-9999-999999999999', 1, 'PHY ch1');

INSERT INTO topics (id, chapter_id, order_index, name_en) VALUES
  ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', 1, 'ICT t1'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'PHY t1');

INSERT INTO subtopics (id, topic_id, name_en) VALUES
  ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'ICT st1'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'PHY st1');

-- the one legitimate question: every pair is internally consistent
INSERT INTO questions (id, education_level_id, subject_id, chapter_id, topic_id, subtopic_id) VALUES
  ('77777777-7777-7777-7777-777777777777',
   '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333',
   '44444444-4444-4444-4444-444444444444',
   '55555555-5555-5555-5555-555555555555',
   '66666666-6666-6666-6666-666666666666');

INSERT INTO question_versions (id, question_id) VALUES
  ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777');

INSERT INTO question_options (version_id, key) VALUES
  ('88888888-8888-8888-8888-888888888888', 'A'),
  ('88888888-8888-8888-8888-888888888888', 'B'),
  ('88888888-8888-8888-8888-888888888888', 'C'),
  ('88888888-8888-8888-8888-888888888888', 'D');

INSERT INTO answer_keys (version_id, mcq_correct_option_key) VALUES
  ('88888888-8888-8888-8888-888888888888', 'B');

\echo ''
\echo '### 0. seed accepted by all five composite FKs (expect PASS)'
SELECT CASE WHEN count(*) = 1 THEN 'PASS  seed row accepted'
            ELSE 'FAIL  seed row missing' END AS result
FROM questions WHERE id = '77777777-7777-7777-7777-777777777777';

-- ---------------------------------------------------------------------
-- C-1: (education_level_id, subject_id) must exist in level_subjects
-- ALIM + ICT is not a membership row, so the pair must be rejected.
-- ---------------------------------------------------------------------
\echo ''
\echo '### C-1  level + subject pair not in level_subjects (expect 23503 fk_questions_level_subject)'
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (education_level_id, subject_id)
    VALUES ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
    RAISE EXCEPTION 'FAIL  C-1 accepted an invalid level/subject pair';
  EXCEPTION WHEN foreign_key_violation THEN
    IF SQLERRM LIKE '%fk_questions_level_subject%' THEN
      RAISE NOTICE 'PASS  C-1 rejected by fk_questions_level_subject (23503)';
    ELSE
      RAISE EXCEPTION 'FAIL  C-1 rejected by the wrong constraint: %', SQLERRM;
    END IF;
  END;
END $$;

-- ---------------------------------------------------------------------
-- C-2: chapter must belong to the question's subject
-- subject ICT + chapter of PHY
-- ---------------------------------------------------------------------
\echo ''
\echo '### C-2  chapter belongs to another subject (expect 23503 fk_questions_chapter_subject)'
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (education_level_id, subject_id, chapter_id)
    VALUES ('11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL  C-2 accepted a chapter of a different subject';
  EXCEPTION WHEN foreign_key_violation THEN
    IF SQLERRM LIKE '%fk_questions_chapter_subject%' THEN
      RAISE NOTICE 'PASS  C-2 rejected by fk_questions_chapter_subject (23503)';
    ELSE
      RAISE EXCEPTION 'FAIL  C-2 rejected by the wrong constraint: %', SQLERRM;
    END IF;
  END;
END $$;

-- ---------------------------------------------------------------------
-- C-3: topic must belong to the question's chapter
-- chapter ICT ch1 + topic of PHY ch1
-- ---------------------------------------------------------------------
\echo ''
\echo '### C-3  topic belongs to another chapter (expect 23503 fk_questions_topic_chapter)'
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (education_level_id, subject_id, chapter_id, topic_id)
    VALUES ('11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333',
            '44444444-4444-4444-4444-444444444444',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    RAISE EXCEPTION 'FAIL  C-3 accepted a topic of a different chapter';
  EXCEPTION WHEN foreign_key_violation THEN
    IF SQLERRM LIKE '%fk_questions_topic_chapter%' THEN
      RAISE NOTICE 'PASS  C-3 rejected by fk_questions_topic_chapter (23503)';
    ELSE
      RAISE EXCEPTION 'FAIL  C-3 rejected by the wrong constraint: %', SQLERRM;
    END IF;
  END;
END $$;

-- ---------------------------------------------------------------------
-- C-4: subtopic must belong to the question's topic
-- topic ICT t1 + subtopic of PHY t1
-- ---------------------------------------------------------------------
\echo ''
\echo '### C-4  subtopic belongs to another topic (expect 23503 fk_questions_subtopic_topic)'
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (education_level_id, subject_id, chapter_id, topic_id, subtopic_id)
    VALUES ('11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333',
            '44444444-4444-4444-4444-444444444444',
            '55555555-5555-5555-5555-555555555555',
            'cccccccc-cccc-cccc-cccc-cccccccccccc');
    RAISE EXCEPTION 'FAIL  C-4 accepted a subtopic of a different topic';
  EXCEPTION WHEN foreign_key_violation THEN
    IF SQLERRM LIKE '%fk_questions_subtopic_topic%' THEN
      RAISE NOTICE 'PASS  C-4 rejected by fk_questions_subtopic_topic (23503)';
    ELSE
      RAISE EXCEPTION 'FAIL  C-4 rejected by the wrong constraint: %', SQLERRM;
    END IF;
  END;
END $$;

-- ---------------------------------------------------------------------
-- C-5: the MCQ key must name an option of the SAME version
-- The unique (version_id) is cleared first so that only C-5 can reject.
-- ---------------------------------------------------------------------
\echo ''
\echo '### C-5  answer key names an option that is not in the version (expect 23503 fk_answer_keys_options_of_version)'
DO $$
BEGIN
  DELETE FROM answer_keys WHERE version_id = '88888888-8888-8888-8888-888888888888';
  BEGIN
    INSERT INTO answer_keys (version_id, mcq_correct_option_key)
    VALUES ('88888888-8888-8888-8888-888888888888', 'E');
    RAISE EXCEPTION 'FAIL  C-5 accepted a key that is not an option of the version';
  EXCEPTION WHEN foreign_key_violation THEN
    IF SQLERRM LIKE '%fk_answer_keys_options_of_version%' THEN
      RAISE NOTICE 'PASS  C-5 rejected by fk_answer_keys_options_of_version (23503)';
    ELSE
      RAISE EXCEPTION 'FAIL  C-5 rejected by the wrong constraint: %', SQLERRM;
    END IF;
  END;
END $$;

-- ---------------------------------------------------------------------
-- C-5b: MATCH SIMPLE must still SKIP a NULL key (CQ rubric row)
-- ---------------------------------------------------------------------
\echo ''
\echo '### C-5b NULL mcq key on a CQ rubric row must be ALLOWED (expect PASS)'
DO $$
DECLARE vid uuid := gen_random_uuid();
BEGIN
  INSERT INTO question_versions (id, question_id)
  VALUES (vid, '77777777-7777-7777-7777-777777777777');
  BEGIN
    INSERT INTO answer_keys (version_id, mcq_correct_option_key) VALUES (vid, NULL);
    RAISE NOTICE 'PASS  C-5 MATCH SIMPLE skips the NULL key (cq_rubric row accepted)';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'FAIL  C-5 wrongly rejected a NULL key: %', SQLERRM;
  END;
END $$;

-- ---------------------------------------------------------------------
-- Positive control: C-2/C-3/C-4 must ACCEPT a fully consistent row
-- ---------------------------------------------------------------------
\echo ''
\echo '### P-1  a fully consistent question must be ACCEPTED (expect PASS)'
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (education_level_id, subject_id, chapter_id, topic_id, subtopic_id)
    VALUES ('11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333',
            '44444444-4444-4444-4444-444444444444',
            '55555555-5555-5555-5555-555555555555',
            '66666666-6666-6666-6666-666666666666');
    RAISE NOTICE 'PASS  P-1 consistent hierarchy accepted';
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rollback-ok';
  EXCEPTION WHEN raise_exception THEN
    NULL; -- undo the accepted row, keeps the suite idempotent
  END;
END $$;

-- ---------------------------------------------------------------------
-- E-7 (Revision 5): active-only partial unique on topics
-- ---------------------------------------------------------------------
\echo ''
\echo '### E-7a a retired topic frees its display position (expect PASS)'
DO $$
BEGIN
  BEGIN
    INSERT INTO topics (id, chapter_id, order_index, is_active)
    VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            '44444444-4444-4444-4444-444444444444', 2, false);
    INSERT INTO topics (id, chapter_id, order_index, is_active)
    VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff',
            '44444444-4444-4444-4444-444444444444', 2, true);
    RAISE NOTICE 'PASS  E-7 retired + live topic share display position 2';
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rollback-ok';
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;
END $$;

\echo ''
\echo '### E-7b two ACTIVE topics may not share a position (expect 23505 uq_topics_chapter_order)'
DO $$
BEGIN
  BEGIN
    INSERT INTO topics (id, chapter_id, order_index, is_active)
    VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            '44444444-4444-4444-4444-444444444444', 3, true);
    INSERT INTO topics (id, chapter_id, order_index, is_active)
    VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff',
            '44444444-4444-4444-4444-444444444444', 3, true);
    RAISE EXCEPTION 'FAIL  E-7 allowed two active topics to share a position';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM LIKE '%uq_topics_chapter_order%' THEN
      RAISE NOTICE 'PASS  E-7 rejected by uq_topics_chapter_order (23505)';
    ELSE
      RAISE EXCEPTION 'FAIL  E-7 rejected by the wrong constraint: %', SQLERRM;
    END IF;
  END;
END $$;

-- restore the seed key removed by the C-5 case
DELETE FROM answer_keys WHERE version_id = '88888888-8888-8888-8888-888888888888';
INSERT INTO answer_keys (version_id, mcq_correct_option_key)
VALUES ('88888888-8888-8888-8888-888888888888', 'B');

\echo ''
\echo '### final: composite FKs still present after the whole suite (expect 5)'
SELECT count(*) AS composite_fk_count
FROM pg_constraint
WHERE connamespace = 'g1'::regnamespace
  AND conname IN (
    'fk_questions_level_subject',
    'fk_questions_chapter_subject',
    'fk_questions_topic_chapter',
    'fk_questions_subtopic_topic',
    'fk_answer_keys_options_of_version');
