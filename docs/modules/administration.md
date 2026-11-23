# Administration and content management

**Purpose and scope.** Define authorized administrative workflows for taxonomy, question content, users, moderation and operational settings. Administration orchestrates owning domain services rather than bypassing them.

## Responsibilities and boundaries

| Area | Administrative responsibility | Domain boundary |
|---|---|---|
| Questions/taxonomy | Create/edit drafts, preview, review, publish, archive and correct content and sources. | Question Bank owns validation, versions, assets and keys; historical exams remain stable. |
| Students/roles | Manage permitted accounts and assignments. | Student Management owns identity associations; authorization and audit are mandatory. |
| Exams/papers/results | Manage permitted examinations, documents and reports. | Examination/Paper Studio own state and data; no arbitrary score writes. |
| Audit/settings | Inspect restricted audit history and change approved configuration. | Audit sensitive actions, protect before/after values, never expose secrets. |
| AI ingestion | Parse source text/images into reviewable proposals if the feature is approved. | Adapter handles provider calls; human validates and publishes through Question Bank. |

The blueprint names Super Admin, Content Admin, Exam Manager, Moderator and Analyst. These are areas of responsibility, not a blanket entitlement matrix. Server authorization must check both action and target. Role bootstrap, separation of reviewer/publisher, institutional scope and sensitive operations are OD-16/OD-27.

## Content workflows

The design spec lists Draft, Under review, Approved, Published, Rejected, Archived and Needs correction; valid transitions, whether intermediate draft output is saved and who may perform each transition are **OD-27**. Mandatory invariants: validated structured content, human approval before any AI-generated question is published, stable versioning for exams, and audited key/status changes. The editor supports bilingual text, options/CQ parts, diagrams, math and code through the shared content model.

Bulk import accepts a proposed JSON/CSV input, validates records, displays errors/warnings and a preview, flags duplicates, and requires an authorized confirmation; image-to-asset mapping is separate. Do not silently import partial invalid data until OD-27 defines batch semantics. A normalized-stem hash detects identical normalized stems, not near-duplicates by itself; fuzzy matching criteria are unresolved.

The AI Question Parser is an advanced-admin workflow, not an autonomous publisher: parse an authorized source, show extracted fields and any confidence hints, let a human correct and verify the answer, validate, then publish through the normal service. Track `createdVia: AI_PARSER` and model version for audit. The README alternates between “nothing saved yet” at review and entering a draft; persistence before review is open. Respect provider quotas and source/content rights.

## Acceptance criteria

- Restricted operations fail when directly invoked by an unauthorized principal, regardless of UI visibility.
- Every sensitive key, role, content or settings change records actor, action, target and time, with protected audit detail sufficient for investigation.
- Published version changes do not silently rewrite active exams; an AI parser cannot publish or decide a key without human review.
- Import validation and duplicate warnings are visible before an authorized action; review and correction are traceable.

## Dependencies

Depends on [authorization](../security/authorization.md), [Question Bank](question-bank.md), [Student Management](student-management.md), [Examination Engine](examination-engine.md), [Paper Studio](paper-studio.md), analytics, object storage and the AI adapter when enabled. Each domain retains its own business rules and records.

## OPEN DECISION

[OD-05–OD-06, OD-08–OD-10, OD-14–OD-16, OD-19–OD-20 and OD-27](../architecture/technology-decisions.md#open-decision-register) cover content admission, provenance, versions, release, roles, uploads, retention, moderation/import and source rights.

## Related documentation

[Authorization](../security/authorization.md) · [Question Bank](question-bank.md) · [AI Tutor](ai-tutor.md) · [Roadmap](../development/roadmap.md)
