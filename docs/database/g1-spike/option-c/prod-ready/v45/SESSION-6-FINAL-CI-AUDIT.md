# Session 6 — Final CI Verification and Pre-Merge Audit

**Date:** 2026-11-24
**Branch:** `arena/1b743f18-hsc-alim-ict-question-bank`
**HEAD:** `649c714ae7fcef7b459e9208c8930711282229b2` (branched from `main`)
**Working tree:** 16 modified files, 6 untracked entries, **nothing committed, nothing pushed, no stashes**
**Overall verdict:** **PASS WITH EXCEPTIONS** — every locally decidable criterion passes; the
GitHub Actions criterion is **BLOCKED** because the branch does not exist on the remote and
CI therefore cannot run against this working tree without a push, which is not authorized.

Unchanged headings: **G-1 = FAILED · G-3 = PASSED · Option C = approved controlled workflow only ·
B2 = WITHHELD · production application of 0001 = NOT AUTHORIZED.**

---

## 1. Repository state (preserved)

- No reset, stash, discard, checkout or overwrite was performed. `git stash list` is empty.
- No commit, push, merge order, PR, or deployment was created.
- Two verification servers were started and stopped locally (a disposable PostgreSQL 16.2
  cluster under `/tmp`); its databases were dropped and the cluster is stopped.

## 2. Exact file inventory

**Modified (16)**

| File | Purpose |
| --- | --- |
| `.github/workflows/phase04a-prod-ready-v1-v5.yml` | V-1 deploy now runs through the checksum gate; `pull_request` paths mirrored to `push`; `scripts/db/**` added |
| `.github/workflows/phase04a-v45-application.yml` | gate/harness steps, unit floor, integration skip guard + count floor, `guard.py` in path filters |
| `docs/…/option-c/repo-guard.sh` | rewritten scanner (executed-surface only, `*.py` scope) |
| `docs/…/v45/{AMB-5-LEGACY-ARCHIVE-DECISION,APPROVED-DECISIONS-REPORT,FINAL-CROSS-BOUNDARY-VERIFICATION,OD-18-COVERAGE}.md` | decisions, reconciliation, coverage |
| `docs/database/phase-04a-question-bank-physical-schema-proposal.md` | C-1…C-5 wording |
| `docs/development/database-migrations.md` | guard + known-limit sections |
| `lib/validation/content-blocks/profiles.ts` | rubric criterion kinds (relocated export) |
| `package.json` | `db:migrate` → disabled script, `db:deploy` → gate, `db:verify-history` added |
| `server/questions/change-type.ts` | AMB-5 single-parameter, fail-closed, same-transaction lock/read/write |
| `server/questions/publish/rules.ts` | OD-18 rubric authority |
| `tests/unit/questions/{amb5-type-change,rubric-strict}.test.ts` | assert strengthening |
| `vitest.integration.config.ts` | corrected behaviour comment |

**Untracked (6 entries)**

`scripts/ci/deploy-gate-pg-check.sh` (273 lines) · `scripts/db/` (3 files: `deploy-gate.sh`,
`deploy-path-guard.py`, `migrate-disabled.sh`) · `tests/unit/questions/amb5-service-enforcement.test.ts`
(288) · `tests/unit/questions/rubric-authority.test.ts` (232) · `tests/unit/questions/rubric-authority-mutation.test.ts`
(141) · `tests/unit/tooling/` (3 files: gate 26, repo-guard 37, path-guard 25 cases).

## 3. Verification matrix

