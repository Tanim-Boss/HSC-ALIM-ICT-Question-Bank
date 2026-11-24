# G‑1 experiment 2 — recorded result: **FAIL**

Recorded from real GitHub Actions runs. Nothing here is simulated or inferred
from a partial run.

## Attempt metadata

| Item | Value |
|---|---|
| Commit | `2361fa7` (`test(g1/2): name every object Prisma would remove, not just the count`) |
| Workflow | [`.github/workflows/g1-experiment-2.yml`](../../../../.github/workflows/g1-experiment-2.yml) |
| Run (push) | [45238355790](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45238355790) |
| Run (pull_request) | [45238369746](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45238369746) |
| Prisma CLI | 7.10.1 (asserted from `node_modules`) |
| Prisma client | 7.10.1 (asserted from `node_modules`) |
| Node.js | 22 |
| PostgreSQL | 16 (`postgres:16` service, two disposable instances) |
| Runner | `ubuntu-24.04` |

Both runs produced identical findings, so the result is deterministic.

## Exact migration procedure

1. A disposable database (`g1_test`) and a second disposable database
   (`g1_shadow`) are created empty. The driver refuses to run if either
   already contains objects.
2. `prisma migrate dev --name g1_baseline --create-only` generates the baseline
   migration from `experiment-2/schema.prisma` — a datamodel that declares
   **every object Prisma can express, including the three support unique keys**
   `uq_chapters_id_subject`, `uq_topics_id_chapter`, `uq_subtopics_id_topic`
   under their approved names.
3. The generated migration is inspected. It must contain the ordinary FKs and
   uniques before anything is appended.
4. `manual/001_composite_fks.sql` is appended byte-for-byte to the generated
   `migration.sql`. It contains only: the two chain `CHECK`s, the partial index
   `uq_topics_chapter_order`, and the five composite FKs verbatim from §3.11.6.
5. `prisma migrate deploy` applies the whole migration — Prisma's own SQL plus
   the hand-written part — to `g1_test`.

## Results

### The baseline is generated successfully — PASS

Prisma 7.10.1 generated a non-empty migration from the datamodel.

### Ordinary constraints are correctly represented — PASS

The generated SQL contained **13 ordinary foreign keys** and **8 unique
constraints**, all produced by Prisma itself:

- FKs: `questions_{education_level,subject,chapter,topic,subtopic}_id_fkey`,
  `question_versions_question_id_fkey`, `question_options_version_id_fkey`,
  `answer_keys_version_id_fkey`, `chapters_subject_id_fkey`,
  `topics_chapter_id_fkey`, `subtopics_topic_id_fkey`,
  `level_subjects_{level,subject}_id_fkey`.
- Uniques: `uq_chapters_subject_number`, `uq_question_options_version_key`,
  `uq_answer_keys_version`, plus the three C-support keys.

None of the five composite FKs was present at this stage — as expected, Prisma
cannot express them.

### The appended definitions are the approved ones — PASS

Each of the five FK definitions in `manual/001_composite_fks.sql` is asserted
identical to the approved reference copy in `../sql/0001-schema.sql` (identifier
quoting normalised, whitespace collapsed). All five matched.

### Deployment by Prisma's own workflow — PASS

`prisma migrate deploy` applied the migration without rejecting the hand-written
SQL.

### All five composite FKs exist after deployment — PASS

5/5 present in `pg_constraint`. The catalog held exactly **18** foreign keys:
13 ordinary + 5 composite.

### All five reject invalid references and accept valid ones — PASS

The shared 14-case suite passed **14/14, `G1_FAIL=0`**, including
`S0-seed-accepted`, `C1-level-subject`, `C2-chapter-subject`,
`C3-topic-chapter`, `C4-subtopic-topic`, `C5-key-of-version`,
`C5b-null-key-skipped`, `P1-consistent-accepted`, `P2-optional-links-null`,
`E7a`–`E7c`, `R1-restrict-blocks-delete` and `S9-all-five-present`.

### Supporting ordinary FKs and uniques remain intact — PASS

