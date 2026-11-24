# Phase 04A — Real 18-Table Prisma Drift Investigation

**Date:** 2026-11-24
**Baseline:** `main` at `0ac7fd26c1aad4f631ff89e3ca86c7b374b6c2f4` (PR #11 merged; hardening head `7cfc13ddc379e0aec58aa051c27af7fcd71f771a`)
**Working branch:** `arena/49496cf8-hsc-alim-ict-question-bank` (read-only; the only repository changes are this document and, from Session 10, one CI workflow file — §15.2)
**Nature:** investigation only. No schema, migration, guard, application code or decision was changed.

**Labels:** `VERIFIED` · `PARTIALLY VERIFIED` · `NOT VERIFIED` · `BLOCKED` · `OWNER DECISION REQUIRED`


> **Session 10 update (2026-11-24).** The INCONCLUSIVE verdict in §1 applied to *this sandbox*, which
> cannot download the Prisma schema engine. The experiment has since been run in GitHub Actions with the
> real pinned CLI and engine on the real 18-table schema. **Result: FAIL for the ordinary Prisma
> migration-diff path** — it proposes dropping C-1…C-5 **and** `uq_question_sources_identity`. See
> **§15** for the measured evidence. Everything in §1–§14 is preserved as the historical record of what
> was and was not known before that run; the §1 verdict is superseded by §15 and the §14 open question
> (R1/R2) is now closed.

---

## 1. Executive verdict

### **INCONCLUSIVE — ADDITIONAL EVIDENCE REQUIRED**

The decisive experiment — *what SQL does Prisma's ordinary migration diff propose against the real 18-table
schema* — **could not be executed in this environment**. Every Prisma command in this sandbox, including the
pure schema-to-schema ones, aborts while fetching the native schema engine from `binaries.prisma.sh` before it
reaches any database (§3.2). The CI runners *can* run it (the G-1 and G-3 jobs execute `prisma migrate diff`
successfully), but this session is not permitted to push a harness, and a hand-rolled substitute could produce
plausible-but-wrong SQL, which is worse than no measurement.

What the session **did** establish empirically is substantial, and it changes the shape of the question:

| Finding | Evidence | Label |
|---|---|---|
| The committed migration applies cleanly and produces exactly the catalog G-3 claims | Environment B, PostgreSQL 16.2: 18 tables / 7 enums / 26 FKs / 47 CHECKs / 6 hand-written indexes / 5 composite FKs | `VERIFIED` |
| **All 21 modellable relations match the physical FKs exactly** — table, columns, referenced columns, ON DELETE **and** ON UPDATE | 0 mismatches, 0 conventions relying on a Prisma default (§7) | `VERIFIED` |
| The extra churn seen in the 10-model prototype (`level_subjects` rewritten to `CASCADE`, three support indexes dropped) **cannot be explained by any mismatch in the real datamodel** | Prototype datamodel says `Cascade`; real datamodel and DDL both say `RESTRICT` | `VERIFIED` |
| The set of database objects Prisma cannot model is **precisely 11**: the 5 composite FKs **and 6 indexes** | Catalog + datamodel cross-check (§8) | `VERIFIED` |
| Whether Prisma would drop *only* those 11 objects on the real schema | No engine available (§3.2) | `NOT VERIFIED` |
| Current guards block the unsafe path and fire on a real injected violation | repo-guard exit 1 on injected `migrate dev`; 89 guard tests pass (§10) | `VERIFIED` |

**Two consequences for the owner.** First, the previous framing ("Prisma wants to drop the five composite
FKs") is too narrow: **six hand-written indexes** are equally outside the datamodel, and the 10-model
prototype never tested that class. Second, the referential-action worry is now closed — the real datamodel and
the real DDL agree on every one of the 21 ordinary foreign keys, so the prototype's cascade rewrites are
prototype-only.

**Nothing here supports reconsidering B1b or B2.** One measurable gap remains, and it is cheap to close.

---

## 2. Repository and schema baseline

| Item | Measurement | Label |
|---|---|---|
| Branch / HEAD | `arena/49496cf8-hsc-alim-ict-question-bank` @ `0ac7fd26c1aad4f631ff89e3ca86c7b374b6c2f4` | `VERIFIED` |
| `origin/main` | `0ac7fd26c1aad4f631ff89e3ca86c7b374b6c2f4` — identical | `VERIFIED` |
| PR #11 | MERGED, merge commit `0ac7fd26c1aad4f631ff89e3ca86c7b374b6c2f4` | `VERIFIED` |
| Working tree | clean except this new document | `VERIFIED` |
| `prisma/schema.prisma` | sha256 `ae2ef6ffc366b5cc3fe84aac6f55ed0af1e163335f8fad682ae7ae8d044bccfa` — 18 models, 7 enums | `VERIFIED` |
| `prisma/migrations/0001_phase04a_question_bank/migration.sql` | sha256 `bf2fc840ebae92cacec04dfb5f8ee6e0224f1394746d80bea3e56027941a2333` — 708 lines | `VERIFIED` |
| `prisma/migrations/migration_lock.toml` | sha256 `1db17a8d051aa136110736752c5e1f8b7ed92b6ea8e803112fbbe2497047c210`, `provider = "postgresql"` | `VERIFIED` |
| Migrations present | `0001_phase04a_question_bank` only — **no 0002** | `VERIFIED` |
| Prisma CLI | 7.10.1 pinned; schema engine commit it resolves: `d1b3f377ca835d73fd50954a5e22128b9ebdd6b8` | `VERIFIED` |

**Baseline files were not modified.** The three hashes above are identical before and after the session.

---

## 3. Test-environment methodology

### 3.1 Environment B — independent reference (built and used)

| Step | Command | Result |
|---|---|---|
| PostgreSQL | `initdb` from `pgserver` wheel, socket-only trust auth | **PostgreSQL 16.2** on x86_64-pc-linux-gnu |
| Database | `CREATE DATABASE env_b` | disposable, dropped at the end |
| Schema | `psql -v ON_ERROR_STOP=1 -f prisma/migrations/0001_phase04a_question_bank/migration.sql` | **exit 0 — executed and applied** |
| Catalog | `pg_tables`, `pg_type`/`pg_enum`, `pg_constraint`, `pg_indexes` | dumped to `/tmp/env_b/` (`fks.txt`, `handwritten-indexes.txt`, `referential-compare.txt`, `apply.log`) |

Measured inventory — this is the empirical confirmation of what G-3 asserts in CI:

```
tables=18   enums=7 (23 labels)   foreign_keys=26   checks=47   composite_fks=5
indexes total=62  = 38 unique + 24 plain
non-modellable indexes (partial / expression / NULLS NOT DISTINCT) = 6
delete actions: 19 RESTRICT, 7 CASCADE;   update actions: 26 CASCADE
```

### 3.2 Environment A — Prisma-generated baseline (**BLOCKED**)

The environment cannot run *any* Prisma command. Four commands were captured, each failing at the same point,
**before any database is contacted**:

| Command | Exit | Failure |
|---|---|---|
| `prisma validate --schema prisma/schema.prisma` | 1 | engine fetch |
| `prisma format --check --schema prisma/schema.prisma` | 1 | engine fetch |
| `prisma db pull --print --url …` | 1 | engine fetch |
| `prisma migrate status --config prisma.config.ts` | 1 | engine fetch |

```
Error: request to https://binaries.prisma.sh/all_commits/d1b3f377ca835d73fd50954a5e22128b9ebdd6b8/
       debian-openssl-3.0.x/schema-engine.gz.sha256 failed,
       reason: Client network socket disconnected before secure TLS connection was established
```

This is a sandbox network restriction, not a repository defect. `npm ci` succeeds (registry is reachable) and
Prisma 7.10.1 installs; only the engine binary host is blocked. Logs: `/tmp/prisma_blocked/*.log`.

**Attempted mitigation, and why it was abandoned.** Prisma 7.10.1 ships `schema_engine_bg.wasm` inside
`node_modules/prisma/build/`, and the exact pinned WASM package
(`@prisma/schema-engine-wasm@8.1.0-1.d1b3f377…`) is installable from npm. I installed it `--no-save` (no
tracked file changed) and drove the engine directly through its published bindings with the project's own
`@prisma/adapter-pg`. The engine boots and reaches the connector, then fails on an undocumented driver
contract (`TypeError: Cannot read properties of undefined (reading 'valueOf')` after `connect()` resolves).
Continuing meant reverse-engineering an unsupported interface whose output nobody could validate — a harness
that might silently emit the wrong SQL is worse than a documented gap. **Abandoned deliberately**, recorded
here so it is not retried blindly.

**Environment A equivalence was therefore never established**, and per the session rules I did not assume it.

---

## 4. Full 18-model no-change drift results

| Experiment | Status | Why |
|---|---|---|
| A. No-change datamodel vs reconstructed database | `BLOCKED` | needs the schema engine (§3.2) |
| B. Composite FK preservation per constraint | `PARTIALLY VERIFIED` | structural facts measured; Prisma's treatment unmeasured |
| C. Referential-action comparison | `VERIFIED` | measured, no Prisma needed (§7) |
| D. Index/constraint classification | `VERIFIED` | measured from the live catalog (§8) |
| E. Controlled Option C comparison | `BLOCKED` | schema-to-schema `migrate diff` also needs the engine |

**No statement counts are reported for experiments A, B (Prisma side) or E**, because no SQL was produced.
The session rule "do not report a statement count without its complete SQL evidence" is applied strictly.

---

## 5. Complete generated SQL analysis

**No Prisma-generated SQL was produced in this session, so there is none to analyse.** The only Prisma
statement summaries available remain the historical prototype ones (run `45372731457`), which describe the
10-model prototype and are **not** full-schema evidence. They are quoted in the Session 8 review and are not
reinterpreted here.

The one thing that *can* be said about the full schema without the engine: the objects outside the datamodel
are enumerable and were enumerated (§8). Whether Prisma proposes to drop them is the open question.

---

## 6. C-1 through C-5 individual results (structural, measured)

For each constraint: present in the live catalog after applying the committed migration, with its exact
columns and actions; Prisma-recognisable status derived from the datamodel (a constraint is modellable only if
a `@relation(fields:[…])` covers exactly those columns).

| ID | Constraint | Columns → target | ON DELETE / UPDATE | In catalog after apply | Modellable by Prisma | Prisma treatment |
|---|---|---|---|---|---|---|
| C-1 | `fk_questions_level_subject` | `questions(education_level_id, subject_id)` → `level_subjects(level_id, subject_id)` | RESTRICT / CASCADE | **yes** | **no** — referenced key is `level_subjects`' own composite PK, and two relations would share a column | `NOT VERIFIED` |
| C-2 | `fk_questions_chapter_subject` | `questions(chapter_id, subject_id)` → `chapters(id, subject_id)` | RESTRICT / CASCADE | **yes** | **no** — FK over a non-`@@id` composite key | `NOT VERIFIED` |
| C-3 | `fk_questions_topic_chapter` | `questions(topic_id, chapter_id)` → `topics(id, chapter_id)` | RESTRICT / CASCADE | **yes** | **no** — same | `NOT VERIFIED` |
| C-4 | `fk_questions_subtopic_topic` | `questions(subtopic_id, topic_id)` → `subtopics(id, topic_id)` | RESTRICT / CASCADE | **yes** | **no** — same | `NOT VERIFIED` |
| C-5 | `fk_answer_keys_options_of_version` | `answer_keys(version_id, mcq_correct_option_key)` → `question_options(version_id, key)` | RESTRICT / CASCADE | **yes** | **no** — nullable referencing column + `MATCH SIMPLE` semantics | `NOT VERIFIED` |

Prisma's *recognition* status is `VERIFIED` (no relation in `schema.prisma` covers any of these column pairs —
the datamodel has 21 relations and each maps to exactly one of the 21 ordinary FKs, §7). Prisma's *treatment*
(drop / recreate / preserve) is `NOT VERIFIED` because no engine was available.

The three support keys these constraints depend on **are** in the datamodel and **are** created by the
migration as unique indexes: `uq_chapters_id_subject` (`schema.prisma:186`, `migration.sql:297`),
`uq_topics_id_chapter` (`:206`, `:300`), `uq_subtopics_id_topic` (`:228`, `:303`). Unlike in the prototype,
they are not SQL-only, so the prototype's `DROP INDEX` of these three has no counterpart here. `VERIFIED`

---

## 7. Referential-action comparison (the finding that closes a question)

Every one of the 21 modellable relations was compared against the live catalog by (table, local columns),
checking the referenced table, referenced columns, `ON DELETE` and `ON UPDATE`. Where the datamodel omits an
action, Prisma's documented default was applied (`Restrict` for required relations, `SetNull` for optional,
`Cascade` on update).

