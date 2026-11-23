# Coding standards

**Purpose and scope.** Set future implementation expectations for the approved TypeScript modular monolith. These are engineering requirements and review guidance, not a claim that code, tooling or a lint configuration exists.

## Responsibilities and boundaries

- Use strict TypeScript throughout. Model domain states and validated inputs explicitly; use `unknown` and validation at trust boundaries rather than unchecked `any` or assertions. Handle nullable values, exhaustive state transitions and failures deliberately.
- Keep business rules in server domain services. Components render authorized data and send user intent; route handlers/Server Actions authenticate, validate, authorize and delegate. Do not put scoring, role checks or persistence shortcuts in UI components.
- Access PostgreSQL via the approved Prisma layer; use transactions for related authoritative writes. Avoid ad-hoc cross-module table mutation, and never serialize raw Prisma records into student exam DTOs.
- Validate every external input and AI response using approved schemas. Use recursive allowlists for outputs and explicit data types for money/marks and time; do not rely on browser timestamps or floating-point rounding without an approved scoring policy.
- Keep answer keys, provider keys and service credentials server-only. Use the AI provider adapter; only adapter infrastructure may import a vendor SDK. Separate untrusted content from instructions and render safe typed blocks.
- Design for idempotency, deterministic conflict handling and observable failures. Do not swallow errors, leak internals to clients or log private answers, secrets or raw keys. Audit sensitive changes through an authorized workflow.
- Use semantic design tokens and shared renderers; implement accessible controls and explicit loading, empty, error and offline states. Screen/print content can differ by authorization while preserving common safe rendering semantics.
- Add focused unit/integration/browser tests for changes, including negative authorization cases. Update documentation and decision records whenever an approved behavior changes. No applied migration should be edited.

## Review checklist

A future change should identify its module owner, data/permission impact, schema or API changes, user-visible states, privacy/security risks, tests and deployment impact. Run the relevant tests, strict type-check and lint checks before review once tooling exists. Prefer small changes and explicit dependencies over broad speculative abstractions. Changes to locked architecture require written justification and approval.

## Dependencies

Standards depend on [module boundaries](../architecture/module-architecture.md), [API/security](../api/api-architecture.md), the [data model](../database/database-design.md), [design system](../design/design-system.md) and the [testing strategy](testing-strategy.md). Exact lint rules, package versions and CI wiring are not selected.

## OPEN DECISION

[OD-10–OD-12, OD-16–OD-18, OD-21, OD-25–OD-26 and OD-30](../architecture/technology-decisions.md#open-decision-register) cover persistence/concurrency, authorization, contracts/content, scoring, fonts, test tooling and team workflow. No proposed standard here approves an otherwise open schema or policy.

## Related documentation

[Git workflow](git-workflow.md) · [Testing](testing-strategy.md) · [Security guidelines](../security/security-guidelines.md) · [Roadmap](roadmap.md)
