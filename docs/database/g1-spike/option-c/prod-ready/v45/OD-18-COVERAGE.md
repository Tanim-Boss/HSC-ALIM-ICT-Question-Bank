# OD-18 — register correction and §7 implementation coverage

Status: **OD-18 approved (Revision 4). Coverage measured against §7 this pass.**
Measured 2026-11-23 at HEAD `515174f` + the corrective commits on this branch.

---

## 1. Register correction

`docs/architecture/technology-decisions.md:59` previously read:

> **OD-18** | Structured-content schema, block versions, allowed editor features,
> sanitization and tag representation. | Typed blocks are required; HTML execution
> is forbidden. **Choice of exact shapes and migrations is open.** | Before
> editor/schema

That was **stale and contradicted the approval report**. Corrected to record:

- **Approved in Revision 4** — `docs/database/phase-04a-question-bank-physical-schema-proposal.md`
  `:5` (request **B** approved), `:39` (all Phase 04A requests decided),
  `:56` (reviewer decision row 5: "JSONB usage / OD‑18 content-block schema
  (request **B**) — **APPROVED** — envelope, ten block types, profiles,
  validation, versioning, sanitization, Zod strategy").
- The authoritative specification is **§7** (`:2260`–`:3400`).
- `allowed editor features` is **not** part of the approved schema and is now
  tracked separately as **OD‑33** (a new register row), explicitly open.
- Zod implementation of §7.11 is no longer blocked on OD‑18; it is blocked only
  on OD‑17 for wire-facing components (`OD-17-DEPENDENCY.md`).

**Original approval history preserved.** No Revision 4/5/… text was rewritten;
the correction is confined to the register row plus one new row (OD‑33). No
competing schema proposal was created — this document and `content-catalogue.ts`
cite §7, they do not restate it as an alternative.

## 2. §7 coverage — measured, element by element

Method: each row was checked by reading the implementation, not by inference. A
row is **MET** only if code enforces it; "described in a comment" is not met.

| §7 element | Source | Status | Where / why |
| --- | --- | --- | --- |
| Content envelope presence (`format`, `version`, `blocks`) | §7.2 | **MET** | `content.ts:57` `isContentDocument` |
| `format` literal pinned to `'rich_blocks'` | §7.2 | **GAP** | `isContentDocument` accepts **any** string (`content.ts:55`–`60`). No `=== 'rich_blocks'` anywhere. |
| `version` dispatched, unknown rejected | §7.8 | **MET (rubric only)** | `parseRubricStrict` rejects `version !== 1`. **Content envelope version is not checked.** |
| Ten block types, closed allowlist | §7.4.0 | **PARTIAL** | Now represented as data in `content-catalogue.ts` and tested for exactly ten + cited subsections. **Not enforced** on a document — an unknown block type is currently walked and ignored (`asBlock` returns it, nothing rejects it). |
| Per-block **field** validation (§7.4.1–§7.4.10) | §7.4 | **GAP** | No code validates a block's fields. A `paragraph` with no `text`, a `heading` with `level: 9`, a `table` with 40 rows all pass. |
| Four profiles | §7.5 | **MET** | `checkContentProfiles`, `rules.ts` — mcq_stem, cq_stem, option all implemented and mutation-tested. |
| Nested allowlist for `subquestion` | §7.4.10 | **PARTIAL** | `NESTED_BLOCK_TYPES` recorded as data; `content.ts:50` only descends for `subquestion` (correct), but does not reject a `heading` nested there in all paths — the check exists for `heading` only. |
| Rubric envelope + strict fields | §7.7 | **MET (new)** | `parseRubricStrict` — rejects unknown fields at three levels, preserves `version`, `description`, `kind`, `expectedAnswer`, `notes`. |
| Rubric criteria bound = 6 | §7.12 | **MET (new)** | `RUBRIC_MAX_CRITERIA_PER_PART`. |
| Rubric shape reaches the caller | §7.7 | **MET (new)** | `checkRubricShape` → `CQ_RUBRIC_INVALID`. Previously a rejected rubric produced **no violation at all**. |
| Blocks per document ≤ 200 | §7.12 | **GAP** | Not enforced. |
| Nested blocks per subquestion ≤ 10 | §7.12 | **GAP** | Not enforced. |
| Assets per version ≤ 50 | §7.12 | **GAP** | Not enforced. |
| Character limits (paragraph 5000, heading 200, list 30×2000, table 30×8, code 5000, math 2000, alt/caption 300, notes 1000) | §7.12 | **GAP** | None enforced. Only the document-level 256 KiB cap, which lives in the database (`ck_question_versions_content_size`). |
| Answer-revealing property scan | §7.5 | **MET (strengthened)** | Now shared with the DTO boundary via `restricted-names.ts`; 7 → 12 names. |
| Student projection strips restricted names independently | §7.5, §7.11 | **MET (strengthened)** | `stripAnswerRevealing` uses the same policy; proven not to depend on the gate. |
| Sanitisation | §7.10 | **N/A** | §7.11: sanitisation is a **renderer** property, and no renderer exists. Not a gap in this phase. |

### Gap summary

Four gaps are real and all four are **block-field and limit validation**, i.e. the
part §7.11 assigns to Zod:

1. `format` literal not pinned (G‑7 from the earlier audit);
2. per-block field validation (§7.4.1–§7.4.10) absent;
3. §7.12 hard limits absent (200 / 10 / 50 and the character limits);
4. content-envelope `version` not dispatched (rubric's is).

None of these is a security hole in the answer-secrecy sense —
`findAnswerRevealingProperty` and the projection cover that. They are
input-integrity gaps: a document can be stored that §7.4 says is invalid, and the
renderer (when built) would have to cope.

## 3. Why the limits were not implemented this pass

The instruction authorised implementing "the approved Zod strategy where its
requirements are fully specified by §7 and do not depend on unresolved OD‑17
decisions." §7.12 limits *are* fully specified and OD‑17-free — so the honest
question is why not implement them now.

Answer: they are enforced **in Zod** by §7.12's own words ("Every limit is
enforced in Zod and documented here"). Implementing them as hand-written checks in
`rules.ts` would create the parallel representation §7.11 rule 1 forbids, and it
would then have to be deleted or duplicated when the Zod layer lands. What was
done instead is what can be done without that duplication:

- the §7.4 catalogue as **data** (checked now, consumed by the Zod layer later);
- the §7.7 rubric **strictly** (it is a self-contained document with no block
  tree, so a hand-written parser is the Zod schema in waiting rather than a rival
  to it);
- the policy constants (`RUBRIC_MAX_CRITERIA_PER_PART`, `NESTED_BLOCK_TYPES`) in
  one place.

**This is recorded as a gap, not presented as coverage.**

## 4. Files that implement §7

| File | Role |
| --- | --- |
| `server/questions/publish/content.ts` | document/block traversal, pointer grammar (§7.6.5) |
| `server/questions/publish/content-catalogue.ts` | **new** — §7.4 ten types, §7.4.10 nested allowlist, §7.5 four profiles, as data |
| `server/questions/publish/rules.ts` | profiles (§7.5), rubric strict (§7.7), limits constants (§7.12) |
| `server/questions/publish/restricted-names.ts` | **new** — §7.5 answer-revealing policy, one source of truth |
| `server/questions/publish/dto.ts` | projection allowlist (§7.5, §7.11) |
| `tests/unit/questions/content-catalogue.test.ts` | **new** — holds the catalogue to §7.4 |
| `tests/unit/questions/rubric-strict.test.ts` | **new** — §7.7 strictness, 52 cases |
| `tests/unit/questions/restricted-names.test.ts` | **new** — both boundaries, 84 cases |

## 5. Editor features — separate and OPEN

`OD-33` (new register row). The approved OD‑18 schema decides **what a valid
stored document is**. It says nothing about which of the ten block types the
authoring UI exposes, whether `flowchart`/`table` ship in the first release, or
what inline affordances exist. Those are decisions about the editor.

Recorded separately because conflating them is actively harmful: a UI that only
emits four block types must not be allowed to narrow the approved schema to four,
and a reviewer reading "OD‑18 approved" must not conclude that the editor is
specified.