```
datamodel relations with fields[]: 21
physical foreign keys            : 26
exact matches (table+columns+actions+target): 21
action/target mismatches: 0
datamodel relations with no physical FK: 0
physical FKs with no datamodel relation: 5   (exactly C-1…C-5)
relations relying on a Prisma default: 0/21
```

`VERIFIED` — with a caveat worth stating: this is a **static** comparison of the datamodel against a measured
catalog, not an observation of Prisma's runtime behaviour. It proves the inputs agree; it does not by itself
prove Prisma emits nothing, because Prisma may still rewrite objects it models differently (for example the
prototype emitted `ADD CONSTRAINT` statements for constraints whose actions actually matched).

**What this settles:** the extra `DROP`/`CREATE` churn in the 10-model prototype (rewriting
`level_subjects_*_fkey` to `CASCADE`, dropping three support indexes) was caused by the *prototype's* datamodel
disagreeing with its SQL — `docs/database/g1-spike/prisma/schema.prisma` declares `onDelete: Cascade` for
`LevelSubject` while the real model says `Restrict` (`prisma/schema.prisma:157–158`), and the prototype omits
the support `@@unique` keys the real model declares. **The prototype overstated the drift; the real datamodel
has no such mismatch to explain.**

---

## 8. Index and constraint analysis

