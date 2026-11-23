# Student Management

**Purpose and scope.** Define account/profile, personal resource ownership, saved questions and the identity relationships needed for a learner experience. It does not implement authentication or own examination evaluation.

## Responsibilities and boundaries

Student Management maps a verified managed-auth identity to an application `User` and optional `StudentProfile`; maintains authorized profile changes, role associations and personal saved-question relationships; and exposes a narrow server interface for ownership and account state. Only privileged, audited server workflows can assign or revoke roles. A student cannot elevate their role or change any examination score through profile data.

| Capability | Boundary |
|---|---|
| Registration/profile | Email/password, verification, reset and secure logout through the managed provider; collect approved minimal profile and consent data. Identity mapping/retry behavior is open. |
| Saved questions | A saved record belongs to a user and references a question; whether it pins a version is open. Access follows question publication/release policy. |
| Exam history | List only the caller's authorized sessions/results. Examination owns the authoritative records; history does not duplicate scoring rules. |
| Role associations | Server-owned, explicitly authorized and audited. The existence of an account does not grant a staff role. |
| Guest practice | Suggested for MCQs in the README, but not yet approved. Do not fabricate a persistent user or assume guest answers have account ownership. |

Protect student data from other students and overbroad staff access. Define what happens to active sessions, offline mirrors, bookmarks and retained evidence when accounts are closed; do not promise hard deletion of answered exam data before a retention policy is approved.

## Acceptance criteria

- An unverified or expired session cannot access protected data; auth reset/registration responses do not enable account enumeration.
- A student can read/change only approved own-profile fields and cannot self-assign staff roles.
- Saved items and history are isolated per user; stale/archived question references are handled without breaking historical exam records.
- Guest and account-merge behavior are not enabled by assumption; privacy, deletion and audit requirements are agreed before real users.

## Dependencies

Depends on [authentication](../security/authentication.md), [authorization](../security/authorization.md), the User/profile/role [data model](../database/data-dictionary.md) and Question Bank references. Examination and Analytics consume verified identity/ownership; Administration manages roles via authorized interfaces.

## OPEN DECISION

[OD-04, OD-10, OD-15–OD-16 and OD-20](../architecture/technology-decisions.md#open-decision-register) cover guest/account merging, bookmark versioning, provider mapping, permissions, consent and retention. Required profile fields and institutional scope are not finalized.

## Related documentation

[Authentication](../security/authentication.md) · [Authorization](../security/authorization.md) · [Performance Analytics](performance-analytics.md) · [API contracts](../api/api-contracts.md)
