-- =====================================================================
-- G-3 FULL-SCHEMA enforcement suite — 32 machine-checked cases
--
-- Runs against the REAL Phase 04A 18-table schema produced by
-- prisma/migrations/0001_phase04a_question_bank/migration.sql. Unlike the
-- reduced 10-table prototype suite, every table here has its full NOT NULL
-- columns, every enum is a real PostgreSQL type, and there are 47 CHECK
-- constraints plus 6 hand-written indexes present.
--
-- MACHINE-CHECKED by run.sh:
--   * exactly one row per expected case
--   * every row has result = 'PASS'
--   * the row count equals the expected count declared in run.sh
--
-- Each negative case runs in a nested block and is expected to raise the
-- EXACT named constraint. A negative case that succeeds records 'FAIL' and is
-- caught, so the suite always completes and never reports success for a case
-- it did not reach.
--
-- Disposable database only.
-- =====================================================================

-- TEMP table: lives in pg_temp, which Prisma never introspects, so it cannot
-- pollute a later drift step.
CREATE TEMP TABLE g3f_results (
  seq    integer PRIMARY KEY,
  name   text    NOT NULL,
  result text    NOT NULL
);

-- ---------------------------------------------------------------------
-- Seed. Every NOT NULL column is supplied, because the real schema has no
-- defaults for name_bn/name_en/title_*/content/updated_at (updated_at is
-- written by Prisma @updatedAt, so raw SQL must supply it).
-- ---------------------------------------------------------------------
TRUNCATE question_sources, question_tags, tags, question_version_assets,
         question_assets, answer_keys, question_options, question_versions,
         questions, subtopics, topics, chapters, level_subjects, subjects,
         education_levels, boards, colleges, academic_years CASCADE;

INSERT INTO education_levels (id, code, name_bn, name_en, updated_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'HSC',  'এইচএসসি', 'HSC',  now()),
  ('22222222-2222-2222-2222-222222222222', 'ALIM', 'আলিম',    'Alim', now());

INSERT INTO subjects (id, code, name_bn, name_en, updated_at) VALUES
  ('33333333-3333-3333-3333-333333333333', 'ICT', 'আইসিটি', 'ICT', now()),
  ('99999999-9999-9999-9999-999999999999', 'PHY', 'পদার্থ',  'Physics', now());

-- ICT is offered at HSC only. That is what case C1 exploits.
INSERT INTO level_subjects (level_id, subject_id) VALUES
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333'),
  ('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999');

INSERT INTO chapters (id, subject_id, chapter_number, title_bn, title_en, updated_at) VALUES
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 1, 'অধ্যায় ১', 'ICT ch1', now()),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '99999999-9999-9999-9999-999999999999', 1, 'অধ্যায় ১', 'PHY ch1', now());

INSERT INTO topics (id, chapter_id, name_bn, name_en, order_index, updated_at) VALUES
  ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', 'টপিক ১', 'ICT t1', 1, now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'টপিক ১', 'PHY t1', 1, now());

INSERT INTO subtopics (id, topic_id, name_bn, name_en, updated_at) VALUES
  ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'উপটপিক ১', 'ICT st1', now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'উপটপিক ১', 'PHY st1', now());

-- The legitimate MCQ question: every pair internally consistent.
INSERT INTO questions (id, type, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, updated_at) VALUES
  ('77777777-7777-7777-7777-777777777777', 'MCQ',
   '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333',
   '44444444-4444-4444-4444-444444444444',
   '55555555-5555-5555-5555-555555555555',
   '66666666-6666-6666-6666-666666666666', now());

INSERT INTO question_versions (id, question_id, content, updated_at) VALUES
  ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777',
   '{"format":"ict-atlas/1","version":1,"blocks":[]}'::jsonb, now());

INSERT INTO question_options (id, version_id, key, content) VALUES
  (gen_random_uuid(), '88888888-8888-8888-8888-888888888888', 'A', '{"format":"ict-atlas/1","version":1,"blocks":[]}'::jsonb),
  (gen_random_uuid(), '88888888-8888-8888-8888-888888888888', 'B', '{"format":"ict-atlas/1","version":1,"blocks":[]}'::jsonb),
  (gen_random_uuid(), '88888888-8888-8888-8888-888888888888', 'C', '{"format":"ict-atlas/1","version":1,"blocks":[]}'::jsonb),
  (gen_random_uuid(), '88888888-8888-8888-8888-888888888888', 'D', '{"format":"ict-atlas/1","version":1,"blocks":[]}'::jsonb);

