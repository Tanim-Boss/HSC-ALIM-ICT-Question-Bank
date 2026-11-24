# Owner decision document — AMB‑5, OD‑17, OD‑18, OD‑26

**Status: DECISION PREPARATION ONLY. Nothing here is implemented, and no
business rule has been changed.**
Branch `arena/1042a18a-hsc-alim-ict-question-bank` · HEAD `515174f` · PR #10
**OPEN, unmerged**.
Prepared 2026-11-23. Every claim below cites the file and line it came from.

---

## 0. How to read this, and one finding that changes the shape of the task

This document prepares nine decisions: AMB‑5, OD‑17, OD‑18 and the six OD‑26
sub-items. Four of the nine are genuine open policy questions. **Four are not
what the register says they are**, and saying so is the most useful thing here:

| Item | Register says | Evidence says |
| --- | --- | --- |
| **OD‑18** | "Before editor/schema" — open | **Already approved.** `phase-04a-question-bank-physical-schema-proposal.md:39`, reviewer decision summary row 5 (`:56`): "*JSONB usage / OD‑18 content-block schema (request **B**) — **APPROVED** — envelope, ten block types, profiles, validation, versioning, sanitization, Zod strategy*". The full specification is §7 (`:2260`–`:3400`). |
| **OD‑18** (scope) | "Structured-content schema… allowed editor features" | The *schema* is decided; **editor features are a different, still-open question** and were never in §7. |
| **OD‑26‑1** | Open | Open, but it is a **GitHub setting**, not code. |
| **OD‑26‑5** | Open | Open, but the evidence-access half is now **measured**, not assumed (§4.5). |

The practical consequence: **OD‑18 does not need a decision package — it needs
someone with authority to reconcile the register with the approval report.** I
have written §3 as a reconciliation plus the four genuine residual gaps, instead
of re-proposing a schema that was approved in Revision 4. Re-proposing it would
be the same error as the earlier doc-comment that claimed a rule the code did not
implement: a document asserting a status that its own source contradicts.

**Decision order is at §5.** Short version: AMB‑5 and OD‑18-reconciliation first
(they unblock everything else), then OD‑17, then OD‑26‑2/‑6, then OD‑26‑1/‑3/‑4/‑5.

---

## 1. AMB‑5 — published-history semantics

### 1.1 What the source actually says, and what the code actually does

**The requirement** — I‑6, as recorded in the source of truth for this invariant
(`server/questions/publish/rules.ts:27`):

> `I-6  type immutability once a published version exists.`

The register entry (`rules.ts:99`–`112`) states the ambiguity precisely: I‑6 "does
not say whether that means one exists NOW or that one has EVER existed."

**The implementation** (`rules.ts:1090`–`1103`):

```ts
export function assertTypeChangeAllowed(nextType, currentType, versions) {
  if (nextType !== currentType && versions.some((v) => v.status === 'PUBLISHED')) {
    throw new DomainError({ code: 'QUESTION_TYPE_IMMUTABLE', invariant: 'I-6', … });
  }
}
```

`versions.some(v => v.status === 'PUBLISHED')` is the **"currently published"**
test. It is false once every version is `ARCHIVED`.

**Why the code cannot implement the other reading today** — this is the decisive
technical fact. `prisma/schema.prisma:279`–`305`: `QuestionVersion` stores
`status VersionStatus @default(DRAFT)` and nothing else. There is **no
`published_at`, no `first_published_at`, no publication-event table, and no
`questions.ever_published` flag**. The status enum is `DRAFT | PUBLISHED |
ARCHIVED`. Once a version moves `PUBLISHED → ARCHIVED`, the fact that it was
*once* published is **destroyed**, not merely hard to query.

So "ever published" is **not implementable on the current schema** without a
schema change — which is a migration, and B2 is withheld.

**There is no database-level guard on either reading.** The gate is the only
enforcement: `grep` shows `assertTypeChangeAllowed` has **zero call sites in
`server/` or `tests/`** — only its own definition at `gate.ts:254` and a comment
at `gate.ts:74`. See §3.6 and the carried-over finding in §6.

**Current behaviour, pinned** (`tests/unit/questions/publish-rules.test.ts:1189`
onward): three tests hold the "currently published" reading in place — blocks
while `PUBLISHED`, **permits when all `ARCHIVED`** (the flip point), permits when
never published.

### 1.2 Option A — "Ever published"

A question's historical publication permanently freezes its type, even after
archival.

**Data integrity implications.** Strongest guarantee. `questions.type` selects
which content profile applies (`mcq_stem` vs `cq_stem`, `rules.ts:848`–`960`),
which option cardinality is legal (4 options vs 0, I‑4), and which answer-key
shape is valid (MCQ key vs CQ rubric, I‑13). Content authored under one type is
structurally invalid under the other. Under Option A a question can never hold
content of two incompatible shapes across its lifetime — every version it has
ever had, or will have, was authored against one type. This is the reading that
makes `Question.id` a stable *identity* rather than a slot whose meaning changes.

**Historical audit implications.** A published question may have appeared in an
exam snapshot, and those snapshots pin `QuestionVersion.id` (§7.8, `:3260`). If
the type later flips, an auditor reconstructing "what did this question mean in
exam X" gets a question whose declared type contradicts the version actually
served. Option A removes that class of contradiction permanently. This is the
strongest argument for A.

**Effect on archived questions.** Archived questions are **permanently
unmodifiable in type**. An archived MCQ that the curriculum no longer needs as an
MCQ cannot be repurposed; it must be **superseded by a new question**. That is
the intended cost — archival means retired, and retiring an identifier should not
free it for a different meaning.

**Effect on future revisions.** New versions of an archived question may still be
created (type unchanged), and can be republished. The freeze is on `type` only.
Operationally: staff cannot "convert" a question; they create a new one and
optionally reference the old. The workflow cost is real but bounded, and it is
the cost the "ever published" wording exists to impose.

**Migration or backfill requirements.** **A schema change is required.** Because
publication history is currently destroyed on archival, Option A cannot be
implemented by reading the existing columns for any question that is already
fully archived — that information is gone for existing rows. Concretely:

- **Schema:** add `questions.first_published_at timestamptz NULL` (or a
  `question_publication_events` table if the *history* — not just the first
  moment — is wanted for audit). Requires a new migration. **This is Migration
  0002 territory and is not authorised.**
- **Backfill for existing data:** `first_published_at` can be recovered only as
  `MIN(…)` over rows that are *currently* `PUBLISHED`. Every question whose
  versions are all `ARCHIVED` today is **unrecoverable** and must be treated as
  "never published" (fails open) or "assumed published" (fails closed, freezing
  questions that may never have been published). **The owner must choose which
  error is acceptable for that residual set.** This is not a detail — it is the
  one part of Option A that cannot be made correct.
- **Guard:** the check becomes `first_published_at IS NOT NULL` instead of a
  version scan, which is also cheaper (no version load needed).

**Tests that would change.** Exactly the AMB‑5 block at
`publish-rules.test.ts:1189`–`1229`:

| Test | Change |
| --- | --- |
| `blocks a type change while a version is PUBLISHED` | **unchanged** — passes under both readings |
| `CURRENT BEHAVIOUR: allows a type change once every version is ARCHIVED` | **flips** to expect a throw |
| `allows a type change when nothing was ever published` | **unchanged** |
| `I-6 — …` block (`:1108`–`1127`), 3 tests | semantics unchanged, but the fixture needs a `firstPublishedAt` field |
| Any `assertTypeChangeAllowed` signature callers | signature changes to take the flag, not the version array |

