-- =====================================================================
-- V-2 seed data — the real HSC ICT curriculum, plus one complete MCQ
-- chain and one complete CQ chain.
--
-- Realistic on purpose: the point of V-2 is to find a CHECK that rejects
-- LEGITIMATE curriculum data, which synthetic rows cannot reveal. The
-- chapter titles, topic names and question content below are the kind of
-- data this schema will actually hold: Bangla and English titles, a Bangla
-- MCQ option set (ক/খ/গ/ঘ), a CQ rubric with four parts worth 1+2+3+4.
--
-- NO constraint is relaxed to accommodate this file. UUIDs and timestamps
-- are supplied explicitly because §3.15 E-13/E-14 make them client duties.
-- =====================================================================
BEGIN;

-- ---------- curriculum level + subject + membership ----------
INSERT INTO education_levels (id, code, name_bn, name_en, created_at, updated_at) VALUES
  ('00000000-0000-4000-a000-00000000000a', 'HSC',  'উচ্চ মাধ্যমিক', 'Higher Secondary', now(), now()),
  ('00000000-0000-4000-a000-00000000000b', 'ALIM', 'আলিম',          'Alim',             now(), now());

INSERT INTO subjects (id, code, name_bn, name_en, created_at, updated_at) VALUES
  ('00000000-0000-4000-b000-000000000001', 'ICT',     'তথ্য ও যোগাযোগ প্রযুক্তি', 'Information and Communication Technology', now(), now()),
  ('00000000-0000-4000-b000-000000000002', 'PHY',     'পদার্থবিজ্ঞান',            'Physics',                                   now(), now()),
  ('00000000-0000-4000-b000-000000000003', 'ISLAMIC', 'ইসলাম শিক্ষা',             'Islamic Studies',                           now(), now());

-- ICT is offered at HSC; Physics at HSC; Islamic Studies at Alim.
-- C-1 exists so that a question cannot claim a subject its level does not offer.
INSERT INTO level_subjects (level_id, subject_id) VALUES
  ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-b000-000000000001'),
  ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-b000-000000000002'),
  ('00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-b000-000000000003');

-- ---------- the six real HSC ICT chapters ----------
INSERT INTO chapters (id, subject_id, chapter_number, title_bn, title_en, created_at, updated_at) VALUES
  ('20000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000001', 1, 'তথ্য ও যোগাযোগ প্রযুক্তি এবং আমাদের বাংলাদেশ', 'ICT and Our Bangladesh', now(), now()),
  ('20000000-0000-4000-a000-000000000002', '00000000-0000-4000-b000-000000000001', 2, 'কম্পিউটার ও কম্পিউটার ব্যবহারকারীর নিরাপত্তা', 'Computer and User Safety', now(), now()),
  ('20000000-0000-4000-a000-000000000003', '00000000-0000-4000-b000-000000000001', 3, 'আমার শিক্ষায় ইন্টারনেট', 'The Internet in My Education', now(), now()),
  ('20000000-0000-4000-a000-000000000004', '00000000-0000-4000-b000-000000000001', 4, 'আমার লেখা ও ছবি ইন্টারনেটে', 'My Writing and Images on the Internet', now(), now()),
  ('20000000-0000-4000-a000-000000000005', '00000000-0000-4000-b000-000000000001', 5, 'প্রোগ্রামিং ভাষা', 'Programming Language', now(), now()),
  ('20000000-0000-4000-a000-000000000006', '00000000-0000-4000-b000-000000000001', 6, 'ডেটাবেজ ম্যানেজমেন্ট সিস্টেম', 'Database Management System', now(), now());

