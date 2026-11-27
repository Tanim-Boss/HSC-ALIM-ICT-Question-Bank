# Phase 04D — staff list: AFTER (migration 0003 + service changes)

> **Machine-generated.** Every plan below was captured by
> `scripts/db/perf-list-questions.ts` from a live PostgreSQL server that ran
> the statements `listQuestionsForStaff` issues. Nothing in this file was
> typed by hand; re-running the harness reproduces it.

## Environment

| Fact | Value |
| --- | --- |
| PostgreSQL | 16.16 |
| Database | ict_perf_04d @ 127.0.0.1:55432 (disposable, loopback) |
| Database size | 392 MB |
| Collation (lc_collate) | C.UTF-8 |
| Rows | questions=50000, question_versions=150212 |
| Dataset | scripts/db/seed-perf.ts, fixed seed 0x04d2026 (50,000 questions, ~3 versions each) |
| search_text column | present |
| default_statistics_target | 100 |
| effective_cache_size | 524288 8kB |
| jit | on |
| maintenance_work_mem | 262144 kB |
| max_parallel_workers_per_gather | 2 |
| random_page_cost | 4 |
| seq_page_cost | 1 |
| shared_buffers | 65536 8kB |
| work_mem | 65536 kB |

## Summary

| Case | Page query median | Full path median | EXPLAIN execution | Planning | Driving scan (estimated → actual rows) | Buffers (hit/read) | Sorts | Index used |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1. No filter | 0.73 ms | 1.97 ms | 0.02 ms | 0.04 ms | — ? → ? | 8/0 | 0 | ix_questions_created_at_id |
| 2. Chapter only | 0.48 ms | 1.82 ms | 0.04 ms | 0.05 ms | — ? → ? | 14/0 | 0 | ix_questions_created_at_id |
| 3. Chapter + type + status | 0.57 ms | 1.99 ms | 0.07 ms | 0.09 ms | — ? → ? | 16/0 | 0 | ix_questions_created_at_id |
| 4. Board + academic year | 4.12 ms | 5.46 ms | 4.79 ms | 0.28 ms | — ? → ? | 17021/0 | 0 | ix_questions_created_at_id, ix_question_sources_question_id |
| 5. Tag | 0.97 ms | 2.45 ms | 0.53 ms | 0.17 ms | — ? → ? | 2003/0 | 0 | ix_questions_created_at_id, question_tags_pkey |
| 6. Cursor pagination at page 50 | 0.65 ms | 1.83 ms | 0.22 ms | 0.08 ms | — ? → ? | 81/0 | 0 | ix_questions_created_at_id |
| 7. College only (added by 04D) | 1.04 ms | 2.94 ms | 0.54 ms | 0.18 ms | Bitmap Heap Scan, Bitmap Index Scan 155 → 135 | 2279/0 | 1 | questions_pkey, ix_question_sources_college_id |
| 8a. Search: "computer" (04D, English word) | 1.16 ms | 2.42 ms | 0.55 ms | 0.37 ms | — ? → ? | 1650/0 | 0 | ix_questions_created_at_id, ix_question_versions_question_id |
| 8b. Search: "কম্পিউটার" (04D, Bangla word) | 1.43 ms | 2.71 ms | 0.71 ms | 0.33 ms | — ? → ? | 2046/0 | 0 | ix_questions_created_at_id, ix_question_versions_question_id |
| 8c. Search: "ক্ষ" (04D, Bangla conjunct, partial) | 1.12 ms | 2.37 ms | 0.41 ms | 0.29 ms | — ? → ? | 1248/0 | 0 | ix_questions_created_at_id, ix_question_versions_question_id |
| 8d. Search: "html ওয়েব" (04D, mixed Bangla + English) | 2.98 ms | 4.36 ms | 2.41 ms | 0.47 ms | — ? → ? | 7005/0 | 0 | ix_questions_created_at_id, ix_question_versions_question_id |
| 8e. Search: a token that matches nothing (04D) | 1.78 ms | 2.23 ms | 1.29 ms | 0.33 ms | Bitmap Heap Scan, Bitmap Index Scan 2 → 0 | 1230/0 | 2 | questions_pkey, ix_question_versions_search_text_trgm |
| 8f. Search: a token that exists only in option text (04D) | 13.98 ms | 16.34 ms | 13.44 ms | 0.40 ms | — ? → ? | 42297/0 | 0 | ix_questions_created_at_id, ix_question_versions_question_id |


## Index inventory at measurement time

Sizes are `pg_relation_size` in this database, listed largest first within each table.

```sql
-- 5784 kB
answer_keys_pkey: CREATE UNIQUE INDEX answer_keys_pkey ON public.answer_keys USING btree (id)
-- 5784 kB
uq_answer_keys_version: CREATE UNIQUE INDEX uq_answer_keys_version ON public.answer_keys USING btree (version_id)
-- 21 MB
uq_question_options_version_key: CREATE UNIQUE INDEX uq_question_options_version_key ON public.question_options USING btree (version_id, key)
-- 17 MB
question_options_pkey: CREATE UNIQUE INDEX question_options_pkey ON public.question_options USING btree (id)
-- 8280 kB
ix_question_options_version_id: CREATE INDEX ix_question_options_version_id ON public.question_options USING btree (version_id)
-- 5896 kB
uq_question_sources_identity: CREATE UNIQUE INDEX uq_question_sources_identity ON public.question_sources USING btree (question_id, source_type, board_id, college_id, academic_year_id) NULLS NOT DISTINCT
-- 2320 kB
ix_question_sources_question_id: CREATE INDEX ix_question_sources_question_id ON public.question_sources USING btree (question_id)
-- 2304 kB
question_sources_pkey: CREATE UNIQUE INDEX question_sources_pkey ON public.question_sources USING btree (id)
-- 528 kB
ix_question_sources_board_id_academic_year_id: CREATE INDEX ix_question_sources_board_id_academic_year_id ON public.question_sources USING btree (board_id, academic_year_id)
-- 488 kB
ix_question_sources_college_id: CREATE INDEX ix_question_sources_college_id ON public.question_sources USING btree (college_id)
-- 432 kB
ix_question_sources_academic_year_id: CREATE INDEX ix_question_sources_academic_year_id ON public.question_sources USING btree (academic_year_id)
-- 432 kB
ix_question_sources_board_id: CREATE INDEX ix_question_sources_board_id ON public.question_sources USING btree (board_id)
-- 384 kB
ix_question_sources_source_type: CREATE INDEX ix_question_sources_source_type ON public.question_sources USING btree (source_type)
-- 6024 kB
question_tags_pkey: CREATE UNIQUE INDEX question_tags_pkey ON public.question_tags USING btree (question_id, tag_id)
-- 768 kB
ix_question_tags_tag_id: CREATE INDEX ix_question_tags_tag_id ON public.question_tags USING btree (tag_id)
-- 33 MB
ix_question_versions_search_text_trgm: CREATE INDEX ix_question_versions_search_text_trgm ON public.question_versions USING gin (search_text gin_trgm_ops)
-- 7864 kB
uq_question_versions_question_number: CREATE UNIQUE INDEX uq_question_versions_question_number ON public.question_versions USING btree (question_id, version_number)
-- 5992 kB
ix_question_versions_question_id_status: CREATE INDEX ix_question_versions_question_id_status ON public.question_versions USING btree (question_id, status)
-- 5784 kB
question_versions_pkey: CREATE UNIQUE INDEX question_versions_pkey ON public.question_versions USING btree (id)
-- 3792 kB
ix_question_versions_question_id: CREATE INDEX ix_question_versions_question_id ON public.question_versions USING btree (question_id)
-- 1544 kB
uq_question_versions_one_published_per_question: CREATE UNIQUE INDEX uq_question_versions_one_published_per_question ON public.question_versions USING btree (question_id) WHERE (status = 'PUBLISHED'::"VersionStatus")
-- 968 kB
ix_question_versions_status: CREATE INDEX ix_question_versions_status ON public.question_versions USING btree (status)
-- 3576 kB
ix_questions_created_at_id: CREATE INDEX ix_questions_created_at_id ON public.questions USING btree (created_at DESC, id DESC)
-- 2240 kB
questions_pkey: CREATE UNIQUE INDEX questions_pkey ON public.questions USING btree (id)
-- 408 kB
ix_questions_subject_id_chapter_id_topic_id: CREATE INDEX ix_questions_subject_id_chapter_id_topic_id ON public.questions USING btree (subject_id, chapter_id, topic_id)
-- 392 kB
ix_questions_status_type_difficulty: CREATE INDEX ix_questions_status_type_difficulty ON public.questions USING btree (status, type, difficulty)
-- 352 kB
ix_questions_chapter_id: CREATE INDEX ix_questions_chapter_id ON public.questions USING btree (chapter_id)
-- 352 kB
ix_questions_type_status: CREATE INDEX ix_questions_type_status ON public.questions USING btree (type, status)
-- 336 kB
ix_questions_education_level_id: CREATE INDEX ix_questions_education_level_id ON public.questions USING btree (education_level_id)
-- 336 kB
ix_questions_education_level_id_subject_id: CREATE INDEX ix_questions_education_level_id_subject_id ON public.questions USING btree (education_level_id, subject_id)
-- 336 kB
ix_questions_subject_id: CREATE INDEX ix_questions_subject_id ON public.questions USING btree (subject_id)
-- 336 kB
ix_questions_subtopic_id: CREATE INDEX ix_questions_subtopic_id ON public.questions USING btree (subtopic_id)
-- 336 kB
ix_questions_topic_id: CREATE INDEX ix_questions_topic_id ON public.questions USING btree (topic_id)
```

## Cases

### 1. No filter

The default staff list: newest 20 questions overall.

Spec: `{"searchTokens":[],"limit":20}`

Driving scan: —, estimated ? rows, actual ? rows.

**Page query** — median wall 0.73 ms over 15 runs (best 0.53 ms); EXPLAIN execution 0.023 ms, planning 0.037 ms; buffers shared hit=8 read=0; sorts=0; indexes=ix_questions_created_at_id. Full staff-list path (page + tag + version loads) median 1.97 ms.

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — page query (questions.findMany)</summary>

```sql
SELECT id, type, status, difficulty, marks, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, created_at, updated_at
FROM questions q

ORDER BY q.created_at DESC, q.id DESC
LIMIT $1
-- parameters: [21]
```

```
Limit  (cost=0.41..2.38 rows=21 width=128) (actual time=0.007..0.014 rows=21 loops=1)
  Buffers: shared hit=4
  ->  Index Scan using ix_questions_created_at_id on questions q  (cost=0.41..4676.85 rows=50000 width=128) (actual time=0.007..0.012 rows=21 loops=1)
        Buffers: shared hit=4
Planning Time: 0.037 ms
Execution Time: 0.023 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — tag load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, tag_id
FROM question_tags
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
-- parameters: ["091119cc-a941-47e9-81d9-76dfa15220f0","23aee65a-400d-4e90-88c5-114b29be7601","3c289cdd-6d93-4f2e-a221-2a323fd82d1c","e3bbdec9-fa8e-4455-8127-7057d39ad860","60a6d883-fb8c-4ff0-a958-ad4617caed2c","f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c","73907810-dc0e-4a63-aa38-8ca345f97c06","0503d90c-b4e0-4c14-931d-dfe048b5c65b","62ade9fe-9e81-4f7a-be89-5bfb793615fe","8c1b97cc-7353-4a0c-bce7-85d9f8b5ede7","7d0eb37a-77cb-452a-a40a-4c4b4a4a5f15","36871fd5-afee-46fd-bde2-351d1d10bbaf","40aec041-3111-4491-afad-4aefd56207a0","58ab466d-84f0-41f1-9f95-f9d2e7069744","dd4812c6-fb92-4855-84f9-1d2324f1ad88","22748037-69d7-4ca5-a324-df4a06bb40f3","c0342104-346c-4ae3-a836-8af8e7e6cddd","af0845a8-072a-49ef-8c58-f455728507da","c1a58320-bf73-4660-a74c-e35970a18364","cb7a3ede-9a77-4bca-a9a7-226dbcbc2363","4e127561-8f40-41e3-88bf-7a435df0a172"]
```

```
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..161.54 rows=46 width=32) (actual time=0.011..0.061 rows=45 loops=1)
  Index Cond: (question_id = ANY ('{091119cc-a941-47e9-81d9-76dfa15220f0,23aee65a-400d-4e90-88c5-114b29be7601,3c289cdd-6d93-4f2e-a221-2a323fd82d1c,e3bbdec9-fa8e-4455-8127-7057d39ad860,60a6d883-fb8c-4ff0-a958-ad4617caed2c,f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,73907810-dc0e-4a63-aa38-8ca345f97c06,0503d90c-b4e0-4c14-931d-dfe048b5c65b,62ade9fe-9e81-4f7a-be89-5bfb793615fe,8c1b97cc-7353-4a0c-bce7-85d9f8b5ede7,7d0eb37a-77cb-452a-a40a-4c4b4a4a5f15,36871fd5-afee-46fd-bde2-351d1d10bbaf,40aec041-3111-4491-afad-4aefd56207a0,58ab466d-84f0-41f1-9f95-f9d2e7069744,dd4812c6-fb92-4855-84f9-1d2324f1ad88,22748037-69d7-4ca5-a324-df4a06bb40f3,c0342104-346c-4ae3-a836-8af8e7e6cddd,af0845a8-072a-49ef-8c58-f455728507da,c1a58320-bf73-4660-a74c-e35970a18364,cb7a3ede-9a77-4bca-a9a7-226dbcbc2363,4e127561-8f40-41e3-88bf-7a435df0a172}'::uuid[]))
  Heap Fetches: 45
  Buffers: shared hit=65
Planning Time: 0.038 ms
Execution Time: 0.068 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — version load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, id, version_number, status, updated_at
FROM question_versions
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
ORDER BY question_id ASC, version_number DESC
-- parameters: ["091119cc-a941-47e9-81d9-76dfa15220f0","23aee65a-400d-4e90-88c5-114b29be7601","3c289cdd-6d93-4f2e-a221-2a323fd82d1c","e3bbdec9-fa8e-4455-8127-7057d39ad860","60a6d883-fb8c-4ff0-a958-ad4617caed2c","f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c","73907810-dc0e-4a63-aa38-8ca345f97c06","0503d90c-b4e0-4c14-931d-dfe048b5c65b","62ade9fe-9e81-4f7a-be89-5bfb793615fe","8c1b97cc-7353-4a0c-bce7-85d9f8b5ede7","7d0eb37a-77cb-452a-a40a-4c4b4a4a5f15","36871fd5-afee-46fd-bde2-351d1d10bbaf","40aec041-3111-4491-afad-4aefd56207a0","58ab466d-84f0-41f1-9f95-f9d2e7069744","dd4812c6-fb92-4855-84f9-1d2324f1ad88","22748037-69d7-4ca5-a324-df4a06bb40f3","c0342104-346c-4ae3-a836-8af8e7e6cddd","af0845a8-072a-49ef-8c58-f455728507da","c1a58320-bf73-4660-a74c-e35970a18364","cb7a3ede-9a77-4bca-a9a7-226dbcbc2363","4e127561-8f40-41e3-88bf-7a435df0a172"]
```

```
Sort  (cost=344.54..344.70 rows=66 width=48) (actual time=0.106..0.111 rows=68 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=69
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..342.54 rows=66 width=48) (actual time=0.057..0.078 rows=68 loops=1)
        Recheck Cond: (question_id = ANY ('{091119cc-a941-47e9-81d9-76dfa15220f0,23aee65a-400d-4e90-88c5-114b29be7601,3c289cdd-6d93-4f2e-a221-2a323fd82d1c,e3bbdec9-fa8e-4455-8127-7057d39ad860,60a6d883-fb8c-4ff0-a958-ad4617caed2c,f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,73907810-dc0e-4a63-aa38-8ca345f97c06,0503d90c-b4e0-4c14-931d-dfe048b5c65b,62ade9fe-9e81-4f7a-be89-5bfb793615fe,8c1b97cc-7353-4a0c-bce7-85d9f8b5ede7,7d0eb37a-77cb-452a-a40a-4c4b4a4a5f15,36871fd5-afee-46fd-bde2-351d1d10bbaf,40aec041-3111-4491-afad-4aefd56207a0,58ab466d-84f0-41f1-9f95-f9d2e7069744,dd4812c6-fb92-4855-84f9-1d2324f1ad88,22748037-69d7-4ca5-a324-df4a06bb40f3,c0342104-346c-4ae3-a836-8af8e7e6cddd,af0845a8-072a-49ef-8c58-f455728507da,c1a58320-bf73-4660-a74c-e35970a18364,cb7a3ede-9a77-4bca-a9a7-226dbcbc2363,4e127561-8f40-41e3-88bf-7a435df0a172}'::uuid[]))
        Heap Blocks: exact=6
        Buffers: shared hit=69
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=66 width=0) (actual time=0.051..0.051 rows=68 loops=1)
              Index Cond: (question_id = ANY ('{091119cc-a941-47e9-81d9-76dfa15220f0,23aee65a-400d-4e90-88c5-114b29be7601,3c289cdd-6d93-4f2e-a221-2a323fd82d1c,e3bbdec9-fa8e-4455-8127-7057d39ad860,60a6d883-fb8c-4ff0-a958-ad4617caed2c,f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,73907810-dc0e-4a63-aa38-8ca345f97c06,0503d90c-b4e0-4c14-931d-dfe048b5c65b,62ade9fe-9e81-4f7a-be89-5bfb793615fe,8c1b97cc-7353-4a0c-bce7-85d9f8b5ede7,7d0eb37a-77cb-452a-a40a-4c4b4a4a5f15,36871fd5-afee-46fd-bde2-351d1d10bbaf,40aec041-3111-4491-afad-4aefd56207a0,58ab466d-84f0-41f1-9f95-f9d2e7069744,dd4812c6-fb92-4855-84f9-1d2324f1ad88,22748037-69d7-4ca5-a324-df4a06bb40f3,c0342104-346c-4ae3-a836-8af8e7e6cddd,af0845a8-072a-49ef-8c58-f455728507da,c1a58320-bf73-4660-a74c-e35970a18364,cb7a3ede-9a77-4bca-a9a7-226dbcbc2363,4e127561-8f40-41e3-88bf-7a435df0a172}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.082 ms
Execution Time: 0.132 ms
```
</details>

