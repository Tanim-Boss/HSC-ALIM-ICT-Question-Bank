# Technology and architecture decisions

**Purpose and scope.** Record the locked baseline, rejected alternatives, unresolved decisions and known blueprint conflicts. The [original README](../../README.md) §§4.4, 11, 15 and 17 is the source for its review and roadmap; no separate sign-off record is available. This register does not approve an open option.

## Responsibilities and boundaries

An architecture owner must approve changes to locked decisions and resolve relevant open items before the affected work is implemented. Module owners document implications in their own specifications; security, database, design and deployment decisions are cross-cutting. Changes to a decision require updating this register and the affected contracts, tests and roadmap.

## Dependencies

This register derives from the original blueprint and the explicit task constraints. A decision can depend on the database, API, security, design or deployment specifications linked below; affected owners must review those consequences before approval.

## Approved baseline

| Decision | Reason / consequence |
|---|---|
| Modular monolith: Next.js, React, strict TypeScript | Shared application and backend; explicit server module boundaries, no premature microservices. |
| PostgreSQL + Prisma | Relational integrity and queryable taxonomy; JSONB is limited to suitable structured content/snapshots, not the entire question record. |
| Server-authoritative exams and server authorization | Server time, snapshots, answers, evaluation and persistence are authoritative. Validate all server inputs. |
| Student-facing exam APIs never expose official answer keys | This task is stricter than the README's pre-submission restriction. The restriction also applies to result endpoints; post-exam learning release remains open. |
| Structured, versioned question content | Rich Bangla/English text, code, math and diagrams must render consistently and historical exams must not change on edits. |
| AI adapter; Gemini 2.5 Flash default | Tutor and parser are vendor-independent. AI explains; authoritative keys determine correctness and AI does not award CQ marks. |
| Print-first, selectable vector text | Edit a document model; use browser print for the primary PDF path and an asynchronous Chromium worker for server snapshots. |
| Token-based design and WCAG 2.2 AA target | Use the README §17 design system, not ad-hoc page styles; maintain bilingual readability, states and accessibility. |
| Audit and tests | Sensitive administration, especially answer-key changes, is auditable; examination timing, security and evaluation receive automated tests. |

Recommended tools include Supabase Auth/PostgreSQL/Storage, Vercel, Tailwind, Tiptap, KaTeX, Shiki, Vitest, React Testing Library and Playwright. These are the blueprint's intended stack, not proof of provisioned services. Redis/Upstash is optional and later. [Deployment](../deployment/deployment-architecture.md) distinguishes placement from approval of a vendor.

## Rejected or deferred alternatives

- **Microservices**, client-owned timing or scoring, whole-question JSONB, and unreviewed AI publication are incompatible with the baseline.
- Rasterizing the DOM to produce PDF text (`html2canvas`/`html2pdf.js`) is rejected. Editing a generated PDF in place is not the paper model. `@react-pdf/renderer` as the primary engine is deferred, not selected.
- AI-awarded CQ marks are rejected by README L6/R8; the conflicting roadmap text is tracked below, not adopted.
- The deprecated `unescape` Base64 idiom is superseded by UTF-8 byte-based encoding. Decoder error handling remains part of OD-28.

## Open decision register

The README's O1–O7 are preserved below, including their suggested defaults. A default is **not** a resolved decision. Each row is explicitly **OPEN DECISION**; phases indicate the latest practical gate, not a promise of delivery.

