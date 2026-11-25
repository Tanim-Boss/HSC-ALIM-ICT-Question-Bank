# Phase 04A — CI PostgreSQL Collation Profile: Measurement Proposal (Task T1)

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD at the start of this session:** `36a444a67a4c7de6ba6f4f292f42b765820e6027`
**Status:** read-only investigation. **No workflow, script, schema or database was modified. No CI measurement
has been performed.** This document prepares and validates a probe; it does not run one in CI.
*(Revision 2: this describes Revision 1's state. The probe has since been implemented and executed — §17.4.)*

**Labels**

| Label | Meaning |
|---|---|
| `VERIFIED` | read directly from the repository, from the GitHub API, or executed this session |
| `PROPOSED` | design or patch, not applied |
| `NOT TESTED` | could not be executed in this environment |
| `INCONCLUSIVE` | the evidence points one way but does not establish the claim |

**Revision 2 — 2026-11-24 (recorded in Session 19).** This proposal was **implemented and executed**. Session 17
applied the patch and Session 18 corrected it; the measurement ran successfully and its values were retrieved
through the Check Runs annotations API. **T1 is CLOSED** — see **§17.4**. The body of this document is preserved
as written, including its predictions and its `INCONCLUSIVE` labels, so that the correction can be seen against
what was expected. Nothing else in the standing register changed: `R2` stays **PARTIALLY RESOLVED**, OD-COLL-01…06
stay **OPEN**, and no production locale is selected.

---

## 1. Executive verdict

**T1 is ready to be executed, but has not been executed.** *(Superseded — Session 18 executed it; **T1 is
CLOSED**, §17.4.)* The CI environment cannot be measured from this
sandbox: workflow **logs** and **artifacts** are both unreachable (`EOF` from
`results-receiver.actions.githubusercontent.com` and `productionresultssa13.blob.core.windows.net`), and the
only way to measure is to add a step to a workflow — which this session is not authorised to do.

What this session *did* establish, all `VERIFIED`:

| # | Finding |
|---|---|
| 1 | The CI PostgreSQL is **three separate `postgres:16` service containers**, not one: `g3f_main` (5432), `g3f_shadow` (5433), `g3f_replay` (5434), each with its own `initdb` and therefore **its own `pg_database` row** |
| 2 | The **application/migration database is `g3f_main`** on port 5432 — not the image's default `postgres` database, and not the `POSTGRES_DB` of the other two services |
| 3 | **No workflow sets `LANG`, `LC_ALL`, `LC_COLLATE` or `POSTGRES_INITDB_ARGS`** anywhere in `.github/workflows/` → the locale is entirely the image's default |
| 4 | The official `postgres:16` image (Debian bookworm variant) sets `ENV LANG en_US.utf8`, generates that locale, and its entrypoint runs `initdb --username=… --pwfile=… $POSTGRES_INITDB_ARGS` **with no `--locale`** → the database is predicted to be `datcollate=en_US.utf8` |
| 5 | `postgres:16` is a **mutable tag**; the image's current `PG_VERSION` is `16.16`, so the CI minor version can change between runs **without any repository change** |
| 6 | A single read-only probe (database row + fingerprint) and a six-index metadata query were **written, executed and validated on PostgreSQL 16.2**; they return exactly one row and eleven rows respectively, as designed |
| 7 | The existing G-3 workflow already uploads `docs/database/g1-spike/option-c/g3-full/out/` as an artifact, and that directory is gitignored — so the probe can persist evidence **without a new upload step and without dirtying the repository** |

**Predicted CI profile** (`INCONCLUSIVE` until measured):
`collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=-`

**Measured CI profile (Revision 2 — observed, Session 18; §17.4):**
`collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41`

Six of seven fields matched the prediction; `datcollversion` did **not** (`2.41`, not NULL), and the image is the
**Debian 13 (trixie)** variant, not bookworm. See §17.4 for the corrections.

**Consequence for the open decisions:** if that prediction holds, CI folds `Ä/ä`, `ẞ/ß`, `İ/i` and
`K`(U+212A)`/k` — i.e. CI is **more permissive than a `C`-locale production database**. CI evidence would then
*overstate* what production enforces, which is the mirror image of Session 15's dump/restore finding. OD-COLL-03
remains **OPEN**; nothing here selects a locale.

**Explicit statements required by the brief:**

- **No CI measurement has been performed.** *(Revision 2: true of Revision 1; the measurement has since been
  executed and read back — §17.4.)* The probe SQL was validated against a **disposable local**
  PostgreSQL 16.2 cluster, which is not CI and not production.
- **No workflow was modified.**
- **No owner collation decision was made.**
- **No production or staging environment was contacted.**
- **No guard implementation was authorised.**

**Register preserved:** G-1 **FAILED** · G-3 **PASSED** · Option C **approved, controlled workflow only** ·
B1a **APPROVED (workflow-scoped)** · B1b **NOT APPROVED** · B1c **NOT APPROVED** · B2 **WITHHELD** ·
0001 **NOT AUTHORIZED for production deployment** · 0002 **DO NOT COMMIT** · G-2 **DEFERRED** ·
OD-17 **OPEN** · OD-21 **OPEN** · OD-NM-1 **OPEN** · OD-COLL-01…06 **OPEN** · R2 **PARTIALLY RESOLVED**.

---

## 2. Objective and authorization boundary

### 2.1 Objective

Task **T1** in `docs/database/phase-04a-database-collation-product-and-environment-decision.md` (§14.2):

> Measure the CI service's actual `pg_database` row (one read-only query in the G-3 workflow).

Its purpose is narrow and specific: **replace an assumption with a fact**, so that OD-COLL-03 (production
locale/provider profile) and OD-COLL-04 (fingerprint fields) can be decided on evidence. The Session 15
document could not fill in the profile because it had no measurement; this session determines exactly what
would have to run, where, and what it would print — and stops there.

### 2.2 Authorization boundary — what was permitted and what was done

| Permitted | Done |
|---|---|
| Read repository files | yes |
| Inspect workflow definitions | yes (both PostgreSQL workflows, in full) |
| Inspect CI run metadata without changing anything | yes (`gh run list`, `gh api …/jobs`) |
| Run read-only SQL against a disposable environment | yes — a local disposable 16.2 cluster, created and destroyed this session |
| Prepare an illustrative diff | yes (§11) |
| Create one documentation file | yes (this file) |

| Forbidden | Observed |
|---|---|
| Modify `.github/workflows/*` | **not modified** |
| Modify any script, `guard.py`, G-3 scripts | **not modified** |
| Modify Prisma schema, migration 0001, create 0002 | **not modified, not created** |
| Modify application code or tests | **not modified** |
| Change PostgreSQL configuration or database locale | **not changed** |
| Create or modify persistent databases | no persistent database exists; the disposable cluster was destroyed |
| Commit, push, PR, merge, deploy | **none performed** |

**Consequence:** because a CI measurement requires a workflow change, the session stops at the exact patch
proposal (§11). The patch is illustrative and **must not be applied on the strength of this document**.

---

## 3. CI workflow architecture

### 3.1 The workflow that owns the acceptance gate

`.github/workflows/phase04a-g3-full-schema-gate.yml` (264 lines). `VERIFIED`

| Aspect | Value |
|---|---|
| `name` | `Phase 04A — G-3 full-schema gate (Option C, real 18-table model)` |
| Triggers | `push` to `main` and `'arena/**'`; `pull_request`; `workflow_dispatch` (`:18–38`) |
| `push` path filters | the workflow itself, `prisma/schema.prisma`, `prisma/migrations/**`, `docs/database/g1-spike/option-c/g3-full/**`, `…/guard.py`, `…/repo-guard.sh`, `package.json`, `package-lock.json` (`:21–29`) |
| `permissions` | `contents: read` (`:40–41`) |
| Job 1 | `repo-guard` — `Workflow enforcement — repository guard`, `ubuntu-24.04`, 5 min, **no database** (`:44–60`) |
| Job 2 | `g3-full` — `G-3 full-schema gate (node ${{ matrix.node }}, postgres 16)`, `ubuntu-24.04`, 40 min, `needs: repo-guard` (`:62–66`) |
| Matrix | `node: ['22']`, `fail-fast: false` (`:68–71`) |

### 3.2 Job 2 steps, in order

| # | Step (line) | Touches a database? |
|---|---|---|
| 1 | `actions/checkout@v4` (`:119`) | no |
| 2 | `actions/setup-node@v4`, node 22 (`:121`) | no |
| 3 | `npm ci` (`:126`) | no |
| 4 | `Assert the pinned Prisma CLI` = `7.10.1` (`:129`) | no |
| 5 | `prisma validate --schema prisma/schema.prisma` (`:143`) | no |
| 6 | `Ensure a PostgreSQL client and report versions` (`:146`) — loops `5432 g3f_main`, `5433 g3f_shadow`, `5434 g3f_replay`, runs `SHOW server_version` on each | **connects, read-only** |
| 7 | `Run the G-3 full-schema gate` (`:168`) — `run.sh` with `--url`, `--shadow-url`, `--replay-url` | **writes** (deploys the migration) |
| 8 | `Independent schema inventory and catalog assertion` (`:180`), `if: always() && steps.g3.outcome != 'skipped'` — loops `5432 g3f_main` and `5434 g3f_replay` | read-only |
| 9 | `Upload artefacts` (`:229`), `if: always()`, path `docs/database/g1-spike/option-c/g3-full/out/` | no |
| 10 | `Job summary` (`:238`), `if: always()` | no |

Note that step 8 deliberately **skips `g3f_shadow`**: the shadow database is consumed by Prisma inside
`run.sh` and is never inspected by the catalog assertion. `VERIFIED` (`:188`)

### 3.3 The second PostgreSQL workflow, for comparison

`.github/workflows/phase04a-real-schema-drift.yml` (353 lines): one job,
`Real-schema drift measurement (node 22, postgres 16)`, **one** `postgres:16` service with
`POSTGRES_USER/PASSWORD/DB` all `drift`, port `5432`, and
`DATABASE_URL=postgresql://drift:drift@localhost:5432/drift` (`:41–61`). It already writes evidence files
into an `$OUT` directory (`00-pg-version.txt`, `02-catalog-before.txt`, …) and uploads them as
`real-schema-drift-evidence` (`:331`). `VERIFIED`

It is a viable alternative host (§10.5), but it is **not** the G-3 acceptance workflow, and it creates only
one database.

### 3.4 What could not be read

| Attempt | Result |
|---|---|
| `gh run list --workflow phase04a-g3-full-schema-gate.yml` | **works** — latest run `45372731345`, `success`, head `0ac7fd26…`, 2026-11-24T10:13:38Z |
| `gh api …/actions/runs/45372731345/jobs` | **works** — both jobs and all steps `success` |
| `gh run view 45372731345 --log` | **fails** — `EOF` from `results-receiver.actions.githubusercontent.com` |
| `gh run download 45372731345 -n phase04a-g3-full-22` | **fails** — `EOF` from `productionresultssa13.blob.core.windows.net`; the artifact exists (49,022 bytes, not expired) but cannot be fetched |

So CI-side evidence is limited to *metadata*: the run exists, it passed, and its steps ran. **No log line and
no artifact content from CI was read in this session.** `VERIFIED`

---

## 4. Actual PostgreSQL service configuration

From `.github/workflows/phase04a-g3-full-schema-gate.yml:73–112` and `:114–116`. `VERIFIED`

| Service | Image | `POSTGRES_USER` | `POSTGRES_PASSWORD` | `POSTGRES_DB` | Host port | Container port | Health check |
|---|---|---|---|---|---|---|---|
| `postgres` | `postgres:16` | `g3` | `g3spike` | **`g3f_main`** | 5432 | 5432 | `pg_isready -U g3`, 5s interval, 20 retries |
| `postgres-shadow` | `postgres:16` | `g3` | `g3spike` | `g3f_shadow` | 5433 | 5432 | same |
| `postgres-replay` | `postgres:16` | `g3` | `g3spike` | `g3f_replay` | 5434 | 5432 | same |

Job environment: `PRISMA_VERSION: '7.10.1'`, `PGPASSWORD: g3spike` (`:114–116`). The workflows connect with
`psql -h localhost -p <port> -U g3 -d <db>` and rely on `PGPASSWORD`, so **no URL and no secret is printed**.

### 4.1 What the configuration does *not* specify

| Setting | Present? | Effect |
|---|---|---|
| `LANG` | **absent in every workflow** (`grep -rn 'LANG\|LC_ALL\|LC_COLLATE' .github/workflows/` → 0 matches) | the image default applies |
| `LC_COLLATE` / `LC_CTYPE` | absent | as above |
| `POSTGRES_INITDB_ARGS` | **absent in every workflow** | `initdb` receives no extra flags |
| Image digest | absent — the tag is `postgres:16` | the tag is **mutable**; the minor version is whatever the registry resolves at pull time |
| `PGDATA` / locale override | absent | image defaults |

### 4.2 What the official image therefore does (documented, not measured here)

Read from the image's own source at `docker-library/postgres`, path `16/bookworm/` (`VERIFIED` as *image
source*, `INCONCLUSIVE` as *this repository's CI*). *(Revision 2: the run measured the **trixie** variant, not
bookworm. This analysis is retained because its `en_US.utf8` prediction held across both variants; the
`PG_VERSION 16.16` figure happened to be the same — §17.4.)*

