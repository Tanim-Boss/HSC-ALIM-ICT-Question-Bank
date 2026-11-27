# Phase 04D — staff list: BEFORE (baseline, no 04D indexes)

> **Machine-generated.** Every plan below was captured by
> `scripts/db/perf-list-questions.ts` from a live PostgreSQL server that ran
> the statements `listQuestionsForStaff` issues. Nothing in this file was
> typed by hand; re-running the harness reproduces it.

## Environment

| Fact | Value |
| --- | --- |
| PostgreSQL | 16.16 |
| Database | ict_perf_04d_before @ 127.0.0.1:55432 (disposable, loopback) |
| Database size | 334 MB |
| Collation (lc_collate) | C.UTF-8 |
| Rows | questions=50000, question_versions=150212 |
| Dataset | scripts/db/seed-perf.ts, fixed seed 0x04d2026 (50,000 questions, ~3 versions each) |
| search_text column | absent (migration 0003 not applied) |
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
| 1. No filter | 24.08 ms | 25.14 ms | 25.25 ms | 0.09 ms | Seq Scan 50000 → 50000 | 2772/0 | 1 | — |
| 2. Chapter only | 7.40 ms | 9.27 ms | 6.86 ms | 0.10 ms | Bitmap Heap Scan, Bitmap Index Scan 8325 → 8255 | 2804/0 | 1 | ix_questions_chapter_id |
| 3. Chapter + type + status | 8.87 ms | 8.83 ms | 8.96 ms | 0.18 ms | Bitmap Heap Scan, Bitmap Index Scan 4652 → 4640 | 2804/0 | 1 | ix_questions_chapter_id |
| 4. Board + academic year | 7.57 ms | 8.90 ms | 9.08 ms | 0.29 ms | Seq Scan, Bitmap Heap Scan, Bitmap Index Scan 50000 → 50000 | 5426/0 | 1 | ix_question_sources_board_id_academic_year_id |
| 5. Tag | 15.37 ms | 16.81 ms | 21.63 ms | 0.53 ms | Seq Scan, Bitmap Heap Scan, Bitmap Index Scan 50000 → 50000 | 7705/0 | 1 | ix_question_tags_tag_id |
| 6. Cursor pagination at page 50 | 23.87 ms | 28.54 ms | 36.19 ms | 0.11 ms | Seq Scan 48994 → 49019 | 2772/0 | 1 | — |
| 7. College only (added by 04D) | 1.32 ms | 2.73 ms | 0.73 ms | 0.20 ms | Bitmap Heap Scan, Bitmap Index Scan 109 → 135 | 2275/0 | 1 | questions_pkey, ix_question_sources_college_id |

_6 search case(s) skipped: the `search_text` projection does not exist in this database, so the feature being measured does not exist yet._

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

Driving scan: Seq Scan, estimated 50000 rows, actual 50000 rows.

**Page query** — median wall 24.08 ms over 15 runs (best 22.68 ms); EXPLAIN execution 25.255 ms, planning 0.088 ms; buffers shared hit=2772 read=0; sorts=1; indexes=—. Full staff-list path (page + tag + version loads) median 25.14 ms.

<details><summary>EXPLAIN (ANALYZE, BUFFERS) — page query (questions.findMany)</summary>

```sql
SELECT id, type, status, difficulty, marks, education_level_id, subject_id, chapter_id, topic_id, subtopic_id, created_at, updated_at
FROM questions q

ORDER BY q.created_at DESC, q.id DESC
LIMIT $1
-- parameters: [21]
```

```
Limit  (cost=2772.08..2772.13 rows=21 width=128) (actual time=25.222..25.226 rows=21 loops=1)
  Buffers: shared hit=924
  ->  Sort  (cost=2772.08..2897.08 rows=50000 width=128) (actual time=25.219..25.221 rows=21 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: top-N heapsort  Memory: 34kB
        Buffers: shared hit=924
        ->  Seq Scan on questions q  (cost=0.00..1424.00 rows=50000 width=128) (actual time=0.006..9.686 rows=50000 loops=1)
              Buffers: shared hit=924
Planning Time: 0.088 ms
Execution Time: 25.255 ms
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
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..93.54 rows=46 width=32) (actual time=0.017..0.059 rows=45 loops=1)
  Index Cond: (question_id = ANY ('{091119cc-a941-47e9-81d9-76dfa15220f0,23aee65a-400d-4e90-88c5-114b29be7601,3c289cdd-6d93-4f2e-a221-2a323fd82d1c,e3bbdec9-fa8e-4455-8127-7057d39ad860,60a6d883-fb8c-4ff0-a958-ad4617caed2c,f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,73907810-dc0e-4a63-aa38-8ca345f97c06,0503d90c-b4e0-4c14-931d-dfe048b5c65b,62ade9fe-9e81-4f7a-be89-5bfb793615fe,8c1b97cc-7353-4a0c-bce7-85d9f8b5ede7,7d0eb37a-77cb-452a-a40a-4c4b4a4a5f15,36871fd5-afee-46fd-bde2-351d1d10bbaf,40aec041-3111-4491-afad-4aefd56207a0,58ab466d-84f0-41f1-9f95-f9d2e7069744,dd4812c6-fb92-4855-84f9-1d2324f1ad88,22748037-69d7-4ca5-a324-df4a06bb40f3,c0342104-346c-4ae3-a836-8af8e7e6cddd,af0845a8-072a-49ef-8c58-f455728507da,c1a58320-bf73-4660-a74c-e35970a18364,cb7a3ede-9a77-4bca-a9a7-226dbcbc2363,4e127561-8f40-41e3-88bf-7a435df0a172}'::uuid[]))
  Heap Fetches: 0
  Buffers: shared hit=64
Planning Time: 0.045 ms
Execution Time: 0.067 ms
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
Sort  (cost=338.22..338.38 rows=65 width=48) (actual time=0.116..0.120 rows=68 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=68
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..336.26 rows=65 width=48) (actual time=0.048..0.095 rows=68 loops=1)
        Recheck Cond: (question_id = ANY ('{091119cc-a941-47e9-81d9-76dfa15220f0,23aee65a-400d-4e90-88c5-114b29be7601,3c289cdd-6d93-4f2e-a221-2a323fd82d1c,e3bbdec9-fa8e-4455-8127-7057d39ad860,60a6d883-fb8c-4ff0-a958-ad4617caed2c,f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,73907810-dc0e-4a63-aa38-8ca345f97c06,0503d90c-b4e0-4c14-931d-dfe048b5c65b,62ade9fe-9e81-4f7a-be89-5bfb793615fe,8c1b97cc-7353-4a0c-bce7-85d9f8b5ede7,7d0eb37a-77cb-452a-a40a-4c4b4a4a5f15,36871fd5-afee-46fd-bde2-351d1d10bbaf,40aec041-3111-4491-afad-4aefd56207a0,58ab466d-84f0-41f1-9f95-f9d2e7069744,dd4812c6-fb92-4855-84f9-1d2324f1ad88,22748037-69d7-4ca5-a324-df4a06bb40f3,c0342104-346c-4ae3-a836-8af8e7e6cddd,af0845a8-072a-49ef-8c58-f455728507da,c1a58320-bf73-4660-a74c-e35970a18364,cb7a3ede-9a77-4bca-a9a7-226dbcbc2363,4e127561-8f40-41e3-88bf-7a435df0a172}'::uuid[]))
        Heap Blocks: exact=5
        Buffers: shared hit=68
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=65 width=0) (actual time=0.044..0.044 rows=68 loops=1)
              Index Cond: (question_id = ANY ('{091119cc-a941-47e9-81d9-76dfa15220f0,23aee65a-400d-4e90-88c5-114b29be7601,3c289cdd-6d93-4f2e-a221-2a323fd82d1c,e3bbdec9-fa8e-4455-8127-7057d39ad860,60a6d883-fb8c-4ff0-a958-ad4617caed2c,f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,73907810-dc0e-4a63-aa38-8ca345f97c06,0503d90c-b4e0-4c14-931d-dfe048b5c65b,62ade9fe-9e81-4f7a-be89-5bfb793615fe,8c1b97cc-7353-4a0c-bce7-85d9f8b5ede7,7d0eb37a-77cb-452a-a40a-4c4b4a4a5f15,36871fd5-afee-46fd-bde2-351d1d10bbaf,40aec041-3111-4491-afad-4aefd56207a0,58ab466d-84f0-41f1-9f95-f9d2e7069744,dd4812c6-fb92-4855-84f9-1d2324f1ad88,22748037-69d7-4ca5-a324-df4a06bb40f3,c0342104-346c-4ae3-a836-8af8e7e6cddd,af0845a8-072a-49ef-8c58-f455728507da,c1a58320-bf73-4660-a74c-e35970a18364,cb7a3ede-9a77-4bca-a9a7-226dbcbc2363,4e127561-8f40-41e3-88bf-7a435df0a172}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.065 ms
Execution Time: 0.136 ms
```
</details>