Plus: the `QuestionSnapshot` / `VersionRecordSnapshot` types (`rules.ts:141`)
gain a field, so `snapshot.ts`'s `SnapshotRow` and the integration fixtures change
with it. Small, contained, visible.

**Verdict on A:** the correct reading, and the only one that makes I‑6 mean
anything durable — but it **cannot be implemented without Migration 0002 and a
backfill decision**, and it leaves an unrecoverable residual set.

### 1.3 Option B — "Currently published"

A question's type may change once no version is currently published, including
when all versions are `ARCHIVED`.

**Data integrity implications.** Weaker, and the weakness is concrete rather than
theoretical: a question can carry MCQ content in version 1 (archived) and CQ
content in version 2 (draft, then published). `questions.type` would read `CQ`
while an archived MCQ version still exists holding four options and an MCQ answer
key. Nothing in the schema forbids that, and nothing would report it — the gate
validates the version being published, not its archived siblings. An auditor
reading `questions.type = 'CQ'` would be looking at a question whose only
*published* content was MCQ.

It is worth being precise about how bad this is: it does **not** corrupt data, and
it does **not** leak an answer key. Each version remains internally valid and its
own type-consistent content is intact. What is lost is the guarantee that a
question has one identity-meaning across its life.

**Historical audit implications.** Exam snapshots pin `QuestionVersion.id`, so
served content stays correct. The audit break is at the *question* level: the
question's type at audit time need not match the type of the version an exam
actually used, and the history needed to detect that is **destroyed on archival**
(§1.1). So under Option B the system cannot even *report* that a question changed
type after publication — the record does not exist. That is the sharpest argument
against B: it is not merely permissive, it is **unfalsifiable after the fact**.

**Effect on archived questions.** Archived questions become repurposable. This is
the operational benefit: a retired MCQ can be rebuilt as a CQ without creating a
new question, preserving tags, sources, and any external references to
`Question.id`.

**Effect on future revisions.** Type changes are permitted whenever the question
is quiescent (nothing published). Practically this means the freeze applies only
while a question is live — which matches how editors think about a draft, and is
the cheapest workflow.

**Migration or backfill requirements.** **None.** This is the current behaviour,
implemented on the current schema, with no new column and no backfill. That is a
real advantage and should be weighed honestly: it is the only one of the two
options that can be true today.

**Tests that would change.** **None** — the three AMB‑5 tests become the
*approved* behaviour rather than the *pinned current* behaviour, and only their
descriptive names and comments change. No assertion flips.

**Verdict on B:** implementable now, zero migration, zero backfill; but it makes
the freeze temporary and leaves the post-publication type change permanently
undetectable.

### 1.4 Recommendation

**Recommend Option A — "ever published" — as the intended rule, with Option B
retained as the implemented behaviour until a migration is authorised.**

This is deliberately a two-part recommendation, because the two parts have
different blockers and pretending otherwise would be the failure mode this
project keeps correcting. Concretely:

1. **The rule should be A.** I‑6's purpose is to make `Question.id` a stable
   identity. Option B achieves that only while a question is live, which is the
   one period when the question is *least* likely to be examined about its past.
   The audit argument decides it: under B, a type change after publication is
   undetectable, and an undetectable integrity violation is worse than a strict
   rule — a strict rule can be waived deliberately, an undetectable one cannot be
   audited at all.
2. **B is what ships today, and should be documented as such** — no code change,
   no behaviour change, no false claim. The doc-comment at `rules.ts:1073`–`1089`
   already states this correctly (corrected in the corrective pass), so this is
   consistent with what is already in the tree.
3. **A needs Migration 0002 plus a backfill decision** (§1.2). Neither is
   authorised. So adopting A is a **future** decision with a prerequisite, and
   the honest status today is: *rule decided in principle, implementation
   blocked.*

**If the owner prefers to ship a rule the system can actually enforce today**,
then recommend **B explicitly as the approved interpretation** rather than as an
accident — and record the accepted residual risk (§1.3: post-publication type
changes are undetectable and unrecoverable). Either answer is defensible. What is
not defensible is continuing to have the code implement one and the register
describe the other as "open" without an owner's name against it.

**The exact question for the owner** is therefore not only "A or B" but also:

> If A: is `first_published_at` (single moment) sufficient, or is publication
> *history* required for audit? And for the unrecoverable residual set — questions
> already fully archived — should the backfill fail open (treat as never
> published) or fail closed (freeze them)?

---

## 2. OD‑17 — wire contract

### 2.1 What exists today (verified, not assumed)

**There is no API boundary of any kind.**

| Fact | Evidence |
| --- | --- |
| No route handlers | `app/api/` contains only `.gitkeep` |
| No server actions | no `actions.ts`, no `'use server'` anywhere |
| No request parsing | no `parse(`/`safeParse(` in `server/` |
| No Zod at a boundary | `zod` `^4.6.7` used only in `lib/env.ts:1`–`32` (env vars) |
| `lib/validation/` | contains only `README.md` + `.gitkeep` |

The only server-side entry point is **one service function**:

```ts
// server/questions/publish/gate.ts:117
export async function publishVersion(input: {
  readonly questionId: string;
  readonly versionId: string;
}): Promise<PublishResult>
```

Both fields are `string`. **Nothing validates that they are UUIDs**, that
`versionId` belongs to `questionId` (that is checked transactionally, not at the
boundary), or that the caller sent exactly two fields. A `POST` body of
`{"questionId": {"$ne": null}}` reaches the service as an object; the SQL cast
`::uuid` would reject it, and the caller would get a `DomainError`-shaped failure
or a Prisma error depending on where it lands.

**The domain error vocabulary already exists and is well-formed**
(`errors.ts:16`–`62`, 36 codes; `toPublicError` at `errors.ts:104`):

```ts
{ code: DomainErrorCode, message: string, invariant?: string, field?: string }
```

`message` is documented as "Safe to show a user. Must not contain SQL, index
names or driver text." This is a good foundation and **should not be replaced** —
a second, parallel error type at the boundary would be strictly worse.

**The two projections already exist and are allowlists** (`dto.ts:26`–`49`,
`:106`–`:156`): `toStudentQuestion` (id, type, difficulty, marks, content,
options — no correctness) and `toStaffQuestion` (adds status, versionId,
versionStatus, isVerified, answerKey). Plus `stripAnswerRevealing` (recursive
deny), `findLeakedField` and `assertNoLeak`.

**What this means:** the *semantic* layer OD‑17 needs is unusually complete.
What is missing is purely the *wire* layer — transport, naming, status codes,
versioning — which is exactly what the docs deliberately leave open.

### 2.2 Existing vs proposed, stated separately

Everything in §2.3 is **proposed**. The following is **existing** and must not be
mistaken for a proposal:

- the error *shape* `{code, message, invariant?, field?}` and its 36 codes;
- the two projections and their allowlist discipline;
- the transactional `publishVersion(questionId, versionId)` signature;
- `PublishResult` as the success shape (`gate.ts:103`);
- the rule that no student-facing payload may carry `mcqCorrectOptionKey`,
  `cqRubric`, `isVerified` etc. (`dto.ts:71`, 11 keys).

### 2.3 Proposed contract elements

Where the docs are undecided I say **OPEN** and give no value. This is deliberate:
`api-contracts.md:3` states paths, methods, status codes, pagination and
versioning "require OD‑17" and "must not be treated as an implementation-ready
OpenAPI specification."

**(a) Transport — OPEN, but constrained.** `api-architecture.md:3` says Server
Actions and Route Handlers are "the blueprint's intended boundary" and that
"exact transports, routes and wire details remain unapproved". Two viable,
materially different choices:

- *Server Actions* — no status codes; errors arrive as thrown/returned values;
  `DomainError` maps naturally to a returned `{ok:false, error}` result. Poor fit
  for non-browser clients and for idempotency keys.
- *Route Handlers* — status codes, headers, idempotency keys, and external
  clients all work normally. More ceremony.

**Proposal:** decide per surface, not globally — auth/session and exam-taking
benefit from status codes and idempotency headers; staff content authoring is
naturally a server action. **This requires the owner's answer; I am not choosing
it.**

**(b) Request DTO structure.** Proposed shape, with **names explicitly
illustrative** (per `api-contracts.md`, field names are not approved):

```
publishVersion request (illustrative):
  { questionId: uuid, versionId: uuid }              ← exactly 2 fields, strict
```

Proposed properties: **strict object** (unknown keys rejected — consistent with
§7.11 rule 3, `:3365` precedent of `z.strictObject`), both fields **required**,
both **UUID v4-shaped**, no optional fields. Rationale: the service signature
already has exactly these two, and adding optionality at the boundary that the
service does not read would create a second source of truth.

**(c) Response DTO structure.** Success is `PublishResult` (exists,
`gate.ts:103`). Proven: the integration suite asserts "the persisted result
matches the reported outcome" (D3). Proposed: **return only fields a client can
act on**; never echo the submitted content. Explicitly **do not** include
Prisma rows.

**(d) Required vs optional fields.** Proposed rule, applicable to every future
operation: *a field is optional only if the service has a documented behaviour
for its absence.* No defaults invented at the boundary — a boundary default and a
DB default that disagree is a silent-corruption source. For
`publishVersion`: **zero optional fields.**

**(e) Versioning expectations — OPEN.** Two candidates: URL/header version
(`/api/v1/…`) vs a *contract-stability* promise with no version token. Relevant
evidence: §7.8 (`:3260`) already establishes a **three-way** version model —
`question_versions.version_number` (content revision), `QuestionVersion.id`
(exam-pinned identity), and `content.version` (document schema). **A fourth
"API version" must be named distinctly or it will be confused with these**, which
is why this needs an explicit decision rather than a convention.

**(f) Validation ownership.** The codebase already answers this and the docs
agree — this is the one part of OD‑17 that is *nearly* decided:

- **Boundary** (Zod, `lib/validation/`): shape, types, limits, unknown keys.
- **Service** (`publishVersion`): domain rules, transactions, authorization of
  the specific resource.
- **Database**: last line of defence — 47 `CHECK`s, 20 unique indexes, 5 composite
  FKs, and `ck_question_versions_content_size`.

`api-architecture.md:12`–`16` requires exactly this split, and adds that
authorization must be enforced per-resource and never trusted from the client.
**Proposed:** formalize the three layers as policy, and state the rule that a Zod
schema must never contain a domain rule that the gate also checks — otherwise the
two drift and the weaker one wins silently. Note the inverse risk observed in
this codebase: `checkOptionCardinality` and the DB's `ck_question_options_key_
allowed` (`migration.sql:539`) **both** constrain keys, and D1 showed what
happens when two layers describe the same rule with different vocabularies.

**(g) Student/staff projection boundaries.** Existing functions are correct.
Proposed policy additions:

- staff projections must **not** be reachable from a student surface — currently
  unenforceable in types, since `toStaffQuestion` deliberately cannot check the
  caller (`dto.ts:118` comment). Proposal: require every staff projection call to
  sit behind an authorization call in the same function, and enforce by review +
  a test that asserts each staff surface calls an authorizer first.
- `assertNoLeak` should run on **every** response, not only where it is now (6
  call sites), as a final boundary assertion. Cost is O(payload); it already
  exists.

**(h) Error response structure.** Existing `DomainError` covers domain failures.
Proposed mapping table — **the category names are already proposed in
`api-contracts.md:126` and are NOT approved**; what I propose is only the
*principle*:

> Every `DomainErrorCode` maps to exactly one category, the mapping is a
> data table (not scattered `if`s), and `toPublicError` is the only serialiser.

I do not propose the 36-to-8 mapping, because doing so would invent the
categories' meanings. One constraint worth recording: `api-contracts.md:129`
requires the `FORBIDDEN`/`NOT_FOUND` distinction "must protect resource
enumeration" — so the mapping cannot be chosen per-code in isolation; it depends
on which resources are enumerable, which is OD‑16.

**(i) Backward-compatibility expectations — OPEN.** No client exists, so there is
nothing to be backward-compatible *with*. Proposal: adopt a **pre-1.0 "break
freely, document loudly"** stance until a client exists, then freeze. This is a
decision, not a default.

### 2.4 Why OD‑18 blocks OD‑17 (and not the reverse)

The request DTO for content authoring embeds a content document. Its schema **is**
OD‑18's schema. So OD‑17's request DTO cannot be finalized before OD‑18 is
settled — but OD‑18 is already approved (§3), so once that is reconciled,
OD‑17's content-shaped fields become writable. The error envelope and transport
questions are independent of OD‑18 and can be decided in parallel.

**Dependency:** OD‑17 depends on OD‑18 (reconciliation) and on OD‑16
(authorization granularity, for the error-mapping question).

---

## 3. OD‑18 — structured-content schema

### 3.1 The reconciliation finding

**OD‑18's schema is approved, and has been since Revision 4.**

- `phase-04a-question-bank-physical-schema-proposal.md:5` — "*A (18-table
  migration scope), **B (OD‑18 content-block schema)**, C …, D … are
  **APPROVED***"
- `:39` — reviewer decision row: "all Phase 04A requests are now decided"
- `:56` — "*JSONB usage / OD‑18 content-block schema (request **B**) —
  **APPROVED** — envelope, ten block types, profiles, validation, versioning,
  sanitization, Zod strategy*"
- The specification is §7, `:2260`–`:3400`, and it is **complete**: envelope
  (§7.2), ten block types with valid *and* invalid examples (§7.4, `:2337`),
  four document profiles (§7.5, `:2745`), a 13-control sanitisation section
  (§7.10), the Zod strategy (§7.11, `:3332`), hard limits (§7.12, `:3365`), and
  the versioning policy (§7.8, `:3260`).

**The register (`technology-decisions.md:59`) still says "Before editor/schema",
open.** That is a documentation inconsistency, not a missing decision.

**This matters practically.** Writing a fresh OD‑18 proposal now would (a)
duplicate an approved specification, (b) create a second source of truth that
will drift, and (c) repeat the failure this project has already recorded twice —
a document asserting something the code does not do. **The correct action is to
reconcile the register with the approval report, not to re-decide the schema.**

**So the rest of §3 does what the instruction asks for — current shapes, existing
rules, missing constraints, alternatives, Zod boundaries, compatibility,
malformed-content handling — but treats §7 as the *specification of record*, and
confines "alternatives" to the four places where §7 is genuinely silent or the
code genuinely diverges from it.**

### 3.2 Current content shapes (what is actually stored)

Three JSONB homes (`content.ts:1`–`23` header; `schema.prisma`):

| Column | Model | Envelope |
| --- | --- | --- |
| `question_versions.content` | `QuestionVersion` | `{format, version, blocks[]}` |
| `question_options.content` | `QuestionOption` | same envelope |
| `answer_keys.cq_rubric` | `AnswerKey` | `{format:'cq_rubric', totalMaxMarks, parts[]}` |

**Verified stored example** (`tests/fixtures/questions/publish-fixtures.ts:39`–`50`),
an MCQ stem:

```json
{ "format": "rich_blocks", "version": 1, "blocks": [
  { "type": "paragraph", "data": { "text": "নিচের HTML কোডটি লক্ষ করো:", "lang": "bn" } },
  { "type": "code", "data": { "language": "html", "code": "<h1>Hello</h1>" } } ] }