Live catalog after applying migration 0001:

| Class | Count | Modellable | Notes |
|---|---|---|---|
| Primary keys | 18 | yes | 17 surrogate `uuid` + 1 composite join key (`level_subjects`) |
| Unique indexes | 38 | mostly yes | includes the 3 support keys; 5 unique indexes are hand-written and unmodellable |
| Plain indexes | 24 | yes, except one | `ix_question_assets_checksum` is partial → unmodellable |
| CHECK constraints | 47 | **no** | Prisma has no declarative CHECK support; all hand-written |
| Foreign keys | 26 | 21 yes / **5 no** | the 5 are C-1…C-5 |
| Enum types | 7 (23 labels) | yes | |

**The unmodellable object set (measured, not estimated) — 11 objects:**

1. `fk_questions_level_subject` (C-1)
2. `fk_questions_chapter_subject` (C-2)
3. `fk_questions_topic_chapter` (C-3)
4. `fk_questions_subtopic_topic` (C-4)
5. `fk_answer_keys_options_of_version` (C-5)
6. `uq_question_versions_one_published_per_question` — partial unique (`WHERE status='PUBLISHED'`)
7. `uq_question_sources_identity` — `NULLS NOT DISTINCT`
8. `uq_topics_chapter_order` — partial unique (`WHERE is_active`)
9. `uq_tags_name_lower` — expression `lower(name)`
10. `uq_colleges_name_lower` — expression `lower(name)`
11. `ix_question_assets_checksum` — partial (`WHERE checksum IS NOT NULL`)

