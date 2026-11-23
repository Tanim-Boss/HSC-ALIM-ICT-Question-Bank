# Authentication

**Purpose and scope.** Define how callers establish an identity and how that identity reaches domain services. This is a planning specification, not a configured authentication provider. The blueprint recommends Supabase Auth or an equivalent managed provider.

## Responsibilities and boundaries

The managed identity provider is responsible for authenticating credentials and issuing/revoking sessions; the ICT Atlas server verifies the session and maps the verified subject to the application user. The [authorization service](authorization.md) decides what that user may do. A client-provided user ID, role, JWT claim copied into a request body or hidden UI state is not evidence of permission.

| Flow | Required behavior |
|---|---|
| Registration | Support email/password, email verification and a student profile; collect only approved necessary details and required consent. Keep account/profile mapping consistent across retries. |
| Sign-in/session | Verify the managed provider's credentials/session on the server before protected operations. Use the provider's secure session mechanism with HTTPS; do not invent cookie/token lifetimes. |
| Password reset / verification | Use the provider's verified flows; return user-safe messages that do not reveal whether an email is registered. |
| Sign-out / revocation | Invalidate the session according to the chosen provider; protected requests must stop succeeding after the applicable revocation policy takes effect. Clear client-side user-specific cached exam data on account change/logout as policy permits. |
| Guest | MCQ guest practice is only a README-suggested default, not an approved capability. Define identity, session ownership and local-history rules before enabling it. |

Use secure, `HttpOnly`, appropriately `SameSite` cookies where the selected session mechanism uses cookies; protect state-changing requests against CSRF as appropriate. Never expose service-role keys or AI credentials to the browser. A public Supabase URL/anonymous key, if used, is not an authorization bypass or a substitute for server checks. Verify provider token signatures, issuer, audience and expiry using its supported server mechanism; do not trust unverified decoded claims.

## Dependencies

Student Management owns the application user/profile association. Every protected API, exam session, paper, AI conversation and admin action depends on a verified principal, followed by resource-specific authorization. Auth provider configuration, database policies and client session transport must work together; Prisma operations using elevated database credentials still require application authorization.

## OPEN DECISION

[OD-04, OD-15, OD-16 and OD-20](../architecture/technology-decisions.md#open-decision-register) cover guest access, provider selection/configuration, account mapping, session TTL/revocation, bootstrap and privacy/consent. Phone authentication is only a later possibility in the blueprint, not a commitment.

## Related documentation

[Authorization](authorization.md) · [Security guidelines](security-guidelines.md) · [Student management](../modules/student-management.md) · [Environments](../deployment/environments.md)
