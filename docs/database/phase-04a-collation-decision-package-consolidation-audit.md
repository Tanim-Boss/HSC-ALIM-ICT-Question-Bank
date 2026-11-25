# Phase 04A — Collation Decision Package: Consolidation and Cross-Document Consistency Audit

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD when written:** `4d04e4461338ea5931d26faf67d312fbed21de43`
**Subject:** a documentation-only audit of the six collation owner decisions **OD-COLL-01 … OD-COLL-06**, their
six briefs, the deployment decision package, and the historical evidence they rest on.
**Nature:** no document was edited; nothing was approved, closed, implemented, migrated, deployed, committed or
pushed; no database was created, started, queried or scanned.

Labels: `VERIFIED` · `OBSERVED` · `DERIVED` · `PROPOSED` · `UNKNOWN` · `NOT TESTED` · `SUPERSEDED` · `OPEN`.

**Standing statement:** this audit classifies readiness and consistency. It approves nothing, closes nothing,
and authorises no implementation, migration or deployment.

---

## 1. Executive verdict

### **COLLATION DECISION PACKAGE CONSOLIDATION AUDIT COMPLETE — SIX OWNER DECISIONS REMAIN OPEN; NO APPROVAL OR IMPLEMENTATION AUTHORIZED**

Eight findings:

1. **The package is internally consistent on the facts that matter most.** Across six briefs, the deployment
   package and five historical documents, **no brief presents a technical recommendation as owner approval**,
   **no brief presents CI evidence as production evidence**, and **no brief describes a proposed artifact as
   existing functionality**. Each such claim was checked against the committed repository at the points where a
   reader could otherwise be misled (§6, §7).
2. **Fourteen findings were registered; none is a disagreement about a measurement, and none changes a
   decision.** All are either (a) claims a document makes about *itself* versus what the implementation does,
   (b) terminology that drifted between sessions, (c) citations that newer runs superseded, or (d) observations
   that are not conflicts at all. **One is a substantive documentation defect** (`C-02`); **three are
   recommendations for consistent wording** (`C-04`, `C-05`, `C-06`); the rest are resolved claims or
   observations (§6).
3. **The most material finding is a self-described behaviour that was never implemented**: decision doc §8.3
   states that values containing delimiters are "rejected", while the committed probe has no delimiter
   validation at all (`C-02`). The second is the six-versus-seven field-count terminology (`C-04`), the likeliest
   source of a reviewer miscount. **A suspected probe-count defect in the OD-COLL-01/02 brief was tested and did
   not exist** (`C-01`) — it is recorded as a numbering observation, not a fault.
4. **Only one decision is not ready for owner review in its entirety: OD-COLL-05.** Its *fail-closed core* is
   reviewable now; its *field-by-field classification table* cannot be finalised until OD-COLL-03 supplies
   values and OD-COLL-04 supplies a canonical form. The other five are **READY WITH EXPLICIT CAVEATS**; none is
   unqualified "ready", because every one has at least one `UNKNOWN` input (§13).
5. **The dependency graph is not a chain.** OD-COLL-01 and OD-COLL-02 share a dependency on OD-COLL-06 for
   candidate comparison but are otherwise independent of the environment decisions; OD-COLL-03 and OD-COLL-04
   are mutually dependent (values ↔ representation); OD-COLL-05 and OD-COLL-06 each consume both (§12).
6. **The six-index scope is consistent across documents but easy to misquote.** Three separate statements must
   be kept apart: *six indexes exist*, *three keys carry the database-default collation*, *two indexes have
   collation-sensitive uniqueness*. No document incorrectly demands a Unicode collision scan for all six
   (§11).
7. **Twenty-one unresolved evidence items** consolidate the six briefs' open questions; eleven are the package's
   structural unknowns (production profile, equivalence, ICU, PostgreSQL 15/17/18, missing guard, missing
   comparison, missing audit, no production scan, OD-20, OD-22, identity binding), and ten are decision-specific
   (§14).
8. **A parallel review sequence is supported by the evidence; a strict linear one is not.** Business
   decisions (01/02) and the representation decisions (04's layering, 05's fail-closed core) can proceed in
   parallel; only the *classification tables* need OD-COLL-03's values. Three sequences are presented with
   trade-offs, and none is claimed to be uniquely correct (§16).

**Final status of the package: all six decisions `OPEN`; no approval, no implementation authorisation, no
deployment authorisation.**

---

## 2. Audit scope and method

### 2.1 What was audited

| Group | Documents |
|---|---|
| Primary package | `docs/database/phase-04a-final-database-deployment-decision-package.md` (957 lines) |
| Owner decision briefs | `…od-coll-01-02-uniqueness-semantics-decision-brief.md` (722) · `…od-coll-03-production-collation-profile-decision-brief.md` (630) · `…od-coll-04-collation-fingerprint-specification-decision-brief.md` (750) · `…od-coll-05-collation-drift-failure-policy-decision-brief.md` (779) · `…od-coll-06-existing-data-compatibility-decision-brief.md` (707) |
| Historical / supporting | `…database-collation-product-and-environment-decision.md` (1045) · `…index-integrity-guard-design.md` (795) · `…index-collation-r2-investigation.md` (817) · `…ci-collation-profile-measurement-proposal.md` (1039) · `…real-18-table-prisma-drift-investigation.md` (662) · `…b2-production-migration-decision-review.md` (453) · `docs/development/database-migrations.md` (285) |

### 2.2 Method

1. **Claim extraction.** Each brief's factual claims were grouped into the six audit areas of the request
   (production environment, fingerprint, drift policy, existing data, tags/colleges, index scope).
2. **Evidence-first verification.** Every claim that could be checked against the repository was checked
   against the committed artifact — `prisma/migrations/0001_phase04a_question_bank/migration.sql`,
   `prisma/schema.prisma`, `docs/database/g1-spike/option-c/guard.py`,
   `docs/database/g1-spike/option-c/g3-full/collation-probe.sh`, `scripts/db/*`, `.github/workflows/*`.
3. **Conflict registration.** A conflict is recorded only when two sources assert incompatible things, or when
   one source asserts behaviour the repository does not have (§6).
4. **Readiness classification.** Each decision is classified on what an owner can decide *from the current
   evidence*, not on what the briefs recommend.
5. **No silent overwriting.** Where a historical statement is outdated, it is labelled `SUPERSEDED` with the
   authoritative source named — never deleted or reinterpreted in place (§3.3).

### 2.3 What this audit did not do

- It did not re-measure anything: no database was created or queried, and no CI run was re-executed.
- It did not verify the five untracked briefs against git history — they are untracked, and that is recorded
  as a fact of the package, not a defect (§4.3).
- It did not resolve any owner question, and it did not edit any document.

---

## 3. Evidence hierarchy

### 3.1 The seven levels

| Level | Source class | Authority | Example |
|---|---|---|---|
| **1** | current repository implementation (code that runs) | decides *what happens today* | `collation-probe.sh`, `guard.py`, `deploy-gate.sh`, workflows |
| **2** | committed migration and schema | decides *what the database must contain* | `migration.sql` PART C; `schema.prisma` |
| **3** | recorded CI execution evidence | decides *what was observed in CI* | run `45546248909`, check run `138976563830` |
| **4** | previously recorded disposable-database measurements | decides *what was observed in a local environment only* | Session 23 `C.utf8` matrix; guard-design 25-case matrix; R2 `real_c`/`real_u` |
| **5** | reconciled historical evidence | decides *what the project has settled* | decision doc (Revisions 1–2); R2 §12; guard design Revision 2 |
| **6** | decision briefs and technical proposals | decides *what is proposed and why* | the six briefs; measurement proposal; physical-schema proposal |
| **7** | recommendations and unapproved candidate designs | **decides nothing** | OD-COLL options A–E; canonical-JSON proposal; guard architecture |

