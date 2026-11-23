-- =====================================================================
-- G-1 spike — step 2: does PostgreSQL actually ENFORCE C-1..C-5?
--
-- This file is MACHINE-CHECKED by run.sh:
--
--   * the results table has exactly one row per expected case
--   * every row must have result = 'PASS'
--   * the row count must equal the expected count (14)
--
-- The expected count and every case id is repeated in run.sh, so a case
-- that silently stops running is a hard failure there, not a quiet pass.
--
-- Each negative case runs in a nested block and is EXPECTED to raise
-- SQLSTATE 23503 (foreign_key_violation) naming that exact constraint.
-- A negative case that succeeds raises G1-FAIL and is caught, so the suite
-- always completes and always reports — it never aborts halfway and never
-- reports success for a case it did not reach.
--
-- Disposable database only.
-- =====================================================================

-- A TEMP table, not a regular one: it lives in the session's pg_temp schema,
-- which Prisma never introspects, so it cannot pollute the later drift steps.
-- No ON COMMIT DROP: psql runs each statement in its own transaction here, so
-- that would delete the table immediately after creating it.
CREATE TEMP TABLE g1_results (
  seq    integer PRIMARY KEY,
  name   text    NOT NULL,
  result text    NOT NULL
);

-- ---------------------------------------------------------------------
-- Seed: a fully consistent ICT question, correct by all five constraints
-- ---------------------------------------------------------------------
TRUNCATE answer_keys, question_options, question_versions, questions,
         subtopics, topics, chapters, level_subjects, subjects,
         education_levels CASCADE;

INSERT INTO education_levels (id, code) VALUES
  ('11111111-1111-1111-1111-111111111111', 'HSC'),
  ('22222222-2222-2222-2222-222222222222', 'ALIM');

INSERT INTO subjects (id, code) VALUES
  ('33333333-3333-3333-3333-333333333333', 'ICT'),
  ('99999999-9999-9999-9999-999999999999', 'PHY');

-- ICT and PHY are both offered at HSC; ICT is NOT offered at ALIM, which is
-- what case C-1 exploits.
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

-- the legitimate question: every pair is internally consistent
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

-- =====================================================================
-- 14 cases
-- =====================================================================

-- 1. the seed itself must be accepted by all five constraints
INSERT INTO g1_results VALUES (1, 'S0-seed-accepted',
  CASE WHEN (SELECT count(*) FROM questions
             WHERE id = '77777777-7777-7777-7777-777777777777') = 1
       THEN 'PASS' ELSE 'FAIL: seed row missing' END);

