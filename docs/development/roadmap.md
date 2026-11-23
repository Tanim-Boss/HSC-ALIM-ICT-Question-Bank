# Development roadmap

**Purpose and scope.** Preserve the ten-phase plan and release intentions in the original [README §11](../../README.md), while identifying dependencies and unresolved release mapping. This is a plan, not evidence that any phase or implementation has been completed.

## Responsibilities and boundaries

The product/architecture owner approves requirements, open decisions and phase gates; module owners deliver one approved module at a time with tests. Design work uses the locked README §17 specification. Implementation does not start merely because a screen looks complete. **This task ends with documentation; wait for explicit user approval before any UI/UX implementation.**

## Phases and gates

| Phase | Intended scope from blueprint | Gate / dependencies |
|---|---|---|
| 01 — Requirements and architecture | Functional requirements, roles, data relationships, API contracts and documentation. | Documentation exists, but SRS, final relationships/contracts, role matrix and open-decision approvals are still missing. |
| 02 — UI/UX and design system | Brand/tokens, core components, public/student/admin screen designs, responsive states and accessibility; README §17 governs. | **Do not begin UI/UX implementation without the user's approval.** Review foundations/core components before screens; resolve applicable OD-07/OD-14/OD-25. |
| 03 — Project setup | Next.js, strict TypeScript, Tailwind, PostgreSQL/Prisma, managed auth and isolated environments. | Approved design/setup plan; no scaffold, dependencies or migrations have been created by this task. |
| 04 — Academic and Question Management | Taxonomy, MCQ/CQ bank, rich editor, assets, search/filtering. | Approved schema/source/version/content/permissions and tests (OD-08–OD-10, OD-16, OD-18–OD-19). |
| 05 — Examination Engine | Selection/snapshot, server timer, answer saves, submission, evaluation. | Resolve exam/answer-release/idempotency/scoring decisions; pass fixed-clock, concurrency and secrecy tests. |
| 06 — Student Dashboard | Registration/login experience, history, results, basic charts/topic analytics. | Verified identity, ownership, recorded evidence and source-separated metrics. Auth setup begins in phase 03; this phase delivers student-facing flows. |
| 07 — AI Tutor | Provider adapter, explanations, wrong-answer support, diagram context, history, quotas and prompt-injection hardening. | Release policy, provider/cache privacy and quotas approved; AI does not grade. |
| 08 — Paper Studio and exports | Editable document, browser print, async Chromium snapshot, TXT/JSON/Base64; blueprint also places CQ rubric/self-assessment here. | Paper/worker and CQ/release decisions approved; vector-text/Bengali/round-trip tests pass. |
| 09 — Advanced Admin | Bulk import, AI parser, user/role management, audit, moderation and analytics. | Human review/publish, least-privilege matrix, rights and audit policies approved; manual editor exists first. |
| 10 — Testing and deployment | Full integration, browser, security, performance and production deployment. | Tests run continuously in earlier phases too; production requires recovery, monitoring and operational sign-off. |

## Release intent and known uncertainty

The README describes **v1** as the essential platform (accounts, taxonomy/bank, timed exams, server evaluation, saved results, basic dashboard and admin question management), **v2** as the learning platform (advanced analytics, tutor, explanations, bookmarking and comparisons), and **v3** as advanced paper/export/import/admin functionality. Its O1 suggests CQ self-assessment in v2 and teacher review in v3, while phase 08 also lists CQ self-assessment. Exam history appears across phase 06 and release scopes. The mapping from phases to releases is not defined; it is **OD-23**, not a reason to reorder the approved phases silently.

The README's v3 wording also mentions AI-assisted CQ evaluation, which conflicts with the locked ban on AI-awarded/proposed marks. Do not plan or implement AI scoring unless **OD-24** is resolved by an explicitly approved architectural change. AI may explain concepts or rubrics only within the approved release policy.

## Dependencies

Every phase depends on the [system architecture](../architecture/system-architecture.md), [open-decision register](../architecture/technology-decisions.md#open-decision-register), security and relevant module specifications. Test and documentation updates accompany each module; [deployment](../deployment/deployment-architecture.md) must not be treated as provisioned.

## OPEN DECISION

[OD-01–OD-07, OD-10–OD-17 and OD-23–OD-28](../architecture/technology-decisions.md#open-decision-register) drive major gates, especially CQ/expiry, release mapping, UI approval, AI marking, test setup and Paper Studio. Open defaults are not implicit approval.

## Related documentation

[Technology decisions](../architecture/technology-decisions.md) · [Testing strategy](testing-strategy.md) · [Design system](../design/design-system.md) · [Deployment environments](../deployment/environments.md)
