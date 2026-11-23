# API architecture

**Purpose and scope.** Define how student, administration and internal callers reach domain services. Next.js Server Actions and Route Handlers are the blueprint's intended boundary; exact transports, routes and wire details remain unapproved. The [contracts](api-contracts.md) describe proposed logical operations rather than implemented endpoints.

## Responsibilities and boundaries

```text
Caller → parse and validate → verify identity → authorize action + resource
       → owning server service → transaction / Prisma / authorized adapter
       → explicit response projection → consistent result or safe error
```

- Validate every server input (the blueprint proposes Zod), including filters, IDs, uploaded metadata, pagination, answer selection and idempotency keys. Validate server-to-server and AI output at their own trust boundaries too.
- Verify identity independently of client-supplied roles. Authorize both the operation and the specific resource, including user/session ownership. Workers and admin actions are not exempt.
- Domain services own business rules. UI components, Server Actions and route handlers are orchestration/projection layers; they do not score exams or bypass services to mutate another domain's data.
- Return purpose-built DTOs using recursive allowlists. **No student-facing exam API, including active-session, submission and result operations, may expose official answer keys, correct option identifiers, rubrics or solution material**, even after finalization. Do not serialize Prisma records wholesale. Never send per-option correctness flags, nested key relations, answer-bearing metadata or privileged asset links; post-finalization per-item feedback remains OD-14.
- The README's post-finalization learning review is a separate unresolved release question, not permission to put keys into an exam endpoint. The review, tutor, question-bank and export surfaces must not disclose active-exam answers; [OD-14](../architecture/technology-decisions.md#open-decision-register) must resolve cross-surface and overlapping-attempt behavior.
- Paginate list operations, limit queries and return consistent safe error categories. Exact pagination strategy, limits, error codes, HTTP mappings and API versioning are **OD-17**. Do not disclose existence of another user's resource or implementation details through errors.

## Examination and consistency

The exam service controls selection, snapshot, deadlines, saved answers and evaluation. Validate session ownership and item membership on each request. The start response supplies server time and expiry; the browser clock is a display aid. Enforce the detailed grace conditions server-side. Guard finalization and result creation transactionally; retries cannot create duplicate results or rescore. The proposed finalization contract uses only persisted answers, so a late request cannot introduce new answers; exact request shape and grace evidence remain **OD-11/OD-17**.

A response's DTO must match the caller and current release state. Caching must include authorization/release context or be bypassed for sensitive data. Never cache an active exam response in a shared public cache; no client-visible response should contain an AI/provider secret or service-role credential.

Reusing questions that have previously appeared in public practice or a completed review creates a residual risk: a request-time gate cannot retract information a learner has already seen or prevent sharing. The acceptable threat model and any content-reuse restrictions require owner approval under OD-14; these documents do not claim that surface gating alone guarantees secrecy against prior knowledge.

## Other boundaries

| Surface | Boundary responsibility |
|---|---|
| Question Bank | Server-side filters, search and pagination; return published, caller-authorized content only. Selection must use stable versions. |
| AI Tutor / parser | Assemble only authorized current-question context server-side; treat student text as untrusted, use the provider adapter, validate output and enforce quotas. No model access to other keys or tools. |
| Paper / export | Authorize the paper, source questions and any requested content. Browser print is primary; enqueue server PDF snapshots and reauthorize access to the artifact. |
| Administration | Enforce action-specific staff roles; validate changes, preserve versions and record sensitive actions. |

Rate-limit authentication, answer saves, AI and exports. Use transactions for state changes, result persistence and relevant audit consistency; storage and worker operations require an explicitly designed failure/retry policy rather than pretending they share a database transaction.

## Dependencies

Every API operation depends on [authentication](../security/authentication.md), [authorization](../security/authorization.md), domain services and [data ownership](../database/entity-relationships.md). AI and export operations additionally depend on the adapter, storage and worker where enabled. See the [module map](../architecture/module-architecture.md).

## OPEN DECISION

[OD-02–OD-06, OD-10–OD-12, OD-14–OD-20 and OD-28–OD-29](../architecture/technology-decisions.md#open-decision-register) cover guest/expiry policy, keys, authentication, permissions, transport, content/assets, privacy, exports and AI caches. No URL, HTTP status mapping, version or exact payload here is approved for implementation.

## Related documentation

[API contracts](api-contracts.md) · [Exam engine](../modules/examination-engine.md) · [Security guidelines](../security/security-guidelines.md) · [Testing strategy](../development/testing-strategy.md)