### 2. Chapter only

One of six chapters — low selectivity (≈25% of the bank).

Spec: `{"chapterId":"1973255b-a315-45df-a9e2-80c3d0cc68ac","searchTokens":[],"limit":20}`

Driving scan: —, estimated ? rows, actual ? rows.

**Page query** — median wall 0.48 ms over 15 runs (best 0.43 ms); EXPLAIN execution 0.045 ms, planning 0.048 ms; buffers shared hit=14 read=0; sorts=0; indexes=ix_questions_created_at_id. Full staff-list path (page + tag + version loads) median 1.82 ms.

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — page query (questions.findMany)</summary>

```sql
SELECT id, type, status, difficulty, marks, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, created_at, updated_at
FROM questions q
WHERE q.chapter_id = $1::uuid
ORDER BY q.created_at DESC, q.id DESC
LIMIT $2
-- parameters: ["1973255b-a315-45df-a9e2-80c3d0cc68ac",21]
```

```
Limit  (cost=0.41..12.62 rows=21 width=128) (actual time=0.010..0.035 rows=21 loops=1)
  Buffers: shared hit=7
  ->  Index Scan using ix_questions_created_at_id on questions q  (cost=0.41..4801.85 rows=8262 width=128) (actual time=0.010..0.033 rows=21 loops=1)
        Filter: (chapter_id = '1973255b-a315-45df-a9e2-80c3d0cc68ac'::uuid)
        Rows Removed by Filter: 130
        Buffers: shared hit=7
Planning Time: 0.048 ms
Execution Time: 0.045 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — tag load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, tag_id
FROM question_tags
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
-- parameters: ["c1a58320-bf73-4660-a74c-e35970a18364","4e127561-8f40-41e3-88bf-7a435df0a172","6db11483-8728-49d1-b70c-a1c57f21f242","99fc2220-2c38-4b6d-af21-ff138f3fad2e","a073dcfe-10e1-4c3f-82be-fb3145ec43db","a0c75b12-e0d6-4268-87f0-0b86f96d6f7c","cbd344b9-fa16-4db2-a8d7-2071ecbba6c3","80ee2869-eb5f-4bda-97b7-770691d6ddac","6521a53d-7c69-41a3-8cbf-ba6775966082","23c48637-1cbc-48e9-a966-e0a1134badbe","9d6857ff-7672-48c1-b3ab-be8b281725b2","295260c6-692e-451e-b9b9-353c5c1386a3","1cbafb31-f230-4d3b-9920-899a62355908","210c0ea1-fa40-4f02-8615-55e242bc98f7","861ac719-0977-4a51-8f7f-c5e0aebce1ea","35533240-7c52-4f3e-bb96-6e424a24e496","2c7ac8c4-c153-442f-8581-5c93a3debfbe","6f78fd30-a7c2-441a-9664-ca3dbdacbd72","d9735c51-bce4-4ea7-b0a0-9ff9cfd2ceba","d837dba7-190c-4fb2-8565-9a02ff1ff3c7","05303e12-6dbf-4441-833f-ac2625a5664b"]
```

```
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..161.54 rows=46 width=32) (actual time=0.008..0.054 rows=47 loops=1)
  Index Cond: (question_id = ANY ('{c1a58320-bf73-4660-a74c-e35970a18364,4e127561-8f40-41e3-88bf-7a435df0a172,6db11483-8728-49d1-b70c-a1c57f21f242,99fc2220-2c38-4b6d-af21-ff138f3fad2e,a073dcfe-10e1-4c3f-82be-fb3145ec43db,a0c75b12-e0d6-4268-87f0-0b86f96d6f7c,cbd344b9-fa16-4db2-a8d7-2071ecbba6c3,80ee2869-eb5f-4bda-97b7-770691d6ddac,6521a53d-7c69-41a3-8cbf-ba6775966082,23c48637-1cbc-48e9-a966-e0a1134badbe,9d6857ff-7672-48c1-b3ab-be8b281725b2,295260c6-692e-451e-b9b9-353c5c1386a3,1cbafb31-f230-4d3b-9920-899a62355908,210c0ea1-fa40-4f02-8615-55e242bc98f7,861ac719-0977-4a51-8f7f-c5e0aebce1ea,35533240-7c52-4f3e-bb96-6e424a24e496,2c7ac8c4-c153-442f-8581-5c93a3debfbe,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,d9735c51-bce4-4ea7-b0a0-9ff9cfd2ceba,d837dba7-190c-4fb2-8565-9a02ff1ff3c7,05303e12-6dbf-4441-833f-ac2625a5664b}'::uuid[]))
  Heap Fetches: 47
  Buffers: shared hit=77
Planning Time: 0.033 ms
Execution Time: 0.061 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — version load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, id, version_number, status, updated_at
FROM question_versions
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
ORDER BY question_id ASC, version_number DESC
-- parameters: ["c1a58320-bf73-4660-a74c-e35970a18364","4e127561-8f40-41e3-88bf-7a435df0a172","6db11483-8728-49d1-b70c-a1c57f21f242","99fc2220-2c38-4b6d-af21-ff138f3fad2e","a073dcfe-10e1-4c3f-82be-fb3145ec43db","a0c75b12-e0d6-4268-87f0-0b86f96d6f7c","cbd344b9-fa16-4db2-a8d7-2071ecbba6c3","80ee2869-eb5f-4bda-97b7-770691d6ddac","6521a53d-7c69-41a3-8cbf-ba6775966082","23c48637-1cbc-48e9-a966-e0a1134badbe","9d6857ff-7672-48c1-b3ab-be8b281725b2","295260c6-692e-451e-b9b9-353c5c1386a3","1cbafb31-f230-4d3b-9920-899a62355908","210c0ea1-fa40-4f02-8615-55e242bc98f7","861ac719-0977-4a51-8f7f-c5e0aebce1ea","35533240-7c52-4f3e-bb96-6e424a24e496","2c7ac8c4-c153-442f-8581-5c93a3debfbe","6f78fd30-a7c2-441a-9664-ca3dbdacbd72","d9735c51-bce4-4ea7-b0a0-9ff9cfd2ceba","d837dba7-190c-4fb2-8565-9a02ff1ff3c7","05303e12-6dbf-4441-833f-ac2625a5664b"]
```

```
Sort  (cost=344.54..344.70 rows=66 width=48) (actual time=0.119..0.123 rows=67 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=86
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..342.54 rows=66 width=48) (actual time=0.070..0.100 rows=67 loops=1)
        Recheck Cond: (question_id = ANY ('{c1a58320-bf73-4660-a74c-e35970a18364,4e127561-8f40-41e3-88bf-7a435df0a172,6db11483-8728-49d1-b70c-a1c57f21f242,99fc2220-2c38-4b6d-af21-ff138f3fad2e,a073dcfe-10e1-4c3f-82be-fb3145ec43db,a0c75b12-e0d6-4268-87f0-0b86f96d6f7c,cbd344b9-fa16-4db2-a8d7-2071ecbba6c3,80ee2869-eb5f-4bda-97b7-770691d6ddac,6521a53d-7c69-41a3-8cbf-ba6775966082,23c48637-1cbc-48e9-a966-e0a1134badbe,9d6857ff-7672-48c1-b3ab-be8b281725b2,295260c6-692e-451e-b9b9-353c5c1386a3,1cbafb31-f230-4d3b-9920-899a62355908,210c0ea1-fa40-4f02-8615-55e242bc98f7,861ac719-0977-4a51-8f7f-c5e0aebce1ea,35533240-7c52-4f3e-bb96-6e424a24e496,2c7ac8c4-c153-442f-8581-5c93a3debfbe,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,d9735c51-bce4-4ea7-b0a0-9ff9cfd2ceba,d837dba7-190c-4fb2-8565-9a02ff1ff3c7,05303e12-6dbf-4441-833f-ac2625a5664b}'::uuid[]))
        Heap Blocks: exact=23
        Buffers: shared hit=86
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=66 width=0) (actual time=0.065..0.065 rows=67 loops=1)
              Index Cond: (question_id = ANY ('{c1a58320-bf73-4660-a74c-e35970a18364,4e127561-8f40-41e3-88bf-7a435df0a172,6db11483-8728-49d1-b70c-a1c57f21f242,99fc2220-2c38-4b6d-af21-ff138f3fad2e,a073dcfe-10e1-4c3f-82be-fb3145ec43db,a0c75b12-e0d6-4268-87f0-0b86f96d6f7c,cbd344b9-fa16-4db2-a8d7-2071ecbba6c3,80ee2869-eb5f-4bda-97b7-770691d6ddac,6521a53d-7c69-41a3-8cbf-ba6775966082,23c48637-1cbc-48e9-a966-e0a1134badbe,9d6857ff-7672-48c1-b3ab-be8b281725b2,295260c6-692e-451e-b9b9-353c5c1386a3,1cbafb31-f230-4d3b-9920-899a62355908,210c0ea1-fa40-4f02-8615-55e242bc98f7,861ac719-0977-4a51-8f7f-c5e0aebce1ea,35533240-7c52-4f3e-bb96-6e424a24e496,2c7ac8c4-c153-442f-8581-5c93a3debfbe,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,d9735c51-bce4-4ea7-b0a0-9ff9cfd2ceba,d837dba7-190c-4fb2-8565-9a02ff1ff3c7,05303e12-6dbf-4441-833f-ac2625a5664b}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.055 ms
Execution Time: 0.136 ms
```
</details>

### 3. Chapter + type + status

Chapter 3 + MCQ + PUBLISHED: the common authoring screen.

Spec: `{"chapterId":"1973255b-a315-45df-a9e2-80c3d0cc68ac","type":"MCQ","status":"PUBLISHED","searchTokens":[],"limit":20}`

Driving scan: —, estimated ? rows, actual ? rows.

**Page query** — median wall 0.57 ms over 15 runs (best 0.48 ms); EXPLAIN execution 0.066 ms, planning 0.094 ms; buffers shared hit=16 read=0; sorts=0; indexes=ix_questions_created_at_id. Full staff-list path (page + tag + version loads) median 1.99 ms.

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — page query (questions.findMany)</summary>

```sql
SELECT id, type, status, difficulty, marks, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, created_at, updated_at
FROM questions q
WHERE q.chapter_id = $1::uuid AND q.type = $2::"QuestionType" AND q.status = $3::"QuestionStatus"
ORDER BY q.created_at DESC, q.id DESC
LIMIT $4
-- parameters: ["1973255b-a315-45df-a9e2-80c3d0cc68ac","MCQ","PUBLISHED",21]
```

```
Limit  (cost=0.41..23.22 rows=21 width=128) (actual time=0.015..0.050 rows=21 loops=1)
  Buffers: shared hit=8
  ->  Index Scan using ix_questions_created_at_id on questions q  (cost=0.41..5051.85 rows=4652 width=128) (actual time=0.014..0.047 rows=21 loops=1)
        Filter: ((chapter_id = '1973255b-a315-45df-a9e2-80c3d0cc68ac'::uuid) AND (type = 'MCQ'::"QuestionType") AND (status = 'PUBLISHED'::"QuestionStatus"))
        Rows Removed by Filter: 175
        Buffers: shared hit=8
Planning Time: 0.094 ms
Execution Time: 0.066 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — tag load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, tag_id
FROM question_tags
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
-- parameters: ["4e127561-8f40-41e3-88bf-7a435df0a172","6db11483-8728-49d1-b70c-a1c57f21f242","99fc2220-2c38-4b6d-af21-ff138f3fad2e","a0c75b12-e0d6-4268-87f0-0b86f96d6f7c","80ee2869-eb5f-4bda-97b7-770691d6ddac","6521a53d-7c69-41a3-8cbf-ba6775966082","295260c6-692e-451e-b9b9-353c5c1386a3","1cbafb31-f230-4d3b-9920-899a62355908","861ac719-0977-4a51-8f7f-c5e0aebce1ea","35533240-7c52-4f3e-bb96-6e424a24e496","2c7ac8c4-c153-442f-8581-5c93a3debfbe","6f78fd30-a7c2-441a-9664-ca3dbdacbd72","d837dba7-190c-4fb2-8565-9a02ff1ff3c7","05303e12-6dbf-4441-833f-ac2625a5664b","628a9aac-deb3-4453-8ec7-0569fbabc162","1f0327c1-d6cc-485b-b538-d9b5ced58793","4ccd707e-1fcf-4403-8bef-f9c98df28378","7754a376-e394-40d6-8ae7-b79422eb1e8b","8a605900-150a-49b2-8908-84ffc4f91787","22797492-8e75-4eb1-a138-39722eb14ee8","1ec2b030-0622-4237-a2c4-43b686159c0d"]
```

```
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..161.54 rows=46 width=32) (actual time=0.017..0.082 rows=44 loops=1)
  Index Cond: (question_id = ANY ('{4e127561-8f40-41e3-88bf-7a435df0a172,6db11483-8728-49d1-b70c-a1c57f21f242,99fc2220-2c38-4b6d-af21-ff138f3fad2e,a0c75b12-e0d6-4268-87f0-0b86f96d6f7c,80ee2869-eb5f-4bda-97b7-770691d6ddac,6521a53d-7c69-41a3-8cbf-ba6775966082,295260c6-692e-451e-b9b9-353c5c1386a3,1cbafb31-f230-4d3b-9920-899a62355908,861ac719-0977-4a51-8f7f-c5e0aebce1ea,35533240-7c52-4f3e-bb96-6e424a24e496,2c7ac8c4-c153-442f-8581-5c93a3debfbe,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,d837dba7-190c-4fb2-8565-9a02ff1ff3c7,05303e12-6dbf-4441-833f-ac2625a5664b,628a9aac-deb3-4453-8ec7-0569fbabc162,1f0327c1-d6cc-485b-b538-d9b5ced58793,4ccd707e-1fcf-4403-8bef-f9c98df28378,7754a376-e394-40d6-8ae7-b79422eb1e8b,8a605900-150a-49b2-8908-84ffc4f91787,22797492-8e75-4eb1-a138-39722eb14ee8,1ec2b030-0622-4237-a2c4-43b686159c0d}'::uuid[]))
  Heap Fetches: 44
  Buffers: shared hit=81
Planning Time: 0.046 ms
Execution Time: 0.090 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — version load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, id, version_number, status, updated_at
FROM question_versions
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
ORDER BY question_id ASC, version_number DESC
-- parameters: ["4e127561-8f40-41e3-88bf-7a435df0a172","6db11483-8728-49d1-b70c-a1c57f21f242","99fc2220-2c38-4b6d-af21-ff138f3fad2e","a0c75b12-e0d6-4268-87f0-0b86f96d6f7c","80ee2869-eb5f-4bda-97b7-770691d6ddac","6521a53d-7c69-41a3-8cbf-ba6775966082","295260c6-692e-451e-b9b9-353c5c1386a3","1cbafb31-f230-4d3b-9920-899a62355908","861ac719-0977-4a51-8f7f-c5e0aebce1ea","35533240-7c52-4f3e-bb96-6e424a24e496","2c7ac8c4-c153-442f-8581-5c93a3debfbe","6f78fd30-a7c2-441a-9664-ca3dbdacbd72","d837dba7-190c-4fb2-8565-9a02ff1ff3c7","05303e12-6dbf-4441-833f-ac2625a5664b","628a9aac-deb3-4453-8ec7-0569fbabc162","1f0327c1-d6cc-485b-b538-d9b5ced58793","4ccd707e-1fcf-4403-8bef-f9c98df28378","7754a376-e394-40d6-8ae7-b79422eb1e8b","8a605900-150a-49b2-8908-84ffc4f91787","22797492-8e75-4eb1-a138-39722eb14ee8","1ec2b030-0622-4237-a2c4-43b686159c0d"]
```

```
Sort  (cost=344.54..344.70 rows=66 width=48) (actual time=0.092..0.095 rows=63 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=87
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..342.54 rows=66 width=48) (actual time=0.050..0.074 rows=63 loops=1)
        Recheck Cond: (question_id = ANY ('{4e127561-8f40-41e3-88bf-7a435df0a172,6db11483-8728-49d1-b70c-a1c57f21f242,99fc2220-2c38-4b6d-af21-ff138f3fad2e,a0c75b12-e0d6-4268-87f0-0b86f96d6f7c,80ee2869-eb5f-4bda-97b7-770691d6ddac,6521a53d-7c69-41a3-8cbf-ba6775966082,295260c6-692e-451e-b9b9-353c5c1386a3,1cbafb31-f230-4d3b-9920-899a62355908,861ac719-0977-4a51-8f7f-c5e0aebce1ea,35533240-7c52-4f3e-bb96-6e424a24e496,2c7ac8c4-c153-442f-8581-5c93a3debfbe,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,d837dba7-190c-4fb2-8565-9a02ff1ff3c7,05303e12-6dbf-4441-833f-ac2625a5664b,628a9aac-deb3-4453-8ec7-0569fbabc162,1f0327c1-d6cc-485b-b538-d9b5ced58793,4ccd707e-1fcf-4403-8bef-f9c98df28378,7754a376-e394-40d6-8ae7-b79422eb1e8b,8a605900-150a-49b2-8908-84ffc4f91787,22797492-8e75-4eb1-a138-39722eb14ee8,1ec2b030-0622-4237-a2c4-43b686159c0d}'::uuid[]))
        Heap Blocks: exact=24
        Buffers: shared hit=87
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=66 width=0) (actual time=0.045..0.045 rows=63 loops=1)
              Index Cond: (question_id = ANY ('{4e127561-8f40-41e3-88bf-7a435df0a172,6db11483-8728-49d1-b70c-a1c57f21f242,99fc2220-2c38-4b6d-af21-ff138f3fad2e,a0c75b12-e0d6-4268-87f0-0b86f96d6f7c,80ee2869-eb5f-4bda-97b7-770691d6ddac,6521a53d-7c69-41a3-8cbf-ba6775966082,295260c6-692e-451e-b9b9-353c5c1386a3,1cbafb31-f230-4d3b-9920-899a62355908,861ac719-0977-4a51-8f7f-c5e0aebce1ea,35533240-7c52-4f3e-bb96-6e424a24e496,2c7ac8c4-c153-442f-8581-5c93a3debfbe,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,d837dba7-190c-4fb2-8565-9a02ff1ff3c7,05303e12-6dbf-4441-833f-ac2625a5664b,628a9aac-deb3-4453-8ec7-0569fbabc162,1f0327c1-d6cc-485b-b538-d9b5ced58793,4ccd707e-1fcf-4403-8bef-f9c98df28378,7754a376-e394-40d6-8ae7-b79422eb1e8b,8a605900-150a-49b2-8908-84ffc4f91787,22797492-8e75-4eb1-a138-39722eb14ee8,1ec2b030-0622-4237-a2c4-43b686159c0d}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.057 ms
Execution Time: 0.145 ms
```
</details>

