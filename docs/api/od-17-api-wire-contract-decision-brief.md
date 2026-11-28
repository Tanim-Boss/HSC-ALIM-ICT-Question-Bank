# OD-17 API Wire Contract — Architecture Decision Record & Readiness

- **Assessment date:** 2026-11-27 (UTC)
- **Evidence baseline:** fetched `origin/main` at `18d2e6ca639f1e40196ef6cb54749770b3e47aaa`. Source citations refer to that tree.
- **Working branch at preflight:** `arena/f724af0f-hsc-alim-ict-question-bank`, HEAD `0ac7fd26c1aad4f631ff89e3ca86c7b374b6c2f4`.
- **Scope:** documentation and readiness only. No API endpoints or security/database controls are implemented here.

## Status vocabulary

- **VERIFIED** — demonstrated by the inspected code, tests, or repository inventory.
- **DECIDED** — architecture choice supplied by the owner in this task; no implementation is implied.
- **DOCUMENTED** — existing project documentation statement, not proof of deployment.
- **PROPOSED** — recommendation for implementation planning, not an additional owner decision.
- **PENDING** — requires external evidence or operational input.
- **BLOCKED** — cannot proceed to the stated gate until a prerequisite is met.

## 1. Executive decision summary

**DECIDED:** The API transport is Next.js Route Handlers under `/api/v1`, initially authenticated staff-only, using JSON, camelCase fields, ISO-8601 UTC timestamps, explicit DTOs, keyset cursors, a stable JSON error envelope, and private/no-store response behavior. The first implementation slice is **04G — Staff Question Read API**, limited to the staff question list and detail GET endpoints.

**VERIFIED:** Current `main` supplies server-only staff read boundaries, `requireActor()`, `question.read_staff` authorization, validated filters, keyset pagination, a list projection that excludes answer keys, and an authorized staff detail projection that includes them. It contains no Route Handlers or Server Actions (`server/questions/staff-boundary.ts:4-24,72-112`; `server/questions/authoring/queries.ts:63-82,114-153,160-232`; tracked route/action inventory from fetched `main`).

**PENDING / BLOCKING FOR DEPLOYMENT:** Environment-owner attestation of Supabase Data API exposure, grants, RLS state, runtime PostgreSQL privileges, and service-role isolation. Repository source cannot establish live project settings. No database or Supabase settings were accessed or changed.

**Readiness:** OD-17 architecture is finalized for the 04G scope. It is **not** production or deployment approval. The 04G work must not deploy until the operational attestation and the implementation-time security requirements in this record are satisfied.

## 2. Verified repository baseline

- **VERIFIED — main:** `git fetch origin main` resolved to `18d2e6ca639f1e40196ef6cb54749770b3e47aaa`.
- **VERIFIED — PR #21:** PR #21 is merged to `main`; merge commit `18d2e6ca639f1e40196ef6cb54749770b3e47aaa` is an ancestor of fetched `main`. PR #21 adds `server/questions/staff-write-boundary.ts` and tests; it is present in the inspected main tree.
- **VERIFIED — preflight PR inventory:** no open PRs were returned when inspected for this task.
- **VERIFIED — branch/worktree:** active branch was `arena/f724af0f-hsc-alim-ict-question-bank`, HEAD `0ac7fd26c1aad4f631ff89e3ca86c7b374b6c2f4`, one commit ahead and one behind fetched `main`. The existing 169-line brief was present as an untracked artifact and was not present on `main`. It was preserved and updated in place; no branch switch was performed.
- **VERIFIED — API inventory:** `app/api/.gitkeep` is the only tracked `app/api` entry; no `route.ts`, Pages API, or `use server` implementation was found under `app/`, `lib/`, or `server/`. The `server/exams/`, `server/users/`, `server/admin/`, `server/analytics/`, `server/ai-tutor/`, and `server/exports/` directories contain only placeholders. `proxy.ts` refreshes Supabase sessions; it is not an API authorization boundary (`proxy.ts:4-18`; `lib/supabase/proxy.ts:5-43`).

## 3. Existing application architecture

**VERIFIED.** The intended call chain is:

```text
Route Handler → Server-only Application Boundary → Domain Services → Prisma → PostgreSQL
```