Items 6–10 are named **only in comments** in `schema.prisma` (lines 26–30, 208, 297, 378, 428, 482); item 11
appears nowhere in the datamodel. All 11 were confirmed present in the live catalog. `VERIFIED`

**New risk surface this investigation identifies:** the 10-model prototype contained a single partial index,
so it could not exercise this class. Whether Prisma proposes to drop the six hand-written indexes is
**unmeasured** (`NOT VERIFIED`). Note that 47 CHECK constraints are also outside the datamodel, and the G-1
prototype produced no `DROP CONSTRAINT` for CHECKs, which is weak evidence that Prisma leaves unmodelled
CHECKs alone — but that is a prototype observation, not a full-schema measurement.

---

## 9. Option C comparison

**Not executed** (`BLOCKED`, same engine reason). The controlled workflow's mechanics are nonetheless
`VERIFIED` from the committed tooling and CI: snapshot-to-snapshot `migrate diff --from-schema <prev>
--to-schema <next>`, which never reads a live database, plus guards and the checksum gate. The G-3 full-schema
gate exercised criteria 1–6 on the real migration (run `45372731345`), and V-1 exercised a real second
migration end-to-end (run `45372731513`).

**Important:** none of that is evidence about ordinary Prisma migration safety. A passing controlled workflow
does not prove anything about `migrate dev`; it proves the *alternative* works.

---

## 10. Guard and bypass assessment (measured this session)

| Test | Command | Result |
|---|---|---|
| Clean tree | `repo-guard.sh "$PWD"` | **exit 0**, 14 executed surfaces scanned |
| Positive control — injected violation | temp file containing `npx prisma migrate dev --name x` | **exit 1**, reported `scripts/db/__tmp_negative_control.sh line 2`; file removed, tree clean |
| Known blind spot — argv array | temp file with `argv=("prisma" "migrate" "dev"); npx "${argv[@]}"` | **exit 0 — NOT detected**, confirming the documented limitation empirically |
| Deployment-path guard | `deploy-path-guard.py` | **exit 0**; 2 gated deploys, 16 npm scripts, 28 files, **6 exceptions / 19 invocations** |
| Guard unit suites | `vitest run tests/unit/tooling/` | **89 passed** (3 files) |

Residual bypasses (none newly discovered, all now demonstrated or re-confirmed):

| Bypass | Mechanism | Mitigation today |
|---|---|---|
| Direct terminal `prisma migrate deploy` | outside repository-controlled surfaces | none — stated in the guard's own output |
| Argument-array / dynamically composed command | textually undetectable | none — now **demonstrated** |
| Raw SQL (`psql -f`) | no Prisma history, no checksum | none — stated in `database-migrations.md` |
| Tampered applied migration | Prisma did **not** detect it in CI (`prisma_detects=no`, criterion 5b) | the checksum gate is the only control |
| Harness exceptions | 6 files / 19 invocations deliberately exempt | allowance equals actual, zero headroom |

No guard was weakened, and no exception allowance was broadened.

---

## 11. Risk register

| # | Risk | Severity | Evidence | Label |
|---|---|---|---|---|
| R1 | Prisma drops C-1…C-5 if an ordinary diff is applied | **High** | structurally unavoidable (unmodellable); magnitude unmeasured | `PARTIALLY VERIFIED` |
| R2 | Prisma also drops the 6 hand-written indexes — a class the prototype never tested | **High** | §8 items 6–11 | `NOT VERIFIED` |
| R3 | Referential-action rewrites cause extra churn | **Low** | §7: 0/21 mismatches | `VERIFIED (refuted)` |
| R4 | A developer runs `migrate dev` outside the guarded surfaces | **High** | argv-array blind spot demonstrated; terminal invocation unguarded | `VERIFIED (bypass exists)` |
| R5 | A tampered applied migration deploys undetected | **High** | Prisma does not detect it; checksum gate is the only control | `VERIFIED (gate)` |
| R6 | Options are decided on stale prototype evidence | **Medium** | prototype overstates drift (§7) | `VERIFIED` |
| R7 | The decisive measurement is never made | **Medium** | §3.2 | `OWNER DECISION REQUIRED` — add the CI harness |