### 4. Board + academic year

Dhaka board 2023 — one attribution row must hold both.

Spec: `{"boardId":"675711ac-1448-4f1b-b367-db1e8a655d89","academicYearId":"50991b4f-0928-4203-810c-ebf203d0bca6","searchTokens":[],"limit":20}`

Driving scan: —, estimated ? rows, actual ? rows.

**Page query** — median wall 4.12 ms over 15 runs (best 3.64 ms); EXPLAIN execution 4.793 ms, planning 0.283 ms; buffers shared hit=17021 read=0; sorts=0; indexes=ix_questions_created_at_id, ix_question_sources_question_id. Full staff-list path (page + tag + version loads) median 5.46 ms.

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — page query (questions.findMany)</summary>

```sql
SELECT id, type, status, difficulty, marks, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, created_at, updated_at
FROM questions q
WHERE EXISTS (SELECT 1 FROM question_sources s WHERE s.question_id = q.id AND s.board_id = $1::uuid AND s.academic_year_id = $2::uuid)
ORDER BY q.created_at DESC, q.id DESC
LIMIT $3
-- parameters: ["675711ac-1448-4f1b-b367-db1e8a655d89","50991b4f-0928-4203-810c-ebf203d0bca6",21]
```

```
Limit  (cost=0.70..1251.98 rows=21 width=128) (actual time=0.467..4.769 rows=21 loops=1)
  Buffers: shared hit=5663
  ->  Nested Loop Semi Join  (cost=0.70..24489.96 rows=411 width=128) (actual time=0.466..4.763 rows=21 loops=1)
        Buffers: shared hit=5663
        ->  Index Scan using ix_questions_created_at_id on questions q  (cost=0.41..4676.85 rows=50000 width=128) (actual time=0.006..0.447 rows=1864 loops=1)
              Buffers: shared hit=66
        ->  Index Scan using ix_question_sources_question_id on question_sources s  (cost=0.29..0.40 rows=1 width=16) (actual time=0.002..0.002 rows=0 loops=1864)
              Index Cond: (question_id = q.id)
              Filter: ((board_id = '675711ac-1448-4f1b-b367-db1e8a655d89'::uuid) AND (academic_year_id = '50991b4f-0928-4203-810c-ebf203d0bca6'::uuid))
              Rows Removed by Filter: 1
              Buffers: shared hit=5597
Planning:
  Buffers: shared hit=32
Planning Time: 0.283 ms
Execution Time: 4.793 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — tag load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, tag_id
FROM question_tags
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
-- parameters: ["3f49b9c4-a88f-4bf1-87b7-2b041c6a3834","fe22857f-96c5-49f3-9302-00d1932ceb64","290b2815-2f38-405b-bdd8-c1e79525357c","6b870afc-d7e2-4c68-8deb-dbb57db7f5a9","431bf4d1-af0a-469e-bc37-6bee18fa68ee","702f9e0c-89b0-4d06-94e5-28860b74618d","9cc51908-ae87-4049-97ae-ad99496fdf3f","fe11e470-1b79-477f-b550-477a8e4e2cc1","ed6f6956-298e-462a-8bb7-6e8dd3e89710","f4a2ce43-f709-4466-887c-a2d34812f227","89023c47-f0d1-430e-9b8a-e782d27f9bc1","6cded56b-be11-4988-99bf-7ca142fec41a","34eda702-f218-4000-b26a-203edf011e55","66631f98-895a-48e9-81a6-27b67a9dc676","97d47107-4998-448b-8b26-cab83a7a7f8e","7c750659-1929-4605-8b2d-6e9ad23a9b1a","988d4491-62af-4b8d-a2f0-e83a6f0d109f","8fe91ba3-e451-4b2b-b61b-60626ab492c6","6fde7fa0-d1af-4b3f-9e78-9b6affaf8ec2","2cf716f6-6000-44e2-a05c-6759bd0f91a4","d1393ae1-e2b7-46d8-89b4-8060ff540b73"]
```

```
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..161.54 rows=46 width=32) (actual time=0.010..0.065 rows=45 loops=1)
  Index Cond: (question_id = ANY ('{3f49b9c4-a88f-4bf1-87b7-2b041c6a3834,fe22857f-96c5-49f3-9302-00d1932ceb64,290b2815-2f38-405b-bdd8-c1e79525357c,6b870afc-d7e2-4c68-8deb-dbb57db7f5a9,431bf4d1-af0a-469e-bc37-6bee18fa68ee,702f9e0c-89b0-4d06-94e5-28860b74618d,9cc51908-ae87-4049-97ae-ad99496fdf3f,fe11e470-1b79-477f-b550-477a8e4e2cc1,ed6f6956-298e-462a-8bb7-6e8dd3e89710,f4a2ce43-f709-4466-887c-a2d34812f227,89023c47-f0d1-430e-9b8a-e782d27f9bc1,6cded56b-be11-4988-99bf-7ca142fec41a,34eda702-f218-4000-b26a-203edf011e55,66631f98-895a-48e9-81a6-27b67a9dc676,97d47107-4998-448b-8b26-cab83a7a7f8e,7c750659-1929-4605-8b2d-6e9ad23a9b1a,988d4491-62af-4b8d-a2f0-e83a6f0d109f,8fe91ba3-e451-4b2b-b61b-60626ab492c6,6fde7fa0-d1af-4b3f-9e78-9b6affaf8ec2,2cf716f6-6000-44e2-a05c-6759bd0f91a4,d1393ae1-e2b7-46d8-89b4-8060ff540b73}'::uuid[]))
  Heap Fetches: 45
  Buffers: shared hit=84
Planning Time: 0.039 ms
Execution Time: 0.072 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — version load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, id, version_number, status, updated_at
FROM question_versions
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
ORDER BY question_id ASC, version_number DESC
-- parameters: ["3f49b9c4-a88f-4bf1-87b7-2b041c6a3834","fe22857f-96c5-49f3-9302-00d1932ceb64","290b2815-2f38-405b-bdd8-c1e79525357c","6b870afc-d7e2-4c68-8deb-dbb57db7f5a9","431bf4d1-af0a-469e-bc37-6bee18fa68ee","702f9e0c-89b0-4d06-94e5-28860b74618d","9cc51908-ae87-4049-97ae-ad99496fdf3f","fe11e470-1b79-477f-b550-477a8e4e2cc1","ed6f6956-298e-462a-8bb7-6e8dd3e89710","f4a2ce43-f709-4466-887c-a2d34812f227","89023c47-f0d1-430e-9b8a-e782d27f9bc1","6cded56b-be11-4988-99bf-7ca142fec41a","34eda702-f218-4000-b26a-203edf011e55","66631f98-895a-48e9-81a6-27b67a9dc676","97d47107-4998-448b-8b26-cab83a7a7f8e","7c750659-1929-4605-8b2d-6e9ad23a9b1a","988d4491-62af-4b8d-a2f0-e83a6f0d109f","8fe91ba3-e451-4b2b-b61b-60626ab492c6","6fde7fa0-d1af-4b3f-9e78-9b6affaf8ec2","2cf716f6-6000-44e2-a05c-6759bd0f91a4","d1393ae1-e2b7-46d8-89b4-8060ff540b73"]
```

```
Sort  (cost=344.54..344.70 rows=66 width=48) (actual time=0.120..0.123 rows=63 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=86
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..342.54 rows=66 width=48) (actual time=0.063..0.097 rows=63 loops=1)
        Recheck Cond: (question_id = ANY ('{3f49b9c4-a88f-4bf1-87b7-2b041c6a3834,fe22857f-96c5-49f3-9302-00d1932ceb64,290b2815-2f38-405b-bdd8-c1e79525357c,6b870afc-d7e2-4c68-8deb-dbb57db7f5a9,431bf4d1-af0a-469e-bc37-6bee18fa68ee,702f9e0c-89b0-4d06-94e5-28860b74618d,9cc51908-ae87-4049-97ae-ad99496fdf3f,fe11e470-1b79-477f-b550-477a8e4e2cc1,ed6f6956-298e-462a-8bb7-6e8dd3e89710,f4a2ce43-f709-4466-887c-a2d34812f227,89023c47-f0d1-430e-9b8a-e782d27f9bc1,6cded56b-be11-4988-99bf-7ca142fec41a,34eda702-f218-4000-b26a-203edf011e55,66631f98-895a-48e9-81a6-27b67a9dc676,97d47107-4998-448b-8b26-cab83a7a7f8e,7c750659-1929-4605-8b2d-6e9ad23a9b1a,988d4491-62af-4b8d-a2f0-e83a6f0d109f,8fe91ba3-e451-4b2b-b61b-60626ab492c6,6fde7fa0-d1af-4b3f-9e78-9b6affaf8ec2,2cf716f6-6000-44e2-a05c-6759bd0f91a4,d1393ae1-e2b7-46d8-89b4-8060ff540b73}'::uuid[]))
        Heap Blocks: exact=23
        Buffers: shared hit=86
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=66 width=0) (actual time=0.058..0.058 rows=63 loops=1)
              Index Cond: (question_id = ANY ('{3f49b9c4-a88f-4bf1-87b7-2b041c6a3834,fe22857f-96c5-49f3-9302-00d1932ceb64,290b2815-2f38-405b-bdd8-c1e79525357c,6b870afc-d7e2-4c68-8deb-dbb57db7f5a9,431bf4d1-af0a-469e-bc37-6bee18fa68ee,702f9e0c-89b0-4d06-94e5-28860b74618d,9cc51908-ae87-4049-97ae-ad99496fdf3f,fe11e470-1b79-477f-b550-477a8e4e2cc1,ed6f6956-298e-462a-8bb7-6e8dd3e89710,f4a2ce43-f709-4466-887c-a2d34812f227,89023c47-f0d1-430e-9b8a-e782d27f9bc1,6cded56b-be11-4988-99bf-7ca142fec41a,34eda702-f218-4000-b26a-203edf011e55,66631f98-895a-48e9-81a6-27b67a9dc676,97d47107-4998-448b-8b26-cab83a7a7f8e,7c750659-1929-4605-8b2d-6e9ad23a9b1a,988d4491-62af-4b8d-a2f0-e83a6f0d109f,8fe91ba3-e451-4b2b-b61b-60626ab492c6,6fde7fa0-d1af-4b3f-9e78-9b6affaf8ec2,2cf716f6-6000-44e2-a05c-6759bd0f91a4,d1393ae1-e2b7-46d8-89b4-8060ff540b73}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.064 ms
Execution Time: 0.137 ms
```
</details>

### 5. Tag

A single tag with the long tail: most questions carry one or two.

Spec: `{"tagId":"68837aba-b272-40a0-95f0-f9c162a44821","searchTokens":[],"limit":20}`

Driving scan: —, estimated ? rows, actual ? rows.

**Page query** — median wall 0.97 ms over 15 runs (best 0.90 ms); EXPLAIN execution 0.534 ms, planning 0.169 ms; buffers shared hit=2003 read=0; sorts=0; indexes=ix_questions_created_at_id, question_tags_pkey. Full staff-list path (page + tag + version loads) median 2.45 ms.

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — page query (questions.findMany)</summary>

```sql
SELECT id, type, status, difficulty, marks, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, created_at, updated_at
FROM questions q
WHERE EXISTS (SELECT 1 FROM question_tags t WHERE t.question_id = q.id AND t.tag_id = $1::uuid)
ORDER BY q.created_at DESC, q.id DESC
LIMIT $2
-- parameters: ["68837aba-b272-40a0-95f0-f9c162a44821",21]
```

```
Limit  (cost=0.83..105.66 rows=21 width=128) (actual time=0.023..0.518 rows=21 loops=1)
  Buffers: shared hit=657
  ->  Nested Loop  (cost=0.83..30719.75 rows=6154 width=128) (actual time=0.022..0.515 rows=21 loops=1)
        Buffers: shared hit=657
        ->  Index Scan using ix_questions_created_at_id on questions q  (cost=0.41..4676.85 rows=50000 width=128) (actual time=0.005..0.037 rows=209 loops=1)
              Buffers: shared hit=8
        ->  Index Only Scan using question_tags_pkey on question_tags t  (cost=0.42..0.52 rows=1 width=16) (actual time=0.002..0.002 rows=0 loops=209)
              Index Cond: ((question_id = q.id) AND (tag_id = '68837aba-b272-40a0-95f0-f9c162a44821'::uuid))
              Heap Fetches: 21
              Buffers: shared hit=649
Planning:
  Buffers: shared hit=32
Planning Time: 0.169 ms
Execution Time: 0.534 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — tag load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, tag_id
FROM question_tags
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
-- parameters: ["f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c","0503d90c-b4e0-4c14-931d-dfe048b5c65b","1c581dd0-66a4-4b0c-bf50-56d891f6de10","6f56ef5a-1ae8-4c31-adb3-fd09b932ba93","cbd344b9-fa16-4db2-a8d7-2071ecbba6c3","d249e358-6b60-4ce7-805b-b539dae1dac7","a02f6575-3fd2-4229-80fc-6ecbc450c53e","835f2092-6af7-42f1-b974-3748d95265cd","74a245ac-3c31-42b1-95f8-24b08d9325cd","4dc28e05-4b2c-4236-8a6c-6ee4f3b1b11b","98cf2ba1-f2c7-41ef-b09d-9d6696d5cad2","d9abbc7c-c0a2-4249-8408-402dc8d06aa9","6f78fd30-a7c2-441a-9664-ca3dbdacbd72","813cee6f-dc74-4294-931a-67ad7986a8c2","aab27f5d-0441-4cd1-9024-e329ae01e6be","5b306fda-76e7-4ad9-8070-fff3ddc43aff","5f1053e8-53e4-45b8-b01e-f1d54c47c86b","f788e4c7-39b5-45ca-af04-856a3b204a93","7dcd6180-d4db-4552-a8a8-326191c71525","1daebf9a-0dfc-46a3-a405-180c21e54b0d","4ade40c5-7fa9-48e6-a021-dd34da5ba6b6"]
```

```
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..161.54 rows=46 width=32) (actual time=0.008..0.047 rows=46 loops=1)
  Index Cond: (question_id = ANY ('{f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,0503d90c-b4e0-4c14-931d-dfe048b5c65b,1c581dd0-66a4-4b0c-bf50-56d891f6de10,6f56ef5a-1ae8-4c31-adb3-fd09b932ba93,cbd344b9-fa16-4db2-a8d7-2071ecbba6c3,d249e358-6b60-4ce7-805b-b539dae1dac7,a02f6575-3fd2-4229-80fc-6ecbc450c53e,835f2092-6af7-42f1-b974-3748d95265cd,74a245ac-3c31-42b1-95f8-24b08d9325cd,4dc28e05-4b2c-4236-8a6c-6ee4f3b1b11b,98cf2ba1-f2c7-41ef-b09d-9d6696d5cad2,d9abbc7c-c0a2-4249-8408-402dc8d06aa9,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,813cee6f-dc74-4294-931a-67ad7986a8c2,aab27f5d-0441-4cd1-9024-e329ae01e6be,5b306fda-76e7-4ad9-8070-fff3ddc43aff,5f1053e8-53e4-45b8-b01e-f1d54c47c86b,f788e4c7-39b5-45ca-af04-856a3b204a93,7dcd6180-d4db-4552-a8a8-326191c71525,1daebf9a-0dfc-46a3-a405-180c21e54b0d,4ade40c5-7fa9-48e6-a021-dd34da5ba6b6}'::uuid[]))
  Heap Fetches: 46
  Buffers: shared hit=81
Planning Time: 0.037 ms
Execution Time: 0.054 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — version load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, id, version_number, status, updated_at
FROM question_versions
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
ORDER BY question_id ASC, version_number DESC
-- parameters: ["f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c","0503d90c-b4e0-4c14-931d-dfe048b5c65b","1c581dd0-66a4-4b0c-bf50-56d891f6de10","6f56ef5a-1ae8-4c31-adb3-fd09b932ba93","cbd344b9-fa16-4db2-a8d7-2071ecbba6c3","d249e358-6b60-4ce7-805b-b539dae1dac7","a02f6575-3fd2-4229-80fc-6ecbc450c53e","835f2092-6af7-42f1-b974-3748d95265cd","74a245ac-3c31-42b1-95f8-24b08d9325cd","4dc28e05-4b2c-4236-8a6c-6ee4f3b1b11b","98cf2ba1-f2c7-41ef-b09d-9d6696d5cad2","d9abbc7c-c0a2-4249-8408-402dc8d06aa9","6f78fd30-a7c2-441a-9664-ca3dbdacbd72","813cee6f-dc74-4294-931a-67ad7986a8c2","aab27f5d-0441-4cd1-9024-e329ae01e6be","5b306fda-76e7-4ad9-8070-fff3ddc43aff","5f1053e8-53e4-45b8-b01e-f1d54c47c86b","f788e4c7-39b5-45ca-af04-856a3b204a93","7dcd6180-d4db-4552-a8a8-326191c71525","1daebf9a-0dfc-46a3-a405-180c21e54b0d","4ade40c5-7fa9-48e6-a021-dd34da5ba6b6"]
```