**Rule of application:** a lower-numbered level beats a higher-numbered one when they conflict. A brief (6)
never overrides the probe (1). A historical document (5) never overrides a later measurement (3/4) — it is
marked `SUPERSEDED` instead.

### 3.2 Labels, and the one that needed a definition

| Label | Meaning in this audit |
|---|---|
| `VERIFIED` | read from a committed artifact or an already-recorded run; would be true for any reader |
| `OBSERVED` | measured in a disposable environment; **never** CI, **never** production |
| `DERIVED` | follows by stated reasoning from verified/observed facts |
| `PROPOSED` | design or process; not applied |
| `UNKNOWN` | a fact about an environment or dataset nobody has measured |
| `NOT TESTED` | could be, and deliberately was not, executed |
| `SUPERSEDED` | a historical statement that newer evidence replaced; the replacement is named |
| `OPEN` | an owner decision with no answer |

### 3.3 Superseded statements carried by the package (not silently rewritten)

| Historical statement | Where | Superseded by | Disposition |
|---|---|---|---|
| "`datcollversion` is effectively NULL for libc" | decision doc Revision 1 §8.4; measurement proposal §8.1 | CI measurement: `2.41` (decision doc §8.7.1, Revision 2) | `SUPERSEDED` — the correction is recorded in the same document, not edited away |
| "CI profile is `INCONCLUSIVE`" | decision doc Revision 1 | run `45546248909` (§8.7) | `SUPERSEDED` |
| "V-1…V-5: none has been done" | physical-schema proposal §11.12.3 | File C §7 (all five recorded) | `SUPERSEDED` (C-DEF-2) |
| "5 hand-written indexes" | proposal §3.14 | DDL and every catalog assertion: **6** | `SUPERSEDED` (C-DEF-4) |
| Missing catalog fields / missing index = exit 0 | measurement proposal §12.2 | implemented probe exits 1 | `SUPERSEDED` for behaviour (C-11) |

---

## 4. Source inventory

### 4.1 Files, roles, and their own status

| Path | Lines | Tracked | Role in the package | Own status |
|---|---|---|---|---|
| `docs/database/phase-04a-final-database-deployment-decision-package.md` | 957 | **no** | primary deployment package; B1b/B2 analysis | `DECISION PACKAGE COMPLETE — TWO SEPARATE DECISIONS REMAIN UNAPPROVED` |
| `…od-coll-01-02-uniqueness-semantics-decision-brief.md` | 722 | **no** | OD-COLL-01 **and** OD-COLL-02 | both `OPEN` |
| `…od-coll-03-production-collation-profile-decision-brief.md` | 630 | **no** | OD-COLL-03 | `OPEN — NO PRODUCTION LOCALE SELECTED` |
| `…od-coll-04-collation-fingerprint-specification-decision-brief.md` | 750 | **no** | OD-COLL-04 | `OPEN — FINGERPRINT SPECIFICATION NOT APPROVED` |
| `…od-coll-05-collation-drift-failure-policy-decision-brief.md` | 779 | **no** | OD-COLL-05 | `OPEN — COLLATION DRIFT FAILURE POLICY NOT APPROVED` |
| `…od-coll-06-existing-data-compatibility-decision-brief.md` | 707 | **no** | OD-COLL-06 | `OPEN — EXISTING DATA COMPATIBILITY VALIDATION REQUIREMENTS NOT APPROVED` |
| `…database-collation-product-and-environment-decision.md` | 1045 | yes | the register and the evidence reconciliation (Revisions 1–2) | contains the OD-COLL rows |
| `…index-integrity-guard-design.md` | 795 | yes | index guard design + 25-case matrix (Revision 2) | `NOTHING IMPLEMENTED` |
| `…index-collation-r2-investigation.md` | 817 | yes | the collation comparison rule (R2) | `PARTIALLY RESOLVED` |
| `…ci-collation-profile-measurement-proposal.md` | 1039 | yes | T1 proposal + completion update | `T1 CLOSED` |
| `…real-18-table-prisma-drift-investigation.md` | 662 | yes | G-1 evidence | `G-1 FAILED` |
| `…b2-production-migration-decision-review.md` | 453 | yes | B2 review | `B2 WITHHELD` |
| `docs/development/database-migrations.md` | 285 | yes | B1a conditions; B2 requirement | authoritative for the workflow rules |

### 4.2 Runtime artifacts (evidence level 1–2)

`prisma/migrations/0001_phase04a_question_bank/migration.sql` (PART C `:613–648`) · `prisma/schema.prisma`
(hand-written-index comments `:26–30`; no `@@unique` for any of the six) ·
`docs/database/g1-spike/option-c/guard.py` (279 lines, three modes, five FKs only) ·
`…/g3-full/collation-probe.sh` (468 lines, measurement only) · `…/g3-full/enforce.sql` (cases 30–32, ASCII) ·
`scripts/db/deploy-gate.sh` (249) · `scripts/db/deploy-path-guard.py` (394) ·
`docs/database/g1-spike/option-c/repo-guard.sh` (371) · `scripts/db/migrate-disabled.sh` (65) ·
`.github/workflows/phase04a-g3-full-schema-gate.yml`.

### 4.3 Package-level observation: five of six key documents are untracked

`VERIFIED`: the deployment package and all five briefs are **untracked** working-tree files. The six decisions
therefore have **no committed record**. This is not a defect in the briefs — it reflects the standing
instruction that no commit or push occurs in these sessions — but it means the package cannot be reviewed from
a clone, and a future reader of the repository will not see it. `DERIVED` consequence: any owner approval
recorded against these documents would need a separate, deliberate commit decision.

### 4.4 One path in the audit request does not exist

The request names `docs/database/database-migrations.md`. **No such file exists** (`VERIFIED`). The
authoritative document is `docs/development/database-migrations.md`, which File C also cites
(`…-final-database-deployment-decision-package.md` §2.4, C-DEF-1). Recorded as `C-08`, a citation defect in the
request rather than a repository contradiction.

---

## 5. Six-decision consistency matrix