-- 2. C-1: (education_level_id, subject_id) must exist in level_subjects
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (education_level_id, subject_id)
    VALUES ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
    INSERT INTO g1_results VALUES (2, 'C1-level-subject', 'FAIL: invalid pair accepted');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO g1_results VALUES (2, 'C1-level-subject',
      CASE WHEN SQLERRM LIKE '%fk_questions_level_subject%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- 3. C-2: chapter must belong to the question's subject
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (education_level_id, subject_id, chapter_id)
    VALUES ('11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    INSERT INTO g1_results VALUES (3, 'C2-chapter-subject', 'FAIL: cross-subject chapter accepted');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO g1_results VALUES (3, 'C2-chapter-subject',
      CASE WHEN SQLERRM LIKE '%fk_questions_chapter_subject%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- 4. C-3: topic must belong to the question's chapter
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (education_level_id, subject_id, chapter_id, topic_id)
    VALUES ('11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333',
            '44444444-4444-4444-4444-444444444444',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    INSERT INTO g1_results VALUES (4, 'C3-topic-chapter', 'FAIL: cross-chapter topic accepted');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO g1_results VALUES (4, 'C3-topic-chapter',
      CASE WHEN SQLERRM LIKE '%fk_questions_topic_chapter%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- 5. C-4: subtopic must belong to the question's topic
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (education_level_id, subject_id, chapter_id, topic_id, subtopic_id)
    VALUES ('11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333',
            '44444444-4444-4444-4444-444444444444',
            '55555555-5555-5555-5555-555555555555',
            'cccccccc-cccc-cccc-cccc-cccccccccccc');
    INSERT INTO g1_results VALUES (5, 'C4-subtopic-topic', 'FAIL: cross-topic subtopic accepted');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO g1_results VALUES (5, 'C4-subtopic-topic',
      CASE WHEN SQLERRM LIKE '%fk_questions_subtopic_topic%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- 6. C-5: the MCQ key must name an option of the SAME version.
--    The unique (version_id) row is removed first so that ONLY C-5 can
--    reject this insert — otherwise the case would pass for the wrong reason.
DO $$
BEGIN
  DELETE FROM answer_keys WHERE version_id = '88888888-8888-8888-8888-888888888888';
  BEGIN
    INSERT INTO answer_keys (version_id, mcq_correct_option_key)
    VALUES ('88888888-8888-8888-8888-888888888888', 'E');
    INSERT INTO g1_results VALUES (6, 'C5-key-of-version', 'FAIL: non-existent option accepted');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO g1_results VALUES (6, 'C5-key-of-version',
      CASE WHEN SQLERRM LIKE '%fk_answer_keys_options_of_version%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- 7. C-5b: MATCH SIMPLE must SKIP a NULL key (a CQ rubric row)
DO $$
DECLARE vid uuid := gen_random_uuid();
BEGIN
  INSERT INTO question_versions (id, question_id)
  VALUES (vid, '77777777-7777-7777-7777-777777777777');
  BEGIN
    INSERT INTO answer_keys (version_id, mcq_correct_option_key) VALUES (vid, NULL);
    INSERT INTO g1_results VALUES (7, 'C5b-null-key-skipped', 'PASS');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO g1_results VALUES (7, 'C5b-null-key-skipped',
      'FAIL: NULL key wrongly rejected: ' || SQLERRM);
  END;
END $$;

-- 8. positive control: a fully consistent question must be ACCEPTED
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (education_level_id, subject_id, chapter_id, topic_id, subtopic_id)
    VALUES ('11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333',
            '44444444-4444-4444-4444-444444444444',
            '55555555-5555-5555-5555-555555555555',
            '66666666-6666-6666-6666-666666666666');
    INSERT INTO g1_results VALUES (8, 'P1-consistent-accepted', 'PASS');
    -- undo it so the suite stays re-runnable, without masking a real error
    DELETE FROM questions
    WHERE education_level_id = '11111111-1111-1111-1111-111111111111'
      AND chapter_id = '44444444-4444-4444-4444-444444444444'
      AND id <> '77777777-7777-7777-7777-777777777777';
  EXCEPTION WHEN others THEN
    INSERT INTO g1_results VALUES (8, 'P1-consistent-accepted',
      'FAIL: valid row rejected: ' || SQLERRM);
  END;
END $$;

-- 9. optional link: a NULL chapter_id must be legal (MATCH SIMPLE skip)
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (id, education_level_id, subject_id)
    VALUES (gen_random_uuid(),
            '11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333');
    INSERT INTO g1_results VALUES (9, 'P2-optional-links-null', 'PASS');
    DELETE FROM questions
    WHERE chapter_id IS NULL AND topic_id IS NULL AND subtopic_id IS NULL
      AND id <> '77777777-7777-7777-7777-777777777777';
  EXCEPTION WHEN others THEN
    INSERT INTO g1_results VALUES (9, 'P2-optional-links-null',
      'FAIL: NULL taxonomy links rejected: ' || SQLERRM);
  END;
END $$;

-- 10. E-7: a retired topic frees its display position
DO $$
BEGIN
  BEGIN
    INSERT INTO topics (id, chapter_id, order_index, is_active)
    VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            '44444444-4444-4444-4444-444444444444', 2, false);
    INSERT INTO topics (id, chapter_id, order_index, is_active)
    VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff',
            '44444444-4444-4444-4444-444444444444', 2, true);
    INSERT INTO g1_results VALUES (10, 'E7a-retired-position-reusable', 'PASS');
    DELETE FROM topics WHERE id IN ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
                                    'ffffffff-ffff-ffff-ffff-ffffffffffff');
  EXCEPTION WHEN others THEN
    INSERT INTO g1_results VALUES (10, 'E7a-retired-position-reusable',
      'FAIL: retired position not reusable: ' || SQLERRM);
  END;
END $$;

-- 11. E-7: two ACTIVE topics may not share a position
DO $$
BEGIN
  BEGIN
    INSERT INTO topics (id, chapter_id, order_index, is_active)
    VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            '44444444-4444-4444-4444-444444444444', 3, true);
    INSERT INTO topics (id, chapter_id, order_index, is_active)
    VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff',
            '44444444-4444-4444-4444-444444444444', 3, true);
    INSERT INTO g1_results VALUES (11, 'E7b-active-position-unique',
      'FAIL: two active topics shared a position');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO g1_results VALUES (11, 'E7b-active-position-unique',
      CASE WHEN SQLERRM LIKE '%uq_topics_chapter_order%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- 12. E-7: the retired row really is excluded from the partial index
--     (a second retired topic at the same position must be allowed)
DO $$
BEGIN
  BEGIN
    INSERT INTO topics (id, chapter_id, order_index, is_active)
    VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            '44444444-4444-4444-4444-444444444444', 4, false);
    INSERT INTO topics (id, chapter_id, order_index, is_active)
    VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff',
            '44444444-4444-4444-4444-444444444444', 4, false);
    INSERT INTO g1_results VALUES (12, 'E7c-retired-not-indexed', 'PASS');
    DELETE FROM topics WHERE id IN ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
                                    'ffffffff-ffff-ffff-ffff-ffffffffffff');
  EXCEPTION WHEN others THEN
    INSERT INTO g1_results VALUES (12, 'E7c-retired-not-indexed',
      'FAIL: two retired topics could not share a position: ' || SQLERRM);
  END;