```
Sort  (cost=344.54..344.70 rows=66 width=48) (actual time=0.102..0.106 rows=72 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 30kB
  Buffers: shared hit=85
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..342.54 rows=66 width=48) (actual time=0.052..0.081 rows=72 loops=1)
        Recheck Cond: (question_id = ANY ('{f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,0503d90c-b4e0-4c14-931d-dfe048b5c65b,1c581dd0-66a4-4b0c-bf50-56d891f6de10,6f56ef5a-1ae8-4c31-adb3-fd09b932ba93,cbd344b9-fa16-4db2-a8d7-2071ecbba6c3,d249e358-6b60-4ce7-805b-b539dae1dac7,a02f6575-3fd2-4229-80fc-6ecbc450c53e,835f2092-6af7-42f1-b974-3748d95265cd,74a245ac-3c31-42b1-95f8-24b08d9325cd,4dc28e05-4b2c-4236-8a6c-6ee4f3b1b11b,98cf2ba1-f2c7-41ef-b09d-9d6696d5cad2,d9abbc7c-c0a2-4249-8408-402dc8d06aa9,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,813cee6f-dc74-4294-931a-67ad7986a8c2,aab27f5d-0441-4cd1-9024-e329ae01e6be,5b306fda-76e7-4ad9-8070-fff3ddc43aff,5f1053e8-53e4-45b8-b01e-f1d54c47c86b,f788e4c7-39b5-45ca-af04-856a3b204a93,7dcd6180-d4db-4552-a8a8-326191c71525,1daebf9a-0dfc-46a3-a405-180c21e54b0d,4ade40c5-7fa9-48e6-a021-dd34da5ba6b6}'::uuid[]))
        Heap Blocks: exact=22
        Buffers: shared hit=85
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=66 width=0) (actual time=0.047..0.047 rows=72 loops=1)
              Index Cond: (question_id = ANY ('{f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,0503d90c-b4e0-4c14-931d-dfe048b5c65b,1c581dd0-66a4-4b0c-bf50-56d891f6de10,6f56ef5a-1ae8-4c31-adb3-fd09b932ba93,cbd344b9-fa16-4db2-a8d7-2071ecbba6c3,d249e358-6b60-4ce7-805b-b539dae1dac7,a02f6575-3fd2-4229-80fc-6ecbc450c53e,835f2092-6af7-42f1-b974-3748d95265cd,74a245ac-3c31-42b1-95f8-24b08d9325cd,4dc28e05-4b2c-4236-8a6c-6ee4f3b1b11b,98cf2ba1-f2c7-41ef-b09d-9d6696d5cad2,d9abbc7c-c0a2-4249-8408-402dc8d06aa9,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,813cee6f-dc74-4294-931a-67ad7986a8c2,aab27f5d-0441-4cd1-9024-e329ae01e6be,5b306fda-76e7-4ad9-8070-fff3ddc43aff,5f1053e8-53e4-45b8-b01e-f1d54c47c86b,f788e4c7-39b5-45ca-af04-856a3b204a93,7dcd6180-d4db-4552-a8a8-326191c71525,1daebf9a-0dfc-46a3-a405-180c21e54b0d,4ade40c5-7fa9-48e6-a021-dd34da5ba6b6}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.060 ms
Execution Time: 0.120 ms
```
</details>

### 6. Cursor pagination at page 50

Keyset cursor at row 1,000; the query after it is page 51.

Spec: `{"searchTokens":[],"limit":20,"cursor":{"createdAt":"2026-10-26T12:12:30.353Z","id":"0cab3581-acfc-4f88-847c-77bd9e7571f9"}}`

Driving scan: —, estimated ? rows, actual ? rows.

**Page query** — median wall 0.65 ms over 15 runs (best 0.62 ms); EXPLAIN execution 0.219 ms, planning 0.082 ms; buffers shared hit=81 read=0; sorts=0; indexes=ix_questions_created_at_id. Full staff-list path (page + tag + version loads) median 1.83 ms.

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — page query (questions.findMany)</summary>

```sql
SELECT id, type, status, difficulty, marks, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, created_at, updated_at
FROM questions q
WHERE (q.created_at < $1::timestamptz OR (q.created_at = $1::timestamptz AND q.id < $2::uuid))
ORDER BY q.created_at DESC, q.id DESC
LIMIT $3
-- parameters: ["2026-10-26T12:12:30.353Z","0cab3581-acfc-4f88-847c-77bd9e7571f9",21]
```

```
Limit  (cost=0.41..2.58 rows=21 width=128) (actual time=0.198..0.205 rows=21 loops=1)
  Buffers: shared hit=38
  ->  Index Scan using ix_questions_created_at_id on questions q  (cost=0.41..5051.85 rows=49030 width=128) (actual time=0.197..0.202 rows=21 loops=1)
        Filter: ((created_at < '2026-10-26 12:12:30.353+00'::timestamp with time zone) OR ((created_at = '2026-10-26 12:12:30.353+00'::timestamp with time zone) AND (id < '0cab3581-acfc-4f88-847c-77bd9e7571f9'::uuid)))
        Rows Removed by Filter: 981
        Buffers: shared hit=38
Planning:
  Buffers: shared hit=5
Planning Time: 0.082 ms
Execution Time: 0.219 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — tag load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, tag_id
FROM question_tags
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
-- parameters: ["d67cd94e-8477-4ab3-9ab4-fc05ddab7b69","34eda702-f218-4000-b26a-203edf011e55","3c7aa339-556a-4514-920f-199c92205da1","f871cd0e-9bb8-4b09-be83-871291758c07","ccbb6f79-4477-4e55-9c98-f86ee16799d2","ca335e28-fadf-46e8-b6cb-e41cb2145cfd","36d280be-9471-49d9-b04d-fa52ffcf3333","ee221598-f4be-46c7-8cc3-6367624c2f6f","11f83dd3-e514-4a81-8d05-6f1d052f3394","d20754c9-a572-4cc5-b3f3-8fd503efffac","8cabe306-b687-4723-bb56-a3362c4661a0","7c0fc8b2-28f6-42a5-bde8-d9cf81f93123","89ee4d63-cc16-49e5-8d82-35da1f183ffd","619816fc-284d-4321-a315-bc42dd179004","50cb2a8a-79c9-4c58-a571-5a362db4a22f","c203a9eb-ccda-46e5-8eee-807296ebbc50","3243ce5e-f8c4-4847-a8df-1603921d79f8","2e13047d-e4c1-4fdc-8e2a-8f9a5c419097","b6a70fa0-ef43-4112-90b5-778d9f7505b0","acc15728-24ea-4293-b103-697e389a8917","72054db3-0ae3-4bb8-abb0-57780b3cf244"]
```

```
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..161.54 rows=46 width=32) (actual time=0.011..0.060 rows=31 loops=1)
  Index Cond: (question_id = ANY ('{d67cd94e-8477-4ab3-9ab4-fc05ddab7b69,34eda702-f218-4000-b26a-203edf011e55,3c7aa339-556a-4514-920f-199c92205da1,f871cd0e-9bb8-4b09-be83-871291758c07,ccbb6f79-4477-4e55-9c98-f86ee16799d2,ca335e28-fadf-46e8-b6cb-e41cb2145cfd,36d280be-9471-49d9-b04d-fa52ffcf3333,ee221598-f4be-46c7-8cc3-6367624c2f6f,11f83dd3-e514-4a81-8d05-6f1d052f3394,d20754c9-a572-4cc5-b3f3-8fd503efffac,8cabe306-b687-4723-bb56-a3362c4661a0,7c0fc8b2-28f6-42a5-bde8-d9cf81f93123,89ee4d63-cc16-49e5-8d82-35da1f183ffd,619816fc-284d-4321-a315-bc42dd179004,50cb2a8a-79c9-4c58-a571-5a362db4a22f,c203a9eb-ccda-46e5-8eee-807296ebbc50,3243ce5e-f8c4-4847-a8df-1603921d79f8,2e13047d-e4c1-4fdc-8e2a-8f9a5c419097,b6a70fa0-ef43-4112-90b5-778d9f7505b0,acc15728-24ea-4293-b103-697e389a8917,72054db3-0ae3-4bb8-abb0-57780b3cf244}'::uuid[]))
  Heap Fetches: 31
  Buffers: shared hit=65
Planning Time: 0.036 ms
Execution Time: 0.067 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — version load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, id, version_number, status, updated_at
FROM question_versions
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
ORDER BY question_id ASC, version_number DESC
-- parameters: ["d67cd94e-8477-4ab3-9ab4-fc05ddab7b69","34eda702-f218-4000-b26a-203edf011e55","3c7aa339-556a-4514-920f-199c92205da1","f871cd0e-9bb8-4b09-be83-871291758c07","ccbb6f79-4477-4e55-9c98-f86ee16799d2","ca335e28-fadf-46e8-b6cb-e41cb2145cfd","36d280be-9471-49d9-b04d-fa52ffcf3333","ee221598-f4be-46c7-8cc3-6367624c2f6f","11f83dd3-e514-4a81-8d05-6f1d052f3394","d20754c9-a572-4cc5-b3f3-8fd503efffac","8cabe306-b687-4723-bb56-a3362c4661a0","7c0fc8b2-28f6-42a5-bde8-d9cf81f93123","89ee4d63-cc16-49e5-8d82-35da1f183ffd","619816fc-284d-4321-a315-bc42dd179004","50cb2a8a-79c9-4c58-a571-5a362db4a22f","c203a9eb-ccda-46e5-8eee-807296ebbc50","3243ce5e-f8c4-4847-a8df-1603921d79f8","2e13047d-e4c1-4fdc-8e2a-8f9a5c419097","b6a70fa0-ef43-4112-90b5-778d9f7505b0","acc15728-24ea-4293-b103-697e389a8917","72054db3-0ae3-4bb8-abb0-57780b3cf244"]
```

```
Sort  (cost=344.54..344.70 rows=66 width=48) (actual time=0.102..0.105 rows=62 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=69
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..342.54 rows=66 width=48) (actual time=0.060..0.078 rows=62 loops=1)
        Recheck Cond: (question_id = ANY ('{d67cd94e-8477-4ab3-9ab4-fc05ddab7b69,34eda702-f218-4000-b26a-203edf011e55,3c7aa339-556a-4514-920f-199c92205da1,f871cd0e-9bb8-4b09-be83-871291758c07,ccbb6f79-4477-4e55-9c98-f86ee16799d2,ca335e28-fadf-46e8-b6cb-e41cb2145cfd,36d280be-9471-49d9-b04d-fa52ffcf3333,ee221598-f4be-46c7-8cc3-6367624c2f6f,11f83dd3-e514-4a81-8d05-6f1d052f3394,d20754c9-a572-4cc5-b3f3-8fd503efffac,8cabe306-b687-4723-bb56-a3362c4661a0,7c0fc8b2-28f6-42a5-bde8-d9cf81f93123,89ee4d63-cc16-49e5-8d82-35da1f183ffd,619816fc-284d-4321-a315-bc42dd179004,50cb2a8a-79c9-4c58-a571-5a362db4a22f,c203a9eb-ccda-46e5-8eee-807296ebbc50,3243ce5e-f8c4-4847-a8df-1603921d79f8,2e13047d-e4c1-4fdc-8e2a-8f9a5c419097,b6a70fa0-ef43-4112-90b5-778d9f7505b0,acc15728-24ea-4293-b103-697e389a8917,72054db3-0ae3-4bb8-abb0-57780b3cf244}'::uuid[]))
        Heap Blocks: exact=6
        Buffers: shared hit=69
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=66 width=0) (actual time=0.057..0.057 rows=62 loops=1)
              Index Cond: (question_id = ANY ('{d67cd94e-8477-4ab3-9ab4-fc05ddab7b69,34eda702-f218-4000-b26a-203edf011e55,3c7aa339-556a-4514-920f-199c92205da1,f871cd0e-9bb8-4b09-be83-871291758c07,ccbb6f79-4477-4e55-9c98-f86ee16799d2,ca335e28-fadf-46e8-b6cb-e41cb2145cfd,36d280be-9471-49d9-b04d-fa52ffcf3333,ee221598-f4be-46c7-8cc3-6367624c2f6f,11f83dd3-e514-4a81-8d05-6f1d052f3394,d20754c9-a572-4cc5-b3f3-8fd503efffac,8cabe306-b687-4723-bb56-a3362c4661a0,7c0fc8b2-28f6-42a5-bde8-d9cf81f93123,89ee4d63-cc16-49e5-8d82-35da1f183ffd,619816fc-284d-4321-a315-bc42dd179004,50cb2a8a-79c9-4c58-a571-5a362db4a22f,c203a9eb-ccda-46e5-8eee-807296ebbc50,3243ce5e-f8c4-4847-a8df-1603921d79f8,2e13047d-e4c1-4fdc-8e2a-8f9a5c419097,b6a70fa0-ef43-4112-90b5-778d9f7505b0,acc15728-24ea-4293-b103-697e389a8917,72054db3-0ae3-4bb8-abb0-57780b3cf244}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.064 ms
Execution Time: 0.120 ms
```
</details>

### 7. College only (added by 04D)

200 colleges, one source row each: selective but not unique.

Spec: `{"collegeId":"af6f1028-fd54-458a-b134-6e15868ebfc5","searchTokens":[],"limit":20}`

Driving scan: Bitmap Heap Scan, Bitmap Index Scan, estimated 155 rows, actual 135 rows.

**Page query** — median wall 1.04 ms over 15 runs (best 0.99 ms); EXPLAIN execution 0.541 ms, planning 0.184 ms; buffers shared hit=2279 read=0; sorts=1; indexes=questions_pkey, ix_question_sources_college_id. Full staff-list path (page + tag + version loads) median 2.94 ms.

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — page query (questions.findMany)</summary>

```sql
SELECT id, type, status, difficulty, marks, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, created_at, updated_at
FROM questions q
WHERE EXISTS (SELECT 1 FROM question_sources s WHERE s.question_id = q.id AND s.college_id = $1::uuid)
ORDER BY q.created_at DESC, q.id DESC
LIMIT $2
-- parameters: ["af6f1028-fd54-458a-b134-6e15868ebfc5",21]
```

```
Limit  (cost=1506.57..1506.62 rows=21 width=128) (actual time=0.512..0.516 rows=21 loops=1)
  Buffers: shared hit=530
  ->  Sort  (cost=1506.57..1506.96 rows=155 width=128) (actual time=0.512..0.513 rows=21 loops=1)
        Sort Key: q.created_at DESC, q.id DESC
        Sort Method: top-N heapsort  Memory: 32kB
        Buffers: shared hit=530
        ->  Nested Loop  (cost=389.43..1502.39 rows=155 width=128) (actual time=0.128..0.460 rows=135 loops=1)
              Buffers: shared hit=530
              ->  HashAggregate  (cost=389.14..390.69 rows=155 width=16) (actual time=0.123..0.142 rows=135 loops=1)
                    Group Key: s.question_id
                    Batches: 1  Memory Usage: 40kB
                    Buffers: shared hit=125
                    ->  Bitmap Heap Scan on question_sources s  (cost=5.49..388.75 rows=155 width=16) (actual time=0.020..0.096 rows=135 loops=1)
                          Recheck Cond: (college_id = 'af6f1028-fd54-458a-b134-6e15868ebfc5'::uuid)
                          Heap Blocks: exact=123
                          Buffers: shared hit=125
                          ->  Bitmap Index Scan on ix_question_sources_college_id  (cost=0.00..5.45 rows=155 width=0) (actual time=0.008..0.009 rows=135 loops=1)
                                Index Cond: (college_id = 'af6f1028-fd54-458a-b134-6e15868ebfc5'::uuid)
                                Buffers: shared hit=2
              ->  Index Scan using questions_pkey on questions q  (cost=0.29..7.17 rows=1 width=128) (actual time=0.002..0.002 rows=1 loops=135)
                    Index Cond: (id = s.question_id)
                    Buffers: shared hit=405
Planning:
  Buffers: shared hit=32
Planning Time: 0.184 ms
Execution Time: 0.541 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — tag load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, tag_id
FROM question_tags
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
-- parameters: ["ee1e2cfc-28c7-4b15-b328-4f23d353ab79","875f9779-506f-439e-8ecb-fc24f6db4439","db2f5e35-c3e8-47a1-8c2f-4a587825133a","9c02bc3a-9713-4904-9723-7e1b4ec46f3d","ae8edd62-70f3-4782-803f-c4f75ff229ac","15977f76-c4af-4c50-a78d-fba80e442d5a","ec84e95f-73c9-4a8b-ba4f-71d44562433c","34e689bd-3a91-415f-b44d-f1efa9a2e947","d04129f3-81b2-4409-8765-1420ebb750d8","6c90eb2f-3a5a-4ce1-8e1f-e036de208353","6bb21c7d-5edd-4256-9430-6e43ff3ffdf7","455e62f4-6094-40b2-a052-b670d0ea2c85","fba289da-7462-4f7a-99cf-9f1aa8e886b2","5ff51b9a-a43d-4fc6-8bc9-958ace48f5ab","979c6baf-8d46-44c5-b6f4-a7be761b99b6","161709f0-aab1-4919-99de-dd09c92d7cb3","7d272180-f80d-4349-9a19-1d5d2e6f50c9","5b5aede6-1ba2-4f26-bfce-7d68964e018a","c12af930-960c-4399-8185-121fdcda157a","66fbf5ab-3a0f-4478-9dba-49f2ee91a857","20f0a583-f1e8-423b-87ca-5ce3dbc297ef"]
```

