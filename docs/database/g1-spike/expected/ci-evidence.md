# G-1 CI evidence — result: **FAIL**

Recorded from real GitHub Actions runs. Nothing here is simulated.

## Runs

| Run | Commit | Event | Result |
|---|---|---|---|
| [45200051044](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45200051044) | `e6eeb03` | pull_request | failure |
| [45200035151](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45200035151) | `e6eeb03` | push | failure |

Both runs produced identical output, so the result is deterministic.

Environment: `ubuntu-24.04`, `postgres:16` service container, Node 22,
Prisma CLI and `@prisma/client` **7.10.1** from the project's `npm ci`.

## Steps that passed

```
step3 introspected models: 10 :: 1 datasource block(s)
step3b fidelity diff bytes=0 ::
```

- Step 1: 5/5 composite FKs created.
- Step 2: 14/14 enforcement cases PASS, `G1_FAIL=0`.
- Step 3: `prisma db pull` sees all 10 tables.
- Step 3b: the introspected schema and the spike datamodel differ by **0 bytes**,
  so step 4's result cannot be attributed to a modelling mistake.

## Step 4 — the failure

`prisma migrate diff --from-config-datasource --to-schema … --script --exit-code`
exits **2** (non-empty). Its script contains, verbatim:

```sql
-- DropForeignKey
ALTER TABLE "answer_keys" DROP CONSTRAINT "fk_answer_keys_options_of_version";
ALTER TABLE "questions"    DROP CONSTRAINT "fk_questions_chapter_subject";
ALTER TABLE "questions"    DROP CONSTRAINT "fk_questions_level_subject";
ALTER TABLE "questions"    DROP CONSTRAINT "fk_questions_subtopic_topic";
ALTER TABLE "questions"    DROP CONSTRAINT "fk_questions_topic_chapter";
```

It additionally drops every plain foreign key (`fk_answer_keys_version`,
`chapters_subject_id_fkey`, `level_subjects_*_fkey`, `question_options_version_id_fkey`,
`question_versions_question_id_fkey`, `questions_*_id_fkey`, `subtopics_topic_id_fkey`,
`topics_chapter_id_fkey`) and the plain unique indexes (`uq_answer_keys_version`,
`uq_chapters_id_subject`, `uq_chapters_subject_number`,
`uq_question_options_version_key`, `uq_subtopics_id_topic`, `uq_topics_id_chapter`).

That wider scope is the important nuance: plain FKs and plain uniques are exactly what
Prisma *can* model, so their removal shows Prisma treating a **hand-built schema with no
migration history** as unmanaged and proposing to rebuild it. The experiment therefore
proves a real hazard for the approved workflow (hand-written SQL applied outside Prisma's
tracking), and does **not** isolate the composite FKs as the sole cause.

## Steps that did not run

5 (additive diff), 6 (`migrate dev`), 7 (final catalog). The harness stops at the first
failing step by design.

## The corrected false alarm

An earlier run (45199180149) also reported drift, for a self-inflicted reason: the spike
datamodel had camelCase columns with no `@map`, so Prisma saw no `mcq_correct_option_key`
column and treated every relation as new. Fixed with `@map` on every column,
`@default(dbgenerated("gen_random_uuid()"))` and `onUpdate: Cascade`; **step 3b was added
so that a datamodel mistake can never again be reported as a Prisma verdict.**

## Verdict

**G-1 FAILS.** See §11.3.2 of
[`../phase-04a-question-bank-physical-schema-proposal.md`](../phase-04a-question-bank-physical-schema-proposal.md).
Request C reverts to its documented fallback, which requires re-approval.
