# API contracts

**Purpose and scope.** Specify the information, invariants and failure semantics needed by the planned server operations. These are **proposed logical contracts**, not implemented endpoints or an approved wire protocol. Operation names, example field names and JSON are illustrative; HTTP paths/methods, exact types, status codes, pagination and versioning require [OD-17](../architecture/technology-decisions.md#open-decision-register). They must not be treated as an implementation-ready OpenAPI specification.

## Responsibilities and common rules

Every operation validates inputs, establishes the principal, authorizes the action and target, delegates to the owning service and projects an allowlisted result. Opaque IDs below identify resources but do not authorize access. All times are server-issued; timestamps in examples are ISO 8601 UTC. Exam questions are an immutable selection of versions. `AnswerKey`, a correct-option identifier, per-option correctness flags, rubric/solution content and key-bearing nested metadata are prohibited in **all student-facing exam responses**, including results and retries. Active responses contain no per-item evaluation; whether any post-finalization per-item feedback is safe remains OD-14.

List responses require pagination; a cursor versus offset, maximum page size and sorting are open. Required/optional fields below refer to the *information* needed, not finalized names or serialization. Guest eligibility and current-release authorization are separately decided.

## Logical operations

| Operation and caller | Proposed input / validation | Proposed success data | Important failures / boundary |
|---|---|---|---|
| **Question search** — student or approved guest | Authorized filters: level, subject, chapter/topic, board/year/source, type, difficulty, search and page. Validate combinations and limits. | Published question summaries, source labels, authorized content, total/facet information as approved, page continuation. | Invalid filters; no matches is a successful empty list. No keys, privileged drafts or unapproved explanations; scope guest and active-exam visibility (OD-04/OD-14). |
| **Create exam** — authorized learner | Manual selected question/version identities **or** validated selection criteria/count, type, timing and optional balance. Server resolves selection and eligibility. | Exam identity, configuration and selected-item summary without keys. | Insufficient available questions is a clear failure, not a silently partial exam; invalid duration/count and unavailable versions fail. Guest mode is open. |
| **Start/resume session** — session owner | Exam/session identity; verify ownership, state and eligibility. Server starts once and persists server start/deadline. | Session identity, lifecycle/outcome, `serverNow`, `expiresAt`, allowed items and the owner's saved responses. | Not found/forbidden, invalid transition or expired. A refresh must not regenerate selected versions. |
| **Save answer** — session owner | Session ID, selected item ID, response or explicit clear, and a per-write idempotency key. Verify membership, option/part validity, state and server time. | Saved response acknowledgement, save status and `serverNow`; no score or correctness. | Reject writes at or after expiry; replay and multi-tab conflict behavior are OD-12. Network/local mirrors are not authoritative. |
| **Finalize** — session owner | Session ID and idempotency key. **Proposed safety shape:** no new answer payload; evaluate persisted eligible answers. Finalization and result persistence are guarded. | Stable finalization receipt and existing/new authorized result summary when available; late outcome distinguished where applicable. | Before expiry accept once. In grace accept only under the documented pre-expiry-save conditions; after grace reject a new submission. Duplicate finalized requests return the existing result, not a second score. Timing/state details OD-03/OD-11/OD-12. |
| **Get result** — session owner | Session ID; authorize ownership and result availability. | Aggregate score/counts and clearly separated evaluation-source summaries, subject to approved result lifecycle. | Pending/not found/forbidden as appropriate. No answer key, correct option, rubric or solution through this exam API; per-question answer-release policy OD-14. |
| **Tutor explanation** — authorized learner | Authorized question version; optional student's response or owned attempt context. Server obtains permitted question/key context, never fetches a client-supplied URL. | Schema-validated, clearly AI-labelled explanation or explicit needs-verification/unavailable outcome, only when release policy allows it. | Deny answer-revealing use in an active exam; missing/uncertain key, quota or provider failure must not affect exam flow. Cache/release rules OD-14/OD-29. |
| **Save/print/export paper** — authorized creator | Paper identity/document model or requested export format; validate document and source access. | Saved model/preview; browser print is primary. A server snapshot returns job identity/status and eventually an authorized artifact. | No mutation of bank questions; no unapproved key-bearing student export. Storage/job access, content/version and queue semantics OD-02/OD-14/OD-19/OD-28. |
| **Admin content and users** — appropriately authorized staff | Validated draft, taxonomy, review/publish, role or other domain command; target/version and sensitive action checked server-side. | Authorized change result and audit confirmation as appropriate. | Deny by default; invalid transitions/duplicates fail; AI drafts require human review and publish. Role and moderation granularity OD-16/OD-27. |

## Illustrative active-session projection

This example describes an exam-taking response, not a database record. The four choices deliberately contain no correctness metadata, answer key, solution or explanation. Content shape and identifiers remain proposed.

```json
{
  "sessionId": "session-example",
  "status": "IN_PROGRESS",
  "serverNow": "2026-11-23T10:00:00Z",
  "expiresAt": "2026-11-23T10:30:00Z",
  "questions": [
    {
      "itemId": "item-example",
      "versionId": "version-example",
      "type": "MCQ",
      "marks": 1,
      "stem": [{ "type": "paragraph", "text": "Illustrative question text" }],
      "options": [
        { "id": "option-a", "label": "ক", "text": "Option one" },
        { "id": "option-b", "label": "খ", "text": "Option two" },
        { "id": "option-c", "label": "গ", "text": "Option three" },
        { "id": "option-d", "label": "ঘ", "text": "Option four" }
      ],
      "savedResponse": { "selectedOptionId": "option-b" }
    }
  ]
}
```

`selectedOptionId` is the learner's own selection, **not** the correct option. A saved selection may be absent or explicitly cleared. An active CQ projection similarly includes its stimulus, subparts and marks, but not a marking guide or solution. Any metadata, asset URL, rich-content block, nested object or cache entry must pass the same projection test.

## Illustrative save and finalization requests

These examples illustrate information flow only; field names, header versus body placement, clear-response representation and transport remain OD-12/OD-17. A client must use a fresh key for each intended answer change and reuse that key for an identical retry.

```json
{
  "sessionId": "session-example",
  "itemId": "item-example",
  "idempotencyKey": "write-example-01",
  "response": { "selectedOptionId": "option-c" }
}
```

A successful save acknowledgement might contain the following, after ownership, membership, input and deadline checks. It confirms persistence, not correctness.

```json
{
  "sessionId": "session-example",
  "itemId": "item-example",
  "saveStatus": "SAVED",
  "serverNow": "2026-11-23T10:01:00Z",
  "savedResponse": { "selectedOptionId": "option-c" }
}
```

The proposed finalization request refers to the session and a separate retry key; it carries no new responses:

```json
{
  "sessionId": "session-example",
  "idempotencyKey": "finalize-example-01"
}
```

The server evaluates only eligible persisted answers. A successful response may contain an authorized result summary like the independent example below; a retry returns the existing result without scoring again. The interaction between that receipt and a later authorized CQ revision remains OD-13.

## Illustrative finalized result projection

The following independent example reports a hypothetical four-mark MCQ aggregate. It does not expose the official key or a per-item solution, and does not blend in self-assessed marks.

```json
{
  "sessionId": "session-summary-example",
  "outcome": "SUBMITTED",
  "evaluation": "available",
  "sourceSummaries": [
    {
      "source": "AUTO",
      "score": 3,
      "maximum": 4,
      "correctCount": 3,
      "incorrectCount": 1,
      "unansweredCount": 0
    }
  ]
}
```

`sourceSummaries` is a proposed logical representation, not a selected physical model. For mixed exams, a separate labelled CQ summary may become available only under the approved assessment/result lifecycle; do not imply that self-assessment is an official automatic score. Small-result inference and any per-question feedback require OD-14. The repeated-finalize response must not re-evaluate; how later authorized CQ revisions affect an existing result is OD-13.

## Errors and idempotency

A proposed common error envelope contains a stable semantic `code`, a safe localizable `message`, and optional field-specific validation details. Candidate categories are `INVALID_INPUT`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `EXPIRED`, `RATE_LIMITED` and `UNAVAILABLE`. These names and HTTP mappings are not yet approved. Errors must not disclose answer material, secrets, other users' data or database traces. Exact distinction between `FORBIDDEN` and `NOT_FOUND` must protect resource enumeration. An illustrative expiry error for a new answer write is:

```json
{
  "error": {
    "code": "EXPIRED",
    "message": "This session no longer accepts answer changes."
  }
}
```

A save key identifies a write/retry within the session; finalization is also idempotent. The server must handle two tabs and concurrent retries so there is at most one authoritative finalization/result. The key's scope, retention, payload mismatch, merge order and whether a first late attempt yields a rejection versus an already-expired result response are open; do not invent behavior that lets a late write change persisted answers.

## Dependencies

These contracts depend on the [exam lifecycle](../modules/examination-engine.md), [question model](../database/entity-relationships.md), [authentication](../security/authentication.md), [authorization](../security/authorization.md) and the respective domain services. AI and export operations additionally depend on adapter/storage policies.

## OPEN DECISION

[OD-02–OD-06, OD-10–OD-17, OD-19, OD-21, OD-27–OD-29](../architecture/technology-decisions.md#open-decision-register) must be resolved for the affected operations. In particular, no HTTP endpoint, final error mapping or answer-revealing review channel is approved by these examples.

## Related documentation

[API architecture](api-architecture.md) · [System architecture](../architecture/system-architecture.md) · [Testing strategy](../development/testing-strategy.md) · [Security guidelines](../security/security-guidelines.md)
