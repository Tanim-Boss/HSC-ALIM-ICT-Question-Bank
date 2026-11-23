# Data dictionary

**Purpose and scope.** Define the meaning, ownership and sensitivity of the blueprint's logical entities and attributes. Names below are domain vocabulary, not approved Prisma model names, exact SQL types, mandatory columns or a migration. Relationship cardinalities and open alternatives are in [entity relationships](entity-relationships.md).

## Responsibilities and boundaries

Each entity has one domain owner; only its server-side service writes authoritative data. IDs are stable references, not proof of access. Times used for exam eligibility are server-generated. Structured content is validated against an approved block schema; keys, private student data, audit details and credentials must not appear in student-facing exam DTOs or normal application logs.

## Academic and question data

| Logical entity | Owner and meaning | Principal logical attributes / references | Integrity and sensitivity |
|---|---|---|---|
| `EducationLevel` | Question Bank; curriculum level such as HSC/Alim | ID, localized name; associations with subject/group | Taxonomy, not arbitrary question text; association rules OD-09. |
| `Subject` | Question Bank; subject such as ICT | ID, names, level associations | Supports more than one level/subject; hierarchy rules OD-09. |
| `Chapter` | Question Bank; curriculum chapter | ID, subject reference, `chapterNumber`, `titleBn`, `titleEn` | First-class entity; six initial ICT chapters; revision/uniqueness OD-09. |
| `Topic` / `Subtopic` | Question Bank; refinements below chapter/topic | ID, parent reference, localized name | Parent consistency and optionality OD-09. |
| `Board` / `College` | Question Bank; source organizations | ID, name/code as applicable | Referenced by sources; conditional association OD-08. |
| `AcademicYear` | Question Bank; examination year | ID and year label/value | Referenced relationally; year constraints/source link OD-08. |
| `Question` | Question Bank; stable question identity and classification | ID, type (`MCQ`/`CQ`), status, classification references, difficulty, `createdVia` (`MANUAL`/`BULK_IMPORT`/`AI_PARSER`) | Source metadata must not be redundant free text. Publication/field requirements OD-08/OD-09/OD-27. |
| `QuestionVersion` | Question Bank; a reproducible content revision | ID, question reference, version identity, structured content and/or references | Immutable once used; exact structure and authoring lifecycle OD-10/OD-18. |
| `QuestionOption` | Question Bank; an MCQ choice | ID/key, question or version association, display content, ordering | Four options and one correct choice for the initial format; correctness must not be sent in exam DTOs. Version linkage OD-10. |
| `QuestionAsset` | Question Bank/storage; image, diagram or other approved attachment | ID, storage reference, media metadata, alt/long description | Bytes in object storage; file validation and visibility OD-19. |
| `QuestionTag` | Question Bank; tag classification/association | Tag identity/name and question association | Entity versus join and normalization OD-18. |
| `QuestionSource` | Question Bank; one occurrence or attribution of a question | Question reference, source type, applicable board/college/year references | Multiple sources permitted; conditional FKs, history and exact types OD-08. |
| `AnswerKey` | Question Bank; authoritative MCQ answer or CQ marking information | Question/version/part association; correct option or rubric/marking criteria | Highly sensitive; exact relationship/version OD-10/OD-13. Never returned by student-facing exam APIs. |

A `Group` and a CQ part are logical concepts required by filtering and the question format; neither has a finalized entity representation. A CQ's initial four parts have maximum marks 1/2/3/4; descriptions and rubric content require human verification.

## Exams and students