---

## 12. B1b / B2 implications

1. **Does the 10-model conclusion generalise?** Structurally, yes for C-1…C-5: they are not representable in
   the datamodel, verified from the datamodel and the catalog. The *magnitude* does not generalise, and the
   prototype's specific SQL must not be quoted as a full-schema result. `PARTIALLY VERIFIED`
2. **Does the full schema have additional drift risks?** Yes, one: six hand-written indexes that the prototype
   never tested. `NOT VERIFIED`
3. **Are the five composite FKs the only manually maintained objects at risk?** **No** — 11 objects are
   outside the datamodel: 5 constraints + 6 indexes (plus 47 CHECKs, whose treatment is unmeasured).
4. **Do referential-action mismatches explain extra DROP/CREATE statements?** **Not on the real schema.** That
   explanation applies to the prototype only. `VERIFIED (refuted)`
5. **Is Option C sufficient to avoid the unsafe path?** Yes mechanically: no approved command invokes a
   database→datamodel diff, and three independent layers plus negative controls enforce it.
6. **What remains even with Option C?** Human and raw-SQL bypasses; Prisma's inability to detect a tampered
   migration; and the fact that the drift measurement itself has never been made.
7. **What additional evidence is required before B1b?** The CI harness in §13.2 (one workflow, ~2 minutes),
   plus the operational items from `phase-04a-b2-production-migration-decision-review.md` §10.
8. **Should B1b and B2 remain NOT APPROVED / WITHHELD?** **Yes.** Nothing measured here supports
   authorisation; one cheap measurement is still missing.

---

## 13. Reproduction commands and evidence references

### 13.1 What was run this session

```bash
# Baseline hashes
sha256sum prisma/schema.prisma prisma/migrations/0001_phase04a_question_bank/migration.sql \
          prisma/migrations/migration_lock.toml

# Environment B (disposable PostgreSQL 16.2, socket-only)
pip install --break-system-packages pgserver==0.1.4
initdb -D /tmp/pg16data -U postgres --auth=trust -E UTF8
pg_ctl -D /tmp/pg16data -l /tmp/pg16log -o "-k /tmp/pg16sock -p 5544" -w start
psql "$ADMIN" -c 'CREATE DATABASE env_b'
psql "$ENV_B" -v ON_ERROR_STOP=1 -f prisma/migrations/0001_phase04a_question_bank/migration.sql
psql "$ENV_B" -Atc "select count(*) from pg_constraint where contype='f' and connamespace='public'::regnamespace;"
# … full queries in /tmp/env_b/{fks,handwritten-indexes,referential-compare}.txt

# Guards
bash docs/database/g1-spike/option-c/repo-guard.sh "$PWD"
python3 scripts/db/deploy-path-guard.py
npx vitest run tests/unit/tooling/
```

Evidence files retained outside the repository: `/tmp/env_b/`, `/tmp/prisma_blocked/`, `/tmp/drift/`.
The database was dropped and the cluster stopped; the repository working tree contains only this document.

### 13.2 The harness the owner can run in CI (closes R1/R2 in about two minutes)

Add as `.github/workflows/phase04a-real-schema-drift.yml` — it needs no production access and no secrets, and
CI **can** download the schema engine (the G-1 job does today).

```yaml
name: Phase 04A — real 18-table Prisma drift measurement
on: { workflow_dispatch: {}, pull_request: { paths: ['prisma/**', 'docs/database/**'] } }
jobs:
  drift:
    runs-on: ubuntu-24.04
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: drift, POSTGRES_USER: drift, POSTGRES_DB: drift }
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci --no-audit --no-fund
      - name: Apply the committed migration verbatim
        env: { PGPASSWORD: drift }
        run: psql -h localhost -U drift -d drift -v ON_ERROR_STOP=1 \
               -f prisma/migrations/0001_phase04a_question_bank/migration.sql
      - name: No-change drift (database -> datamodel)
        env:
          DATABASE_URL: postgresql://drift:drift@localhost:5432/drift
        run: |
          set +e
          node_modules/.bin/prisma migrate diff \
            --from-config-datasource --to-schema prisma/schema.prisma \
            --script --exit-code > drift.sql 2> drift.err
          rc=$?
          set -e
          echo "exit=$rc (0 = empty, 2 = non-empty)"
          cat drift.sql
          test "$rc" = 2   # this investigation predicts a non-empty diff
      - name: Report the exact affected objects
        run: |
          echo "### DROP CONSTRAINT"; grep -oE 'DROP CONSTRAINT "[a-z_]+"' drift.sql | sort -u
          echo "### DROP INDEX";      grep -oE 'DROP INDEX "[a-z_]+"' drift.sql | sort -u
          echo "### ADD CONSTRAINT";  grep -oE 'ADD CONSTRAINT "[a-z_]+"' drift.sql | sort -u
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: real-schema-drift, path: 'drift.sql' }
```

