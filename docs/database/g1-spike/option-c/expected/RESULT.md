# Phase 04A — Option C prototype: recorded result

**Result: the prototype PASSES. All nine claims it was built to test were
confirmed on a real GitHub Actions runner.**

This is a *workflow* prototype, not an approval of Option C. See §11.4 of
[`../../phase-04a-question-bank-physical-schema-proposal.md`](../../../phase-04a-question-bank-physical-schema-proposal.md)
for the architectural comparison and the decision request.

## Attempt metadata

| Item | Value |
|---|---|
| Commit | `d1ead77` |
| Workflow | [`.github/workflows/phase04a-option-c-prototype.yml`](../../../../../.github/workflows/phase04a-option-c-prototype.yml) |
| Run (push) | [45256308788](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45256308788) — **success** |
| Run (pull_request) | [45256319664](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45256319664) — **success** |
| Prisma CLI | 7.10.1, asserted from `node_modules` |
| Node.js | 22 |
| PostgreSQL | 16, three disposable service containers |
| Runner | `ubuntu-24.04` |

Both triggers passed, so the result is reproducible.

## What was tested, and what each result establishes

Quoting the runner's own evidence annotations:

```
step4  schema-to-schema diff: 0 DROP statements, 0 mentions of C-1..C-5
step5a from-migrations: exit 2, 5 DROP CONSTRAINT statement(s) — it reports the composite FKs as drift
step5b snapshot diff: clean, no constraint traffic
step5c snapshot diff detects real drift (exit 2) — the check is not vacuous
step7  enforcement: 14/14 PASS, G1_FAIL=0
step8  replay: 5/5 composite FKs on an independent database
step9  negative test: guard rejected the injected destructive migration
```

### 1. Baseline generation — PASS

`prisma migrate diff --from-empty --to-schema … --script` produced a complete
baseline from the datamodel alone, with no live database consulted. Confirms
Prisma can emit the initial migration without the diff engine ever seeing a
catalog.

### 2. Reviewed SQL appended verbatim — PASS

The five composite FKs applied to the generated baseline are byte-identical to
the approved reference copy (identifier quoting normalised). **No constraint
definition was altered.**

### 3. Deployment and migration history — PASS

`prisma migrate deploy` applied the migration in which Prisma wrote most of the
SQL and the project appended the rest. `_prisma_migrations` recorded exactly one
finished migration with no rollbacks.

### 4. Schema-to-schema diff — **PASS, this is the central claim**

Changing the datamodel (one unrelated nullable column) and diffing
`--from-schema <previous> --to-schema <current>` produced:

```sql
-- AlterTable
ALTER TABLE "questions" ADD COLUMN "oc_probe_note" TEXT;
```

**Zero `DROP` statements. Zero mentions of C‑1…C‑5.** The premise holds: a
schema-to-schema diff compares two data models, and a composite FK is invisible
to a data model on *both* sides, so it can never propose removing one.

### 5. The two candidate CI drift checks — one works, one does not

This is the most important finding of the prototype, and it is why the workflow
must be shaped as Option C specifies rather than "use `migrate diff` and hope".

**5a — `--from-migrations` does NOT work.** Exit code 2, with:

```sql
-- DropForeignKey
ALTER TABLE "answer_keys" DROP CONSTRAINT "fk_answer_keys_options_of_version";
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_chapter_subject";
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_level_subject";
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_subtopic_topic";
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_topic_chapter";
```

The reason is decisive and was not obvious from the flag's name: `--from-migrations`
replays the migration history into the **shadow database** and then introspects the
resulting **catalog**. The composite FKs are physically present there, and the
datamodel cannot express them, so all five are reported as drift. It is a
*database→datamodel* diff wearing a different name. Any CI check built on it would
fail permanently and block every legitimate migration — or, worse, train the team to
ignore it.

**5b — snapshot-to-snapshot diff works.** Comparing the committed datamodel snapshot
with the current datamodel (`--from-schema A --to-schema B`) produced no output and
no constraint traffic. It never opens a database, so C‑1…C‑5 are equally invisible
on both sides.

**5c — and it is not vacuously clean.** The same mechanism, pointed at a *changed*
datamodel, exits 2 and reports the difference. So the check really does detect
drift; it is not merely silent.

### 6. Additive migration — PASS

The schema-to-schema migration was deployed unedited. Afterwards 5/5 composite FKs
remained and the new column existed — the change was genuinely applied, not merely
recorded in history.

### 7. Enforcement — PASS

14/14 cases, `G1_FAIL=0`, after the entire workflow. The constraints are still
*enforced*, not merely present in the catalog.

### 8. Reproducibility — PASS

A second, independent disposable database (`oc_replay`) replayed the same history
from scratch and ended with 5/5 composite FKs.

### 9. CI guard, negative-tested — PASS

A guard that never fires is not a control, so the prototype deliberately builds a
migration that drops `fk_questions_level_subject` and asserts the guard rejects it.
It did. The guard also accepts the legitimate additive migration (no false
positive), and was unit-tested separately against five cases: accept a harmless
`ADD COLUMN`; reject `DROP CONSTRAINT` of a protected FK; reject `DROP COLUMN`;
reject `DROP TABLE`; reject a protected constraint dropped from a different table.

### 10. Recorded limitation — `migrate dev` is still destructive

Option C works **only** because every migration goes through a schema-to-schema
diff or the reviewed baseline. `prisma migrate dev` still compares the live catalog
to the datamodel — experiment 2 proved it generates a migration dropping all five.
**The prohibition on `migrate dev` is load-bearing, not stylistic.** This is the
central operational risk of Option C and no tooling tested here enforces it.

## Verification done outside CI

Because the Prisma schema engine (`binaries.prisma.sh`) is unreachable from the
development sandbox, the Prisma steps could only run in CI. The SQL side was
verified locally against PostgreSQL 16.2: the emulated generated baseline plus the
three support uniques plus the appended SQL applied cleanly and yielded **18 foreign
keys with 14/14 enforcement passing**, confirming the assembled migration is sound
independently of Prisma.

## What this prototype does NOT establish

- **That Option C should be adopted.** It demonstrates a workflow *can* work. It
  does not weigh the cost.
- **That the `migrate dev` prohibition can be enforced.** Nothing tested prevents a
  developer running it. Only review discipline and this CI guard stand in the way,
  and the CI guard runs on committed SQL, not on local habits.
- **That a snapshot-drift check catches a hand-edited migration file.** 5b compares
  datamodel snapshots, not the content of `migration.sql`. A developer could edit a
  committed migration without changing the datamodel and 5b would not notice. An
  additional check (hash of applied migrations, or `migrate status`) is needed and
  was **not** tested here.
- **Shadow-database replay of the *composite FKs* via `migrate dev`.** We only
  proved replay via `migrate deploy` (step 8) and that `--from-migrations` replay
  exposes the constraints as drift (5a).
- **Behaviour on a schema change that touches a constraint's columns** — e.g.
  renaming `questions.subject_id`, which would require C‑1 and C‑2 to be rebuilt by
  hand. That was not tested and is a real, untested risk.