INSERT INTO topics (id, chapter_id, name_bn, name_en, order_index, created_at, updated_at) VALUES
  ('30000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000003', 'ইন্টারনেটের ধারণা',   'Concepts of the Internet', 0, now(), now()),
  ('30000000-0000-4000-a000-000000000002', '20000000-0000-4000-a000-000000000003', 'ই-মেইল',              'Electronic Mail',          1, now(), now()),
  ('30000000-0000-4000-a000-000000000003', '20000000-0000-4000-a000-000000000005', 'প্রোগ্রামের ধারণা',    'Concepts of a Program',    0, now(), now()),
  ('30000000-0000-4000-a000-000000000004', '20000000-0000-4000-a000-000000000005', 'সি ভাষার মৌলিক বিষয়', 'Fundamentals of C',        1, now(), now()),
  ('30000000-0000-4000-a000-000000000005', '20000000-0000-4000-a000-000000000006', 'ডেটাবেজের ধারণা',      'Concepts of a Database',   0, now(), now());

INSERT INTO subtopics (id, topic_id, name_bn, name_en, created_at, updated_at) VALUES
  ('40000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 'ইন্টারনেট সেবা',  'Internet Services', now(), now()),
  ('40000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000002', 'ই-মেইল ঠিকানা',   'Email Address',     now(), now()),
  ('40000000-0000-4000-a000-000000000003', '30000000-0000-4000-a000-000000000004', 'ডেটা টাইপ',        'Data Types',        now(), now()),
  ('40000000-0000-4000-a000-000000000004', '30000000-0000-4000-a000-000000000005', 'প্রাইমারি কি',     'Primary Key',       now(), now());

-- ---------- provenance dimensions ----------
INSERT INTO boards (id, code, name_bn, name_en, type, created_at, updated_at) VALUES
  ('80000000-0000-4000-a000-000000000001', 'DHAKA',  'ঢাকা',  'Dhaka',  'GENERAL',  now(), now()),
  ('80000000-0000-4000-a000-000000000002', 'RAJSHAHI','রাজশাহী','Rajshahi','GENERAL', now(), now());

INSERT INTO colleges (id, name, code, created_at, updated_at) VALUES
  ('80000000-0000-4000-b000-000000000001', 'Notre Dame College', 'NDC', now(), now()),
  ('80000000-0000-4000-b000-000000000002', 'Dhaka College',      'DC',  now(), now());

INSERT INTO academic_years (id, label, year, created_at, updated_at) VALUES
  ('80000000-0000-4000-c000-000000000001', '2024-2025', 2024, now(), now()),
  ('80000000-0000-4000-c000-000000000002', '2025-2026', 2025, now(), now());

-- ---------- tags (real ICT vocabulary) ----------
INSERT INTO tags (id, name, slug, created_at) VALUES
  ('50000000-0000-4000-a000-000000000001', 'Computer Network', 'computer-network', now()),
  ('50000000-0000-4000-a000-000000000002', 'Database',         'database',         now()),
  ('50000000-0000-4000-a000-000000000003', 'Programming',      'programming',      now()),
  ('50000000-0000-4000-a000-000000000004', 'Number System',    'number-system',    now());

-- ---------- assets ----------
INSERT INTO question_assets (id, storage_key, mime_type, size_bytes, width, height, alt_text, checksum, created_at, updated_at) VALUES
  ('90000000-0000-4000-a000-000000000001', 'phase04a/v2/network-topology.png', 'image/png', 48213, 800, 600,
   'স্টার টপোলজি চিত্র', 'sha256:6b3f8f2ac1d94e7b0a5c3d8e1f4a7b2c9d6e0f3a8b5c2d7e4f1a0b9c6d3e8f2a', now(), now()),
  ('90000000-0000-4000-a000-000000000002', 'phase04a/v2/dbms-schema.png', 'image/png', 31102, 1024, 768,
   'ডেটাবেজ স্কিমা', 'sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b', now(), now());

-- =====================================================================
-- ONE COMPLETE MCQ CHAIN (chapter 3, topic: e-mail, Bangla option keys)
-- =====================================================================
INSERT INTO questions (id, type, status, difficulty, created_via,
                       education_level_id, subject_id, chapter_id, topic_id, subtopic_id,
                       marks, created_at, updated_at) VALUES
  ('70000000-0000-4000-a000-000000000001', 'MCQ', 'PUBLISHED', 'MEDIUM', 'MANUAL',
   '00000000-0000-4000-a000-00000000000a',
   '00000000-0000-4000-b000-000000000001',
   '20000000-0000-4000-a000-000000000003',
   '30000000-0000-4000-a000-000000000002',
   '40000000-0000-4000-a000-000000000002',
   1, now(), now());

INSERT INTO question_versions (id, question_id, version_number, status, content, created_at, updated_at) VALUES
  ('60000000-0000-4000-a000-000000000001', '70000000-0000-4000-a000-000000000001', 1, 'PUBLISHED',
   '{"format":"rich_blocks","version":1,"blocks":[
      {"type":"paragraph","data":{"text":"ই-মেইল ঠিকানায় @ চিহ্নের আগের অংশকে কী বলা হয়?"},"id":"blk00001"}
    ]}'::jsonb, now(), now());

