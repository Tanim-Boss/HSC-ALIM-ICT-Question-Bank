# OD-17 dependency — what §7.11 Zod validation can and cannot implement yet

Status: **OD-18 approved (Revision 4). OD-17 remains OPEN.**
Supersedes nothing; extends `ZOD-BOUNDARY-DEPENDENCY.md`, which was written while
OD‑18 was still believed open.

---

## 1. What changed

`ZOD-BOUNDARY-DEPENDENCY.md` said Zod was blocked on **OD‑17 and OD‑18**. That was
half wrong. OD‑18's content-block schema was **approved in Revision 4** of
`docs/database/phase-04a-question-bank-physical-schema-proposal.md` — approval at
`:5`, detail at `:39`, reviewer confirmation at `:56` — and §7 (`:2260`–`:3400`) is
the authoritative specification, including §7.11 (the Zod strategy) and §7.12
(hard limits).

So the blocker was never "what shape is a block". It is narrower, and this
document states it exactly.

## 2. The precise dependency

**§7.11 specifies validation of a CONTENT DOCUMENT. It does not specify a
REQUEST.** These are different objects and only the first is approved.

| Object | Vocabulary fixed by | Status |
| --- | --- | --- |
| Content document envelope `{format, version, blocks}` | §7.2 | **APPROVED** |
| Ten block types and their fields | §7.4 | **APPROVED** |
| Four profiles | §7.5 | **APPROVED** |
| `cq_rubric` | §7.7 | **APPROVED** |
| Hard limits | §7.12 | **APPROVED** |
| **HTTP request body that carries a document** | OD‑17 | **OPEN** |
| **Field names on that request** | OD‑17 | **OPEN** |
| **Error envelope and HTTP status mapping** | OD‑17 | **OPEN** |
| **Pagination / versioning of the endpoint** | OD‑17 | **OPEN** |

Concretely: §7.11 rule 7 says a *validation failure propagates "as a validated
422 with field paths"*. **422-to-what** is OD‑17. `DomainError` exists
(`errors.ts:64`) and carries `{code, message, invariant?, field?}`, but the mapping
from a Zod `ZodError` path (`$.blocks[4].data.part`) to a transport-level response
is not approved — and `toPublicError` (`errors.ts:104`) deliberately does not
choose a status code.

## 3. What was implemented, and why it is OD‑17-free

Implemented this pass (all approved by §7, none requiring a wire contract):

| Item | Where | §7 source | Why no OD‑17 dependency |
| --- | --- | --- | --- |
| The restricted answer-name policy | `server/questions/publish/restricted-names.ts` | §7.5 | content-domain rule |
| Strict rubric parsing | `parseRubricStrict` in `rules.ts` | §7.7, §7.11 r.3, §7.12 | validates a stored document |
| Rubric shape reaches the gate | `checkRubricShape` in `rules.ts` | §7.7 | domain violation, not a transport error |
| §7.4 catalogue as data | `server/questions/publish/content-catalogue.ts` | §7.4, §7.5 | describes documents, not requests |
| AMB‑5 fail-closed review gate | `assertLegacyArchiveReviewRequired` | I‑6 | domain rule |

**No Zod schema was written.** That is deliberate and is the honest status: the
catalogue makes §7.4 checkable now (tests assert it has exactly ten types with
cited subsections), and `parseRubricStrict` implements §7.7 in hand-written form.
Writing `lib/validation/content-blocks/*.ts` would create a second representation
of §7.4 with no boundary to serve, and §7.11 rule 1 requires that it be the *only*
representation — which means it should be written where it can be wired, not
speculatively.

## 4. What remains blocked, and on exactly which OD‑17 question

| Component | Blocked on |
| --- | --- |
| `lib/validation/content-blocks/envelope.ts` | nothing — but pointless without a caller |
| A `parseRequest` helper | **OD‑17**: transport (server action vs route handler) |
| Field-path → HTTP mapping | **OD‑17**: error envelope and status codes |
| Body-size enforcement | **OD‑17**: edge vs handler policy |
| Idempotency for authoring writes | **OD‑17** + OD‑12 |

## 5. The exact minimum to unblock

Answering only these three would let the Zod layer be wired:

1. **Transport** — server action, route handler, or both, per surface.
2. **Error envelope** — is `{code, message, invariant?, field?}` the wire body as
   is, or is it wrapped, and what status does each category carry?
3. **Field path format** — `$.blocks[4].data.part` (what the code emits), dotted
   `blocks.4.data.part`, or an array of segments.

Question 3 looks cosmetic and is not: the rubric violation already emits
`$.parts[1].criteria[0].weighting` in its message (`checkRubricShape`), so the
format is currently a *convention inside a string*. Making it a contract means
deciding it once.

## 6. Recommendation

Decide OD‑17 questions 1–3, then write `lib/validation/content-blocks/` in the
layout §7.11 already prescribes, with one paired valid/invalid fixture per §7.4
rule (OD‑26‑6). Until then, the catalogue plus the strict rubric parser enforce
the parts of §7 that do not need a transport — and they are tested, which is more
than the previous state, where §7.4 was enforced nowhere at all.

Do not implement a partial boundary. A validator that rejects some fields and not
others reads as protection while the gate alone at least fails closed.