INSERT INTO answer_keys (id, version_id, mcq_correct_option_key, updated_at) VALUES
  (gen_random_uuid(), '88888888-8888-8888-8888-888888888888', 'B', now());

-- =====================================================================
-- 1-9: the five composite FKs (C-1 … C-5) and their skip/accept semantics
-- =====================================================================

INSERT INTO g3f_results VALUES (1, 'S0-seed-accepted',
  CASE WHEN (SELECT count(*) FROM questions
             WHERE id = '77777777-7777-7777-7777-777777777777') = 1
       THEN 'PASS' ELSE 'FAIL: seed row missing' END);

-- C-1: (education_level_id, subject_id) must be an offered membership.
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (id, type, education_level_id, subject_id, updated_at)
    VALUES (gen_random_uuid(), 'MCQ', '22222222-2222-2222-2222-222222222222',
            '33333333-3333-3333-3333-333333333333', now());
    INSERT INTO g3f_results VALUES (2, 'C1-level-subject', 'FAIL: invalid level/subject pair accepted');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO g3f_results VALUES (2, 'C1-level-subject',
      CASE WHEN SQLERRM LIKE '%fk_questions_level_subject%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- C-2: the chapter must belong to the question's subject.
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (id, type, education_level_id, subject_id, chapter_id, updated_at)
    VALUES (gen_random_uuid(), 'MCQ', '11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now());
    INSERT INTO g3f_results VALUES (3, 'C2-chapter-subject', 'FAIL: cross-subject chapter accepted');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO g3f_results VALUES (3, 'C2-chapter-subject',
      CASE WHEN SQLERRM LIKE '%fk_questions_chapter_subject%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- C-3: the topic must belong to the question's chapter.
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (id, type, education_level_id, subject_id, chapter_id, topic_id, updated_at)
    VALUES (gen_random_uuid(), 'MCQ', '11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333',
            '44444444-4444-4444-4444-444444444444',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now());
    INSERT INTO g3f_results VALUES (4, 'C3-topic-chapter', 'FAIL: cross-chapter topic accepted');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO g3f_results VALUES (4, 'C3-topic-chapter',
      CASE WHEN SQLERRM LIKE '%fk_questions_topic_chapter%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- C-4: the subtopic must belong to the question's topic.
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (id, type, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, updated_at)
    VALUES (gen_random_uuid(), 'MCQ', '11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333',
            '44444444-4444-4444-4444-444444444444',
            '55555555-5555-5555-5555-555555555555',
            'cccccccc-cccc-cccc-cccc-cccccccccccc', now());
    INSERT INTO g3f_results VALUES (5, 'C4-subtopic-topic', 'FAIL: cross-topic subtopic accepted');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO g3f_results VALUES (5, 'C4-subtopic-topic',
      CASE WHEN SQLERRM LIKE '%fk_questions_subtopic_topic%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- C-5: the MCQ key must name an option of the SAME version. The unique
-- (version_id) row is deleted first so ONLY C-5 can reject this insert —
-- otherwise the case could pass for the wrong reason.
DO $$
BEGIN
  DELETE FROM answer_keys WHERE version_id = '88888888-8888-8888-8888-888888888888';
  BEGIN
    INSERT INTO answer_keys (id, version_id, mcq_correct_option_key, updated_at)
    VALUES (gen_random_uuid(), '88888888-8888-8888-8888-888888888888', 'E', now());
    INSERT INTO g3f_results VALUES (6, 'C5-key-of-version', 'FAIL: non-existent option accepted');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO g3f_results VALUES (6, 'C5-key-of-version',
      CASE WHEN SQLERRM LIKE '%fk_answer_keys_options_of_version%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- C-5b: MATCH SIMPLE must SKIP a NULL key, so a CQ rubric row is legal.
DO $$
DECLARE vid uuid := gen_random_uuid();
BEGIN
  INSERT INTO question_versions (id, question_id, version_number, content, updated_at)
  VALUES (vid, '77777777-7777-7777-7777-777777777777', 90,
          '{"format":"ict-atlas/1","version":1,"blocks":[]}'::jsonb, now());
  BEGIN
    INSERT INTO answer_keys (id, version_id, mcq_correct_option_key, cq_rubric, updated_at)
    VALUES (gen_random_uuid(), vid, NULL, '{"parts":[]}'::jsonb, now());
    INSERT INTO g3f_results VALUES (7, 'C5b-null-key-skipped', 'PASS');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO g3f_results VALUES (7, 'C5b-null-key-skipped',
      'FAIL: NULL key wrongly rejected: ' || SQLERRM);
  END;
  DELETE FROM answer_keys WHERE version_id = vid;
  DELETE FROM question_versions WHERE id = vid;
END $$;

-- P1: a fully consistent question must be ACCEPTED.
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (id, type, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, updated_at)
    VALUES (gen_random_uuid(), 'MCQ', '11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333',
            '44444444-4444-4444-4444-444444444444',
            '55555555-5555-5555-5555-555555555555',
            '66666666-6666-6666-6666-666666666666', now());
    INSERT INTO g3f_results VALUES (8, 'P1-consistent-accepted', 'PASS');
    DELETE FROM questions
    WHERE education_level_id = '11111111-1111-1111-1111-111111111111'
      AND chapter_id = '44444444-4444-4444-4444-444444444444'
      AND id <> '77777777-7777-7777-7777-777777777777';
  EXCEPTION WHEN others THEN
    INSERT INTO g3f_results VALUES (8, 'P1-consistent-accepted',
      'FAIL: valid row rejected: ' || SQLERRM);
  END;
END $$;

-- P2: optional taxonomy links may be NULL (MATCH SIMPLE skip).
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (id, type, education_level_id, subject_id, updated_at)
    VALUES (gen_random_uuid(), 'MCQ',
            '11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333', now());
    INSERT INTO g3f_results VALUES (9, 'P2-optional-links-null', 'PASS');
    DELETE FROM questions
    WHERE chapter_id IS NULL AND topic_id IS NULL AND subtopic_id IS NULL
      AND id <> '77777777-7777-7777-7777-777777777777';
  EXCEPTION WHEN others THEN
    INSERT INTO g3f_results VALUES (9, 'P2-optional-links-null',
      'FAIL: NULL taxonomy links rejected: ' || SQLERRM);
  END;
END $$;

-- restore the seed key removed by case 6
INSERT INTO answer_keys (id, version_id, mcq_correct_option_key, updated_at)
VALUES (gen_random_uuid(), '88888888-8888-8888-8888-888888888888', 'B', now())
ON CONFLICT (version_id) DO UPDATE SET mcq_correct_option_key = 'B';

-- =====================================================================
-- 10-12: the partial unique indexes (E-7 / one published version)
-- =====================================================================

-- E-7a: a retired topic frees its display position.
DO $$
BEGIN
  BEGIN
    INSERT INTO topics (id, chapter_id, name_bn, name_en, order_index, is_active, updated_at)
    VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            '44444444-4444-4444-4444-444444444444', 'পুরাতন', 'old', 2, false, now());
    INSERT INTO topics (id, chapter_id, name_bn, name_en, order_index, is_active, updated_at)
    VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff',
            '44444444-4444-4444-4444-444444444444', 'নতুন', 'new', 2, true, now());
    INSERT INTO g3f_results VALUES (10, 'E7a-retired-position-reusable', 'PASS');
    DELETE FROM topics WHERE id IN ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
                                    'ffffffff-ffff-ffff-ffff-ffffffffffff');
  EXCEPTION WHEN others THEN
    INSERT INTO g3f_results VALUES (10, 'E7a-retired-position-reusable',
      'FAIL: retired position not reusable: ' || SQLERRM);
  END;
END $$;

-- E-7b: two ACTIVE topics may not share a position in one chapter.
DO $$
BEGIN
  BEGIN
    INSERT INTO topics (id, chapter_id, name_bn, name_en, order_index, is_active, updated_at)
    VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            '44444444-4444-4444-4444-444444444444', 'ক', 'a', 3, true, now());
    INSERT INTO topics (id, chapter_id, name_bn, name_en, order_index, is_active, updated_at)
    VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff',
            '44444444-4444-4444-4444-444444444444', 'খ', 'b', 3, true, now());
    INSERT INTO g3f_results VALUES (11, 'E7b-active-position-unique',
      'FAIL: two active topics shared a position');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO g3f_results VALUES (11, 'E7b-active-position-unique',
      CASE WHEN SQLERRM LIKE '%uq_topics_chapter_order%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- E-7c: two RETIRED topics may share a position (they are outside the index).
DO $$
BEGIN
  BEGIN
    INSERT INTO topics (id, chapter_id, name_bn, name_en, order_index, is_active, updated_at)
    VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            '44444444-4444-4444-4444-444444444444', 'ক', 'a', 4, false, now());
    INSERT INTO topics (id, chapter_id, name_bn, name_en, order_index, is_active, updated_at)
    VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff',
            '44444444-4444-4444-4444-444444444444', 'খ', 'b', 4, false, now());
    INSERT INTO g3f_results VALUES (12, 'E7c-retired-not-indexed', 'PASS');
    DELETE FROM topics WHERE id IN ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
                                    'ffffffff-ffff-ffff-ffff-ffffffffffff');
  EXCEPTION WHEN others THEN
    INSERT INTO g3f_results VALUES (12, 'E7c-retired-not-indexed',
      'FAIL: two retired topics could not share a position: ' || SQLERRM);
  END;
