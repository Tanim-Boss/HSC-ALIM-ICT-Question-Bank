# Authorization

**Purpose and scope.** Specify server-side access-control boundaries for students, administrators, background work and domain data. Authentication proves identity; authorization decides whether that principal may perform an action on a particular resource. The Question Bank's role → action matrix is decided and implemented (Phase 04B, below); other modules' permissions are still open.

## Responsibilities and boundaries

Deny by default. Every Server Action, Route Handler, internal service entry and worker-facing operation verifies the actor, action, resource and relevant state on the server. A hidden button, client role, guessed resource ID, shared-cache hit or managed-auth session alone is not authorization. Enforce ownership for personal sessions, answers, results, conversations, saved questions, papers and exports; re-check access when a job runs and when its artifact is retrieved.

The names below come from the blueprint and predate Phase 04B. The implemented roles are the five in the matrix; Content Admin maps to EDITOR/ADMIN, and Exam Manager and Analyst do not exist yet.

| Actor / role named in blueprint | Intended area, not a complete grant |
|---|---|
| Student | Their own profile and eligible practice/exams/results; published content subject to release policy. No role changes, score writes or access to another user's records. |
| Super Admin | All system operations in the blueprint; bootstrap and sensitive safeguards are open. |
| Content Admin | Question and topic management within approved scope. |
| Exam Manager | Examination and paper management within approved scope. |
| Moderator | Review and approval of content within approved scope. |
| Analyst | Read-only reports within approved scope; access to personal detail is not assumed. |

Roles may be combined only through authorized server-managed assignments. The Question Bank matrix is decided (below); role revocation, the teacher role, other modules' permissions and any institution scope remain **OD-16**. Do not assume a multi-tenant model, that every staff member can see every student, or that an admin can bypass a domain invariant. Privileged actions, especially key and role changes, require audit records.

## Role → action matrix (Phase 04B)

Implemented in `server/auth/permissions.ts`; enforced by the domain services, which take the acting user as their first parameter and call `authorize` before any lock, read or write. Permissions are code, not a table. UI state, `proxy.ts` and RLS are not enforcement points.

| Action | STUDENT | EDITOR | MODERATOR | ADMIN | SUPER_ADMIN |
|---|:-:|:-:|:-:|:-:|:-:|
| `question.read_staff` | — | ✓ | ✓ | ✓ | ✓ |
| `question.create` | — | ✓ | ✓ | ✓ | ✓ |
| `question.edit_draft` | — | ✓ | ✓ | ✓ | ✓ |
| `question.change_type` | — | ✓ | ✓ | ✓ | ✓ |
| `question.publish` | — | — | ✓ | ✓ | ✓ |
| `question.archive` | — | — | ✓ | ✓ | ✓ |
| `answer_key.verify` | — | — | ✓ | ✓ | ✓ |
| `taxonomy.manage` | — | — | — | ✓ | ✓ |
| `role.grant` | — | — | — | — | ✓ |

- **Deny by default.** An action that is not in the matrix is refused for every role, including SUPER_ADMIN.
- **Roles combine.** A user may hold several roles (`user_roles`); an action is allowed if any held role allows it. A new profile gets STUDENT.
- **Separation of duties.** The user who last edited a draft version (`updated_by`, else `created_by`) can neither verify its answer key nor publish it, unless they are SUPER_ADMIN. The authoring commands (`server/questions/authoring/`, Phase 04C) record `created_by`/`updated_by`, so the rule applies to every version written through them. Versions written before migration 0002 have no recorded editor, so the rule cannot apply to them.
- **Staff read model.** `listQuestionsForStaff` and `getQuestionForStaff` require `question.read_staff`. Only the detail view returns answer keys and rubrics; the list projection has no answer, option or content field.
- **Identity.** `requireActor()` (`server/auth/actor.ts`) reads the Supabase-verified user, loads or provisions the profile, and refuses with `UNAUTHENTICATED` (no session) or `INACTIVE` (deactivated profile). `profiles.id` is `auth.users.id`; there is no foreign key into the `auth` schema.
- **Audit.** Creating a question, saving a draft, creating a revision, verifying a key, archiving, publishing, type changes, profile provisioning and role grants each write one `audit_events` row on the same transaction as the change, so a failed audit insert rolls the change back. `audit_events` is append-only in the database (a trigger rejects UPDATE, DELETE and TRUNCATE). Payloads carry ids and status fields only, never answer keys or rubric content.
- **Bootstrap.** The first SUPER_ADMIN is created with `npm run db:bootstrap-super-admin -- <email>`. It promotes one existing auth user, refuses if any SUPER_ADMIN already exists, and writes an audit row with `actor_id` NULL.

> **RLS — deny-all baseline (migration 0004).** Row-level security is defence in depth, not the enforcement point. `prisma/migrations/0004_rls_lockdown` enables RLS on every table in `public` (including `_prisma_migrations` when present) with **no policies**, and revokes all table, sequence and function privileges — current and default — from Supabase's `anon` and `authenticated` roles, plus EXECUTE on every function in `public` from PUBLIC (which every role inherits). The Data API therefore reads and writes nothing; the application reaches the database only through Prisma as the table owner, which RLS does not restrict (no `FORCE`). Every new table must `ENABLE ROW LEVEL SECURITY` in its own migration; the integration suite fails if one does not. Policies for a feature that genuinely needs the Data API are still open (OD-16).

## Resource and release checks

- **Exam:** the server checks that the caller owns the session and the selected item belongs to its frozen snapshot. Evaluation, timestamps and scores cannot be written by a student.
- **Answer keys:** official keys, correct-option identifiers and rubrics never appear in student-facing exam APIs, including result APIs. They are available only to explicitly authorized server workflows. The README's post-exam review path is open; do not infer permission from finalization alone or allow tutor/search/export to leak active-exam answers.
- **Question authoring:** publish only validated versions through the Question Bank service. A permitted editor is not automatically a permitted publisher: see the matrix and separation of duties above. Moderation states beyond DRAFT/PUBLISHED/ARCHIVED remain OD-27.
- **AI and files:** authorize the question/version and intended context before invoking the adapter or serving assets. Validate upload and export access; object storage URLs must not outlive or bypass the chosen access policy.
- **Database:** use appropriate database policies and least-privilege credentials as defense in depth. Prisma connects as the table owner, which bypasses row-level security, so server authorization remains mandatory; the deny-all RLS baseline only closes the Data API (see the note above).

## Dependencies

Authentication supplies the verified principal; Student Management supplies role and profile associations; domain services know resource ownership and state. Examination, Question Bank, AI Tutor, Paper Studio and Administration all depend on these checks. Storage and worker integrations must preserve the same policy across asynchronous boundaries.

## OPEN DECISION

[OD-04–OD-05, OD-14–OD-17, OD-19–OD-20 and OD-27–OD-28](../architecture/technology-decisions.md#open-decision-register) cover guest scope, review release, detailed roles, session/transport, file access, privacy, moderation and paper ownership. Permission UI design must not be treated as an approved permission matrix.

## Related documentation

[Authentication](authentication.md) · [Security guidelines](security-guidelines.md) · [API architecture](../api/api-architecture.md) · [Administration](../modules/administration.md)