```

A CQ stem (`:66`–`80`) is one stimulus block then four `subquestion` blocks with
`{part, maxMarks, instruction}`; a rubric (`:83`+) is
`{format:'cq_rubric', totalMaxMarks, parts:[{part, maxMarks, criteria:[{marks}]}]}`.

**Ten approved block types** (§7.4, `:2337`): `paragraph`, `heading`, `list`,
`table`, `image`, `math`, `code`, `flowchart`, `callout`, `subquestion`.

**What the database enforces about shape** — only the envelope
(`migration.sql:529`–`534`):

```sql
CHECK (jsonb_typeof(content) = 'object')
CHECK (content ? 'format' AND content ? 'version' AND content ? 'blocks')  -- presence only
CHECK (pg_column_size(content) <= 262144)                                  -- 256 KiB
```

The migration comment is explicit: "*envelope guard only; block shapes are
validated by Zod (§7.11)*". Options additionally get
`char_length(key) = 1` and `key IN ('A','B','C','D','ক','খ','গ','ঘ')`.

### 3.3 Existing validation rules, and what enforces them

The gate (`rules.ts`) enforces **profile and cross-document** rules, not block
field rules:

| # | Rule | Enforced by | Source |
| --- | --- | --- | --- |
| 1 | `isContentDocument` — `format` string, `version` number, `blocks` array | gate | `content.ts:57` |
| 2 | `mcq_stem`: ≥1 block, ≥1 `paragraph`, no `subquestion`, no leading `heading` | gate | `rules.ts:848`–`874` |
| 3 | `option` profile: 1–3 blocks, only `paragraph`/`math`/`image`/`code` | gate | `rules.ts:875`–`902` |
| 4 | `cq_stem`: ≥1 stimulus, subquestions last, no `heading` inside a subquestion | gate | `rules.ts:906`–`955` |
| 5 | Answer-revealing property scan, recursive, 7 names | gate | `rules.ts:800`–`815` |
| 6 | Rubric ↔ stem agreement (parts, marks, totals) | gate, I‑7/I‑15 | `rules.ts:389`+ |
| 7 | Asset pointers resolvable to a block, per version | gate, I‑8/I‑14 | `rules.ts:988` |
| 8 | No answer keys in student output, recursive, 11 names | projection | `dto.ts:71`, `:93` |

**Critically: no rule checks the *fields inside a block*.** A `paragraph` with no
`text`, a `heading` with `level: 9`, a `table` with ragged rows, a `math` block
with a 10 000-char `latex`, a `code` block with no `code` — all pass the gate if
the enclosing profile is satisfied, because §7.4's field tables were assigned to
Zod (§7.11) and Zod is not implemented.

### 3.4 Missing or inconsistent constraints (verified this session)

These are the real OD‑18 residue. Each is a place where §7 says something
specific and the code does not implement it:

| # | Gap | §7 says | Code today |
| --- | --- | --- | --- |
| G‑1 | **Block field schemas absent** | §7.4 per-type required fields, types, char limits | not checked at all |
| G‑2 | **Hard limits absent** | §7.12: 200 blocks/doc, 10 nested/subquestion, 50 assets, paragraph ≤5000, heading ≤200, list ≤30×2000, table ≤30×8, code ≤5000, math ≤2000, alt/caption ≤300 | only the 256 KiB column cap |
| G‑3 | **Rubric criteria bound** | §7.12: **6 criteria per part** | `parseRubric` does not check it (`rules.ts:359`) |
| G‑4 | **`parseRubric` silently drops unknown fields** | §7.11 rule 3: strict objects, unknown keys are errors | rubric output keeps only `{part, maxMarks, criteria:[{marks}]}` — `blocks`, `assets`, `options`, and any criterion's text are **discarded without error** |
| G‑5 | **Nested blocks in options not rejected** | §7.5 `option` profile forbids "nested blocks" | `ALLOWED_OPTION_TYPES` (`rules.ts:786`) filters block *types*, but does not look at `data.blocks` inside an option block |
| G‑6 | **Two divergent denylists** | §7.5 answer-revealing names; §7.11 strictness | `rules.ts:790` has **7** names; `dto.ts:71` has **11**. `correct` is gated but not stripped; `cqRubric`, `isVerified`, `mcqCorrectOptionKey`, `verifiedAt`, `notes` are stripped but **not gated** |
| G‑7 | **`format` literal not pinned** | §7.2 envelope `format: 'rich_blocks'` | `isContentDocument` accepts **any** string (`content.ts:63`) |
| G‑8 | **`version` value not dispatched** | §7.8: readers dispatch on stored `version`; unknown version is an error, not a fallback | `version` is only checked to be a number; any value accepted |
| G‑9 | **`subquestion` shape unvalidated** | §7.4: `part` ∈ ক–ঘ, `maxMarks` positive int, ordering enforceable | `subquestionPart`/`subquestionMaxMarks` return `null` for bad values but callers do not always fail on null |

**G‑6 is the one to look at hardest.** It is not a schema question — it is a
latent answer-leak path. A content document containing `"correct": "B"` is
**gated** (the gate's 7-name list includes `correct`) but is **not stripped** by
the student projection (the 11-name list omits `correct`). Because the gate
refuses to publish such content, the leak is currently unreachable through the
publish path — which is exactly why it has never been noticed. But
`stripAnswerRevealing` is the *second* line of defence, and it has a hole that
only the first line currently covers. If any future path writes a version without
the gate, the leak is live. **Recommendation: make `dto.ts`'s 11-name list the
single exported constant and have `rules.ts` import it.** That is a one-line
change with a test, not an OD‑18 decision — it is recorded here as a defect, not
proposed as a schema change.

### 3.5 Proposed alternatives (only where §7 is genuinely open)

Because §7 is approved, "alternatives" here means **how to implement it**, not
*what* to implement.

**Alternative A — implement §7.11 literally: Zod discriminated union, strict
objects, `z.lazy` for the one legal nesting, `.superRefine` for ordering.**
This is what §7.11 already prescribes (10 design rules, `:3332`). Cost: a new
`lib/validation/content-blocks/` module tree (§7.11 gives the exact layout), plus
paired fixtures per rule. Zod `^4.6.7` is installed. **Consequence:** closes
G‑1…G‑3, G‑7…G‑9 fully, and G‑4 partially (strict objects reject what
`parseRubric` currently drops).

**Alternative B — hand-written validators in `content.ts`, no Zod.** Rejected by
§7.11 rule 1 ("one source of truth… no parallel hand-written interface"), and in
practice it would drift from the renderer. Listed only so the rejection is
recorded.

**Alternative C — JSON Schema documents + a validator library.** Would satisfy
"typed blocks" but duplicates Zod (already a dependency, already prescribed) and
splits the validation story in two. Not recommended.

**Alternative D — validate in the database (triggers).** Explicitly rejected by
§7.5 (`:2745`): profiles depend on `questions.type`, a cross-table fact, and
"the database stores `jsonb` and checks only the envelope". Also §7.11: "not in a
database function".

**Recommendation: Alternative A**, because it is the approved specification
rather than a choice among equals. The genuine decision is narrower and is in
§3.7.

### 3.6 Zod validation boundaries

§7.11 already fixes these; restating them so the decision-maker sees the
contract, not to re-decide it:

| Boundary | Behaviour | Source |
| --- | --- | --- |
| **Write (publish/save)** | `parse()` — throws; error propagates as a field-pathed validation failure | §7.11 rule 7 |
| **Read (render)** | `safeParse()` — **never** `parse()`; on failure log `{versionId, pointer, schemaVersion}` and render the unsupported-content state, so a validation failure cannot become a 500 on an exam screen | §7.11 rule 7 |
| **Cross-document** | separate function (no DB access), composes document + 4 options + rubric + I‑4/I‑7/I‑8/I‑13/I‑2 | §7.11 rule 6 |
| **Sanitisation** | **not Zod's job** — §7.11 "What Zod deliberately does not do": a sanitiser that rewrites stored content would break I‑5 immutability | §7.11 |
| **Error message content** | must not echo the rejected value in full — "a rubric leak through an error message is still a leak" | §7.11 rule 11 |

**Note a naming divergence worth reconciling:** §7.11 rule 6 names the
cross-document function `validateVersionForPublish`; the code's entry point is
`evaluatePublishGate` (`rules.ts:974`) reached via `publishVersion`
(`gate.ts:117`). Both are one entry point, but the docs and code use different
names for it. Cosmetic, but it will confuse the first implementer of the Zod
layer — record it.

### 3.7 Compatibility implications, and the decision that is genuinely open

**Stored content: no migration needed, by design.** §7.8 rule 3 (`:3260`):
"Published documents are never rewritten in place… upgrading the schema means
'render old documents correctly', not 'migrate the corpus'." Since `version: 1`
is the only value that exists and **no content exists outside fixtures**, adding
the Zod layer is purely additive: it validates on write (no v2 schema yet, so
`version` stays 1) and fails soft on read.

**The one genuine incompatibility risk** — and this *is* the open OD‑18 question:

> **Is `version: 1` content that is stored today guaranteed to satisfy the newly
> implemented v1 Zod schema?**

If §7.4's field rules are stricter than what any stored document contains, then
implementing Zod retroactively makes existing published documents
**unrenderable** (§7.8 rule 3 requires they stay renderable) or unrepublishable.
Today the risk is **nil in production** (no content exists) but **non-zero in
fixtures**: the current fixture blocks may not satisfy every §7.4 field rule —
e.g. the `code` block uses `{language, code}`, and `paragraph` uses
`{text, lang}`. Whether those match §7.4 exactly must be checked before Zod is
enabled, not after.

**Therefore the exact OD‑18 decision required is narrow:**

1. **Ratify** that §7 of the approval report is the operative OD‑18
   specification, and that the register entry is to be reconciled to
   "APPROVED (Revision 4), implementation deferred" (§3.1).
2. **Decide the editor-features half separately** — "allowed editor features"
   (what the authoring UI may expose: which block types, and whether `flowchart`
   and `table` are in the first release) is **not covered by §7** and is
   genuinely open. It has no bearing on stored content shape.
3. **Decide when to enable strict write-validation** — before or after any
   content exists. Enabling it before content exists is strictly cheaper; the
   only cost is that fixtures must be brought into exact §7.4 compliance.

### 3.8 Safe handling of malformed or legacy content

§7.8 and §7.11 rule 7 already prescribe the answer; the gaps in §3.4 mean the
current code does *some* of it badly:

- **Malformed on write** → reject. Today: partially (profile only). With Zod:
  fully, with field paths.
- **Malformed on read** → `safeParse`, log, render unsupported-content state.
  Today: **no read path exists**, so nothing can break — but also nothing is
  protected.
- **Legacy/malformed currently in the database** → nothing exists. **No repair
  script should be written** for a corpus of zero; that is speculative work.
- **The `parseRubric` silent-drop behaviour (G‑4) is the unsafe case today**: a
  rubric with an unrecognised criterion field is parsed as if that field were
  absent, so a marking guide can be silently reduced. It does not leak an answer
  (it loses information, not gains), but "silently drops" is the wrong default
  for an answer document. **This is a defect to record, not a schema to invent.**

---

## 4. OD‑26 — six separate decision records

**Context that applies to all six.** Two normative passages constrain testing
(quoted in `ACCEPTANCE-AUDIT.md:70`–`74`):

> **§3.13:** "Each invariant needs at least one integration test against a
> disposable PostgreSQL instance before 0001 is considered done (**OD‑26** still
> owns the pipeline)."

> **§7.11.10:** "Every rule in §7.4–§7.7 has a paired valid/invalid fixture; **the
> invalid fixture asserts the failing path, not just 'it threw'.** The publish
> gate gets integration tests against a disposable PostgreSQL instance
> (**OD‑26**)."

**And the register** (`technology-decisions.md:67`): "CI provider, required
checks, test isolation/fixtures, performance thresholds and security-test
ownership. Vitest/RTL/Playwright/PostgreSQL tests are intended; no pipeline or
complete budgets exist."

**Measured state today** (not proposed): 2 workflows, both green at `515174f` /
PR-merge `823c740`; 182 unit tests / 7 files; 29 integration cases / 4 files
against a disposable `postgres:16` with 0001 applied; a mutation step proving the
D2 regression fails on old behaviour; a count floor of 29; a SKIP-is-a-failure
guard. RTL and Playwright: **nothing exists**. Performance: **nothing enforced**.
Security tests as a category: **none**.

---

### 4.1 OD‑26‑1 — Required-checks policy

**Requirement quoted.** Register `:67` names "required checks" as part of OD‑26
with no value. §3.13/§7.11.10 make integration tests *normative for 0001*, which
implies they must actually run — but does not say they must *block a merge*.

**The unresolved issue.** Which jobs block a merge, and can a human override?

**Alternatives.**

| Option | What it means |
| --- | --- |
| **A** Both workflows required, admin override permitted | default-deny with a documented escape hatch |
| **B** Both required, no override | strictest; every urgent fix waits for a full PG run |
| **C** Unit + typecheck required, integration advisory | fast merges; real-database proof becomes skippable |
| **D** Per-path required checks | docs PRs cheap, `server/` PRs strict; most complex |

**Implications.**
*Security/reliability:* C is the dangerous one, and the evidence is specific —
the D2 defect (snapshot read through the wrong connection) was **invisible to
every unit test** and was only caught by integration plus a mutation test. Under
C, D2 would have merged. *Maintenance:* A/B are a one-time GitHub branch-protection
setting; D needs path filtering that silently rots when directories move. *Cost:*
C/D save runner minutes on docs-only PRs; at current volume that is negligible.

**Recommendation: A.** It makes both jobs blocking — which §3.13/§7.11.10
imply — while leaving a real incident path. **Critically: require that any
override is recorded** (a comment on the PR stating who and why), because an
unrecorded override is invisible to audit — the same failure mode as Option B in
AMB‑5 §1.3, where an integrity violation becomes undetectable.

**Exact decision required:** approve A, B, C or D; if A or B, confirm the set of
required checks is *both jobs of `phase04a-v45-application.yml`*; if any override
is permitted, name who may use it and where the record is kept.

---

### 4.2 OD‑26‑2 — Isolation policy

**Requirement quoted.** §3.13/§7.11.10: a "**disposable** PostgreSQL instance".
`testing-strategy.md:7`: "integration tests exercise real server boundaries and an
**isolated** PostgreSQL database". Neither defines the isolation *unit*.

**The unresolved issue.** What is isolated from what — per run, per file, per
case?

**Alternatives.**

| Option | Isolation unit |
| --- | --- |
| **A** One disposable container per job, shared within the run (**current**) | per run |
| **B** Container per test file | per file |
| **C** Container per test case | per case |
| **D** Transaction-per-test wrapping (rollback after each case) | per case, cheaply |

**Implications.**
*Reliability:* B/C reduce cross-test interference but multiply the cost of
applying migration 0001 (currently seconds per run) and are largely wasted because
`vitest.integration.config.ts:44` already sets `fileParallelism: false` — files
never overlap, so per-file isolation buys little. *Security:* none of these
affects the answer-secrecy property; that is projection-level and unit-tested.
*Maintenance:* A requires every suite to clean up, and it does —
`cleanupFixtures()` plus fixture-tagged codes `IT45F_LEVEL`/`IT45F_SUBJECT`. A
crashed run leaves rows behind. *Cost:* C is impractical; D is the cheapest.

**The trap, stated plainly.** **D would silently defeat the tests this work
depends on.** The D2 regression asserts that a transaction's uncommitted write is
visible *on its own connection* and *not* on the pool
(`snapshot-transaction.test.ts`, 2 cases), and `publish-service.test.ts` asserts
real rollback and real concurrent-publish conflict. A wrapping transaction would
make the first meaningless and the second impossible. **Any decision here must
carve out an explicit exception for transaction-boundary tests.**

**Recommendation: ratify A, with two additions** — (i) a per-run unique fixture
prefix so a crashed run cannot collide with the next, and (ii) an explicit written
exception that lock-visibility and rollback tests run outside any wrapper.

**Exact decision required:** ratify A or select another; confirm the
transaction-test exception; decide whether a per-run unique fixture prefix is
required (and its format is then a small implementation detail, not invented
here).

---

### 4.3 OD‑26‑3 — Performance thresholds

**Requirement quoted.** `testing-strategy.md:15`: "Static / security /
performance … Type/lint, threat cases, bundle/network and database query behavior.
**CI tooling remains open.**" And `:32`: the 200 KB gzipped initial-JS target is a
"planning target **until measurement method and performance gates are approved
under OD‑26**."

**The unresolved issue.** Whether any performance gate blocks a merge, measured
how, against which values.

**Alternatives.**

| Option | Enforcement |
| --- | --- |
| **A** None (**current**) | zero false failures; regressions reach users |
| **B** Advisory reporting only | numbers in CI, never blocking |
| **C** Hard wall-clock thresholds on a set of operations | catches regressions; flakes on shared runners |
| **D** Thresholds relative to a committed baseline | most reliable; needs a maintained baseline |
| **E** **Query-count assertions** instead of wall-clock | deterministic; immune to runner variance |

**Implications.**
*Reliability:* on shared GitHub runners, wall-clock thresholds (C) flake, and a
flaky required check gets disabled — taking the credibility of the whole suite
with it. That is a worse outcome than no check. *Maintenance:* D needs a baseline
refreshed on every intentional change. E needs no baseline at all. *Cost:* B is
free and worthless; E is cheap and precise. *Security:* no direct effect, though
E would catch an accidental N+1 that leaks per-option queries into a projection.

**Recommendation: B + E.** Report timings without blocking (B), and gate on
**query counts** for the paths where correctness-per-query matters — specifically
the snapshot loader (D2's subject: it issues a small fixed number of queries and
should not grow) and the student projection. **I deliberately propose no numbers**:
a query count is a *measured* property of the current implementation, and the
owner should approve the measured value, not one I supply.

**Exact decision required:** whether any gate blocks; if so, which metric
(query count vs wall clock) and for which paths; and the values — which must be
taken from a measured baseline, not invented. If B only, say so, so "no
performance gate" becomes a recorded decision rather than an omission.

---

### 4.4 OD‑26‑4 — Security-test ownership

**Requirement quoted.** `testing-strategy.md:7`: "**security/architecture
reviewers** cover permission and leakage threats." And `:16`: the "Ownership /
secrecy" row requires recursive inspection of "all student-facing exam APIs …
for keys, correct-option identifiers, per-option correctness flags, rubrics,
solutions, nested metadata and leaked asset links."

**The unresolved issue.** Who is that reviewer, and are their tests blocking?

**Alternatives.** **A** Unassigned (current). **B** Application team as part of
feature work. **C** A named reviewer/rotation. **D** Threat- and
incident-driven targets only.

**Implications.**
*Security:* this is the highest-consequence item in OD‑26 — the repository's own
worst-failure statement is a leaked answer. *Reliability:* B is best-informed but
is the first thing dropped under delivery pressure. *Maintenance:* C needs a
person; D is narrow and defensible but can miss a new surface. *Cost:* lowest of
the six if D is chosen.

**Note that security tests already exist under other names**, and naming them is
the cheapest possible first step: the student projection leak tests
(`dto.ts`/`tests/unit/questions/dto`), `assertNoLeak` (6 call sites), the V‑5
mis-attribution tests, and the gate's refusal of unauthorised publication.

**Recommendation: C narrowed by D** — a named owner, with scope limited to the
enumerated §7.10/`testing-strategy` threat list rather than "all security", plus
the answer-key-leakage property as the one always-on assertion. **I do not name a
person, a team, or a review cadence** — that is the owner's decision.

**Exact decision required:** name the owner (role is enough, but it must be a
role that exists); state whether security tests are blocking (see 26‑1); approve
the minimum scope list; and decide whether the §7.10 renderer negative tests
(XSS, KaTeX, SVG-with-script, oversized doc, deep nesting, unknown block type,
answer-revealing property, older `version`) are in scope now or when the renderer
exists — §3.10 of the audit records that they are **renderer** tests and the
renderer does not exist.

---

### 4.5 OD‑26‑5 — CI provider **and evidence-access strategy**

**Requirement quoted.** `testing-strategy.md:7`: integration tests use "an
isolated PostgreSQL database"; `:36`: "Independent test fixtures and CI
environments must be provisioned after approval"; register `:67`: "CI provider".
§3.13/§7.11.10 imply the CI must *actually run* the database tests.

**The unresolved issue.** (a) Which provider. (b) **How evidence is retained and
retrieved** — which the instruction specifically asked me to investigate, and
which turns out to be the harder half.

#### 4.5.1 Measured evidence-access findings

I tested each channel from this environment against run `45317576586` / `45316897653`:

| Channel | Reachable? | Evidence |
| --- | --- | --- |
| **Job log** (`/actions/jobs/{id}/logs`) | **NO** | redirects to `productionresultssa13.blob.core.windows.net` → `EOF` error |
| **Artifact zip** (`/actions/artifacts/{id}/zip`) | **NO** | same host, same failure |
| **Check-run annotations** | **YES** | how the D2/typecheck failures were diagnosed |
| **PR comment** (posted by the workflow) | **YES** | 29 case names + counts retrievable |
| **Committed file in the repo** | **YES** | always |

**Two facts that make PR comments weaker than they look:**

1. **They are not immutable and not complete.** The workflow posts a **new**
   comment per run — 19 `v45-app-results` comments exist, and 107 comments total
   on PR #10. They are append-only noise, not a record. Nothing links a comment to
   a run ID: I verified the comment body contains **no** `/actions/runs/{id}` URL.
   The SHA it names (`823c740`) is GitHub's **synthetic PR-merge commit**, not the
   branch commit — I confirmed by resolving it
   (`Merge 515174f… into 153ef5c…`). So the comment cannot be traced back to a
   run, a commit on the branch, or a database state.
2. **It carries no environment identity.** It says "a real PostgreSQL 16" but not
   which image digest, which migration checksum, or when. Migration 0001's
   integrity is guarded elsewhere (checksums), but the evidence itself is not
   self-describing.

Also relevant: **artifact retention is 30 days**
(`phase04a-v45-application.yml:341`, and `retention-days: 30` in 9 workflows) —
but artifacts are currently **unreachable from here anyway** (24 000 B uploads
that cannot be downloaded). So retention is configured and useless in this
environment.

#### 4.5.2 Alternatives for the evidence channel

| Option | Properties |
| --- | --- |
| **A** PR comments only (**current**) | readable; append-only noise; **no run linkage**; unverifiable authorship beyond `github-actions`; dies with the PR |
| **B** GitHub Actions artifacts | structured, run-linked, immutable-by-URL; **30-day expiry**; **unreachable from this environment**; not readable without a zip tool |
| **C** A retained, committed test report (e.g. a JSON/JUnit summary committed to a `ci-evidence/` path, or a release asset) | survives forever, reviewable in a diff, greppable; but pollutes history unless on a dedicated branch/artifact repo; needs a retention policy decision |
| **D** A structured summary written into the **job summary** (`$GITHUB_STEP_SUMMARY`) | run-linked, immutable per run, survives as long as the run; **unreachable from here** for the same host reason |
| **E** A small, **run-linked** appender that edits one canonical PR comment | one comment, always current, still readable here; needs run URL + commit SHA + counts in the body; PR-scoped |

**Recommendation: E now, C for the audit record — and treat B/D as unavailable
in this environment until proven otherwise.**

Reasoning: the *only* channels this environment can read are annotations, PR
comments and committed files. Evidence that cannot be read is not evidence. So:

- **Immediate:** make the workflow's PR comment **canonical and run-linked** —
  include the run URL, the branch commit SHA (not the synthetic merge commit), the
  PostgreSQL image tag, the applied migration checksum, the test count, and the
  failing case names; edit one comment rather than appending (matching on the
  HTML marker, which the workflow already emits). This is a small change to an
  existing step.
- **Audit record:** commit a compact, machine-readable summary per accepted
  milestone (not per run) to the repo, so the accepted evidence survives PR
  closure and artifact expiry. **Retention policy and cadence are the owner's
  decision — I am not inventing a retention period.**
- **Keep artifacts** (they are useful where reachable) but **do not rely on them**
  as the audit record while the download path is blocked.

**Explicitly: PR comments alone are NOT a sufficient long-term audit record**,
for the three reasons measured in §4.5.1 (append-only, no run linkage, no
environment identity).

#### 4.5.3 The provider question itself

Alternatives: **A** GitHub Actions (current; green; PG service containers; secrets
configured; **but two of its evidence channels are unreachable here**) · **B**
self-hosted runners (faster/cheaper at volume; a machine to patch holding DB
credentials) · **C** another provider (migration cost; loses tight PR integration).

**Recommendation: A**, with the evidence strategy of §4.5.2 — because the
provider is working and the actual defect is the evidence path, not the runner.
**One caveat to record:** if evidence access matters more than convenience, a
provider whose logs are fetchable over a plain authenticated API without
redirecting to a third-party blob host would remove this entire class of problem.
That is a real consideration, not a rhetorical one.

**Exact decision required:** (1) ratify GitHub Actions or choose another; (2)
approve the evidence strategy — canonical run-linked PR comment + committed
milestone summary; (3) state the **retention period** for the committed record
(not invented here); (4) confirm whether unreachable artifacts should remain part
of the evidence story or be dropped from it.

---

### 4.6 OD‑26‑6 — §7.11.10 fixture scope

**Requirement quoted** (§7.11.10, verbatim above): "**Every rule in §7.4–§7.7 has
a paired valid/invalid fixture; the invalid fixture asserts the failing path, not
just 'it threw'.**"

**The unresolved issue.** Read literally, "every rule in §7.4–§7.7" is very
large: §7.4 has **ten block types** with per-field tables (types, requiredness,
char limits, enums), §7.5 has four profiles, §7.6 is examples, §7.7 the rubric
schema. That is plausibly **100+ rules**, and most are block-field rules that
**have no validator yet** (§3.4 G‑1, G‑2).

**Verified current state.** §3.13's "each invariant needs one integration test" is
**MET** (29 cases; every invariant I‑3…I‑15 touched — I‑2 deliberately absent as
it belongs to the source service, `rules.ts:23`). §7.11.10's literal "every rule"
is **NOT met**, and cannot be until Zod exists, because most of those rules have
nothing to assert against (audit `:82`, item O1).

**Alternatives.**

| Option | Scope |
| --- | --- |
| **A** Minimal fixtures for existing cases (**current**) | what is green now |
| **B** Paired fixtures for every §7.4–§7.7 rule, literally | 100+ pairs; requires Zod first |
| **C** Paired fixtures for every rule that **has a validator** | grows with the Zod layer |
| **D** C per phase: all invariant rules now, all block rules when Zod lands | staged |
| **E** Per-incident (grow only where a defect proves it was needed) | cheapest |

**Implications.**
*Reliability:* B is the strongest and is what the text literally says; it is also
impossible today (no validators) and would be ~100 files. E is cheapest but
guarantees gaps. *Security:* block-field validation is where content-borne
answer-leak properties live, so **the answer-revealing rule (§7.5) must be in
scope regardless of which option is chosen** — it is currently tested. *Cost:*
B/C are the largest test-writing effort in the project. *Maintenance:* A/E drift;
D has a natural boundary that a reader can check.

**Recommendation: D.** Fixtures for all §7.4–§7.7 rules **that have a validator
today** (essentially the invariant/profile rules — already done), then **require
a paired valid/invalid fixture as a merge condition for every Zod schema** as it
lands. This satisfies the *intent* of §7.11.10 ("the invalid fixture asserts the
failing path") without pre-writing 100 impossible tests, and it makes the fixture
requirement an enforceable gate rather than an aspiration.

**Exact decision required:** approve D (or name another); confirm whether
"every rule in §7.4–§7.7" is intended literally for *this phase*; and decide
whether the §7.12 hard limits (200 blocks, 10 nested, 50 assets, etc.) are in
fixture scope for Phase 04A or deferred with Zod. **No limit value is proposed
here — they are already fixed by §7.12, and re-stating them would risk asserting
a number I have not verified against an implementation that does not exist.**

---

## 5. Dependencies and recommended decision order

```
                   ┌─────────────────────────────┐
                   │ OD-18 RECONCILIATION        │  (register vs approval report)
                   │ + editor-feature scope      │
                   └───────────┬─────────────────┘
                               │ unblocks content shapes
                   ┌───────────▼─────────────────┐
    ┌──────────────┤ OD-17 transport/naming/     │
    │              │ error envelope              │◄──── OD-16 (auth granularity,
    │              └───────────┬─────────────────┘       for FORBIDDEN vs NOT_FOUND)
    │                          │ unblocks Zod implementation
    │              ┌───────────▼─────────────────┐
    │              │ OD-26-6 fixture scope       │
    │              └───────────┬─────────────────┘
    │                          │ defines test volume
    │              ┌───────────▼─────────────────┐
    │              │ OD-26-2 isolation           │
    │              └───────────┬─────────────────┘
    │                          │