| ID | Decision requiring owner approval | Existing guidance / dependencies | Gate |
|---|---|---|---|
| **OD-01** | CQ assessment: self-assessment, teacher review, or both; review and revision policy. | README O1 suggests self-assessment in v2 and teacher review in v3; keep sources separate. | Before CQ assessment |
| **OD-02** | Host, queue, authentication and operations for server PDF snapshots. | O2 suggests a container host; dedicated asynchronous worker is the stronger §7.5/§13 baseline. A request-path/serverless alternative needs a change proposal. | Before snapshots |
| **OD-03** | Expiry policy: strict lock versus automatic submission of last-saved answers; what is finalized and when. | O3 suggests strict lock plus grace for v1. README also calls for evaluating saved answers after expiry; distinguish evaluation from accepting a new submission. | Before exams |
| **OD-04** | Whether and how anonymous MCQ practice is allowed, including ownership and local history. | O4 suggests guest MCQ practice; login for persisted analytics. Do not assume an authenticated owner for an anonymous session. | Before guest practice |
| **OD-05** | Whether AI-generated questions are allowed in the bank at all. | O5 suggests draft-only; mandatory human review and publish is locked whenever they are allowed. | Before AI ingestion |
| **OD-06** | Rate-limit/quota backend and atomic enforcement. | O6 suggests PostgreSQL counters with advisory locks initially and Upstash when justified; advisory locks alone are not counters. | Before public limits |
| **OD-07** | Default UI language and toggle/localization behavior. | O7 suggests a user toggle, Bangla-first student content and English admin/technical metadata. | Before localized UI |
| **OD-08** | Source model: board/college/year exclusivity, `TEST_EXAM` taxonomy and whether any direct question FKs exist. | README §1.1 says provenance via `QuestionSource`; §6.2 also sketches direct board/year fields. | Before schema |
| **OD-09** | Education-level/group/subject cardinalities, curriculum revisions and optional topic/subtopic relationships. | A multi-level relational taxonomy and first-class Chapter are required; joins and revision rules are not specified. | Before schema |
| **OD-10** | Exact immutable version/snapshot and answer-key versioning strategy, including corrections and historical scoring. | Exams must retain what was seen and be reproducible; never expose stored keys. Physical tables and correction policy are not specified. | Before exams/schema |
| **OD-11** | Exact state transitions, how the authoritative admission timestamp is captured, grace eligibility/evidence and late-finalization behavior. | Five-second configurable default; the README's detailed table includes the grace endpoint and requires a pre-expiry autosave. Its immediate-expiry diagram conflicts with late submission. Preserve the no-new-answers-after-expiry rule. | Before exams |
| **OD-12** | Idempotency scope/retention, same-key different-payload behavior, concurrent autosave and multi-tab conflict resolution. | One final result and deterministic retries are required; the storage and merge policy are not specified. | Before exams |
| **OD-13** | CQ input modality and per-part/result representation, self-assessment revisions and teacher override. | README describes paper answers, typed responses and a rich-text editor; mixed-result provenance must be representable. OD-01 governs which assessment is offered. | Before CQ exams |
| **OD-14** | Authorized post-finalization answer/rubric and per-item feedback release, aggregate inference, overlapping attempts, prior disclosures and the question-reuse threat model. | README requests answer review, but this task forbids official keys in *all* student-facing exam APIs. Never relax that ban; do not assume a new channel is approved. Per-request gates cannot retract prior disclosures. | Before answer review |
| **OD-15** | Managed-auth provider configuration, account-to-profile mapping, session expiry/revocation and guest integration. | Supabase Auth or an equivalent managed provider is recommended; server verification is mandatory. | Before authentication |
| **OD-16** | Complete action/resource RBAC and database/RLS policy, role assignment/bootstrap/revocation, teacher scope and any institutional scope. | README names staff roles but not all permissions. Default deny; no assumed multi-tenant model; RLS does not replace server authorization. | Before privileged access |
| **OD-17** | API wire contract: paths/transport, versions, field names, pagination, limits, errors and HTTP mappings. | Logical contracts and examples are proposed, not approved. Server validation and consistent errors are required. | Before API implementation |
| **OD-18** | Structured-content schema, block versions, allowed editor features, sanitization and tag representation. **STATUS CORRECTED: the content-block schema (request B) was APPROVED in Revision 4 of `docs/database/phase-04a-question-bank-physical-schema-proposal.md` — approval recorded at `:5`, detailed at `:39`, confirmed by the reviewer at `:56`; the authoritative specification is §7 (`:2260`–`:3400`) and covers the envelope, ten block types, four profiles, validation, versioning, sanitization, the Zod strategy (§7.11) and hard limits (§7.12). This register entry previously read \"Before editor/schema\" and described the shapes as open; that wording was stale and contradicted the approval report. Typed blocks are required and HTML execution is forbidden. **Still genuinely OPEN, and NOT part of the approved schema: allowed editor features** — tracked separately as **OD-33**. Zod implementation of §7.11 is no longer blocked on this entry, only on OD-17 for wire-facing components. | Approved (Revision 4); implementation in progress |
| **OD-19** | Asset types/size limits, SVG handling, upload scanning, private/public storage and signed-link policy. | Validate bytes, type and size; object storage must enforce resource access. | Before uploads/exports |
| **OD-20** | Privacy, consent, data classification, retention, deletion, audit access and backup lifecycle, including minors and offline mirrors. | Answered questions/evidence cannot simply be hard-deleted; legal obligations and exact periods are not specified. | Before real data |
| **OD-21** | Scoring edge cases and analytics definitions: **negative-marking configuration** (whether it is enabled at all — **default OFF** — and, independently, the penalty value/rule), negative-mark floor, unanswered handling, cohorts, average scores, weak-topic rules and exclusions. **Not closed — broadened, not narrowed.** Negative marking is now a *configurable examination/marking concern* rather than a per-question attribute, so `questions.negative_marks` is **not** in the Phase 04A schema; see PR #10 §3.15.4. **Which entity owns the enable/disable switch and the penalty rule (examination vs marking profile vs other) is deliberately NOT assumed** — that is a separate future architecture decision (**OD-NM-1**) to be settled when the examination model is designed. | MCQ formula and five-answer chapter threshold are specified; evaluation sources remain separate. | Before evaluation/analytics |
| **OD-22** | Deployment capacity/SLOs, observability, alerting, cost limits, backup RPO/RTO, recovery and rollback. | Managed services, staging/production isolation and backups are intended; no operational targets are approved. | Before production |
| **OD-23** | Map development phases to releases and settle overlapping scope for CQ assessment, Paper Studio, exam history and other features. | README §11 phase order and release table use different groupings; no release mapping is approved. | Before release planning |
| **OD-24** | Resolve roadmap references to AI-assisted CQ evaluation against the locked ban on AI-awarded marks. | No AI scoring, including proposed marks, unless an explicit architecture change is justified and approved. | Before any CQ AI feature |
| **OD-25** | Font redistribution licence and actual mixed-script/print rendering; correct contrast application of muted text. | Geist / SolaimanLipi / Noto Sans Bengali are the specified direction; verify licence and real rendering. WCAG thresholds override incorrect size guidance. | Before design implementation |
| **OD-26** | CI provider, required checks, test isolation/fixtures, performance thresholds and security-test ownership. | Vitest/RTL/Playwright/PostgreSQL tests are intended; no pipeline or complete budgets exist. | Before implementation |
| **OD-27** | Moderation state transitions, review separation, bulk-import behavior, parser draft persistence and content/source rights. | Human publication and auditing are mandatory; detailed workflow and licensing are not settled. | Before publishing/import |
| **OD-28** | Paper/document/export persistence, ownership, version relationships, job lifecycle and malformed UTF-8 handling. | Editable document model and print-first exports are required; no physical schema or queue is approved. | Before Paper Studio |
| **OD-29** | AI cache privacy/isolation, low-entropy answer hashing, conversation retention, provider data handling and output schema. | Cache is keyed by question version, answer hash, model and prompt version; validate outputs and do not disclose active keys. | Before AI |
| **OD-30** | Team Git branching, required reviewers, protection rules, commit/release convention and merge policy. | The workflow document provides a proposed review process, not repository policy. | Before team development |
| **OD-31** | Choose a chart library and whether to use optional UI primitives. | README permits shadcn/ui primitives and calls for a suitable chart library; neither is selected and both must preserve tokens and accessibility. | Before UI implementation |
| **OD-32** | Bangla/English search indexing, tokenization and efficient sampling/balancing strategy. | Server filtering and efficient selection are required; exact algorithms, indexes and measurable targets are not specified. | Before bank search/selection |
| **OD-33** | Allowed editor features: which of the ten approved block types the authoring UI exposes in the first release, whether `flowchart` and `table` are included, and what inline-editing affordances are permitted. | **Explicitly NOT part of the approved OD-18 content-block schema.** The schema decides what a valid stored document is; this decides what the editor may produce. Conflating them would let a UI limitation silently narrow the approved schema. No editor exists yet. | Before editor implementation |

