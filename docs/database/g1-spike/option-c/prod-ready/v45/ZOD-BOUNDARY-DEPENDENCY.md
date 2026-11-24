# The validation boundary: why Zod is deferred, and what must be decided first

Status: **DEFERRED — blocked on OD‑17 and OD‑18. Nothing implemented.**
Audience: whoever closes OD‑17 and OD‑18.
Related: `ACCEPTANCE-AUDIT.md` §6 (verified gap G‑Z1), `od-26-decision-package.md`.

---

## 1. What exists today

There is no request-validation layer. Verified, not assumed:

| Claim | Evidence |
| --- | --- |
| `lib/validation/` is empty | directory exists, contains no files |
| `zod` is a dependency but used once | only `lib/env.ts` imports it, to validate environment variables |
| No server action or route handler parses a request body | no `parse(`, no `safeParse(` in `server/` or `app/` |

So a malformed publish request reaches `publishVersion` as whatever TypeScript
believed it was. TypeScript is erased at runtime; it is not a boundary.

## 2. Where the existing gate is strong, and where it stops

This matters, because "no Zod" reads as "no validation" and that is not true.

The publish gate validates *domain* facts — option cardinality and alphabet,
answer-key coverage, verified keys, version status transitions, question type
changes, content size. Those checks are real, they run on the server, and they
are pinned by 73 unit tests and 29 PostgreSQL integration cases. Reverting D1
fails two of them.

What the gate cannot do is validate *shape*: that `questionId` is a UUID and not
an object, that an unknown field is a mistake rather than silence, that a
10 MB body is refused before it is parsed, or that `content` matches a schema
with a defined version. Those are boundary concerns, and the boundary is where
the gate is thin.

The distinction is worth stating plainly because it determines how urgent this
is: **a hostile or broken client cannot publish an invalid question** — the gate
holds. It can waste server work, produce unhelpful errors, and reach code paths
that were written assuming well-typed input.

## 3. The dependency, stated exactly

Implementation cannot start until both are closed, and neither can be guessed
without inventing a contract:

### OD‑17 — API wire contract (`technology-decisions.md` line 59)

The schema's *names and shapes* are the wire contract. Zod schemas are the
contract expressed in code, so writing them first means inventing OD‑17 by
another route. Required before implementation:

- **Transport and paths.** Server actions, route handlers, or both. Nothing
  currently constrains this, and the choice changes error handling entirely:
  route handlers return status codes, server actions throw and serialise.
- **Field naming.** `draftVersionId` vs `version_id` vs nested objects — a Zod
  schema that guesses will be rewritten.
- **Error envelope.** What a rejection looks like on the wire: which of the
  existing `DomainErrorCode` values map to 400 vs 409 vs 422, and how field
  errors are attributed. `toPublicError` already exists and deliberately hides
  internals, but its HTTP mapping is unspecified.
- **Limits.** Whether a body-size limit is enforced at the edge, in the handler,
  or both. This is a policy value nobody has approved.

### OD‑18 — structured-content schema (`technology-decisions.md` line 60)

`content.ts` has a JSONB walker that recurses through whatever it is given. It
does not know what a valid block is, because that is OD‑18. Verified gaps that a
schema would close, all currently unchecked:

- nested blocks inside option payloads are not rejected;
- `parseRubric` silently drops `blocks`, `assets` and `options` — anything not
  understood is discarded rather than refused;
- the criteria upper bound (documented as 6) is not enforced;
- two divergent denylists exist, one with 7 entries and one with 11.

Required before implementation:

- **Block taxonomy and versioning.** Which block types exist, their required and
  optional fields, and whether `content.schemaVersion` is per-document or
  per-block.
- **Unknown-field policy.** Reject or ignore. This is a product decision with a
  real consequence: rejecting breaks forward compatibility, ignoring lets typos
  through silently.
- **The denylist divergence.** Which of the two lists is authoritative, and
  whether the union is the intent.
- **Sanitisation.** OD‑18 also covers sanitisation; typed blocks are the stated
  requirement and HTML execution is forbidden. Which sanitiser, and whether it
  runs on read or write, is unapproved.

## 4. What implementation will look like, once unblocked

Stated so the decision-maker can judge the size of the work — **not** as a
design to be adopted ahead of the decision.

1. `lib/validation/question.ts` holding the schemas derived from OD‑17/OD‑18.
2. One `parseRequest` helper that converts a Zod failure into the existing
   `DomainError` shape, so boundary errors and domain errors reach the client
   through a single path. `DomainError` and `toPublicError` already exist and
   need no change; a second, parallel error type would be worse than none.
3. Schemas call the gate, never replace it. A schema proves the request is
   well-formed; the gate proves the question is publishable. Merging them would
   put domain rules in the boundary and make both harder to test.
4. Tests: one case per field proving rejection, one proving a valid request
   passes through unchanged, and one proving the error envelope matches OD‑17.

## 5. The cost of waiting

Small, and bounded. Every publish request still passes the gate, so no invalid
question can be published. The exposure is unhelpful errors and wasted work on
malformed input — a robustness and developer-experience cost, not a correctness
one.

The cost of *guessing* is larger: schemas written against an invented contract
either constrain OD‑17 for the wrong reasons or get rewritten, and a rewritten
validation layer leaves tests that pin shapes nobody agreed to.

## 6. Recommendation

Close OD‑17 first, then OD‑18, then implement — in that order, because the wire
contract determines what the content schema is embedded in. If the two must be
split for resourcing, the field-name and error-envelope questions are the
minimum that unblocks anything.

Do not implement a partial boundary now. A boundary that validates some fields
and not others reads as protection while providing less than the gate alone,
which at least fails closed on the facts it understands.
