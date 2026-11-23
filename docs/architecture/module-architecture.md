# Module architecture

**Purpose and scope.** Define the domain owners and permitted dependencies within the modular monolith. Module names are conceptual boundaries, not proof that packages or source directories exist.

## Responsibilities and boundaries

| Module | Owns | Server-side dependencies | Must not own or bypass |
|---|---|---|---|
| [Question Bank](../modules/question-bank.md) | Taxonomy, question content, sources, versions, keys and assets | Identity/authorization, storage | Exam scores or direct writes to sessions |
| [Examination Engine](../modules/examination-engine.md) | Exam configuration, selections, snapshots, session state, answers and evaluation | Question Bank's internal version/key interface; identity | Client-computed time/marks; answer-key exposure |
| [Student Management](../modules/student-management.md) | User/profile lifecycle, role associations and saved-question ownership | Managed identity; authorization | Changing marks or granting a role from client data |
| [Performance Analytics](../modules/performance-analytics.md) | Derived metrics and performance snapshots | Recorded exam results/answers; taxonomy; identity | Rewriting raw evidence or mixing evaluation sources without labels |
| [AI Tutor](../modules/ai-tutor.md) | Context assembly, validated explanation, conversations, quota and cache policy | Authorized question/key access; identity; exam release policy; AI adapter | Grading, direct vendor SDK imports or leaking active keys |
| [Paper Studio and Export](../modules/paper-studio.md) | Editable document model, print view and export orchestration | Authorized question versions; content renderer; storage; worker for snapshots | Editing the bank or a generated PDF as the source model |
| [Administration](../modules/administration.md) | Admin workflows, moderation, user/content operations and audit coordination | Owning domain services; identity/authorization; parser adapter when enabled | Directly overriding domain invariants or publishing AI drafts without human review |
| Authentication/authorization | Verified identity, session and permission checks used across modules | Managed identity and persisted role/ownership data | Delegating access control to hidden buttons or caller-supplied role claims |

Evaluation is a server-side responsibility inside the Examination Engine, not a separate deployable service. Export is part of Paper Studio; the Chromium worker executes its asynchronous jobs without owning paper or exam policy. Admin screens orchestrate the relevant service rather than bypassing it.

## Dependency direction and data ownership

```text
Presentation → validated/authenticated server boundary → domain service → Prisma / external adapter
Administration → owning domain service
Examination → Question Bank + identity
Analytics → examination evidence + taxonomy
Tutor → Question Bank + exam release checks + AI adapter
Paper Studio → Question Bank + renderer + storage / export worker
```

Arrows describe calls or controlled reads, not circular database ownership. A service may expose an internal interface to another module but must not return its private fields to a student DTO. The answer key remains a Question Bank concern available only to authorized server workflows. The question renderer is shared presentation infrastructure; each surface receives a separately authorized projection of the content.

## Dependencies

The exact API between services and the physical folder layout are not yet approved. All modules depend on the [authorization policy](../security/authorization.md), [data model](../database/entity-relationships.md) and [API boundary](../api/api-architecture.md). The [roadmap](../development/roadmap.md) determines when each module is delivered.

## OPEN DECISION

[OD-10, OD-14, OD-16–OD-18 and OD-28](technology-decisions.md#open-decision-register) cover version/key access, review release, permissions, contract shapes, content model and paper persistence. Do not add a service boundary that changes the approved architecture without a documented proposal and approval.

## Related documentation

[System architecture](system-architecture.md) · [Data dictionary](../database/data-dictionary.md) · [API contracts](../api/api-contracts.md) · [Coding standards](../development/coding-standards.md)