| Criterion | Result | Evidence |
| --- | --- | --- |
| Unit suites | **PASS** | `npx vitest run tests/unit/` → **19 files / 692 tests passed**, re-run after this session's edits |
| Lint | **PASS** | `npx eslint .` → exit 0, 0 errors |
| Typecheck | **BLOCKED locally** | `npx tsc --noEmit` → 19 errors: 7×TS2307 (`@/lib/generated/prisma/client`), 12×TS7006 derived. `prisma generate` cannot run here (engine download TLS-blocked). CI generates the client before typechecking |
| Prettier | **PASS (with pre-existing exception)** | all 16 changed files clean; `phase04a-prod-ready-v1-v5.yml` fails **identically at HEAD** (single-quote style, `docs` is prettier-ignored), so not introduced here |
| Repository guard | **PASS** | exit 0, "no prohibited Prisma migration command in any executed surface", 14 surfaces |
| Deployment-path guard | **PASS** | exit 0, 2 gated deploys, 16 npm scripts, 28 files, **6 exceptions / 19 invocations** |
| Checksum gate vs real PostgreSQL 16.2 | **PASS** | **9/9, 0 failed** (re-run today, see §7) |
| PG integration (5 suites) | **BLOCKED — CI only** | 47 cases exist and are discovered; cannot execute without a generated Prisma client |
| AMB-5 concurrency (4 cases) | **BLOCKED — CI only** | present and inside `describeDb` |
| GitHub Actions | **BLOCKED** | no workflow has run against this working tree |

## 4. GitHub Actions

**No run exists for this working tree.** `git ls-remote` shows zero refs for the branch, so
`workflow_dispatch` would execute the old `649c714…` revision, not these changes — which is
exactly the substitution §3 forbids. Pushing was not authorized, so it was not done.

Runs that are known are all against **old HEAD `649c714…`** and say nothing about the working
tree: successes `45327791897`, `45327791943`, `45327791922`, `45327791862`; expected failures
`45327791871`, `45327791786` (G-1 legacy evidence).

## 5. Fixes applied during this audit

Six changes, all in response to §2/§4 defects found during review. None weakens a guard.

1. **Silent-skip defect.** All five integration suites use
   `const describeDb = hasDatabase ? describe : describe.skip`. Skipping is loud locally, and CI
   greps for `SKIPPED|Tests .*skipped`, but the workflow's count floor was only **29** against
   **47** real cases. Floor raised **29 → 47** with the per-suite breakdown in a comment. Verified
   fail-closed on synthetic summaries: `47 passed` → PASS; `5 passed | 42 skipped` → FAIL;
   all-skipped → FAIL; `no tests` → FAIL.
2. **Unit floor stale.** Raised **390 → 660** (margin below the current 692). Regex validated
   against the real log: extracts `692`.
3. **Stale config comment.** `vitest.integration.config.ts` claimed the suites fail rather than
   skip and cited a non-existent `tests/integration/setup.ts`. Replaced with the true behaviour
   and the reason a skipped run still cannot go green in CI.
4. **Path-filter gap — `guard.py`.** The checksum gate delegates to
   `docs/…/option-c/guard.py history`, but the workflow that exercises the gate did not watch that
   file. Added explicitly to both `push` and `pull_request` filters (no `docs/**` wildcard).
5. **Path-filter gap — drift between `push` and `pull_request`.** `phase04a-prod-ready-v1-v5.yml`
   watched `guard.py`, `repo-guard.sh`, `package.json` on push only, and did not watch
   `scripts/db/**` at all despite now executing `scripts/db/deploy-gate.sh`. `pull_request` now
   mirrors `push`, and `scripts/db/**` is in both.
6. **Unexplained diff removed.** An earlier JSON rewrite had escaped the em dash in
   `package.json`'s `description` (`—` → `\u2014`). Restored; the `package.json` diff is now only
   the three database scripts.

## 6. Checksum and deployment-path controls

- `scripts/db/deploy-gate.sh deploy` runs `guard.py history` **first** and execs Prisma only on a
  positive verification. Every "cannot verify" branch (missing guard, unreadable history, query
  error, non-zero/crashed guard) **refuses**.
- `deploy-path-guard.py` reports exactly the six approved harness exceptions and 19 invocations —
  allowance equals actual, zero headroom, no wildcard and no unreviewed exception:
  `g1-spike/run.sh` 1, `experiment-2/run.sh` 3, `option-c/run.sh` 3, `option-c/g3/run.sh` 5,
  `option-c/g3-full/run.sh` 5, `prod-ready/v1/v1-second-migration.sh` 2.
- `package.json` exposes no path to a raw deploy: `db:deploy` is the gate, `db:migrate` is the
  disabled stub, `db:verify-history` is verification only.
