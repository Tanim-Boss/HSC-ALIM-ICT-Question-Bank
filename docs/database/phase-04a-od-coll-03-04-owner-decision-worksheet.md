# Phase 04A — OD-COLL-03 / OD-COLL-04 Owner Decision Worksheet

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD when written:** `4d04e4461338ea5931d26faf67d312fbed21de43`
**Purpose:** to make two owner questions answerable — **OD-COLL-03 (production collation profile)** and
**OD-COLL-04 (collation fingerprint specification)** — together, without inventing production facts, without
selecting an environment, and without treating a proposal as implemented.
**Nature:** decision preparation only. No option is selected, no default is pre-selected, no status changes, and
both decision records in §11 are intentionally blank.

Primary sources: `phase-04a-od-coll-03-production-collation-profile-decision-brief.md` (630 lines) and
`phase-04a-od-coll-04-collation-fingerprint-specification-decision-brief.md` (767 lines). Supporting sources:
the OD-COLL-01/02 worksheet, the Session 29 owner-review handoff, the Session 27 consolidation audit, the
deployment decision package (File C), the authoritative register in the product-and-environment decision
document, the CI measurement proposal, the R2 investigation, and the committed probe.

Labels used for individual claims: `VERIFIED` · `OBSERVED` · `DERIVED` · `PROPOSED` · `UNKNOWN` ·
`NOT TESTED` · `SUPERSEDED` · `OPEN`. The five evidence **categories** of §2.2 are used for every item that
could otherwise be over-read.

---

## 1. Executive summary

### **WORKSHEET PREPARED — TWO QUESTIONS, ONE SHARED ARTEFACT, NO OPTION SELECTED — OD-COLL-03/04 `OPEN`**

Eight findings:

1. **The two decisions are separable even though they share an artefact.** OD-COLL-03 selects *which
   environment* production should have and by what evidence it is confirmed; OD-COLL-04 defines *how an
   environment is recorded and compared*. Neither answer determines the other, but each constrains the other in
   one specific place (§9).
2. **OD-COLL-03's honest content today is a target and an evidence standard, not a fact about production.**
   Production has never been measured: its major, provider, locale, collation version, encoding and even which
   database the application will use are all `UNKNOWN` (S22 §4.3).
3. **OD-COLL-04 decomposes into eight decision elements**, of which only **two** are genuinely blocked by
   OD-COLL-03 (which fields are mandatory depends on the provider; what `icu`/`builtin`/`d` mean depends on
   what is supported). Layering, identity-as-assertion, the mandatory-field set and the versioning rule can be
   answered without an environment (§7).
4. **A fingerprint match proves environment-property equality and nothing else.** It is not proof of
   per-index collation correctness, of structural integrity, of behavioural compatibility, or of deployment
   eligibility. The package now states this in both briefs (§8.6; S24 §8; S25 §4).
5. **The Session 28 corrections hold, re-verified against the committed probe:** six catalog fields, seven
   `key=value` values (including `pg` major), eight `;`-separated segments; database identity asserted
   separately and never serialized; cluster identity not captured; per-index metadata in a second document;
   delimiter validation **not implemented**; the `-` sentinel ambiguous; `provider=unknown` **not** rejected;
   and the `d` provider handled differently by the profile and the fingerprint (§8.3).
6. **No comparison exists.** There is no expectation file, no comparison layer and no drift classifier; the
   probe measures and publishes, and exits non-zero only on measurement-integrity failures (missing catalog
   field, missing index, malformed output). Any "exact match" today is a human reading two strings (§8.8).
7. **Option labels must be quoted in full.** "Option C" is the approved controlled migration workflow
   everywhere else in this package, and is *also* the ICU-profile option inside OD-COLL-03. This worksheet
   prefixes every option with its decision ID and uses the brief's own title (§4, §7).
8. **Nothing is implementable from an answer today.** Migration 0002 is `DO NOT COMMIT`; the probe is
   measurement-only; no profile can be enforced because no guard exists; and no production access is
   authorised. An answer records policy and authorises nothing (§12).

---

## 2. Scope and evidence boundary

### 2.1 Documents used

| Document | Lines | Content hash (SHA-256, first 16) | Role |
|---|---|---|---|
| `phase-04a-od-coll-03-production-collation-profile-decision-brief.md` | 630 | `eed8897c9fa8d0fc` | OD-COLL-03 primary source |
| `phase-04a-od-coll-04-collation-fingerprint-specification-decision-brief.md` | 767 | `7c1707fd5d3b0f27` | OD-COLL-04 primary source |
| `phase-04a-od-coll-01-02-owner-decision-worksheet.md` | 504 | `35ed3d5e285b0f0e` | sibling worksheet (format, method) |
| `phase-04a-owner-review-readiness-and-decision-handoff.md` | 661 | `38decec31a9d3193` | readiness classification, evidence register |
| `phase-04a-collation-decision-package-consolidation-audit.md` | 696 | `7d8af8f9962c2081` | consistency findings, Session 28 record |
| `phase-04a-final-database-deployment-decision-package.md` | 957 | `dc03e1a44a768361` | deployment boundaries, §10 readiness |
| `phase-04a-database-collation-product-and-environment-decision.md` | 1104 | `50005a91cb883bad` | authoritative register; §8.3.1/§8.3.2 |
| `phase-04a-ci-collation-profile-measurement-proposal.md` | 1039+ | `349607f894780032` | T1 measurement and its completion record |

Implementation evidence consulted: `docs/database/g1-spike/option-c/g3-full/collation-probe.sh` (468 lines),
`prisma/migrations/0001_phase04a_question_bank/migration.sql` (PART C `:613–648`), `prisma/schema.prisma`,
`docs/database/g1-spike/option-c/guard.py`, `scripts/db/*`, `.github/workflows/*`. Nothing was executed.

### 2.2 The five evidence categories, applied

