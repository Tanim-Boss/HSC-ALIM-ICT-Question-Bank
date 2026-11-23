# ICT Atlas technical documentation

**Purpose and scope.** This is the navigation and governance entry point for ICT Atlas, a planned HSC/Alim ICT question bank and examination platform. It records the architecture, domain model, contracts, controls and delivery plan without implementing them.

**Project status:** planning only. The repository's [original README](../README.md) is the project blueprint; its v2 architecture-review decisions and v2.2 design specification are the only review and roadmap materials present in this checkout. No separate analysis, approval record, requirements specification, schema, API implementation or application exists here. This documentation formalizes that available material; it does not imply that the open decisions or proposed contract details have been approved.

## Responsibilities and boundaries

| Area | Start here | Responsibility |
|---|---|---|
| Architecture | [System](architecture/system-architecture.md), [modules](architecture/module-architecture.md), [decisions](architecture/technology-decisions.md) | Boundaries, invariants and decision register |
| Database | [Design](database/database-design.md), [relationships](database/entity-relationships.md), [dictionary](database/data-dictionary.md) | Logical data ownership and integrity; not a Prisma schema |
| API | [Architecture](api/api-architecture.md), [contracts](api/api-contracts.md) | Validated, authorized service boundaries; contract drafts |
| Security | [Authentication](security/authentication.md), [authorization](security/authorization.md), [guidelines](security/security-guidelines.md) | Identity, permissions and threat controls |
| Design | [System](design/design-system.md), [brand mark draft](design/brand-mark.svg), [tokens](design/tokens.json), [components](design/component-architecture.md), [typography](design/typography.md), [implementation guidelines](design/implementation-guidelines.md) | Design Production Phases 1–2 specification and token handoff; no product pages or UI implementation |
| Modules | [Question bank](modules/question-bank.md), [examination](modules/examination-engine.md), [students](modules/student-management.md), [analytics](modules/performance-analytics.md), [AI tutor](modules/ai-tutor.md), [paper studio](modules/paper-studio.md), [administration](modules/administration.md) | Domain-specific workflows and acceptance criteria |
| Development | [Roadmap](development/roadmap.md), [coding standards](development/coding-standards.md), [Git workflow](development/git-workflow.md), [testing](development/testing-strategy.md) | Phases, review practices and verification |
| Deployment | [Environments](deployment/environments.md), [deployment architecture](deployment/deployment-architecture.md) | Isolation, dependencies and operational planning |

## Dependencies

Modules communicate through server-side service interfaces rather than UI components or direct cross-domain writes. The examination and evaluation services depend on versioned question data and user authorization; analytics depends on recorded answers and results; the tutor and paper studio depend on authorized question access. See the [dependency map](architecture/module-architecture.md).

## How to interpret these documents

- **Approved baseline** means a decision expressly locked in the blueprint or required by this task. A recommendation or example is not a new approved decision.
- **OPEN DECISION** means implementation must not assume the answer. All such items have stable identifiers in the [central register](architecture/technology-decisions.md#open-decision-register); defaults copied from the README are proposals, not approvals.
- **Proposed** API fields, logical relationships and illustrative payloads describe the minimum information and invariants needed for review. They are not an approved wire protocol, physical schema or migration.
- Preserve the original README. When the blueprint conflicts with itself, or with a stricter instruction in this task, the conflict is recorded in the [decision register](architecture/technology-decisions.md#blueprint-inconsistencies-and-clarifications). Use the explicit stricter security boundary in the meantime; request approval rather than silently rewriting the architecture.
- Changes to locked architecture require documented rationale and owner approval. Update the relevant document and decision register together after a decision is made; do not treat an example as approval.

## Shared terminology

| Term | Meaning |
|---|---|
| Question version | Immutable, identifiable content revision used to reproduce an examination question. Exact physical representation is open. |
| Exam | The definition/configuration and selected questions; reuse and sharing cardinalities remain open. |
| Exam session | A particular attempt, with a server-controlled lifecycle and deadline. |
| Snapshot | The stable selection of question IDs and versions used in an exam; the storage form is open. |
| Answer key | Authoritative correctness or marking information, kept on the server and never returned by student-facing exam APIs. |
| Evaluation source | `AUTO`, `SELF_ASSESSED` or `TEACHER_REVIEWED`; provenance must remain visible and separable. |
| CQ / MCQ | Creative Question / Multiple Choice Question. The initial curriculum is HSC/Alim ICT, while the taxonomy must support other levels and subjects. |

## OPEN DECISION

All unresolved architectural decisions, including the README's O1–O7, are indexed in [technology decisions](architecture/technology-decisions.md#open-decision-register). In particular, a release mechanism for post-exam learning content must be approved without relaxing the ban on answer keys in student-facing exam APIs.

## Related documentation

Start with the [system architecture](architecture/system-architecture.md), [roadmap](development/roadmap.md) and [original blueprint](../README.md). The current task stops at documentation; UI/UX implementation requires explicit user approval.
