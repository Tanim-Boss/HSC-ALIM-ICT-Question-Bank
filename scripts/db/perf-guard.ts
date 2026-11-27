/**
 * Safety gate for the Phase 04D performance dataset and the perf harness.
 *
 * The seed script writes ~800,000 rows. Nothing in this repository may ever
 * point that at production or staging — and "we did not set DATABASE_URL in
 * that shell" is not a control, it is a hope. So the gate is a *decision
 * function* that fails closed, and it is unit-tested (tests/unit/db/perf-guard)
 * without a database:
 *
 *   1. OPT-IN. `ICT_PERF_SEED=1` must be set explicitly. Importing an
 *      application module, running `npm test`, or having DATABASE_URL exported
 *      for the app is NOT authorisation to seed.
 *   2. TARGET. The URL comes from `ICT_PERF_DATABASE_URL` when present, else
 *      `DATABASE_URL`, so the operator can point a disposable database at the
 *      tool without exporting it for the whole session.
 *   3. HOST. Loopback only (`localhost`, `127.0.0.0/8`, `::1`, `[::1]`). A
 *      remote host — including any Supabase pooled/direct endpoint — is
 *      refused. There is deliberately no override flag: a flag is a thing an
 *      exhausted person flips at 2 a.m.
 *   4. NAME. The database must match `ict_perf_…`. `ict_atlas` (the name in
 *      .env.example), `postgres`, `template1`, and any name containing
 *      prod/staging/live/main is refused even on loopback.
 *   5. RUNTIME. `NODE_ENV=production` is refused.
 *   6. IDENTITY, not the string. A URL is a claim; `verifyPerfDatabase()`
 *      checks the *server* afterwards: current_database() must equal the URL's
 *      database, inet_server_addr() must be loopback, the major version must be
 *      16 (the version the physical schema was measured on), and the Phase 04A
 *      question-bank tables must exist. If identity cannot be established the
 *      caller must abort.
 *
 * The seeder additionally refuses a database that already holds question rows:
 * it never truncates, resets or overwrites. Reproducibility is achieved by
 * seeding a NEW empty disposable database from the fixed seed, not by wiping
 * an existing one.
 *
 * This module is pure with respect to the database (no I/O except in
 * verifyPerfDatabase, which only reads) and imports nothing from the app.
 */

/** The explicit opt-in variable for the performance seeder. */
export const PERF_SEED_OPT_IN = 'ICT_PERF_SEED';
/** Dedicated target override; falls back to DATABASE_URL. */
export const PERF_DATABASE_URL = 'ICT_PERF_DATABASE_URL';
/** The set of env vars a perf run may use. Documented in docs/database/perf/. */
export const PERF_BENCH_OPT_IN = 'ICT_PERF_BENCH';

/** Refusal reason codes — stable, so tests and logs can assert on them. */
export type PerfSafetyReason =
  | 'OPT_IN_MISSING'
  | 'TARGET_MISSING'
  | 'TARGET_UNPARSEABLE'
  | 'PROTOCOL_INVALID'
  | 'HOST_NOT_LOOPBACK'
  | 'DATABASE_NAME_NOT_DISPOSABLE'
  | 'PROTECTED_IDENTIFIER'
  | 'PRODUCTION_RUNTIME'
  | 'TARGET_MISMATCH'
  | 'SERVER_VERSION_UNEXPECTED';

export class PerfSafetyError extends Error {
  readonly reason: PerfSafetyReason;

  constructor(reason: PerfSafetyReason, message: string) {
    super(message);
    this.name = 'PerfSafetyError';
    this.reason = reason;
  }
}