```
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..161.54 rows=46 width=32) (actual time=0.007..0.068 rows=42 loops=1)
  Index Cond: (question_id = ANY ('{ee1e2cfc-28c7-4b15-b328-4f23d353ab79,875f9779-506f-439e-8ecb-fc24f6db4439,db2f5e35-c3e8-47a1-8c2f-4a587825133a,9c02bc3a-9713-4904-9723-7e1b4ec46f3d,ae8edd62-70f3-4782-803f-c4f75ff229ac,15977f76-c4af-4c50-a78d-fba80e442d5a,ec84e95f-73c9-4a8b-ba4f-71d44562433c,34e689bd-3a91-415f-b44d-f1efa9a2e947,d04129f3-81b2-4409-8765-1420ebb750d8,6c90eb2f-3a5a-4ce1-8e1f-e036de208353,6bb21c7d-5edd-4256-9430-6e43ff3ffdf7,455e62f4-6094-40b2-a052-b670d0ea2c85,fba289da-7462-4f7a-99cf-9f1aa8e886b2,5ff51b9a-a43d-4fc6-8bc9-958ace48f5ab,979c6baf-8d46-44c5-b6f4-a7be761b99b6,161709f0-aab1-4919-99de-dd09c92d7cb3,7d272180-f80d-4349-9a19-1d5d2e6f50c9,5b5aede6-1ba2-4f26-bfce-7d68964e018a,c12af930-960c-4399-8185-121fdcda157a,66fbf5ab-3a0f-4478-9dba-49f2ee91a857,20f0a583-f1e8-423b-87ca-5ce3dbc297ef}'::uuid[]))
  Heap Fetches: 42
  Buffers: shared hit=85
Planning Time: 0.032 ms
Execution Time: 0.075 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — version load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, id, version_number, status, updated_at
FROM question_versions
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
ORDER BY question_id ASC, version_number DESC
-- parameters: ["ee1e2cfc-28c7-4b15-b328-4f23d353ab79","875f9779-506f-439e-8ecb-fc24f6db4439","db2f5e35-c3e8-47a1-8c2f-4a587825133a","9c02bc3a-9713-4904-9723-7e1b4ec46f3d","ae8edd62-70f3-4782-803f-c4f75ff229ac","15977f76-c4af-4c50-a78d-fba80e442d5a","ec84e95f-73c9-4a8b-ba4f-71d44562433c","34e689bd-3a91-415f-b44d-f1efa9a2e947","d04129f3-81b2-4409-8765-1420ebb750d8","6c90eb2f-3a5a-4ce1-8e1f-e036de208353","6bb21c7d-5edd-4256-9430-6e43ff3ffdf7","455e62f4-6094-40b2-a052-b670d0ea2c85","fba289da-7462-4f7a-99cf-9f1aa8e886b2","5ff51b9a-a43d-4fc6-8bc9-958ace48f5ab","979c6baf-8d46-44c5-b6f4-a7be761b99b6","161709f0-aab1-4919-99de-dd09c92d7cb3","7d272180-f80d-4349-9a19-1d5d2e6f50c9","5b5aede6-1ba2-4f26-bfce-7d68964e018a","c12af930-960c-4399-8185-121fdcda157a","66fbf5ab-3a0f-4478-9dba-49f2ee91a857","20f0a583-f1e8-423b-87ca-5ce3dbc297ef"]
```

```
Sort  (cost=344.54..344.70 rows=66 width=48) (actual time=0.104..0.108 rows=63 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=88
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..342.54 rows=66 width=48) (actual time=0.052..0.084 rows=63 loops=1)
        Recheck Cond: (question_id = ANY ('{ee1e2cfc-28c7-4b15-b328-4f23d353ab79,875f9779-506f-439e-8ecb-fc24f6db4439,db2f5e35-c3e8-47a1-8c2f-4a587825133a,9c02bc3a-9713-4904-9723-7e1b4ec46f3d,ae8edd62-70f3-4782-803f-c4f75ff229ac,15977f76-c4af-4c50-a78d-fba80e442d5a,ec84e95f-73c9-4a8b-ba4f-71d44562433c,34e689bd-3a91-415f-b44d-f1efa9a2e947,d04129f3-81b2-4409-8765-1420ebb750d8,6c90eb2f-3a5a-4ce1-8e1f-e036de208353,6bb21c7d-5edd-4256-9430-6e43ff3ffdf7,455e62f4-6094-40b2-a052-b670d0ea2c85,fba289da-7462-4f7a-99cf-9f1aa8e886b2,5ff51b9a-a43d-4fc6-8bc9-958ace48f5ab,979c6baf-8d46-44c5-b6f4-a7be761b99b6,161709f0-aab1-4919-99de-dd09c92d7cb3,7d272180-f80d-4349-9a19-1d5d2e6f50c9,5b5aede6-1ba2-4f26-bfce-7d68964e018a,c12af930-960c-4399-8185-121fdcda157a,66fbf5ab-3a0f-4478-9dba-49f2ee91a857,20f0a583-f1e8-423b-87ca-5ce3dbc297ef}'::uuid[]))
        Heap Blocks: exact=25
        Buffers: shared hit=88
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=66 width=0) (actual time=0.047..0.047 rows=63 loops=1)
              Index Cond: (question_id = ANY ('{ee1e2cfc-28c7-4b15-b328-4f23d353ab79,875f9779-506f-439e-8ecb-fc24f6db4439,db2f5e35-c3e8-47a1-8c2f-4a587825133a,9c02bc3a-9713-4904-9723-7e1b4ec46f3d,ae8edd62-70f3-4782-803f-c4f75ff229ac,15977f76-c4af-4c50-a78d-fba80e442d5a,ec84e95f-73c9-4a8b-ba4f-71d44562433c,34e689bd-3a91-415f-b44d-f1efa9a2e947,d04129f3-81b2-4409-8765-1420ebb750d8,6c90eb2f-3a5a-4ce1-8e1f-e036de208353,6bb21c7d-5edd-4256-9430-6e43ff3ffdf7,455e62f4-6094-40b2-a052-b670d0ea2c85,fba289da-7462-4f7a-99cf-9f1aa8e886b2,5ff51b9a-a43d-4fc6-8bc9-958ace48f5ab,979c6baf-8d46-44c5-b6f4-a7be761b99b6,161709f0-aab1-4919-99de-dd09c92d7cb3,7d272180-f80d-4349-9a19-1d5d2e6f50c9,5b5aede6-1ba2-4f26-bfce-7d68964e018a,c12af930-960c-4399-8185-121fdcda157a,66fbf5ab-3a0f-4478-9dba-49f2ee91a857,20f0a583-f1e8-423b-87ca-5ce3dbc297ef}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.058 ms
Execution Time: 0.121 ms
```
</details>

### 8a. Search: "computer" (04D, English word)

Whole-word English hit in the maintained projection.

Spec: `{"searchTokens":["computer"],"limit":20}`

Driving scan: —, estimated ? rows, actual ? rows.

**Page query** — median wall 1.16 ms over 15 runs (best 1.08 ms); EXPLAIN execution 0.546 ms, planning 0.366 ms; buffers shared hit=1650 read=0; sorts=0; indexes=ix_questions_created_at_id, ix_question_versions_question_id. Full staff-list path (page + tag + version loads) median 2.42 ms.

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — page query (questions.findMany)</summary>

```sql
SELECT id, type, status, difficulty, marks, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, created_at, updated_at
FROM questions q
WHERE EXISTS (SELECT 1 FROM question_versions v WHERE v.question_id = q.id AND v.search_text LIKE $1)
ORDER BY q.created_at DESC, q.id DESC
LIMIT $2
-- parameters: ["%computer%",21]
```

```
Limit  (cost=0.83..96.78 rows=21 width=128) (actual time=0.029..0.528 rows=21 loops=1)
  Buffers: shared hit=539
  ->  Nested Loop Semi Join  (cost=0.83..72154.78 rows=15793 width=128) (actual time=0.028..0.525 rows=21 loops=1)
        Buffers: shared hit=539
        ->  Index Scan using ix_questions_created_at_id on questions q  (cost=0.41..4676.85 rows=50000 width=128) (actual time=0.005..0.023 rows=128 loops=1)
              Buffers: shared hit=6
        ->  Index Scan using ix_question_versions_question_id on question_versions v  (cost=0.42..1.35 rows=1 width=16) (actual time=0.004..0.004 rows=0 loops=128)
              Index Cond: (question_id = q.id)
              Filter: (search_text ~~ '%computer%'::text)
              Rows Removed by Filter: 3
              Buffers: shared hit=533
Planning:
  Buffers: shared hit=33
Planning Time: 0.366 ms
Execution Time: 0.546 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — tag load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, tag_id
FROM question_tags
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
-- parameters: ["e3bbdec9-fa8e-4455-8127-7057d39ad860","7d0eb37a-77cb-452a-a40a-4c4b4a4a5f15","36871fd5-afee-46fd-bde2-351d1d10bbaf","cb7a3ede-9a77-4bca-a9a7-226dbcbc2363","6f56ef5a-1ae8-4c31-adb3-fd09b932ba93","80ee2869-eb5f-4bda-97b7-770691d6ddac","027df3cc-a0de-4c90-af80-ae2ce9a815de","8b4165de-88d4-4a9e-b7ca-16a417bc2d4a","8b2d13e7-3db2-4e42-95f8-91e57ac127ea","5807908e-e795-4fb6-bd41-f94bbf38cf25","4cb85e4e-884a-47fe-b87f-80207193d15c","0810d55b-0c7a-4db5-b608-82c9678c1a14","6f2761b2-672c-457c-bbca-f721289b18b8","52037a1f-1628-4fc2-8dc8-7075eef5a19a","727baa79-41f7-46c5-8c10-ed2b31b67000","98cf2ba1-f2c7-41ef-b09d-9d6696d5cad2","c79a173f-3585-47dc-a732-ad227517269e","d050b53a-3801-47d6-bce3-2e5351f60255","62f49aad-9980-42a7-9e5a-6c5931e29682","813cee6f-dc74-4294-931a-67ad7986a8c2","f8a9f27d-77bb-4536-8dac-a20a270a0673"]
```

```
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..161.54 rows=46 width=32) (actual time=0.011..0.071 rows=43 loops=1)
  Index Cond: (question_id = ANY ('{e3bbdec9-fa8e-4455-8127-7057d39ad860,7d0eb37a-77cb-452a-a40a-4c4b4a4a5f15,36871fd5-afee-46fd-bde2-351d1d10bbaf,cb7a3ede-9a77-4bca-a9a7-226dbcbc2363,6f56ef5a-1ae8-4c31-adb3-fd09b932ba93,80ee2869-eb5f-4bda-97b7-770691d6ddac,027df3cc-a0de-4c90-af80-ae2ce9a815de,8b4165de-88d4-4a9e-b7ca-16a417bc2d4a,8b2d13e7-3db2-4e42-95f8-91e57ac127ea,5807908e-e795-4fb6-bd41-f94bbf38cf25,4cb85e4e-884a-47fe-b87f-80207193d15c,0810d55b-0c7a-4db5-b608-82c9678c1a14,6f2761b2-672c-457c-bbca-f721289b18b8,52037a1f-1628-4fc2-8dc8-7075eef5a19a,727baa79-41f7-46c5-8c10-ed2b31b67000,98cf2ba1-f2c7-41ef-b09d-9d6696d5cad2,c79a173f-3585-47dc-a732-ad227517269e,d050b53a-3801-47d6-bce3-2e5351f60255,62f49aad-9980-42a7-9e5a-6c5931e29682,813cee6f-dc74-4294-931a-67ad7986a8c2,f8a9f27d-77bb-4536-8dac-a20a270a0673}'::uuid[]))
  Heap Fetches: 43
  Buffers: shared hit=78
Planning Time: 0.053 ms
Execution Time: 0.082 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — version load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, id, version_number, status, updated_at
FROM question_versions
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
ORDER BY question_id ASC, version_number DESC
-- parameters: ["e3bbdec9-fa8e-4455-8127-7057d39ad860","7d0eb37a-77cb-452a-a40a-4c4b4a4a5f15","36871fd5-afee-46fd-bde2-351d1d10bbaf","cb7a3ede-9a77-4bca-a9a7-226dbcbc2363","6f56ef5a-1ae8-4c31-adb3-fd09b932ba93","80ee2869-eb5f-4bda-97b7-770691d6ddac","027df3cc-a0de-4c90-af80-ae2ce9a815de","8b4165de-88d4-4a9e-b7ca-16a417bc2d4a","8b2d13e7-3db2-4e42-95f8-91e57ac127ea","5807908e-e795-4fb6-bd41-f94bbf38cf25","4cb85e4e-884a-47fe-b87f-80207193d15c","0810d55b-0c7a-4db5-b608-82c9678c1a14","6f2761b2-672c-457c-bbca-f721289b18b8","52037a1f-1628-4fc2-8dc8-7075eef5a19a","727baa79-41f7-46c5-8c10-ed2b31b67000","98cf2ba1-f2c7-41ef-b09d-9d6696d5cad2","c79a173f-3585-47dc-a732-ad227517269e","d050b53a-3801-47d6-bce3-2e5351f60255","62f49aad-9980-42a7-9e5a-6c5931e29682","813cee6f-dc74-4294-931a-67ad7986a8c2","f8a9f27d-77bb-4536-8dac-a20a270a0673"]
```

```
Sort  (cost=344.54..344.70 rows=66 width=48) (actual time=0.080..0.083 rows=62 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=77
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..342.54 rows=66 width=48) (actual time=0.043..0.062 rows=62 loops=1)
        Recheck Cond: (question_id = ANY ('{e3bbdec9-fa8e-4455-8127-7057d39ad860,7d0eb37a-77cb-452a-a40a-4c4b4a4a5f15,36871fd5-afee-46fd-bde2-351d1d10bbaf,cb7a3ede-9a77-4bca-a9a7-226dbcbc2363,6f56ef5a-1ae8-4c31-adb3-fd09b932ba93,80ee2869-eb5f-4bda-97b7-770691d6ddac,027df3cc-a0de-4c90-af80-ae2ce9a815de,8b4165de-88d4-4a9e-b7ca-16a417bc2d4a,8b2d13e7-3db2-4e42-95f8-91e57ac127ea,5807908e-e795-4fb6-bd41-f94bbf38cf25,4cb85e4e-884a-47fe-b87f-80207193d15c,0810d55b-0c7a-4db5-b608-82c9678c1a14,6f2761b2-672c-457c-bbca-f721289b18b8,52037a1f-1628-4fc2-8dc8-7075eef5a19a,727baa79-41f7-46c5-8c10-ed2b31b67000,98cf2ba1-f2c7-41ef-b09d-9d6696d5cad2,c79a173f-3585-47dc-a732-ad227517269e,d050b53a-3801-47d6-bce3-2e5351f60255,62f49aad-9980-42a7-9e5a-6c5931e29682,813cee6f-dc74-4294-931a-67ad7986a8c2,f8a9f27d-77bb-4536-8dac-a20a270a0673}'::uuid[]))
        Heap Blocks: exact=14
        Buffers: shared hit=77
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=66 width=0) (actual time=0.038..0.039 rows=62 loops=1)
              Index Cond: (question_id = ANY ('{e3bbdec9-fa8e-4455-8127-7057d39ad860,7d0eb37a-77cb-452a-a40a-4c4b4a4a5f15,36871fd5-afee-46fd-bde2-351d1d10bbaf,cb7a3ede-9a77-4bca-a9a7-226dbcbc2363,6f56ef5a-1ae8-4c31-adb3-fd09b932ba93,80ee2869-eb5f-4bda-97b7-770691d6ddac,027df3cc-a0de-4c90-af80-ae2ce9a815de,8b4165de-88d4-4a9e-b7ca-16a417bc2d4a,8b2d13e7-3db2-4e42-95f8-91e57ac127ea,5807908e-e795-4fb6-bd41-f94bbf38cf25,4cb85e4e-884a-47fe-b87f-80207193d15c,0810d55b-0c7a-4db5-b608-82c9678c1a14,6f2761b2-672c-457c-bbca-f721289b18b8,52037a1f-1628-4fc2-8dc8-7075eef5a19a,727baa79-41f7-46c5-8c10-ed2b31b67000,98cf2ba1-f2c7-41ef-b09d-9d6696d5cad2,c79a173f-3585-47dc-a732-ad227517269e,d050b53a-3801-47d6-bce3-2e5351f60255,62f49aad-9980-42a7-9e5a-6c5931e29682,813cee6f-dc74-4294-931a-67ad7986a8c2,f8a9f27d-77bb-4536-8dac-a20a270a0673}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.075 ms
Execution Time: 0.097 ms
```
</details>

### 8b. Search: "কম্পিউটার" (04D, Bangla word)

Bangla word — no stemming is applied or claimed.

Spec: `{"searchTokens":["কম্পিউটার"],"limit":20}`

Driving scan: —, estimated ? rows, actual ? rows.

**Page query** — median wall 1.43 ms over 15 runs (best 1.32 ms); EXPLAIN execution 0.711 ms, planning 0.330 ms; buffers shared hit=2046 read=0; sorts=0; indexes=ix_questions_created_at_id, ix_question_versions_question_id. Full staff-list path (page + tag + version loads) median 2.71 ms.

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — page query (questions.findMany)</summary>

```sql
SELECT id, type, status, difficulty, marks, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, created_at, updated_at
FROM questions q
WHERE EXISTS (SELECT 1 FROM question_versions v WHERE v.question_id = q.id AND v.search_text LIKE $1)
ORDER BY q.created_at DESC, q.id DESC
LIMIT $2
-- parameters: ["%কম্পিউটার%",21]
```

```
Limit  (cost=0.83..155.59 rows=21 width=128) (actual time=0.033..0.694 rows=21 loops=1)
  Buffers: shared hit=671
  ->  Nested Loop Semi Join  (cost=0.83..72094.68 rows=9783 width=128) (actual time=0.032..0.691 rows=21 loops=1)
        Buffers: shared hit=671
        ->  Index Scan using ix_questions_created_at_id on questions q  (cost=0.41..4676.85 rows=50000 width=128) (actual time=0.004..0.029 rows=159 loops=1)
              Buffers: shared hit=7
        ->  Index Scan using ix_question_versions_question_id on question_versions v  (cost=0.42..1.35 rows=1 width=16) (actual time=0.004..0.004 rows=0 loops=159)
              Index Cond: (question_id = q.id)
              Filter: (search_text ~~ '%কম্পিউটার%'::text)
              Rows Removed by Filter: 3
              Buffers: shared hit=664
Planning:
  Buffers: shared hit=33
Planning Time: 0.330 ms
Execution Time: 0.711 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — tag load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, tag_id
FROM question_tags
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
-- parameters: ["60a6d883-fb8c-4ff0-a958-ad4617caed2c","f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c","73907810-dc0e-4a63-aa38-8ca345f97c06","58ab466d-84f0-41f1-9f95-f9d2e7069744","5b33491c-654f-45a0-8b77-e01092027e31","54753ecd-b48d-4f1f-b2f8-176f820ac7b0","5aa54cd9-6b47-4852-b173-04bb197441e3","1c581dd0-66a4-4b0c-bf50-56d891f6de10","7e9c41fd-2b5b-4cbf-8d32-8778d9ef96e0","a073dcfe-10e1-4c3f-82be-fb3145ec43db","fdd3f071-4383-4a8b-a9de-1e4f9a649388","843882c9-fa15-48b0-beab-93a025d1b360","d249e358-6b60-4ce7-805b-b539dae1dac7","2408f706-f766-4cd3-9275-b914998bcec4","cf6277b1-5b84-4e71-94d2-ac0804f284e1","835f2092-6af7-42f1-b974-3748d95265cd","aa88b37a-0fa6-4f39-bef0-864ea1daa460","bc08a109-6591-4931-a912-483e1dbfc10a","5b6bacab-43a9-412f-a06c-c971c0dfa716","6da6d5d3-53a2-44c4-8795-78aecbca31e5","ed6a6cd8-8514-4a53-83a0-a144df8e892f"]
```