All 13 ordinary FKs, the three support uniques and the partial index
`uq_topics_chapter_order` were present after deployment.

### No-change `migrate diff` — the diff is confined to the five composite FKs

```
step7 no-change diff exit=2
dropped_constraints=[fk_answer_keys_options_of_version, fk_questions_chapter_subject,
                     fk_questions_level_subject, fk_questions_subtopic_topic,
                     fk_questions_topic_chapter]
dropped_indexes=[]
```

This is the **clean isolation experiment 1 could not achieve**. With real
migration history, the diff proposes dropping **exactly the five composite FKs
and nothing else**: no ordinary foreign key, no ordinary unique, no index.

The experiment‑1 noise is gone, and the diagnostic question the task asked is
answered: **no remaining proposed drop concerns anything but C‑1…C‑5.**

### No-change `migrate dev` — FAIL

This is the decisive measurement, and it is a failure:

```
step8 no-change migrate dev: GENERATED a migration with 10 DROP statement(s):
  DROP CONSTRAINT "fk_answer_keys_options_of_version"
  DROP CONSTRAINT "fk_questions_chapter_subject"
  DROP CONSTRAINT "fk_questions_level_subject"
  DROP CONSTRAINT "fk_questions_subtopic_topic"
  DROP CONSTRAINT "fk_questions_topic_chapter"
```

Given real migration history, on a database that Prisma itself created and
Prisma itself migrated, **Prisma generates a no-change migration whose purpose
is to remove the five appended composite FKs.** It considers them drift.

The `--create-only` flag meant this migration was not applied, so nothing was
destroyed during the run — but the next person who runs `prisma migrate dev`
would apply it.

Note the precision of the finding: the 10 `DROP` statements resolve to the
five constraints (Prisma emits one statement per constraint in more than one
form). **No ordinary constraint appears among them.**

### Shadow database replay — not reached

Step 9 did not run: the harness stops at the first failing step by design. The
shadow database was provisioned and configured but the replay was never
exercised, because the drift result at step 8 already fails the gate.

### Additive-change migration — not reached

Step 10 did not run, for the same reason.

### Second deployment — not reached

Step 11 did not run, for the same reason.

## What this establishes, and what it does not

**Established:**

1. The five approved composite FKs can be **created, deployed and enforced** in a
   Prisma-managed database, when appended to a Prisma-generated migration. The
   schema is fully functional and the constraints do real work (14/14).
2. With real migration history, a database→datamodel diff isolates them cleanly:
   the composite FKs are the *only* objects Prisma proposes to drop.
3. Prisma nevertheless treats them as **drift**: its own no-change `migrate dev`
   generates a migration that would remove them. The workflow is therefore not
   stable — a routine `migrate dev` strips the constraint layer.
4. The step-4 failure in experiment 1 was partly an artefact of having no
   migration history, and partly a datamodel defect that was subsequently
   fixed. Experiment 2 removes both confounds.

**Not established:**

- That the workflow could be made safe by operator discipline. Nothing tested
  here prevents `migrate dev` from writing the destructive migration.
- Behaviour of shadow-database replay and additive migrations, which never ran
  because the gate failed first.

## Verification of the premise, done locally

Because CI logs are not retrievable from the working environment, the core
premise was also verified directly against PostgreSQL 16.2 locally: a
Prisma-shaped schema (quoted identifiers, no composite FKs, no chain `CHECK`s,
no partial index), with the three support uniques present as Prisma creates
them, accepts `manual/001_composite_fks.sql` cleanly and then passes the
enforcement suite **14/14, `G1_FAIL=0`**. That confirms the appended SQL itself
is sound; the failure is in what Prisma subsequently does with it.

## Disposition

**G‑1 FAILS.** Experiment 2 improved the design, produced a clean and much more
precise result, and still does not satisfy acceptance criteria 4 (no-change
migration workflow without destructive proposals) and consequently 5–6.

See [§11.3.3](../../phase-04a-question-bank-physical-schema-proposal.md#1133-g1-experiment-2--result)
of the proposal. Request C remains the approved architectural design; its
implementation remains blocked. The Option A fallback is **not** adopted.