END $$;

-- =====================================================================
-- 13-14: RESTRICT semantics and final presence of all five
-- =====================================================================

-- R1: the composite FK must be a real FK — deleting a referenced chapter
-- while a question uses it must fail with RESTRICT.
DO $$
BEGIN
  BEGIN
    DELETE FROM chapters WHERE id = '44444444-4444-4444-4444-444444444444';
    INSERT INTO g3f_results VALUES (13, 'R1-restrict-blocks-delete',
      'FAIL: deleting a referenced chapter succeeded');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO g3f_results VALUES (13, 'R1-restrict-blocks-delete', 'PASS');
  END;
END $$;

INSERT INTO g3f_results VALUES (14, 'S9-all-five-present',
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE connamespace = current_schema::regnamespace
               AND conname IN (
                 'fk_questions_level_subject','fk_questions_chapter_subject',
                 'fk_questions_topic_chapter','fk_questions_subtopic_topic',
                 'fk_answer_keys_options_of_version')) = 5
       THEN 'PASS' ELSE 'FAIL: a composite FK disappeared' END);

-- =====================================================================
-- 15-27: CHECK constraints that only exist in the FULL schema
-- (the prototype had a handful; the real schema has 47)
-- =====================================================================

-- 15. ck_questions_marks_nonnegative
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (id, type, education_level_id, subject_id, marks, updated_at)
    VALUES (gen_random_uuid(), 'CQ', '11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333', -1, now());
    INSERT INTO g3f_results VALUES (15, 'ck-questions-marks-nonnegative', 'FAIL: negative marks accepted');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO g3f_results VALUES (15, 'ck-questions-marks-nonnegative',
      CASE WHEN SQLERRM LIKE '%ck_questions_marks_nonnegative%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- 16. ck_questions_mcq_marks_positive (E-11): an MCQ worth 0 marks is rejected
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (id, type, education_level_id, subject_id, marks, updated_at)
    VALUES (gen_random_uuid(), 'MCQ', '11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333', 0, now());
    INSERT INTO g3f_results VALUES (16, 'E11-mcq-marks-positive', 'FAIL: zero-mark MCQ accepted');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO g3f_results VALUES (16, 'E11-mcq-marks-positive',
      CASE WHEN SQLERRM LIKE '%ck_questions_mcq_marks_positive%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- 17. E-10 REJECTED: a CQ is NOT forced to 10 marks by the database.
--     This is a POSITIVE test: marks = 7 must be accepted, because the
--     1+2+3+4 = 10 structure belongs to the content profile, not the type.
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (id, type, education_level_id, subject_id, marks, updated_at)
    VALUES (gen_random_uuid(), 'CQ', '11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333', 7, now());
    INSERT INTO g3f_results VALUES (17, 'E10-no-cq-total-check', 'PASS');
    DELETE FROM questions WHERE type = 'CQ' AND marks = 7;
  EXCEPTION WHEN others THEN
    INSERT INTO g3f_results VALUES (17, 'E10-no-cq-total-check',
      'FAIL: a CQ of 7 marks was rejected — E-10 was supposed to be rejected: ' || SQLERRM);
  END;
END $$;

-- 18. the hierarchy chain CHECK: topic without chapter
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (id, type, education_level_id, subject_id, topic_id, updated_at)
    VALUES (gen_random_uuid(), 'MCQ', '11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333',
            '55555555-5555-5555-5555-555555555555', now());
    INSERT INTO g3f_results VALUES (18, 'ck-topic-requires-chapter', 'FAIL: topic without chapter accepted');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO g3f_results VALUES (18, 'ck-topic-requires-chapter',
      CASE WHEN SQLERRM LIKE '%ck_questions_topic_requires_chapter%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- 19. the hierarchy chain CHECK: subtopic without topic
DO $$
BEGIN
  BEGIN
    INSERT INTO questions (id, type, education_level_id, subject_id, chapter_id, subtopic_id, updated_at)
    VALUES (gen_random_uuid(), 'MCQ', '11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333',
            '44444444-4444-4444-4444-444444444444',
            '66666666-6666-6666-6666-666666666666', now());
    INSERT INTO g3f_results VALUES (19, 'ck-subtopic-requires-topic', 'FAIL: subtopic without topic accepted');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO g3f_results VALUES (19, 'ck-subtopic-requires-topic',
      CASE WHEN SQLERRM LIKE '%ck_questions_subtopic_requires_topic%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- 20. ck_answer_keys_exactly_one_payload: both payloads at once
DO $$
DECLARE vid uuid := gen_random_uuid();
BEGIN
  INSERT INTO question_versions (id, question_id, version_number, content, updated_at)
  VALUES (vid, '77777777-7777-7777-7777-777777777777', 90,
          '{"format":"ict-atlas/1","version":1,"blocks":[]}'::jsonb, now());
  BEGIN
    INSERT INTO answer_keys (id, version_id, mcq_correct_option_key, cq_rubric, updated_at)
    VALUES (gen_random_uuid(), vid, 'A', '{"parts":[]}'::jsonb, now());
    INSERT INTO g3f_results VALUES (20, 'ck-answer-exactly-one-payload', 'FAIL: both payloads accepted');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO g3f_results VALUES (20, 'ck-answer-exactly-one-payload',
      CASE WHEN SQLERRM LIKE '%ck_answer_keys_exactly_one_payload%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
  DELETE FROM question_versions WHERE id = vid;
END $$;

-- 21. ck_answer_keys_exactly_one_payload: neither payload
DO $$
DECLARE vid uuid := gen_random_uuid();
BEGIN
  INSERT INTO question_versions (id, question_id, version_number, content, updated_at)
  VALUES (vid, '77777777-7777-7777-7777-777777777777', 92,
          '{"format":"ict-atlas/1","version":1,"blocks":[]}'::jsonb, now());
  BEGIN
    INSERT INTO answer_keys (id, version_id, updated_at) VALUES (gen_random_uuid(), vid, now());
    INSERT INTO g3f_results VALUES (21, 'ck-answer-needs-one-payload', 'FAIL: empty payload accepted');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO g3f_results VALUES (21, 'ck-answer-needs-one-payload',
      CASE WHEN SQLERRM LIKE '%ck_answer_keys_exactly_one_payload%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
  DELETE FROM question_versions WHERE id = vid;
END $$;

-- 22. ck_question_options_key_allowed: 'E' is not an approved label
DO $$
BEGIN
  BEGIN
    INSERT INTO question_options (id, version_id, key, content)
    VALUES (gen_random_uuid(), '88888888-8888-8888-8888-888888888888', 'E',
            '{"format":"ict-atlas/1","version":1,"blocks":[]}'::jsonb);
    INSERT INTO g3f_results VALUES (22, 'ck-option-key-allowed', 'FAIL: option key E accepted');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO g3f_results VALUES (22, 'ck-option-key-allowed',
      CASE WHEN SQLERRM LIKE '%ck_question_options_key_allowed%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- 23. A two-character key must be rejected — and measuring WHICH constraint
--     fires produced a finding about the proposal, recorded rather than
--     engineered around.
--
--     §3.3.9/§3.9 declare two constraints on question_options.key:
--         ck_question_options_key_single_char  (char_length(key) = 1)
--         ck_question_options_key_allowed      (key IN ('A','B','C','D','ক','খ','গ','ঘ'))
--     Every member of the allowed set is exactly one character, so
--     key_allowed IMPLIES key_single_char: no row can violate the second
--     without violating the first, and PostgreSQL evaluates whichever it
--     reaches first. Measured here, 'AB' is rejected by key_allowed.
--
--     This is a REDUNDANCY in the approved specification, not a defect that
--     changes behaviour, and it is NOT fixed here: deleting a constraint the
--     reviewer approved would be a design change made by an implementer.
--     Case 33 proves both are installed; §11.9 of the proposal reports the
--     redundancy and asks for a disposition.
DO $$
BEGIN
  BEGIN
    INSERT INTO question_options (id, version_id, key, content)
    VALUES (gen_random_uuid(), '88888888-8888-8888-8888-888888888888', 'AB',
            '{"format":"ict-atlas/1", "version":1,"blocks":[]}'::jsonb);
    INSERT INTO g3f_results VALUES (23, 'ck-option-key-two-chars-rejected', 'FAIL: two-character key accepted');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO g3f_results VALUES (23, 'ck-option-key-two-chars-rejected',
      CASE WHEN SQLERRM LIKE '%ck_question_options_key_single_char%'
                OR SQLERRM LIKE '%ck_question_options_key_allowed%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- 24. ck_question_versions_content_envelope: the OD-18 envelope is required
DO $$
BEGIN
  BEGIN
    INSERT INTO question_versions (id, question_id, content, updated_at)
    VALUES (gen_random_uuid(), '77777777-7777-7777-7777-777777777777', '{"blocks":[]}'::jsonb, now());
    INSERT INTO g3f_results VALUES (24, 'ck-content-envelope', 'FAIL: envelope without format/version accepted');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO g3f_results VALUES (24, 'ck-content-envelope',
      CASE WHEN SQLERRM LIKE '%ck_question_versions_content_envelope%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
END $$;

-- 25. ck_question_version_assets_block_ref_pointer: an unrooted pointer is
--     rejected. This is the CHECK that §3.9 wrote as invalid SQL and that the
--     migration fixes with explicit parentheses (see the deviation note there).
DO $$
DECLARE aid uuid := gen_random_uuid(); vid uuid := gen_random_uuid();
BEGIN
  INSERT INTO question_assets (id, storage_key, mime_type, size_bytes, alt_text, updated_at)
  VALUES (aid, 'g3f/' || aid, 'image/png', 10, 'alt', now());
  INSERT INTO question_versions (id, question_id, version_number, content, updated_at)
  VALUES (vid, '77777777-7777-7777-7777-777777777777', 93,
          '{"format":"ict-atlas/1","version":1,"blocks":[]}'::jsonb, now());
  BEGIN
    INSERT INTO question_version_assets (id, version_id, asset_id, block_ref)
    VALUES (gen_random_uuid(), vid, aid, '/blocks/0');
    INSERT INTO g3f_results VALUES (25, 'ck-block-ref-rooted', 'FAIL: unrooted pointer accepted');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO g3f_results VALUES (25, 'ck-block-ref-rooted',
      CASE WHEN SQLERRM LIKE '%ck_question_version_assets_block_ref_pointer%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
  DELETE FROM question_version_assets WHERE version_id = vid;
  DELETE FROM question_versions WHERE id = vid;
  DELETE FROM question_assets WHERE id = aid;
END $$;

-- 26. ck_question_version_assets_block_ref_pointer: a VALID rooted pointer is
--     accepted. This is the positive control for case 25 — without it the
--     constraint could be rejecting everything.
DO $$
DECLARE aid uuid := gen_random_uuid(); vid uuid := gen_random_uuid();
BEGIN
  INSERT INTO question_assets (id, storage_key, mime_type, size_bytes, alt_text, updated_at)
  VALUES (aid, 'g3f/' || aid, 'image/png', 10, 'alt', now());
  INSERT INTO question_versions (id, question_id, version_number, content, updated_at)
  VALUES (vid, '77777777-7777-7777-7777-777777777777', 94,
          '{"format":"ict-atlas/1","version":1,"blocks":[]}'::jsonb, now());
  BEGIN
    INSERT INTO question_version_assets (id, version_id, asset_id, block_ref)
    VALUES (gen_random_uuid(), vid, aid, '/content/blocks/2');
    INSERT INTO question_version_assets (id, version_id, asset_id, block_ref)
    VALUES (gen_random_uuid(), vid, aid, '/options/খ/blocks/0');
    INSERT INTO g3f_results VALUES (26, 'ck-block-ref-valid-accepted', 'PASS');
  EXCEPTION WHEN others THEN
    INSERT INTO g3f_results VALUES (26, 'ck-block-ref-valid-accepted',
      'FAIL: a valid rooted pointer was rejected: ' || SQLERRM);
  END;
  DELETE FROM question_version_assets WHERE version_id = vid;
  DELETE FROM question_versions WHERE id = vid;
  DELETE FROM question_assets WHERE id = aid;
END $$;

-- 27. ck_question_sources_board_or_college_not_both (the approved OD-08 guard)
DO $$
DECLARE bid uuid := gen_random_uuid(); cid uuid := gen_random_uuid();
BEGIN
  INSERT INTO boards (id, code, name_en, updated_at) VALUES (bid, 'DHAKA', 'Dhaka', now());
  INSERT INTO colleges (id, name, updated_at) VALUES (cid, 'NDC ' || cid, now());
  BEGIN
    INSERT INTO question_sources (id, question_id, source_type, board_id, college_id)
    VALUES (gen_random_uuid(), '77777777-7777-7777-7777-777777777777', 'BOARD', bid, cid);
    INSERT INTO g3f_results VALUES (27, 'ck-source-board-xor-college', 'FAIL: board AND college accepted');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO g3f_results VALUES (27, 'ck-source-board-xor-college',
      CASE WHEN SQLERRM LIKE '%ck_question_sources_board_or_college_not_both%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
  DELETE FROM question_sources WHERE question_id = '77777777-7777-7777-7777-777777777777';
  DELETE FROM boards WHERE id = bid;
  DELETE FROM colleges WHERE id = cid;
END $$;

-- =====================================================================
-- 28-32: hand-written index semantics that exist only in the full schema
-- =====================================================================

-- 28. uq_question_versions_one_published_per_question: two PUBLISHED versions
--     of one question are rejected.
--     Since migration 0002 (Phase 04B) a PUBLISHED row must name its publisher
--     (ck_question_versions_published_has_publisher), so both rows carry one;
--     otherwise the CHECK would fire first and this case would no longer test
--     the index.
--     Since migration 0005 a PUBLISHED version can no longer be put back to
--     DRAFT, so the setup is undone by rolling back to a savepoint (the
--     inner block ends with a sentinel exception) instead of an UPDATE. The
--     assertion itself is unchanged.
DO $$
DECLARE vid uuid := gen_random_uuid();
        pid uuid := gen_random_uuid();
        verdict text;
BEGIN
  BEGIN
    INSERT INTO profiles (id, display_name, updated_at) VALUES (pid, 'g3f publisher', now());
    UPDATE question_versions SET status = 'PUBLISHED', published_by = pid, published_at = now()
    WHERE id = '88888888-8888-8888-8888-888888888888';
    BEGIN
      INSERT INTO question_versions (id, question_id, version_number, status, content, updated_at,
                                     published_by, published_at)
      VALUES (vid, '77777777-7777-7777-7777-777777777777', 2, 'PUBLISHED',
              '{"format":"ict-atlas/1","version":1,"blocks":[]}'::jsonb, now(), pid, now());
      verdict := 'FAIL: two published versions accepted';
    EXCEPTION WHEN unique_violation THEN
      verdict := CASE WHEN SQLERRM LIKE '%uq_question_versions_one_published_per_question%'
                      THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END;
    END;
    RAISE EXCEPTION 'undo case 28 setup' USING ERRCODE = 'G3F28';
  EXCEPTION WHEN SQLSTATE 'G3F28' THEN
    NULL; -- version 8888… is DRAFT again, the profile and second version are gone
  END;
  INSERT INTO g3f_results VALUES (28, 'uq-one-published-per-question', verdict);
END $$;

-- 29. a SECOND DRAFT version of the same question must still be allowed
--     (the positive control for case 28: the index scopes to PUBLISHED only,
--     and OD-10 explicitly allows several drafts).
DO $$
DECLARE vid uuid := gen_random_uuid();
BEGIN
  BEGIN
    INSERT INTO question_versions (id, question_id, version_number, status, content, updated_at)
    VALUES (vid, '77777777-7777-7777-7777-777777777777', 2, 'DRAFT',
            '{"format":"ict-atlas/1","version":1,"blocks":[]}'::jsonb, now());
    INSERT INTO question_versions (id, question_id, version_number, status, content, updated_at)
    VALUES (gen_random_uuid(), '77777777-7777-7777-7777-777777777777', 3, 'DRAFT',
            '{"format":"ict-atlas/1","version":1,"blocks":[]}'::jsonb, now());
    INSERT INTO g3f_results VALUES (29, 'two-drafts-allowed', 'PASS');
  EXCEPTION WHEN others THEN
    INSERT INTO g3f_results VALUES (29, 'two-drafts-allowed',
      'FAIL: two DRAFT versions were rejected — the partial index is too broad: ' || SQLERRM);
  END;
  DELETE FROM question_versions WHERE question_id = '77777777-7777-7777-7777-777777777777'
    AND id <> '88888888-8888-8888-8888-888888888888';
END $$;

-- 30. uq_tags_name_lower: 'Logic Gate' and 'logic gate' cannot both exist
DO $$
BEGIN
  INSERT INTO tags (id, name, slug) VALUES (gen_random_uuid(), 'Logic Gate', 'logic-gate') ON CONFLICT DO NOTHING;
  BEGIN
    INSERT INTO tags (id, name, slug) VALUES (gen_random_uuid(), 'logic gate', 'logic-gate-2');
    INSERT INTO g3f_results VALUES (30, 'uq-tags-name-lower', 'FAIL: case-variant tag accepted');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO g3f_results VALUES (30, 'uq-tags-name-lower',
      CASE WHEN SQLERRM LIKE '%uq_tags_name_lower%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
  DELETE FROM tags WHERE slug IN ('logic-gate','logic-gate-2');
END $$;

-- 31. uq_question_sources_identity (NULLS NOT DISTINCT): an identical partial
--     attribution — same question, type and year, no board, no college — must
--     be rejected even though board_id and college_id are both NULL.
DO $$
DECLARE yid uuid := gen_random_uuid();
BEGIN
  INSERT INTO academic_years (id, label, year, updated_at)
  VALUES (yid, '2099-' || yid, NULL, now());
  INSERT INTO question_sources (id, question_id, source_type, academic_year_id)
  VALUES (gen_random_uuid(), '77777777-7777-7777-7777-777777777777', 'ORIGINAL', yid);
  BEGIN
    INSERT INTO question_sources (id, question_id, source_type, academic_year_id)
    VALUES (gen_random_uuid(), '77777777-7777-7777-7777-777777777777', 'ORIGINAL', yid);
    INSERT INTO g3f_results VALUES (31, 'uq-source-identity-nulls', 'FAIL: duplicate NULL attribution accepted');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO g3f_results VALUES (31, 'uq-source-identity-nulls',
      CASE WHEN SQLERRM LIKE '%uq_question_sources_identity%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
  DELETE FROM question_sources WHERE academic_year_id = yid;
  DELETE FROM academic_years WHERE id = yid;
END $$;

-- 32. uq_colleges_name_lower: case-insensitive institution uniqueness
DO $$
BEGIN
  INSERT INTO colleges (id, name, updated_at) VALUES (gen_random_uuid(), 'Notre Dame College', now());
  BEGIN
    INSERT INTO colleges (id, name, updated_at) VALUES (gen_random_uuid(), 'notre dame college', now());
    INSERT INTO g3f_results VALUES (32, 'uq-colleges-name-lower', 'FAIL: case-variant college accepted');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO g3f_results VALUES (32, 'uq-colleges-name-lower',
      CASE WHEN SQLERRM LIKE '%uq_colleges_name_lower%'
           THEN 'PASS' ELSE 'FAIL: wrong constraint: ' || SQLERRM END);
  END;
  DELETE FROM colleges WHERE lower(name) = 'notre dame college';
END $$;

-- =====================================================================
-- 33. the full CHECK inventory is installed — not just the handful the
--     reduced prototype had. A schema where a CHECK silently failed to be
--     created would otherwise look healthy.
-- =====================================================================
--     Phase 04B: 47 from migration 0001 + 7 from 0002_identity_audit = 54.
--     The case keeps its historical label so earlier evidence stays comparable.
INSERT INTO g3f_results VALUES (33, 'S10-all-47-checks-present',
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE connamespace = current_schema::regnamespace
               AND contype = 'c'
               AND conname LIKE 'ck\_%') = 54
       THEN 'PASS'
       ELSE 'FAIL: expected 54 ck_ constraints (47 + 7), found '
            || (SELECT count(*) FROM pg_constraint
                WHERE connamespace = current_schema::regnamespace
                  AND contype = 'c' AND conname LIKE 'ck\_%')::text END);

-- =====================================================================
-- Report. run.sh parses exactly these markers.
-- =====================================================================
\echo ''
\echo '----- G3F RESULTS (machine-checked) -----'
SELECT seq, name, result FROM g3f_results ORDER BY seq;
\echo ''
SELECT 'G3F_TOTAL=' || count(*) AS total FROM g3f_results;
SELECT 'G3F_PASS='  || count(*) FILTER (WHERE result = 'PASS') AS passed FROM g3f_results;
SELECT 'G3F_FAIL='  || count(*) FILTER (WHERE result <> 'PASS') AS failed FROM g3f_results;