The existing staff read boundary resolves the verified actor, delegates to the query functions, and sanitizes unexpected errors while preserving `DomainError` (`server/questions/staff-boundary.ts:4-24,55-69,72-112`). The merged write boundary follows the same transport-neutral pattern for staff write operations (`server/questions/staff-write-boundary.ts:19-36,123-139,141-255`). Domain services—not UI state or `proxy.ts`—are the authorization enforcement point (`server/auth/authorize.ts:1-8`). Prisma is accessed through a server-only lazy client (`lib/db.ts:1-22,25-47`).

**DECIDED:** Route Handlers own HTTP parsing, transport validation, response mapping, and HTTP statuses. They must not access Prisma directly or duplicate domain authorization, audit, transactions, or business logic. Existing application boundaries and domain services remain the reusable policy/business layer.

**VERIFIED — write audit atomicity:** authoring writes run through Prisma `$transaction(work)` (`server/questions/authoring/commands.ts:66-74`); `writeAuditEvent` receives the same transaction client and inserts through `tx` (`server/auth/audit.ts:1-10,66-82`). Read queries are not audited (`server/questions/authoring/queries.ts:19`). This does not make HTTP, logging, rate-limit, or other external side effects part of the database transaction.

## 4. Transport decision

**DECIDED — Next.js Route Handlers.** They are the HTTP transport for the API. Route Handlers are thin adapters around server-only application boundaries; domain services own permissions and business rules. Do not create Server Actions as part of this API architecture. No handler or endpoint is created by this ADR.

**Rationale:** The requested product is an HTTP wire contract. Route Handlers provide explicit HTTP parsing, response serialization, status codes, and cache headers while keeping the business layer transport-neutral. The existing Next.js server Supabase client supports Route Handlers and Server Actions (`lib/supabase/server.ts:7-15`), but there are no implemented routes or actions. This decision does not rely on undocumented framework defaults for authorization, caching, or CSRF.

## 5. API versioning

**DECIDED:** All first-generation endpoints use the `/api/v1` prefix, including the 04G read slice. Do not add header, media-type, query-parameter, or per-operation versioning in this task. There is no existing versioned HTTP API in the repository.

## 6. Initial audience and authorization

**DECIDED — authenticated staff only.** 04G requires a verified server-side Supabase session and the existing staff authorization policy, specifically `question.read_staff`. Authentication alone is not authorization. Public, guest, student, unauthenticated, and external write access are out of scope. Student APIs need a separate authorization and answer-release design.

**VERIFIED — identity:** `getUser()` calls `supabase.auth.getUser()` through the cookie-bound server client and returns `null` on missing configuration, provider error, or no user (`lib/auth/session.ts:14-27`; `lib/supabase/server.ts:7-41`). `requireActor()` validates the verified UUID, loads/provisions the profile, rejects inactive profiles, and derives roles from stored profile state (`server/auth/actor.ts:53-86`; `server/auth/profiles.ts:23-49`). Request-supplied actor IDs and roles are not accepted by the staff application boundaries (`server/questions/staff-boundary.ts:10-17`; `server/questions/staff-write-boundary.ts:19-33`).

**VERIFIED — action policy:** EDITOR and above can `question.read_staff`; STUDENT has no Question Bank permission. Unknown actions are denied, including for SUPER_ADMIN (`server/auth/permissions.ts:25-64,66-79`; `server/auth/authorize.ts:33-43`). The staff detail read selects answer keys and rubrics and therefore must remain behind staff authorization (`server/questions/authoring/queries.ts:160-232`).

**DECIDED — resource scope:** Preserve the existing global staff Question Bank access model for this first read API. Do not add author-, institution-, college-, or tenant-specific checks. Institutional, teacher, and other module scopes remain unimplemented and must be designed before they are introduced (`docs/security/authorization.md:20,48-58,60-62`; `docs/architecture/technology-decisions.md:57`). The existing separation-of-duties rule and SUPER_ADMIN exception remain unchanged (`server/auth/authorize.ts:37-53`; `server/auth/separation-of-duties.ts:1-12,28-41`).

**PENDING:** The repository does not set or prove deployed Supabase session TTL, revocation propagation, or refresh-token policy; documentation leaves these under OD-15 (`docs/security/authentication.md:12-17,23-25`; `docs/architecture/technology-decisions.md:56`). This ADR makes no new session-lifetime promise.

## 7. Serialization contract

**DECIDED:** API request/response bodies use JSON; wire field names use camelCase; timestamps are ISO-8601 UTC; every response uses an explicit DTO. Never serialize Prisma records or expose internal database fields implicitly.