## Blueprint inconsistencies and clarifications

| Source | Conflict / required handling |
|---|---|
| §1.1 vs §6.2 | §1.1 says question provenance belongs in `QuestionSource` and confusingly says a board question carries neither board nor college; §6.2 shows board on the source **and** direct board/year fields on `Question`. Resolve OD-08; do not silently create redundant columns. |
| §5.2 / §7.2.1 vs §7.2.2 | The summary rejects at expiry and the state diagram immediately expires; the detailed rule allows a late finalization in a grace window and introduces `SUBMITTED_LATE`. State transitions, timing and proof that a request was in flight need OD-11. |
| §7.2.2 vs O3 | Strict lock and evaluating the last saved answers after expiry are described together; the distinction from auto-submission is not defined. Resolve OD-03/OD-11. |
| §1.2 / §7.2.5 vs §7.2.4 / §17.7.5 | CQ is said to be answered on paper, yet typed responses and a rich-text answer editor are described. Resolve OD-13; neither modality is invented here. |
| §4.4 L6/R8 and §7.2.5 vs §7.2.4 and §11 v3 | AI must not grade CQ or propose marks, but later text suggests AI-assisted evaluation. The stricter locked prohibition applies pending OD-24. |
| §7.2.5 / §17.7.6 vs this task | The README asks to reveal the correct answer/rubric after finalization; the task forbids official keys through student-facing exam APIs without a time exception. OD-14 must define a compliant release path; no result API exception is assumed. |
| §7.2.2 / §6.2 / §7.3.6 | One result per session, a result-level `evaluationSource`, and per-answer provenance are insufficiently specified for a mixed MCQ/CQ exam or later teacher review. Resolve OD-13. |
| §4.4 O2 vs §7.5.3 / §13 | O2 lists a function as an option, while detailed guidance excludes Chromium in a request handler and favors a worker. Keep the dedicated asynchronous worker baseline; host remains open (OD-02). |
| §11 phases vs release table | Phase 08 contains CQ assessment and Paper Studio; v2/v3 scopes group these differently, and history appears in more than one release. Phases are not an approved release mapping (OD-23). |
| §4.4 R7 vs §7.4.3 | The AI JSON example repeats `studentAnswer` and `correctAnswer` without the untrusted-input/release qualifications required elsewhere. Treat it as illustrative, not an approved output schema (OD-14/OD-29). |
| §7.6.3a | The parser workflow says nothing is saved before review but also says parsed output enters a draft; persistence timing is unclear. A normalized-stem hash identifies exact normalized duplicates, not near-duplicates on its own. Resolve both under OD-27. |
| §17.2 vs §17.12 | `Muted` on white is about 4.16:1, yet 16 px metadata is treated as large text. 16 px alone is not WCAG large text; use a compliant token/pair and verify actual size/weight (OD-25). |
| §7.5.4 | The example claims a default `TextDecoder` fails on invalid UTF-8, but its default replaces invalid sequences. Define strict decode behavior explicitly before implementation (OD-28). |
| §8 / §16 vs this task | The README proposes a different flat `docs/` layout and additional files such as an SRS. This task explicitly requests the present categorized structure; the missing SRS remains a requirement, not a silently invented document. |

## Related documentation

[Documentation index](../README.md) · [System architecture](system-architecture.md) · [Database relationships](../database/entity-relationships.md) · [API contracts](../api/api-contracts.md) · [Roadmap](../development/roadmap.md) · [Security](../security/security-guidelines.md)