| Evidence | Source line | Implication |
|---|---|---|
| `echo 'en_US.UTF-8 UTF-8' >> /etc/locale.gen`, `locale-gen`, `locale -a \| grep 'en_US.utf8'` | `16/bookworm/Dockerfile:71–73` | the locale archive contains `en_US.utf8` |
| `ENV LANG en_US.utf8` | `16/bookworm/Dockerfile:74` | the process environment locale is `en_US.utf8` |
| `eval 'initdb --username="$POSTGRES_USER" --pwfile=… '"$POSTGRES_INITDB_ARGS"' "$@"'` | `16/bookworm/docker-entrypoint.sh:92` | **`initdb` is called without `--locale`**, so it derives the locale from `LANG` |
| `ENV PG_VERSION 16.16-1.pgdg12+1` | `16/bookworm/Dockerfile:102` | the current `16` tag is PostgreSQL **16.16**; earlier runs may have used an earlier minor |

**Prediction, not a measurement:** `datlocprovider = 'c'`, `datcollate = 'en_US.utf8'`,
`datctype = 'en_US.utf8'`, `daticulocale = NULL`, `datcollversion = NULL`, `encoding = UTF8`, major `16`.
`INCONCLUSIVE` — it rests on three documented facts (image `LANG`, entrypoint without `--locale`, no workflow
override) but on **zero observation of this repository's CI**. *(Revision 2: the observation now exists. The
locale/provider values held; `datcollversion = NULL` did not — §17.4.)*

**Why a prediction is not enough:** `postgres:16` can change its base image, its `LANG`, or its entrypoint
between runs; `POSTGRES_INITDB_ARGS` could be added to the workflow at any time; and the exact string glibc
records (`en_US.utf8` vs `en_US.UTF-8`) is an implementation detail the catalog will settle and documentation
will not.

---

## 5. Exact database identification

### 5.1 Which database does what

| Database | Port | Used by | Evidence |
|---|---|---|---|
| **`g3f_main`** | 5432 | `run.sh --url postgresql://g3:g3spike@localhost:5432/g3f_main` (`:173`) — the **migration target** and the first database in the independent catalog loop (`:188`) | the only database where the committed migration is deployed and then asserted |
| `g3f_shadow` | 5433 | `--shadow-url` (`:174`) — Prisma's **shadow database**, used internally by the migration tooling inside `run.sh` | never inspected by step 8; its schema state is not asserted anywhere |
| **`g3f_replay`** | 5434 | `--replay-url` (`:175`) — the **replay** database, second database in the catalog loop (`:188`) | a second deployment of the same migration, used to prove replayability |

### 5.2 Answering the brief's specific questions

| Question | Answer | Label |
|---|---|---|
| Which job starts PostgreSQL? | only `g3-full`; `repo-guard` has no services | `VERIFIED` |
| Image and version tag? | `postgres:16`, three times; **tag is mutable**, no digest pin; current image source declares `PG_VERSION 16.16` | `VERIFIED` (tag), `INCONCLUSIVE` (which minor a given run used) |
| Which database is created or selected? | the image creates `POSTGRES_DB` per container: `g3f_main`, `g3f_shadow`, `g3f_replay`; each container also has `postgres`, `template0`, `template1` | `VERIFIED` |
| `postgres`, custom, or multiple? | **three custom databases across three containers**; the image's default `postgres` database is never selected by any step | `VERIFIED` |
| Do migration execution and catalog assertions use the same database? | **yes for `g3f_main`** — `--url` and the first catalog iteration are the same port and database name; `g3f_replay` is asserted too; `g3f_shadow` is not | `VERIFIED` |
| Shadow database or disposable clone? | a shadow **service container** exists, but it is Prisma's shadow database, not a clone of `g3f_main` | `VERIFIED` |
| Any database restored or recreated during the workflow? | no `pg_dump`/`pg_restore`/`createdb` in this workflow; each *job run* starts from fresh containers, and `run.sh` refuses a non-empty primary (`:141–144`) and does `rm -rf "$WORK"` on its output directory (`:150–151`) | `VERIFIED` |