| Logical entity | Owner and meaning | Principal logical attributes / references | Integrity and sensitivity |
|---|---|---|---|
| `Exam` | Examination; configuration and question selection | ID, creator/owner as applicable, duration, selection settings, marks | Ownership/reuse/eligibility OD-04/OD-10. |
| `ExamQuestion` | Examination; selected item within the exam snapshot | Exam/item reference, question version, order, marks as applicable | Must reproduce the shown version; exact attachment to exam/session OD-10. |
| `ExamSession` | Examination; one attempt | ID, exam reference, owner if authenticated, status, server `startedAt`, `expiresAt`, server-configured `graceWindowMs` | Deadline and status are server-controlled; timing/outcomes OD-03/OD-11. No caller may set a deadline or score. |
| `StudentAnswer` | Examination; response to a selected item/part | Session and item references, response, save time, idempotency-related identity | Private; item must belong to the session. README mentions a key unique per session; request storage/replay semantics OD-12 and CQ representation OD-13. |
| `ExamResult` | Examination; persisted evaluation for a session | Session reference, score/mark summaries, evaluation state and source provenance | At most one current result; marks must retain `AUTO`, `SELF_ASSESSED` or `TEACHER_REVIEWED` at a granularity supporting mixed exams. Revisions OD-13. |
| `User` | Student Management; application account | ID, managed-auth identity association, profile/role references | Personal data; provider mapping, deletion and access OD-15/OD-20. |
| `StudentProfile` | Student Management; learner profile | User reference, selected level/group and optional institution where approved | Minimize personal data; required fields and consent OD-15/OD-20. |
| `UserRole` | Student Management/authorization; role assignment | User, role and scope/grant metadata as approved | Server-controlled only; role representation and privileges OD-16. |
| `SavedQuestion` | Student Management; a learner's bookmark | User and question/version reference | Private; uniqueness and version behavior OD-10/OD-15. |
| `PerformanceSnapshot` | Analytics; derived performance at a chosen scope/time | User, period/grouping, counts and source-separated measures | Recomputable from evidence; thresholds/retention OD-20/OD-21. |

## AI, administration and export concepts

| Logical entity | Owner and meaning | Principal logical attributes / references | Integrity and sensitivity |
|---|---|---|---|
| `TutorConversation` / `TutorMessage` | AI Tutor; user-owned history and messages | Conversation/user references, message role/content/time | Private and untrusted; retention/provider sharing OD-20/OD-29. |
| `AIExplanation` | AI Tutor; reusable or stored explanation | Question version, answer-context hash, `modelId`, `promptVersion`, validated output | Cache isolation and low-entropy hashes OD-29; release gate must precede reuse. Not an answer authority. |
| `AdminAuditLog` | Administration/security; record of a sensitive change | Actor, action, target, time and protected change context | Tamper resistance, access, redaction and retention OD-20/OD-27. Never put credentials in logs. |
| `SystemSetting` | Administration; operational configuration | Setting identity/value, scope and change metadata | Exact scope and handling of secrets OD-16/OD-20. |
| Paper document / section / entry | Paper Studio; editable structured paper | Title, duration, section ordering, question references/edited content, marks | Conceptual model only; ownership/versioning/storage OD-28. Must not mutate bank content. |
| Export job / artifact | Paper Studio; asynchronous server PDF request and output | Requester, paper version, status, storage reference, timestamps as applicable | Conceptual only; queue, authorization, retention and job schema OD-02/OD-19/OD-28. |

## Dependencies

The dictionary depends on the [relationship model](entity-relationships.md) and the [module ownership map](../architecture/module-architecture.md). The exam service consumes question versions and private keys; analytics consumes recorded results; tutor and exports consume authorized content. The storage and auth providers do not replace application-level checks.

## OPEN DECISION

The dictionary's OD references and [OD-03–OD-04, OD-08–OD-13, OD-15–OD-21, OD-27–OD-29](../architecture/technology-decisions.md#open-decision-register) must be resolved before a final schema. In particular, types, nullability, keys, join tables, retention and paper/AI entities are not silently fixed here.

## Related documentation

[Database design](database-design.md) · [Entity relationships](entity-relationships.md) · [Security guidelines](../security/security-guidelines.md) · [API contracts](../api/api-contracts.md)