INSERT INTO question_options (id, version_id, key, content, sort_order, created_at) VALUES
  ('a0000000-0000-4000-a000-000000000001', '60000000-0000-4000-a000-000000000001', 'ক',
   '{"format":"rich_blocks","version":1,"blocks":[{"type":"paragraph","data":{"text":"ডোমেইন নাম"},"id":"blk00002"}]}'::jsonb, 0, now()),
  ('a0000000-0000-4000-a000-000000000002', '60000000-0000-4000-a000-000000000001', 'খ',
   '{"format":"rich_blocks","version":1,"blocks":[{"type":"paragraph","data":{"text":"ইউজার নেম"},"id":"blk00003"}]}'::jsonb, 1, now()),
  ('a0000000-0000-4000-a000-000000000003', '60000000-0000-4000-a000-000000000001', 'গ',
   '{"format":"rich_blocks","version":1,"blocks":[{"type":"paragraph","data":{"text":"সাবডোমেইন"},"id":"blk00004"}]}'::jsonb, 2, now()),
  ('a0000000-0000-4000-a000-000000000004', '60000000-0000-4000-a000-000000000001', 'ঘ',
   '{"format":"rich_blocks","version":1,"blocks":[{"type":"paragraph","data":{"text":"হোস্ট নাম"},"id":"blk00005"}]}'::jsonb, 3, now());

INSERT INTO answer_keys (id, version_id, mcq_correct_option_key, is_verified, verified_at, created_at, updated_at) VALUES
  ('b0000000-0000-4000-a000-000000000001', '60000000-0000-4000-a000-000000000001', 'খ', true, now(), now(), now());

-- an asset pinned at a nested block pointer, and one at the stem
INSERT INTO question_version_assets (id, version_id, asset_id, block_ref, created_at) VALUES
  ('c0000000-0000-4000-a000-000000000001', '60000000-0000-4000-a000-000000000001',
   '90000000-0000-4000-a000-000000000001', '/content/blocks/0', now());

-- two tags on the MCQ
INSERT INTO question_tags (question_id, tag_id, created_at) VALUES
  ('70000000-0000-4000-a000-000000000001', '50000000-0000-4000-a000-000000000001', now()),
  ('70000000-0000-4000-a000-000000000001', '50000000-0000-4000-a000-000000000004', now());

-- board provenance in 2024, plus an ORIGINAL attribution with NULL board/college
INSERT INTO question_sources (id, question_id, source_type, board_id, academic_year_id, created_at) VALUES
  ('d0000000-0000-4000-a000-000000000001', '70000000-0000-4000-a000-000000000001', 'BOARD',
   '80000000-0000-4000-a000-000000000001', '80000000-0000-4000-c000-000000000001', now());
INSERT INTO question_sources (id, question_id, source_type, academic_year_id, created_at) VALUES
  ('d0000000-0000-4000-a000-000000000002', '70000000-0000-4000-a000-000000000001', 'ORIGINAL',
   '80000000-0000-4000-c000-000000000001', now());