**VERIFIED:** The staff list projection is an explicit Prisma `select` and excludes answer keys, rubrics, options, and content (`server/questions/authoring/queries.ts:63-82`). The staff detail projection intentionally includes content, options, answer key, rubric, and audit-relevant author IDs, so it is staff-only (`server/questions/authoring/queries.ts:160-213`). A separate student DTO allowlists fields and recursively strips answer-revealing names, but it is not an implemented student API (`server/questions/publish/dto.ts:30-53,75-108`). Tests assert key/rubric absence from serialized student DTOs (`tests/unit/questions/dto.test.ts:75-103,125-142`).

**PROPOSED implementation detail:** Add response DTOs for the 04G wire contract rather than returning the existing Prisma payload directly. Convert `Date` values explicitly to ISO-8601 UTC at that boundary. Keep list projection key-free; detail keys/rubrics are exposed only to staff already authorized for `question.read_staff`. No response Zod schema or HTTP serialization test exists yet.

## 8. Pagination contract

**DECIDED:** Reuse keyset cursor pagination; do not use offset pagination. Initial page size defaults to 20 and is capped at 50. Validate cursors strictly, re-evaluate authorization on every request, version the cursor format, and bind it to the relevant query/filter context so incompatible reuse is rejected. A cursor is never an authorization credential. Do not add HMAC/signature signing in 04G; consider it only later if a demonstrated integrity requirement exists.

**VERIFIED — current implementation:** staff list orders by `(createdAt DESC, id DESC)`, fetches `limit + 1`, and returns `nextCursor` (`server/questions/authoring/queries.ts:114-153`). The current schema defaults `limit` to 20, caps it at 50, and accepts a cursor string up to 200 characters (`server/questions/authoring/schemas.ts:39-40,163-184`). Current cursor bytes encode `<ISO timestamp>|<uuid>` as base64url and validate the timestamp/UUID (`server/questions/authoring/cursor.ts:1-6,19-53`).

**GAP for 04G:** the existing cursor has no explicit version field and is not bound to filters/query context. Therefore, do not expose the raw existing cursor as satisfying the decided wire contract. The handler/boundary integration must add a versioned, strictly parsed, filter-context-bound cursor representation and reject incompatible reuse. Its exact encoding is an implementation detail to test; it must not be treated as authorization. The existing query behavior and stable ordering remain unchanged.

**VERIFIED — filters:** Board and College are independent dimensions; when selected, each has its own source predicate, and year qualifies the corresponding attribution (`server/questions/authoring/schemas.ts:171-179`; `server/questions/authoring/list-filters.ts:185-215`). Tests cover combinations and cursor pagination (`tests/integration/questions/staff-list-filters.test.ts:187-277`; `tests/unit/questions/list-filters.test.ts:128-178`). Search remains unchanged: `q` is capped at 120 characters, normalized to at most five tokens, and uses the existing text projection (`server/questions/authoring/list-filters.ts:59-86,217-225`).

## 9. Error envelope and HTTP mapping

**DECIDED — stable JSON error envelope:**

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

**DECIDED:** Staff question responses must not be shared or publicly cached. Emit explicit private/no-store behavior for the read endpoints (for example, `Cache-Control: private, no-store`) and avoid shared caches.

**VERIFIED:** project docs require authorization/release-context-aware caching and prohibit shared public caching of sensitive exam responses (`docs/api/api-architecture.md:20-26`). No Route Handler or cache configuration exists. **PROPOSED implementation check:** verify Next.js 16.4.6 Route Handler and fetch/cache behavior at implementation time; do not rely on presumed framework defaults. Revalidation is not currently implemented.

## 11. Read API security requirements

**DECIDED for 04G:** verified session; server-side `question.read_staff` authorization; strict path/query validation; explicit response DTOs; key-free list projection; detail key/rubric only through the existing authorized staff detail projection; safe unexpected-error handling; explicit private/no-store behavior.

**VERIFIED:** domain queries authorize before reading; list/detail projections are explicit (`server/questions/authoring/queries.ts:114-128,160-232`). `requireActor()` reads stored role state after Supabase verification (`server/auth/actor.ts:71-86`; `server/auth/profiles.ts:23-32`). No HTTP tests currently exercise these controls.

## 12. CSRF distinction: GET versus mutations

**DECIDED:** 04G contains GET-only endpoints and does not perform state changes. The GET endpoints do not complete or certify mutation CSRF protection.

