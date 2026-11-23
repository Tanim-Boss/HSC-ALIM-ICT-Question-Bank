# lib/validation/ — Zod schemas at trust boundaries

Every external input (route handlers, server actions, environment payloads,
AI responses) is parsed with Zod before use (README §9.1; docs/development/
coding-standards.md). Schemas are grouped by domain next to their service when
introduced; cross-cutting schemas (e.g. pagination, cursors) live here.

Rules: `unknown` + parse at the boundary — never unchecked `any` or type
assertions on untrusted data. Recursive allowlists for outputs returned to
clients. See `lib/env.ts` for the environment-validation example.
