# Task 3 — Corrective pass: final report

Branch `arena/1042a18a-hsc-alim-ict-question-bank` · HEAD `c129160` · PR #10
**OPEN, unmerged** (`mergedAt: null`).
CI run [`45317154931`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45317154931) — **both jobs green**.

Scope executed: D1, D2, D3 implemented; AMB‑5 recorded; OD‑17/OD‑18 dependency
and OD‑26 package documented. No business rule changed. Nothing merged.

---

## 1. Files changed

Seven commits, `1fa7aaf → c129160`, 13 files, +1518 / −233.

| File | Change |
| --- | --- |
| `server/questions/publish/snapshot.ts` | **new** (303) — snapshot loader with a required client; `QuestionReader`, `VersionLookup`, `TypeLookup` |
| `server/questions/publish/gate.ts` | rewritten (−270 net) — imports the loader, passes `db`, `TransactionClient`, guards take a narrow reader |
| `server/questions/publish/rules.ts` | +42 — `OPTION_KEY_ALPHABET_INVALID`, AMB‑5 registry entry, corrected doc-comment |
| `server/questions/publish/errors.ts` | +1 code — new `DomainErrorCode` member |
| `tests/integration/questions/publish-service.test.ts` | **new** (259) — 9 service-level cases |
| `tests/integration/questions/snapshot-transaction.test.ts` | **new** (180) — D2 regression, 2 cases |
| `tests/integration/questions/publish-fixtures-db.ts` | **new** (199) — shared DB fixtures/cleanup |
| `tests/integration/server-only-stub.ts` | **new** (17) — test-only marker replacement |
| `tests/unit/questions/publish-rules.test.ts` | +87 — D1 tests rewritten, AMB‑5 pinning |
| `vitest.integration.config.ts` | +17 — `@` and `server-only` aliases |
| `.github/workflows/phase04a-v45-application.yml` | +55 — count floor 18→29, D2 mutation step |
| `…/v45/ZOD-BOUNDARY-DEPENDENCY.md` | **new** — §6 |
| `…/v45/od-26-decision-package.md` | **new** — §7 |

`prisma/` diff is **empty**. Migration 0001 byte-identical, no 0002, no schema
change, B2 withheld, G‑1 still FAILED.

---

## 2. D1 / D2 / D3 implementation

### D1 — wrong error attribution

`checkOptionCardinality` reported *distinct* keys `A,B,C,E` with
`OPTION_KEYS_NOT_DISTINCT` — telling the client to hunt a duplicate that does not
exist. This is exactly the mis-attribution V‑5 exists to prevent, produced by the
code meant to enforce V‑5.

Split into two codes:

- a genuine repeat → `OPTION_KEYS_NOT_DISTINCT` (unchanged);
- distinct but not a complete alphabet → `OPTION_KEY_ALPHABET_INVALID` (new).

The test that pinned the wrong code was updated deliberately, not deleted. Three
tests now cover it: `A,B,C,ঘ` (wrong *script*, alphabet code), `A,B,C,E` (with an
explicit negative assertion that no duplicate code appears), `A,A` (duplicate
preserved).

**Mutation:** revert alphabet→duplicate ⇒ **2 failed**. Restore ⇒ **73 passed**.

### D2 — snapshot read outside the transaction

`publishVersion` took `SELECT … FOR UPDATE` on `tx`, then called
`loadQuestionSnapshot(questionId)`, which called `getPrisma()` — a **different
pooled connection**. PostgreSQL served that connection the pre-transaction
committed state, so the lock protected nothing that was read.

Fixed by moving the loader to `snapshot.ts` with the client as a **required**
parameter, passing `db` explicitly, and declaring `TransactionClient extends
QuestionReader` so the compiler refuses a client that cannot perform the read.
There is no `getPrisma()` fallback in the loader on purpose: a fallback restores
the bug the moment a caller forgets.

**Proven, not asserted.** The loader honours `V45_MUTATE_D2_SNAPSHOT_CLIENT=pool`,
which re-introduces the old behaviour. CI requires the regression test to fail
under it — and it did:

```
AssertionError: the snapshot did not see the transaction's own uncommitted write
— this is defect D2: expected 'DRAFT' to be 'PUBLISHED'
```

The step also requires the failure to be an *assertion* on version status, not a
crash — "the test went red" is not evidence unless the redness is the assertion
under question.

### D3 — no service-level coverage