┌───▼──────────┐   ┌───────────▼─────┐   ┌──────────────┐
│ AMB-5        │   │ OD-26-1 required│   │ OD-26-3 perf │
│ (independent)│   │ checks          │   │ OD-26-4 sec  │
└──────────────┘   └───────────┬─────┘   │ OD-26-5 CI   │
                               │         └──────────────┘
                    all feed the evidence story (26-5)
```

**Recommended order, with reasoning:**

1. **OD‑18 reconciliation** — cheapest decision (ratify an existing approval),
   unblocks the most. Nothing else about content can proceed while the register
   says "open".
2. **AMB‑5** — independent, but it is the only item that changes *behaviour*, and
   it needs Migration 0002 for Option A. Deciding early tells you whether a
   migration is on the critical path.
3. **OD‑17** — after OD‑18, because request DTOs embed content documents. The
   error-envelope half can start immediately and in parallel.
4. **OD‑26‑2 and ‑6** — these two set the *volume and shape* of all future tests,
   so they should be settled before the Zod layer lands, not after.
5. **OD‑26‑1 and ‑5** — a pair: required checks determine whether the evidence
   matters, and ‑5 determines whether it can be read at all.
6. **OD‑26‑3 and ‑4** — lowest urgency, no current blockers, and both benefit
   from being decided after ‑6 (they depend on which tests exist).

**Hard dependencies, stated so they cannot be missed:**

- **OD‑17 ⇒ OD‑18** (content shapes) and **OD‑17 ⇒ OD‑16** (error mapping).
- **Zod implementation ⇒ OD‑17 + OD‑18** (already recorded in
  `ZOD-BOUNDARY-DEPENDENCY.md`).
- **AMB‑5 Option A ⇒ a schema migration** (Migration 0002), which is **not
  authorised** and requires B2, currently WITHHELD.
- **OD‑26‑1 ⇒ OD‑26‑5**: requiring checks is pointless if the evidence they
  produce cannot be retrieved.

---

## 6. Changes that must wait for approval

**Nothing in this document has been implemented.** Explicitly deferred:

| Change | Waits on | Blocked further by |
| --- | --- | --- |
| Flip I‑6 to "ever published" (`assertTypeChangeAllowed`) | AMB‑5 | Migration 0002 + B2 withheld + backfill decision |
| `questions.first_published_at` column or publication-events table | AMB‑5 Option A | **no `prisma/` change authorised; no Migration 0002** |
| Any Zod schema in `lib/validation/` | OD‑17 + OD‑18 | deferred by instruction |
| Wire contract: routes, paths, field names, status codes, versioning | OD‑17 | — |
| Block-field validation, §7.12 limits enforcement | OD‑18 ratification | Zod deferred |
| Unifying the 7-name and 11-name answer-name lists (G‑6) | — | **recorded as a defect, not proposed** — needs its own authorisation |
| `parseRubric` strictness (G‑4), criteria bound (G‑3) | OD‑18 implementation | Zod deferred |
| Required-check branch protection | OD‑26‑1 | GitHub settings change |
| Isolation policy change | OD‑26‑2 | — |
| Performance thresholds | OD‑26‑3 | **no value may be invented** |
| Security-test ownership | OD‑26‑4 | **no owner may be invented** |
| CI/evidence strategy change | OD‑26‑5 | — |
| §7.11.10 fixture expansion | OD‑26‑6 | — |

**Also carried and unchanged (not part of this task, but they will be asked
about):** `assertTypeChangeAllowed` and `assertContentWriteAllowed` have **zero
call sites** outside their own definitions (`gate.ts:225`, `:254`) — verified by
`grep` across `server/` and `tests/`. They are exported pre-conditions with no
caller. That is a wiring gap, not a rule gap, and it is unaffected by the AMB‑5
decision (whichever reading is chosen, the guard still has no caller yet).

---

## 7. Protections honoured

Verified in this session, unchanged:

- **D1, D2, D3, V‑5 fixes untouched.** No file under `server/questions/publish/`
  was modified by this task.
- **Real PostgreSQL integration tests preserved** — 4 suites, 29 cases; the D2
  mutation regression step is still in the workflow
  (`phase04a-v45-application.yml`), and CI proved it green at `515174f`.
- **No mocked Prisma** introduced or replaced.
- Migration 0001 byte-identical; **no Migration 0002**; **no `prisma/` changes**
  (`git diff --stat 1fa7aaf..HEAD -- prisma/` is empty).
- No exam tables, no negative-marking fields. **B2 WITHHELD.**
- **G‑1 remains FAILED** — not re-scored, history not rewritten. **D‑1…D‑3**
  historical records preserved.
- **PR #10 OPEN and unmerged** (`mergedAt: null`). No production deployment.

---

## 8. Source references

| Claim | File : line |
| --- | --- |
| I‑6 statement | `server/questions/publish/rules.ts:27` |
| AMB‑5 register entry | `server/questions/publish/rules.ts:98`–`112` |
| `assertTypeChangeAllowed` implementation | `server/questions/publish/rules.ts:1090`–`1103` |
| AMB‑5 doc-comment (corrected) | `server/questions/publish/rules.ts:1073`–`1089` |
| AMB‑5 pinning tests | `tests/unit/questions/publish-rules.test.ts:1189`–`1229` |
| `QuestionVersion` schema — no publication history | `prisma/schema.prisma:279`–`305` |
| `Question.type` | `prisma/schema.prisma:237` |
| OD‑17 register | `docs/architecture/technology-decisions.md:58` |
| OD‑18 register | `docs/architecture/technology-decisions.md:59` |
| OD‑26 register | `docs/architecture/technology-decisions.md:67` |
| **OD‑18 APPROVED (request B)** | `docs/database/phase-04a-question-bank-physical-schema-proposal.md:5`,`:39`,`:56` |
| §7 OD‑18 specification | same file `:2260`–`:3400` |
| §7.4 block catalogue (ten types) | same file `:2337` |
| §7.5 document profiles | same file `:2745` |
| §7.8 schema versioning | same file `:3260` |
| §7.11 Zod strategy (10 rules) | same file `:3332` |
| §7.12 hard limits | same file `:3365` |
| Content envelope CHECKs / 256 KiB | `prisma/migrations/0001_phase04a_question_bank/migration.sql:529`–`534` |
| Option key CHECK | `migration.sql:539` |
| Walker & pointer grammar | `server/questions/publish/content.ts:1`–`23`, `:57`, `:151` |
| Option profile types | `server/questions/publish/rules.ts:786` |
| 7-name answer list | `server/questions/publish/rules.ts:790`–`798` |
| `checkContentProfiles` | `server/questions/publish/rules.ts:823`–`960` |
| `parseRubric` | `server/questions/publish/rules.ts:359`–`387` |
| Gate entry point | `server/questions/publish/rules.ts:974` |
| `publishVersion` | `server/questions/publish/gate.ts:117` |
| Guards (zero call sites) | `server/questions/publish/gate.ts:225`, `:254` |
| 11-name student deny list | `server/questions/publish/dto.ts:71`–`83` |
| Projections | `server/questions/publish/dto.ts:106`, `:126` |
| 36 error codes | `server/questions/publish/errors.ts:16`–`62` |
| `toPublicError` | `server/questions/publish/errors.ts:104` |
| API layer split / transport open | `docs/api/api-architecture.md:3`, `:12`–`16` |
| Logical contracts are proposed only | `docs/api/api-contracts.md:3`, `:126`–`129` |
| §3.13 + §7.11.10 quotes | `docs/database/g1-spike/option-c/prod-ready/v45/ACCEPTANCE-AUDIT.md:70`–`74` |
| Isolation / security owners | `docs/development/testing-strategy.md:7`, `:15`, `:16`, `:32`, `:36` |
| Artifact retention 30 d | `.github/workflows/phase04a-v45-application.yml:341` |
