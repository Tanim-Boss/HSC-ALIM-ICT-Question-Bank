# Environments and configuration

**Purpose and scope.** Describe the intended separation of development, test, staging and production resources and the handling of configuration. Nothing here provisions infrastructure or creates environment files.

## Responsibilities and boundaries

| Environment | Purpose | Data and external services |
|---|---|---|
| Local development | Individual development after setup is approved. | Local/isolated PostgreSQL and test identities; fake or sandboxed providers. No production credentials/data. |
| Automated test | Repeatable unit/integration/browser checks. | Isolated disposable database/fixtures, controlled clock and stubbed AI/storage where appropriate; never shared with production. |
| Staging | Exercise deployment, migrations, auth, storage, worker, observability and restore procedures. | Separate managed resources and credentials; representative synthetic or appropriately sanitized data. |
| Production | Serve actual users after explicit release approval. | Separate protected database, storage, auth, provider and worker credentials; backups and monitoring required. |

Resource names, service accounts and exact isolation/retention are **OD-22**. Do not copy real student information or answer keys into development/test. Staging migration checks must use representative data without assuming a production clone is safe to distribute.

## Configuration classes

| Class | Examples from the blueprint | Handling |
|---|---|---|
| Database | `DATABASE_URL`, `DIRECT_URL` | Server-only credentials; configure provider-appropriate pooling/direct migration access after design approval. |
| Managed auth | Supabase URL and public anonymous key; service-role key | Public values may reach browser only as intended; service-role key stays server-only. A public key does not grant access without policy. |
| AI | `AI_PROVIDER`, `GEMINI_MODEL`, `GEMINI_API_KEY`, quota settings | Provider/model configuration server-side; API key secret, never `NEXT_PUBLIC_`. |
| Limits | Optional Upstash endpoint/token, exam grace configuration | Secret tokens server-only; rate-limit backend and exact default/config ownership remain open. |
| Export worker | Worker endpoint/token, render timeout | Internal service configuration only; never expose a worker secret or make the browser call a server's localhost. Queue/transport is open. |
| App | Public app URL, environment mode | Use environment-specific HTTPS origin and relative browser-facing API URLs. Never bake production URLs or secrets into test builds. |

The README's environment variable template is illustrative, not an instruction to create files now. An eventual example file may list names and placeholders only; real values belong in an approved secret manager and must not enter Git or logs. Rotate credentials on suspected disclosure.

## Lifecycle and access

Provision least-privilege service accounts and separate credentials per environment. Test migrations and restore procedures in staging before production. Restrict production access and log sensitive operations; define secret rotation, data deletion, backup retention, restore objectives and incident ownership before real traffic. User-facing previews must accept their actual host/origin, bind appropriately in their runtime and use relative API calls rather than browser-visible `localhost` backend addresses.

## Dependencies

Environments depend on [deployment architecture](deployment-architecture.md), the [database](../database/database-design.md), [authentication](../security/authentication.md), [security](../security/security-guidelines.md) and [test isolation](../development/testing-strategy.md). The AI provider and PDF worker are needed only for their approved phases.

## OPEN DECISION

[OD-02, OD-06, OD-15–OD-16, OD-19–OD-20, OD-22 and OD-26–OD-29](../architecture/technology-decisions.md#open-decision-register) cover provider/worker setup, identities, storage, privacy, operational targets, test infrastructure, paper jobs and AI data handling. No credentials or environments have been provisioned.

## Related documentation

[Deployment architecture](deployment-architecture.md) · [Roadmap](../development/roadmap.md) · [Authentication](../security/authentication.md) · [Original README Appendix B](../../README.md)