-- =====================================================================
-- ONE COMPLETE CQ CHAIN (chapter 6, topic: database, rubric 1+2+3+4 = 10)
-- =====================================================================
INSERT INTO questions (id, type, status, difficulty, created_via,
                       education_level_id, subject_id, chapter_id, topic_id, subtopic_id,
                       marks, created_at, updated_at) VALUES
  ('70000000-0000-4000-a000-000000000002', 'CQ', 'PUBLISHED', 'HARD', 'MANUAL',
   '00000000-0000-4000-a000-00000000000a',
   '00000000-0000-4000-b000-000000000001',
   '20000000-0000-4000-a000-000000000006',
   '30000000-0000-4000-a000-000000000005',
   '40000000-0000-4000-a000-000000000004',
   10, now(), now());

INSERT INTO question_versions (id, question_id, version_number, status, content, created_at, updated_at) VALUES
  ('60000000-0000-4000-a000-000000000002', '70000000-0000-4000-a000-000000000002', 1, 'PUBLISHED',
   '{"format":"rich_blocks","version":1,"blocks":[
      {"type":"paragraph","data":{"text":"একটি শিক্ষা প্রতিষ্ঠানের শিক্ষার্থী ও ফলাফল সংরক্ষণের জন্য একটি ডেটাবেজ তৈরি করতে হবে।"},"id":"blk10001"},
      {"type":"paragraph","data":{"text":"ক. ডেটাবেজ কী?"},"id":"blk10002"},
      {"type":"paragraph","data":{"text":"খ. প্রাইমারি কি-এর প্রয়োজনীয়তা ব্যাখ্যা কর।"},"id":"blk10003"},
      {"type":"paragraph","data":{"text":"গ. সম্পর্কিক ডেটাবেজে ডেটা রিডান্ডেন্সি কীভাবে কম হয় — বিশ্লেষণ কর।"},"id":"blk10004"},
      {"type":"paragraph","data":{"text":"ঘ. শিক্ষার্থী ও ফলাফল টেবিলের মধ্যে সম্পর্ক চিত্রসহ বর্ণনা কর।"},"id":"blk10005"}
    ]}'::jsonb, now(), now());

-- a CQ has NO option rows and NO MCQ key: ck_answer_keys_exactly_one_payload
-- forces the rubric, and C-5's MATCH SIMPLE lets the NULL mcq key through.
INSERT INTO answer_keys (id, version_id, cq_rubric, is_verified, verified_at, created_at, updated_at) VALUES
  ('b0000000-0000-4000-a000-000000000002', '60000000-0000-4000-a000-000000000002',
   '{"format":"cq_rubric","version":1,"parts":[
      {"label":"ক","maxMarks":1,"answer":"ডেটাবেজ হলো পরস্পর সম্পর্কযুক্ত তথ্যের সংগঠিত সংগ্রহ।"},
      {"label":"খ","maxMarks":2,"answer":"প্রাইমারি কি প্রতিটি রেকর্ডকে অদ্বিতীয়ভাবে শনাক্ত করে।"},
      {"label":"গ","maxMarks":3,"answer":"স্বাভাবিকীকরণের মাধ্যমে একই তথ্য একাধিকবার না রেখে রিডান্ডেন্সি কমানো হয়।"},
      {"label":"ঘ","maxMarks":4,"answer":"প্রাইমারি কি ও ফরেন কি সম্পর্কের ভিত্তি; চিত্রে শিক্ষার্থী → ফলাফল।"}
    ]}'::jsonb, true, now(), now(), now());

INSERT INTO question_version_assets (id, version_id, asset_id, block_ref, created_at) VALUES
  ('c0000000-0000-4000-a000-000000000002', '60000000-0000-4000-a000-000000000002',
   '90000000-0000-4000-a000-000000000002', '/content/blocks/4', now());

INSERT INTO question_tags (question_id, tag_id, created_at) VALUES
  ('70000000-0000-4000-a000-000000000002', '50000000-0000-4000-a000-000000000002', now());

