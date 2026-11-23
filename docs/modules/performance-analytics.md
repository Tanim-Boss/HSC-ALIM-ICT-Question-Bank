# Performance Analytics

**Purpose and scope.** Define derived student progress, source-labelled scoring and chapter/topic insights from persisted examination evidence. It does not implement dashboards, select an analytics vendor or change official results.

## Responsibilities and boundaries

Analytics reads authorized individual responses, evaluated marks, exam metadata and question taxonomy through domain interfaces. It may maintain derived `PerformanceSnapshot` data, but raw answers and authoritative results remain owned by Examination. Analytics never calculates an official exam score from client input and cannot overwrite evidence.

| Measure | Baseline and safeguards |
|---|---|
| MCQ accuracy | Correct evaluated MCQ answers ÷ evaluated MCQ answers; handle zero denominators as no data, not 0% by default. Do not include self-assessed CQ. |
| Exam history / averages | Derived from authorized saved results; treatment of incomplete, late, expired, negative and mixed-source outcomes is **OD-21**. |
| CQ self-assessment | Display separately and explicitly as `SELF_ASSESSED`; do not present as verified or blend into the MCQ accuracy figure. |
| Teacher review | `TEACHER_REVIEWED` is separate from auto and self-assessed provenance; availability/override flow is OD-01/OD-13. |
| Chapter/topic insights | Group by the stored curriculum hierarchy; use the six ICT chapters initially. Show `Not enough data` below **five evaluated answers per chapter** for the relevant measure. |
| Weak areas / trends | Start with rule-based comparisons, not an AI authority. Thresholds, time windows, minimum samples and ranking are **OD-21**. |

Color, icons and text identify state together. Where a release policy permits answer review, detail must still be authorized and must not make official keys available through an exam API. A chapter-level chart must not leak another student's responses.

## Acceptance criteria

- Recompute aggregates from persisted per-question evidence and preserve user isolation.
- Show empty/insufficient-data states accurately; exactly four chapter answers do not produce a percentage, five may under the approved measure.
- Label evaluation sources in data, visual legends and accessible text; mixed MCQ/CQ does not become one unqualified accuracy number.
- Historical/version and taxonomy changes do not silently rewrite what the student attempted; finalized correction/re-evaluation policy must be resolved first.

## Dependencies

Depends on the [Examination Engine](examination-engine.md) for answer/result evidence, [Question Bank](question-bank.md) for chapter/topic classifications, Student Management for identity/ownership, and the shared chart components for presentation.

## OPEN DECISION

[OD-01, OD-10, OD-13–OD-14, OD-20–OD-21, OD-23 and OD-31](../architecture/technology-decisions.md#open-decision-register) cover assessment/revisions, historical grouping, answer review, retention, metric definitions, release timing and the unselected chart library.

## Related documentation

[Data dictionary](../database/data-dictionary.md) · [API contracts](../api/api-contracts.md) · [Component architecture](../design/component-architecture.md) · [Testing](../development/testing-strategy.md)