| Category | Meaning in this worksheet | Contents here |
|---|---|---|
| **Demonstrated** | verified directly in the repository or in recorded CI evidence | the six index definitions; the probe's SQL and helpers; `IDENTITY_SQL` asserting `current_database()`; the CI profile (`16.16`, UTF8, `libc`, `en_US.utf8`, `daticulocale` NULL, `datcollversion` `2.41`); the CI fingerprint string; G-3 `PASSED`; G-1 `FAILED` |
| **Locally observed** | measured only in disposable PostgreSQL environments | `C.utf8` folding matrix (E1–E9, E17–E20); `real_c` versus `real_u`; local `datcollversion` NULL on 16.2; the 25-case structural matrix |
| **Specified** | documented proposal, not implemented | the canonical-JSON artefact; delimiter/sentinel rules; the provider domain incl. `d`; the 13 outcomes; the expectation file and comparison layer; the structural index guard; the audit process; the seven read-only checks |
| **Not tested** | no supporting measurement exists | ICU behaviour; PostgreSQL 15/17/18; `builtin` provider; `en_US.utf8` versus `C.utf8` direct comparison; non-deterministic collations; the `d` provider's actual appearance |
| **Unknown** | requires production or external evidence | production profile, locale, major, encoding, collation version; which database the app will use; data volumes; whether a production database even exists |

### 2.3 Boundary statements preserved exactly

- CI profile is **`OBSERVED`** — one image, one run, one commit.
- Production profile is **`UNKNOWN`**; production locale is **`NOT DECIDED`**.
- CI-to-production equivalence is **`NOT ESTABLISHED`**.
- ICU and PostgreSQL 15/17/18 remain **`NOT TESTED`**; no new repository evidence contradicts this.
- **CI is not the production target.** PostgreSQL `16.16` on Debian 13 with `en_US.utf8` is what one CI image
  produced; nothing follows from it about any other environment.
- No production configuration is invented anywhere in this worksheet.

### 2.4 What this worksheet is not

It is not a profile selection, not a fingerprint approval, not a comparison design, not an implementation plan,
and not a statement that any environment currently matches any other. It is an analysis of two open questions.

---

## 3. OD-COLL-03 — the question

### 3.1 The exact question

> **What is the approved production collation profile** — the database-level properties that decide how text
> compares — and **what evidence is required before that value is selected and confirmed?**

The register records the options as *libc `C` · libc `C.utf8` (or another specific locale) · ICU with an
explicit locale · no pin* (decision document §12). The brief reframes the fourth as deferral (S22 §8.4),
because "no pin" is not a profile but an absence of one.

### 3.2 What "profile" means, precisely

A profile is **not a locale name**. It is the set of properties that together decide equality of text:

| Layer | Property | Why it belongs to the profile |
|---|---|---|
| server | PostgreSQL major | catalog shape, provider support (`builtin` is 17+), which `lower()` implementation is called |
| database | encoding | byte semantics of every fold and comparison |
| database | collation provider (`datlocprovider`) | who implements `lower()` and `=` |
| database | `datcollate`, `datctype` (libc) or `daticulocale` (ICU) | with libc these **are** the rule; case conversion follows `datctype` |
| database | `datcollversion` | the only catalog signal that the underlying library changed — and only where the build exposes it |
| index | per-key collation and operator class for the protected indexes | three keys resolve to `database_default`; that resolution *is* the profile's reach (R2 §12.1) |

### 3.3 The ten questions, with what the evidence can and cannot answer

| # | Question | Recorded answer | Category |
|---|---|---|---|
| 1 | What exactly is the profile? | the six-layer set above; it cannot be expressed in a migration, so it is attached at database creation and can only be *recorded* afterwards | `DERIVED` from DDL + catalog |
| 2 | Which attributes must be captured? | the nine mandatory facts of S22 §4.1: major, encoding, provider, `datcollate`/`datctype`, `daticulocale`, `datcollversion`, per-index collation/opclass, determinism of every collation in use, and which database the application targets | `PROPOSED` (specification), facts `UNKNOWN` |
| 3 | What is known from CI? | `16.16` / `16.16-1.pgdg13+1`, UTF8, `libc`, `en_US.utf8`/`en_US.utf8`, `daticulocale` NULL, `datcollversion` `2.41`; `g3f_main` and `g3f_replay` fingerprints byte-identical; run `45546248909`, check run `138976563830`, commit `0aae1368…` | **Demonstrated** |
| 4 | What is known only locally? | `C.utf8` folding behaviour (E1–E9, E17–E20); `real_c` accepts `Ärger`+`ärger` while `real_u` rejects the second; `datcollversion` NULL on the local 16.2 build; the 25-case structural matrix | **Locally observed** |
| 5 | What remains unknown about production? | major, provider, locale, collation version, encoding, target database, whether any protected index exists there, and whether a production database exists at all | **Unknown** |
| 6 | What evidence is needed before selecting a target? | the §4.1 fact set from the intended database; the §7.3 seven read-only checks on a snapshot; a reviewed statement of which option the evidence supports; an owner decision; and — for anything beyond retention — a rebuild plan | **Specified**, not executed |
| 7 | Documented options and trade-offs | four: retain the measured default · pin a named libc locale · pin an ICU profile · defer | see §4 |
| 8 | Upgrade implications | see §4.5 — PG major, OS/glibc, provider and locale changes each move a different part of the profile, and two of them can move it **silently** | `DERIVED` / `NOT TESTED` |
| 9 | Selecting a target versus proving production equivalence | two different acts: a selection is a policy statement about what production **should** be; equivalence is a measurement showing what two environments **actually** do. Neither implies the other | `DERIVED` |
| 10 | Which questions are policy and which are measurement? | policy: which profile is acceptable, whether a pin is required, what evidence standard confirms it. measurement: everything about the existing environment, including whether a locale even exists in the target image | see §3.4 |

### 3.4 Policy questions versus measurement questions

| Question | Type | Who can answer | Evidence needed |
|---|---|---|---|
| May production run an unpinned, platform-default locale? | **policy** | owner | none — it is a choice |
| Is `C` acceptable for a product whose duplicate-name message says "ignoring case"? | **policy** | owner (needs OD-COLL-01/02) | none, but the answer changes the promise |
| Is ICU permitted if it is available? | **policy** | owner | availability measurement first (Q3) |
| Which database will the application use? | **measurement + deployment fact** | deployment owner | configuration, not the catalog |
| What is the current production profile? | **measurement** | operations | read-only access to `pg_database` |
| Does the target image contain the chosen locale? | **measurement** | infrastructure | `locale -a` / `initdb` trial on the image |
| Would the chosen locale create collisions in existing data? | **measurement** | audit (OD-COLL-06) | the §7.3 report |