### 5.3 The row that must be measured

```sql
SELECT * FROM pg_database WHERE datname = current_database();   -- on port 5432 → datname = 'g3f_main'
```

- **Primary target:** `g3f_main` on port 5432 — this is the database whose `default` collation governs the
  three collated index keys, **two** of which are collation-sensitive *unique* rules
  (`uq_tags_name_lower`, `uq_colleges_name_lower`); the profile therefore decides their uniqueness
  semantics. The third collated key belongs to `ix_question_assets_checksum`, which is **not unique** —
  collation affects its ordering and comparison only, and no candidate collision analysis follows from it.
  The other three Phase 04A indexes carry no collatable key at all (`indcollation = 0` for all eight of
  their keys; R2 §12.1, and E10 in §9.2 below).
- **Secondary target:** `g3f_replay` on port 5434 — cheap, and it tests an assumption nobody has checked:
  that three independently initialised containers share one profile.
- **Deliberately excluded:** `g3f_shadow` (not asserted by any existing step; optional third iteration) and
  the `postgres` database of any container (never used by the tests).

**Do not measure the image's default `postgres` database.** It exists in all three containers, it has its own
`pg_database` row, and it is not the database the migration or any assertion touches. Measuring it would
answer a question nobody asked and would produce a fingerprint that is *usually* identical — which is exactly
the kind of coincidence that hides a real difference. `VERIFIED` (from §5.1) / `PROPOSED` (rule)

---

## 6. Read-only measurement SQL

### 6.1 Design constraints

| Requirement | How it is met |
|---|---|
| `SELECT`-only | the query reads `pg_database`; no `SET`, no temporary table, no function with side effects |
| Exactly one row | `WHERE d.datname = current_database()` — one catalog row per database |
| Fails clearly when no row matches | the wrapper counts rows and exits non-zero on `0` (a mismatch is a harness bug, not a pass) |
| Never references a nonexistent column | every version-specific field is read through `to_jsonb(d)`, so an absent column yields `false`/`null` instead of a parse error |
| No secrets | prints only catalog values and `current_setting('server_version*')`; never a URL, user, password or environment variable |
| Machine-readable | one JSON object on stdout, ready to be written to a file and uploaded |
| Distinguishes "absent" from "NULL" | an explicit `fields_present` object |
| Portable to older/newer majors | see §7 |

### 6.2 The probe (validated on PostgreSQL 16.2)

```sql
SELECT jsonb_pretty(jsonb_build_object(
  'probe',              'collation-profile/v1',
  'current_database',   current_database(),
  'server_version',     current_setting('server_version'),
  'server_version_num', current_setting('server_version_num'),
  'pg_major',           (current_setting('server_version_num')::int / 10000),
  'encoding',           pg_encoding_to_char(d.encoding),
  'datlocprovider',     to_jsonb(d) ->> 'datlocprovider',
  'datcollate',         d.datcollate,
  'datctype',           d.datctype,
  'daticulocale',       to_jsonb(d) ->> 'daticulocale',
  'datcollversion',     to_jsonb(d) ->> 'datcollversion',
  'fields_present', jsonb_build_object(
     'datlocprovider', (to_jsonb(d) ? 'datlocprovider'),
     'daticulocale',   (to_jsonb(d) ? 'daticulocale'),
     'datcollversion', (to_jsonb(d) ? 'datcollversion'))
))
FROM pg_database d
WHERE d.datname = current_database();
```

`datcollate` and `datctype` are read as ordinary columns: they have existed since PostgreSQL 8.4 and are not
among the version-sensitive fields. Everything added in 15 (`datlocprovider`, `daticulocale`, `datcollversion`)
is read through `to_jsonb`. `PROPOSED` (portability rationale) / `VERIFIED` (executed)

### 6.3 The canonical fingerprint, computed by the same query

```sql
SELECT 'collation-fingerprint/v1'
    || ';pg='         || (current_setting('server_version_num')::int / 10000)
    || ';enc='        || pg_encoding_to_char(d.encoding)
    || ';provider='   || CASE to_jsonb(d) ->> 'datlocprovider'
                            WHEN 'c' THEN 'libc' WHEN 'i' THEN 'icu'
                            WHEN 'b' THEN 'builtin' ELSE 'unknown' END
    || ';collate='    || coalesce(d.datcollate, '-')
    || ';ctype='      || coalesce(d.datctype, '-')
    || ';iculocale='  || coalesce(to_jsonb(d) ->> 'daticulocale', '-')
    || ';collversion='|| coalesce(to_jsonb(d) ->> 'datcollversion', '-')
FROM pg_database d
WHERE d.datname = current_database();
```

Executed on the disposable cluster, this produced:

```text
collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=C.utf8;ctype=C.utf8;iculocale=-;collversion=-
```

which is byte-identical in shape to the Session 15 specification (§8.3 there). `VERIFIED`

### 6.4 Why `to_jsonb(d) ? 'column'` rather than a version test

Three alternatives were considered and rejected:

| Alternative | Why rejected |
|---|---|
| `SELECT datlocprovider …` directly | **parse error** on a server without the column — the query would fail for the whole probe, converting a missing field into a failed measurement |
| Branch on `current_setting('server_version_num')` in the shell | duplicated version knowledge in two places; a future major silently falls into the wrong branch |
| `information_schema.columns` lookup first | extra round trip, and `pg_database` is a catalog whose columns `information_schema` does not cover |

`to_jsonb(record)` serialises whatever columns the row actually has, so a missing key is simply absent, and
`?` reports presence. The technique was tested both ways on 16.2: `to_jsonb(d) ? 'datlocprovider'` → `true`,
and `to_jsonb(d) ? 'colllocale'` (a name this major does not have) → `false` with a `NULL` value and **no
error**. `VERIFIED`

---

## 7. PostgreSQL version compatibility

### 7.1 What CI will run

| Fact | Value | Label |
|---|---|---|
| Tag | `postgres:16` | `VERIFIED` |
| Digest pin | none | `VERIFIED` |
| Image variant | Debian (no `-alpine` suffix) | `VERIFIED` |
| Current `16` build's `PG_VERSION` | `16.16-1.pgdg12+1` | `VERIFIED` (image source, not this repo's runs) |
| Minor version used by the run that closed G-3 | **unknown** — logs unreachable | `INCONCLUSIVE` |
| Minor version measured for run `45546248909` | **`16.16 (Debian 16.16-1.pgdg13+1)`** — Revision 2, §17.4 | `VERIFIED` |
| Image distro variant | **Debian 13 (trixie)** — not the `bookworm` variant analysed in §4 | `VERIFIED` |
| Will the minor change between runs? | **yes, without any repository change** | `VERIFIED` (mutable tag) |

### 7.2 Field availability

| Field | 16.2 | 15 | 17 | 18 | Notes |
|---|---|---|---|---|---|
| `pg_database.encoding` | present | `NOT TESTED` | `NOT TESTED` | `NOT TESTED` | ancient; read as a plain column |
| `pg_database.datcollate` | present | `NOT TESTED` | `NOT TESTED` | `NOT TESTED` | ancient |
| `pg_database.datctype` | present | `NOT TESTED` | `NOT TESTED` | `NOT TESTED` | ancient |
| `pg_database.datlocprovider` | present (`c`) | `NOT TESTED` | `NOT TESTED` | `NOT TESTED` | read via `to_jsonb` |
| `pg_database.daticulocale` | present (`NULL`) | `NOT TESTED` | `NOT TESTED` | `NOT TESTED` | read via `to_jsonb` |
| `pg_database.datcollversion` | present (`NULL`) | `NOT TESTED` | `NOT TESTED` | `NOT TESTED` | read via `to_jsonb` |
| `pg_collation.colliculocale` / `collicurules` | present | `NOT TESTED` | `NOT TESTED` | `NOT TESTED` | used only by the index query (§9); may be renamed in newer majors |

**No claim of cross-version compatibility is made.** Only 16.2 was executed. The design choice is defensive:
anything version-sensitive is read through `to_jsonb`, so on an older or newer server the probe returns a
*fact* (`fields_present: false`, value `null`) rather than a parse error — and a `false` in `fields_present`
must be treated by any future consumer as **"this server cannot be fingerprinted"**, not as a pass.

### 7.3 Does the probe depend on the exact CI minor version?

