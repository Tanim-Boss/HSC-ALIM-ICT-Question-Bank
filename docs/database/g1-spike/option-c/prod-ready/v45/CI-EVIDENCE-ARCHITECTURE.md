# CI evidence architecture — proposal for the remaining OD-26-5 decision

Status: **12-month retention APPROVED (owner). Evidence *architecture* is a
PROPOSAL awaiting approval — not implemented.**
Measured 2026-11-23.

---

## 1. The approved requirement, and what the platform actually allows

**Owner decision:** 12-month retention for retained CI verification evidence.

**Platform facts, verified from GitHub's documentation this session:**

| Fact | Value | Source |
| --- | --- | --- |
| Default retention (checks, workflow runs, statuses, artifacts, logs) | 90 days | GitHub Docs, *Managing GitHub Actions settings for a repository* |
| Public repository configurable range | **1–90 days** | same |
| Private repository configurable range | 1–400 days | same |
| Per-artifact override | `retention-days` in `actions/upload-artifact` | same |
| This repository's visibility | **public** (`private=false`) | `gh api repos/…` |

**Therefore 365 days is not configurable for this repository.** Requesting
`retention-days: 365` would fail the upload; the ceiling is 90.

**What was done:** all nine `retention-days` values were raised from **30 → 90**,
the maximum the platform permits here, and the v45 workflow carries a comment
explaining that 90 is a platform ceiling rather than the approved policy. The
12-month requirement is therefore **partially satisfied by artifacts and cannot be
fully satisfied by them** in this repository.

**What is NOT claimed:** that 12-month retention is implemented. It is not, for
artifacts — the platform forbids it. The remainder must come from a
repository-committed record (§5).

## 2. Measured evidence-access matrix

Tested against real runs (`45317576586`, `45316897653`) from this environment:

| Channel | Reachable | Run-linked | Survives PR close | Survives 12 mo |
| --- | --- | --- | --- | --- |
| Job log (REST `/actions/jobs/{id}/logs`) | **NO** — redirects to `productionresultssa*.blob.core.windows.net`, unreachable | yes | no | no |
| Artifact zip (REST `/actions/artifacts/{id}/zip`) | **NO** — same host | yes | no | **no (90 d max)** |
| Step summary (`$GITHUB_STEP_SUMMARY`) | **NO** — same class of host | yes | no | no |
| Check-run annotations | **YES** | via check-run id | no | no |
| PR comment | **YES** | **was NO — fixed** | no | no |
| Committed file in the repo | **YES** | via commit SHA | **yes** | **yes** |

Only **annotations, PR comments and committed files** are readable here. Of those,
only a **committed file** survives PR closure and 12 months.

## 3. What was fixed this pass (approved-scope only)

The comment now carries run identity, which it previously lacked:

- head commit SHA, and the synthetic merge SHA **labelled as synthetic** (the
  comment previously showed only `GITHUB_SHA`, which on `pull_request` is GitHub's
  merge commit — a reviewer could not reach the branch code that ran);
- PR head SHA when it differs, so the mapping is explicit;
- workflow run id **as a URL**, run attempt, event name, ref;
- PostgreSQL image tag, so the environment is stated rather than assumed;
- a line saying each run posts a fresh comment and this one is authoritative only
  for the linked run.

**This is evidence hygiene, not a new architecture.** It adds no channel, changes
no retention, and stores nothing new.

## 4. Duplicate-comment accumulation — measured, unresolved

On PR #10: **107 comments total**, of which **19** are `v45-app-results`
evidence comments, each for a different run. The workflow **appends** a new
comment per run rather than editing.

Consequences:

- the PR becomes unreadable, and the *latest* comment is not marked as
  authoritative beyond a line of text;
- a reviewer must scroll to find the run they care about;
- nothing is lost, but nothing is indexed either.

**Two candidate fixes, needing the owner's choice:**

