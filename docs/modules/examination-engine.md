# Examination Engine and evaluation

**Purpose and scope.** Specify the planned exam lifecycle, timing, answer persistence and server-side evaluation. This module is the authority for an attempt; it must not leak official keys through any student-facing exam API.

## Responsibilities and boundaries

The server selects an authorized, persisted snapshot of question versions; controls start, deadline, answers and finalization; evaluates from authoritative server data; and persists one current result. The client renders questions, displays a countdown derived from `expiresAt` and `serverNow`, saves answers and reports connectivity. Browser time, local storage, submitted scores and hidden UI are not authorities. The Question Bank owns versions/keys; this module may read the necessary key internally but never serializes it to student exam responses, including results.

README lifecycle names are `CREATED`, `READY`, `IN_PROGRESS`, `SUBMITTED`, `SUBMITTED_LATE`, `EXPIRED` and `EVALUATED`. A final result must retain whether finalization was on-time, late or expired even if an evaluation state is also shown. The precise state representation and transitions through the grace period are **OPEN DECISION OD-11**; the blueprint's simple diagram and detailed grace rule conflict. Do not assume that `EXPIRED` at the first deadline automatically eliminates the permitted late path.

## Timing and submission

The server records `startedAt` and `expiresAt` when the attempt starts. `graceWindowMs` is server-controlled per exam; the README suggests 5 seconds by default. Use a consistent authoritative server admission timestamp; its exact transaction/arrival definition is OD-11. Server time is included on start/resume and autosave responses so the display can re-sync. The UI can lock controls when its adjusted countdown reaches zero, but the server always makes the decision.

| Server time for a **new** request | Required behavior from the detailed blueprint |
|---|---|
| `t < expiresAt` | A valid answer save or finalization may be accepted, subject to state, owner and other validation. |
| `expiresAt ≤ t ≤ expiresAt + graceWindowMs` | Reject new/changed answers. A finalization may be accepted as `SUBMITTED_LATE` only if the last autosave occurred before `expiresAt` and all approved grace requirements are met. Grace is for network delay, not extra working time. |
| `t > expiresAt + graceWindowMs` | Reject a new final submission. The detailed blueprint calls for evaluating the last persisted autosave as `EXPIRED`; the exact automatic-finalization and result timing is OD-03/OD-11. |

The table uses the inclusive end shown in README §7.2.2. A previously finalized request retried later returns the existing result instead of creating a new submission. The condition “last autosave before expiry” does **not** prove that a late finalization was actually in flight; the evidence and acceptance point require OD-11. The proposed safe finalization payload contains no new answers and reads only previously persisted eligible answers. Its exact contract and grace implementation require approval; never accept a post-expiry answer change through finalization.

## Concurrency, snapshots and evaluation

1. **Generate:** apply the selection criteria and available-count checks; persist selected question IDs and immutable versions. Refresh must not select new questions. The storage/answer-key versioning strategy is OD-10.
2. **Start/resume:** authorize the session owner and state; starting establishes the deadline once. Guest ownership is unresolved.
3. **Autosave:** verify session ownership, selected-item membership, answer shape and pre-expiry server time. A per-answer idempotency key makes an identical replay a no-op. Conflicting tabs, key/payload mismatches and retention are OD-12. A local offline mirror is only a recovery aid and cannot make a late answer valid.
4. **Finalize:** guard the transition and persist the authoritative result atomically with the relevant state change. Concurrent/repeated submissions must yield one logical result and no repeated scoring. A later allowed CQ assessment revision requires the separate approved result lifecycle in OD-13.
5. **Evaluate:** compute MCQ marks on the server from the snapshot, eligible answers and authoritative key/evaluation basis. For uniform marks, `correct × marks − incorrect × negativeMarks`; for differing marks apply the configured values per question. Unanswered/negative-score edge rules are OD-21. **Negative marking is configurable and OFF by default** — it is a marking policy of the examination/marking configuration, **not** an attribute of a question (there is no `negativeMarks` on the question), so the deduction applies only when an authorised user has enabled it for that examination, using a penalty value or rule configured independently of the switch; a disabled setting means incorrect answers incur no deduction even if a penalty is configured. Which entity stores that configuration is not yet decided (OD-21 / OD-NM-1). No client-supplied score is accepted.
6. **CQ:** the blueprint proposes rubric reveal and labelled self-assessment, with later teacher review as a suggested default. Neither modality nor assessment flow is fully approved (OD-01/OD-13/OD-14). AI may explain concepts but must never propose or award CQ marks under the current locked decision.

## Acceptance criteria

- Clock changes, refresh, offline use and multiple tabs cannot extend a deadline or change the snapshot.
- Test a fixed injected server clock at `expiresAt − 1 ms`, exactly `expiresAt`, inside grace with/without a pre-expiry autosave, exactly the grace endpoint and after it. New answer writes at or after expiry fail.
- Identical save retries are no-ops; two simultaneous finalizations persist one result, and a repeat returns it without re-scoring. Conflicting saves follow an approved deterministic policy.
- No student can access another student's attempt; an item from a different snapshot is rejected. Admin edits do not change an active attempt.
- Active and finalized exam API responses, errors, nested fields and caches never contain official keys, correct-option IDs, rubrics or solutions. CQ/source labels remain separate.

## Dependencies

Depends on the [Question Bank](question-bank.md) for stable versions and private keys, [Student Management](student-management.md) and [authorization](../security/authorization.md) for identity/ownership, PostgreSQL/Prisma transactions, and the shared question renderer. [Analytics](performance-analytics.md) consumes saved answers/results; AI and Paper Studio must respect release policy.

## OPEN DECISION

[OD-01, OD-03–OD-04, OD-10–OD-14, OD-17, OD-20–OD-21 and OD-24](../architecture/technology-decisions.md#open-decision-register) cover assessment, guest/expiry policy, versioning, timing, retries, CQ, answer release, contracts, retention, scoring and the AI-scoring conflict.

## Related documentation

[API contracts](../api/api-contracts.md) · [Database relationships](../database/entity-relationships.md) · [Security guidelines](../security/security-guidelines.md) · [Testing strategy](../development/testing-strategy.md)
