# OD‑26 decision package — six open sub-items

Status: **DECISION PACKAGE ONLY. No option is selected. No value is approved.**
Register entry: `docs/architecture/technology-decisions.md` line 67 — "Before
implementation".
Context: `ACCEPTANCE-AUDIT.md` §6, `ZOD-BOUNDARY-DEPENDENCY.md`.

---

## How to read this

OD‑26 bundles six questions that were recorded as one line. They are split here
because they have different owners, different deadlines and different costs, and
bundling them is why none has been decided. Each carries options, the
consequences of choosing, and what is *already true* in the repository — so that
each decision is a small delta from a working state rather than a greenfield
choice.

**Nothing below is a recommendation to adopt an unapproved value.** Where a
threshold is needed I say so and leave it blank; inventing one is precisely what
this task forbids.

## What is already true (measured, not proposed)

- Two GitHub Actions workflows exist and both are green at `ae27b74`.
- Vitest unit suite: 182 tests, 7 files.
- Vitest integration suite: 29 cases across 4 files, against a **disposable
  PostgreSQL 16 service container** in CI, with migration 0001 applied.
- Integration suites **skip** without `DATABASE_URL`, and a CI guard fails the
  job if any suite skips — a skip is never counted as a pass.
- A count floor (≥ 29) fails the job if fewer cases run.
- A mutation step proves the D2 regression test fails on the old behaviour.
- RTL and Playwright are named as intended in the register but **no browser or
  component tests exist**.
- No performance thresholds are enforced anywhere.
- No security tests exist as a category.

---

## 26‑1 Required-checks policy

**Question:** which checks block a merge to `main`, and can any be waived?

| Option | Consequence |
| --- | --- |
| **A. Both workflows required, admin can override** | Default-deny with a documented escape hatch. Reviewers cannot merge red; an admin still can, so an incident has a path. |
| **B. Both workflows required, no override** | Strictest. Every production hotfix waits for a full PG 16 run. |
| **C. Unit + typecheck required; integration advisory** | Fast merges, but the only real-database proof becomes skippable — and this effort has already had two false-pass incidents from weak evidence. |
| **D. Per-area required checks** | `server/` changes require integration, docs changes do not. Cheapest on docs PRs, most complex to maintain. |

**Already true:** both jobs are green and the guards are strict. Making them
*required* is a branch-protection setting, not a code change — a few minutes of
UI work once the policy is chosen.

**Decisions required:** which option; whether override is allowed and by whom;
whether the override is recorded anywhere (an unrecorded override is invisible
to audit).

**Known risk if C or D:** a change that breaks the publish gate can merge if the
integration job is not required for that path. The D2 defect — a snapshot read
outside the locking transaction — was invisible to every unit test and would have
merged under C.

---

## 26‑2 Isolation policy

**Question:** how do tests keep state from leaking between runs and between cases?

| Option | Consequence |
| --- | --- |
| **A. Disposable container per job, shared within the run (current)** | What exists today. Fast; migration applied once. Requires every suite to clean up after itself, and it does — `cleanupFixtures()` plus fixture-tagged codes. |
| **B. Container per test file** | Stronger isolation, roughly 4× the container startup cost, and `fileParallelism:false` already serialises the files so the gain is small. |
| **C. Container per test case** | Maximum isolation, impractical: migration 0001 takes seconds. |
| **D. Transaction-per-test wrapping** | Fast and clean, but **cannot** test a real transaction boundary, which is the entire point of the D2 and D3 suites. Would silently weaken them. |

**Already true:** option A, with `fileParallelism: false`, fixed fixture codes
(`IT45F_LEVEL` / `IT45F_SUBJECT`), and cleanup in `afterAll`. The D2 test rolls
back by design (throws) rather than committing.

**Decisions required:** whether A is ratified as policy or replaced; whether
fixtures get a per-run unique prefix to survive a crashed run that skips cleanup.

**Note against D:** worth recording explicitly, because it is attractive and
would defeat the purpose. Any test asserting on lock visibility must run outside
a wrapping transaction.

---

## 26‑3 Performance thresholds

**Question:** what performance is enforced, and where?

| Option | Consequence |
| --- | --- |
| **A. None (current)** | Zero false failures; latency regressions are only noticed by users. |
| **B. Advisory reporting only** | Numbers appear in CI without blocking. Cheap; nobody reads them. |
| **C. Hard thresholds on a small set** | Catches real regressions, but sandbox-to-sandbox variance on shared runners causes flakes, and a flaky required check gets disabled — taking the rest of the suite's credibility with it. |
| **D. Thresholds measured against a committed baseline** | Most reliable; needs a baseline to be established and maintained. |