```
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..161.54 rows=46 width=32) (actual time=0.008..0.053 rows=47 loops=1)
  Index Cond: (question_id = ANY ('{60a6d883-fb8c-4ff0-a958-ad4617caed2c,f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,73907810-dc0e-4a63-aa38-8ca345f97c06,58ab466d-84f0-41f1-9f95-f9d2e7069744,5b33491c-654f-45a0-8b77-e01092027e31,54753ecd-b48d-4f1f-b2f8-176f820ac7b0,5aa54cd9-6b47-4852-b173-04bb197441e3,1c581dd0-66a4-4b0c-bf50-56d891f6de10,7e9c41fd-2b5b-4cbf-8d32-8778d9ef96e0,a073dcfe-10e1-4c3f-82be-fb3145ec43db,fdd3f071-4383-4a8b-a9de-1e4f9a649388,843882c9-fa15-48b0-beab-93a025d1b360,d249e358-6b60-4ce7-805b-b539dae1dac7,2408f706-f766-4cd3-9275-b914998bcec4,cf6277b1-5b84-4e71-94d2-ac0804f284e1,835f2092-6af7-42f1-b974-3748d95265cd,aa88b37a-0fa6-4f39-bef0-864ea1daa460,bc08a109-6591-4931-a912-483e1dbfc10a,5b6bacab-43a9-412f-a06c-c971c0dfa716,6da6d5d3-53a2-44c4-8795-78aecbca31e5,ed6a6cd8-8514-4a53-83a0-a144df8e892f}'::uuid[]))
  Heap Fetches: 47
  Buffers: shared hit=77
Planning Time: 0.033 ms
Execution Time: 0.060 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — version load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, id, version_number, status, updated_at
FROM question_versions
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
ORDER BY question_id ASC, version_number DESC
-- parameters: ["60a6d883-fb8c-4ff0-a958-ad4617caed2c","f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c","73907810-dc0e-4a63-aa38-8ca345f97c06","58ab466d-84f0-41f1-9f95-f9d2e7069744","5b33491c-654f-45a0-8b77-e01092027e31","54753ecd-b48d-4f1f-b2f8-176f820ac7b0","5aa54cd9-6b47-4852-b173-04bb197441e3","1c581dd0-66a4-4b0c-bf50-56d891f6de10","7e9c41fd-2b5b-4cbf-8d32-8778d9ef96e0","a073dcfe-10e1-4c3f-82be-fb3145ec43db","fdd3f071-4383-4a8b-a9de-1e4f9a649388","843882c9-fa15-48b0-beab-93a025d1b360","d249e358-6b60-4ce7-805b-b539dae1dac7","2408f706-f766-4cd3-9275-b914998bcec4","cf6277b1-5b84-4e71-94d2-ac0804f284e1","835f2092-6af7-42f1-b974-3748d95265cd","aa88b37a-0fa6-4f39-bef0-864ea1daa460","bc08a109-6591-4931-a912-483e1dbfc10a","5b6bacab-43a9-412f-a06c-c971c0dfa716","6da6d5d3-53a2-44c4-8795-78aecbca31e5","ed6a6cd8-8514-4a53-83a0-a144df8e892f"]
```

```
Sort  (cost=344.54..344.70 rows=66 width=48) (actual time=0.111..0.115 rows=67 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=81
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..342.54 rows=66 width=48) (actual time=0.060..0.087 rows=67 loops=1)
        Recheck Cond: (question_id = ANY ('{60a6d883-fb8c-4ff0-a958-ad4617caed2c,f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,73907810-dc0e-4a63-aa38-8ca345f97c06,58ab466d-84f0-41f1-9f95-f9d2e7069744,5b33491c-654f-45a0-8b77-e01092027e31,54753ecd-b48d-4f1f-b2f8-176f820ac7b0,5aa54cd9-6b47-4852-b173-04bb197441e3,1c581dd0-66a4-4b0c-bf50-56d891f6de10,7e9c41fd-2b5b-4cbf-8d32-8778d9ef96e0,a073dcfe-10e1-4c3f-82be-fb3145ec43db,fdd3f071-4383-4a8b-a9de-1e4f9a649388,843882c9-fa15-48b0-beab-93a025d1b360,d249e358-6b60-4ce7-805b-b539dae1dac7,2408f706-f766-4cd3-9275-b914998bcec4,cf6277b1-5b84-4e71-94d2-ac0804f284e1,835f2092-6af7-42f1-b974-3748d95265cd,aa88b37a-0fa6-4f39-bef0-864ea1daa460,bc08a109-6591-4931-a912-483e1dbfc10a,5b6bacab-43a9-412f-a06c-c971c0dfa716,6da6d5d3-53a2-44c4-8795-78aecbca31e5,ed6a6cd8-8514-4a53-83a0-a144df8e892f}'::uuid[]))
        Heap Blocks: exact=18
        Buffers: shared hit=81
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=66 width=0) (actual time=0.055..0.055 rows=67 loops=1)
              Index Cond: (question_id = ANY ('{60a6d883-fb8c-4ff0-a958-ad4617caed2c,f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,73907810-dc0e-4a63-aa38-8ca345f97c06,58ab466d-84f0-41f1-9f95-f9d2e7069744,5b33491c-654f-45a0-8b77-e01092027e31,54753ecd-b48d-4f1f-b2f8-176f820ac7b0,5aa54cd9-6b47-4852-b173-04bb197441e3,1c581dd0-66a4-4b0c-bf50-56d891f6de10,7e9c41fd-2b5b-4cbf-8d32-8778d9ef96e0,a073dcfe-10e1-4c3f-82be-fb3145ec43db,fdd3f071-4383-4a8b-a9de-1e4f9a649388,843882c9-fa15-48b0-beab-93a025d1b360,d249e358-6b60-4ce7-805b-b539dae1dac7,2408f706-f766-4cd3-9275-b914998bcec4,cf6277b1-5b84-4e71-94d2-ac0804f284e1,835f2092-6af7-42f1-b974-3748d95265cd,aa88b37a-0fa6-4f39-bef0-864ea1daa460,bc08a109-6591-4931-a912-483e1dbfc10a,5b6bacab-43a9-412f-a06c-c971c0dfa716,6da6d5d3-53a2-44c4-8795-78aecbca31e5,ed6a6cd8-8514-4a53-83a0-a144df8e892f}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.062 ms
Execution Time: 0.130 ms
```
</details>

### 8c. Search: "ক্ষ" (04D, Bangla conjunct, partial)

Two-character conjunct inside a word — a trigram partial match.

Spec: `{"searchTokens":["ক্ষ"],"limit":20}`

Driving scan: —, estimated ? rows, actual ? rows.

**Page query** — median wall 1.12 ms over 15 runs (best 1.05 ms); EXPLAIN execution 0.414 ms, planning 0.292 ms; buffers shared hit=1248 read=0; sorts=0; indexes=ix_questions_created_at_id, ix_question_versions_question_id. Full staff-list path (page + tag + version loads) median 2.37 ms.

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — page query (questions.findMany)</summary>

```sql
SELECT id, type, status, difficulty, marks, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, created_at, updated_at
FROM questions q
WHERE EXISTS (SELECT 1 FROM question_versions v WHERE v.question_id = q.id AND v.search_text LIKE $1)
ORDER BY q.created_at DESC, q.id DESC
LIMIT $2
-- parameters: ["%ক্ষ%",21]
```

```
Limit  (cost=0.83..91.17 rows=21 width=128) (actual time=0.035..0.400 rows=21 loops=1)
  Buffers: shared hit=405
  ->  Nested Loop Semi Join  (cost=0.83..72164.60 rows=16775 width=128) (actual time=0.034..0.397 rows=21 loops=1)
        Buffers: shared hit=405
        ->  Index Scan using ix_questions_created_at_id on questions q  (cost=0.41..4676.85 rows=50000 width=128) (actual time=0.004..0.018 rows=96 loops=1)
              Buffers: shared hit=5
        ->  Index Scan using ix_question_versions_question_id on question_versions v  (cost=0.42..1.35 rows=1 width=16) (actual time=0.004..0.004 rows=0 loops=96)
              Index Cond: (question_id = q.id)
              Filter: (search_text ~~ '%ক্ষ%'::text)
              Rows Removed by Filter: 3
              Buffers: shared hit=400
Planning:
  Buffers: shared hit=33
Planning Time: 0.292 ms
Execution Time: 0.414 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — tag load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, tag_id
FROM question_tags
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
-- parameters: ["f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c","73907810-dc0e-4a63-aa38-8ca345f97c06","af0845a8-072a-49ef-8c58-f455728507da","c1a58320-bf73-4660-a74c-e35970a18364","6db11483-8728-49d1-b70c-a1c57f21f242","dfddf28f-2858-4455-a521-4d74c7dcdd6a","261d0fad-2f2c-44b1-8735-58c986a4e58b","a073dcfe-10e1-4c3f-82be-fb3145ec43db","95728bb8-3885-4458-937e-4c528a41c6cd","ee860016-5620-446e-b857-eafaec0445a3","d214acb7-2739-488a-a16c-34df80927271","ac1c998b-fec2-49c5-881f-55c81f15ca0f","3bad5601-3045-4dad-9bd8-4a8b18f5a38b","620429dd-94df-4508-a0f9-65af9d5146fb","23c48637-1cbc-48e9-a966-e0a1134badbe","2408f706-f766-4cd3-9275-b914998bcec4","88d44b75-6aee-41b2-bede-2e98da6ea30e","7286c738-ae6e-40b4-a9ae-123c141cb9aa","835f2092-6af7-42f1-b974-3748d95265cd","cbcabec3-e205-4ccd-8a85-e0821295bffc","d13f647f-3218-4680-ab26-5c5a00301d1e"]
```

```
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..161.54 rows=46 width=32) (actual time=0.009..0.054 rows=47 loops=1)
  Index Cond: (question_id = ANY ('{f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,73907810-dc0e-4a63-aa38-8ca345f97c06,af0845a8-072a-49ef-8c58-f455728507da,c1a58320-bf73-4660-a74c-e35970a18364,6db11483-8728-49d1-b70c-a1c57f21f242,dfddf28f-2858-4455-a521-4d74c7dcdd6a,261d0fad-2f2c-44b1-8735-58c986a4e58b,a073dcfe-10e1-4c3f-82be-fb3145ec43db,95728bb8-3885-4458-937e-4c528a41c6cd,ee860016-5620-446e-b857-eafaec0445a3,d214acb7-2739-488a-a16c-34df80927271,ac1c998b-fec2-49c5-881f-55c81f15ca0f,3bad5601-3045-4dad-9bd8-4a8b18f5a38b,620429dd-94df-4508-a0f9-65af9d5146fb,23c48637-1cbc-48e9-a966-e0a1134badbe,2408f706-f766-4cd3-9275-b914998bcec4,88d44b75-6aee-41b2-bede-2e98da6ea30e,7286c738-ae6e-40b4-a9ae-123c141cb9aa,835f2092-6af7-42f1-b974-3748d95265cd,cbcabec3-e205-4ccd-8a85-e0821295bffc,d13f647f-3218-4680-ab26-5c5a00301d1e}'::uuid[]))
  Heap Fetches: 47
  Buffers: shared hit=78
Planning Time: 0.035 ms
Execution Time: 0.061 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — version load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, id, version_number, status, updated_at
FROM question_versions
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
ORDER BY question_id ASC, version_number DESC
-- parameters: ["f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c","73907810-dc0e-4a63-aa38-8ca345f97c06","af0845a8-072a-49ef-8c58-f455728507da","c1a58320-bf73-4660-a74c-e35970a18364","6db11483-8728-49d1-b70c-a1c57f21f242","dfddf28f-2858-4455-a521-4d74c7dcdd6a","261d0fad-2f2c-44b1-8735-58c986a4e58b","a073dcfe-10e1-4c3f-82be-fb3145ec43db","95728bb8-3885-4458-937e-4c528a41c6cd","ee860016-5620-446e-b857-eafaec0445a3","d214acb7-2739-488a-a16c-34df80927271","ac1c998b-fec2-49c5-881f-55c81f15ca0f","3bad5601-3045-4dad-9bd8-4a8b18f5a38b","620429dd-94df-4508-a0f9-65af9d5146fb","23c48637-1cbc-48e9-a966-e0a1134badbe","2408f706-f766-4cd3-9275-b914998bcec4","88d44b75-6aee-41b2-bede-2e98da6ea30e","7286c738-ae6e-40b4-a9ae-123c141cb9aa","835f2092-6af7-42f1-b974-3748d95265cd","cbcabec3-e205-4ccd-8a85-e0821295bffc","d13f647f-3218-4680-ab26-5c5a00301d1e"]
```

```
Sort  (cost=344.54..344.70 rows=66 width=48) (actual time=0.080..0.084 rows=67 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=78
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..342.54 rows=66 width=48) (actual time=0.042..0.061 rows=67 loops=1)
        Recheck Cond: (question_id = ANY ('{f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,73907810-dc0e-4a63-aa38-8ca345f97c06,af0845a8-072a-49ef-8c58-f455728507da,c1a58320-bf73-4660-a74c-e35970a18364,6db11483-8728-49d1-b70c-a1c57f21f242,dfddf28f-2858-4455-a521-4d74c7dcdd6a,261d0fad-2f2c-44b1-8735-58c986a4e58b,a073dcfe-10e1-4c3f-82be-fb3145ec43db,95728bb8-3885-4458-937e-4c528a41c6cd,ee860016-5620-446e-b857-eafaec0445a3,d214acb7-2739-488a-a16c-34df80927271,ac1c998b-fec2-49c5-881f-55c81f15ca0f,3bad5601-3045-4dad-9bd8-4a8b18f5a38b,620429dd-94df-4508-a0f9-65af9d5146fb,23c48637-1cbc-48e9-a966-e0a1134badbe,2408f706-f766-4cd3-9275-b914998bcec4,88d44b75-6aee-41b2-bede-2e98da6ea30e,7286c738-ae6e-40b4-a9ae-123c141cb9aa,835f2092-6af7-42f1-b974-3748d95265cd,cbcabec3-e205-4ccd-8a85-e0821295bffc,d13f647f-3218-4680-ab26-5c5a00301d1e}'::uuid[]))
        Heap Blocks: exact=15
        Buffers: shared hit=78
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=66 width=0) (actual time=0.038..0.038 rows=67 loops=1)
              Index Cond: (question_id = ANY ('{f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,73907810-dc0e-4a63-aa38-8ca345f97c06,af0845a8-072a-49ef-8c58-f455728507da,c1a58320-bf73-4660-a74c-e35970a18364,6db11483-8728-49d1-b70c-a1c57f21f242,dfddf28f-2858-4455-a521-4d74c7dcdd6a,261d0fad-2f2c-44b1-8735-58c986a4e58b,a073dcfe-10e1-4c3f-82be-fb3145ec43db,95728bb8-3885-4458-937e-4c528a41c6cd,ee860016-5620-446e-b857-eafaec0445a3,d214acb7-2739-488a-a16c-34df80927271,ac1c998b-fec2-49c5-881f-55c81f15ca0f,3bad5601-3045-4dad-9bd8-4a8b18f5a38b,620429dd-94df-4508-a0f9-65af9d5146fb,23c48637-1cbc-48e9-a966-e0a1134badbe,2408f706-f766-4cd3-9275-b914998bcec4,88d44b75-6aee-41b2-bede-2e98da6ea30e,7286c738-ae6e-40b4-a9ae-123c141cb9aa,835f2092-6af7-42f1-b974-3748d95265cd,cbcabec3-e205-4ccd-8a85-e0821295bffc,d13f647f-3218-4680-ab26-5c5a00301d1e}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.055 ms
Execution Time: 0.096 ms
```
</details>

### 8d. Search: "html ওয়েব" (04D, mixed Bangla + English)

Two tokens, both required in the same version.

Spec: `{"searchTokens":["html","ওয়েব"],"limit":20}`

Driving scan: —, estimated ? rows, actual ? rows.

**Page query** — median wall 2.98 ms over 15 runs (best 2.68 ms); EXPLAIN execution 2.411 ms, planning 0.465 ms; buffers shared hit=7005 read=0; sorts=0; indexes=ix_questions_created_at_id, ix_question_versions_question_id. Full staff-list path (page + tag + version loads) median 4.36 ms.

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — page query (questions.findMany)</summary>

```sql
SELECT id, type, status, difficulty, marks, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, created_at, updated_at
FROM questions q
WHERE EXISTS (SELECT 1 FROM question_versions v WHERE v.question_id = q.id AND v.search_text LIKE $1 AND v.search_text LIKE $2)
ORDER BY q.created_at DESC, q.id DESC
LIMIT $3
-- parameters: ["%html%","%ওয়েব%",21]
```

