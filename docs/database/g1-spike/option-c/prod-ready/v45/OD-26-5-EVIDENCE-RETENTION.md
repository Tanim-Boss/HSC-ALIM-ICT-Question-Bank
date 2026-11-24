# OD-26-5 — Evidence retention: what is implemented, and what is not

**Owner decision:** 12 months of audit evidence.
**Hard constraint:** this repository is **public**. GitHub caps Actions artifact
and job-log retention at **90 days** for public repositories (1–90 days; the
1–400-day range applies only to private/internal repositories). Requesting
`retention-days: 365` fails the upload.

These two facts cannot both be satisfied by artifacts. This document states the
result honestly instead of papering over it.

## The distinction that must not be blurred

| Channel | Retention | Why |
|---|---|---|
| Actions artifact `v45-application-evidence` | **90 days** | platform maximum for a public repo |
| Actions artifact `od-26-5-milestone-record` | **90 days** | same cap; durability comes from being committed |
| Job logs | **90 days** | same cap |
| PR comment (canonical, one per PR) | life of the PR | always points at one exact run |
| **Committed milestone record** | **indefinite (git history)** | the 12-month carrier |

**12-month artifact retention is NOT implemented and is not achievable here.**
Anyone claiming otherwise is wrong. What *is* implemented is a durable committed
record that survives after the artifact expires.

For months 1–3 both channels exist. For months 4–12 the committed record is the
only evidence. It is therefore built to be self-sufficient for the questions an
auditor actually asks: *which run, which commit, which environment, which
suites, what result, and how was that classified.*

## The mechanism

1. **`scripts/ci/build-milestone-record.sh`** generates one record per run,
   from the run's own environment and logs. It records:
   run URL + run ID + attempt; workflow name and identity; the branch commit
   SHA; the **synthetic merge SHA, explicitly labelled as test-only**; runner
   and database identity (password stripped by construction); per-suite pass
   and fail counts parsed from real output; a UTC timestamp; and an evidence
   classification the operator must fill in.
2. **The workflow uploads it** as `od-26-5-milestone-record` alongside the log
   artifact. The workflow does **not** commit it: a workflow that pushed to the
   branch would rewrite the commit it is reporting on.
3. **A human commits it** at a milestone to
   `docs/database/g1-spike/option-c/prod-ready/v45/evidence/`. That commit is
   the durable step.

## No accumulating duplicate comments

Previously every run posted a fresh PR comment. Dozens of near-identical
comments accumulated, each authoritative only for its own run, with nothing
marking which was current.

Now there is **one canonical comment per PR**, identified by the
`<!-- v45-app-results -->` marker and **edited in place** by each run. It always
names the exact workflow run it describes. Earlier runs are not deleted — they
remain reachable through their run URLs and their committed milestone records.
Superseding in place is not the same as deleting evidence, and this document
does not claim evidence is retained when it is not.

## Limitations, stated rather than hidden

1. **Artifacts expire at 90 days.** Not configurable upward on a public repo.
2. **The record is a summary.** It holds run identity, counts and
   classification — not per-case detail. Once the artifact expires, per-case
   detail survives only if it was reproduced in a committed test or report.
3. **The record proves a run happened and what it reported.** It does not
   re-verify the result. Re-running the workflow is the only re-verification.
4. **A missing run cannot be proven missing.** Git history shows records were
   not deleted; it cannot show that a run nobody recorded never happened.
5. **A private mirror or a paid retention tier would satisfy 12 months properly.**
   That is an infrastructure decision outside this task and is not assumed.

## What this document is not

It is not a claim of compliance with the 12-month requirement. It is the
record of how far the requirement can be met on the current hosting, what
carries the remainder, and where the remainder still depends on a decision the
owner has not made.