| Option | Mechanism | Trade-off |
| --- | --- | --- |
| **A** Edit one canonical comment per PR | find the comment by its HTML marker via `gh api`, `PATCH` it | one comment, always current; **loses** the per-run history |
| **B** Append per run, but index them | a table in the PR body linking each run | keeps history, bounded noise, needs body-editing rights |
| **C** Leave as is | — | works; grows without bound |

**Recommendation: B.** Per-run history is the audit trail; collapsing to one
comment (A) destroys exactly what a reviewer needs when asking "what changed
between run 12 and run 13". B keeps both, and the PR body is committed nowhere so
it costs nothing.

## 5. The committed milestone record (the only 12-month-capable channel)

Because artifacts cap at 90 days and PR comments die with the PR, a durable
12-month record **must** be a committed file. Proposed shape — a proposal, not an
implementation:

```
docs/database/g1-spike/option-c/prod-ready/v45/evidence/
  <milestone>-<YYYY-MM-DD>.md
```

containing, per accepted milestone (not per run):

| Field | Why |
| --- | --- |
| Head commit SHA | identifies the code |
| Run id + URL | identifies the run |
| Run attempt | distinguishes re-runs |
| Date (UTC) | ages the record |
| Test counts (unit / integration) | the headline number |
| Case list or a summary | what actually ran |
| PostgreSQL image | the environment |
| Migration checksum | proves 0001 was the committed one |
| Who accepted it | accountability |

**Open owner choices here (not invented):**

1. **Cadence** — per accepted milestone, per release, or per merge to `main`?
   Per-merge would be hundreds of files; per-milestone is a handful.
2. **Location** — in-tree under `docs/…/evidence/`, or a separate evidence branch
   so the record does not pollute the main history?
3. **Authoring** — written by the workflow (needs `contents: write` and a commit
   back to the branch, which is awkward on a PR from a fork) or by hand at
   acceptance (simpler, human-verified, and the acceptance is a human act anyway)?
4. **Does 12 months apply to the committed record as a *deletion* policy?** The
   instruction says "do not delete existing repository records", so the record is
   retained indefinitely; the 12-month figure then governs *artifacts*, which cap
   at 90 days regardless. **This needs an explicit confirmation.**

## 6. How a reviewer identifies the exact run

With what now exists plus the proposal:

1. Open the evidence comment for the milestone → it carries the **run URL** and
   the **head SHA**;
2. open the run URL → GitHub shows check runs, attempt number, and artifacts;
3. confirm the head SHA matches the branch commit under review (the comment
   distinguishes it from the synthetic merge SHA);
4. for anything older than 90 days, the artifact is gone — read the committed
   milestone record instead, which carries the same SHA and run id.

That is a complete chain **provided** §5 is approved. Without it, evidence older
than 90 days is unrecoverable, and the 12-month policy cannot be met.

## 7. Honest limitations

- **Twelve-month artifact retention is impossible in this repository.** Public
  repos cap at 90 days. Any claim of 12-month artifact retention would be false.
- **Job logs, artifacts and step summaries are unreadable from this environment.**
  They redirect to a blob host outside the allowed network. This is an environment
  property, not a repository defect, but it constrains what evidence can be
  verified from here.
- **PR comments are not a durable audit record**: PR-scoped, append-only,
  unindexed, and no integrity binding. The added run identity makes each comment
  *traceable*; it does not make comments *retained*.
- **GitHub's 90-day cap applies to checks, workflow runs and statuses too** — but
  from 1 October 2026, per the documentation note; before then those are retained
  400+ days regardless of configuration.

## 8. Recommendation summary

| Item | Recommendation | Blocking? |
| --- | --- | --- |
| Artifact retention | **90 days** (platform max, applied) | done |
| Comment run-identity | **applied** | done |
| Duplicate comments | **Option B** — index per run | needs approval |
| Committed milestone record | **adopt**, shape in §5 | needs approval |
| Cadence / location / authoring | owner's choice (§5) | **blocking on owner** |
| 12-month semantics | confirm it governs artifacts (impossible) or the committed record (possible) | **blocking on owner** |