**Nothing in the measurement column can be answered by selecting a policy.** A target profile is a decision
about the future; the current profile is a fact about the present, and the present has never been examined.

---

## 4. OD-COLL-03 — options and trade-offs

Reproduced from S22 §8 with their own titles. Each is prefixed with the decision ID because "Option C" is used
for three different things across this package; the bare label is never used in this worksheet.

### 4.1 OD-COLL-03 option 1 — retain the environment's existing default, after measuring and validating it

| Aspect | Record |
|---|---|
| Meaning | approve whatever `initdb` produced as the profile, with its measured values recorded |
| Benefits | no production configuration change; no index rebuild; no risk of breaking something that works; the profile can still be recorded and drift-detected later |
| Risks | the retained locale is whatever the platform default happens to be, possibly `C` — in which case both `lower(name)` rules are ASCII-only and the user-facing message is false for non-ASCII names; a later restore into a different locale reintroduces the silent weakening |
| Operational | lowest cost: measurement + validation + approval; no change window |
| Evidence required | the §4.1 fact set; the §7.3 report under the retained semantics (to learn whether the current guarantee is already violated) |
| Evaluable without changing production | **yes** — entirely read-only |
| Reversible | yes; it is the status quo |
| Upgrade implications | none at selection time; the profile remains whatever the platform assigns at creation |

### 4.2 OD-COLL-03 option 2 — explicitly select a named libc collation profile