### 2. Chapter only

One of six chapters — low selectivity (≈25% of the bank).

Spec: `{"chapterId":"1973255b-a315-45df-a9e2-80c3d0cc68ac","searchTokens":[],"limit":20}`

Driving scan: Bitmap Heap Scan, Bitmap Index Scan, estimated 8325 rows, actual 8255 rows.

**Page query** — median wall 7.40 ms over 15 runs (best 7.02 ms); EXPLAIN execution 6.864 ms, planning 0.099 ms; buffers shared hit=2804 read=0; sorts=1; indexes=ix_questions_chapter_id. Full staff-list path (page + tag + version loads) median 9.27 ms.

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
Limit  (cost=1349.33..1349.38 rows=21 width=128) (actual time=6.826..6.831 rows=21 loops=1)
  Buffers: shared hit=932
  ->  Sort  (cost=1349.33..1370.14 rows=8325 width=128) (actual time=6.824..6.827 rows=21 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: top-N heapsort  Memory: 34kB
        Buffers: shared hit=932
        ->  Bitmap Heap Scan on questions q  (cost=96.81..1124.87 rows=8325 width=128) (actual time=0.465..4.039 rows=8255 loops=1)
              Recheck Cond: (chapter_id = '1973255b-a315-45df-a9e2-80c3d0cc68ac'::uuid)
              Heap Blocks: exact=924
              Buffers: shared hit=932
              ->  Bitmap Index Scan on ix_questions_chapter_id  (cost=0.00..94.73 rows=8325 width=0) (actual time=0.361..0.361 rows=8255 loops=1)
                    Index Cond: (chapter_id = '1973255b-a315-45df-a9e2-80c3d0cc68ac'::uuid)
                    Buffers: shared hit=8
Planning Time: 0.099 ms
Execution Time: 6.864 ms
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
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..93.54 rows=46 width=32) (actual time=0.010..0.060 rows=47 loops=1)
  Index Cond: (question_id = ANY ('{c1a58320-bf73-4660-a74c-e35970a18364,4e127561-8f40-41e3-88bf-7a435df0a172,6db11483-8728-49d1-b70c-a1c57f21f242,99fc2220-2c38-4b6d-af21-ff138f3fad2e,a073dcfe-10e1-4c3f-82be-fb3145ec43db,a0c75b12-e0d6-4268-87f0-0b86f96d6f7c,cbd344b9-fa16-4db2-a8d7-2071ecbba6c3,80ee2869-eb5f-4bda-97b7-770691d6ddac,6521a53d-7c69-41a3-8cbf-ba6775966082,23c48637-1cbc-48e9-a966-e0a1134badbe,9d6857ff-7672-48c1-b3ab-be8b281725b2,295260c6-692e-451e-b9b9-353c5c1386a3,1cbafb31-f230-4d3b-9920-899a62355908,210c0ea1-fa40-4f02-8615-55e242bc98f7,861ac719-0977-4a51-8f7f-c5e0aebce1ea,35533240-7c52-4f3e-bb96-6e424a24e496,2c7ac8c4-c153-442f-8581-5c93a3debfbe,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,d9735c51-bce4-4ea7-b0a0-9ff9cfd2ceba,d837dba7-190c-4fb2-8565-9a02ff1ff3c7,05303e12-6dbf-4441-833f-ac2625a5664b}'::uuid[]))
  Heap Fetches: 0
  Buffers: shared hit=64