**Already true:** nothing is measured. **No threshold value is proposed here** —
that is the decision, and any number I supplied would be invented.

**Decisions required:** whether any threshold is enforced; if so, which
operations (publish latency? gate validation? query count per snapshot read?) and
their values; whether a query-count assertion is preferred to a wall-clock one —
query counts are deterministic and immune to runner variance, and would catch an
N+1 introduced into the snapshot loader without needing a millisecond budget.

---

## 26‑4 Security-test ownership

**Question:** who writes and maintains security tests, and what do they cover?

| Option | Consequence |
| --- | --- |
| **A. Unassigned (current)** | Nobody. Security coverage is whatever happens incidentally. |
| **B. Application team, as part of feature work** | Context is best; competes with delivery pressure and is the first thing dropped. |
| **C. Dedicated reviewer/rotation** | Consistent coverage; needs a person or rota that does not exist. |
| **D. Explicit incident- and threat-driven targets only** | Narrow, defensible scope: test what has been threatened, not everything. |

**Relevant existing material:** the student DTO projection is already tested for
answer-key leakage, the V‑5 mapper is tested for mis-attribution, and the gate
is tested for unauthorised publication. These are security tests even though
nobody called them that — worth naming when assigning ownership.

**Decisions required:** who owns it; whether it is blocking; the minimum scope
(answer-key leakage, authorisation bypass, injection through JSONB content,
signed-link access under OD‑19).

---

## 26‑5 CI provider

**Question:** which provider runs the pipeline?

| Option | Consequence |
| --- | --- |
| **A. GitHub Actions (current)** | Works, green, PG 16 service containers supported, secrets already configured. Costs minutes; runners are shared and occasionally slow. |
| **B. Self-hosted runners** | Faster and cheaper at volume, but a runner is a machine someone must patch — and it would hold database credentials. |
| **C. Another provider (CircleCI, GitLab CI)** | Migration cost for no demonstrated benefit at this size. Loses the tight PR-integration the current workflow relies on (annotations, PR comments). |

**Already true:** GitHub Actions, two workflows, PR-comment evidence channel that
works even when job logs cannot be downloaded.

**Decisions required:** ratify A or choose otherwise. If A, note the one real
constraint found in this effort: **job log downloads were unreachable from some
environments**, which is why the workflow publishes test case names to a PR
comment. A provider without an equivalent channel would lose that evidence path.

---

## 26‑6 §7.11.10 fixture scope

**Question:** how much fixture data does the suite carry, and what does it cover?

§7.11.10 specifies a test-data expectation; the scope of what must be covered is
open.

| Option | Consequence |
| --- | --- |
| **A. Minimal fixtures for the cases that exist (current)** | One level, one subject, one level-subject, one question with two versions. Everything green and comprehensible. |
| **B. Coverage of every enum and constraint branch** | Would exercise the 47 check constraints and 20 unique indexes directly. Large; most branches would never vary in production. |
| **C. Shared seeded corpus across suites** | One authoritative dataset; creates coupling — a change for one suite breaks others. |
| **D. Minimal now, extended per-incident** | Grows only where a defect proves it was needed — which is how the D2 fixture came to exist. |

**Already true:** option A, plus a dedicated `publish-fixtures-db.ts` shared by
the service and regression suites. Unique codes `IT45F_LEVEL` / `IT45F_SUBJECT`
keep runs from colliding, and cleanup is explicit.

**Decisions required:** whether A is ratified; whether particular §7.11.10
scenarios must be represented before the gate can be called accepted (published
+ archived coexistence, type-change, multi-option CQ rubric); whether fixtures
are committed as code or seeded from SQL.

---

## Summary of what is needed

| Sub-item | Blocking anything now? | Needs |
| --- | --- | --- |
| 26‑1 required checks | No — CI is green either way | branch-protection policy |
| 26‑2 isolation | No — A works | ratification |
| 26‑3 performance | No | thresholds, if any |
| 26‑4 security ownership | No | a name |
| 26‑5 CI provider | No — A works | ratification |
| 26‑6 fixture scope | No | scope for §7.11.10 |

None of the six blocks the current corrective pass. All six block calling the
*process* settled, which is why the register still says "Before implementation".
