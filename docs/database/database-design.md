# Database design

**Purpose and scope.** Define the logical PostgreSQL/Prisma design and integrity requirements for ICT Atlas. This is not a Prisma schema, migration, finalized field list or authorization policy. See the [relationship model](entity-relationships.md) for cardinalities and the [dictionary](data-dictionary.md) for entity semantics.

## Responsibilities and boundaries

PostgreSQL is the primary relational source of truth; Prisma is the planned database access layer. Domain services own their writes and enforce authorization before accessing data. Database constraints are a second line of defense, not a substitute for service-level permission checks. Object storage holds image and document bytes; the database records controlled references and metadata.

### Modeling rules

- Normalize education levels, subjects, chapters, topics, subtopics, boards, colleges and years rather than storing filterable academic metadata as free text on a question. Chapter is an entity belonging to a subject; the initial ICT curriculum has six chapters.
- Represent question provenance through `QuestionSource` so one question can have multiple board/college/model sources. The README also sketches direct board/year fields and has a conflicting source example; do not add redundant foreign keys without resolving [OD-08](../architecture/technology-decisions.md#open-decision-register).
- Store queryable identity, classification, relationships and lifecycle as relational data. Use JSONB only where appropriate for validated structured content blocks and immutable exam/document snapshots. Do not put the entire question, options, taxonomy or answer-key authority in an opaque document.
- Preserve immutable question versions and the exam's selected versions. Historical content must not change when a question is edited. Decide how the authoritative key or evaluation basis is versioned with the snapshot under OD-10; do not assume a mutable current key is historically safe.
- An MCQ in the HSC/Alim format has four options and one correct option; a CQ has a stimulus and four parts worth 1, 2, 3 and 4 marks. Draft/other-curriculum behavior, schema and validation timing remain open. Question marks and negative marks cannot be negative.
- Preserve individual student responses, evaluation outcomes and their `AUTO`, `SELF_ASSESSED` or `TEACHER_REVIEWED` provenance. A mixed exam needs per-mark or equivalent provenance, not merely a single unqualified total. Do not overwrite raw evidence with derived analytics.

## Consistency and lifecycle

| Operation | Required property |
|---|---|
| Publish/revise question | Validate taxonomy, content, options and answer/rubric; create an auditable revision without altering versions already used in exams. |
| Create/start exam | Persist a stable selection and version references; ownership, session multiplicity and snapshot timing must be resolved. |
| Save an answer | Verify the session, owner, item membership, state and server deadline. Make retries and concurrent changes deterministic; exact idempotency storage is open. |
| Finalize/evaluate | Guard the transition and atomically associate the authoritative evaluation/result with the session. A retry cannot create another result or rescore it. Source-specific CQ updates require an approved result lifecycle. |
| Archive/delete | Soft-delete or archive questions as appropriate. Never hard-delete answered questions or evidence needed for historical exams; broader retention and deletion rules are open. |

The details of timestamps, grace, status transitions and concurrency are specified as invariants in [examination-engine.md](../modules/examination-engine.md), with unresolved mechanics in OD-11/OD-12. A key version or internal evaluation snapshot must never be included in a student-facing exam response or public export.

## Query, index and migration planning

Plan indexes around real queries: published-status and taxonomy filters (level/subject/chapter/topic/type/difficulty), source joins (board/year/college), version lookup, session ownership, session/item answer lookup, result history and audit actor/time. Measure with PostgreSQL query plans; exact composite keys, uniqueness and index order depend on the finalized schema and traffic. Avoid naive `ORDER BY RANDOM()` over a large bank.

Use reviewed Prisma migrations after the schema is approved. Test migration and rollback/recovery plans in an isolated staging environment, including representative data. Never edit already-applied migrations. Backups and restore tests must exist before production data; their retention and recovery objectives remain open.

## Dependencies

Question Bank owns taxonomy/content/versioning; Examination owns sessions/answers/results; Student Management owns profiles and role associations; Analytics owns derived snapshots; AI Tutor and Administration own their respective records. Shared transactions must preserve the service ownership boundaries. Storage, identity and the planned Prisma connection depend on [deployment configuration](../deployment/environments.md).

## OPEN DECISION

[OD-04, OD-08–OD-13, OD-18–OD-21 and OD-28–OD-29](../architecture/technology-decisions.md#open-decision-register) cover guest ownership, relational cardinalities, snapshots/keys, grading, content/assets, privacy, scoring, papers and AI storage. This document does not choose physical tables, field nullability, deletion periods or migrations where the blueprint is silent.

## Related documentation

[Entity relationships](entity-relationships.md) · [Data dictionary](data-dictionary.md) · [Module architecture](../architecture/module-architecture.md) · [Authorization](../security/authorization.md) · [Testing](../development/testing-strategy.md)
