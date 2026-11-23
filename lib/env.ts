import { z } from 'zod';

/**
 * Environment variable validation (Zod).
 *
 * Server-only secrets MUST NOT use the NEXT_PUBLIC_ prefix — anything carrying
 * it is inlined into the browser bundle (README Appendix B). Validation is
 * lazy (function-based, not import-time) so that `next build` and offline
 * tooling can load modules without every variable present; the functions
 * throw a descriptive error listing every missing/invalid variable when a
 * value is actually required at runtime.
 */

const optionalUrl = z
  .string()
  .trim()
  .url()
  .optional();

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1).optional(),
  NEXT_PUBLIC_APP_URL: optionalUrl,
});

const serverEnvSchema = publicEnvSchema.extend({
  // PostgreSQL — server-only credentials, never exposed to the browser.
  DATABASE_URL: z.string().trim().url().optional(),
  DIRECT_URL: z.string().trim().url().optional(),
  // Supabase service-role key — server-only by definition. Optional until the
  // rare workflow that requires it is approved; never wire it into the client.
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1).optional(),
  // AI provider configuration (adapter pattern, README §4.4) — server-only.
  AI_PROVIDER: z.enum(['gemini', 'openai', 'anthropic']).optional(),
  GEMINI_API_KEY: z.string().trim().min(1).optional(),
  GEMINI_MODEL: z.string().trim().min(1).optional(),
  // Examination behaviour (server-enforced).
  EXAM_GRACE_WINDOW_MS: z.coerce.number().int().nonnegative().optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvValidationError extends Error {
  readonly issues: string[];

  constructor(scope: 'public' | 'server', issues: string[]) {
    super(`Invalid ${scope} environment variables:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

/** Validate public (browser-safe) environment values. Throws EnvValidationError on failure. */
export function parsePublicEnv(input: Record<string, string | undefined> = process.env): PublicEnv {
  const result = publicEnvSchema.safeParse(input);
  if (!result.success) {
    throw new EnvValidationError('public', formatIssues(result.error));
  }
  return result.data;
}

/** Validate the full server environment. Throws EnvValidationError on failure. */
export function parseServerEnv(input: Record<string, string | undefined> = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(input);
  if (!result.success) {
    throw new EnvValidationError('server', formatIssues(result.error));
  }
  return result.data;
}

/**
 * Database URL for Prisma, or undefined when the database is not configured
 * (e.g. CI lint/build). Callers that require a database must fail loudly via
 * {@link requireDatabaseUrl} instead of connecting with a placeholder.
 */
export function getDatabaseUrl(input: Record<string, string | undefined> = process.env): string | undefined {
  return serverEnvSchema.shape.DATABASE_URL.parse(input.DATABASE_URL);
}

/** Database URL or a descriptive error — use at the point a connection is required. */
export function requireDatabaseUrl(input: Record<string, string | undefined> = process.env): string {
  const url = getDatabaseUrl(input);
  if (!url) {
    throw new EnvValidationError('server', ['DATABASE_URL: required for database access but is not set']);
  }
  return url;
}
