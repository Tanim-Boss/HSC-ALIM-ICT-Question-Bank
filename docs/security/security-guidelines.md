# Security guidelines

**Purpose and scope.** Define security controls and review requirements for the planned platform, spanning identity, exams, content, AI, storage and operations. This is not a completed threat assessment or compliance certification.

## Responsibilities and boundaries

All inputs and clients are untrusted. Domain services enforce invariants; API boundaries validate and authorize; infrastructure isolates secrets and data; administrators act through audited privileged operations. Defense in depth does not replace server-side authorization or server-authoritative evaluation.

| Threat / failure | Required control |
|---|---|
| Answer-key disclosure | Exam APIs use recursive allowlisted DTOs and never return keys, correct option IDs, rubrics or solutions, even after submission. Check nested content, errors, caches, assets, exports and AI output; gate answer-revealing non-exam surfaces. |
| Timer/score manipulation | Persist server start/expiry, validate every answer and finalization against server time/state, score on the server from authoritative data, and make finalization idempotent. |
| Broken object-level authorization | Verify principal, action, ownership and item membership for every request, background job and artifact download. Never rely on hidden UI or caller-provided user/role. |
| Untrusted rich content | Accept validated typed blocks, sanitize on save and render, escape text, and prevent execution of arbitrary HTML/JS. SVG and embedded URLs require an approved safe policy. |
| Malicious upload | Validate size, extension, declared type and magic bytes/content; store outside the database with safe content types. Scanning, accepted formats, isolation and signed-link lifetime are OD-19. |
| Prompt injection / hallucination | Delimit student/question text as untrusted data; give the model no tools or unrelated questions/keys; validate output, do not treat model text as truth, and enforce release policy. |
| Secrets exposure | Keep provider keys, database credentials, worker tokens and service-role keys server-only and out of logs/repository/client bundles. `NEXT_PUBLIC_` values are browser-visible. Rotate leaked credentials. |
| Abuse and cost | Rate-limit auth, autosave, AI and exports; use atomic counters and quotas; do not call AI on page load. Limit request/body size according to approved policies. |
| Privileged misuse | Least privilege, explicit server-side roles, traceable changes to content/keys/roles/settings, and protected audit access. Do not write raw secrets, keys, tokens or private responses to ordinary logs. |
| Session/network attack | HTTPS, verified session tokens, secure cookie settings and CSRF protection appropriate to transport; use security headers/CSP after implementation-specific review. |
| Loss/corruption | Review migrations, isolate environments, back up data and test restore; define RPO/RTO and incident procedures before production. |

Bengali, code and math content must be rendered safely without evaluating student-provided HTML or scripts. Local offline answer mirrors are convenience only and can be read by scripts on the same origin; store no key or provider credential there. Their retention, cleanup and privacy are **OD-20**.

## Security verification

Before release, test student-to-student isolation, staff escalation, direct endpoint access without UI, cross-surface answer-key leakage, tampered IDs/roles, upload bypasses, XSS and prompt injection, concurrent exam finalization, expired requests, CSRF/session behavior, quota races and unauthorized export links. Inspect responses and bundles recursively rather than relying on a visual check. Security findings must be resolved or explicitly accepted by an authorized owner.

## Dependencies

This guidance depends on [authentication](authentication.md), [authorization](authorization.md), the [exam engine](../modules/examination-engine.md), [API projections](../api/api-contracts.md), the [AI adapter](../modules/ai-tutor.md), object storage and [deployment controls](../deployment/deployment-architecture.md).

## OPEN DECISION

[OD-02, OD-04–OD-06, OD-10–OD-12, OD-14–OD-20, OD-22, OD-26–OD-29](../architecture/technology-decisions.md#open-decision-register) cover unresolved release, auth, content, storage, privacy, testing and operational controls. No specific legal compliance claim, retention period or production hardening status is implied.

## Related documentation

[Authentication](authentication.md) · [Authorization](authorization.md) · [Testing](../development/testing-strategy.md) · [Deployment](../deployment/deployment-architecture.md)