The expected result, stated so it can be falsified: the diff contains the five composite FKs; whether it also
contains the six indexes, and whether it rewrites any of the 21 ordinary FKs, is exactly the open question.
**Do not let this harness apply anything** — it computes a script and stops.

---

## 14. Explicit owner decision requirements

1. **Authorise the CI harness (§13.2)** as a one-off investigation workflow, or authorise an implementation
   task to add it permanently. Without it, R1/R2 stay unmeasured and any B1b discussion rests on prototype
   evidence. `OWNER DECISION REQUIRED`
2. **Decide what the measurement is for.** If Option C is mandatory and enforced, the drift's *magnitude* is
   informative rather than blocking. If any maintainer can run Prisma migrations outside the guards, the
   magnitude is a production-safety input. `OWNER DECISION REQUIRED`
3. **Correct the circulating description** of G-1 so it distinguishes prototype findings from full-schema
   findings (Session 8 §4.3, D-B). Documentation-only change.
4. **Keep B1b NOT APPROVED and B2 WITHHELD** until §13.2 has run and the operational items in the Session 8
   review are closed.

**Historical decisions preserved exactly:** G-1 = FAILED · G-3 = PASSED · Option C = approved controlled
workflow only · B1b = NOT APPROVED · B2 = WITHHELD · production creation/deployment of 0001 = NOT AUTHORIZED ·
candidate 0002 = DO NOT COMMIT · C-1…C-5 approved and present · G-2 = DEFERRED · OD-21 = OPEN · OD-NM-1 = OPEN ·
OD-17 = OPEN.

**This session changed nothing except this document.** No schema, migration, lock file, application code,
guard, or decision record was modified; no commit, push, PR, or database command against anything but a
disposable local cluster was issued.

---

# Session 10 — CI-Based Full-Schema Drift Experiment (results)

**Date:** 2026-11-24
**Harness:** `.github/workflows/phase04a-real-schema-drift.yml` (committed in this session; to be kept as a reusable regression test)
**Final successful run:** [`45381634139`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45381634139) on commit `6376d2a6e70d1ac7ec661d4b5019a5ac06ae21ac` — **all steps green**
**Reproduction run:** [`45380768045`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45380768045) on `b7eba84d2f0e45030651d17dc1438ce53a00f38f` produced **byte-identical E1 output**

## 15.1 Verdict

### **FAIL** — for the tested workflow, *ordinary Prisma migration diff*

The evidence demonstrates destructive drift behaviour on the real 18-table production-candidate schema:
Prisma's no-change diff proposes **six `DROP` statements**, five of them the approved C-1…C-5 composite
foreign keys and one of them a hand-written index (`uq_question_sources_identity`) that carries the
provenance de-duplication guarantee. It proposes **no replacement** for that index. Applying this diff
would silently remove a documented §3.10 integrity control.

Two things the same run shows just as clearly, and they must not be merged into that verdict:

- **Option C's own authoring path passed within the tested scope** — a snapshot compared with itself is empty
  (E2), and a one-column additive probe produces exactly one `ADD COLUMN` and nothing destructive (E3).
- **The drift is narrower than the prototype suggested, not wider.** No ordinary foreign key is touched, no
  column or table is altered, and there is not a single referential-action rewrite. The 10-model prototype's
  19 `DROP CONSTRAINT` + 3 `DROP INDEX` + `ON DELETE CASCADE` rewrites do **not** occur here.

This verdict does not authorise or forbid anything. B1b and B2 are untouched.

## 15.2 Environment

| Item | Value | How it was captured |
|---|---|---|
| Runner | `ubuntu-24.04`, Node 22 | workflow |
| PostgreSQL | **16** (`postgres:16` service container, port 5432) | `SHOW server_version` step |
| Prisma CLI | **7.10.1** (pinned by `package-lock.json`, asserted by `npm ci`) | postgres client / record-toolchain step |
| Schema engine commit | `d1b3f377ca835d73fd50954a5e22128b9ebdd6b8` | `prisma --version` |
| Baseline commit | `0ac7fd26c1aad4f631ff89e3ca86c7b374b6c2f4` (harness commit on top: `6376d2a`) | `git rev-parse HEAD` |
| `schema.prisma` | sha256 `ae2ef6ffc366b5cc3fe84aac6f55ed0af1e163335f8fad682ae7ae8d044bccfa` | record-toolchain step |
| migration 0001 | sha256 `bf2fc840ebae92cacec04dfb5f8ee6e0224f1394746d80bea3e56027941a2333` | same |
| `migration_lock.toml` | sha256 `1db17a8d051aa136110736752c5e1f8b7ed92b6ea8e803112fbbe2497047c210` | same |