`gate.ts` was never imported by any test. The old "transaction boundary" test
exercised `prisma.$transaction` plus a thrown `Error`: it proved **Prisma** rolls
back, not that the **service** does.

`publish-service.test.ts` calls the real `publishVersion` for all nine required
behaviours. No Prisma mock anywhere.

---

## 3. Service-level test evidence

All 29 integration cases passed against real PostgreSQL 16, migration 0001
applied, disposable container, real generated Prisma client. Excerpt from the CI
run's published case list:

```
✓ publish-service > publishes a valid question and both writes land 316ms
✓ publish-service > rejects an invalid question and writes NOTHING — both rows untouched 47ms
✓ publish-service > rejects an unverified answer key (I-13 / §7.7 rule 5) and writes nothing 36ms
✓ publish-service > rejects a missing answer key and writes nothing 35ms
✓ publish-service > refuses to publish an already-published version (I-5), leaving it published 32ms
✓ publish-service > refuses a version that belongs to another question 40ms
✓ publish-service > rolls back the version write when the rollup write fails 35ms
✓ publish-service > two concurrent publishes cannot both succeed 43ms
✓ publish-service > does not create or delete questions as a side effect 29ms
✓ snapshot-transaction > sees an uncommitted write made inside the same transaction 316ms
✓ snapshot-transaction > a pooled read is demonstrably a different view (the D2 mechanism) 30ms

 Test Files  4 passed (4)
      Tests  29 passed (29)
```

Requirement coverage: valid publish ✓ · invalid rejected by the real service ✓ ·
no partial writes ✓ · rollback on real service failure ✓ · snapshot+lock share
the transaction ✓ · concurrent publish cannot bypass ✓ · persisted matches
reported ✓.

---

## 4. Evidence buckets, kept separate

**Locally observed — raw PostgreSQL, no Prisma.** The D2 *mechanism* was proven
directly with `pg` against a local PG 16:

```
question 70000000-0000-4000-a000-000000000001
draft    60000000-0000-4000-a000-000000000003
viaTx   = PUBLISHED      (same connection, sees its own uncommitted write)
viaPool = DRAFT          (different connection, sees committed state)
DISTINGUISHES? true
```

This proves the two clients give different views, so a test comparing them can
detect D2. It does **not** claim `publishVersion` was executed locally — it was
not.

**CI-verified — Prisma.** All service-level and D2 regression execution, plus the
mutation proof. `prisma generate` cannot run in this sandbox (TLS to
`binaries.prisma.sh`), so **no Prisma execution is claimed locally**. Everything
in §3 came from run `45317154931`.

**Unit — no database.** 182 tests / 7 files; `publish-rules` 73, `db-errors` 41,
`dto` 17, `gate-behaviour` 12, others. Typecheck 0 non-cascade errors, ESLint
clean, Prettier clean, repo guard `OK: no prohibited Prisma migration command`.

**Honest note on the three CI typecheck failures.** Each was real and each was
invisible locally, because the sandbox has no generated client: a missing
`findUnique` on `TransactionClient`, a missing `update` before it, and finally a
**union** formed by `client ?? getPrisma()` whose two differently-shaped
`findUnique` delegates made the guards uncallable. All three were caught only by
CI. That is the standing cost of this environment, and it is why the first CI run
after touching `gate.ts` is a real verification step rather than a formality.

**Also honest: three self-inflicted test bugs.** One shared assertion leaking
between cases; one substring test matching ordinary payload text; and in this
pass, `viaTx.status !== viaPool.status` comparing `questions.status`, which
publishing a version does not touch — so both sides were `DRAFT` and the
assertion failed while the behaviour was correct. Fixed to compare the *version*
status. Recorded because a test that fails for the wrong reason and a code that
fails for the right one look identical in a red run.

---

## 5. AMB‑5 — recorded, not resolved

Previously a doc-comment only, now in the `AMBIGUITIES` registry (AMB‑1…AMB‑5),
with three pinning tests.

- **Document said:** a question type may change if it was *ever* published.
- **Code implements:** a type change is permitted only when **every version is
  ARCHIVED** — i.e. "currently published".
- **Consequence:** a question that was once published, and now has all versions
  archived, can change type under the code but not under the documented rule.
  Re-archiving then republishing yields a question whose type changed after
  publication — which the "ever published" reading exists to prevent.
