# OD-17 API Wire Contract — Architecture Decision Record & Readiness

- **Assessment date:** 2026-11-28 (UTC) — finalization pass against latest `main`. An earlier draft was assessed 2026-11-27.
- **Evidence baseline:** fetched `origin/main` at `ae050e3f98a6373d496db92503af1fac1e01a918` (merge of PR #22, `docs: finalize OD-17 API wire contract decisions`). PR #22 added only this brief; every code and documentation citation below was re-verified against that tree on 2026-11-28.
- **Working branch at this pass:** `arena/0be5e58f-hsc-alim-ict-question-bank`. At preflight its working tree was clean at `0ac7fd26c1aad4f631ff89e3ca86c7b374b6c2f4` (an ancestor of `main`); it was fast-forwarded (`--ff-only`) to `ae050e3f98a6373d496db92503af1fac1e01a918` before this update. No other branch was created, switched, or pushed.
- **Scope:** documentation and readiness verification only. No API endpoints, Route Handlers, Server Actions, security controls, or database objects are implemented here.

## Revision history

- **2026-11-27** — First working-tree draft (169 lines, untracked at that session's preflight). The decisions recorded in it were subsequently committed and merged as this file by **PR #22** (192 lines, merged 2026-11-28T06:42:46Z as `ae050e3f98a6373d496db92503af1fac1e01a918`).
- **2026-11-28** — Finalization pass: baseline refreshed to `ae050e3f98a6373d496db92503af1fac1e01a918`; artifact lineage corrected (the brief was on `main`, not an unrecoverable uncommitted artifact); PR #21 and PR inventory re-verified; external/mobile-client decision stated explicitly; stale cross-references flagged in §17; all citations re-checked against the new baseline. No decision was reopened; no implementation was added.

## Status vocabulary

- **VERIFIED** — demonstrated by the inspected code, tests, or repository inventory.
- **DECIDED** — architecture choice supplied by the owner in this task or an earlier finalized pass; no implementation is implied.
- **DOCUMENTED** — existing project documentation statement, not proof of deployment.
- **PROPOSED** — recommendation for implementation planning, not an additional owner decision.
- **PENDING** — requires external evidence or operational input.
- **BLOCKED** — cannot proceed to the stated gate until a prerequisite is met.

## 1. Executive decision summary

**DECIDED:** The API transport is Next.js Route Handlers under `/api/v1`, initially authenticated staff-only, using JSON, camelCase fields, ISO-8601 UTC timestamps, explicit DTOs, keyset cursors, a stable JSON error envelope, and private/no-store response behavior. The first implementation slice is **04G — Staff Question Read API**, limited to the staff question list and detail GET endpoints.

**VERIFIED:** Current `main` (`ae050e3f98a6373d496db92503af1fac1e01a918`) supplies server-only staff read boundaries, `requireActor()`, `question.read_staff` authorization, validated filters, keyset pagination, a list projection that excludes answer keys, and an authorized staff detail projection that includes them. It contains no Route Handlers or Server Actions (`server/questions/staff-boundary.ts:4-24,72-112`; `server/questions/authoring/queries.ts:63-82,114-153,160-232`; tracked route/action inventory re-checked 2026-11-28 — see §2).

**PENDING / BLOCKING FOR DEPLOYMENT:** Environment-owner attestation of Supabase Data API exposure, grants, RLS state, runtime PostgreSQL privileges, and service-role isolation. Repository source cannot establish live project settings. No database or Supabase settings were accessed or changed.

**Readiness:** OD-17 architecture is finalized for the 04G scope. It is **not** production or deployment approval. The 04G work must not deploy until the operational attestation and the implementation-time security requirements in this record are satisfied.

## 2. Verified repository baseline

- **VERIFIED — main:** `git fetch origin main` at 2026-11-28T06:43Z resolved to `ae050e3f98a6373d496db92503af1fac1e01a918`, the merge commit of PR #22 (`docs: finalize OD-17 API wire contract decisions`). The local clone is now unshallowed (`git fetch --unshallow origin main`); `origin/main` carries 175 commits.
- **VERIFIED — PR #21:** PR #21 (*Phase 04F — Staff Question Authoring write application boundary*) is **MERGED** (2026-11-27T21:56:04Z, merge commit `18d2e6ca639f1e40196ef6cb54749770b3e47aaa`). Its merge commit is an ancestor of fetched `main` — confirmed by `git merge-base --is-ancestor` after unshallowing and by the GitHub compare API (`18d2e6ca...`...`ae050e3f...`, status `ahead`, merge base `18d2e6ca...`). PR #21 added `server/questions/staff-write-boundary.ts` and tests; it is present in the inspected main tree.
- **VERIFIED — PR #22:** PR #22 is **MERGED** (2026-11-28T06:42:46Z, merge commit `ae050e3f98a6373d496db92503af1fac1e01a918`, which is current `main`). It added exactly one file: `docs/api/od-17-api-wire-contract-decision-brief.md` (+192). Every source citation in this record refers to the tree that includes it.
- **VERIFIED — preflight PR inventory:** `gh pr list --state open` returned `[]` twice at the start of this pass. No open PRs exist. (This re-checks rather than assumes; the earlier session's inventory was not relied on.)
- **VERIFIED — branch/worktree:** active branch is `arena/0be5e58f-hsc-alim-ict-question-bank`. Its preflight working tree was clean at `0ac7fd26c1aad4f631ff89e3ca86c7b374b6c2f4`; `0ac7fd26...` is an ancestor of `main` (52 commits behind, 0 ahead — GitHub compare API). The branch was fast-forwarded (`git merge --ff-only origin/main`) to `ae050e3f98a6373d496db92503af1fac1e01a918`; working tree remains clean. No other branch was created, switched, renamed, or pushed.
- **VERIFIED — artifact lineage:** the 2026-11-27 session reported its brief as an untracked 169-line working-tree artifact, not on `main`. By this pass that report was stale in one respect: the artifact's content was committed and merged to `main` by PR #22 as a 192-line file. The brief **was** recovered — from `main`, not from memory — and is updated in place by this pass. No replacement was reconstructed; no content was invented.
- **VERIFIED — file inventory:** `docs/api/od-17-api-wire-contract-decision-brief.md` exists on `main` and is this document. `docs/api/` contains exactly `api-architecture.md`, `api-contracts.md`, and this brief.
- **VERIFIED — API inventory (2026-11-28):** `app/api/.gitkeep` is the only tracked `app/api` entry; no `route.ts`/`route.tsx` exists under `app/`, `lib/`, or `server/`; no `use server` directive exists anywhere under `app/`, `lib/`, `server/`, or `components/`. The `server/exams/`, `server/users/`, `server/admin/`, `server/analytics/`, `server/ai-tutor/`, and `server/exports/` directories are empty placeholders. `proxy.ts` refreshes Supabase sessions; it is not an API authorization boundary (`proxy.ts:4-18`; `lib/supabase/proxy.ts:5-43`).
- **VERIFIED — migrations:** `prisma/migrations/` contains `0001_phase04a_question_bank`, `0002_identity_audit`, `0003_staff_list_search_performance`. No `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, `GRANT`, or `REVOKE` statement exists in any migration (grep across `prisma/migrations/`, 2026-11-28).
- **VERIFIED — dependency versions (package.json):** `next ^16.4.6`, `react ^19.3.1`, `zod ^4.6.7`, `@prisma/client ^7.10.1`, `typescript ^5.9.3`.

## 3. Existing application architecture

**VERIFIED.** The intended call chain is:

```text
Route Handler → Server-only Application Boundary → Domain Services → Prisma → PostgreSQL
```

The existing staff read boundary resolves the verified actor, delegates to the query functions, and sanitizes unexpected errors while preserving `DomainError` (`server/questions/staff-boundary.ts:4-24,55-69,72-112`). The merged write boundary follows the same transport-neutral pattern for staff write operations (`server/questions/staff-write-boundary.ts:19-36,123-139,141-255`). Domain services—not UI state or `proxy.ts`—are the authorization enforcement point (`server/auth/authorize.ts:1-8`). Prisma is accessed through a server-only lazy client (`lib/db.ts:1-22,25-47`).

**DECIDED:** Route Handlers own HTTP parsing, transport validation, response mapping, and HTTP statuses. They must not access Prisma directly or duplicate domain authorization, audit, transactions, or business logic. Existing application boundaries and domain services remain the reusable policy/business layer.

**VERIFIED — write audit atomicity:** authoring writes run through Prisma `$transaction(work)` (`server/questions/authoring/commands.ts:66-74`); `writeAuditEvent` receives the same transaction client and inserts through `tx` (`server/auth/audit.ts:1-10,66-82`). Read queries are not audited (`server/questions/authoring/queries.ts:19`). This does not make HTTP, logging, rate-limit, or other external side effects part of the database transaction.

**Note (2026-11-28):** the header comments of `server/questions/staff-boundary.ts` (`:16-18`) and `server/questions/staff-write-boundary.ts` (`:28-30`) still state that "OD-17 … remains open". That comment is DOCUMENTED-stale now that this record finalizes OD-17; refreshing it is an implementation-session concern for 04G, not a change made here (§8 prohibits code changes in this task).

## 4. Transport decision

**DECIDED — Next.js Route Handlers.** They are the HTTP transport for the API. Route Handlers are thin adapters around server-only application boundaries; domain services own permissions and business rules. Server Actions are not part of this API architecture; do not create them. No handler or endpoint is created by this ADR.

**Rationale:** The requested product is an HTTP wire contract. Route Handlers provide explicit HTTP parsing, response serialization, status codes, and cache headers while keeping the business layer transport-neutral. The existing Next.js server Supabase client supports Route Handlers and Server Actions (`lib/supabase/server.ts:7-15`), but there are no implemented routes or actions. This decision does not rely on undocumented framework defaults for authorization, caching, or CSRF.

## 5. API versioning

**DECIDED:** All first-generation endpoints use the `/api/v1` prefix, including the 04G read slice (`GET /api/v1/staff/questions`, `GET /api/v1/staff/questions/[id]`). Do not add header, media-type, query-parameter, or per-operation versioning in this task. There is no existing versioned HTTP API in the repository.

## 6. Initial audience and authorization

**DECIDED — authenticated staff only.** 04G requires a verified server-side Supabase session and the existing staff authorization policy, specifically `question.read_staff`. Authentication alone is not authorization. Public, guest, student, unauthenticated, and external write access are out of scope. Student APIs require a separate authorization and answer-release design.

**DECIDED — external and mobile clients:** No external or mobile-client implementation is in the first release. The contract nonetheless must be a conventional JSON HTTP contract that does not unnecessarily couple the API to browser-only UI state. No OAuth, API-key, or third-party client authentication is introduced by this task. Any future external/mobile surface requires its own decision, credential lifecycle, and threat model; this record does not grant one.

**VERIFIED — identity:** `getUser()` calls `supabase.auth.getUser()` through the cookie-bound server client and returns `null` on missing configuration, provider error, or no user (`lib/auth/session.ts:14-27`; `lib/supabase/server.ts:7-41`). `requireActor()` validates the verified UUID, loads/provisions the profile, rejects inactive profiles, and derives roles from stored profile state (`server/auth/actor.ts:53-86`; `server/auth/profiles.ts:23-49`). Request-supplied actor IDs and roles are not accepted by the staff application boundaries (`server/questions/staff-boundary.ts:10-17`; `server/questions/staff-write-boundary.ts:19-33`).

**VERIFIED — action policy:** EDITOR and above can `question.read_staff`; STUDENT has no Question Bank permission. Unknown actions are denied, including for SUPER_ADMIN (`server/auth/permissions.ts:25-64,66-79`; `server/auth/authorize.ts:33-43`). The staff detail read selects answer keys and rubrics and therefore must remain behind staff authorization (`server/questions/authoring/queries.ts:160-232`).

**DECIDED — resource scope:** Preserve the existing global staff Question Bank access model for this first read API. It is restricted to authorized staff under `question.read_staff`. Do not invent author-specific, institution-specific, college-specific, or tenant-specific authorization rules. **Resource-level institutional/teacher scoping is not implemented** and must be designed before any such restriction is introduced (`docs/security/authorization.md:20,48-58,60-62`; `docs/architecture/technology-decisions.md:57`). The existing separation-of-duties rule and SUPER_ADMIN exception remain unchanged (`server/auth/authorize.ts:37-53`; `server/auth/separation-of-duties.ts:1-12,28-41`).

**PENDING:** The repository does not set or prove deployed Supabase session TTL, revocation propagation, or refresh-token policy; documentation leaves these under OD-15 (`docs/security/authentication.md:12-17,23-25`; `docs/architecture/technology-decisions.md:56`). This ADR makes no new session-lifetime promise.

## 7. Serialization contract

**DECIDED:** API request/response bodies use JSON; wire field names use camelCase; timestamps are ISO-8601 UTC; every response uses an explicit DTO. Never serialize Prisma records or expose internal database fields implicitly. No response Zod schema or HTTP serialization test exists yet.

**VERIFIED:** The staff list projection is an explicit Prisma `select` and excludes answer keys, rubrics, options, and content (`server/questions/authoring/queries.ts:63-82`). The staff detail projection intentionally includes content, options, answer key, rubric, and audit-relevant author IDs, so it is staff-only (`server/questions/authoring/queries.ts:160-213`). A separate student DTO allowlists fields and recursively strips answer-revealing names, but it is not an implemented student API (`server/questions/publish/dto.ts:30-53,75-108`). Tests assert key/rubric absence from serialized student DTOs (`tests/unit/questions/dto.test.ts:75-103,125-142`).

**PROPOSED implementation detail:** Add response DTOs for the 04G wire contract rather than returning the existing Prisma payload directly. Convert `Date` values explicitly to ISO-8601 UTC at that boundary. Keep the list projection key-free; detail keys/rubrics are exposed only to staff already authorized for `question.read_staff`.

## 8. Pagination contract

**DECIDED:** Reuse the existing keyset cursor pagination; do not use offset pagination. Initial contract: default page size 20; maximum page size 50; strict cursor validation; the cursor format must be versioned; the cursor must be bound to the relevant query/filter context so incompatible reuse is rejected; authorization must be re-evaluated on every request. A cursor is never an authorization credential and is not an authorization mechanism. Do not add HMAC/signature-based cursor signing in this task; treat it strictly as a possible future hardening option, to be adopted only if a demonstrated integrity requirement justifies it.

**VERIFIED — current implementation (cited source, `server/questions/authoring/cursor.ts`):** the list orders by `(createdAt DESC, id DESC)`, fetches `limit + 1`, and returns `nextCursor` (`server/questions/authoring/queries.ts:114-153`). The current schema defaults `limit` to 20 (`PAGE_SIZE_DEFAULT`), caps it at 50 (`PAGE_SIZE_MAX`), and accepts a cursor string up to 200 characters (`server/questions/authoring/schemas.ts:39-40,163-184`). Current cursor bytes encode `<ISO timestamp>|<uuid>` as unpadded base64url and validate the timestamp (round-trip ISO equality) and the UUID shape (`server/questions/authoring/cursor.ts:1-6,19-53`). Decoding rejects anything with a third `|`-separated segment or a malformed timestamp/UUID.

**GAP for 04G:** the existing cursor has no explicit version field and is not bound to the filter/query context. Therefore, do not expose the raw existing cursor as satisfying the decided wire contract. The handler/boundary integration must add a versioned, strictly parsed, filter-context-bound cursor representation and reject incompatible reuse. Its exact encoding is an implementation detail to test; it must not be treated as authorization. The existing query behavior and stable ordering remain unchanged.

**VERIFIED — filters:** Board and College are independent dimensions; when selected, each has its own source predicate, and year qualifies the corresponding attribution (`server/questions/authoring/schemas.ts:163-179`; `server/questions/authoring/list-filters.ts:185-215`). Tests cover combinations and cursor pagination (`tests/integration/questions/staff-list-filters.test.ts:187-277`; `tests/unit/questions/list-filters.test.ts:128-178`). Search remains unchanged: `q` is capped at 120 characters, normalized to at most five tokens, and uses the existing text projection (`server/questions/authoring/list-filters.ts:59-86,217-225`).

## 9. Error envelope and HTTP mapping

**DECIDED — one stable JSON error envelope:**

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request could not be completed.",
    "requestId": "..."
  }
}
```

An optional safe field identifier or structured violation list may be included only when justified by the existing error model and the approved response contract. Do not return stack traces, SQL/database errors, secrets, internal file paths, constraint names, or sensitive authorization detail.

**VERIFIED — existing error model:** `DomainError` includes identity/authorization, validation, `NOT_FOUND`, optimistic concurrency `CONFLICT`, state/invariant, and database uniqueness/FK codes (`server/shared/errors.ts:18-93`). `toPublicError()` returns `code`, `message`, and optional `invariant`/`field`, dropping `constraintNames`; it does not produce a request ID or the canonical nested envelope (`server/shared/errors.ts:95-150`). Staff boundaries preserve `DomainError` and replace unknown exceptions with a fixed safe message, but do not implement HTTP status mapping or request-ID logging (`server/questions/staff-boundary.ts:45-69`; `server/questions/staff-write-boundary.ts:93-121`).

| Wire error | HTTP | Evidence / status |
|---|---:|---|
| `UNAUTHENTICATED` | 401 | **DECIDED.** Existing `DomainError` code (`server/shared/errors.ts:70-73`). |
| `FORBIDDEN` | 403 | **DECIDED.** Existing authorization code (`server/shared/errors.ts:70-75`). |
| `NOT_FOUND` | 404 | **DECIDED.** Existing code for absent question/version (`server/shared/errors.ts:74-77`; `server/questions/authoring/queries.ts:225-230`). Preserve non-disclosure if future ownership scopes are added. |
| `INVALID_REQUEST` / malformed JSON | 400 | **DECIDED transport classification.** No corresponding `DomainError` exists; malformed syntax must be classified by the Route Handler, without adding a domain code. |
| `VALIDATION_FAILED` | 422 | **DECIDED.** Existing Zod/domain validation code (`server/shared/errors.ts:74-80`). `CONTENT_PROFILE_INVALID` is an existing validation-style code and should be mapped consistently after testing (`server/shared/errors.ts:29,38`). |
| `CONFLICT` | 409 | **DECIDED** for the existing stale-write code (`server/shared/errors.ts:75-80`). Other named `*_CONFLICT` and invariant codes require an explicit status table; do not assume every domain code has this mapping. |
| `RATE_LIMITED` | 429 | **DECIDED transport classification.** No current domain code or limiter exists; implement at the transport/security layer, not by inventing a DomainError in this task. |
| `INTERNAL_ERROR` | 500 | **DECIDED external code.** No current DomainError exists. Map unexpected exceptions to a generic body and keep details out of the response. |

**GAP:** existing `INACTIVE`, `PublishRejectedError.violations`, named uniqueness/FK codes, and other invariant errors are not fully covered by the supplied table. `INACTIVE` is not an explicit row in the decided mapping; **PROPOSED** treatment is 403, subject to a focused mapping test. `PublishRejectedError` extends `DomainError` and carries multiple violations, while `toPublicError()` only projects the base fields (`server/questions/publish/gate.ts:86-104`; `server/shared/errors.ts:131-150`). Do not serialize that class wholesale or expose arbitrary violation internals. Define and test safe status/message handling in 04G; do not alter domain errors here.

## 10. Response caching

**DECIDED:** Staff question responses must not be shared or publicly cached. Emit explicit private/no-store behavior for the read endpoints (for example, `Cache-Control: private, no-store`) and avoid shared caches. Document the requirement for explicit private/no-store behavior where applicable; do not rely on framework defaults.

**VERIFIED:** project docs require authorization/release-context-aware caching and prohibit shared public caching of sensitive exam responses (`docs/api/api-architecture.md:20-26`). No Route Handler or cache configuration exists. **PROPOSED implementation check:** verify Next.js 16.4.6 Route Handler and fetch/cache behavior at implementation time; do not rely on presumed framework defaults. Revalidation is not currently implemented.

## 11. Read API security requirements

**DECIDED for 04G:** verified session; server-side `question.read_staff` authorization; strict path/query validation; explicit response DTOs; key-free list projection; detail answer-key/rubric exposure only through the existing authorized staff detail projection; safe unexpected-error handling; explicit private/no-store behavior; no answer-key/rubric leakage in list responses.

**VERIFIED:** domain queries authorize before reading; list/detail projections are explicit (`server/questions/authoring/queries.ts:114-128,160-232`). `requireActor()` reads stored role state after Supabase verification (`server/auth/actor.ts:71-86`; `server/auth/profiles.ts:23-32`). No HTTP tests currently exercise these controls.

## 12. CSRF distinction: GET versus mutations

**DECIDED:** 04G contains GET-only endpoints and does not perform state changes. Read-only GET endpoints do not perform state-changing operations, and the GET implementation does not complete or certify mutation CSRF protection.

Mutation endpoints must not be implemented until a concrete cookie-authenticated mutation protection policy exists. That policy must address Origin/Host validation, cookie attributes, and CSRF tokens where required. Existing authentication guidance calls for secure, HttpOnly, appropriately SameSite cookies and CSRF protection for state-changing requests as appropriate (`docs/security/authentication.md:17`). No CSRF middleware or policy is implemented here; none is added by this documentation task.

## 13. Rate-limiting requirements

**DECIDED:** Rate limiting is an implementation prerequisite for public exposure and a required security consideration for authenticated endpoints. **PROPOSED:** use actor-aware limits combined with IP-based abuse controls. Do not invent numerical limits without traffic, abuse, and operational requirements; the enforcement owner and fail-open/fail-closed behavior must be specified before release.

**VERIFIED:** API architecture documentation says to rate-limit authentication, answer saves, AI, and exports (`docs/api/api-architecture.md:37`). `.env.example` contains optional Upstash variables, but there is no limiter implementation (`.env.example:27-29`). No rate limiting is implemented in this task.

## 14. Supabase operational attestation

**PENDING — BLOCKING FOR DEPLOYMENT.** The environment owner must attest, using actual project/runtime evidence, all of the following:

1. Supabase Data API exposed schemas.
2. Effective `anon` and `authenticated` privileges on application tables.
3. Application-table RLS status.
4. Runtime PostgreSQL role and effective privileges.
5. Service-role secret isolation from browser bundles.

**VERIFIED — repository evidence only:** migrations 0001–0003 contain no RLS enablement/policy or application-table grant/revoke statements (re-greped 2026-11-28: no `ROW LEVEL SECURITY`, `CREATE POLICY`, `GRANT`, or `REVOKE` in `prisma/migrations/`); authorization documentation says RLS is deferred and application tables must not be reachable via the public Data API using `anon` or `authenticated` (`docs/security/authorization.md:46,54`). `lib/db.ts` uses server-only `DATABASE_URL` (`lib/db.ts:1-5,14-32`). The browser Supabase client uses only the public anon key and its comments prohibit service-role imports into browser-reachable modules (`lib/supabase/client.ts:7-23`). The service-role key is optional in server env validation and no runtime service-role client was found (`lib/env.ts:26-33`; `.env.example:13-18`).

**LIMIT:** repository inspection cannot establish hosted Data API settings, current grants, RLS flags, runtime credentials, or the contents of deployed browser bundles. Do not claim that RLS or database privileges are safe merely because no direct exposure was observed in repository source. RLS remains deferred. This task makes no database, grants, roles, project-settings, or credential changes and does not access production/staging databases. The attestation stays **PENDING / BLOCKING** until the owner supplies the five items of evidence above; only then may the deployment gate be considered.

## 15. First implementation scope — 04G Staff Question Read API

After the readiness gate is satisfied, implement only:

1. `GET /api/v1/staff/questions`
2. `GET /api/v1/staff/questions/[id]`

Responsibilities:

- Parse HTTP query/path values and apply strict transport validation; adapt parsed values to existing domain input schemas (`listQuestionsInputSchema`, `getQuestionInputSchema`).
- Delegate to `listStaffQuestions` and `getStaffQuestion` in `server/questions/staff-boundary.ts`; those boundaries resolve identity, and the query services enforce `question.read_staff`.
- Return explicit camelCase JSON DTOs with ISO-8601 UTC timestamps and the decided error envelope/status mapping (§9).
- For list, retain the key-free projection. For detail, allow answer-key/rubric fields only through the existing authorized staff detail projection.
- Apply versioned/filter-context-bound strict cursor handling, re-evaluate authorization each request, return private/no-store headers, and implement safe request-ID/error handling.
- Add HTTP-level tests for verified identity, forbidden/inactive actors, strict inputs, cursor mismatch, key secrecy in list, authorized detail, safe errors, statuses, and cache headers.

Explicitly excluded from 04G and from this record: write endpoints, student endpoints, public endpoints, guest endpoints, exam APIs, Server Actions, UI implementation, new database migrations, schema or index changes, RLS/grant changes, and production deployment.

**PROPOSED sequencing note:** complete Supabase exposure attestation before deployment; resolve the cursor adapter and error-code gaps as part of 04G design; specify rate-limit enforcement before any externally reachable release.

## 16. Explicit out-of-scope items

04G and this task exclude write endpoints, student endpoints, public endpoints, guest endpoints, exam APIs, Server Actions, UI implementation, new migrations, schema/index changes, RLS/grant changes, production deployment, OAuth, API keys, and third-party client authentication. External/mobile-client implementation is out of the first release (§6). The global staff question access model remains unchanged. No speculative `04G` implementation phase is created beyond the owner-named 04G task. No unrelated open decision is closed. This document is not API implementation authorization.

## 17. Remaining prerequisites and blockers

- **PENDING / BLOCKING FOR DEPLOYMENT:** obtain the five-point Supabase operational attestation in §14. Until it is supplied and reviewed, 04G may be designed and built but must not be deployed or exposed.
- **Implementation requirement:** build the 04G handler only as a transport adapter over the existing staff boundary; do not access Prisma or duplicate domain rules in Route Handlers.
- **Implementation gap:** the current cursor is unversioned and not filter-bound; a transport-level format and mismatch tests are required before contract conformance (§8).
- **Implementation gap:** map `INACTIVE`, publish violation lists, named conflict/state codes, and transport-level malformed JSON/limiter/unexpected errors safely without changing domain behavior (§9).
- **Release requirement:** establish rate-limiter enforcement ownership and thresholds from operational evidence; no numbers are approved here (§13).
- **Future mutation blocker:** cookie-authenticated write APIs require a concrete CSRF/Origin/Host and cookie policy first; a GET-only implementation does not satisfy that policy (§12).
- **Future scope blocker:** student/public/guest APIs require their own authorization, ownership, and answer-release design (§6).
- **DOCUMENTED stale cross-references (not changed here):** `docs/architecture/technology-decisions.md:58` still lists OD-17 as "Before API implementation" with contracts "proposed, not approved" — stale relative to this record; refresh belongs to the owner's register, not this PR. The header comments of `server/questions/staff-boundary.ts` and `server/questions/staff-write-boundary.ts` still describe OD-17 as open; the 04G implementation session may refresh them when it touches those modules.

## 18. Readiness verdict and next engineering task

**OD-17 FINALIZED — READY FOR 04G AFTER OPERATIONAL ATTESTATION.** The supplied architecture choices are recorded as DECIDED; this does not make endpoints or deployment production-ready. The next engineering task is **04G — Staff Question Read API**, limited to the two GET routes listed in §15, and it may begin only once the operational prerequisite in §14 is satisfied (at minimum for any deployment; design and local implementation may proceed against this record). The operational Supabase attestation is **PENDING / BLOCKING FOR DEPLOYMENT**; do not deploy until evidence is supplied and reviewed. Documentation finalization is not API implementation authorization, and a successful PR is not production deployment authorization.
