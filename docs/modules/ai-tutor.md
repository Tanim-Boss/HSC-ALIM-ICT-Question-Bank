# AI Tutor and provider adapter

**Purpose and scope.** Define on-demand explanations, wrong-answer support and the server-side AI boundary. The tutor is an assistant, not an examination evaluator, source of truth or general-purpose bank browser.

## Responsibilities and boundaries

The Tutor service authorizes a user and question/version, checks the approved answer-release policy, assembles minimal context, calls an internal provider adapter, validates the response and returns only authorized content. Gemini 2.5 Flash is the blueprint's default; vendor SDK imports belong inside the adapter, not UI, tutor or parser code. The authoritative `AnswerKey` and rubric are maintained by Question Bank. If the key is missing, questionable or conflicts with model output, return a needs-verification outcome rather than inventing correctness; record a safe data-quality signal for review.

```text
Authorized explanation request → release/ownership checks → current question context
  → provider-neutral adapter → Gemini (default) → schema validation → safe AI-labelled response
```

An active exam must not gain an answer or rubric through the tutor, even if the same question is reachable elsewhere. Cross-session, previous-review, guest and overlapping-question release rules remain **OD-14**. Do not treat an AI explanation as permission to bypass the stricter ban on keys in student-facing exam APIs. Provider failure must not block exam taking or reveal a key as an unauthorized fallback.

## Prompt, output and multimodal safety

- Treat question content, options, student's answer and written reasoning as **untrusted data**, delimited from instructions. Do not state the student's response as verified truth. Supply only the current authorized question; do not grant model tools or unrelated users' data/keys.
- Validate structured output against the approved schema on the server, reject/strip unknown fields as appropriate and render it safely. The README's example output is not an approved schema; it conflicts with its own untrusted-input rule.
- Ground explanations in the verified key and label them as AI-generated; AI never determines correctness, proposes CQ marks or awards scores. For ambiguous data it should state uncertainty rather than rationalize a false key.
- For diagrams, fetch only an authorized asset by server-controlled ID, validate image bytes/type and size, and consider downscaling to roughly 1024 px on the long edge. Do not fetch arbitrary user-provided URLs. A cached vision description must respect asset permissions; insufficient confidence yields a clear limitation.

## Cost and availability guidance

The README proposes 20 explanations per student/hour and 100/day, roughly 4k input tokens and 900 output tokens, a 20-second timeout with no automatic retry on timeout, and on-demand calls only. Show remaining quota before exhaustion. A proposed cache key is `(questionVersionId, studentAnswerHash, modelId, promptVersion)`; access/release checks must occur even on a cache hit. A low-entropy MCQ answer hash may be guessable and may not isolate users; the hashing, cache scope, provider retention and privacy policy are OD-29. Atomic rate-limit storage is OD-06. These limits are blueprint guidance, not proof of a deployed quota system.

## Acceptance criteria

- Provider key and SDK usage are absent from client bundles and feature code outside the adapter.
- A missing or conflicting key leads to verification, never a fabricated official answer; no AI-generated CQ mark is produced.
- Prompt-injection input cannot instruct the model to retrieve other questions; output validation and release gating prevent leakage even on cache hits.
- Rate limits, timeout and provider outage produce safe localized feedback without affecting the exam; logs exclude raw secrets and sensitive prompt content.
- Diagram explanations either use the authorized diagram accurately or clearly acknowledge uncertainty.

## Dependencies

Depends on the [Question Bank](question-bank.md) for authorized versions, key/rubric and assets; [Examination Engine](examination-engine.md) for release state; [Student Management](student-management.md) for identity; the provider adapter and rate-limit storage; and the [security policy](../security/security-guidelines.md). Administration's optional parser uses the same adapter boundary but has separate review/publish responsibilities.

## OPEN DECISION

[OD-05–OD-06, OD-10, OD-14–OD-15, OD-19–OD-20, OD-24 and OD-29](../architecture/technology-decisions.md#open-decision-register) cover AI content admission, limits, versioning/release, privacy, scoring conflict and cache/output/provider handling.

## Related documentation

[API contracts](../api/api-contracts.md) · [Administration](administration.md) · [Technology decisions](../architecture/technology-decisions.md) · [Testing](../development/testing-strategy.md)