| | **OD-COLL-01** | **OD-COLL-02** | **OD-COLL-03** | **OD-COLL-04** | **OD-COLL-05** | **OD-COLL-06** |
|---|---|---|---|---|---|---|
| **Decision question** | which equality `uq_tags_name_lower` should enforce | which equality `uq_colleges_name_lower` should enforce | which provider/locale profile governs production | which fields the fingerprint carries, in what form | what happens when observation ≠ expectation | what must be validated before either changes |
| **Status** | `OPEN` | `OPEN` | `OPEN` | `OPEN` | `OPEN` | `OPEN` |
| **Scope** | tags identity semantics; M2M merge effects | colleges identity; sole-rule risk; provenance | environment contract; not a locale value | artefact, layers, comparison grammar | classification + response; not values | audit scope, report, gates, remediation boundaries |
| **Evidence available** | index DDL + catalog; 20 local probes; `slug` unique; merge mechanics | same + `code` non-uniqueness; no second key; attribution rule | CI profile (run `45546248909`); local `C` vs `C.utf8`; R2 rule | probe source + CI annotations; three artefacts; 8 divergences from proposal | all of the above; measured control gaps; 25-case matrix | six-index classification; absent tooling; hazards E11/E11b/E11c/E12b |
| **Evidence missing** | any real tag data; business intent; slug-as-identity intent | any real college data; whether two institutions may share a name; `code` purpose | any production measurement; whether a production database exists | ICU field semantics; `d` provider domain; cluster identity | approved values (03); canonical form (04); any committed index guard | candidates (01/02); environment (03); audit capability; volumes |
| **Dependencies** | → 06 (candidate key) | → 06 (candidate key) | ↔ 04; → 05; → 06 | ↔ 03; → 05; → 06 | ← 03, 04; → guard implementation | ← 01, 02, 03, 04; → any index replacement |
| **Conflicting statements** | none material; `C-14` (terminology) | none material; `C-06` (index scope) | `C-03` (ICU NULLability phrasing) | `C-01`, `C-02`, `C-04`, `C-05`, `C-12` | `C-05`, `C-12`, `C-11` | `C-06`, `C-14` |
| **Approval prerequisites** | business question answered; candidate key stated | same, plus a rule for same-name institutions | profile selected as a target, with its own evidence | field set + canonical form chosen; identity rule chosen | 03 + 04, for the value-dependent rows | 01/02 (candidates) + 03 (environment) + report spec |
| **Review can occur now?** | **yes, with caveats** | **yes, with caveats** | **yes, with caveats** (prospective choice) | **yes, with caveats** (layering and form) | **partly** — core yes, table no | **yes, with caveats** (process core) |
| **Another decision first?** | no (06 needs *it*, not the reverse) | no | no (but 04's layering helps it) | no (mutual with 03, not a prerequisite) | **yes** for full table: 03 + 04 | **yes** for Q1–Q3: 01/02 |

**Verification point required by the request:** no brief presents a technical recommendation as an owner
decision. Every brief carries an explicit statement in the form *"a technical recommendation is not owner
approval"* (§1 and the owner table of each), and every register row in the decision doc is `OPEN`.

---

## 6. Cross-document contradiction findings

Fourteen findings. `C-02` is a substantive documentation defect; `C-04`, `C-05` and `C-06` are terminology
issues worth one sentence each; `C-01`, `C-13` and `C-14` were tested and are **not** conflicts; the remainder are
claims that newer evidence resolved. Each is recorded with both sources, the hierarchy that decides it, and
whether an owner must act.

| ID | Source A | Source B | Nature of conflict | Hierarchy / resolution | Owner? |
|---|---|---|---|---|---|
| **C-01** | an earlier working note recorded a suspected miscount in S23: a claim of "20 probes" against a 23-row table (`:351–377`) | **no document makes any probe-count claim** — a repository-wide search for "20 probes", "23 probes", "20-probe", "20 rows" finds only the brief's revision history, which describes the experiment without a count | not a conflict: the E-series runs `E1`–`E13` plus `E11b/E11c/E12b`, then `E17`–`E20` (20 insert probes), and `D1`–`D3` are diagnostics; **the numbering skips `E14`–`E16`** | `VERIFIED` by counting the table and grepping all candidate phrases. `SUPERSEDED` as a suspected defect; retained as a numbering observation — no reader should infer that rows were lost | no |
| **C-02** | decision doc §8.3: values are "**rejected** if they contain the delimiters (`;`, newline)" — unlabelled, reads as implemented | `collation-probe.sh:149–164` and `:256–258`: **no delimiter validation exists** (only control characters are rejected, and only on the annotation path) | a documented property the implementation does not have | **resolved against level 1**: the probe is authoritative for behaviour; §8.3's clause is an intention → treat as `PROPOSED`. Feeds OD-COLL-04 Q4 | no (documentation), but the rule itself is OD-COLL-04's |
| **C-03** | decision doc §8.1 `:535`: `datcollate`/`datctype` are "NULL for ICU databases **in some versions**" | S25/S26 briefs: ICU is `NOT TESTED` in this repository | an assurance-shaped phrase about an unmeasured provider | **resolved**: the phrase is documentation-derived, not measured → `NOT TESTED`. No ICU environment was ever available (S23 §7.4) | no |
| **C-04** | decision doc OD-COLL-04 row and S24 §2.1: "**six fields**" | probe emits **seven values** + a version prefix; measurement proposal §7.4 says "all **seven** fingerprint fields" | terminology: the six are the Session 14 core set; `pg` is the seventh | **resolved**: "six core fields + `pg` major = seven values; the string has seven values behind `v1`". Recommend always writing both numbers | no |
| **C-05** | S24 §8 defines 13 classifications; `EXACT_MATCH` = "every **field** equals the approved expectation" | S25 §4 defines 33 classifications; `EXACT_MATCH` = "every applicable approved expectation verified" (all layers) | one name, two scopes | **resolved by precedence**: OD-COLL-05's definition governs a deployment verdict; OD-COLL-04's describes fingerprint equality only. `DERIVED`. Risk: a reader could think 04's `EXACT_MATCH` means "safe to deploy" | no |
| **C-06** | R2 §12.1: `database_default` for **three** keys (tags, colleges, assets checksum) | S26 §4: only **two** indexes require collision analysis | three collated keys vs two collation-sensitive unique rules | **resolved** by OD-COLL-03 §5.2's three tiers: tier 1 = two unique; tier 2 = one non-unique; tier 3 = three collation-free. Recommend quoting the tiers whenever either number appears | no |
| **C-07** | `docs/development/database-migrations.md:29` and S25 `:752` cite G-3 run **45273840004** | File C C-DEF-6: newer equivalent runs exist (`45372731345`); both success | stale citation | **resolved**: citation staleness only; verdict unchanged. `SUPERSEDED` for the citation, not for `G-3 PASSED` | no |
| **C-08** | audit request cites `docs/database/database-migrations.md` | the file is at `docs/development/database-migrations.md`; no file exists at the cited path | path defect | **resolved**: `docs/development/…` is authoritative (File C cites it too) | no |
| **C-09** | decision doc §14.1 P2 ("Adopt the versioned fingerprint string…") — inside a section headed "all `PROPOSED`, none approved" | S24 §13 `:640` ("Recommendation, if justified") and `:643` (a recommendation "is **not** owner approval"); OD-COLL-04's `OPEN` row | a recommendation phrased imperatively | **resolved**: the section heading and the register row control; no approval is implied. Flagged because "Adopt …" is the most approval-shaped wording in the package | no |
| **C-10** | physical-schema proposal §3.14: "5 hand-written indexes" | DDL PART C and every catalog assertion: **6** | historical count defect | **resolved** (File C C-DEF-4): DDL is authoritative. Not reintroduced by any brief | no |
| **C-11** | measurement proposal §12.2: missing catalog field / missing index "**not** a step failure … exit 0" | probe `:359–369` and `:386–429`: exit **1** for both | proposal vs implementation | **resolved against level 1**: the implementation is stricter. `SUPERSEDED` for those two rows | no |
| **C-12** | measurement proposal §8.6 C1 `:471` (itself labelled `PROPOSED`), quoted in S24 `D4`: "anything else → `unknown` (**and `unknown` must fail, not pass**)" | probe: serializes `provider=unknown` and continues; only the `collation-fingerprint/v1;` prefix is checked (`:380–384`) | agreed rule, unimplemented | **resolved as a gap**, not a contradiction: three documents agree on the rule; the probe does not enforce it. Recorded in S25 §10 row 5 as `PROPOSED`, not enforced | no — but the rule's adoption is inside OD-COLL-04/05 |
| **C-13** | S23 §2.2: colleges' exposure is "much higher" because the name is the sole rule | S22 §5.2: tier 1 covers both indexes equally | not a contradiction — a *business* asymmetry, not a technical one | **retained**: both statements are true of different things (technical scope vs business consequence). Recommend saying "same technical tier, higher business stakes" | no |
| **C-14** | S23 calls the two rules "identical definitions, different entities" | S25/S26 call them "two of six" and "the sole rule" for colleges | not a contradiction — scope terminology | **retained** as a terminology risk; the resolution is to always name the comparison set | no |

### 6.1 The two findings that needed the closest reading

**C-02 — the delimiter clause.** Decision doc §8.3 reads: *"explicit NULL sentinel `-`, values rejected if they
contain the delimiters (`;`, newline) so the string can never be ambiguous"*. The sentence sits in the paragraph
that introduces the canonical form, with no label. Reading level 1 (the probe) shows no such rejection exists;
the rule is stated there and recorded as unimplemented in S24 `:189` (`D5`). **Consequence:** the
current artefact can be made ambiguous by a value containing `;`, and the package has described it as
impossible since Session 15. The fix is a one-word label (`PROPOSED`) — but the *rule* (escape, reject, or
tagged values) is OD-COLL-04 Q4 and remains `OPEN`. **Resolution (Session 28):** the clause is now labelled
`PROPOSED` / **NOT IMPLEMENTED**, and what the committed probe actually validates is tabulated in decision
document §8.3.1. The rule itself is unchanged and still `OPEN`.

**C-01 — the suspected probe miscount, which does not exist.** An earlier working note recorded that the
OD-COLL-01/02 brief claims "executes 20 probes" while its table holds 23 rows. Checked this session: the brief
makes **no** count claim anywhere. §7.3 tabulates 23 rows — `E1`–`E13` (13), plus `E11b`, `E11c`, `E12b` (3),
plus `E17`–`E20` (4) = **20 insert/acceptance probes**, and `D1`–`D3` = **3 diagnostic queries** — and the
prose describes them without arithmetic. The only real observation is that the `E` numbering **skips `E14`–`E16`**
(probably rows renumbered while the brief was drafted), which could make a reader think rows were removed.
**Disposition:** the suspected defect is withdrawn (`SUPERSEDED`); the numbering gap is recorded, and no
document needs correcting. Any future citation should say "20 probes and 3 diagnostics" purely for clarity.

### 6.2 Resolution status (Session 28)

Four findings were reconciled by targeted documentation edits; none of the four touched a decision, a
measurement or an implementation:

| Finding | Resolved in | What was added |
|---|---|---|
| `C-02` | decision document §8.3 + new §8.3.1 (Revision 3) | the delimiter clause is labelled `PROPOSED` / **NOT IMPLEMENTED**; implemented validation, partial implementation (control characters, annotation path only) and remaining requirements are stated separately, `VERIFIED` against `collation-probe.sh` |
| `C-04` | decision document new §8.3.2 (Revision 3); OD-COLL-04 brief §2.1 | the six-fields / seven-values / eight-segments counting convention, counted directly from the measured CI value |
| `C-05` | OD-COLL-04 brief §8; OD-COLL-05 brief §4 | explicit statement that `EXACT_MATCH` means different things in the 13-outcome fingerprint vocabulary and the 33-classification drift vocabulary, plus five results that must not be substituted for one another |
| `C-06` | R2 §12.1; measurement proposal §5.3 (Revision 3) | three collation-bearing keys are not three uniqueness-sensitive rules; `ix_question_assets_checksum` is non-unique and needs no candidate collision analysis |

No other finding required a change. The historical statements named in the table above were relabelled,
never deleted, and each edited document carries a revision-history row naming the finding.

---

## 7. Production environment consistency

| Property | CI (level 3) | Production (level —) | Consistency check |
|---|---|---|---|
| PostgreSQL | `16.16 (Debian 16.16-1.pgdg13+1)`, Debian 13/trixie | `UNKNOWN` | every brief marks production as unknown; **no brief presents CI as production** |
| Encoding | `UTF8` | `UNKNOWN` | consistent |
| Provider | `libc` (raw `c`) | `UNKNOWN` | consistent |
| Locale | `en_US.utf8` / `en_US.utf8` | `UNKNOWN` | consistent |
| `daticulocale` | NULL | `UNKNOWN` | consistent |
| `datcollversion` | `2.41` | `UNKNOWN` | consistent; the "libc ⇒ NULL" generalisation is `SUPERSEDED` (§3.3) |
| Database identity | name assertion only (`current_database()`); `g3f_main`, `g3f_replay` | `UNKNOWN`; cluster identity not captured anywhere | consistent, and flagged identically in S24 and S25 |
| Cluster identity | **not captured** | not captured | consistent |
| Environment equivalence | CI↔production **NOT ESTABLISHED**; `en_US.utf8` vs `C.utf8` never compared | — | consistent in all six briefs and in File C |

**Verdict for area A: consistent.** The one residual risk is stylistic: three briefs quote the CI fingerprint
verbatim, and a reader skimming could mistake it for "the" profile. Each is followed by an explicit boundary
paragraph (`S22 §3`, `S24 §4`, `S25 §3.3`), so the label is present — it is the *prominence* that varies, not
the substance.

---

## 8. Fingerprint and drift-policy consistency (OD-COLL-04 ↔ OD-COLL-05)

### 8.1 What the probe emits, what 04 proposes, what 05 consumes

| Aspect | Probe (level 1) | OD-COLL-04 (level 6) | OD-COLL-05 (level 6) | Consistent? |
|---|---|---|---|---|
| Values | 7 (`pg`, `enc`, `provider`, `collate`, `ctype`, `iculocale`, `collversion`) behind `v1` | same seven; extra fields optional/diagnostic | consumes whatever 04 approves | **yes**, with the `C-04` terminology risk |
| Canonical form | `;`-separated text, fixed order, no escaping | text retained as human summary; **canonical JSON proposed** | must not depend on the unapproved JSON | **yes** — 05 is written against measured values, and `:713` lists approving a JSON form as outside its scope |
| Database identity | asserted separately, never serialized | identity as a *bound assertion* proposed | `DATABASE_IDENTITY_MISMATCH` = BLOCK | **yes** |
| NULL semantics | `-` sentinel; collision possible | unresolved (`OPEN`, Q4) | `COLLATION_VERSION_UNKNOWN` = REVIEW_REQUIRED | **yes** — both leave it open |
| Comparison | **none exists** | comparison model proposed, not implemented | classification table proposed, not implemented | **yes** — both state "no comparison exists" |
| Provider domain | `c`/`i`/`b` mapped; `d` handled inconsistently (profile says `database_default`, string says `unknown`) | flagged as unresolved | `UNSUPPORTED_PROVIDER` = BLOCK | **yes** — the inconsistency is recorded in both |

### 8.2 The classification-vocabulary overlap (`C-05`)

Both briefs define a vocabulary for "what kind of difference is this". They are not the same vocabulary, and
three names overlap:

| Name | In OD-COLL-04 (§8) | In OD-COLL-05 (§4) | Reconciliation |
|---|---|---|---|
| `EXACT_MATCH` | all fingerprint **fields** equal | all **applicable expectations** verified, no BLOCK | 05's definition governs a verdict; 04's governs the environment artefact |
| `EXPECTED_ENVIRONMENT_CHANGE` | difference matches an allow-list entry | PASS, only on that entry | identical |
| `COLLATION_VERSION_UNKNOWN` | review-required + warning | REVIEW_REQUIRED + warning line | identical |

**No contradiction, but a documented risk:** the package now has 13 + 33 classifications with overlapping names.
Recommendation: OD-COLL-05's table is the only one that may produce a deployment verdict, and OD-COLL-04's
table should be read as "difference classes for the environment artefact only" — a sentence that already exists
in S24 §8 but not in S25 §4.

### 8.3 The drift policy's own invariants, checked

| Invariant required by the audit request | Where stated | Holds? |
|---|---|---|
| `REVIEW_REQUIRED` also halts deployment | S25 §5.1 ("deployment must stop until evidence is reviewed") | **yes** |
| UNKNOWN is never silently converted to PASS | S25 P2, §10 row 15 | **yes** |
| BLOCK is never downgraded by a PASS | S25 P1 | **yes** |
| No automatic re-pin | S25 P7, decision doc §9.4 | **yes** |
| Structural mismatch always blocks | S25 §4.4, §8.1 | **yes** |
| Environment change is never auto-accepted | S25 §6.1, §10 | **yes** |
| Owner approval separated from policy adoption | S25 §11.5, §15 | **yes** |

---

## 9. Existing-data validation consistency (OD-COLL-06)

| Point | Sources | Consistent? |
|---|---|---|
| The rule "no uniqueness change without a reviewed read-only report" | decision doc §10.1; S26 §2.1 | **yes** |
| Five-stage separation (discovery → review → approval → remediation → index) | decision doc §10.6; S23 §9.2; S26 §2.2 (six stages, splitting deployment) | **yes** — S26 adds the sixth (deployment) without changing the first five |
| Query sketches exist in prose | decision doc §10.2–§10.4 | **yes**, and they are `PROPOSED` and `NOT TESTED` everywhere they appear |
| No executable audit tooling exists | S26 §3.5 | **yes** — verified this session (no duplicate-detection SQL in any script) |
| Collision ≠ instruction to merge | decision doc §10.7; S23 §10; S26 §10.3 | **yes** |
| Remediation hazards (PK collision, cascade, attribution) | decision doc §10.5 (schema reading); S23 §5.4/§6.4 (measured E11/E11c/E12b); S26 §10.2 | **yes**, and the measured version is cited over the schema-reading version |
| Zero collisions ≠ compatibility | S26 §9 rule 1 | **yes**, unique to S26 and not contradicted anywhere |
| Successful audit ≠ permission to create an index | S26 §11.3 | **yes** |

**One nuance that is *not* a contradiction but deserves recording (`C-14` variant):** S26 §1 says "no
existing-data validation capability exists", while the decision doc contains SQL sketches. Both are true of
different things — *no executable artifact* vs *prose recipes*. A reader who searches the repository for the
sketches will not find a script. Recommend the phrase "no executable capability; prose recipes only".

---

## 10. Tags and colleges decision separation (OD-COLL-01 vs OD-COLL-02)

| Check required by the request | Finding |
|---|---|
| Are the two decisions presented independently? | **yes** — S23 §2.2 separates them by six dimensions and states in terms that "a single answer for both entities is not assumed anywhere in this brief"; the register has two rows; §12 has two tables |
| Do they have *different business implications*? | **yes** — tags: open vocabulary, M2M links, merge loses an association but not the question; colleges: curated, **sole** identity rule, merge can split provenance and is blocked by `ON DELETE RESTRICT` and `uq_question_sources_identity` |
| Does the evidence support each recommendation? | **both recommendations are procedural only** (no policy selected). The evidence base is the same two index definitions plus 20 local probes; it is thinner for colleges in one respect — colleges have **no second key**, so the same evidence supports a *stronger* caution, not a stronger recommendation |
| Is the colleges' sole-rule risk correctly characterised? | **yes** — `uq_colleges_name_lower` is described as the entity's only uniqueness rule in S23 §6.1, S22 §12 row, guard design `:213`, and File C. The asymmetry (`C-13`) is a business-stakes statement, not a technical one |
| Is `colleges.code` presented as an approved identity alternative? | **no** — S23 §6.1/§6.5/§8.4 call it "nullable, non-unique, unread by any code", "a candidate, not a key", and Option D lists making it an identity key as an **option requiring a decision**; S26 §10.3 prohibits treating it as one. Consistent with the DDL (`code TEXT`, no unique constraint) |
| Is application behaviour inferred without evidence? | **no** — S23 §5.2/§6.2 state that no write path, slug generator or college editor exists, and this was re-verified in Session 26 (`app/` contains placeholders, no route handlers; no `prisma.tag.*` anywhere) |

**Verdict for area E: consistent, and the two decisions are genuinely distinct.** The only asymmetry worth
noting is evidential: OD-COLL-02 has *less* usable evidence than OD-COLL-01 (no second key, no location field,
no code uniqueness), so its caveat is heavier (§13.2).

---

## 11. Six-index validation scope

Three statements that must not be conflated, all `VERIFIED`:

| Statement | Count | Source |
|---|---|---|
| hand-written indexes in PART C | **6** | `migration.sql:613–648` |
| keys carrying the database-default collation (`indcollation = 100`) | **3** (`uq_tags_name_lower`, `uq_colleges_name_lower`, `ix_question_assets_checksum`) | R2 §12.1; guard design §3.4 |
| indexes with **collation-sensitive uniqueness** | **2** | S22 §5.2 (tier 1); S26 §4.2 |

| Check | Finding |
|---|---|
| Does any document require a Unicode collision scan for all six? | **no**. S26 §4.3 explicitly rejects it, and S22 §5.2 rejects the opposite over-claim ("the collation profile governs the six indexes") |
| Does any document under-state the collation-bearing third index? | **no** — `ix_question_assets_checksum` is described as non-unique with ordering-only exposure (S22 §5.2 tier 2; S26 §4.1) |
| Are the three collation-free indexes still given a validation requirement? | **yes** — as *structural* checks (predicate, NND, key order, opclass), in S26 §4.3 and S25 §8.1 |
| Is the inventory definition itself consistent? | **yes** — partial OR expression OR NULLS NOT DISTINCT on six tables (guard design §7.1), which is exactly the six |

**Verdict for area F: consistent.** The residual risk is that the number **three** (collated keys) and the
number **two** (uniqueness-sensitive) appear in different documents without a shared sentence; `C-06` records
the recommended cross-reference.

---

## 12. Dependency graph

### 12.1 The graph

```text
                     ┌──────────────────────────┐
   business intent → │ OD-COLL-01 (tags)        │──┐
                     │ OD-COLL-02 (colleges)    │──┤ candidate key
                     └──────────────────────────┘  │
                                                   ▼
   ┌──────────────────────────┐   values   ┌──────────────────────────┐
   │ OD-COLL-03 (profile)     │───────────▶│ OD-COLL-05 (drift policy)│
   │                          │            │                          │
   │        ◀── mutual ──▶    │            └───────────┬──────────────┘
   │ OD-COLL-04 (fingerprint) │                        │ implementation
   └───────────┬──────────────┘                        ▼
               │ artefact                     ┌──────────────────────────┐
               └─────────────────────────────▶│ future index guard       │
                                              └──────────────────────────┘

   ┌──────────────────────────┐   candidate (01/02) + environment (03/04)
   │ OD-COLL-06 (audit)       │◀──────────────────────────────────────────
   └───────────┬──────────────┘
               │ hard prerequisite
               ▼
       any uniqueness-index replacement
```

### 12.2 Every edge, typed

| Edge | Type | Why | Evidence |
|---|---|---|---|
| **01 → 06** | **hard prerequisite** (for Q2/Q7) | the audit cannot be written without a candidate key | S26 §13.1 |
| **02 → 06** | **hard prerequisite** (for Q2/Q7) | same | S26 §13.1 |
| **03 → 04** | **mutually dependent**, not one-way | 03 supplies values; 04 supplies the field set that makes "a profile" expressible | S24 §11 ("mutually dependent") |
| **03 → 05** | **policy dependency** for the value-dependent rows; *not* for the fail-closed core | severity of "locale changed" presupposes an approved locale | S25 §12.1 |
| **03 → 06** | **evidence dependency** | the audit must target an approved environment; `default`'s meaning is the environment's | S26 §13.1 |
| **04 → 05** | **hard prerequisite** for the artefact and its classification grammar; *not* for the severity model | 05 classifies 04's artefact | S25 §12.1 |
| **04 → 06** | **evidence dependency** | the audit report must record the environment fields 04 defines | S26 §7.2 |
| **05 → future guard** | **implementation dependency** | a policy with no implementation is a note, not a control | S25 §1 |
| **06 → any index replacement** | **hard prerequisite** | data must satisfy the candidate rule before the index can exist | S26 §11.1 |
| **01 ↔ 02** | **related but independently decidable** | different entities, different stakes; no evidence that one answer fixes the other | S23 §2.2 |
| **01/02 ↔ 03/04** | **independent** | business identity vs environment representation | S23 §2.3; S25 §12.3 |
| **B1b / B2 ↔ all six** | **outside the graph** | authorisation, not design; no OD-COLL decision touches them | File C §12; `database-migrations.md:23–43` |

### 12.3 Parallel groups (not a linear sequence)

| Group | Decisions | Can proceed without the others? |
|---|---|---|
| **P1 — business identity** | 01, 02 | **yes** — needs no environment, no fingerprint, no production data |
| **P2 — representation** | 04 (layering, field set, canonical form) and 05's fail-closed core | **yes** — design choices, not environment values |
| **P3 — environment** | 03 (target profile) | **yes** for a *prospective* choice; needs P2's field set to be expressible |
| **P4 — classification tables** | 05's full table | **no** — needs P3 values and P2 artefact |
| **P5 — data readiness** | 06's Q1–Q3, Q7 | **no** — needs P1's candidates and P3's target |

**No linear approval chain is supported by the evidence.** The dependencies are real but they cluster into
independent tracks; inventing a sequence like "01 → 02 → 03 → 04 → 05 → 06" would impose an order the evidence
does not require.

---

## 13. Owner review readiness

**This is a readiness classification only. None of the six is approved.**

### 13.1 Summary

| Decision | Classification | Depends on another OD-COLL? |
|---|---|---|
| **OD-COLL-01** | **READY WITH EXPLICIT CAVEATS** | no (it feeds 06) |
| **OD-COLL-02** | **READY WITH EXPLICIT CAVEATS** (heavier caveat) | no (it feeds 06) |
| **OD-COLL-03** | **READY WITH EXPLICIT CAVEATS** (prospective choice only) | mutual with 04 |
| **OD-COLL-04** | **READY WITH EXPLICIT CAVEATS** | mutual with 03 |
| **OD-COLL-05** | **NOT READY — EVIDENCE REQUIRED** (full table); its fail-closed core is ready | **yes** — 03 and 04 |
| **OD-COLL-06** | **READY WITH EXPLICIT CAVEATS** (process core; Q1–Q3, Q7 blocked) | **yes** for those questions — 01/02 |

### 13.2 Per-decision detail

| Decision | What the owner can decide now | What remains unknown | What would be unsafe to decide | Experiment still required? |
|---|---|---|---|---|
| **01** | which equality relation tags *should* have (exact / `lower()` / explicit fold / key-based), as a product rule | any data: volumes, colliding pairs, whether the editor will be free-text; whether `slug` is meant as identity | adopting a fold whose collisions are unmeasured — the row set to remediate is unknown | no for the *policy*; yes later for the audit (06) |
| **02** | the same, plus whether a name is a display label or an identity key | whether two real institutions can share a name; whether a code list exists; `code` population | anything that assumes `code` is a key, or that assumes no same-name institutions exist | no for the *policy*; **yes** (domain input) for the same-name question |
| **03** | a **target** profile for a future production database, with its evidence standard | whether a production database exists, and its current profile; ICU behaviour; `en_US.utf8` vs `C.utf8` | certifying an *existing* production database's profile — it has never been measured | **yes**, if any statement about a live environment is required |
| **04** | the layer separation, the mandatory/diagnostic split, the canonical form, the identity rule | ICU field semantics; the `d` provider's domain; cluster-identity evidence | declaring a format "implemented" or a comparison "approved" — none exists | no for the design; yes for ICU/`d` |
| **05** | the fail-closed core: measurement-first, `REVIEW_REQUIRED` halts, no auto re-pin, BLOCK precedence | the severity of each *value-dependent* difference (needs 03), the artefact grammar (needs 04) | finalising a field-by-field table against unapproved values | no for the core; the table is blocked, not unmeasured |
| **06** | audit scope by semantic dependence, report fields, snapshot rules, gates, remediation prohibition | candidate keys (needs 01/02); target environment (03); volumes, replica availability, retention (OD-20) | approving an audit run, or treating an audit as permission to remediate | no for the *specification*; yes for any actual audit |

---

## 14. Consolidated unresolved evidence register

Twenty-one items. Eleven are package-level structural unknowns (U-01…U-11, matching the limitations the request
requires preserving); ten are decision-specific (U-12…U-21). Duplicates across briefs are merged; questions that
*look* similar but belong to different decisions are kept separate and cross-referenced.

| ID | Decision | Question | Why it matters | Existing evidence | Missing / how to obtain | Prod access needed? | Owner judgment? | Blocks implementation? |
|---|---|---|---|---|---|---|---|---|
| **U-01** | 03, 04, 05, 06 | What is production's provider, locale, `datcollversion`, and major? | every environment rule compares to it | none — **`UNKNOWN`** | measure the intended database | **yes** (or owner creates it) | no | yes |
| **U-02** | 03, 04 | Are CI and production semantically equivalent? | CI evidence is used to justify rules | **not established** | cross-environment behavioural tests | yes | no | yes (for equivalence claims) |
| **U-03** | 03, 06 | Does `en_US.utf8` fold like `C.utf8`? | CI is `en_US.utf8`; every local probe is `C.utf8` | never compared | install `en_US.utf8` and re-run probes | no | no | no (but blocks confidence) |
| **U-04** | 03, 04, 05, 06 | How does ICU behave (fields, folding, determinism)? | ICU is an OD-COLL-03 option and an OD-COLL-04 field set | `NOT TESTED` (no ICU available) | ICU-enabled build | no | no | yes for ICU options |
| **U-05** | all | Do PG 15/17/18 behave identically? | catalog and folding are version-dependent | only 16.2/16.16 measured | other majors | no | no | yes for support claims |
| **U-06** | 05 | Is there a committed structural index guard? | 05's structural classes have no detector | **no** — prototype only (25 cases) | implement (not authorised) | no | yes | yes |
| **U-07** | 04, 05 | Is there an approved fingerprint comparison? | drift cannot be detected without one | **no** — annotations read by humans | OD-COLL-04 then implementation | no | yes | yes |
| **U-08** | 06 | Is there any collision-audit capability? | 06's whole subject | **no executable artifact** | implement + authorise a read | owner | yes | yes |
| **U-09** | 06 | Has production data ever been scanned? | all data claims are hypothetical | **no** | a scoped, authorised audit | **yes** | yes | yes |
| **U-10** | 04, 06 | What retention/access policy governs audit artefacts? | reports contain row values | **OD-20 OPEN** | OD-20 decision | no | yes | partially |
| **U-11** | 05, 06 | Is production operationally ready (runbook, RTO/RPO, monitoring)? | recovery claims depend on it | File C §10: no runbook, RTO unmeasured; **OD-22 OPEN** | OD-22 + drills | partially | yes | yes for deployment |
| **U-12** | 01 | What does "same tag" mean to the product? | the decision itself | none recorded | owner statement | no | **yes** | yes |
| **U-13** | 01 | Is `slug` intended as the tag's permanent identity? | Option D depends on it | `slug` unique + format-checked; no generator | owner + OD-18 | no | **yes** | yes for Option D |
| **U-14** | 01 | Will tags be free text or a controlled list? | determines collision pressure | **`UNKNOWN`** — no editor exists | product decision | no | **yes** | no |
| **U-15** | 02 | Can two genuinely distinct colleges share a name? | the decisive question | none | owner/domain statement | no | **yes** | yes |
| **U-16** | 02 | If yes, what distinguishes them? | no location field exists | schema has none | owner + a schema decision | no | **yes** | yes |
| **U-17** | 02, 06 | Is `code` meant to be an identifier, and is a code list available? | Option D's feasibility | nullable, non-unique, unread; seeded in dev data only | owner/ops | no | **yes** | yes for Option D |
| **U-18** | 05 | Is a missing approved expectation a pass or a block? | decides whether today's runs are informational | none | owner | no | **yes** | yes |
| **U-19** | 05 | What is the provider domain, and is `unknown` fatal? | `d` is handled inconsistently | probe source; three docs agree `unknown` must fail | OD-COLL-04 + owner | no | **yes** | yes |
| **U-20** | 05 | What is the allow-list mechanism for an expected change? | without one, every change is a defect | none | owner + ops | no | **yes** | yes |
| **U-21** | 06 | What volumes/duration must an audit tolerate, and is a read replica available? | determines the snapshot strategy | **`UNKNOWN`** | operations input | partially | **yes** | yes |

**The eleven mandated limitations are all present and labelled:** production profile `UNKNOWN` (U-01) ·
CI↔production equivalence not established (U-02) · `en_US.utf8` vs `C.utf8` never compared (U-03) · ICU
`NOT TESTED` (U-04) · PG 15/17/18 `NOT TESTED` (U-05) · no committed structural index guard (U-06) · no
approved fingerprint comparison (U-07) · no collision-audit capability (U-08) · no production data scan (U-09) ·
OD-20 retention/access `OPEN` (U-10) · OD-22 operational readiness `OPEN` (U-11, supported by File C §10 row 10).

---

## 15. Authorization boundaries

### 15.1 The five stages, kept separate

| # | Stage | Authorised by | Status |
|---|---|---|---|
| 1 | **measurement** | the measurement authorisations recorded in Session 17 | done in CI (T1 `CLOSED`) |
| 2 | **evidence review** | a named reviewer | not an approval |
| 3 | **owner policy approval** | the owner, in writing | **all six `OPEN`** |
| 4 | **implementation authorisation** | the owner, separately | **not given** |
| 5 | **production deployment authorisation** | **B2**, with **B1b** | **WITHHELD / NOT APPROVED** |

Approving any of OD-COLL-01…06 would authorise **none** of stages 4 or 5, and would not modify B1b or B2.

### 15.2 The status register, reproduced exactly

| Item | Status |
|---|---|
| G-1 | **FAILED** |
| G-3 | **PASSED** |
| Option C | **APPROVED — controlled migration workflow only** |
| B1a | **APPROVED, workflow-scoped** |
| B1b | **NOT APPROVED** |
| B1c | **NOT APPROVED** |
| B2 | **WITHHELD** |
| Migration 0001 | **NOT AUTHORIZED for production** |
| Migration 0002 | **DO NOT COMMIT** |
| G-2 | **DEFERRED** |
| T1 | **CLOSED** |
| R2 | **PARTIALLY RESOLVED** |
| OD-COLL-01 … OD-COLL-06 | **OPEN** |
| OD-17 / OD-20 / OD-21 / OD-22 / OD-NM-1 | **OPEN** |

**Verified against File C §10–§13 and `database-migrations.md:23–43`:** no document in the package contradicts
any row above. Two caveats: the B2 *definitional overlap* recorded as C-DEF-1 is a register defect that "only the
owner can consolidate", and OD-22's scope (capacity, SLOs, observability, RPO/RTO, recovery, rollback) is the
authoritative home for U-11.

---

## 16. Proposed owner review sequence

### 16.1 Three sequences, with trade-offs

| Option | Order | Advantages | Costs / risks |
|---|---|---|---|
| **A — parallel tracks (recommended)** | P1 (01, 02) and P2 (04's layering, 05's fail-closed core) in parallel → P3 (03, informed by 04's fields) → P4 (05's table) → P5 (06's candidate questions) → audit only after 06 + a read authorisation | matches the real dependency graph; unblocks four decisions without production access; keeps business identity independent of environment choices | two tracks need two review slots; 03 must be revisited after 04's final form |
| **B — environment first** | 03 → 04 → 05 → 01/02 → 06 | one coherent environment contract before anything else | delays the two business decisions that need *no* environment evidence; 03 cannot be validated against a live production anyway |
| **C — business first** | 01/02 → 06 scope → data audit → 03 → 04 → 05 | data evidence informs the fold choice | the audit's environment may change after it runs (03 undecided), invalidating the report (`S26 §8`) |

**No option is uniquely supported.** A is recommended because it is the only one whose edges match §12.2
exactly; B and C impose an ordering the dependencies do not require.

### 16.2 What requires owner judgment rather than another experiment

| Requires judgment | Requires an experiment first |
|---|---|
| U-12/U-14 (what "same tag" means; controlled list vs free text) | U-03 (`en_US.utf8` vs `C.utf8`) |
| U-15/U-16 (can two colleges share a name; what distinguishes them) | U-04 (ICU) |
| U-17 (`code` as identifier) | U-05 (other majors) |
| U-18 (missing expectation: pass or block) | any future audit (U-08/U-09) |
| U-19/U-20 (provider domain; allow-list mechanism) | — |
| U-10/U-11 (retention; operational readiness — via OD-20/OD-22) | — |

### 16.3 Decisions that can be approved conditionally, and ones that cannot

| Decision | Conditional approval possible? | Condition |
|---|---|---|
| 01, 02 | **yes** — approve the *policy*, conditional on an audit before any index change | 06's audit gates the implementation |
| 03 | **yes** — approve a *target* profile conditional on post-creation verification | the verification is a measurement, not a policy |
| 04 | **yes** — approve layering and canonical form conditional on the ICU/`d` domain being scoped as unsupported until tested | unsupported must fail closed |
| 05 | **only its fail-closed core**; the table cannot be conditionally approved because its inputs do not exist | 03 values, 04 artefact |
| 06 | **yes** — approve the process, conditional on candidate keys from 01/02 | Q1–Q3, Q7 wait |

**Decisions that should remain open until production information exists:** OD-COLL-05's classification table
(needs 03), and any part of 03 that would assert something about an *existing* production database. Everything
else can be reviewed on design evidence alone.

---

## 17. Recommendations

All `PROPOSED`; none approves anything.

1. **Review in the parallel tracks of Option A** and record two decisions (01, 02) separately even if the same
   policy is chosen.
2. **Label decision doc §8.3's delimiter clause `PROPOSED` before owner review** (`C-02`) — the only
   documentation defect found. It is not an owner decision: the *rule* is OD-COLL-04 Q4, and the *label* prevents
   a reviewer from believing an ambiguity is already impossible.
3. **Adopt one sentence for the index scope** and quote it everywhere: *six indexes; three collated keys; two
   collation-sensitive unique rules* (`C-06`).
4. **State explicitly, in OD-COLL-05, that its vocabulary governs deployment verdicts** and OD-COLL-04's governs
   the environment artefact (`C-05`).
5. **Record that five of six documents are untracked** (§4.3) so that a later reader does not mistake the
   working tree for the repository's state.
6. **Keep the eleven structural unknowns together** (U-01…U-11) as a standing register rather than re-deriving
   them in each session.
7. **Do not treat this audit as a review.** It classifies readiness; the owner reviews the briefs.

---

## 18. Explicit non-authorizations

This audit authorises **none** of the following:

- approving or closing OD-COLL-01, -02, -03, -04, -05 or -06;
- selecting a production locale, provider or PostgreSQL major;
- approving a fingerprint format, a comparison layer, or a drift classifier;
- implementing the structural index guard, the collision audit, or any deployment check;
- modifying `guard.py`, `collation-probe.sh`, `deploy-gate.sh`, `deploy-path-guard.py`, `repo-guard.sh`, any
  workflow, `package.json`, `prisma/schema.prisma`, migration 0001, or creating migration 0002;
- creating, replacing or dropping any index, or modifying any data;
- accessing production or staging, running any query, scan or destructive SQL;
- authorising **B1b**, **B1c** or **B2**, or migration 0001 for production;
- editing any of the six briefs or any historical document (this audit changed none of them);
- creating a PR, merging, deploying, committing or pushing.

**An audit of the package is not a review outcome, and readiness is not approval.**

---

## 19. Evidence references

### 19.1 Documents audited

All paths under `docs/database/` unless stated: the deployment decision package; the five OD-COLL briefs
(01-02, 03, 04, 05, 06); `phase-04a-database-collation-product-and-environment-decision.md` (§1, §4, §5–§6, §7,
§8.1–§8.7.1, §9.1–§9.4, §10.1–§10.7, §11, §12, §14.1); `phase-04a-index-integrity-guard-design.md` (§2.2, §3,
§6, §7.3–§7.5, §9.1–§9.5, §15, §17); `phase-04a-index-collation-r2-investigation.md` (§10.6, §12.1–§12.4);
`phase-04a-ci-collation-profile-measurement-proposal.md` (§5.1–§5.3, §6.2–§6.4, §8.1–§8.6, §12.1–§12.3,
§17.4); `phase-04a-real-18-table-prisma-drift-investigation.md`; `phase-04a-b2-production-migration-decision-review.md`;
`docs/development/database-migrations.md` (`:20–45`).

### 19.2 Runtime artifacts verified for this audit

| Artifact | Used to check |
|---|---|
| `prisma/migrations/0001_phase04a_question_bank/migration.sql` | PART C `:613–648` (six indexes); `tags` `:214–221`; `colleges` `:247–256`; PK `:229`; FKs `:447`, `:456`; CHECK `:608–609` |
| `prisma/schema.prisma` | comments `:26–30`; no `@@unique` for any of the six; `College.code` nullable |
| `docs/database/g1-spike/option-c/guard.py` | 279 lines; three modes; **no index or collation awareness** (U-06) |
| `docs/database/g1-spike/option-c/g3-full/collation-probe.sh` | 468 lines; `FINGERPRINT_SQL` `:149–164`; no delimiter validation (`C-02`); prefix-only check `:380–384` (`C-12`) |
| `docs/database/g1-spike/option-c/g3-full/enforce.sql` | cases 30–32 at `:632–682`, ASCII-only |
| `scripts/db/*`, `.github/workflows/phase04a-g3-full-schema-gate.yml` | the implemented controls named in §4.2 |
| repository-wide search for duplicate/collision SQL | **none found** (U-08) |

### 19.3 Evidence cited from prior sessions (not re-executed)

| Item | Reference |
|---|---|
| CI collation profile | run `45546248909`, check run `138976563830`, commit `0aae1368a16cf6447cb7a01afc7554a9fdab4bc0` |
| G-1 drift | run `45381634139` — 5 `DROP CONSTRAINT` + 1 `DROP INDEX`, none executed |
| G-3 | `PASSED`; runs `45273840004` and newer equivalent runs (`45372731345`) |
| V-1…V-5 | run `45372731513` (three jobs, success); application-side `45381634112` |
| Local probes | Session 23 disposable PostgreSQL 16.2, `C.utf8`, destroyed — **local only** |
| Index matrix | guard design §9, disposable PostgreSQL 16.2, prototype only |

---

## 20. Revision history

| Revision | Date | Change |
|---|---|---|
| 2 | 2026-11-24 | **Resolution record (Session 28).** `C-02`, `C-04`, `C-05` and `C-06` were reconciled by targeted documentation edits to four documents (decision document §8.3/§8.3.1/§8.3.2, OD-COLL-04 brief §2.1/§8, OD-COLL-05 brief §4, R2 §12.1, measurement proposal §5.3) — see §6.2. No decision, status, measurement, code, schema, migration, workflow or data changed. Every OD-COLL decision remains `OPEN`. |
| 1 | 2026-11-24 | Initial consolidation and consistency audit. Establishes a seven-level evidence hierarchy and the label set including `SUPERSEDED`; inventories thirteen sources plus runtime artifacts and records that five of six key documents are untracked; builds the six-decision matrix; registers fourteen findings — one documentation defect (`C-02`), three terminology recommendations, and ten resolved claims or non-conflicts, including one suspected defect that was tested and withdrawn (`C-01`); verifies the production-environment, fingerprint/drift, existing-data, tags/colleges and six-index areas; types every dependency edge and shows the graph is clustered rather than linear; classifies readiness (five READY WITH EXPLICIT CAVEATS, one NOT READY for its full table); consolidates twenty-one unresolved items including the eleven mandated limitations; reproduces the authorization register and five stages; proposes three review sequences with trade-offs and recommends the parallel one. **No document was edited; nothing approved, closed, implemented or deployed; nothing committed or pushed.** |

**Standing decisions preserved exactly, unchanged by this document:** G-1 **FAILED** · G-3 **PASSED** ·
Option C **APPROVED — controlled migration workflow only** · B1a **APPROVED (workflow-scoped)** · B1b **NOT
APPROVED** · B1c **NOT APPROVED** · B2 **WITHHELD** · migration 0001 **NOT AUTHORIZED for production
deployment** · migration 0002 **DO NOT COMMIT** · G-2 **DEFERRED** · **T1 CLOSED** · **R2 PARTIALLY RESOLVED** ·
OD-COLL-01…06 **OPEN** · OD-17 / OD-20 / OD-21 / OD-22 / OD-NM-1 **OPEN**. CI profile **OBSERVED**; production
profile **UNKNOWN**; production locale **NOT DECIDED**; CI↔production equivalence **NOT ESTABLISHED**.

**The package is coherent, its evidence is layered, and its decisions are unowned. Nothing here is approved.**