No. The probe's columns and functions (`jsonb_build_object`, `to_jsonb`, `pg_encoding_to_char`, integer
division) are all far older than 15. The **fingerprint value** depends on the minor only in that a different
image build could ship a different `LANG` — which is precisely the drift the fingerprint exists to expose.

---

## 8. Database fingerprint evaluation

### 8.1 Field-by-field, against the predicted CI environment

| Field | Session 15 status | Predicted CI value | Measures semantics? | Nullable in practice | Verdict |
|---|---|---|---|---|---|
| `pg` (major) | required | `16` | indirectly (catalog shape, provider support) | no | **keep** — stable and cheap |
| `enc` | required | `UTF8` | yes (byte semantics of any fold) | no | **keep** |
| `provider` | required | `libc` (from `c`) | yes — decides who implements `lower()` | no | **keep**, but the raw `"char"` must be mapped to a word (§8.6) |
| `datcollate` | required | predicted `en_US.utf8` | **yes** — the guarantee itself | NULL for ICU databases | **keep** |
| `datctype` | required | predicted `en_US.utf8` | **yes** — `lower()`/`upper()` follow ctype | NULL for ICU databases | **keep** — not redundant with `datcollate` |
| `daticulocale` | required | predicted `NULL` | yes for ICU profiles | routinely NULL | **keep**, NULL sentinel required |
| `datcollversion` | recorded, never a pass condition | predicted `NULL` — **observed `2.41`** | version of the collation library, where available | NULL on some libc builds, **populated on others** (Revision 2) | **keep as evidence** — it does carry discriminating power in the measured CI image; the conclusion in this cell is **superseded**, see §17.4 |

`VERIFIED` for the 16.2 column behaviour. *(Revision 2: the CI column is no longer `INCONCLUSIVE` — it was
measured, and one cell above was wrong. §17.4.)*

### 8.2 Evaluation of the specific questions the brief asks

| Question | Answer |
|---|---|
| Which fields are present in the actual CI environment? | **unknown** — that is the measurement. All six are present on 16.2; on the predicted `postgres:16` they will all be present. `INCONCLUSIVE` *(Revision 2: all seven fingerprint fields were read back in CI — §17.4)* |
| Which fields are NULL? | predicted `daticulocale` and `datcollversion`; `datcollate`/`datctype` NULL would indicate an ICU database, which the image does not create. `INCONCLUSIVE` *(Revision 2: only `daticulocale` was NULL; `datcollversion` is `2.41` — §17.4)* |
| Which are provider-specific? | `datcollate`/`datctype` are libc-specific; `daticulocale` is ICU-specific; `datcollversion` carries an ICU version for ICU databases and (measured) nothing for libc. `VERIFIED` (16.2) |
| Is the `-` NULL sentinel unambiguous? | **Almost.** It is unambiguous against catalog values, but a locale string equal to `-` would collide. Fix in §8.6: reject a raw value that equals the sentinel. |
| Is the canonical field order deterministic? | yes — fixed order in the SQL, no map iteration, no JSON object ordering involved |
| Can the CI result be reproduced in later runs? | **only while the image is unchanged.** `postgres:16` is mutable, so the fingerprint can change with no commit; the probe makes that visible, which is its purpose. Reproducibility therefore means "the same inputs produce the same string", not "the string never changes". |
| Should a changed field fail CI or require explicit review? | **phase 1 (this probe): neither — it measures and reports.** Phase 2 (after OD-COLL-04/05): a change in a *known* field fails; a NULL-vs-value change warns. Deciding the policy is OD-COLL-05, which is **OPEN**. |

### 8.3 Does the predicted profile match Session 15's assumptions?

Session 15 assigned no CI value; its only environment measurements were of the disposable cluster (`C` and
`C.utf8`) and its contract left the locale blank on purpose (§7.6 there). So there is **no contradiction** —
but there is a substantive implication the owner should see:

| Session 15 observation | If CI is `en_US.utf8` |
|---|---|
| `C` locale folds ASCII only (`Ä/ä`, `ẞ/ß`, `İ/i`, `K`/`k` all distinct) | CI would fold all four pairs |
| `C.utf8` folds `Ä/ä`, `ẞ/ß`, `İ/i`, `K`/`k` | same as CI — **if** glibc's `en_US.utf8` and `C.utf8` agree |
| G-3 cases 30/32 are ASCII-only | they pass under both profiles, so `G-3 PASSED` still does not discriminate |
| A restore into a `C` database **weakens** the guarantee (Session 15 E8) | CI on `en_US.utf8` and production on `C` would produce the **same** weakening, but with the direction reversed: CI would look stricter than production |

**A specific untested question remains:** do glibc's `en_US.utf8` and `C.utf8` fold identically? Session 15
measured `C.utf8`; `en_US.utf8` is **not installed in this sandbox** (`locale -a` → `C`, `C.utf8`, `POSIX`
only), so the comparison could not be made. `NOT TESTED`. A difference is plausible for `İ` and for
`Ỻ`-style cases, and it would mean the CI fingerprint and the production fingerprint must both be measured
rather than one inferred from the other.

### 8.4 What the fingerprint will *not* tell us

- It will not distinguish "libc 2.36" from "libc 2.38" — `datcollversion` is NULL for both (`VERIFIED` 16.2).
- It will not reveal the image digest or the exact minor build.
- It will not say whether `lower()` behaves as Session 15 measured — that needs either the same locale or a
  behavioural test (out of scope; a *unique index* is the only real proof).

### 8.5 Proposed comparison policy (phase 2, not implemented)

| Situation | Action |
|---|---|
| No approved fingerprint exists | report only; no failure (this is the current state — OD-COLL-03/04 are OPEN) |
| Approved fingerprint exists and matches | pass |
| Approved fingerprint exists and a known field differs | **fail**, message names the field(s) |
| A field is `null`/absent on either side | **warn**, never pass silently |
| `fields_present` shows a required field absent | **fail** — the server cannot be fingerprinted |

`PROPOSED`; the *decision* to adopt it is OD-COLL-05.

### 8.6 Proposed correction to the Session 15 specification (documented, not applied)

The brief forbids silently changing the Session 15 fingerprint, so this is recorded as a **separate
proposal**. Two clarifications emerged from building the query:

| # | Issue | Proposed correction |
|---|---|---|
| C1 | `datlocprovider` is a `"char"` (`c`/`i`/`b`); the Session 15 document shows the word `libc` in the canonical string but never defines the mapping | define `c→libc`, `i→icu`, `b→builtin`, anything else → `unknown` (and `unknown` must fail, not pass) |
| C2 | `datcollate`/`datctype` are OS-provided strings; `en_US.utf8` and `en_US.UTF-8` name the same glibc locale but compare unequal | keep the **verbatim** string in the fingerprint for diagnostics, and additionally compare a **normalised key** (lower-cased, `utf-8`→`utf8`) so a spelling-only difference does not fail the gate as if it were semantic |
| C3 | `-` is used as the NULL sentinel; a value that literally equals `-` would be ambiguous | reject a raw value equal to `-`, or escape it (e.g. `\-`); the probe reports the verbatim value, the comparison layer enforces this |

`PROPOSED`. None of these changes the meaning of the fingerprint; they make it implementable without
ambiguity. Whether to adopt them is OD-COLL-04.

---

## 9. Six-index metadata measurement proposal

### 9.1 Can it be done read-only? Yes

`pg_index`, `pg_class`, `pg_attribute`, `pg_collation` and `pg_opclass` are all readable with `SELECT`. The
query below was executed against a disposable 16.2 database with migration 0001 applied, and returned **11
rows** (eight non-collatable keys, three `default` keys). `VERIFIED`

### 9.2 The query

```sql
WITH approved(name) AS (VALUES
  ('uq_question_versions_one_published_per_question'),('uq_question_sources_identity'),
  ('uq_topics_chapter_order'),('uq_tags_name_lower'),
  ('uq_colleges_name_lower'),('ix_question_assets_checksum'))
SELECT a.name                                   AS index_name,
       i.indrelid::regclass::text               AS table_name,
       (i.indexrelid IS NOT NULL)               AS exists,
       i.indisunique                            AS is_unique,
       i.indisvalid                             AS is_valid,
       i.indisready                             AS is_ready,
       i.indislive                              AS is_live,
       i.indnkeyatts                            AS key_count,
       k.ord                                    AS key_ord,
       CASE WHEN i.indkey[k.ord - 1] = 0 THEN 'expression' ELSE 'column' END AS key_kind,
       i.indcollation[k.ord - 1]                AS collation_oid,
       coalesce(c.collnamespace::regnamespace::text || '.' || c.collname, '-') AS collation,
       coalesce(c.collprovider::text, '-')      AS provider,
       c.collisdeterministic                    AS deterministic,
       coalesce(c.collcollate, '-')             AS collate,
       coalesce(c.collctype, '-')               AS ctype,
       coalesce(c.collversion, '-')             AS collation_version,
       coalesce(o.opcname, '-')                 AS opclass
FROM approved a
LEFT JOIN pg_index   i ON i.indexrelid = to_regclass('public.' || quote_ident(a.name))
LEFT JOIN LATERAL generate_series(1, coalesce(i.indnkeyatts, 1)) k(ord) ON true
LEFT JOIN pg_collation c ON c.oid = i.indcollation[k.ord - 1]
LEFT JOIN pg_opclass    o ON o.oid = i.indclass[k.ord - 1]
ORDER BY a.name, k.ord;
```