Planning Time: 0.046 ms
Execution Time: 0.069 ms
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
Sort  (cost=338.22..338.38 rows=65 width=48) (actual time=0.111..0.117 rows=67 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=82
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..336.26 rows=65 width=48) (actual time=0.053..0.086 rows=67 loops=1)
        Recheck Cond: (question_id = ANY ('{c1a58320-bf73-4660-a74c-e35970a18364,4e127561-8f40-41e3-88bf-7a435df0a172,6db11483-8728-49d1-b70c-a1c57f21f242,99fc2220-2c38-4b6d-af21-ff138f3fad2e,a073dcfe-10e1-4c3f-82be-fb3145ec43db,a0c75b12-e0d6-4268-87f0-0b86f96d6f7c,cbd344b9-fa16-4db2-a8d7-2071ecbba6c3,80ee2869-eb5f-4bda-97b7-770691d6ddac,6521a53d-7c69-41a3-8cbf-ba6775966082,23c48637-1cbc-48e9-a966-e0a1134badbe,9d6857ff-7672-48c1-b3ab-be8b281725b2,295260c6-692e-451e-b9b9-353c5c1386a3,1cbafb31-f230-4d3b-9920-899a62355908,210c0ea1-fa40-4f02-8615-55e242bc98f7,861ac719-0977-4a51-8f7f-c5e0aebce1ea,35533240-7c52-4f3e-bb96-6e424a24e496,2c7ac8c4-c153-442f-8581-5c93a3debfbe,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,d9735c51-bce4-4ea7-b0a0-9ff9cfd2ceba,d837dba7-190c-4fb2-8565-9a02ff1ff3c7,05303e12-6dbf-4441-833f-ac2625a5664b}'::uuid[]))
        Heap Blocks: exact=19
        Buffers: shared hit=82
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=65 width=0) (actual time=0.049..0.049 rows=67 loops=1)
              Index Cond: (question_id = ANY ('{c1a58320-bf73-4660-a74c-e35970a18364,4e127561-8f40-41e3-88bf-7a435df0a172,6db11483-8728-49d1-b70c-a1c57f21f242,99fc2220-2c38-4b6d-af21-ff138f3fad2e,a073dcfe-10e1-4c3f-82be-fb3145ec43db,a0c75b12-e0d6-4268-87f0-0b86f96d6f7c,cbd344b9-fa16-4db2-a8d7-2071ecbba6c3,80ee2869-eb5f-4bda-97b7-770691d6ddac,6521a53d-7c69-41a3-8cbf-ba6775966082,23c48637-1cbc-48e9-a966-e0a1134badbe,9d6857ff-7672-48c1-b3ab-be8b281725b2,295260c6-692e-451e-b9b9-353c5c1386a3,1cbafb31-f230-4d3b-9920-899a62355908,210c0ea1-fa40-4f02-8615-55e242bc98f7,861ac719-0977-4a51-8f7f-c5e0aebce1ea,35533240-7c52-4f3e-bb96-6e424a24e496,2c7ac8c4-c153-442f-8581-5c93a3debfbe,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,d9735c51-bce4-4ea7-b0a0-9ff9cfd2ceba,d837dba7-190c-4fb2-8565-9a02ff1ff3c7,05303e12-6dbf-4441-833f-ac2625a5664b}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.061 ms
Execution Time: 0.134 ms
```
</details>

### 3. Chapter + type + status

Chapter 3 + MCQ + PUBLISHED: the common authoring screen.

Spec: `{"chapterId":"1973255b-a315-45df-a9e2-80c3d0cc68ac","type":"MCQ","status":"PUBLISHED","searchTokens":[],"limit":20}`

Driving scan: Bitmap Heap Scan, Bitmap Index Scan, estimated 4652 rows, actual 4640 rows.

**Page query** — median wall 8.87 ms over 15 runs (best 6.06 ms); EXPLAIN execution 8.955 ms, planning 0.176 ms; buffers shared hit=2804 read=0; sorts=1; indexes=ix_questions_chapter_id. Full staff-list path (page + tag + version loads) median 8.83 ms.

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
Limit  (cost=1291.00..1291.06 rows=21 width=128) (actual time=8.905..8.911 rows=21 loops=1)
  Buffers: shared hit=932
  ->  Sort  (cost=1291.00..1302.63 rows=4652 width=128) (actual time=8.902..8.905 rows=21 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: top-N heapsort  Memory: 33kB
        Buffers: shared hit=932
        ->  Bitmap Heap Scan on questions q  (cost=95.89..1165.58 rows=4652 width=128) (actual time=0.711..6.023 rows=4640 loops=1)
              Recheck Cond: (chapter_id = '1973255b-a315-45df-a9e2-80c3d0cc68ac'::uuid)
              Filter: ((type = 'MCQ'::"QuestionType") AND (status = 'PUBLISHED'::"QuestionStatus"))
              Rows Removed by Filter: 3615
              Heap Blocks: exact=924
              Buffers: shared hit=932
              ->  Bitmap Index Scan on ix_questions_chapter_id  (cost=0.00..94.73 rows=8325 width=0) (actual time=0.572..0.572 rows=8255 loops=1)
                    Index Cond: (chapter_id = '1973255b-a315-45df-a9e2-80c3d0cc68ac'::uuid)
                    Buffers: shared hit=8
Planning Time: 0.176 ms
Execution Time: 8.955 ms
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
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..93.54 rows=46 width=32) (actual time=0.009..0.057 rows=44 loops=1)
  Index Cond: (question_id = ANY ('{4e127561-8f40-41e3-88bf-7a435df0a172,6db11483-8728-49d1-b70c-a1c57f21f242,99fc2220-2c38-4b6d-af21-ff138f3fad2e,a0c75b12-e0d6-4268-87f0-0b86f96d6f7c,80ee2869-eb5f-4bda-97b7-770691d6ddac,6521a53d-7c69-41a3-8cbf-ba6775966082,295260c6-692e-451e-b9b9-353c5c1386a3,1cbafb31-f230-4d3b-9920-899a62355908,861ac719-0977-4a51-8f7f-c5e0aebce1ea,35533240-7c52-4f3e-bb96-6e424a24e496,2c7ac8c4-c153-442f-8581-5c93a3debfbe,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,d837dba7-190c-4fb2-8565-9a02ff1ff3c7,05303e12-6dbf-4441-833f-ac2625a5664b,628a9aac-deb3-4453-8ec7-0569fbabc162,1f0327c1-d6cc-485b-b538-d9b5ced58793,4ccd707e-1fcf-4403-8bef-f9c98df28378,7754a376-e394-40d6-8ae7-b79422eb1e8b,8a605900-150a-49b2-8908-84ffc4f91787,22797492-8e75-4eb1-a138-39722eb14ee8,1ec2b030-0622-4237-a2c4-43b686159c0d}'::uuid[]))
  Heap Fetches: 0
  Buffers: shared hit=64
Planning Time: 0.048 ms
Execution Time: 0.066 ms
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
Sort  (cost=338.22..338.38 rows=65 width=48) (actual time=0.099..0.102 rows=63 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=84
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..336.26 rows=65 width=48) (actual time=0.051..0.078 rows=63 loops=1)
        Recheck Cond: (question_id = ANY ('{4e127561-8f40-41e3-88bf-7a435df0a172,6db11483-8728-49d1-b70c-a1c57f21f242,99fc2220-2c38-4b6d-af21-ff138f3fad2e,a0c75b12-e0d6-4268-87f0-0b86f96d6f7c,80ee2869-eb5f-4bda-97b7-770691d6ddac,6521a53d-7c69-41a3-8cbf-ba6775966082,295260c6-692e-451e-b9b9-353c5c1386a3,1cbafb31-f230-4d3b-9920-899a62355908,861ac719-0977-4a51-8f7f-c5e0aebce1ea,35533240-7c52-4f3e-bb96-6e424a24e496,2c7ac8c4-c153-442f-8581-5c93a3debfbe,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,d837dba7-190c-4fb2-8565-9a02ff1ff3c7,05303e12-6dbf-4441-833f-ac2625a5664b,628a9aac-deb3-4453-8ec7-0569fbabc162,1f0327c1-d6cc-485b-b538-d9b5ced58793,4ccd707e-1fcf-4403-8bef-f9c98df28378,7754a376-e394-40d6-8ae7-b79422eb1e8b,8a605900-150a-49b2-8908-84ffc4f91787,22797492-8e75-4eb1-a138-39722eb14ee8,1ec2b030-0622-4237-a2c4-43b686159c0d}'::uuid[]))
        Heap Blocks: exact=21
        Buffers: shared hit=84
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=65 width=0) (actual time=0.046..0.046 rows=63 loops=1)
              Index Cond: (question_id = ANY ('{4e127561-8f40-41e3-88bf-7a435df0a172,6db11483-8728-49d1-b70c-a1c57f21f242,99fc2220-2c38-4b6d-af21-ff138f3fad2e,a0c75b12-e0d6-4268-87f0-0b86f96d6f7c,80ee2869-eb5f-4bda-97b7-770691d6ddac,6521a53d-7c69-41a3-8cbf-ba6775966082,295260c6-692e-451e-b9b9-353c5c1386a3,1cbafb31-f230-4d3b-9920-899a62355908,861ac719-0977-4a51-8f7f-c5e0aebce1ea,35533240-7c52-4f3e-bb96-6e424a24e496,2c7ac8c4-c153-442f-8581-5c93a3debfbe,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,d837dba7-190c-4fb2-8565-9a02ff1ff3c7,05303e12-6dbf-4441-833f-ac2625a5664b,628a9aac-deb3-4453-8ec7-0569fbabc162,1f0327c1-d6cc-485b-b538-d9b5ced58793,4ccd707e-1fcf-4403-8bef-f9c98df28378,7754a376-e394-40d6-8ae7-b79422eb1e8b,8a605900-150a-49b2-8908-84ffc4f91787,22797492-8e75-4eb1-a138-39722eb14ee8,1ec2b030-0622-4237-a2c4-43b686159c0d}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.066 ms
Execution Time: 0.118 ms
```
</details>

### 4. Board + academic year

Dhaka board 2023 — one attribution row must hold both.

Spec: `{"boardId":"675711ac-1448-4f1b-b367-db1e8a655d89","academicYearId":"50991b4f-0928-4203-810c-ebf203d0bca6","searchTokens":[],"limit":20}`

Driving scan: Seq Scan, Bitmap Heap Scan, Bitmap Index Scan, estimated 50000 rows, actual 50000 rows.

**Page query** — median wall 7.57 ms over 15 runs (best 6.79 ms); EXPLAIN execution 9.077 ms, planning 0.289 ms; buffers shared hit=5426 read=0; sorts=1; indexes=ix_question_sources_board_id_academic_year_id. Full staff-list path (page + tag + version loads) median 8.90 ms.

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
Limit  (cost=2242.14..2242.19 rows=21 width=128) (actual time=9.030..9.036 rows=21 loops=1)
  Buffers: shared hit=1264
  ->  Sort  (cost=2242.14..2243.14 rows=401 width=128) (actual time=9.027..9.031 rows=21 loops=1)
        Sort Key: q.created_at DESC, q.id DESC
        Sort Method: top-N heapsort  Memory: 34kB
        Buffers: shared hit=1264
        ->  Hash Semi Join  (cost=671.61..2231.33 rows=401 width=128) (actual time=0.625..8.761 rows=443 loops=1)
              Hash Cond: (q.id = s.question_id)
              Buffers: shared hit=1264
              ->  Seq Scan on questions q  (cost=0.00..1424.00 rows=50000 width=128) (actual time=0.003..3.779 rows=50000 loops=1)
                    Buffers: shared hit=924
              ->  Hash  (cost=666.60..666.60 rows=401 width=16) (actual time=0.593..0.595 rows=443 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 29kB
                    Buffers: shared hit=340
                    ->  Bitmap Heap Scan on question_sources s  (cost=8.40..666.60 rows=401 width=16) (actual time=0.077..0.472 rows=443 loops=1)
                          Recheck Cond: ((board_id = '675711ac-1448-4f1b-b367-db1e8a655d89'::uuid) AND (academic_year_id = '50991b4f-0928-4203-810c-ebf203d0bca6'::uuid))
                          Heap Blocks: exact=338
                          Buffers: shared hit=340
                          ->  Bitmap Index Scan on ix_question_sources_board_id_academic_year_id  (cost=0.00..8.30 rows=401 width=0) (actual time=0.044..0.044 rows=443 loops=1)
                                Index Cond: ((board_id = '675711ac-1448-4f1b-b367-db1e8a655d89'::uuid) AND (academic_year_id = '50991b4f-0928-4203-810c-ebf203d0bca6'::uuid))
                                Buffers: shared hit=2
Planning:
  Buffers: shared hit=28
Planning Time: 0.289 ms
Execution Time: 9.077 ms
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
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..93.54 rows=46 width=32) (actual time=0.010..0.044 rows=45 loops=1)
  Index Cond: (question_id = ANY ('{3f49b9c4-a88f-4bf1-87b7-2b041c6a3834,fe22857f-96c5-49f3-9302-00d1932ceb64,290b2815-2f38-405b-bdd8-c1e79525357c,6b870afc-d7e2-4c68-8deb-dbb57db7f5a9,431bf4d1-af0a-469e-bc37-6bee18fa68ee,702f9e0c-89b0-4d06-94e5-28860b74618d,9cc51908-ae87-4049-97ae-ad99496fdf3f,fe11e470-1b79-477f-b550-477a8e4e2cc1,ed6f6956-298e-462a-8bb7-6e8dd3e89710,f4a2ce43-f709-4466-887c-a2d34812f227,89023c47-f0d1-430e-9b8a-e782d27f9bc1,6cded56b-be11-4988-99bf-7ca142fec41a,34eda702-f218-4000-b26a-203edf011e55,66631f98-895a-48e9-81a6-27b67a9dc676,97d47107-4998-448b-8b26-cab83a7a7f8e,7c750659-1929-4605-8b2d-6e9ad23a9b1a,988d4491-62af-4b8d-a2f0-e83a6f0d109f,8fe91ba3-e451-4b2b-b61b-60626ab492c6,6fde7fa0-d1af-4b3f-9e78-9b6affaf8ec2,2cf716f6-6000-44e2-a05c-6759bd0f91a4,d1393ae1-e2b7-46d8-89b4-8060ff540b73}'::uuid[]))
  Heap Fetches: 0
  Buffers: shared hit=64
Planning Time: 0.044 ms
Execution Time: 0.052 ms
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
Sort  (cost=338.22..338.38 rows=65 width=48) (actual time=0.092..0.095 rows=63 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=89
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..336.26 rows=65 width=48) (actual time=0.046..0.073 rows=63 loops=1)
        Recheck Cond: (question_id = ANY ('{3f49b9c4-a88f-4bf1-87b7-2b041c6a3834,fe22857f-96c5-49f3-9302-00d1932ceb64,290b2815-2f38-405b-bdd8-c1e79525357c,6b870afc-d7e2-4c68-8deb-dbb57db7f5a9,431bf4d1-af0a-469e-bc37-6bee18fa68ee,702f9e0c-89b0-4d06-94e5-28860b74618d,9cc51908-ae87-4049-97ae-ad99496fdf3f,fe11e470-1b79-477f-b550-477a8e4e2cc1,ed6f6956-298e-462a-8bb7-6e8dd3e89710,f4a2ce43-f709-4466-887c-a2d34812f227,89023c47-f0d1-430e-9b8a-e782d27f9bc1,6cded56b-be11-4988-99bf-7ca142fec41a,34eda702-f218-4000-b26a-203edf011e55,66631f98-895a-48e9-81a6-27b67a9dc676,97d47107-4998-448b-8b26-cab83a7a7f8e,7c750659-1929-4605-8b2d-6e9ad23a9b1a,988d4491-62af-4b8d-a2f0-e83a6f0d109f,8fe91ba3-e451-4b2b-b61b-60626ab492c6,6fde7fa0-d1af-4b3f-9e78-9b6affaf8ec2,2cf716f6-6000-44e2-a05c-6759bd0f91a4,d1393ae1-e2b7-46d8-89b4-8060ff540b73}'::uuid[]))
        Heap Blocks: exact=26
        Buffers: shared hit=89
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=65 width=0) (actual time=0.040..0.040 rows=63 loops=1)
              Index Cond: (question_id = ANY ('{3f49b9c4-a88f-4bf1-87b7-2b041c6a3834,fe22857f-96c5-49f3-9302-00d1932ceb64,290b2815-2f38-405b-bdd8-c1e79525357c,6b870afc-d7e2-4c68-8deb-dbb57db7f5a9,431bf4d1-af0a-469e-bc37-6bee18fa68ee,702f9e0c-89b0-4d06-94e5-28860b74618d,9cc51908-ae87-4049-97ae-ad99496fdf3f,fe11e470-1b79-477f-b550-477a8e4e2cc1,ed6f6956-298e-462a-8bb7-6e8dd3e89710,f4a2ce43-f709-4466-887c-a2d34812f227,89023c47-f0d1-430e-9b8a-e782d27f9bc1,6cded56b-be11-4988-99bf-7ca142fec41a,34eda702-f218-4000-b26a-203edf011e55,66631f98-895a-48e9-81a6-27b67a9dc676,97d47107-4998-448b-8b26-cab83a7a7f8e,7c750659-1929-4605-8b2d-6e9ad23a9b1a,988d4491-62af-4b8d-a2f0-e83a6f0d109f,8fe91ba3-e451-4b2b-b61b-60626ab492c6,6fde7fa0-d1af-4b3f-9e78-9b6affaf8ec2,2cf716f6-6000-44e2-a05c-6759bd0f91a4,d1393ae1-e2b7-46d8-89b4-8060ff540b73}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.061 ms
Execution Time: 0.110 ms
```
</details>

### 5. Tag

A single tag with the long tail: most questions carry one or two.

Spec: `{"tagId":"68837aba-b272-40a0-95f0-f9c162a44821","searchTokens":[],"limit":20}`

Driving scan: Seq Scan, Bitmap Heap Scan, Bitmap Index Scan, estimated 50000 rows, actual 50000 rows.

**Page query** — median wall 15.37 ms over 15 runs (best 13.42 ms); EXPLAIN execution 21.632 ms, planning 0.527 ms; buffers shared hit=7705 read=0; sorts=1; indexes=ix_question_tags_tag_id. Full staff-list path (page + tag + version loads) median 16.81 ms.

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
Limit  (cost=2731.18..2731.23 rows=21 width=128) (actual time=21.577..21.584 rows=21 loops=1)
  Buffers: shared hit=1719
  ->  Sort  (cost=2731.18..2746.20 rows=6006 width=128) (actual time=21.574..21.579 rows=21 loops=1)
        Sort Key: q.created_at DESC, q.id DESC
        Sort Method: top-N heapsort  Memory: 33kB
        Buffers: shared hit=1719
        ->  Hash Join  (cost=1013.99..2569.25 rows=6006 width=128) (actual time=4.767..18.812 rows=6000 loops=1)
              Hash Cond: (q.id = t.question_id)
              Buffers: shared hit=1719
              ->  Seq Scan on questions q  (cost=0.00..1424.00 rows=50000 width=128) (actual time=0.003..4.997 rows=50000 loops=1)
                    Buffers: shared hit=924
              ->  Hash  (cost=938.91..938.91 rows=6006 width=16) (actual time=4.711..4.713 rows=6000 loops=1)
                    Buckets: 8192  Batches: 1  Memory Usage: 346kB
                    Buffers: shared hit=795
                    ->  Bitmap Heap Scan on question_tags t  (cost=74.84..938.91 rows=6006 width=16) (actual time=0.507..3.282 rows=6000 loops=1)
                          Recheck Cond: (tag_id = '68837aba-b272-40a0-95f0-f9c162a44821'::uuid)
                          Heap Blocks: exact=789
                          Buffers: shared hit=795
                          ->  Bitmap Index Scan on ix_question_tags_tag_id  (cost=0.00..73.34 rows=6006 width=0) (actual time=0.396..0.397 rows=6000 loops=1)
                                Index Cond: (tag_id = '68837aba-b272-40a0-95f0-f9c162a44821'::uuid)
                                Buffers: shared hit=6
Planning:
  Buffers: shared hit=28
Planning Time: 0.527 ms
Execution Time: 21.632 ms
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
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..93.54 rows=46 width=32) (actual time=0.007..0.040 rows=46 loops=1)
  Index Cond: (question_id = ANY ('{f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,0503d90c-b4e0-4c14-931d-dfe048b5c65b,1c581dd0-66a4-4b0c-bf50-56d891f6de10,6f56ef5a-1ae8-4c31-adb3-fd09b932ba93,cbd344b9-fa16-4db2-a8d7-2071ecbba6c3,d249e358-6b60-4ce7-805b-b539dae1dac7,a02f6575-3fd2-4229-80fc-6ecbc450c53e,835f2092-6af7-42f1-b974-3748d95265cd,74a245ac-3c31-42b1-95f8-24b08d9325cd,4dc28e05-4b2c-4236-8a6c-6ee4f3b1b11b,98cf2ba1-f2c7-41ef-b09d-9d6696d5cad2,d9abbc7c-c0a2-4249-8408-402dc8d06aa9,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,813cee6f-dc74-4294-931a-67ad7986a8c2,aab27f5d-0441-4cd1-9024-e329ae01e6be,5b306fda-76e7-4ad9-8070-fff3ddc43aff,5f1053e8-53e4-45b8-b01e-f1d54c47c86b,f788e4c7-39b5-45ca-af04-856a3b204a93,7dcd6180-d4db-4552-a8a8-326191c71525,1daebf9a-0dfc-46a3-a405-180c21e54b0d,4ade40c5-7fa9-48e6-a021-dd34da5ba6b6}'::uuid[]))
  Heap Fetches: 0
  Buffers: shared hit=64
Planning Time: 0.036 ms
Execution Time: 0.055 ms
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
Sort  (cost=338.22..338.38 rows=65 width=48) (actual time=0.116..0.120 rows=72 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 30kB
  Buffers: shared hit=82
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..336.26 rows=65 width=48) (actual time=0.058..0.084 rows=72 loops=1)
        Recheck Cond: (question_id = ANY ('{f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,0503d90c-b4e0-4c14-931d-dfe048b5c65b,1c581dd0-66a4-4b0c-bf50-56d891f6de10,6f56ef5a-1ae8-4c31-adb3-fd09b932ba93,cbd344b9-fa16-4db2-a8d7-2071ecbba6c3,d249e358-6b60-4ce7-805b-b539dae1dac7,a02f6575-3fd2-4229-80fc-6ecbc450c53e,835f2092-6af7-42f1-b974-3748d95265cd,74a245ac-3c31-42b1-95f8-24b08d9325cd,4dc28e05-4b2c-4236-8a6c-6ee4f3b1b11b,98cf2ba1-f2c7-41ef-b09d-9d6696d5cad2,d9abbc7c-c0a2-4249-8408-402dc8d06aa9,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,813cee6f-dc74-4294-931a-67ad7986a8c2,aab27f5d-0441-4cd1-9024-e329ae01e6be,5b306fda-76e7-4ad9-8070-fff3ddc43aff,5f1053e8-53e4-45b8-b01e-f1d54c47c86b,f788e4c7-39b5-45ca-af04-856a3b204a93,7dcd6180-d4db-4552-a8a8-326191c71525,1daebf9a-0dfc-46a3-a405-180c21e54b0d,4ade40c5-7fa9-48e6-a021-dd34da5ba6b6}'::uuid[]))
        Heap Blocks: exact=19
        Buffers: shared hit=82
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=65 width=0) (actual time=0.054..0.054 rows=72 loops=1)
              Index Cond: (question_id = ANY ('{f8ca7ab4-efd8-44b8-837e-31fde6d2ba9c,0503d90c-b4e0-4c14-931d-dfe048b5c65b,1c581dd0-66a4-4b0c-bf50-56d891f6de10,6f56ef5a-1ae8-4c31-adb3-fd09b932ba93,cbd344b9-fa16-4db2-a8d7-2071ecbba6c3,d249e358-6b60-4ce7-805b-b539dae1dac7,a02f6575-3fd2-4229-80fc-6ecbc450c53e,835f2092-6af7-42f1-b974-3748d95265cd,74a245ac-3c31-42b1-95f8-24b08d9325cd,4dc28e05-4b2c-4236-8a6c-6ee4f3b1b11b,98cf2ba1-f2c7-41ef-b09d-9d6696d5cad2,d9abbc7c-c0a2-4249-8408-402dc8d06aa9,6f78fd30-a7c2-441a-9664-ca3dbdacbd72,813cee6f-dc74-4294-931a-67ad7986a8c2,aab27f5d-0441-4cd1-9024-e329ae01e6be,5b306fda-76e7-4ad9-8070-fff3ddc43aff,5f1053e8-53e4-45b8-b01e-f1d54c47c86b,f788e4c7-39b5-45ca-af04-856a3b204a93,7dcd6180-d4db-4552-a8a8-326191c71525,1daebf9a-0dfc-46a3-a405-180c21e54b0d,4ade40c5-7fa9-48e6-a021-dd34da5ba6b6}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.071 ms
Execution Time: 0.145 ms
```
</details>

### 6. Cursor pagination at page 50

Keyset cursor at row 1,000; the query after it is page 51.

Spec: `{"searchTokens":[],"limit":20,"cursor":{"createdAt":"2026-10-26T12:12:30.353Z","id":"0cab3581-acfc-4f88-847c-77bd9e7571f9"}}`

Driving scan: Seq Scan, estimated 48994 rows, actual 49019 rows.

**Page query** — median wall 23.87 ms over 15 runs (best 23.56 ms); EXPLAIN execution 36.189 ms, planning 0.109 ms; buffers shared hit=2772 read=0; sorts=1; indexes=—. Full staff-list path (page + tag + version loads) median 28.54 ms.

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
Limit  (cost=3119.96..3120.01 rows=21 width=128) (actual time=36.151..36.157 rows=21 loops=1)
  Buffers: shared hit=924
  ->  Sort  (cost=3119.96..3242.44 rows=48994 width=128) (actual time=36.148..36.151 rows=21 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: top-N heapsort  Memory: 33kB
        Buffers: shared hit=924
        ->  Seq Scan on questions q  (cost=0.00..1799.00 rows=48994 width=128) (actual time=0.008..15.018 rows=49019 loops=1)
              Filter: ((created_at < '2026-10-26 12:12:30.353+00'::timestamp with time zone) OR ((created_at = '2026-10-26 12:12:30.353+00'::timestamp with time zone) AND (id < '0cab3581-acfc-4f88-847c-77bd9e7571f9'::uuid)))
              Rows Removed by Filter: 981
              Buffers: shared hit=924
Planning Time: 0.109 ms
Execution Time: 36.189 ms
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
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..93.54 rows=46 width=32) (actual time=0.015..0.044 rows=31 loops=1)
  Index Cond: (question_id = ANY ('{d67cd94e-8477-4ab3-9ab4-fc05ddab7b69,34eda702-f218-4000-b26a-203edf011e55,3c7aa339-556a-4514-920f-199c92205da1,f871cd0e-9bb8-4b09-be83-871291758c07,ccbb6f79-4477-4e55-9c98-f86ee16799d2,ca335e28-fadf-46e8-b6cb-e41cb2145cfd,36d280be-9471-49d9-b04d-fa52ffcf3333,ee221598-f4be-46c7-8cc3-6367624c2f6f,11f83dd3-e514-4a81-8d05-6f1d052f3394,d20754c9-a572-4cc5-b3f3-8fd503efffac,8cabe306-b687-4723-bb56-a3362c4661a0,7c0fc8b2-28f6-42a5-bde8-d9cf81f93123,89ee4d63-cc16-49e5-8d82-35da1f183ffd,619816fc-284d-4321-a315-bc42dd179004,50cb2a8a-79c9-4c58-a571-5a362db4a22f,c203a9eb-ccda-46e5-8eee-807296ebbc50,3243ce5e-f8c4-4847-a8df-1603921d79f8,2e13047d-e4c1-4fdc-8e2a-8f9a5c419097,b6a70fa0-ef43-4112-90b5-778d9f7505b0,acc15728-24ea-4293-b103-697e389a8917,72054db3-0ae3-4bb8-abb0-57780b3cf244}'::uuid[]))
  Heap Fetches: 0
  Buffers: shared hit=64
Planning Time: 0.034 ms
Execution Time: 0.050 ms
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
Sort  (cost=338.22..338.38 rows=65 width=48) (actual time=0.114..0.117 rows=62 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=67
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..336.26 rows=65 width=48) (actual time=0.075..0.092 rows=62 loops=1)
        Recheck Cond: (question_id = ANY ('{d67cd94e-8477-4ab3-9ab4-fc05ddab7b69,34eda702-f218-4000-b26a-203edf011e55,3c7aa339-556a-4514-920f-199c92205da1,f871cd0e-9bb8-4b09-be83-871291758c07,ccbb6f79-4477-4e55-9c98-f86ee16799d2,ca335e28-fadf-46e8-b6cb-e41cb2145cfd,36d280be-9471-49d9-b04d-fa52ffcf3333,ee221598-f4be-46c7-8cc3-6367624c2f6f,11f83dd3-e514-4a81-8d05-6f1d052f3394,d20754c9-a572-4cc5-b3f3-8fd503efffac,8cabe306-b687-4723-bb56-a3362c4661a0,7c0fc8b2-28f6-42a5-bde8-d9cf81f93123,89ee4d63-cc16-49e5-8d82-35da1f183ffd,619816fc-284d-4321-a315-bc42dd179004,50cb2a8a-79c9-4c58-a571-5a362db4a22f,c203a9eb-ccda-46e5-8eee-807296ebbc50,3243ce5e-f8c4-4847-a8df-1603921d79f8,2e13047d-e4c1-4fdc-8e2a-8f9a5c419097,b6a70fa0-ef43-4112-90b5-778d9f7505b0,acc15728-24ea-4293-b103-697e389a8917,72054db3-0ae3-4bb8-abb0-57780b3cf244}'::uuid[]))
        Heap Blocks: exact=4
        Buffers: shared hit=67
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=65 width=0) (actual time=0.068..0.068 rows=62 loops=1)
              Index Cond: (question_id = ANY ('{d67cd94e-8477-4ab3-9ab4-fc05ddab7b69,34eda702-f218-4000-b26a-203edf011e55,3c7aa339-556a-4514-920f-199c92205da1,f871cd0e-9bb8-4b09-be83-871291758c07,ccbb6f79-4477-4e55-9c98-f86ee16799d2,ca335e28-fadf-46e8-b6cb-e41cb2145cfd,36d280be-9471-49d9-b04d-fa52ffcf3333,ee221598-f4be-46c7-8cc3-6367624c2f6f,11f83dd3-e514-4a81-8d05-6f1d052f3394,d20754c9-a572-4cc5-b3f3-8fd503efffac,8cabe306-b687-4723-bb56-a3362c4661a0,7c0fc8b2-28f6-42a5-bde8-d9cf81f93123,89ee4d63-cc16-49e5-8d82-35da1f183ffd,619816fc-284d-4321-a315-bc42dd179004,50cb2a8a-79c9-4c58-a571-5a362db4a22f,c203a9eb-ccda-46e5-8eee-807296ebbc50,3243ce5e-f8c4-4847-a8df-1603921d79f8,2e13047d-e4c1-4fdc-8e2a-8f9a5c419097,b6a70fa0-ef43-4112-90b5-778d9f7505b0,acc15728-24ea-4293-b103-697e389a8917,72054db3-0ae3-4bb8-abb0-57780b3cf244}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.084 ms
Execution Time: 0.136 ms
```
</details>

### 7. College only (added by 04D)

200 colleges, one source row each: selective but not unique.

Spec: `{"collegeId":"af6f1028-fd54-458a-b134-6e15868ebfc5","searchTokens":[],"limit":20}`

Driving scan: Bitmap Heap Scan, Bitmap Index Scan, estimated 109 rows, actual 135 rows.

**Page query** — median wall 1.32 ms over 15 runs (best 1.13 ms); EXPLAIN execution 0.732 ms, planning 0.196 ms; buffers shared hit=2275 read=0; sorts=1; indexes=questions_pkey, ix_question_sources_college_id. Full staff-list path (page + tag + version loads) median 2.73 ms.

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
Limit  (cost=1119.95..1120.00 rows=21 width=128) (actual time=0.698..0.702 rows=21 loops=1)
  Buffers: shared hit=530
  ->  Sort  (cost=1119.95..1120.22 rows=109 width=128) (actual time=0.697..0.699 rows=21 loops=1)
        Sort Key: q.created_at DESC, q.id DESC
        Sort Method: top-N heapsort  Memory: 32kB
        Buffers: shared hit=530
        ->  Nested Loop  (cost=302.66..1117.01 rows=109 width=128) (actual time=0.164..0.621 rows=135 loops=1)
              Buffers: shared hit=530
              ->  HashAggregate  (cost=302.37..303.46 rows=109 width=16) (actual time=0.158..0.181 rows=135 loops=1)
                    Group Key: s.question_id
                    Batches: 1  Memory Usage: 40kB
                    Buffers: shared hit=125
                    ->  Bitmap Heap Scan on question_sources s  (cost=5.13..302.10 rows=109 width=16) (actual time=0.026..0.124 rows=135 loops=1)
                          Recheck Cond: (college_id = 'af6f1028-fd54-458a-b134-6e15868ebfc5'::uuid)
                          Heap Blocks: exact=123
                          Buffers: shared hit=125
                          ->  Bitmap Index Scan on ix_question_sources_college_id  (cost=0.00..5.11 rows=109 width=0) (actual time=0.012..0.012 rows=135 loops=1)
                                Index Cond: (college_id = 'af6f1028-fd54-458a-b134-6e15868ebfc5'::uuid)
                                Buffers: shared hit=2
              ->  Index Scan using questions_pkey on questions q  (cost=0.29..7.46 rows=1 width=128) (actual time=0.003..0.003 rows=1 loops=135)
                    Index Cond: (id = s.question_id)
                    Buffers: shared hit=405
Planning:
  Buffers: shared hit=28
Planning Time: 0.196 ms
Execution Time: 0.732 ms
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
Index Only Scan using question_tags_pkey on question_tags  (cost=0.42..93.54 rows=46 width=32) (actual time=0.010..0.054 rows=42 loops=1)
  Index Cond: (question_id = ANY ('{ee1e2cfc-28c7-4b15-b328-4f23d353ab79,875f9779-506f-439e-8ecb-fc24f6db4439,db2f5e35-c3e8-47a1-8c2f-4a587825133a,9c02bc3a-9713-4904-9723-7e1b4ec46f3d,ae8edd62-70f3-4782-803f-c4f75ff229ac,15977f76-c4af-4c50-a78d-fba80e442d5a,ec84e95f-73c9-4a8b-ba4f-71d44562433c,34e689bd-3a91-415f-b44d-f1efa9a2e947,d04129f3-81b2-4409-8765-1420ebb750d8,6c90eb2f-3a5a-4ce1-8e1f-e036de208353,6bb21c7d-5edd-4256-9430-6e43ff3ffdf7,455e62f4-6094-40b2-a052-b670d0ea2c85,fba289da-7462-4f7a-99cf-9f1aa8e886b2,5ff51b9a-a43d-4fc6-8bc9-958ace48f5ab,979c6baf-8d46-44c5-b6f4-a7be761b99b6,161709f0-aab1-4919-99de-dd09c92d7cb3,7d272180-f80d-4349-9a19-1d5d2e6f50c9,5b5aede6-1ba2-4f26-bfce-7d68964e018a,c12af930-960c-4399-8185-121fdcda157a,66fbf5ab-3a0f-4478-9dba-49f2ee91a857,20f0a583-f1e8-423b-87ca-5ce3dbc297ef}'::uuid[]))
  Heap Fetches: 0
  Buffers: shared hit=64
Planning Time: 0.042 ms
Execution Time: 0.062 ms
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
Sort  (cost=338.22..338.38 rows=65 width=48) (actual time=0.097..0.102 rows=63 loops=1)
  Sort Key: question_id, version_number DESC
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=86
  ->  Bitmap Heap Scan on question_versions  (cost=93.36..336.26 rows=65 width=48) (actual time=0.051..0.078 rows=63 loops=1)
        Recheck Cond: (question_id = ANY ('{ee1e2cfc-28c7-4b15-b328-4f23d353ab79,875f9779-506f-439e-8ecb-fc24f6db4439,db2f5e35-c3e8-47a1-8c2f-4a587825133a,9c02bc3a-9713-4904-9723-7e1b4ec46f3d,ae8edd62-70f3-4782-803f-c4f75ff229ac,15977f76-c4af-4c50-a78d-fba80e442d5a,ec84e95f-73c9-4a8b-ba4f-71d44562433c,34e689bd-3a91-415f-b44d-f1efa9a2e947,d04129f3-81b2-4409-8765-1420ebb750d8,6c90eb2f-3a5a-4ce1-8e1f-e036de208353,6bb21c7d-5edd-4256-9430-6e43ff3ffdf7,455e62f4-6094-40b2-a052-b670d0ea2c85,fba289da-7462-4f7a-99cf-9f1aa8e886b2,5ff51b9a-a43d-4fc6-8bc9-958ace48f5ab,979c6baf-8d46-44c5-b6f4-a7be761b99b6,161709f0-aab1-4919-99de-dd09c92d7cb3,7d272180-f80d-4349-9a19-1d5d2e6f50c9,5b5aede6-1ba2-4f26-bfce-7d68964e018a,c12af930-960c-4399-8185-121fdcda157a,66fbf5ab-3a0f-4478-9dba-49f2ee91a857,20f0a583-f1e8-423b-87ca-5ce3dbc297ef}'::uuid[]))
        Heap Blocks: exact=23
        Buffers: shared hit=86
        ->  Bitmap Index Scan on ix_question_versions_question_id_status  (cost=0.00..93.29 rows=65 width=0) (actual time=0.047..0.047 rows=63 loops=1)
              Index Cond: (question_id = ANY ('{ee1e2cfc-28c7-4b15-b328-4f23d353ab79,875f9779-506f-439e-8ecb-fc24f6db4439,db2f5e35-c3e8-47a1-8c2f-4a587825133a,9c02bc3a-9713-4904-9723-7e1b4ec46f3d,ae8edd62-70f3-4782-803f-c4f75ff229ac,15977f76-c4af-4c50-a78d-fba80e442d5a,ec84e95f-73c9-4a8b-ba4f-71d44562433c,34e689bd-3a91-415f-b44d-f1efa9a2e947,d04129f3-81b2-4409-8765-1420ebb750d8,6c90eb2f-3a5a-4ce1-8e1f-e036de208353,6bb21c7d-5edd-4256-9430-6e43ff3ffdf7,455e62f4-6094-40b2-a052-b670d0ea2c85,fba289da-7462-4f7a-99cf-9f1aa8e886b2,5ff51b9a-a43d-4fc6-8bc9-958ace48f5ab,979c6baf-8d46-44c5-b6f4-a7be761b99b6,161709f0-aab1-4919-99de-dd09c92d7cb3,7d272180-f80d-4349-9a19-1d5d2e6f50c9,5b5aede6-1ba2-4f26-bfce-7d68964e018a,c12af930-960c-4399-8185-121fdcda157a,66fbf5ab-3a0f-4478-9dba-49f2ee91a857,20f0a583-f1e8-423b-87ca-5ce3dbc297ef}'::uuid[]))
              Buffers: shared hit=63
Planning Time: 0.060 ms
Execution Time: 0.116 ms
```
</details>