- **Recommendation:** adopt the stricter "ever published" reading and require an
  explicit archival-acknowledgement step; it is cheap now and expensive after
  content exists.
- **Owner decision required.** The rule is unchanged; the doc-comment now states
  what the code actually does, so the flip point is visible.

---

## 6. OD‑17 / OD‑18 — the Zod dependency

Deferred, documented in `ZOD-BOUNDARY-DEPENDENCY.md`. **No Zod schema written, no
content shape invented, no wire rule assumed.**

The narrow, true claim: **the publish gate holds** — no invalid question can be
published today. What is missing is *shape* validation at the boundary. A
malformed request reaches `publishVersion` as whatever TypeScript believed it
was; type erasure is not a boundary.

Blocked on, in this order: **OD‑17** (transport and paths, field naming, error
envelope and HTTP mapping, body-size limits) then **OD‑18** (block taxonomy and
versioning, unknown-field policy, the 7-vs-11 denylist divergence, sanitisation).

Verified gaps a schema would close: nested blocks inside option payloads not
rejected; `parseRubric` silently dropping `blocks`/`assets`/`options`; the
documented 6-criteria bound unenforced; two divergent denylists.

Cost of waiting: bounded and non-correctness (wasted work, poor errors). Cost of
guessing: schemas that constrain OD‑17 for the wrong reasons and a validation
layer whose tests pin shapes nobody agreed to.

---

## 7. OD‑26 — six decisions, none taken

`od-26-decision-package.md` splits the single register line into six items with
options, consequences and what is already true. **No option selected, no
threshold invented, no value approved.**

| Sub-item | Options | Blocking now? |
| --- | --- | --- |
| 26‑1 required checks | both-required±override / unit-only / per-area | No |
| 26‑2 isolation | per-job (current) / per-file / per-case / per-test-txn | No |
| 26‑3 performance | none / advisory / hard / baseline-relative | No |
| 26‑4 security ownership | unassigned / app team / rotation / threat-driven | No |
| 26‑5 CI provider | GH Actions (current) / self-hosted / other | No |
| 26‑6 §7.11.10 fixtures | minimal (current) / full-branch / shared corpus / per-incident | No |

Two traps recorded: **transaction-per-test isolation would silently defeat the D2
suite** (a lock-visibility assertion cannot run inside a wrapping transaction);
and **query-count assertions** would catch an N+1 in the snapshot loader without
a millisecond budget — the more durable form of 26‑3 if it is approved.

---

## 8. Remaining blockers and acceptance status

**Acceptance status**

| Item | Status |
| --- | --- |
| D1 error attribution | **FIXED** — mutation-pinned (2 fail on revert) |
| D2 transaction consistency | **FIXED** — proven to fail on old behaviour in CI |
| D3 service-level coverage | **FIXED** — 9 real-service cases CI-verified |
| AMB‑5 | **RECORDED, UNRESOLVED** — owner decision owed |
| Task 2 V‑5 verdict | **ACCEPT** (unchanged) |
| Task 2 V‑4 verdict | **ACCEPT WITH EXCEPTIONS** → the exception D1/D2/D3 covered here is now closed; the Zod exception remains by design |
| G‑1 | **FAILED** — historical, preserved |
| B2 | **WITHHELD** |

**Blockers, none of which this pass was authorised to resolve**

1. **AMB‑5 owner decision** — business rule, cannot be closed by engineering.
2. **OD‑17 / OD‑18** — Zod remains deferred; the boundary stays thin.
3. **OD‑26 six items** — process unsettled; register still "Before implementation".
4. **Other verified gaps, not authorised** — option nested-blocks not rejected;
   `parseRubric` silently drops fields; criteria upper bound unenforced; two
   denylists (7 vs 11); `assertContentWriteAllowed` has zero callers; I‑2 absent.
5. **Two CI process gaps worth naming** — job logs are undownloadable from this
   environment, so the PR-comment channel is the only evidence path and should be
   treated as required infrastructure, not a nicety; and required-check
   protection is still off, so a green run is currently advisory (26‑1).

**Constraints honoured:** migration 0001 byte-identical; no 0002; no `prisma/`
change; no exam tables; no negative-marking fields; B2 withheld; no Zod
implemented; no AMB‑5 rule change; no OD‑26 value invented; no Prisma mocked;
PR #10 open and unmerged; no production deploy.

Stopping here as instructed. **PR #10 remains OPEN for review.**