```
Limit  (cost=0.83..1333.03 rows=21 width=128) (actual time=0.305..2.390 rows=21 loops=1)
  Buffers: shared hit=2324
  ->  Nested Loop Semi Join  (cost=0.83..72383.26 rows=1141 width=128) (actual time=0.304..2.386 rows=21 loops=1)
        Buffers: shared hit=2324
        ->  Index Scan using ix_questions_created_at_id on questions q  (cost=0.41..4676.85 rows=50000 width=128) (actual time=0.005..0.101 rows=551 loops=1)
              Buffers: shared hit=24
        ->  Index Scan using ix_question_versions_question_id on question_versions v  (cost=0.42..1.35 rows=1 width=16) (actual time=0.004..0.004 rows=0 loops=551)
              Index Cond: (question_id = q.id)
              Filter: ((search_text ~~ '%html%'::text) AND (search_text ~~ '%ওয়েব%'::text))
              Rows Removed by Filter: 3
              Buffers: shared hit=2300
Planning:
  Buffers: shared hit=33
Planning Time: 0.465 ms
Execution Time: 2.411 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — tag load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, tag_id
FROM question_tags
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
-- parameters: ["78971813-a590-42f9-b709-54ba0b35e9a6","cf6277b1-5b84-4e71-94d2-ac0804f284e1","347c7b91-2572-4b63-b1db-4f3f82ed0fde","e13aa6bb-b569-4d6f-9714-e8d0b86eac92","aab27f5d-0441-4cd1-9024-e329ae01e6be","2a76954e-d301-4487-b3fe-74e043387165","449d4e3f-5725-4a58-bb71-3beed113a4f6","525444bc-f069-4abc-9215-b47e859a3611","1642cd97-ed2e-4e0b-9f52-9f2a2f641821","1d062fef-ee2e-43f6-8383-a42c1529a418","7b7531b0-2bc2-45c3-a5bc-c7f559278a4e","668e7d8c-a796-4816-a246-e0fc8d461532","8da67ea4-a67c-4837-8140-737d7c63ed7e","712acbd5-41c6-4a8d-aaa9-203dcc933f66","d5b7a30f-06de-42aa-a91e-3ebd230554f5","55322b75-0bc2-4852-a475-b9cbc6fd6b46","6dcf32a7-42fc-4706-8e91-3a0aaa7ba28b","31af0afe-1072-4590-baee-2f2bdb299945","5d6d15c8-81e9-4584-8202-b01dcc52f1e2","92741e6e-cb49-413f-b378-732d70938d6f","45a2dd12-814c-4b3b-b4c9-896c0a895803"]
```

```
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..161.54 rows=46 width=32) (actual time=0.009..0.058 rows=40 loops=1)
  Index Cond: (question_id = ANY ('{78971813-a590-42f9-b709-54ba0b35e9a6,cf6277b1-5b84-4e71-94d2-ac0804f284e1,347c7b91-2572-4b63-b1db-4f3f82ed0fde,e13aa6bb-b569-4d6f-9714-e8d0b86eac92,aab27f5d-0441-4cd1-9024-e329ae01e6be,2a76954e-d301-4487-b3fe-74e043387165,449d4e3f-5725-4a58-bb71-3beed113a4f6,525444bc-f069-4abc-9215-b47e859a3611,1642cd97-ed2e-4e0b-9f52-9f2a2f641821,1d062fef-ee2e-43f6-8383-a42c1529a418,7b7531b0-2bc2-45c3-a5bc-c7f559278a4e,668e7d8c-a796-4816-a246-e0fc8d461532,8da67ea4-a67c-4837-8140-737d7c63ed7e,712acbd5-41c6-4a8d-aaa9-203dcc933f66,d5b7a30f-06de-42aa-a91e-3ebd230554f5,55322b75-0bc2-4852-a475-b9cbc6fd6b46,6dcf32a7-42fc-4706-8e91-3a0aaa7ba28b,31af0afe-1072-4590-baee-2f2bdb299945,5d6d15c8-81e9-4584-8202-b01dcc52f1e2,92741e6e-cb49-413f-b378-732d70938d6f,45a2dd12-814c-4b3b-b4c9-896c0a895803}'::uuid[]))
  Heap Fetches: 40
  Buffers: shared hit=83
Planning Time: 0.036 ms
Execution Time: 0.066 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — version load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, id, version_number, status, updated_at
FROM question_versions
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
ORDER BY question_id ASC, version_number DESC
-- parameters: ["78971813-a590-42f9-b709-54ba0b35e9a6","cf6277b1-5b84-4e71-94d2-ac0804f284e1","347c7b91-2572-4b63-b1db-4f3f82ed0fde","e13aa6bb-b569-4d6f-9714-e8d0b86eac92","aab27f5d-0441-4cd1-9024-e329ae01e6be","2a76954e-d301-4487-b3fe-74e043387165","449d4e3f-5725-4a58-bb71-3beed113a4f6","525444bc-f069-4abc-9215-b47e859a3611","1642cd97-ed2e-4e0b-9f52-9f2a2f641821","1d062fef-ee2e-43f6-8383-a42c1529a418","7b7531b0-2bc2-45c3-a5bc-c7f559278a4e","668e7d8c-a796-4816-a246-e0fc8d461532","8da67ea4-a67c-4837-8140-737d7c63ed7e","712acbd5-41c6-4a8d-aaa9-203dcc933f66","d5b7a30f-06de-42aa-a91e-3ebd230554f5","55322b75-0bc2-4852-a475-b9cbc6fd6b46","6dcf32a7-42fc-4706-8e91-3a0aaa7ba28b","31af0afe-1072-4590-baee-2f2bdb299945","5d6d15c8-81e9-4584-8202-b01dcc52f1e2","92741e6e-cb49-413f-b378-732d70938d6f","45a2dd12-814c-4b3b-b4c9-896c0a895803"]
```

```
Sort  (cost=344.54..344.70 rows=66 width=48) (actual time=0.091..0.094 rows=62 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=84
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..342.54 rows=66 width=48) (actual time=0.049..0.072 rows=62 loops=1)
        Recheck Cond: (question_id = ANY ('{78971813-a590-42f9-b709-54ba0b35e9a6,cf6277b1-5b84-4e71-94d2-ac0804f284e1,347c7b91-2572-4b63-b1db-4f3f82ed0fde,e13aa6bb-b569-4d6f-9714-e8d0b86eac92,aab27f5d-0441-4cd1-9024-e329ae01e6be,2a76954e-d301-4487-b3fe-74e043387165,449d4e3f-5725-4a58-bb71-3beed113a4f6,525444bc-f069-4abc-9215-b47e859a3611,1642cd97-ed2e-4e0b-9f52-9f2a2f641821,1d062fef-ee2e-43f6-8383-a42c1529a418,7b7531b0-2bc2-45c3-a5bc-c7f559278a4e,668e7d8c-a796-4816-a246-e0fc8d461532,8da67ea4-a67c-4837-8140-737d7c63ed7e,712acbd5-41c6-4a8d-aaa9-203dcc933f66,d5b7a30f-06de-42aa-a91e-3ebd230554f5,55322b75-0bc2-4852-a475-b9cbc6fd6b46,6dcf32a7-42fc-4706-8e91-3a0aaa7ba28b,31af0afe-1072-4590-baee-2f2bdb299945,5d6d15c8-81e9-4584-8202-b01dcc52f1e2,92741e6e-cb49-413f-b378-732d70938d6f,45a2dd12-814c-4b3b-b4c9-896c0a895803}'::uuid[]))
        Heap Blocks: exact=21
        Buffers: shared hit=84
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=66 width=0) (actual time=0.045..0.045 rows=62 loops=1)
              Index Cond: (question_id = ANY ('{78971813-a590-42f9-b709-54ba0b35e9a6,cf6277b1-5b84-4e71-94d2-ac0804f284e1,347c7b91-2572-4b63-b1db-4f3f82ed0fde,e13aa6bb-b569-4d6f-9714-e8d0b86eac92,aab27f5d-0441-4cd1-9024-e329ae01e6be,2a76954e-d301-4487-b3fe-74e043387165,449d4e3f-5725-4a58-bb71-3beed113a4f6,525444bc-f069-4abc-9215-b47e859a3611,1642cd97-ed2e-4e0b-9f52-9f2a2f641821,1d062fef-ee2e-43f6-8383-a42c1529a418,7b7531b0-2bc2-45c3-a5bc-c7f559278a4e,668e7d8c-a796-4816-a246-e0fc8d461532,8da67ea4-a67c-4837-8140-737d7c63ed7e,712acbd5-41c6-4a8d-aaa9-203dcc933f66,d5b7a30f-06de-42aa-a91e-3ebd230554f5,55322b75-0bc2-4852-a475-b9cbc6fd6b46,6dcf32a7-42fc-4706-8e91-3a0aaa7ba28b,31af0afe-1072-4590-baee-2f2bdb299945,5d6d15c8-81e9-4584-8202-b01dcc52f1e2,92741e6e-cb49-413f-b378-732d70938d6f,45a2dd12-814c-4b3b-b4c9-896c0a895803}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.059 ms
Execution Time: 0.107 ms
```
</details>

### 8e. Search: a token that matches nothing (04D)

The worst case for an ordered walk: with no matches to stop early on, a scan of questions ordered by created_at must be abandoned. This is the case the GIN index is for.

Spec: `{"searchTokens":["zzznomatchzzz"],"limit":20}`

Driving scan: Bitmap Heap Scan, Bitmap Index Scan, estimated 2 rows, actual 0 rows.

**Page query** — median wall 1.78 ms over 15 runs (best 1.70 ms); EXPLAIN execution 1.293 ms, planning 0.328 ms; buffers shared hit=1230 read=0; sorts=2; indexes=questions_pkey, ix_question_versions_search_text_trgm. Full staff-list path (page + tag + version loads) median 2.23 ms.

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — page query (questions.findMany)</summary>

```sql
SELECT id, type, status, difficulty, marks, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, created_at, updated_at
FROM questions q
WHERE EXISTS (SELECT 1 FROM question_versions v WHERE v.question_id = q.id AND v.search_text LIKE $1)
ORDER BY q.created_at DESC, q.id DESC
LIMIT $2
-- parameters: ["%zzznomatchzzz%",21]
```

```
Limit  (cost=839.55..839.55 rows=2 width=128) (actual time=1.265..1.266 rows=0 loops=1)
  Buffers: shared hit=171
  ->  Sort  (cost=839.55..839.55 rows=2 width=128) (actual time=1.264..1.265 rows=0 loops=1)
        Sort Key: q.created_at DESC, q.id DESC
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=171
        ->  Nested Loop  (cost=823.20..839.54 rows=2 width=128) (actual time=1.261..1.262 rows=0 loops=1)
              Buffers: shared hit=171
              ->  Unique  (cost=822.91..822.92 rows=2 width=16) (actual time=1.261..1.261 rows=0 loops=1)
                    Buffers: shared hit=171
                    ->  Sort  (cost=822.91..822.92 rows=2 width=16) (actual time=1.261..1.261 rows=0 loops=1)
                          Sort Key: v.question_id
                          Sort Method: quicksort  Memory: 25kB
                          Buffers: shared hit=171
                          ->  Bitmap Heap Scan on question_versions v  (cost=814.96..822.90 rows=2 width=16) (actual time=1.258..1.259 rows=0 loops=1)
                                Recheck Cond: (search_text ~~ '%zzznomatchzzz%'::text)
                                Buffers: shared hit=171
                                ->  Bitmap Index Scan on ix_question_versions_search_text_trgm  (cost=0.00..814.96 rows=2 width=0) (actual time=1.257..1.257 rows=0 loops=1)
                                      Index Cond: (search_text ~~ '%zzznomatchzzz%'::text)
                                      Buffers: shared hit=171
              ->  Index Scan using questions_pkey on questions q  (cost=0.29..8.31 rows=1 width=128) (never executed)
                    Index Cond: (id = v.question_id)
Planning:
  Buffers: shared hit=33
Planning Time: 0.328 ms
Execution Time: 1.293 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — tag load</summary>

```sql
SELECT question_id, tag_id FROM question_tags WHERE false
```

```
Result  (cost=0.00..0.00 rows=0 width=0) (actual time=0.001..0.001 rows=0 loops=1)
  One-Time Filter: false
Planning Time: 0.010 ms
Execution Time: 0.004 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — version load</summary>

```sql
SELECT question_id, id, version_number, status, updated_at FROM question_versions WHERE false
```

```
Result  (cost=0.00..0.00 rows=0 width=0) (actual time=0.001..0.001 rows=0 loops=1)
  One-Time Filter: false
Planning Time: 0.016 ms
Execution Time: 0.005 ms
```
</details>

### 8f. Search: a token that exists only in option text (04D)

The dataset plants zzoptioncanaryzz in one option of every 97th question. A hit proves option text is in the projection; the matching rubric canary zzrubriccanaryzz must never match (asserted in the integration suite).

Spec: `{"searchTokens":["zzoptioncanaryzz"],"limit":20}`

Driving scan: —, estimated ? rows, actual ? rows.

**Page query** — median wall 13.98 ms over 15 runs (best 13.56 ms); EXPLAIN execution 13.435 ms, planning 0.399 ms; buffers shared hit=42297 read=0; sorts=0; indexes=ix_questions_created_at_id, ix_question_versions_question_id. Full staff-list path (page + tag + version loads) median 16.34 ms.

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — page query (questions.findMany)</summary>

```sql
SELECT id, type, status, difficulty, marks, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, created_at, updated_at
FROM questions q
WHERE EXISTS (SELECT 1 FROM question_versions v WHERE v.question_id = q.id AND v.search_text LIKE $1)
ORDER BY q.created_at DESC, q.id DESC
LIMIT $2
-- parameters: ["%zzoptioncanaryzz%",21]
```

```
Limit  (cost=0.83..1319.19 rows=21 width=128) (actual time=0.207..13.404 rows=21 loops=1)
  Buffers: shared hit=14088
  ->  Nested Loop Semi Join  (cost=0.83..72008.32 rows=1147 width=128) (actual time=0.206..13.398 rows=21 loops=1)
        Buffers: shared hit=14088
        ->  Index Scan using ix_questions_created_at_id on questions q  (cost=0.41..4676.85 rows=50000 width=128) (actual time=0.009..0.644 rows=3343 loops=1)
              Buffers: shared hit=110
        ->  Index Scan using ix_question_versions_question_id on question_versions v  (cost=0.42..1.35 rows=1 width=16) (actual time=0.004..0.004 rows=0 loops=3343)
              Index Cond: (question_id = q.id)
              Filter: (search_text ~~ '%zzoptioncanaryzz%'::text)
              Rows Removed by Filter: 3
              Buffers: shared hit=13978
Planning:
  Buffers: shared hit=33
Planning Time: 0.399 ms
Execution Time: 13.435 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — tag load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, tag_id
FROM question_tags
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
-- parameters: ["a0c75b12-e0d6-4268-87f0-0b86f96d6f7c","d837dba7-190c-4fb2-8565-9a02ff1ff3c7","76b6940f-71ca-46c2-89b1-361c58ab9c9c","4b00ce56-437c-4249-8774-33db927ab48c","1438a221-a236-46e3-b407-6c061e1cd1a2","5fbfc53d-2b6b-406d-bef6-636b405cc57a","e3d24e56-ec66-439b-8aaa-970e57d55bd3","d0cc94ca-2786-40bf-943e-e4198ba73ece","6334e0d7-4ccc-415a-9a92-32c076760a67","04ec7c55-c476-4645-9c23-8aa60b4a3e6a","486ef8b5-6828-44c7-b0b8-2c3335952d26","65dd2fdf-2b85-4bbe-be70-e2f8d0b43a61","6511b6e9-e84d-4cd1-923c-6b45c03c72ed","bf138518-dfd9-4cdf-9800-9998c24d8deb","a6aa6f17-fcea-45a4-b419-b41229ab6739","3493a093-38e1-464d-b5b2-aae63161f19a","4ecc4862-99e0-44af-9ec4-f93941845d6a","dfc74405-d38b-40f6-9917-78d897012211","782a9877-fdb0-47dd-9014-5fff7c5504fd","e4e37f38-f8f7-4628-b8a8-3388e963fd48","bd7a870c-21e5-46cf-a2c8-07986c884ac2"]
```

```
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..161.54 rows=46 width=32) (actual time=0.013..0.066 rows=43 loops=1)
  Index Cond: (question_id = ANY ('{a0c75b12-e0d6-4268-87f0-0b86f96d6f7c,d837dba7-190c-4fb2-8565-9a02ff1ff3c7,76b6940f-71ca-46c2-89b1-361c58ab9c9c,4b00ce56-437c-4249-8774-33db927ab48c,1438a221-a236-46e3-b407-6c061e1cd1a2,5fbfc53d-2b6b-406d-bef6-636b405cc57a,e3d24e56-ec66-439b-8aaa-970e57d55bd3,d0cc94ca-2786-40bf-943e-e4198ba73ece,6334e0d7-4ccc-415a-9a92-32c076760a67,04ec7c55-c476-4645-9c23-8aa60b4a3e6a,486ef8b5-6828-44c7-b0b8-2c3335952d26,65dd2fdf-2b85-4bbe-be70-e2f8d0b43a61,6511b6e9-e84d-4cd1-923c-6b45c03c72ed,bf138518-dfd9-4cdf-9800-9998c24d8deb,a6aa6f17-fcea-45a4-b419-b41229ab6739,3493a093-38e1-464d-b5b2-aae63161f19a,4ecc4862-99e0-44af-9ec4-f93941845d6a,dfc74405-d38b-40f6-9917-78d897012211,782a9877-fdb0-47dd-9014-5fff7c5504fd,e4e37f38-f8f7-4628-b8a8-3388e963fd48,bd7a870c-21e5-46cf-a2c8-07986c884ac2}'::uuid[]))
  Heap Fetches: 43
  Buffers: shared hit=85
Planning Time: 0.047 ms
Execution Time: 0.074 ms
```
</details>

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — version load (Prisma relation strategy: query)</summary>

```sql
SELECT question_id, id, version_number, status, updated_at
FROM question_versions
WHERE question_id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid, $21::uuid)
ORDER BY question_id ASC, version_number DESC
-- parameters: ["a0c75b12-e0d6-4268-87f0-0b86f96d6f7c","d837dba7-190c-4fb2-8565-9a02ff1ff3c7","76b6940f-71ca-46c2-89b1-361c58ab9c9c","4b00ce56-437c-4249-8774-33db927ab48c","1438a221-a236-46e3-b407-6c061e1cd1a2","5fbfc53d-2b6b-406d-bef6-636b405cc57a","e3d24e56-ec66-439b-8aaa-970e57d55bd3","d0cc94ca-2786-40bf-943e-e4198ba73ece","6334e0d7-4ccc-415a-9a92-32c076760a67","04ec7c55-c476-4645-9c23-8aa60b4a3e6a","486ef8b5-6828-44c7-b0b8-2c3335952d26","65dd2fdf-2b85-4bbe-be70-e2f8d0b43a61","6511b6e9-e84d-4cd1-923c-6b45c03c72ed","bf138518-dfd9-4cdf-9800-9998c24d8deb","a6aa6f17-fcea-45a4-b419-b41229ab6739","3493a093-38e1-464d-b5b2-aae63161f19a","4ecc4862-99e0-44af-9ec4-f93941845d6a","dfc74405-d38b-40f6-9917-78d897012211","782a9877-fdb0-47dd-9014-5fff7c5504fd","e4e37f38-f8f7-4628-b8a8-3388e963fd48","bd7a870c-21e5-46cf-a2c8-07986c884ac2"]
```

