# server/ — domain services (business logic boundary)

Business rules live here, never inside React components or route handlers
(README §5, §8; docs/architecture/module-architecture.md). One folder per
domain module; each owns its writes and exposes a narrow server-side interface:

| Module | Owns |
|---|---|
| `questions/` | Question bank: taxonomy, content blocks, sources, versions, keys, assets |
| `exams/` | Examination lifecycle, snapshots, sessions, answers, evaluation |
| `analytics/` | Derived performance metrics and snapshots |
| `ai-tutor/` | Context assembly, cached explanations, quotas (AI adapter only) |
| `exports/` | Document model, print view, export orchestration |
| `admin/` | Admin workflows, moderation, audit coordination |
| `users/` | Profiles, roles associations, saved questions |

Boundaries enforced by code review and lint discipline:

- Route handlers / Server Actions authenticate → validate (Zod schemas from
  `lib/validation/`) → authorize → delegate to a service here.
- Services access PostgreSQL only through `lib/db.ts` (Prisma).
- Answer keys and service credentials never leave this server boundary.
- No module reaches into another module's tables; cross-module calls go
  through the owning module's interface.
