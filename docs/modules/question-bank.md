# Question Bank

**Purpose and scope.** Define academic taxonomy, question authoring, published content, search and versioned selection for the first HSC/Alim ICT subject. The taxonomy must also support future levels and subjects without assuming their curriculum structure.

## Responsibilities and boundaries

The Question Bank owns question identity, classification, sources, structured content, versions, options, answer keys and asset references. Administration invokes its authorized authoring/publishing operations; the Examination Engine invokes a narrow server-only interface for stable versions and authoritative keys. The bank does not score exams or mutate sessions. A student API never receives a private key merely because it can read question content.

- Model `EducationLevel`, `Subject`, first-class `Chapter`, `Topic` and `Subtopic` relationally; group, board, college and year filtering must use approved relationships. The initial ICT curriculum has six chapters.
- Model provenance as multiple `QuestionSource` records per question; resolve the README's contradictory direct board/year sketch before schema work.
- Support MCQ (four choices, one correct answer) and CQ (stimulus plus four 1/2/3/4-mark parts) for the initial curriculum. Content supports mixed Bengali/English, code, math, tables, images and diagrams through validated typed blocks, not executable HTML blobs.
- Draft/review/publish content under server authorization. A published edit must not alter a version already selected for an exam. Key changes are especially sensitive and auditable. Parsed/generated questions, if allowed, require human review and publish.
- Store assets in object storage with validated, controlled references and accessible descriptions. Question versions must continue to render if source assets change or are archived; the retention mechanism is open.

## Search and selection

Support server-side search and paginated combinations of level, group, subject, chapter/topic/subtopic, board, year, college, question type, difficulty and source. Derive usable facet choices/counts from the available data. Filter and query permissions apply before content is returned; no whole-bank download to a browser. Search must support Bangla and English, but indexing/tokenization are not yet specified.

For manual selection, resolve the chosen authorized question versions. For automatic selection: apply filters, check available counts, reject an impossible count, sample efficiently, optionally balance topic/difficulty, and persist selected IDs/versions in the exam snapshot. Do not use naive `ORDER BY RANDOM()` over a large bank. The Exam service owns the resulting attempt.

## Acceptance criteria

- Published filters and pagination work together; unsupported combinations and insufficient counts have understandable outcomes.
- Editing a question, option, key or source cannot silently alter active historical content/evaluation; the exact key-correction policy is approved first.
- Drafts and AI proposals are not student-visible; key-bearing fields, embedded solutions and privileged asset links do not appear in student exam responses.
- Bengali conjuncts, code, math and diagrams render consistently with authorized projections on web and print. Asset and content validation reject executable/unsafe input.

## Dependencies

Depends on [Student Management and authorization](student-management.md), object storage and the [data model](../database/entity-relationships.md). Examination, Analytics, AI Tutor, Paper Studio and Administration depend on its stable taxonomy/content interfaces; the tutor's release check must not bypass exam secrecy.

## OPEN DECISION

[OD-05, OD-08–OD-10, OD-14, OD-16, OD-18–OD-20, OD-27 and OD-32](../architecture/technology-decisions.md#open-decision-register) cover provenance, taxonomy, version/key correction, access, schema, asset retention, privacy, moderation, search and sampling.

## Related documentation

[Data dictionary](../database/data-dictionary.md) · [API contracts](../api/api-contracts.md) · [Administration](administration.md) · [Component architecture](../design/component-architecture.md)