Three implementation details that matter, each found by running it:

1. **`int2vector`/`oidvector` are 0-based**, so key `ord` (1-based, from `generate_series`) is
   `indcollation[ord - 1]`. Using `[ord]` silently reads the wrong key. `VERIFIED`
2. **The array length is `indnkeyatts`, not `indnatts`** — an INCLUDE index would otherwise read past the end
   (Session 14 §3.3).
3. **`LEFT JOIN LATERAL generate_series(1, coalesce(i.indnkeyatts, 1))`** keeps a *missing* index in the
   output as `exists = false` instead of dropping the row — a missing index must be visible, not absent from
   the report. Verified with a deliberately bogus name. `VERIFIED`

### 9.3 Observed output (disposable 16.2 database with migration 0001, `C.utf8`)

```text
 index_name                    | table_name        | exists | is_unique | key_count | key_ord | key_kind   | collation_oid | collation          | provider | opclass
-------------------------------+-------------------+--------+-----------+-----------+---------+------------+---------------+--------------------+----------+------------
 ix_question_assets_checksum   | question_assets   | t      | f         |         1 |       1 | column     |           100 | pg_catalog.default | d        | text_ops
 uq_colleges_name_lower        | colleges          | t      | t         |         1 |       1 | expression |           100 | pg_catalog.default | d        | text_ops
 uq_question_sources_identity  | question_sources  | t      | t         |         5 |     1–5 | column     |             0 | -                  | -        | uuid_ops / enum_ops
 uq_question_versions_one_…    | question_versions | t      | t         |         1 |       1 | column     |             0 | -                  | -        | uuid_ops
 uq_tags_name_lower            | tags              | t      | t         |         1 |       1 | expression |           100 | pg_catalog.default | d        | text_ops
 uq_topics_chapter_order       | topics            | t      | t         |         2 |     1–2 | column     |             0 | -                  | -        | uuid_ops / int4_ops
```

`VERIFIED` (11 rows in the real run; the ranges above are condensed for width).

### 9.4 Limitations of index-level measurement — stated, not glossed

| Limitation | Consequence |
|---|---|
| A collation **OID** is not semantic equivalence | `pg_catalog."C"` (950) and `alt."C"` (16416) differ in OID but behave identically (Session 14 §5.5); the resolved name + provider + locale columns are what make it interpretable, and the **database fingerprint is still required** to know what `default` means |
| Expression keys have no column to compare against | `key_kind = 'expression'` is reported, but the expression's *source* column is not recoverable from the catalog (Session 14 §6.1) |
| `indcollation[k] = 0` is not missing data | it means "this type is not collatable"; the query reports `collation = '-'`, which must be read as *expected* for uuid/enum/int4, never as an error |
| `collversion` is NULL for every libc collation measured | reported as `-`; carries no information here |
| The query does not prove the index is used or that the operator behaves as intended | it describes a definition, not a behaviour |
| `oid` renders as a **string** in JSON (`"100"`) | a consumer wanting a number must cast `indcollation[k-1]::int`; documented rather than silently changed |

### 9.5 Separation from the fingerprint

The two measurements are emitted **as two separate documents** (`collation-profile-<db>.json` and
`collation-indexes-<db>.json`) and are never merged into one string. Rationale (Session 15 §8.2 and §11):
merging them makes a single failure ambiguous between "the database moved" and "the index changed", which are
different classes with different remedies. `PROPOSED`

---

## 10. Recommended CI insertion point

### 10.1 Candidate hosts

| Host | Pros | Cons | Verdict |
|---|---|---|---|
| **`phase04a-g3-full-schema-gate.yml` → job `g3-full`** | already has all three databases; already has `psql`; already uploads an artifact from a gitignored directory; the brief's stated preference | it is the job whose success underwrites `G-3 PASSED` and therefore B1a — any edit must not change what the gate proves | **primary** |
| `phase04a-real-schema-drift.yml` | already writes evidence files to `$OUT` and uploads them; not load-bearing for B1a | only one database; different job identity; a second place to maintain | **alternative** (§10.5) |
| A new workflow | isolation | explicitly discouraged by the brief; duplicates service setup and adds a maintenance surface | **rejected** |

### 10.2 Exact insertion point

Insert **one step after** `Independent schema inventory and catalog assertion` (ends `:227`) and **before**
`Upload artefacts` (`:229`).

Why exactly there:

| Constraint | Reason |
|---|---|
| **After** the gate step | `run.sh` does `rm -rf "$WORK"` where `WORK="${WORK:-$G3F_DIR/out}"` (`:150–151`) — anything written into the artifact directory *before* the gate is deleted. Verified by reading `run.sh`. `VERIFIED` |
| **After** the migration has been deployed | the index query needs the six indexes to exist; before the gate they do not |
| **Before** `Upload artefacts` | so the JSON files land in the existing artifact without a new upload step |
| **Guarded by `if: always() && steps.g3.outcome != 'skipped'`** | mirrors the existing inventory step: measure even when the gate failed (a partial deployment is still worth profiling), but do not pretend to measure when the step never ran |
| **Not `continue-on-error`** | a SQL error or a missing `pg_database` row must fail the step; only *drift* is non-fatal, and drift detection is phase 2 |

### 10.3 Once per job or once per database?

**Once per job, looping over two databases** (`g3f_main` on 5432 and `g3f_replay` on 5434) — mirroring the
existing inventory loop exactly. This costs two extra `psql` invocations and answers a question nobody has
checked: whether three independently initialised containers share one profile. `g3f_shadow` may be added as a
third iteration later; it is excluded now because no existing step measures it.

### 10.4 Artifact retention

No new upload step: the existing `Upload artefacts` step (`:229–236`) already uploads
`docs/database/g1-spike/option-c/g3-full/out/` with `if-no-files-found: warn` and `retention-days: 90`. The
new files simply appear there. `VERIFIED` (`:229–236`, `.gitignore:53`)

### 10.5 If the G-3 workflow must not be touched

The drift workflow can host the same probe: it has `psql`, `DATABASE_URL`, an `$OUT` directory and an
artifact upload. The step would be placed after `Capture the catalog BEFORE` (`:108–134`) and before
`Capture the catalog AFTER` (`:229`), so the environment is recorded in the same evidence bundle as the
catalog snapshots. Trade-off: one database instead of two, and the probe's evidence is split across two
workflows instead of one.

---

## 11. Exact illustrative patch

**This patch is NOT applied.** It is shown so a future authorised session can apply it verbatim or reject it
with full information.

### 11.1 Files

| # | File | Change | Lines (approx.) |
|---|---|---|---|
| 1 | `docs/database/g1-spike/option-c/g3-full/collation-probe.sh` | **new** — the probe wrapper (SQL + row-count assertion + JSON output) | +95 |
| 2 | `.github/workflows/phase04a-g3-full-schema-gate.yml` | **modified** — one step inserted between `:227` and `:229` | +12 |

No other file changes. The new script is already covered by the workflow's `paths:` filters
(`'docs/database/g1-spike/option-c/g3-full/**'`, `:25` and `:35`), so no trigger edit is needed. `VERIFIED`

### 11.2 Why a script rather than inline SQL

| Reason | Detail |
|---|---|
| The SQL is ~40 lines with `'` and `$` characters | YAML block scalars mangle `$` and quoting subtly; a shell file is testable with `bash -n` and runnable locally |
| **Testability** | the script can be run against any disposable database before CI exists |
| Consistency | every other G-3 check lives in `g3-full/` as a script (`run.sh`, `enforce.sql`, `local-verify.sh`) |

The inline alternative is shown in §11.5 for completeness; it is longer in YAML and not locally testable.

### 11.3 Diff — new file

