# Testing strategy

**Purpose and scope.** Define verification for the approved architecture and its highest-risk boundaries. Tools are the README's recommendations. Most of the intended layers below are still unbuilt; the section [Implemented verification — what actually runs today](#implemented-verification--what-actually-runs-today) states, without optimism, which checks genuinely execute and what they do not cover.

## Responsibilities and boundaries

Tests are required as each module is developed, not only in phase 10. Domain owners cover pure rules and validation; integration tests exercise real server boundaries and an isolated PostgreSQL database; security/architecture reviewers cover permission and leakage threats. Tests must use representative Bangla content and must not use production secrets or student records.

| Layer | Intended tooling | Focus |
|---|---|---|
| Unit | Vitest | Pure evaluation, injected clocks, validation, sampling, UTF-8 encoding and analytics calculations. |
| Component | React Testing Library | States, labels, focus, renderer and source provenance; UI does not authorize. |
| API/integration | Vitest + isolated PostgreSQL | Transactions, Prisma constraints, ownership, filtered DTOs, idempotency and concurrent requests. |
| Browser / visual | Playwright | Full flows, refresh/offline/tabs, responsive layouts, font shaping, keyboard and print/PDF. |
| Static / security / performance | TypeScript strict mode, ESLint and approved security/load tools | Type/lint, threat cases, bundle/network and database query behavior. CI tooling remains open. |

## Critical scenario matrix

| Area | Required assertions |
|---|---|
| Timing | With an injected fixed server clock: `expiresAt − 1 ms`, exactly expiry, inside grace with/without pre-expiry autosave, exactly the inclusive grace end, and after it. No answer writes at/after expiry; only eligible late finalization is accepted. Do not use real sleeps as the authority. |
| Idempotency / races | Same save replay is a no-op; two simultaneous finalizations produce one logical result, same retry returns it without re-scoring, and conflicting tabs follow the approved policy. Include key reuse with different payload once OD-12 is decided. |
| Snapshot / scoring | Refresh keeps the same selected versions; a later question/key edit cannot silently change an active attempt. Verify MCQ marking/negative rules and mixed source provenance against approved decisions. |
| Ownership / secrecy | Another user cannot read/write a session or answer. Recursively inspect all student-facing exam APIs—including finalized result/retry paths—for keys, correct-option identifiers, per-option correctness flags, rubrics, solutions, nested metadata and leaked asset links. Exercise question bank, tutor, caches and exports during active attempts. |
| CQ | A rubric is not available during an active attempt; self-assessed and teacher-reviewed values are clearly labelled and do not enter MCQ accuracy. AI never proposes/awards marks. Actual input/revision/release paths wait for approval. |
| Bank | Combined facets, pagination, Bangla/English search, duplicate/source handling, random selection counts and insufficient inventory; unsafe blocks/uploads are rejected. |
| AI | Provider unavailable/timeout does not affect exams; schema validation, quota concurrency, cache authorization, diagram handling and malicious student instructions cannot leak unrelated keys. |
| Export / Unicode | Browser and worker PDF text is selectable and Bengali conjuncts/diagrams/page breaks render; document JSON round-trips; UTF-8/Base64 handles `বাংলা`, `ক্ষ`, emoji, empty/large strings and malformed bytes according to OD-28. |
| Accessibility / responsive | Keyboard/focus, labels, non-color-only states, 44 px touch targets, reduced motion, 320 px overflow, screen-reader announcements and both-theme contrast. Validate actual glyph rendering, not only DOM snapshots. |
| Recovery | Migration and restore rehearsal, environment isolation, authorized async job/artifact access and retries; production objectives are OD-22. |

For the mobile-network budget, the README targets approximately 200 KB gzipped initial JavaScript on the exam route, compressed appropriately sized images and minimal layout shift. Treat this as a planning target until measurement method and performance gates are approved under OD-26. Do not certify PDF pagination or WCAG conformance without the applicable browser/manual checks.

## Implemented verification — what actually runs today

This section records committed, executing verification. It is separated from the intended layers above because those describe a target; the table below describes what the repository does now. A layer with no row here has **no** automated verification, and absence must be read as absence rather than as a pass.

| Workflow | Scope it actually verifies | Deliberately not covered |
|---|---|---|
| `phase04a-v45-application.yml` | Unit suites (`tests/unit/**`), `tsc --noEmit`, ESLint, formatting of application files, repository + deployment-path guards, and the question-bank services against a real PostgreSQL 16 | The Next.js application build and the browser layer |
| `phase03-application-build-e2e.yml` | `next build` with no runtime secrets configured, build-artifact assertions, the `server-only` boundary marker, and the committed Playwright smoke suite in Chromium — served from the **production bundle** (`next build` + `next start`) in CI, with an execution guard that fails the job if the suite ran nothing or skipped a case | Product flows (none exist), the 200 KB initial-JS budget (OD-26-3), visual regression, PDF/print output |
| `phase04a-g3-*`, `g1-*`, `phase04a-option-c-prototype.yml`, `phase04a-prod-ready-v1-v5.yml`, `phase04a-real-schema-drift.yml`, `phase04a-collation-probe-input.yml` | Phase 04A schema, migration-workflow, drift and collation evidence against **disposable** databases | Production or staging resources — none is contacted |
| `g1-prisma-drift-spike.yml`, `g1-experiment-2.yml` | Reproduce the unsafe Prisma behaviour; recorded as gate **G-1 FAILED** | Nothing is fixed by them; failure is the expected evidence |

Two properties of this set are deliberate and should not be relaxed:

- **A skipped suite is never a pass.** The integration job fails the build if its log shows `SKIPPED`, and requires a floor of executed cases. The browser job applies the same rule through `scripts/ci/playwright-run-guard.mjs`, because `playwright test` can exit zero having executed nothing.
- **The browser suite is an application-shell smoke test, not product coverage.** `tests/e2e/smoke.spec.ts` asserts boot, the single `H1`, bilingual and mixed-script rendering, and theme toggling with persistence. It says nothing about examination behaviour, authorization or scoring.
- **The smoke suite's theme assertion contradicts the approved specification.** README [§17.2](../../README.md#172-color-tokens) makes the OS/browser `prefers-color-scheme` preference the sole theme authority, with no manual toggle and no persisted preference. The committed assertion therefore describes behaviour that must be **removed**, not preserved. A later implementation change should replace it with assertions that: the theme follows an emulated `prefers-color-scheme` value, no theme control exists in the DOM, no theme key is written to storage, and no theme flash or hydration warning occurs on load. Recording this here is not evidence that the change has been made.

Whether these workflows are *required* status checks is not established here: that is repository settings and remains **OD-26-1**. Adding a workflow is not ratifying the check policy.

## Dependencies

Tests depend on final [API contracts](../api/api-contracts.md), [database relationships](../database/entity-relationships.md), [exam rules](../modules/examination-engine.md), [security](../security/security-guidelines.md), and [design/typography](../design/typography.md). Independent test fixtures and CI environments must be provisioned after approval.

## OPEN DECISION

[OD-03–OD-04, OD-10–OD-14, OD-17–OD-19, OD-21–OD-22 and OD-25–OD-29](../architecture/technology-decisions.md#open-decision-register) cover policy-dependent assertions, content/asset handling, operational targets, font verification, tooling, imports, exports and AI privacy.

## Related documentation

[Coding standards](coding-standards.md) · [Roadmap](roadmap.md) · [Exam engine](../modules/examination-engine.md) · [Deployment environments](../deployment/environments.md)