-- COLLEGE provenance, attributed to a specific institution and year
INSERT INTO question_sources (id, question_id, source_type, college_id, academic_year_id, created_at) VALUES
  ('d0000000-0000-4000-a000-000000000003', '70000000-0000-4000-a000-000000000002', 'COLLEGE',
   '80000000-0000-4000-b000-000000000001', '80000000-0000-4000-c000-000000000002', now());

-- =====================================================================
-- a DRAFT question with no version yet, and a second draft version on the
-- published MCQ (a question may have one published version and many drafts)
-- =====================================================================
INSERT INTO questions (id, type, status, difficulty, created_via,
                       education_level_id, subject_id, chapter_id, topic_id,
                       marks, created_at, updated_at) VALUES
  ('70000000-0000-4000-a000-000000000003', 'MCQ', 'DRAFT', 'EASY', 'BULK_IMPORT',
   '00000000-0000-4000-a000-00000000000a',
   '00000000-0000-4000-b000-000000000001',
   '20000000-0000-4000-a000-000000000005',
   '30000000-0000-4000-a000-000000000003',
   1, now(), now());

INSERT INTO question_versions (id, question_id, version_number, status, content, created_at, updated_at) VALUES
  ('60000000-0000-4000-a000-000000000004', '70000000-0000-4000-a000-000000000003', 1, 'DRAFT',
   '{"format":"rich_blocks","version":1,"blocks":[
      {"type":"paragraph","data":{"text":"নিচের কোনটি প্রোগ্রামিং ভাষা?"},"id":"blk20001"}
    ]}'::jsonb, now(), now()),
  ('60000000-0000-4000-a000-000000000003', '70000000-0000-4000-a000-000000000001', 2, 'DRAFT',
   '{"format":"rich_blocks","version":1,"blocks":[
      {"type":"paragraph","data":{"text":"ই-মেইল ঠিকানায় @ চিহ্নের পরের অংশকে কী বলা হয়?"},"id":"blk30001"}
    ]}'::jsonb, now(), now());

INSERT INTO question_options (id, version_id, key, content, sort_order, created_at) VALUES
  ('a0000000-0000-4000-a000-000000000011', '60000000-0000-4000-a000-000000000003', 'ক',
   '{"format":"rich_blocks","version":1,"blocks":[{"type":"paragraph","data":{"text":"ইউজার নেম"},"id":"blk30002"}]}'::jsonb, 0, now()),
  ('a0000000-0000-4000-a000-000000000012', '60000000-0000-4000-a000-000000000003', 'খ',
   '{"format":"rich_blocks","version":1,"blocks":[{"type":"paragraph","data":{"text":"ডোমেইন নাম"},"id":"blk30003"}]}'::jsonb, 1, now()),
  ('a0000000-0000-4000-a000-000000000013', '60000000-0000-4000-a000-000000000003', 'গ',
   '{"format":"rich_blocks","version":1,"blocks":[{"type":"paragraph","data":{"text":"পাসওয়ার্ড"},"id":"blk30004"}]}'::jsonb, 2, now()),
  ('a0000000-0000-4000-a000-000000000014', '60000000-0000-4000-a000-000000000003', 'ঘ',
   '{"format":"rich_blocks","version":1,"blocks":[{"type":"paragraph","data":{"text":"প্রোটোকল"},"id":"blk30005"}]}'::jsonb, 3, now());

INSERT INTO answer_keys (id, version_id, mcq_correct_option_key, is_verified, created_at, updated_at) VALUES
  ('b0000000-0000-4000-a000-000000000003', '60000000-0000-4000-a000-000000000003', 'খ', false, now(), now());

-- a retired topic, so the active-only partial unique can be exercised later
INSERT INTO topics (id, chapter_id, name_bn, name_en, order_index, is_active, created_at, updated_at) VALUES
  ('30000000-0000-4000-a000-000000000099', '20000000-0000-4000-a000-000000000003', 'পুরাতন টপিক', 'Retired Topic', 5, false, now(), now());

COMMIT;