END $$;

-- 13. the composite FK must be a real FK, not merely a CHECK-like guard:
--     deleting the referenced chapter while a question uses it must fail
--     with RESTRICT.
DO $$
BEGIN
  BEGIN
    DELETE FROM chapters WHERE id = '44444444-4444-4444-4444-444444444444';
    INSERT INTO g1_results VALUES (13, 'R1-restrict-blocks-delete',
      'FAIL: deleting a referenced chapter succeeded');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO g1_results VALUES (13, 'R1-restrict-blocks-delete', 'PASS');
  END;
END $$;

-- 14. all five constraints must still exist after the whole suite
INSERT INTO g1_results VALUES (14, 'S9-all-five-present',
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE connamespace = current_schema::regnamespace
               AND conname IN (
                 'fk_questions_level_subject','fk_questions_chapter_subject',
                 'fk_questions_topic_chapter','fk_questions_subtopic_topic',
                 'fk_answer_keys_options_of_version')) = 5
       THEN 'PASS' ELSE 'FAIL: a composite FK disappeared' END);

-- restore the seed key removed by case 6 so the database is left consistent
DELETE FROM answer_keys WHERE version_id = '88888888-8888-8888-8888-888888888888';
INSERT INTO answer_keys (version_id, mcq_correct_option_key)
VALUES ('88888888-8888-8888-8888-888888888888', 'B');

-- =====================================================================
-- Report. run.sh parses exactly these columns.
-- =====================================================================
\echo ''
\echo '----- G1 RESULTS (machine-checked) -----'
SELECT seq, name, result FROM g1_results ORDER BY seq;
\echo ''
SELECT 'G1_TOTAL=' || count(*) AS total FROM g1_results;
SELECT 'G1_PASS='  || count(*) FILTER (WHERE result = 'PASS') AS passed FROM g1_results;
SELECT 'G1_FAIL='  || count(*) FILTER (WHERE result <> 'PASS') AS failed FROM g1_results;