```diff
--- /dev/null
+++ b/docs/database/g1-spike/option-c/g3-full/collation-probe.sh
@@ -0,0 +1,95 @@
+#!/usr/bin/env bash
+# =====================================================================
+# Read-only PostgreSQL collation profile probe (Phase 04A, task T1).
+#
+#   ./collation-probe.sh --out <dir> [--port 5432 --db g3f_main] ...
+#
+# PRINTS AND WRITES EVIDENCE ONLY. It never modifies the database, never
+# prints a connection string or a password, and never decides whether the
+# environment is approved — there is no approved profile yet (OD-COLL-03
+# and OD-COLL-04 are OPEN).
+#
+# Exit codes: 0 = measured, 1 = measurement failed (SQL error, or the
+#             pg_database row could not be found / was not unique),
+#             2 = usage error.
+# =====================================================================
+set -Eeuo pipefail
+
+OUT="."
+PSQL="${PSQL:-psql}"
+TARGETS=()
+
+usage() { sed -n '2,12p' "${BASH_SOURCE[0]}" >&2; exit 2; }
+
+while [ $# -gt 0 ]; do
+  case "$1" in
+    --out) OUT="${2:-}"; shift 2 ;;
+    --port-db) TARGETS+=("${2:-}"); shift 2 ;;
+    -h|--help) usage ;;
+    *) echo "unknown argument: $1" >&2; usage ;;
+  esac
+done
+[ -n "$OUT" ] || usage
+[ "${#TARGETS[@]}" -gt 0 ] || usage
+mkdir -p "$OUT"
+
+# --- the database row, read without ever naming a version-specific column
+PROFILE_SQL=$(cat <<'SQL'
+SELECT jsonb_pretty(jsonb_build_object(
+  'probe',              'collation-profile/v1',
+  'current_database',   current_database(),
+  'server_version',     current_setting('server_version'),
+  'server_version_num', current_setting('server_version_num'),
+  'pg_major',           (current_setting('server_version_num')::int / 10000),
+  'encoding',           pg_encoding_to_char(d.encoding),
+  'datlocprovider',     to_jsonb(d) ->> 'datlocprovider',
+  'datcollate',         d.datcollate,
+  'datctype',           d.datctype,
+  'daticulocale',       to_jsonb(d) ->> 'daticulocale',
+  'datcollversion',     to_jsonb(d) ->> 'datcollversion',
+  'fields_present', jsonb_build_object(
+     'datlocprovider', (to_jsonb(d) ? 'datlocprovider'),
+     'daticulocale',   (to_jsonb(d) ? 'daticulocale'),
+     'datcollversion', (to_jsonb(d) ? 'datcollversion'))
+))
+FROM pg_database d
+WHERE d.datname = current_database();
+SQL
+)
+
+# --- the canonical fingerprint string, same rules, same order
+FINGERPRINT_SQL=$(cat <<'SQL'
+SELECT 'collation-fingerprint/v1'
+    || ';pg='          || (current_setting('server_version_num')::int / 10000)
+    || ';enc='         || pg_encoding_to_char(d.encoding)
+    || ';provider='    || CASE to_jsonb(d) ->> 'datlocprovider'
+                              WHEN 'c' THEN 'libc' WHEN 'i' THEN 'icu'
+                              WHEN 'b' THEN 'builtin' ELSE 'unknown' END
+    || ';collate='     || coalesce(d.datcollate, '-')
+    || ';ctype='       || coalesce(d.datctype, '-')
+    || ';iculocale='   || coalesce(to_jsonb(d) ->> 'daticulocale', '-')
+    || ';collversion=' || coalesce(to_jsonb(d) ->> 'datcollversion', '-')
+FROM pg_database d
+WHERE d.datname = current_database();
+SQL
+)
+
+rc=0
+for target in "${TARGETS[@]}"; do
+  port="${target%%:*}"; db="${target##*:}"
+  prof="$OUT/collation-profile-$db.json"
+  fp="$OUT/collation-fingerprint-$db.txt"
+  rows="$("$PSQL" -h localhost -p "$port" -U "${PGUSER:-g3}" -d "$db" -Atq \
+            -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_database WHERE datname = current_database();")" \
+    || { echo "::error::collation probe: cannot read pg_database in $db on $port" >&2; rc=1; continue; }
+  if [ "$rows" != "1" ]; then
+    echo "::error::collation probe: $db on $port has $rows pg_database rows, expected 1" >&2
+    rc=1; continue
+  fi
+  "$PSQL" -h localhost -p "$port" -U "${PGUSER:-g3}" -d "$db" -Atq \
+      -v ON_ERROR_STOP=1 -c "$PROFILE_SQL" > "$prof" \
+    || { echo "::error::collation probe: profile query failed in $db" >&2; rc=1; continue; }
+  "$PSQL" -h localhost -p "$port" -U "${PGUSER:-g3}" -d "$db" -Atq \
+      -v ON_ERROR_STOP=1 -c "$FINGERPRINT_SQL" > "$fp" \
+    || { echo "::error::collation probe: fingerprint query failed in $db" >&2; rc=1; continue; }
+  echo "--- $db ($port): $(cat "$fp")"
+  sed -n '1,12p' "$prof"
+done
+exit $rc
```

### 11.4 Diff — workflow step

```diff
--- a/.github/workflows/phase04a-g3-full-schema-gate.yml
+++ b/.github/workflows/phase04a-g3-full-schema-gate.yml
@@ -226,6 +226,18 @@ jobs:
           done
           exit $rc
 
+      # READ-ONLY measurement of the database collation profile and of the
+      # per-key collation metadata of the six approved indexes. Writes only
+      # into the artifact directory (gitignored) — no new upload step, no new
+      # secret, no database change. It does NOT compare against an approved
+      # profile: none exists (OD-COLL-03/OD-COLL-04 are OPEN), so a mismatch
+      # here would be a failure with nothing to fail against.
+      - name: Measure the PostgreSQL collation profile (read-only)
+        if: always() && steps.g3.outcome != 'skipped'
+        run: |
+          set -euo pipefail
+          bash docs/database/g1-spike/option-c/g3-full/collation-probe.sh \
+            --out docs/database/g1-spike/option-c/g3-full/out \
+            --port-db 5432:g3f_main \
+            --port-db 5434:g3f_replay
+
       - name: Upload artefacts
         if: always()
         uses: actions/upload-artifact@v4
```

### 11.5 Alternative — inline SQL, no new file

If a new file is unacceptable, the same measurement can be one `run:` block that inlines only the fingerprint
query (the JSON profile can be derived from the same row). It is ~25 YAML lines, harder to test locally, and
must escape `$` as `$$` in several places. **Not recommended**, but it requires touching exactly one file.

### 11.6 What the patch deliberately does not do

| Not done | Why |
|---|---|
| No comparison against an approved fingerprint | none exists; OD-COLL-03/04 are **OPEN** |
| No `exit 1` on a surprising profile | phase 1 measures; failing on the first run would block the gate for a reason nobody has authorised |
| No new secret, service, dependency or credential | the step reuses `PGPASSWORD` and `psql` already present |
| No change to any assertion, criterion, or artifact path | the gate's verdict must remain exactly what it was |
| No index-corruption detection | that is the guard's job, and R2 is only PARTIALLY RESOLVED |

---

## 12. Expected output and failure behavior

### 12.1 Expected success output (shape observed on the disposable cluster)

```text
--- g3f_main (5432): collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=<MEASURED>;ctype=<MEASURED>;iculocale=-;collversion=-
{
    "probe": "collation-profile/v1",
    "current_database": "g3f_main",
    "server_version": "16.x",
    "server_version_num": "16xxxx",
    "pg_major": 16,
    "encoding": "UTF8",
    "datlocprovider": "c",
    "datcollate": "<MEASURED>",
    "datctype": "<MEASURED>",
    "daticulocale": null,
    "datcollversion": null,
    "fields_present": { "daticulocale": true, "datcollversion": true, "datlocprovider": true }
}
--- g3f_replay (5434): collation-fingerprint/v1;...
```

`<MEASURED>` is **deliberately not filled in**: the values are the output of the measurement, and this
document must not pre-empt them. The local run produced `C.utf8` only because the disposable database was
created that way; that is **not** evidence about CI. `VERIFIED` (shape) / `NOT TESTED` (CI values)

### 12.2 Failure behaviour