| Aspect | Record |
|---|---|
| Meaning | pin a specific libc locale (the register's examples are `C` and `C.utf8`; other locales must not be assumed installed) |
| Benefits | deterministic and reviewable; `C.utf8` gives non-ASCII case folding without ICU; the expected value can be enforced by a future fingerprint gate; makes the product promise substantially truer |
| Risks | choosing a locale **for existing data** may create collisions that must be remediated; `C.utf8` is still not full Unicode folding (`ς/σ`, `ẞ/ss` fold under neither); the change requires re-creation or re-indexing |
| Operational | implementation plan and change window; interacts with backup/restore and future restore drills |
| Evidence required | §4.1 facts; confirmation the locale exists in the target image; the §7.3 report for the chosen locale; a rebuild plan |
| Evaluable without changing production | **partly** — availability and collision analysis can be done on a copy |
| Reversible | **partly** — returning to the previous locale is possible but requires the same rebuild in reverse, and any data merged under the new rule stays merged |
| Upgrade implications | a glibc upgrade may change folding while leaving the locale name identical; only `datcollversion` signals it, and only where the build exposes it (§4.5) |

### 4.3 OD-COLL-03 option 3 — explicitly select an ICU collation profile

| Aspect | Record |
|---|---|
| Meaning | provider `icu` with an explicit `daticulocale`, deterministic |
| Benefits | the only route to locale rules independent of the OS libc build; reaches broader Unicode behaviour than a libc UTF-8 locale |
| Risks | the largest change of the four; ICU availability in the target image is unmeasured and ICU is unsupported in this repository's experimentation environment (`NOT TESTED`); a provider change alters three fingerprint fields at once; `datcollate`/`datctype` semantics under ICU are unmeasured |
| Operational | database re-create or provider change with index rebuilds; ICU version tracking in the runbook |
| Evidence required | everything in option 2, plus measured ICU availability, measured `daticulocale` behaviour, and a determinism proof for every collation in use |
| Evaluable without changing production | **no** — not even availability, without access to the target image |
| Reversible | **no** in practice: a provider change is a rebuild with index re-creation and data reload |
| Upgrade implications | ICU data version can change independently of the locale tag; `datcollversion` is the only signal, and ICU semantics themselves are `NOT TESTED` here |

### 4.4 OD-COLL-03 option 4 — defer profile selection until the deployment environment and compatibility requirements are known

| Aspect | Record |
|---|---|
| Meaning | record the **requirement** that a profile be pinned, and defer the value |
| Benefits | matches the evidence (production unmeasured); prevents a locale being chosen to fit CI; keeps the decision reversible; consistent with `B2 WITHHELD` and the absence of a deployment authorisation |
| Risks | the guarantee stays environment-dependent in the interim — which is already true today, so deferral preserves the status quo rather than creating exposure; deferral can drift into indefinite postponement |
| Operational | no work now; the measurement and validation work is deferred with it |
| Evidence required | none to defer; the exit criteria are the §4.1 facts plus a deployment decision that fixes the environment |
| Evaluable without changing production | **yes** — it is the current position |
| Reversible | not applicable — it *is* the reversible state |

**The brief records one recommendation and it is a process recommendation, not a profile:** *"Treat option 4 as
the operative position until stages 1–3 of §9 are complete"*, with exit criteria (S22 §12.1, `PROPOSED`).
**No locale recommendation is technically justified by the current evidence** (S22 §12.1).

### 4.5 What each choice implies for upgrades, OS changes, provider changes and locale changes

| Event | What moves | Detectable? | Who must act |
|---|---|---|---|
| PostgreSQL **major** upgrade | catalog shape, provider support (`builtin` 17+), the `lower()` implementation it calls | yes — `pg` is in the fingerprint | engineering: re-measure, re-pin expectations |
| **OS / glibc** upgrade | the collation tables behind the same locale name | **only if `datcollversion` is populated**; it was `2.41` in CI and NULL locally | operations: compare `datcollversion`; review, not auto-accept |
| **provider** change (libc → ICU or builtin) | three fields at once: provider, `iculocale`, and the meaning of `datcollate`/`datctype` | yes, once the provider domain is specified | owner + engineering: largest change, index rebuild |
| **locale** change | which strings collide, i.e. the uniqueness relation itself | yes, as a difference — but *whether it matters* needs OD-COLL-01/02 | owner: policy + rebuild + data validation |
| **restore** into a differently-initialised database | the same as a locale change, silently | yes, if a fingerprint gate exists — **none does** | owner/ops: this is E8, reproduced |
| **Unicode / ICU data** upgrade | folding for rare code points, possibly with no catalog signal | `NOT TESTED` | engineering: behavioural tests, not catalog checks |

---

## 5. Production evidence requirements

### 5.1 The nine mandatory facts (S22 §4.1)

| # | Fact | Read from | Why mandatory |
|---|---|---|---|
| 1 | PostgreSQL major (`server_version_num`) | `SHOW` | catalog shape, provider support, fold implementation |
| 2 | Database encoding | `pg_database.encoding` | byte semantics of every fold |
| 3 | Collation provider | `pg_database.datlocprovider` | decides who implements `lower()` and `=` |
| 4 | `datcollate`, `datctype` | `pg_database` | with libc these **are** the profile |
| 5 | `daticulocale` | `pg_database` | the ICU equivalent; NULL for libc |
| 6 | `datcollversion` | `pg_database` (+ `pg_collation_actual_version` where applicable) | the only signal a library changed — and only where populated |
| 7 | Per-index collation and operator class for the six indexes | `pg_index.indcollation`, `indclass` | three keys resolve to `database_default` |
| 8 | Determinism of every collation in use | `pg_collation.collisdeterministic` | a non-deterministic collation changes equality itself |
| 9 | Which database the application will actually use | deployment configuration | a profile approved for one database is not a profile for another |

### 5.2 The seven read-only checks a candidate profile needs (S22 §7.3)

Row counts versus distinct `lower(name)`; collisions under each candidate key; NFC/NFD variants; the actual
fold behaviour of the deployed expression under the target's `datctype`; confirmation that the checked
expression **is** the index's expression; pairwise current-versus-candidate conflicts; merge feasibility and
referential integrity. **All `PROPOSED`; none has been executed.**

### 5.3 The gates (S22 §9)

Measurement (separate read-only authorisation) → read-only validation on a snapshot → evidence review
(owner + reviewer) → owner decision → implementation authorisation → change window → post-change verification.
**No gate may be merged with the next**, and no gate before the fourth exists today.

### 5.4 Exit criteria for deferral

The §4.1 facts measured, the §7.3 report reviewed, and a deployment decision that fixes which database the
application will use (S22 §12.1). Until all three exist, "defer" is not a placeholder — it is the position the
evidence supports.

---

## 6. OD-COLL-04 — the question

### 6.1 The exact question

> **Which fields constitute the collation fingerprint, in what canonical form, and with what comparison
> meaning** — such that a difference between two recorded environments can be classified without claiming more
> than the artefact proves?

The register records the options as *Session 14 six fields · six + `pg` major (proposed) · six + `pg` +
per-index collation objects inside one string · something else* (decision document §12). Those are options for
the **field set** only; the brief shows that four further elements are undecided (S24 §6–§10).

### 6.2 The ten questions, with what the evidence can and cannot answer

| # | Question | Recorded answer | Category |
|---|---|---|---|
| 1 | What must a fingerprint identify? | **an environment**, for change detection and identity binding — not semantic equivalence | `DERIVED` (S24 §1, §9) |
| 2 | Which fields are mandatory? | eight Layer-A values are mandatory in the brief's assessment: schema version, `pg`, `enc`, `provider`, `datcollate`, `datctype`, `daticulocale`, `datcollversion` — with provider-conditional applicability for the locale fields; diagnostics (full `server_version`, `server_version_num`) are optional | **Specified**; the implemented set is `pg`, `enc`, `provider`, `collate`, `ctype`, `iculocale`, `collversion` |
| 3 | How should database identity be represented? | **as an assertion bound to the expectation**, not a field compared for equality; today the probe asserts `current_database()` equals the requested name and never serializes it (`IDENTITY_SQL` `:119`) | `VERIFIED` (implemented), `PROPOSED` (policy) |
| 4 | Database identity versus cluster identity | the name assertion distinguishes *names*, not *clusters*: two clusters can hold the same database name and a mis-pointed host would pass. Cluster identity is not captured anywhere; `pg_control_system()`, `inet_server_addr()`, `inet_server_port()` are optional candidates requiring privileges | `DERIVED` / **Unknown** |
| 5 | What happens when a provider or field is unknown? | a **missing catalog field** fails closed today (`fields_present` → `UNSUPPORTED_CATALOG_FIELD`, `:359–369`); an **unknown provider value** does **not** — it serializes `provider=unknown` and the run continues; the rule "unknown must fail" is `PROPOSED` and unimplemented (proposal §8.6 C1; S24 `D4`) | `VERIFIED` (current behaviour) / `PROPOSED` (rule) |
| 6 | How should delimiters and sentinels be represented or validated? | **not implemented**: no escaping, no delimiter check anywhere in the path; `-` is both the NULL sentinel and a legal string, so the artefact can be ambiguous. The choice — escape, reject, or tag — is `OPEN` under OD-COLL-04 Q4 | `VERIFIED` (absence); rule `OPEN` |
| 7 | What happens when a value is empty, malformed or unavailable? | empty renders `key=` (distinguishable from `-`, not from a missing segment); a missing field shrinks the string silently; the probe fails closed on an empty or non-prefixed fingerprint (`:380–384`) and on a failed query, but not on a semantically empty value | `VERIFIED` / `DERIVED` |
| 8 | What constitutes an exact match? | in OD-COLL-04, "every field equals the approved expectation" — a **fingerprint-layer** outcome only. OD-COLL-05 reuses the same word for a cross-layer verdict; the two are distinguished in both briefs | `PROPOSED`; `EXACT_MATCH` is not a deployment verdict |
| 9 | What belongs in the fingerprint versus per-index metadata? | the environment artefact carries database-level properties; per-index collation identity is a **separate document** (`collation-indexes/v1`) with per-key expectations (`none` for eight keys, `database_default` for three — R2 §12.1) | `VERIFIED` (two documents exist) / `PROPOSED` (expectation file) |
| 10 | Which comparisons are implemented? | **none.** There is no expectation file, no comparison layer and no classifier; the probe measures, annotates and exits non-zero only on measurement-integrity failures | `VERIFIED` (absence) |

---

## 7. OD-COLL-04 — options and trade-offs

OD-COLL-04's choices are not lettered in any source; inventing letters would create a second lettering conflict
on top of the existing one. Eight **decision elements** are recorded instead. Each names its option titles as
the sources phrase them.

### 7.1 Element 1 — the field set

| Option title (source) | Meaning | Benefits | Risks | Blocked by 03? |
|---|---|---|---|---|
| "Session 14 six fields" | the six catalog fields evaluated in decision document §8.1 (`encoding`, `datlocprovider`, `datcollate`, `datctype`, `daticulocale`, `datcollversion`) | smallest artefact; every field is a catalog read | no server major, so a major change can be invisible | no |
| "six + `pg` major" (the register's second field-set option; the set the probe emits today) | those six plus a derived major | distinguishes "same locale, different major"; cheap | `pg` is derived, not stored — a documented counting caveat only | no |
| "six + `pg` + per-index collation objects inside one string" | one artefact for environment and per-index expectations | one document to compare | conflates two layers whose failures mean different things; larger grammar | **partly** — per-index applicability depends on the inventory, not on 03 |
| "something else" | e.g. JSON-first with the text line as a summary | machine-parseable; explicit `null` | new grammar, coexistence rule required | no |

### 7.2 Element 2 — serialization

| Option title | Meaning | Benefits | Risks |
|---|---|---|---|
| keep the text line as the only artefact | current form | reviewable in a diff; already produced | no escaping; ambiguity in values; positional parsing |
| canonical JSON as the machine artefact, text line kept as a human summary (brief's stated candidate) | two artefacts, one authoritative | explicit `null`; order-independent; parseable | coexistence rule; two artefacts to keep in sync |
| hash-only | a digest as evidence | compact | **cannot be reviewed or classified** — the brief rejects it (§7.5) |

### 7.3 Element 3 — identity binding

| Option title | Meaning | Consequence |
|---|---|---|
| keep identity as a separate assertion (current) | the caller states the target; the script asserts `current_database()` | works today; a bound expectation is still required for a guard |
| serialize database identity as a field | identity compared like any other value | contradicts the brief's finding that identity must be *bound*, not compared; makes fingerprints of two identical databases unequal |

### 7.4 Element 4 — provider domain and the unknown rule

| Option title | Meaning | Status |
|---|---|---|
| finalise `c`/`i`/`b` and make anything else fail closed | the rule the brief proposes | **`PROPOSED`**, not implemented |
| add `d` explicitly | handle the `database_default` provider consistently in both profile and fingerprint | `OPEN`; today they disagree (§8.3) |
| keep the current permissive behaviour | unknown serialized, run continues | **current behaviour**, and the one the brief advises against |

### 7.5 Element 5 — NULL, empty and missing values

| Option title | Meaning | Status |
|---|---|---|
| keep `-` as the NULL sentinel | current form | ambiguous; `-` is also a legal value |
| escape values (e.g. `\-`) | reversible encoding | `PROPOSED`; needs a version bump |
| reject values that collide with the sentinel or contain delimiters | fail closed at production time | `PROPOSED`; not implemented |
| tagged values (e.g. `null:` prefix) | unambiguous without escaping | `PROPOSED`; larger change |

### 7.6 Element 6 — versioning and coexistence

The brief requires: any field addition, removal or NULL-semantics change bumps the version (proposed `/v2`);
old and new artefacts must not be compared across versions; a comparison layer must refuse rather than guess
(S24 §10). **`PROPOSED`; no version has been approved.**

### 7.7 Element 7 — the comparison model

Thirteen candidate outcomes for the environment artefact (S24 §8), version-aware, identity-bound, with no
silent acceptance and no cross-version comparison. **`PROPOSED`; nothing is implemented**; OD-COLL-05 owns the
*response* to each outcome.

### 7.8 Element 8 — what is mandatory versus diagnostic

Mandatory: the eight Layer-A values with provider-conditional applicability, plus the identity assertion.
Diagnostic and never a pass condition: full `server_version`, package string, `pg_collation` inventory, index
expression text, representative fold samples (`NOT TESTED`). Cluster identity and secrets are excluded or
optional (§8.2).

### 7.9 What can be answered now, and what cannot

| Element | Answerable without OD-COLL-03? | Why |
|---|---|---|
| 1 field set | **yes** — except the ICU/`builtin` applicability of locale fields | the fields are catalog columns; their *meaning* depends on provider |
| 2 serialization | **yes** | a format choice, independent of values |
| 3 identity binding | **yes** | a design rule about expectations |
| 4 provider domain | **partly** — `d` and `unknown` can be decided; `builtin` behaviour cannot (`NOT TESTED`) | requires 03's supported-provider decision |
| 5 NULL/empty/missing | **yes** | grammar |
| 6 versioning | **yes** | process rule |
| 7 comparison model | **yes in structure**, no in enforcement | enumeration is a design; enforcement needs a guard |
| 8 mandatory vs diagnostic | **yes** | classification |

---

## 8. Fingerprint field and identity analysis

### 8.1 What exists today, exactly

`collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41`

Counted directly (Session 28, re-verified here): **8 `;`-separated segments**, of which one is the
`collation-fingerprint/v1` discriminator and **7 are `key=value` fields** (`pg`, `enc`, `provider`, `collate`,
`ctype`, `iculocale`, `collversion`). The **six catalog fields** of decision document §8.1 are `encoding`,
`datlocprovider`, `datcollate`, `datctype`, `daticulocale`, `datcollversion`; `pg` is derived from
`server_version_num` and is therefore not a seventh catalog column.

### 8.2 The field inventory, with status

| Field | In the string? | In the profile JSON? | Classification in the brief | Implemented today |
|---|---|---|---|---|
| schema version (`collation-fingerprint/v1`) | yes (discriminator) | `probe` key | mandatory | **yes** |
| `pg` major | yes | `pg_major` | mandatory | **yes** |
| encoding | yes (`enc`) | `encoding` | mandatory | **yes** |
| provider (word) | yes | `datlocprovider` + `provider_name` | mandatory; domain undefined | **yes**, with the `d` inconsistency |
| `datcollate` | yes | yes | mandatory for libc | **yes** |
| `datctype` | yes | yes | mandatory for libc | **yes** |
| `daticulocale` | yes | yes | mandatory for ICU; `-` expected for libc | **yes** |
| `datcollversion` | yes | yes | mandatory to record, never sufficient to compare | **yes** |
| `fields_present` | no | yes | validity input | **yes** (drives `UNSUPPORTED_CATALOG_FIELD`) |
| full `server_version` | no | yes | optional diagnostic | **yes** |
| `server_version_num` | no | yes | optional diagnostic | **yes** |
| database identity | **no** — separate assertion | `current_database` in the profile only | mandatory, as an assertion | **yes** (asserted, not serialized) |
| cluster identity | **no** | no | optional candidate, privileges dependent | **no** |
| secrets / credentials | **no** | no | prohibited | **none emitted** (`VERIFIED`) |

### 8.3 The `d` provider divergence, re-verified in the source

`PROFILE_SQL` maps `'d'` → `database_default`; `FINGERPRINT_SQL` has **no `'d'` arm**, so the same database
yields profile `provider_name = database_default` and string `provider=unknown`. A consumer reading only the
string cannot distinguish "the `d` provider" from "a provider this code does not know". Whether any database
reports `d` here is `NOT TESTED`; which behaviour is correct is `OPEN` under OD-COLL-04.

### 8.4 Database identity versus cluster identity

| Dimension | Today | What a specification would need |
|---|---|---|
| database identity | asserted by `IDENTITY_SQL` (`current_database()`), never serialized; two clusters with the same database name both pass | an expectation bound to the identity, and a stated behaviour when the assertion fails (today: `WRONG_DATABASE_IDENTITY`) |
| cluster identity | not captured at all | an optional, privileges-aware field (`pg_control_system()`, `inet_server_addr()`, `inet_server_port()`) or an explicit decision that cluster identity is out of scope |

### 8.5 Empty, malformed and unavailable values

| Case | Current behaviour | Label |
|---|---|---|
| column absent (pre-15) | `fields_present` → `UNSUPPORTED_CATALOG_FIELD`, exit 1 | **implemented** |
| fingerprint empty or not prefixed | `MALFORMED_RESULT`, exit 1 | **implemented** |
| control character in the annotated value | annotation refused, `MALFORMED_RESULT`, exit 1 — at step 7, after artefacts are written | **implemented** (annotation path only) |
| value contains `;` | **undetected** — the string gains a segment | **not implemented** |
| value equals `-` | **undetectable** — reads as NULL | **not implemented** |
| value is the empty string | renders `key=`; distinguishable from `-`, not from a missing segment | `DERIVED` |
| segment missing | string silently shorter; positional parsers misread | `DERIVED` |
| provider value unknown | serialized `provider=unknown`; run continues | **current behaviour**, contrary to the proposed rule |

### 8.6 What a fingerprint match proves — and what it does not

| Layer | Question | A match at this layer proves | It does **not** prove |
|---|---|---|---|
| **1. Fingerprint equality** | are the recorded environment properties identical? | the same recorded properties | that either environment is approved, or that behaviour matches |
| **2. Per-index collation metadata** | is each key attached to the expected collation object? | the attachment matches the expectation | that the index definition, predicate or key order is intact |
| **3. Structural integrity** | is the index still the same object? | the definition matches `migration.sql` | that existing rows satisfy the rule |
| **4. Behavioural compatibility** | do strings compare as required on this build? | observed behaviour on the strings tested | behaviour on untested inputs — ICU, PG 15/17/18 and `en_US.utf8` remain `NOT TESTED` |
| **5. Deployment eligibility** | may this go to production? | nothing on its own: it is the conjunction of layers 1–4 **plus** an authorisation | — |

**A fingerprint match is layer 1 only.** It is never evidence of layers 2–5, and no document in this package
claims otherwise.

### 8.7 The Session 28 findings, re-verified item by item

| Claim | Verified against | Result |
|---|---|---|
| six catalog fields | decision doc §8.1, §8.3.2 | **holds** |
| seven `key=value` fields including `pg` major | `FINGERPRINT_SQL` `:149–164`; counted from the CI string | **holds** |
| eight segments: one discriminator + seven fields | same | **holds** (counted, not quoted) |
| database identity is a separate assertion | `IDENTITY_SQL` `:119`; identity never concatenated into the string | **holds** |
| cluster identity is not captured | probe source: no `pg_control_system`, no `inet_server_*` | **holds** |
| per-index metadata is separate | `INDEXES_SQL` → `collation-indexes/v1` document | **holds** |
| delimiter validation is not implemented | no escaping, no delimiter check in `:149–164` or the annotation path | **holds** |
| the `-` sentinel remains ambiguous | `coalesce(…, '-')`; no rejection of a literal `-` | **holds** |
| `provider=unknown` is not rejected | `FINGERPRINT_SQL` `ELSE 'unknown'`; only the prefix is checked (`:380–384`) | **holds** |
| the `d` mapping is inconsistent | `PROFILE_SQL` has `'d'`; `FINGERPRINT_SQL` does not | **holds** |

### 8.8 Implemented versus proposed, in one table

| Capability | Implemented | Proposed |
|---|---|---|
| measure environment and per-index metadata | **yes** (probe, read-only) | — |
| publish a human-readable annotation | **yes** (one notice per successful database) | — |
| fail closed on measurement-integrity problems | **yes** (missing field, missing index, malformed output, refused annotation) | — |
| expectation file | **no** | yes |
| comparison / classification | **no** | 13 outcomes |
| delimiter or sentinel validation | **no** | escape / reject / tag |
| unknown-provider refusal | **no** | yes |
| cluster identity | **no** | optional candidate |
| canonical JSON artefact | **no** | yes |

---

## 9. Mutual dependency analysis

### 9.1 Why a target profile needs a defined fingerprint

A profile that cannot be recorded cannot be confirmed or enforced. Without a specified artefact, OD-COLL-03's
answer is a note in a document; with one, it becomes an assertion that a future guard can test. The brief states
this directly: *"a profile with no assertion mechanism is a note, not a control"* (S22 §12.2 Q7).

### 9.2 Why a fingerprint needs an agreed profile scope

The fingerprint's **mandatory field set is provider-conditional**: `datcollate`/`datctype` are meaningful for
libc, `daticulocale` for ICU, `builtin` depends on the version. Without knowing which providers must be
supported, OD-COLL-04 cannot say which fields are mandatory, which are diagnostic, or what the equality
semantics of "the same environment" are. The brief records this as Q8/Q10 (`datcollate` semantics under ICU;
which majors must be supported).

### 9.3 What is independent, and what must be coordinated

| Part | Independent | Coordinated | Note |
|---|---|---|---|
| field set (which catalog properties) | ✔ |  | the properties are the same regardless of which locale is chosen |
| serialization (text vs JSON) | ✔ |  | pure format choice |
| identity binding | ✔ |  | a rule about expectations |
| versioning / coexistence | ✔ |  | process rule |
| provider domain incl. `d`, `unknown`, `builtin` |  | ✔ | needs 03's supported-provider scope |
| locale-name normalisation (`en_US.utf8` vs `en_US.UTF-8`) |  | ✔ | whether two spellings are "the same profile" is a value-level question |
| applicability of locale fields by provider |  | ✔ | depends on which providers production may have |
| enforcement thresholds |  | ✔ | belongs to OD-COLL-05 |

### 9.4 Sequencing options

| Sequence | Advantage | Cost |
|---|---|---|
| **Coordinated review** (the briefs overlap on provider scope; no source prescribes an order) | the two answers are recorded in one session, removing the risk of a field set that cannot express the chosen profile | requires both briefs to be read together |
| 03 first, then 04 | the profile scope is fixed before the artefact is designed | 03's answer is a target with no confirmation mechanism until 04 lands |
| 04 first, then 03 | the artefact exists before a target is chosen | 04's mandatory-field decision cannot be completed for ICU/`builtin` without knowing what must be supported |

**No strict linear order is required.** The dependency is narrow and two-directional: values → applicability,
and artefact → confirmation. Everything else can proceed in parallel.

### 9.5 Can the owner approve the policy while implementation remains open?

**Yes, at two specific points, and only if the approval is explicitly scoped:**

1. **OD-COLL-04 — layering, identity-as-assertion and the mandatory/diagnostic split** can be approved as a
   *specification policy* while serialization format, delimiter rule and comparison model remain unapproved.
   The brief records exactly this: those three are "justified"; a specific serialization is not (S24 §12).
2. **OD-COLL-03 — a target profile plus an evidence standard** can be approved while no production measurement
   exists, provided the approval says so. It then reads: *"production shall be pinned to X, confirmed by the
   §4.1 fact set"* — a policy about the future, not a claim about the present.

**What cannot be approved this way:** any statement that an existing database matches the target; any
unsupported provider support claim (ICU, `builtin`); any claim that a fingerprint proves compatibility.

---

## 10. Unresolved questions and evidence register

### 10.1 From OD-COLL-03 (S22 §12.2, verbatim in substance)

| ID | Question | Blocks | Who |
|---|---|---|---|
| Q1 | Which PostgreSQL major, provider and build will production run? | every other fact is relative to it | infrastructure / deployment owner |
| Q2 | Which database will the application use, and is it a managed service? | a managed service may impose the locale and forbid re-initialisation | deployment owner |
| Q3 | Is ICU available in that image, and at which data version? | whether the ICU option exists at all | infrastructure |
| Q4 | Is the current locale `C`, a UTF-8 locale, or unset by the platform? | whether the promise is currently true for non-ASCII names | measurement |
| Q5 | Are there rows that would collide under a UTF-8 fold? | whether a libc pin is adoptable without remediation | validation report |
| Q6 | Does the owner intend `lower()` to be the uniqueness semantics at all? | a profile cannot turn `lower()` into full folding — **OD-COLL-01/02** | owner |
| Q7 | Which fields will the fingerprint carry, and what happens on drift? | a profile with no assertion is a note — **OD-COLL-04/05** | owner |
| Q8 | Is a production backup/restore path verified, with RTO/RPO? | a locale change may require a rebuild — **OD-22 `OPEN`** | owner / operations |

### 10.2 From OD-COLL-04 (S24 §13.2, verbatim in substance)

| ID | Question | Who |
|---|---|---|
| Q1 | Which fields are mandatory beyond the seven the script emits? | owner |
| Q2 | Must an approved fingerprint be bound to a database identity, and to a cluster identity? | owner + operations |
| Q3 | Is the machine artefact text or JSON, and which is authoritative? | owner |
| Q4 | How are `-`, empty string and absent field each represented? | owner (format) |
| Q5 | Is locale-name spelling normalisation adopted, and where — producer or comparator? | owner |
| Q6 | What is the provider domain, and what happens on an unknown provider? | owner |
| Q7 | Is `pg` major sufficient, or is a full version mandatory for support gating? | owner |
| Q8 | Are `datcollate`/`datctype` meaningful for ICU, and must they be `-` there? | needs an ICU environment (`NOT TESTED`) |
| Q9 | Who owns the approved expectation, where does it live, how is it re-pinned? | owner + operations (also OD-COLL-05) |
| Q10 | Which PostgreSQL majors must the specification support? | owner (17/18 `NOT TESTED`) |

### 10.3 Evidence register for this worksheet

| ID | Item | Category today | Needed to answer | Blocks |
|---|---|---|---|---|
| R-01 | production major / provider / locale / `datcollversion` / encoding | **Unknown** | one read-only measurement of `pg_database` on the intended database | OD-COLL-03 options 1–3 |
| R-02 | which database the application targets | **Unknown** | deployment configuration | OD-COLL-03 Q2; identity binding |
| R-03 | locale availability in the target image | **Unknown** | `locale -a` / `initdb` trial on that image | OD-COLL-03 options 2–3 |
| R-04 | ICU availability and behaviour | **Not tested** | an ICU-enabled build; no such environment exists locally | OD-COLL-03 option 3; OD-COLL-04 Q8 |
| R-05 | PostgreSQL 15/17/18 behaviour, incl. `builtin` provider | **Not tested** | other major versions | OD-COLL-04 Q7/Q10 |
| R-06 | `en_US.utf8` versus `C.utf8` fold equality | **Not tested** | install the locale and re-run the fold matrix | OD-COLL-03 options 2–3 |
| R-07 | collision inventory under candidate profiles | **Not tested** | the seven read-only checks on a snapshot | OD-COLL-03 Q5; OD-COLL-06 |
| R-08 | cluster identity availability (privileges) | **Not tested** | `pg_control_system()` on the target | OD-COLL-04 Q2 |
| R-09 | expectation file, comparison layer, guard | **Specified** — absent | implementation authorisation (not granted) | enforcement of either answer |
| R-10 | delimiter/sentinel rule | **Specified** — not implemented | OD-COLL-04 Q4 answer, then implementation | safe machine comparison |
| R-11 | whether any database reports `d` as the provider | **Not tested** | catalog observation across versions | OD-COLL-04 Q6 |
| R-12 | retention/access policy for measurement artefacts | **Unknown** — OD-20 `OPEN` | owner decision (OD-20) | storing annotations/reports |

**Five items (R-01, R-02, R-03, R-08, R-12) require production access or an owner authorisation; R-04, R-05,
R-06 can be produced locally but have not been; none can be produced by writing more documentation.**

---

## 11. Owner decision record — blank

**Both records are intentionally blank.** Nothing below has been filled in, and nothing may be inferred from
the order or wording of the options. A decision is recorded only when the owner writes it into a reviewed
document; it cannot be inferred from a recommendation, a brief or this worksheet.

### 11.1 OD-COLL-03 — production collation profile

| Field | Record |
|---|---|
| **Decision ID** | `OD-COLL-03` |
| **Selected option** | `NOT DECIDED` — record the **full option title** (e.g. "retain the environment's existing default, after measuring and validating it"), never a bare letter |
| **Owner rationale** | `NOT RECORDED` |
| **Accepted trade-offs** | `NOT RECORDED` |
| **Required follow-up evidence** | `NOT RECORDED` — e.g. the §4.1 fact set from the intended database, plus the §7.3 report |
| **Decision date** | `NOT RECORDED` |
| **Approval status** | **`OPEN`** |
| **Authorised by this record** | **nothing** — no locale selection, no database re-creation, no index rebuild, no migration, no deployment |

### 11.2 OD-COLL-04 — collation fingerprint specification

| Field | Record |
|---|---|
| **Decision ID** | `OD-COLL-04` |
| **Selected option** | `NOT DECIDED` — record per element (§7): field set, serialization, identity binding, provider domain, NULL/empty rule, versioning, comparison model, mandatory/diagnostic split |
| **Owner rationale** | `NOT RECORDED` |
| **Accepted trade-offs** | `NOT RECORDED` |
| **Required follow-up evidence** | `NOT RECORDED` — e.g. ICU and other-major behaviour (R-04, R-05), or an explicit statement that they are out of scope |
| **Decision date** | `NOT RECORDED` |
| **Approval status** | **`OPEN`** |
| **Authorised by this record** | **nothing** — no probe change, no comparison implementation, no delimiter validation, no expectation file, no deployment |

### 11.3 What a completed record would look like (structure only, still blank)

```text
Decision: OD-COLL-03 | OD-COLL-04
Option or element answer: <full title>
Source of the option definition: <document + section>
Rationale: <owner's own words>
Trade-offs accepted: <one line per accepted consequence>
Follow-up evidence required: <none | R-01 | R-04 | R-07 | other>
Recorded in (document, date): <…>
Approval status: OPEN until the owner records it in a reviewed document
```

---

## 12. Explicit non-authorisations

This worksheet authorises **none** of the following:

- selecting a production locale, provider or PostgreSQL major;
- deciding, preselecting, recommending or implying an answer to OD-COLL-03 or OD-COLL-04;
- changing any decision status, including OD-COLL-01…06, G-1, G-3, Option C, B1a, B1b, B1c, B2, 0001, 0002,
  G-2, T1, R2, OD-17, OD-20, OD-21, OD-22 or OD-NM-1;
- modifying `collation-probe.sh`, `guard.py`, `deploy-gate.sh`, `deploy-path-guard.py`, `repo-guard.sh`, any
  workflow, any test, or `package.json`;
- implementing fingerprint comparison, an expectation file, a delimiter/sentinel rule or an unknown-provider
  refusal;
- modifying `prisma/schema.prisma`, `migration.sql`, any migration, any index, or application code;
- creating or starting a database, connecting to production or staging, executing SQL, or scanning data;
- creating migration 0002;
- editing any source decision brief or the deployment package;
- staging, committing, pushing, opening a PR, merging or deploying.

**An answer to either question authorises nothing.** It records policy; enforcement needs OD-COLL-05, an
implementation authorisation, a migration authorisation, and — for production — B1b and B2.

---

## 13. Revision history

| Revision | Date | Change |
|---|---|---|
| 1 | 2026-11-24 | Initial owner decision worksheet for OD-COLL-03 and OD-COLL-04 (Session 31). States both questions, reproduces the four profile options and eight fingerprint decision elements **by title** (no invented letters), records the five evidence categories, re-verifies the ten Session 28 fingerprint findings against the committed probe, separates the five compatibility layers, analyses the mutual dependency without imposing a linear order, and leaves both owner decision records blank. **No document was edited; no option was selected; both decisions remain `OPEN`.** |

**Standing decisions reproduced exactly, unchanged by this document:** G-1 **FAILED** · G-3 **PASSED** ·
Option C **APPROVED — controlled migration workflow only** · B1a **APPROVED (workflow-scoped)** · B1b **NOT
APPROVED** · B1c **NOT APPROVED** · B2 **WITHHELD** · migration 0001 **NOT AUTHORIZED for production
deployment** · migration 0002 **DO NOT COMMIT** · G-2 **DEFERRED** · **T1 CLOSED** · **R2 PARTIALLY RESOLVED** ·
**OD-COLL-03 `OPEN`** · **OD-COLL-04 `OPEN`** · OD-COLL-01/02/05/06 **`OPEN`** · OD-17 / OD-20 / OD-21 / OD-22 /
OD-NM-1 **`OPEN`**. CI profile **OBSERVED**; production profile **UNKNOWN**; production locale **NOT DECIDED**;
CI↔production equivalence **NOT ESTABLISHED**.

**A worksheet is not an answer, and an environment property is not an approval. Two questions are framed, no
option is chosen, and nothing here may be cited as an owner decision.**