The migration was applied **through the approved checksum gate** (`scripts/db/deploy-gate.sh deploy -- --config
prisma.config.ts`), so the database carried real Prisma migration history with the committed checksum, and
`migrate status` reported clean with one applied row.

## 15.3 E1 — no-change drift, database → datamodel (the decisive experiment)

```
node_modules/.bin/prisma migrate diff --config prisma.config.ts \
  --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code
```

**Exit code: 2** (non-empty diff). Complete generated SQL, 513 bytes:

```sql
-- DropForeignKey
ALTER TABLE "answer_keys" DROP CONSTRAINT "fk_answer_keys_options_of_version";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_chapter_subject";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_level_subject";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_subtopic_topic";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_topic_chapter";

-- DropIndex
DROP INDEX "uq_question_sources_identity";
```

Operation inventory:

| Operation | Count |
|---|---|
| `DROP CONSTRAINT` | **5** |
| `DROP INDEX` | **1** |
| `ADD CONSTRAINT` | 0 |
| `ADD COLUMN` | 0 |
| `DROP TABLE` | 0 |
| `ALTER COLUMN` | 0 |
| Referential-action statements (`ON DELETE` / `ON UPDATE`) | **0** |
| `CREATE …` replacement for the dropped index | **0** |

## 15.4 C-1 … C-5 individual results

| ID | Constraint | Appears in the diff | Form | Preserved if applied |
|---|---|---|---|---|
| C-1 | `fk_questions_level_subject` | **yes, once** | `ALTER TABLE "questions" DROP CONSTRAINT` | **no** |
| C-2 | `fk_questions_chapter_subject` | **yes, once** | same | **no** |
| C-3 | `fk_questions_topic_chapter` | **yes, once** | same | **no** |
| C-4 | `fk_questions_subtopic_topic` | **yes, once** | same | **no** |
| C-5 | `fk_answer_keys_options_of_version` | **yes, once** | `ALTER TABLE "answer_keys" DROP CONSTRAINT` | **no** |

All five are dropped **unconditionally and without comment beyond Prisma's `-- DropForeignKey` marker**.
No `ON DELETE`/`ON UPDATE` is changed before or after the drop — the constraints are simply removed, so their
`RESTRICT` semantics vanish with them.

## 15.5 The six hand-written indexes — one of six is at risk, not six of six

| Index | Kind | Appears in E1 |
|---|---|---|
| `uq_question_versions_one_published_per_question` | partial (`WHERE status='PUBLISHED'`) | **no** |
| `uq_question_sources_identity` | `NULLS NOT DISTINCT` | **YES — `DROP INDEX`** |
| `uq_topics_chapter_order` | partial (`WHERE is_active`) | **no** |
| `uq_tags_name_lower` | expression (`lower(name)`) | **no** |
| `uq_colleges_name_lower` | expression (`lower(name)`) | **no** |
| `ix_question_assets_checksum` | partial (`WHERE checksum IS NOT NULL`) | **no** |

The five partial/expression indexes are left untouched. Why `uq_question_sources_identity` is the exception is
`PARTIALLY VERIFIED`: the observation is measured, the mechanism is inferred. A `NULLS NOT DISTINCT` unique
index is something Prisma's model *can* represent approximately, so the engine reports it as a modelled object
the datamodel does not declare — drift — whereas partial and expression indexes cannot be represented at all
and are therefore ignored. The datamodel declares no `@@unique` on `question_sources` (comment only at
`schema.prisma:482`); the de-duplication guarantee exists solely as hand-written SQL (§3.10).

**Consequence if this diff were applied:** `question_sources` would lose `NULLS NOT DISTINCT` de-duplication,
and nothing in the diff would restore it.

## 15.6 E2 — Option C snapshot → snapshot, no change

```
node_modules/.bin/prisma migrate diff --config prisma.config.ts \
  --from-schema /tmp/drift/snapshot-prev.prisma --to-schema prisma/schema.prisma --script
```

Exit **0**, output 32 bytes:

```sql
-- This is an empty migration.
```

**Statement count: 0** — Option C's authoring path reports no change when there is none. `VERIFIED`