Mutation endpoints must not be implemented until a concrete cookie-authenticated mutation policy exists. That policy must address Origin/Host validation, cookie attributes, and CSRF tokens where required. Existing authentication guidance calls for secure, HttpOnly, appropriately SameSite cookies and CSRF protection for state-changing requests as appropriate (`docs/security/authentication.md:17`). No CSRF middleware or policy is implemented here; none is added by this documentation task.

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

**VERIFIED — repository evidence only:** migrations 0001–0003 contain no RLS enablement/policy or application-table grant/revoke statements; authorization documentation says RLS is deferred and application tables must not be reachable via the public Data API using `anon` or `authenticated` (`docs/security/authorization.md:46,54`). `lib/db.ts` uses server-only `DATABASE_URL` (`lib/db.ts:1-5,14-32`). The browser Supabase client uses only the public anon key and its comments prohibit service-role imports into browser-reachable modules (`lib/supabase/client.ts:7-23`). The service-role key is optional in server env validation and no runtime service-role client was found (`lib/env.ts:26-33`; `.env.example:13-18`).

**LIMIT:** repository inspection cannot establish hosted Data API settings, current grants, RLS flags, runtime credentials, or the contents of deployed browser bundles. Do not claim security from missing source declarations. RLS remains deferred. This task makes no database, grants, roles, project-settings, or credential changes and does not access production/staging databases.

## 15. First implementation scope — 04G Staff Question Read API

After the readiness gate, implement only:

1. `GET /api/v1/staff/questions`
2. `GET /api/v1/staff/questions/[id]`

Responsibilities:

- Parse HTTP query/path values and apply strict transport validation; adapt parsed values to existing domain input schemas.
- Delegate to `listStaffQuestions` and `getStaffQuestion` in `server/questions/staff-boundary.ts`; those boundaries resolve identity, and the query services enforce `question.read_staff`.
- Return explicit camelCase JSON DTOs with ISO-8601 UTC timestamps and the decided error envelope/status mapping.
- For list, retain the key-free projection. For detail, allow answer-key/rubric fields only through the authorized staff detail projection.
- Apply versioned/filter-context-bound strict cursor handling, re-evaluate authorization each request, return private/no-store headers, and implement safe request-ID/error handling.
- Add HTTP-level tests for verified identity, forbidden/inactive actors, strict inputs, cursor mismatch, key secrecy in list, authorized detail, safe errors, statuses, and cache headers.

**PROPOSED sequencing note:** complete Supabase exposure attestation before deployment; resolve the cursor adapter and error-code gaps as part of 04G design; specify rate-limit enforcement before any externally reachable release.

## 16. Explicit out-of-scope items

04G and this task exclude write endpoints, student endpoints, public endpoints, guest endpoints, exam APIs, Server Actions, UI implementation, new migrations, schema/index changes, RLS/grant changes, production deployment, OAuth, API keys, and third-party client authentication. The global staff question access model remains unchanged. No speculative `04G` implementation phase is created beyond the owner-named 04G task. No unrelated open decision is closed.

## 17. Remaining prerequisites and blockers

- **PENDING / deployment blocker:** obtain the five-point Supabase operational attestation above.
- **Implementation requirement:** build the 04G handler only as a transport adapter over the existing staff boundary; do not access Prisma or duplicate domain rules.
- **Implementation gap:** current cursor is unversioned and not filter-bound; a transport-level format and mismatch tests are required before contract conformance.
- **Implementation gap:** map `INACTIVE`, publish violation lists, named conflict/state codes, and transport-level malformed JSON/limiter/unexpected errors safely without changing domain behavior.
- **Release requirement:** establish rate-limiter enforcement ownership and thresholds from operational evidence; no numbers are approved here.
- **Future mutation blocker:** cookie-authenticated write APIs require a concrete CSRF/Origin/Host and cookie policy first.
- **Future scope blocker:** student/public/guest APIs require their own authorization, ownership, and answer-release design.

## 18. Readiness verdict and next engineering task

**OD-17 FINALIZED — READY FOR 04G AFTER OPERATIONAL ATTESTATION.** The supplied architecture choices are recorded as DECIDED; this does not make endpoints or deployment production-ready. The next engineering task is **04G — Staff Question Read API**, limited to the two GET routes listed above. The operational Supabase attestation is **PENDING / BLOCKING FOR DEPLOYMENT**; do not deploy until evidence is supplied and reviewed. Documentation finalization is not API implementation authorization, and a successful PR is not production deployment authorization.