| Situation | Behaviour | Exit |
|---|---|---|
| `psql` cannot connect | `::error::collation probe: cannot read pg_database in <db> on <port>`; other targets still attempted; step fails | 1 |
| `pg_database` has 0 or >1 row for `current_database()` | `::error::… has N pg_database rows, expected 1` | 1 |
| Profile or fingerprint query errors | `::error::… query failed in <db>` | 1 |
| `fields_present` reports `false` for a required field | **not** a step failure in phase 1 — it is printed as evidence; a consumer must treat it as "cannot fingerprint" | 0 |
| A surprising locale (e.g. `C` instead of `en_US.utf8`) | **not** a failure in phase 1 — printed and recorded | 0 |
| An index is missing | the index query reports `exists = false`; no step failure (the gate already covers existence) | 0 |

The asymmetry is intentional: the probe **cannot** fail for a reason that has no approved threshold. It fails
only when it did not measure what it claims to have measured.

### 12.3 Where the evidence lands

| Destination | Content | Fetched by |
|---|---|---|
| `…/g3-full/out/collation-profile-<db>.json` | the full JSON object | existing `Upload artefacts` (`:229`), 90-day retention |
| `…/g3-full/out/collation-fingerprint-<db>.txt` | the canonical one-line string | same |
| Step log | both, echoed | console |
| Job summary | **not** written by this patch (would require editing the summary step) | — |

---

## 13. Security and operational impact

| Concern | Assessment |
|---|---|
| New secrets or credentials | **none** — the step reuses the job's `PGPASSWORD: g3spike` and the `psql` binary already installed at `:146–152` |
| Credential exposure | the probe never prints a URL, user or password; `current_user` is deliberately **omitted** from the shipped SQL (§6.2 shows the field only as an option) to keep the artifact free of identity data |
| Read/write scope | `SELECT` on `pg_database` (and, in the index query, on `pg_index`/`pg_class`/`pg_collation`/`pg_opclass`); no DDL, no DML, no `SET`, no temporary objects |
| Effect on the gate | none — the step runs after the gate, asserts nothing about the schema, and cannot change the gate's verdict; it can only fail on its own measurement errors |
| Run time | two `psql` round trips per database; well under a second on a local socket-to-container connection |
| Artifact size | two small text files per database (< 4 KB); the existing artifact is 49 KB |
| Repository cleanliness | the output directory is gitignored (`.gitignore:53`), so the working tree cannot be dirtied |
| Failure blast radius | a failure fails a job that is **already** the gate job; it does not touch production, other workflows, or the other two services |
| Production risk | **none** — the workflow is disposable-only and `run.sh` refuses non-disposable URLs (`:146–149`) |

`PROPOSED` / `VERIFIED` (existing configuration)

---

## 14. Limitations and untested scenarios

| # | Limitation | Consequence | Label |
|---|---|---|---|
| L1 | **The CI profile has not been measured** | every CI value in this document is a prediction | `INCONCLUSIVE` |
| L2 | CI logs and artifacts are unreachable from this sandbox | even the `SHOW server_version` output that CI already prints could not be read | `VERIFIED` (unreachable) |
| L3 | `postgres:16` is a **mutable** tag | the profile can change without a commit; a single measurement is a snapshot, not a guarantee | `VERIFIED` |
| L4 | `en_US.utf8` is **not installed** in this sandbox | the predicted CI fold could not be compared with the measured `C.utf8` fold | `NOT TESTED` |
| L5 | No ICU in the local build | `datlocprovider = 'i'`, `daticulocale` and non-deterministic collations remain unobserved | `NOT TESTED` |
| L6 | PostgreSQL 15, 17, 18 | not obtainable here; all cross-version statements are documentation-based | `NOT TESTED` |
| L7 | The probe describes a **definition**, not a behaviour | it cannot prove that `lower()` folds a given character in the CI database | `PROPOSED` (by design) |
| L8 | One run is not a trend | a single artifact cannot distinguish "this is the profile" from "this is today's profile" | `PROPOSED` (repeat over time) |
| L9 | The index query's `collation_oid` renders as a JSON **string** | consumers must cast or compare as text | `VERIFIED` |
| L10 | No comparison policy exists yet | the probe's output is inert evidence until OD-COLL-04/05 are decided | `OPEN OWNER DECISION` |

**What is explicitly not inferred:** production is not inferred from CI (§8.3); PostgreSQL 15/17/18
compatibility is not inferred from 16; ICU support is not inferred from a libc-only build; and the CI profile
is **not** claimed to be the production profile.

---

## 15. Required authorization for implementation

| # | Authorisation needed | From whom | Why it cannot be inferred |
|---|---|---|---|
| A1 | Permission to modify `.github/workflows/phase04a-g3-full-schema-gate.yml` by one step | owner | the workflow is the evidence base for `G-3 PASSED`, which underwrites B1a; edits to it are not routine |
| A2 | Permission to add `docs/database/g1-spike/option-c/g3-full/collation-probe.sh` | owner | a new executed surface, covered by the repo-guard's scan (`repo-guard.sh`) |
| A3 | Agreement that the probe is **measure-only** in phase 1 | owner | it must not encode a policy that OD-COLL-05 has not decided |
| A4 | *(Not required for the probe)* OD-COLL-03/04/05 | owner | needed only before any **comparison** is added (phase 2) |

**What this session's authorisation does not extend to:** applying the patch, running the workflow, reading
its output as if it had been read, or treating a prediction as a measurement.

**What the patch would NOT authorise even if applied:** guard implementation (R2 remains PARTIALLY RESOLVED),
any change to migration 0001 or 0002, any production deployment (B2 WITHHELD), or any owner decision.

---

## 16. Recommended next step

1. **Owner approves A1 + A2** (one step, one script, no secrets).
2. A short code session applies the patch from §11 verbatim and opens a PR; the `paths:` filter already
   triggers the workflow, so the run starts on push without any extra configuration.
3. **Read the artifact** `phase04a-g3-full-22` → `collation-profile-g3f_main.json` and
   `collation-fingerprint-g3f_main.txt`.
4. Record the measured value in the Session 15 document as a **new revision** (§8.1 and §14 there), replacing
   the `INCONCLUSIVE` prediction. That is the moment T1 closes — not before.
5. Only then put **OD-COLL-03** (which locale production should use) and **OD-COLL-04** (whether the
   fingerprint needs the corrections in §8.6) in front of the owner, now with a real CI baseline to compare
   against.
6. Repeat the measurement opportunistically (it is free): the second run establishes whether the mutable
   `postgres:16` tag has moved.

**Do not** add the comparison/failure logic in the same change. The first run's job is to *tell us what the
environment is*; encoding a threshold before knowing the baseline would create a gate that fails for a reason
nobody chose.

---

## 17. Evidence and revision history

### 17.1 Sources read

| Path / endpoint | Used for |
|---|---|
| `.github/workflows/phase04a-g3-full-schema-gate.yml` (264 lines, read in full) | jobs, services, ports, env, steps, insertion point, artifact path `:229–236` |
| `.github/workflows/phase04a-real-schema-drift.yml` (353 lines, grepped) | alternative host; `DATABASE_URL` `:61`; evidence `$OUT`; artifact `:331` |
| `docs/database/g1-spike/option-c/g3-full/run.sh` (`:130–160`, `:1–60`) | argument parsing; `WORK="${WORK:-$G3F_DIR/out}"` and `rm -rf "$WORK"`; disposable-URL refusal |
| `docs/database/g1-spike/option-c/g3-full/enforce.sql` | G-3 cases 30/32 are ASCII-only (carried from Session 15) |
| `.gitignore:53` | `docs/database/g1-spike/option-c/g3-full/out/` is ignored |
| `docs/database/phase-04a-database-collation-product-and-environment-decision.md` | T1 definition (§14.2), fingerprint spec (§8.3), contract (§7.3) |
| `docs/database/phase-04a-index-collation-r2-investigation.md` | collation identity rules, expression-key limits |
| `gh run list`, `gh api …/jobs` | run `45372731345` `success`; both jobs and every step `success` |
| `docker-library/postgres` `16/bookworm/Dockerfile` + `docker-entrypoint.sh` (via `api.github.com`) | `ENV LANG en_US.utf8`, `locale-gen`, `initdb` without `--locale`, `PG_VERSION 16.16` |

### 17.2 Executed this session

