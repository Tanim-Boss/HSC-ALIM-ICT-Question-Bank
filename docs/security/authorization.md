# Authorization

**Purpose and scope.** Specify server-side access-control boundaries for students, administrators, background work and domain data. This is not a complete, approved permission matrix. Authentication proves identity; authorization decides whether that principal may perform an action on a particular resource.

## Responsibilities and boundaries

Deny by default. Every Server Action, Route Handler, internal service entry and worker-facing operation verifies the actor, action, resource and relevant state on the server. A hidden button, client role, guessed resource ID, shared-cache hit or managed-auth session alone is not authorization. Enforce ownership for personal sessions, answers, results, conversations, saved questions, papers and exports; re-check access when a job runs and when its artifact is retrieved.

| Actor / role named in blueprint | Intended area, not a complete grant |
|---|---|
| Student | Their own profile and eligible practice/exams/results; published content subject to release policy. No role changes, score writes or access to another user's records. |
| Super Admin | All system operations in the blueprint; bootstrap and sensitive safeguards are open. |
| Content Admin | Question and topic management within approved scope. |
| Exam Manager | Examination and paper management within approved scope. |
| Moderator | Review and approval of content within approved scope. |
| Analyst | Read-only reports within approved scope; access to personal detail is not assumed. |

Roles may be combined only through authorized server-managed assignments. The exact action matrix, least-privilege boundaries, teacher role, assignment/revocation and any institution scope are **OD-16**. Do not assume a multi-tenant model, that every staff member can see every student, or that an admin can bypass a domain invariant. Privileged actions, especially key and role changes, require audit records.

## Resource and release checks

- **Exam:** the server checks that the caller owns the session and the selected item belongs to its frozen snapshot. Evaluation, timestamps and scores cannot be written by a student.
- **Answer keys:** official keys, correct-option identifiers and rubrics never appear in student-facing exam APIs, including result APIs. They are available only to explicitly authorized server workflows. The README's post-exam review path is open; do not infer permission from finalization alone or allow tutor/search/export to leak active-exam answers.
- **Question authoring:** publish only validated versions through the Question Bank service. A permitted editor is not automatically a permitted publisher; exact separation is OD-16/OD-27.
- **AI and files:** authorize the question/version and intended context before invoking the adapter or serving assets. Validate upload and export access; object storage URLs must not outlive or bypass the chosen access policy.
- **Database:** use appropriate database policies and least-privilege credentials as defense in depth. If Prisma connects with a role that bypasses row-level security, server authorization remains mandatory; the RLS design is not yet approved.

## Dependencies

Authentication supplies the verified principal; Student Management supplies role and profile associations; domain services know resource ownership and state. Examination, Question Bank, AI Tutor, Paper Studio and Administration all depend on these checks. Storage and worker integrations must preserve the same policy across asynchronous boundaries.

## OPEN DECISION

[OD-04–OD-05, OD-14–OD-17, OD-19–OD-20 and OD-27–OD-28](../architecture/technology-decisions.md#open-decision-register) cover guest scope, review release, detailed roles, session/transport, file access, privacy, moderation and paper ownership. Permission UI design must not be treated as an approved permission matrix.

## Related documentation

[Authentication](authentication.md) · [Security guidelines](security-guidelines.md) · [API architecture](../api/api-architecture.md) · [Administration](../modules/administration.md)