- Raw-SQL paths remain explicitly **outside** the guarantee (stated in output and in
  `docs/development/database-migrations.md`).

## 7. Checksum gate against real PostgreSQL 16.2 (re-run today)

```
PASS  matching history verifies (exit 0)
PASS  a modified applied migration is refused (exit 1)
PASS  a vanished migration file is refused (exit 1)
PASS  a history row with no checksum is refused (exit 1)
PASS  a mismatched recorded checksum is refused (exit 1)
PASS  a non-empty schema with no history is refused (exit 1)
PASS  failed verification prevents deployment (no deploy reached)
PASS  successful verification reaches the deploy command with forwarded args
PASS  an empty database is determined and the first deployment proceeds
checksum gate vs real PostgreSQL: 9 passed, 0 failed
```

Disposable databases only (`hsc_gate_check_<case>_<pid>`), all dropped afterwards (verified: 0
remain); the positive control uses a fake `npx` sentinel, so no Prisma CLI and no migration ran.

## 8. AMB-5 and OD-18

- **AMB-5:** `changeQuestionType(input)` — exactly one parameter (asserted structurally by
  `changeQuestionType.length === 1`). No bypass flag, no exception mechanism, no review override;
  attempts to pass `{ allowLegacyArchivedTypeChange: true }` are cast-forced in the tests and must
  throw. Fail-closed on every path. Lock, read and write use the same transaction client. Four
  concurrency cases exist at lines 366, 419, 469, 488 of `change-type-service.test.ts`. Two distinct
  error codes remain distinct.
- **OD-18:** `cqRubricSchema` is the single shape validator; the adapter only translates `.issues`
  into `{path, message}` and holds no competing logic; unknown fields are rejected (proven by the
  mutation suite); cross-document totals are owned by I-7/I-15 only.

## 9. Database integrity — byte-for-byte

`git hash-object` compared against `git rev-parse HEAD:<path>` for every tracked file under
`prisma/`: `schema.prisma`, `migrations/0001_phase04a_question_bank/migration.sql` and
`migrations/migration_lock.toml` are all **identical to HEAD**. No untracked file under `prisma/`;
no `0002_*`; 18 models; **47** CHECK constraints; 26 FKs of which **5** are the composite FKs
(C-1…C-5) in PART D; no exam tables; "negative marking" appears only in comments. **No production
migration was run.**

## 10. Remaining blockers

1. **CI unverified (blocking for an unconditional PASS).** Requires an authorized push of this
   exact tree.
2. **Generated client / typecheck.** Cannot be produced in this sandbox (TLS-blocked engine
   download). Resolves in CI at the "Generate the Prisma client" step.
3. **Integration + concurrency execution.** Depends on (2); 47 cases and 4 concurrency cases are
   present, discovered, and floored at 47, but have not executed.

## 11. Commands for the owner

```bash
# 1. Review, then commit and push (this is the only thing that unblocks CI)
git diff                      # 16 files
git add -A
git commit -m "phase 04a: checksum gate, deployment-path guard, AMB-5, OD-18"
git push -u origin arena/1b743f18-hsc-alim-ict-question-bank

# 2. Watch the runs for the exact commit
gh run list --branch arena/1b743f18-hsc-alim-ict-question-bank --limit 10
gh run watch <run-id> --exit-status
gh run view <run-id> --log-failed

# 3. Confirm the two security-critical counts in the v45 job log
#    expect: "integration tests passed=" line, then "OK: 47 integration cases executed"
#    and the 9/9 checksum-gate block; any "SKIPPED" or <47 fails the job by design
```

`g1-prisma-drift-spike` / G-1 legacy-evidence workflows are **expected to be red**; that is the
recorded G-1 FAILED state, not a regression.

## 12. Merge readiness

**PASS WITH EXCEPTIONS.** All locally decidable criteria pass and the three defects found in this
audit are fixed. Merge is recommended **only after** the pushed commit's
`Phase 04A — V-4 / V-5 application verification` workflow is green with `≥47` integration cases,
4/4 concurrency cases, a clean typecheck and the 9/9 checksum block. Until that run exists, the
CI criterion stays **BLOCKED** and this report must not be read as CI-verified.