| ID | Action | Result |
|---|---|---|
| E1 | `grep -rn 'LANG\|LC_ALL\|LC_COLLATE' .github/workflows/` | **0 matches** |
| E2 | `grep -rn 'POSTGRES_INITDB_ARGS' .github/workflows/` | **0 matches** |
| E3 | `gh run view 45372731345 --log` | **failed** — `EOF` at `results-receiver.actions.githubusercontent.com` |
| E4 | `gh run download … -n phase04a-g3-full-22` | **failed** — `EOF` at `productionresultssa13.blob.core.windows.net`; artifact exists, 49,022 bytes |
| E5 | `locale -a` | `C`, `C.utf8`, `POSIX` only — **`en_US.utf8` unavailable** |
| E6 | disposable PostgreSQL **16.2** cluster, database `g3f_main` created `LC_COLLATE='C.utf8'`, migration 0001 applied | migration applied cleanly |
| E7 | probe query (§6.2) executed | **one row**, JSON object as shown |
| E8 | fingerprint query (§6.3) executed | `collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=C.utf8;ctype=C.utf8;iculocale=-;collversion=-` |
| E9 | presence detection | `to_jsonb(d) ? 'datlocprovider'` → `true`; `? 'colllocale'` → `false`, value `NULL`, **no error** |
| E10 | six-index query (§9.2) executed | **11 rows**; three keys `100 pg_catalog.default` / provider `d`, eight keys `0` |
| E11 | missing-index path | bogus name → `exists = false`, `key_count 0`, no error |
| E12 | teardown | `pg_ctl -m fast stop`; `rm -rf /tmp/s16 /tmp/pgenv16 /tmp/art`; verified absent |

### 17.3 Revision history

| Revision | Date | Change |
|---|---|---|
| 3 | 2026-11-24 | **Documentation reconciliation (Session 28), no decision changed.** §5.3 no longer says the database default "governs the uniqueness semantics of" all three collated keys: two are collation-sensitive unique rules and the third (`ix_question_assets_checksum`) is non-unique, with collation affecting ordering and comparison only. Triggered by finding `C-06` of the Session 27 consolidation audit. T1 remains `CLOSED`; no measurement, code or workflow was changed. |
| 2 | 2026-11-24 | **Completion update (recorded in Session 19).** The probe was implemented (Session 17, commit `e4fa80d`), hardened and re-committed (Session 18, commit `0aae1368a16cf6447cb7a01afc7554a9fdab4bc0`), executed in CI (run `45546248909`, check run `138976563830`), and its values retrieved through the Check Runs annotations API. PG `16.16 (Debian 16.16-1.pgdg13+1)`; both databases `collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41`, byte-identical. Adds §17.4; corrects the `datcollversion` NULL generalisation (§8.1) and the bookworm variant assumption (§4, §7.1). **`T1` CLOSED**; `R2` remains **PARTIALLY RESOLVED**; OD-COLL-01…06 remain **OPEN**; no production locale selected. The original proposal and its predictions are preserved. |
| 1 | 2026-11-24 | Initial T1 measurement proposal. Reads both PostgreSQL workflows in full, identifies `g3f_main` as the database to measure, records that CI logs and artifacts are unreachable from this environment, validates the probe SQL and the six-index query on a disposable PostgreSQL 16.2 cluster (destroyed), predicts the CI profile from the image source and labels it `INCONCLUSIVE`, and supplies an illustrative two-file patch that is **not applied**. **No CI measurement was performed. No workflow, script, schema, migration, test or database was modified. No owner decision was made. No production or staging resource was contacted. Nothing was committed, pushed, merged or deployed.** |

### 17.4 Completion update — T1 CLOSED (Session 18; recorded in Session 19)

Everything above is preserved as written. This subsection records what actually happened to the proposal.

| Item | Outcome |
|---|---|
| §11 patch | **Applied** — Session 17 added `collation-probe.sh` and one workflow step (commit `e4fa80d`). Session 18 then replaced the raw notice emission with an escaped, fail-closed `emit_notice` (commit `0aae136`, one file, +73/−1), because an unescaped `echo "::notice …::$(cat …)"` could be broken or forged by its own payload |
| Was the probe executed in CI? | **Yes** — measurement step 11 of the `g3-full` job, after the gate and before the artifact upload |
| Run | `45546248909` — `completed / success`; job `G-3 full-schema gate (node 22, postgres 16)`; check run `138976563830`; steps 9 (gate), 10 (inventory), 11 (measurement) and 12 (upload) all `success` |
| Commit measured | `0aae1368a16cf6447cb7a01afc7554a9fdab4bc0` |
| PostgreSQL | **`16.16 (Debian 16.16-1.pgdg13+1)`** — the **Debian 13 (trixie)** variant, not the `bookworm` variant §4 analysed. The `PG_VERSION 16.16` prediction was right; the distribution suffix was not |
| Databases measured | `g3f_main` (5432) and `g3f_replay` (5434) — §5.1's identification was correct. `g3f_shadow` was deliberately excluded (Session 17 scope: it is not gate-asserted) |
| How the values were read | `GET /repos/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/check-runs/138976563830/annotations` — two `notice` annotations, titled `collation profile g3f_main` and `collation profile g3f_replay`. **Logs and the artifact archive are still unreachable** (`EOF`), so the annotations were the only viable channel, not a convenience |

**Observed fingerprints** — `g3f_main` and `g3f_replay`, **byte-identical**:

```text
collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41
```

**Prediction versus observation:**

| Field | §4 / §8.1 prediction | Observed | Match |
|---|---|---|---|
| `pg` | `16` | `16` | yes |
| `enc` | `UTF8` | `UTF8` | yes |
| `provider` | `libc` | `libc` | yes |
| `datcollate` | `en_US.utf8` | `en_US.utf8` | yes |
| `datctype` | `en_US.utf8` | `en_US.utf8` | yes |
| `daticulocale` | `NULL` (`-`) | `-` | yes |
| `datcollversion` | `NULL` (`-`) | **`2.41`** | **no** |
| distro variant | bookworm | **trixie** | **no** |

**Correction — `datcollversion`.** §8.1 stated that the field "will carry zero discriminating power in CI" and
§7.2 recorded it as "routinely NULL for libc". Both were environment-dependent generalisations and are
**falsified for this environment**. The measured image reports `2.41`, consistent with glibc 2.41. Consequences:

- a future image change can change the fingerprint and is therefore **detectable** in CI;
- a changed version is a **review trigger, not proof of index corruption** — it says the collation
  implementation may have changed, not that any index is wrong;
- the NULL branch of any fingerprint format remains **necessary** for builds that do report NULL, and must never
  be assumed from `provider = libc` alone;
- nothing here generalises to other libc distributions, other libc builds or other PostgreSQL majors — `NOT
  TESTED` there.

The same correction is recorded in the decision document as Revision 2 §8.7.1.

**The fold behaviour itself was still not measured in CI.** Session 18 observed the *fingerprint* inside the CI
container, not its case folding. `en_US.utf8` is not installed in the working environment, so `en_US.utf8` versus
`C.utf8` remains `NOT TESTED`. What is established is the narrower, precise claim: CI runs a **UTF-8 locale with
a case-folding collation**, so a passing CI index test cannot be assumed to enforce the same uniqueness as a
`C`-locale production database. §3's "more permissive than a `C`-locale production database" prediction is
therefore still the right shape, but its four specific pairs (`Ä/ä`, `ẞ/ß`, `İ/i`, `K`(U+212A)`/k`) remain
`PROPOSED`, not measured in CI. The decision document carries this as Revision 2 §7.7, and it is central
evidence for **OD-COLL-03**.

**Scope of the status change — this and nothing more:**

| Claim | Status |
|---|---|
| `T1` | **CLOSED** |
| `R2` | **PARTIALLY RESOLVED** (unchanged) |
| OD-COLL-01…06 | **OPEN** (all six) |
| Production profile | **UNMEASURED / UNKNOWN** |
| Production locale | **NOT SELECTED** — no owner decision follows from this measurement |
| Guard implementation, B1b, B2 | **not authorised / withheld**, unchanged |

**Evidence-hygiene caveat.** The measured values contained no `%`, `,` or `:`; the escaping and fail-closed
behaviour of the notice path was exercised in a local suite of 16 cases against the shipped functions, **not by
the CI run itself**. `VERIFIED` (function behaviour) / `NOT TESTED` (escaping under a hostile value in CI).

**Standing decisions, unchanged:** G-1 **FAILED** · G-3 **PASSED** · Option C **approved, controlled workflow
only** · B1a **APPROVED (workflow-scoped)** · B1b **NOT APPROVED** · B1c **NOT APPROVED** · B2 **WITHHELD** ·
migration 0001 **NOT AUTHORIZED for production deployment** · migration 0002 **DO NOT COMMIT** · G-2
**DEFERRED** · OD-17 **OPEN** · OD-21 **OPEN** · OD-NM-1 **OPEN** · OD-COLL-01…06 **OPEN** · R2 **PARTIALLY
RESOLVED**.

**A prepared probe is not a completed measurement.** *(Revision 2: it now is one — see §17.4. This line is
kept as the record of what Revision 1 could honestly claim.)*