export interface PerfTarget {
  /** The connection string the tool will use. */
  readonly url: string;
  /** The database the URL names — asserted again against the live server. */
  readonly databaseName: string;
  readonly host: string;
  readonly port: number;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const LOOPBACK_V4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/**
 * Names that must never be seeded, even on loopback: the application database
 * from .env.example, PostgreSQL's own databases, and anything that reads like a
 * shared environment.
 */
const PROTECTED_DATABASE_NAMES = new Set(['ict_atlas', 'postgres', 'template0', 'template1']);
const PROTECTED_WORDS = ['prod', 'production', 'staging', 'stage', 'live', 'main', 'master'];

const DISPOSABLE_NAME = /^ict_perf_[a-z0-9_]{1,40}$/;

function isLoopbackHost(host: string): boolean {
  const normalised = host.trim().toLowerCase();
  if (LOOPBACK_HOSTS.has(normalised)) return true;
  return LOOPBACK_V4.test(normalised);
}

/** Throws unless the environment demands a performance seed. */
export function assertPerfSeedOptIn(env: NodeJS.ProcessEnv, optIn = PERF_SEED_OPT_IN): void {
  if (env[optIn] !== '1') {
    throw new PerfSafetyError(
      'OPT_IN_MISSING',
      `${optIn}=1 is required. Refusing to run: an ordinary application startup path is not ` +
        `authorisation to write or benchmark a performance dataset.`,
    );
  }
}

/**
 * Resolves and validates the *claim* (the URL). Nothing is contacted here, so
 * this half is unit-testable. `verifyPerfDatabase` checks reality afterwards.
 */
export function resolvePerfTarget(env: NodeJS.ProcessEnv, optIn = PERF_SEED_OPT_IN): PerfTarget {
  assertPerfSeedOptIn(env, optIn);

  if (env['NODE_ENV'] === 'production') {
    throw new PerfSafetyError('PRODUCTION_RUNTIME', 'NODE_ENV=production. Refusing to seed.');
  }

  const raw = env[PERF_DATABASE_URL] ?? env['DATABASE_URL'];
  if (raw === undefined || raw.trim() === '') {
    throw new PerfSafetyError(
      'TARGET_MISSING',
      `${PERF_DATABASE_URL} (or DATABASE_URL) must name the disposable performance database.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new PerfSafetyError('TARGET_UNPARSEABLE', 'The target is not a parseable URL.');
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new PerfSafetyError(
      'PROTOCOL_INVALID',
      `Protocol ${parsed.protocol} is not postgresql:// — refusing.`,
    );
  }

  const host = parsed.hostname;
  if (!isLoopbackHost(host)) {
    throw new PerfSafetyError(
      'HOST_NOT_LOOPBACK',
      `Host "${host}" is not loopback. The performance seed runs only against an isolated ` +
        `local database; remote, pooled and managed endpoints — including Supabase — are refused ` +
        `and there is no override.`,
    );
  }

  // pathname is "/<database>"; decode and strip a leading slash.
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const lowerName = databaseName.toLowerCase();

  if (
    PROTECTED_DATABASE_NAMES.has(lowerName) ||
    PROTECTED_WORDS.some((w) => lowerName.includes(w))
  ) {
    throw new PerfSafetyError(
      'PROTECTED_IDENTIFIER',
      `Database "${databaseName}" is a protected identifier (application database, admin ` +
        `database, or a production/staging-looking name). Refusing.`,
    );
  }

  if (!DISPOSABLE_NAME.test(databaseName)) {
    throw new PerfSafetyError(
      'DATABASE_NAME_NOT_DISPOSABLE',
      `Database "${databaseName}" is not explicitly disposable. Name it ict_perf_<something> ` +
        `and create it for this measurement.`,
    );
  }

  const port = parsed.port === '' ? 5432 : Number(parsed.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new PerfSafetyError('TARGET_UNPARSEABLE', `Port "${parsed.port}" is not a valid port.`);
  }

  return { url: raw, databaseName, host, port };
}

/** The minimum surface of `pg`'s Client this module needs; keeps it testable. */
export interface PerfIdentityClient {
  query<R extends Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: R[] }>;
}

const QUESTION_BANK_TABLES = [
  'questions',
  'question_versions',
  'question_options',
  'answer_keys',
  'question_sources',
  'question_tags',
] as const;

export interface PerfIdentity {
  readonly database: string;
  readonly serverAddress: string | null;
  readonly serverVersionNum: number;
}

/**
 * Establishes the *live* identity of the target. Every check is a refusal, not
 * a warning: the seeder calls this before its first write.
 */
export async function verifyPerfDatabase(
  client: PerfIdentityClient,
  target: PerfTarget,
  expectedServerMajor = 16,
): Promise<PerfIdentity> {
  const facts = await client.query<{
    database: string;
    server_address: string | null;
    server_version_num: string;
  }>(
    `SELECT current_database() AS database,
            host(inet_server_addr()) AS server_address,
            current_setting('server_version_num') AS server_version_num`,
  );
  const row = facts.rows[0];
  if (row === undefined) {
    throw new PerfSafetyError('TARGET_MISSING', 'The server did not report its identity.');
  }

  if (row.database !== target.databaseName) {
    throw new PerfSafetyError(
      'TARGET_MISMATCH',
      `Connected to "${row.database}" but the URL names "${target.databaseName}". Refusing.`,
    );
  }

  // inet_server_addr() is NULL for a unix-socket connection; the URL host was
  // already forced to loopback, and a unix socket is strictly more local.
  if (row.server_address !== null && !isLoopbackHost(row.server_address)) {
    throw new PerfSafetyError(
      'HOST_NOT_LOOPBACK',
      `The server reports address "${row.server_address}", which is not loopback. Refusing.`,
    );
  }

  const versionNum = Number(row.server_version_num);
  if (!Number.isInteger(versionNum) || Math.floor(versionNum / 10000) !== expectedServerMajor) {
    throw new PerfSafetyError(
      'SERVER_VERSION_UNEXPECTED',
      `Server version ${row.server_version_num} is not PostgreSQL ${expectedServerMajor}. ` +
        `Measurements are only comparable to the environment the schema was verified on.`,
    );
  }

  const tables = await client.query<{ name: string }>(
    `SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [[...QUESTION_BANK_TABLES]],
  );
  const present = new Set(tables.rows.map((r) => r.name));
  const missing = QUESTION_BANK_TABLES.filter((t) => !present.has(t));
  if (missing.length > 0) {
    throw new PerfSafetyError(
      'TARGET_MISSING',
      `The target is not an ICT Atlas database: missing ${missing.join(', ')}. ` +
        `Apply prisma/migrations first.`,
    );
  }

  return {
    database: row.database,
    serverAddress: row.server_address,
    serverVersionNum: versionNum,
  };
}

/** Human-readable acknowledgement the tools print once the gate has passed. */
export function describePerfTarget(target: PerfTarget): string {
  return `${target.databaseName} @ ${target.host}:${String(target.port)} (loopback, disposable)`;
}