(Harness note: the first run wrongly asserted a zero-byte file and failed a correct result. The sentinel is
Prisma's documented empty-diff output; emptiness is now counted by statements.)

## 15.7 E3 — Option C with one additive probe

A copy of the datamodel gained `probeMarker String?` on `Subtopic`; the committed file was never modified.

```
node_modules/.bin/prisma migrate diff --config prisma.config.ts \
  --from-schema /tmp/drift/snapshot-prev.prisma --to-schema /tmp/drift/snapshot-probe.prisma --script
```

Exit **0**, complete output (74 bytes):

```sql
-- AlterTable
ALTER TABLE "subtopics" ADD COLUMN     "probeMarker" TEXT;
```

Exactly one statement, additive, and **no** `DROP CONSTRAINT`, `DROP INDEX`, `DROP COLUMN` or `ALTER COLUMN`.
The controlled workflow detects a real change without generating unrelated destructive SQL. `VERIFIED`

## 15.8 Referential actions

Zero `ON DELETE` or `ON UPDATE` statements appear anywhere in E1. This confirms the Session 9 static
comparison at runtime level: all 21 modellable relations agree with the catalog on both actions, so Prisma has
nothing to rewrite. The prototype's cascade rewrites were a prototype artefact. `VERIFIED`

## 15.9 Proposed SQL versus executed SQL

| Level | Count |
|---|---|
| Proposed by Prisma (E1) | **6** statements (5 drop constraint, 1 drop index) |
| Executed by this workflow | **0** |
| Successfully applied | **0** |
| Catalog state verified afterwards | unchanged — the catalog dump before and after is **byte-identical** (delta file 0 bytes) |

The workflow captures the catalog before and after and fails if they differ; they did not. No destructive SQL
was executed anywhere, and none was executed "to demonstrate that it was generated".

## 15.10 Catalog integrity

```
TABLES|18  ENUMS|7  FKS|26  CHECKS|47  COMPOSITE_FKS|5  UNMODELLABLE_INDEXES|6
```

All 26 constraint names and all 6 hand-written index names were captured before the diff and after it, with a
zero-byte difference. The database was a disposable `postgres:16` service container, dropped with the job.

## 15.11 Harness history (all runs on this branch)

| Run | Commit | Outcome | Note |
|---|---|---|---|
| [`45380768045`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45380768045) | `b7eba84` | failure | **E1 succeeded and is valid**; E2 failed on the harness's own zero-byte assertion |
| [`45381042601`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45381042601) | `d7cce48` | failure | `bash -e -o pipefail`: an empty diff makes `grep` exit 1 and aborted the step |
| [`45381341939`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45381341939) | `b94c446` | success | hit GitHub's per-step annotation cap; last two emits dropped |
| [`45381634139`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45381634139) | `6376d2a` | **success** | complete evidence; E1 byte-identical to the first run |

Both failures were defects in the harness's assertions, reproduced and fixed locally before re-running; neither
was a Prisma or schema defect. E1's output was identical in every run that reached it.

## 15.12 Remaining limitations

1. **Nothing was applied.** The diff is measured, not executed; the resulting catalog after applying it is
   therefore inferred, not observed. That is deliberate — the experiment must not destroy the reference schema.
2. **One Prisma version, one PostgreSQL version.** Prisma 7.10.1 and PostgreSQL 16 only. Behaviour on other
   versions is unmeasured.
3. **No shadow-database comparison.** `migrate diff --from-migrations` (which needs a shadow database) is
   prohibited by the project's own guard and was not used.
4. **The `uq_question_sources_identity` mechanism is inferred**, not proven (§15.5).
5. **This says nothing about production.** It is a disposable-container measurement.

## 15.13 What this changes, and what it does not

- **G-1 gains full-schema evidence.** It was FAILED on a prototype; it is now FAILED on the real schema, with
  a precise blast radius instead of an extrapolated one. **G-1 remains FAILED** — now better evidenced.
- **The open question in §14 (R1/R2) is closed.** C-1…C-5 are dropped; five of six hand-written indexes are
  safe; the sixth is dropped.
- **A new, specific risk is recorded:** `uq_question_sources_identity` would be removed by an ordinary Prisma
  diff, with no replacement, leaving `question_sources` without its documented de-duplication guarantee.
- **Option C's suitability is reinforced within tested scope** (E2 empty, E3 exactly one additive statement),
  and this is *not* a claim that the controlled workflow is production-safe.
- **B1b / B2 are unchanged.** The measurement adds a reason to keep the ordinary path prohibited; it does not
  authorise anything. Operational gaps from
  `phase-04a-b2-production-migration-decision-review.md` §10 still stand.

## 15.14 Reproduction

```bash
gh workflow run phase04a-real-schema-drift.yml --ref <branch>     # or push a change under prisma/**
# or locally, with a disposable PostgreSQL 16 and a reachable engine:
DATABASE_URL=postgresql://user:pass@localhost:5432/drift \
  npx prisma migrate diff --config prisma.config.ts \
    --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code
```

The complete evidence for run `45381634139` is attached as `real-schema-drift-evidence`
(`e1-nochange.sql`, `e2-snapshot-nochange.sql`, `e3-additive.sql`, `02-catalog-before.txt`,
`03-catalog-after.txt`, `04-catalog-delta.txt`, `05-e1-inventory.txt`, toolchain and hash files) and was also
published as chunked annotations so it is readable through the API without log access.