```
Sort  (cost=344.54..344.70 rows=66 width=48) (actual time=0.134..0.138 rows=63 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=89
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..342.54 rows=66 width=48) (actual time=0.071..0.111 rows=63 loops=1)
        Recheck Cond: (question_id = ANY ('{a0c75b12-e0d6-4268-87f0-0b86f96d6f7c,d837dba7-190c-4fb2-8565-9a02ff1ff3c7,76b6940f-71ca-46c2-89b1-361c58ab9c9c,4b00ce56-437c-4249-8774-33db927ab48c,1438a221-a236-46e3-b407-6c061e1cd1a2,5fbfc53d-2b6b-406d-bef6-636b405cc57a,e3d24e56-ec66-439b-8aaa-970e57d55bd3,d0cc94ca-2786-40bf-943e-e4198ba73ece,6334e0d7-4ccc-415a-9a92-32c076760a67,04ec7c55-c476-4645-9c23-8aa60b4a3e6a,486ef8b5-6828-44c7-b0b8-2c3335952d26,65dd2fdf-2b85-4bbe-be70-e2f8d0b43a61,6511b6e9-e84d-4cd1-923c-6b45c03c72ed,bf138518-dfd9-4cdf-9800-9998c24d8deb,a6aa6f17-fcea-45a4-b419-b41229ab6739,3493a093-38e1-464d-b5b2-aae63161f19a,4ecc4862-99e0-44af-9ec4-f93941845d6a,dfc74405-d38b-40f6-9917-78d897012211,782a9877-fdb0-47dd-9014-5fff7c5504fd,e4e37f38-f8f7-4628-b8a8-3388e963fd48,bd7a870c-21e5-46cf-a2c8-07986c884ac2}'::uuid[]))
        Heap Blocks: exact=26
        Buffers: shared hit=89
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=66 width=0) (actual time=0.066..0.066 rows=63 loops=1)
              Index Cond: (question_id = ANY ('{a0c75b12-e0d6-4268-87f0-0b86f96d6f7c,d837dba7-190c-4fb2-8565-9a02ff1ff3c7,76b6940f-71ca-46c2-89b1-361c58ab9c9c,4b00ce56-437c-4249-8774-33db927ab48c,1438a221-a236-46e3-b407-6c061e1cd1a2,5fbfc53d-2b6b-406d-bef6-636b405cc57a,e3d24e56-ec66-439b-8aaa-970e57d55bd3,d0cc94ca-2786-40bf-943e-e4198ba73ece,6334e0d7-4ccc-415a-9a92-32c076760a67,04ec7c55-c476-4645-9c23-8aa60b4a3e6a,486ef8b5-6828-44c7-b0b8-2c3335952d26,65dd2fdf-2b85-4bbe-be70-e2f8d0b43a61,6511b6e9-e84d-4cd1-923c-6b45c03c72ed,bf138518-dfd9-4cdf-9800-9998c24d8deb,a6aa6f17-fcea-45a4-b419-b41229ab6739,3493a093-38e1-464d-b5b2-aae63161f19a,4ecc4862-99e0-44af-9ec4-f93941845d6a,dfc74405-d38b-40f6-9917-78d897012211,782a9877-fdb0-47dd-9014-5fff7c5504fd,e4e37f38-f8f7-4628-b8a8-3388e963fd48,bd7a870c-21e5-46cf-a2c8-07986c884ac2}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.067 ms
Execution Time: 0.155 ms
```
</details>


---

# Part 2 — analysis (reviewed by hand; numbers copied from the runs above)

Part 1 is generated by `scripts/db/perf-list-questions.ts`. Part 2 explains and compares it.
Every number below was produced by a command that is reproduced in this file; nothing here is
estimated, and the two reports were measured on **two databases built from the same seed**, one
before migration 0003 (`ict_perf_04d_before`) and one after it (`ict_perf_04d`).

## 1. Before / after

Both columns are the **median of 15 runs** of the same statement on the same 50,000-question
dataset, page size 20, taken from `04d-before.md` and `04d-after.md`. `Full path` is the staff
list's real path (page query + tag load + version load).

| # | Case | Before (page / full) | After (page / full) | Page speed-up |
| --- | --- | --- | --- | --- |
| 1 | No filter | 24.08 / 25.14 ms | 0.73 / 1.97 ms | 33× |
| 2 | Chapter only | 7.40 / 9.27 ms | 0.48 / 1.82 ms | 15× |
| 3 | Chapter + type + status | 8.87 / 8.83 ms | 0.57 / 1.99 ms | 16× |
| 4 | Board + academic year | 7.57 / 8.90 ms | 4.12 / 5.46 ms | 1.8× |
| 5 | Tag | 15.37 / 16.81 ms | 0.97 / 2.45 ms | 16× |
| 6 | Cursor pagination at page 50 | 23.87 / 28.54 ms | 0.65 / 1.83 ms | 37× |
| 7 | College only | 1.32 / 2.73 ms | 1.04 / 2.94 ms | unchanged (already index-driven) |
| 8a | Search "computer" | not available | 1.16 / 2.42 ms | new feature |
| 8b | Search "কম্পিউটার" | not available | 1.43 / 2.71 ms | new feature |
| 8c | Search "ক্ষ" (conjunct) | not available | 1.12 / 2.37 ms | new feature |
| 8d | Search "html ওয়েব" | not available | 2.98 / 4.36 ms | new feature |
| 8e | Search with no match | not available | 1.78 / 2.23 ms | new feature |
| 8f | Search a token that only exists in options | not available | 13.98 / 16.34 ms | new feature |

Target was **< 50 ms per query** (a target, not a guarantee). Every case is under it, most by a
wide margin. The two slowest are explained in §5.

**Run-to-run variance, stated rather than hidden.** Three independent runs of each side were made
in this sandbox (shared CPU, `fsync=off`). Before: no-filter 23.18–24.90 ms, chapter 5.39–8.67 ms,
chapter+type+status 4.46–8.87 ms, board+year 6.36–7.57 ms, tag 12.04–15.37 ms, page-50
23.34–23.87 ms. After: no-filter 0.67–0.73 ms, chapter 0.45–0.48 ms, chapter+type+status
0.48–0.57 ms, board+year 3.47–4.12 ms, tag 0.90–1.01 ms, page-50 0.63–0.67 ms. The after side is
tight; the before side moves by up to ±40% because a sequential scan's cost depends on cache
state. That does not change any conclusion: the before/after gap is one to two orders of
magnitude, and the plan shapes (below) are identical between before-runs.

## 2. Evidence summary from the plans

* **No filter, page 50 (before).** `Seq Scan on questions` reading all 50,000 rows into a `top-N
  heapsort` for 21 rows — 2,772 shared buffer hits, execution 25.26 ms. After the index exists the
  same query is an `Index Scan using ix_questions_created_at_id` that stops after 21 rows: 6 buffer
  hits, 0.02 ms execution. Page 50 changes nothing about the plan, which is the point of keyset
  paging: the index is walked, not re-sorted.
* **Chapter, chapter+type+status (before).** A bitmap scan on `ix_questions_chapter_id` fetches
  8,255 rows to return 21, then sorts them (2,804 buffer hits). The index does not encode the sort
  order, so PostgreSQL must materialise every match. After: the same ordered index scan, with the
  chapter predicate applied as a filter on the way — 10–12 buffer hits.
* **Board + academic year (before).** `Seq Scan on questions` (50,000 rows) plus a bitmap scan on
  `ix_question_sources_board_id_academic_year_id`, 5,426 buffer hits, 9.08 ms execution. After:
  4.12 ms, still the most expensive of the ordinary cases, because a board-year combination selects
  a large fraction of the table (~8,000 questions in this dataset) and the ordered walk has to skip
  the rows that do not match. See §4 for why a dedicated composite was rejected.
* **Tag (before).** `Seq Scan` + bitmap on `ix_question_tags_tag_id`, 7,705 buffer hits. After:
  0.97 ms, driven by the ordered index with the tag `EXISTS` as a filter.
* **Search (new).** The planner chooses between the ordered index (when a token matches enough
  versions that walking is cheaper) and the trigram GIN index (when it matches almost nothing —
  case 8e is a `Bitmap Index Scan on ix_question_versions_search_text_trgm` with an estimated 2
  rows). Both plans are present in Part 1, unedited.

## 3. Index decisions

Migration 0003 contains **two** indexes. Each was justified by measurement; four other candidates
were built, measured and then dropped, and their rejection is recorded in the migration header too.

| Index | Serves | Decision |
| --- | --- | --- |
| `questions(created_at DESC, id DESC)` (`ix_questions_created_at_id`) | Every unfiltered and filtered page of the staff list, and every cursor page: it is the exact `ORDER BY … LIMIT` the service issues. | **KEPT.** No filter 24.08 → 0.73 ms, page-50 23.87 → 0.65 ms, chapter 7.40 → 0.48 ms. |
| `question_versions USING gin (search_text gin_trgm_ops)` | `q` search: `search_text LIKE '%token%'` for Bangla and English, including conjuncts and partial words. | **KEPT (new feature).** 1.0–3.0 ms per search case; without it a search is a sequential scan of 150,212 versions. |

Rejected candidates, each created → `ANALYZE` → measured with the same harness → dropped:

| Candidate | Measured effect | Verdict |
| --- | --- | --- |
| `questions(chapter_id, type, status, created_at DESC, id DESC)` | chapter+type+status 0.72 ms vs 0.63 ms without it; no-filter and page-50 unchanged within noise | Rejected: no gain, and it would add write cost to every question row. |
| `question_sources(board_id, academic_year_id, question_id)` | board+year 3.57 ms vs 4.35 ms — inside run-to-run noise, and only for one of eleven cases | Rejected. |
| `question_sources(college_id, question_id)` | college 0.89 ms vs 1.24 ms; the existing single-column `ix_question_sources_college_id` already drives the plan | Rejected. |
| `question_tags(tag_id, question_id)` | tag 0.92 ms vs 0.99 ms; `question_tags_pkey` already covers the lookup | Rejected. |
| Sparse combination (a filter matching ~0.01% of rows) with the extra composite | 0.51 ms index-only vs 1.12 ms without | Rejected: it optimises a case the ordered index already answers in ~1 ms, at the cost of another index on the hottest write path. |
| A query that matches **nothing** (board+year+college with no rows) | 1.82 ms, empty result, index still used | Recorded, not an index decision. |

Why not more indexes: each index on `questions` or `question_sources` is maintained on every
authoring write, and the measured benefit of the four rejected candidates was zero to 0.3 ms. The
migration therefore adds the smallest set that makes the *ordering* cheap, and lets the existing
single-column indexes serve the filters as filters.

**Suspected-redundant existing indexes (reported, NOT changed).** `ix_questions_type_status` is a
prefix of `ix_questions_status_type_difficulty` in the reverse order, and
`ix_questions_education_level_id` is a prefix of `ix_questions_education_level_id_subject_id`.
Either may be droppable, but dropping an index is a destructive change and is explicitly out of
scope for 04D; both are recorded here for the owner's approval.

## 4. Search design: maintained projection + trigram, and what was rejected

Three designs were considered. The choice was made on measured behaviour, not preference.

1. **Maintained plain-text projection + `pg_trgm` GIN (SHIPPED).**
   `question_versions.search_text` holds the version's prose — `content` blocks plus its option
   documents — normalised to NFC, lower case, single spaces. Written by the service in the same
   statement as `content`, and re-derivable by the `IMMUTABLE` function `ict_version_search_text`.
2. **`tsvector` + GIN.** Smaller index, no substring support.
3. **Query-time expression index over the JSONB.** Rejected without measuring: PostgreSQL forbids
   subqueries in index expressions, so the option documents (a different table) cannot be part of
   an expression index at all, and every query would have to re-extract the text.

Measured comparison of (1) against (2), on the same 150,212 versions. The alternative index was
`CREATE INDEX ix_alt_tsvector ON question_versions USING gin (to_tsvector('simple', search_text))`,
built in 2,754 ms and dropped afterwards.

| Query | trigram GIN (shipped) | tsvector | matching versions: trigram / tsvector |
| --- | --- | --- | --- |
| English word "computer" | 1.20 ms | 4.72 ms | 15,769 / 15,769 |
| Bangla word "কম্পিউটার" | 1.39 ms | 6.94 ms | 10,784 / 4,853 |
| Bangla conjunct "ক্ষ" (substring) | 1.02 ms | 0.54 ms | 17,065 / **0** |
| English prefix "comput" | 1.04 ms | 4.35 ms | 15,769 / 15,769 |
| English infix "omput" | 1.00 ms | 0.47 ms | 15,769 / **0** |
| mixed "html ওয়েব" | 2.67 ms | 794.43 ms | 4,432 / **0** |
| Bangla infix "ম্পিউটার" | 1.22 ms | 0.47 ms | 10,784 / **0** |
| no match "zzznomatchzzz" | 0.57 ms | 0.49 ms | 0 / 0 |

Index sizes in the same database: **trigram 33 MB**, **tsvector 5.0 MB** (the trigram index had not
merged its pending list yet at measurement time; an earlier measurement after a merge reported
24 MB). The tsvector index is 5–7× smaller and faster on whole-token English queries — but with the
`simple` configuration it cannot answer a Bangla conjunct, an infix, or a mixed Bangla+English
query at all, and the brief requires exactly those. A `tsvector` would also need a trigger or a
second projection to stay current, i.e. more machinery for strictly less behaviour.

**What this search is, and is not.** It is a case-folded, NFC-normalised **substring** search over
prose, with all tokens required in the same version. There is no stemming (`computer` does not
match `computers` as a token, but `comput` does as a substring), no synonym expansion, no ranking,
no semantic or vector similarity, and no cross-version matching. `code.code`, `math.latex`,
`flowchart.description` and `callout.title` are deliberately not indexed (listed in
`server/questions/authoring/search-text.ts`). Answer keys and CQ rubrics are never indexed.

## 5. The two slowest cases, explained

* **Board + academic year, 4.12 ms.** The filter selects ~8,000 of 50,000 questions
  (`Seq Scan` estimated 50,000 → actual 50,000 in the before run), so the ordered walk must skip
  many rows. A dedicated composite was measured and rejected (§3): it saved 0.8 ms inside the
  run-to-run noise.
* **Search for a token that exists only in option text, 13.98 ms.** The token matches 1,032
  versions spread evenly through the table, so the planner prefers walking the ordered index and
  probing the versions table (42,653 buffer hits) over a trigram bitmap that would have to be
  re-sorted. This is the correct trade for the first page; a deep page of such a search is the case
  to watch, and it is recorded as a limitation rather than papered over.

## 6. Operational checks after applying 0003

Run on the 50,000-question / 150,212-version database immediately after the migration was applied:

```sql
SELECT count(*) FROM question_versions WHERE search_text = '';   -- 0
SELECT count(*) AS drifted FROM question_versions v
 WHERE v.search_text IS DISTINCT FROM ict_version_search_text(
         v.content,
         COALESCE((SELECT jsonb_agg(o.content ORDER BY o.sort_order, o.key)
                     FROM question_options o WHERE o.version_id = v.id), '[]'::jsonb));  -- 0
```

`ANALYZE question_versions;` once after applying on a large database (the migration does not
`ANALYZE`, so that a deployment does not block on statistics).

**Leakage canaries.** The seed plants `zzoptioncanaryzz` in option text and `zzrubriccanaryzz` in
CQ rubrics. In the projection: **1,032 versions contain the option canary, 0 contain the rubric
canary** — the answer-key/rubric text is not searchable, while option text is.

## 7. Reproducing this report

```bash
# 1. two disposable databases with the same seed, one with 0003 and one without
bash /tmp/apply.sh ict_perf_04d_before 0001_phase04a_question_bank 0002_identity_audit
bash /tmp/apply.sh ict_perf_04d        0001_phase04a_question_bank 0002_identity_audit \
                                       0003_staff_list_search_performance
# 2. the deterministic dataset (same fingerprints every time)
ICT_PERF_SEED=1 ICT_PERF_DATABASE_URL=…/ict_perf_04d_before node scripts/db/seed-perf.ts
ICT_PERF_SEED=1 ICT_PERF_DATABASE_URL=…/ict_perf_04d        node scripts/db/seed-perf.ts
# 3. the measurements behind Part 1
ICT_PERF_BENCH=1 ICT_PERF_DATABASE_URL=…/ict_perf_04d_before \
  node scripts/db/perf-list-questions.ts --out docs/database/perf/04d-before.md
ICT_PERF_BENCH=1 ICT_PERF_DATABASE_URL=…/ict_perf_04d \
  node scripts/db/perf-list-questions.ts --out docs/database/perf/04d-after.md
```

Both seeds reported the same fingerprints, which is what makes the before/after pair comparable:

```
questions=5ff44f037e945063a3abe7df24e08441
versions=47218dd5990df6d9cc672f55ff8ce8e1
question_tags=4e1b22763844e9e46313d99aeafa82de
```

**Environment deviations, stated.** PostgreSQL 16.16 in this sandbox has only `C`, `C.utf8` and
`POSIX` locales, so the project's `en_US.utf8` collation was not reproducible here; the databases
were created with `LC_COLLATE='C.UTF-8'`. The trigram index is collation-insensitive for the `LIKE`
predicate, but the btree ordering under a different collation may differ for non-ASCII text. All
measurements were taken with `fsync=off`, `synchronous_commit=off`, `full_page_writes=off`,
`shared_buffers=512MB`, `work_mem=64MB` on loopback — the absolute numbers are sandbox numbers, and
they are reported as such.
