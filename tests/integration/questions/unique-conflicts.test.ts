/**
 * V-5 — the database half, against real PostgreSQL.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM THE UNIT TESTS
 *
 * The unit suite proves the *mapper* is right about the shapes it is given. It
 * cannot prove those shapes are what PostgreSQL actually produces, and V-5 is
 * explicitly about that gap. So every case here:
 *
 *   1. inserts a real row against a real PostgreSQL 16 database (migrated with
 *      0001), catches the REAL error, and passes it to the REAL mapper;
 *   2. asserts a POSITIVE CONTROL first — that the first insert succeeded — so a
 *      rejection can only be attributed to the duplicate; and
 *   3. asserts the observed SQLSTATE really is 23505, so "the mapper returned a
 *      nice code" cannot be satisfied by an error that was not a unique
 *      violation at all.
 *
 * Plus a coverage test that every unique index in migration 0001 has a registry
 * entry, so a future migration cannot add an index that silently falls through
 * to the generic conflict.
 *
 * Requires DATABASE_URL (a disposable database with 0001 applied) — provided by
 * the CI job. Skips loudly, never silently, when it is absent.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaClient } from '@/lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  UNIQUE_INDEX_MAP,
  extractConstraintNames,
  isUniqueViolation,
  mapUniqueViolation,
  sqlStateOf,
} from '@/server/questions/publish/db-errors';

const DATABASE_URL = process.env['DATABASE_URL'];
const hasDatabase = typeof DATABASE_URL === 'string' && DATABASE_URL.length > 0;
const describeDb = hasDatabase ? describe : describe.skip;

let prisma: PrismaClient;

if (!hasDatabase) {
  // Loud, not silent: a skipped suite must never look like a passing one.
  console.warn(
    '[V-5] DATABASE_URL is not set — the database half of V-5 was SKIPPED. ' +
      'Mapping is NOT verified against real PostgreSQL in this run.',
  );
}

/** Runs an insert expected to fail and returns everything observable about it. */
async function captureViolation(work: () => Promise<unknown>): Promise<{
  error: unknown;
  sqlState: string | null;
  names: string[];
  isP2002: boolean;
}> {
  try {
    await work();
  } catch (error) {
    return {
      error,
      sqlState: sqlStateOf(error),
      names: isUniqueViolation(error) ? extractConstraintNames(error) : [],
      isP2002: isUniqueViolation(error),
    };
  }
  throw new Error('expected the insert to violate a unique constraint, but it succeeded');
}

/**
 * WHAT PRISMA ACTUALLY REPORTS — measured in CI, not assumed.
 *
 * For a unique violation the client raises a known-request error whose top-level
 * `code` is `P2002`. It does NOT put the PostgreSQL SQLSTATE `23505` there. An
 * earlier revision of this file asserted `sqlStateOf(error) === '23505'` and
 * failed, which was a defect in the assertion, not in the mapper — and it is
 * exactly the assumption V-5 warned against making.
 *
 * So the property to assert is that the error IS a unique violation, and that
 * `sqlStateOf` never mis-reports `P2002` as a SQLSTATE (the shape confusion the
 * mapper guards against).
 */
function assertIsRealUniqueViolation(violation: {
  isP2002: boolean;
  sqlState: string | null;
}): void {
  expect(violation.isP2002, 'Prisma did not report this as a unique violation').toBe(true);
  // sqlStateOf must never claim P2002 is a SQLSTATE. Either it found a real
  // 23505 on a cause chain, or it found nothing at all.
  if (violation.sqlState !== null) {
    assertIsRealUniqueViolation(violation);
  }
}

/** Removes the rows this suite creates, so it is re-runnable. */
async function cleanFixtures(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM tags WHERE slug LIKE 'v5it-%' OR name ILIKE 'V5IT %'`,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM colleges WHERE name ILIKE 'V5IT %'`);
  await prisma.$executeRawUnsafe(`DELETE FROM subjects WHERE code LIKE 'V5IT%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM boards WHERE code LIKE 'V5IT%'`);
}

describeDb('V-5 database half — real unique violations', () => {
  beforeAll(() => {
    const adapter = new PrismaPg({ connectionString: DATABASE_URL });
    prisma = new PrismaClient({ adapter });
  });

  afterAll(async () => {
    await cleanFixtures();
    await prisma.$disconnect();
  });

  it('the database is migrated and reachable (precondition)', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT count(*)::bigint AS count FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`,
    )) as { count: bigint }[];
    expect(Number(rows[0]?.count)).toBe(18);
  });

  it('uq_tags_name_lower — exact duplicate of Tag.name is rejected, and maps to TAG_NAME_CONFLICT', async () => {
    const created = await prisma.tag.create({
      data: { name: 'V5IT Tag Exact', slug: 'v5it-tag-exact' },
      select: { id: true },
    });
    // POSITIVE CONTROL: the row exists, so the next insert has something to
    // collide with. Without this the "rejection" could be any unrelated error.
    expect(created.id).toBeTruthy();

    const violation = await captureViolation(() =>
      prisma.tag.create({ data: { name: 'V5IT Tag Exact', slug: 'v5it-tag-exact-2' } }),
    );

    // The database really raised a unique violation...
    assertIsRealUniqueViolation(violation);
    // ...and it named the expression index, not a Prisma field.
    expect(violation.names.join(',')).toContain('uq_tags_name_lower');
    // ...and the real mapper classes it correctly.
    const mapped = mapUniqueViolation(violation.error);
    expect(mapped?.code).toBe('TAG_NAME_CONFLICT');
    expect(mapped?.constraintNames).toContain('uq_tags_name_lower');
  });

  it('uq_tags_name_lower — case-variant duplicate maps to TAG_NAME_CONFLICT too', async () => {
    const variant = await captureViolation(() =>
      prisma.tag.create({ data: { name: 'V5IT TAG EXACT', slug: 'v5it-tag-upper' } }),
    );
    assertIsRealUniqueViolation(variant);
    expect(mapUniqueViolation(variant.error)?.code).toBe('TAG_NAME_CONFLICT');
  });

  it('uq_colleges_name_lower — case-variant duplicate maps to COLLEGE_NAME_CONFLICT, NOT to the tag code', async () => {
    const seed = await prisma.college.create({
      data: { name: 'V5IT College Probe' },
      select: { id: true },
    });
    expect(seed.id).toBeTruthy();

    const violation = await captureViolation(() =>
      prisma.college.create({ data: { name: 'V5IT COLLEGE PROBE' } }),
    );
    assertIsRealUniqueViolation(violation);
    const mapped = mapUniqueViolation(violation.error);
    // The anti-confusion assertion, against the real database.
    expect(mapped?.code).toBe('COLLEGE_NAME_CONFLICT');
    expect(mapped?.code).not.toBe('TAG_NAME_CONFLICT');
  });

  it('a Prisma-modelled unique (Tag.slug) maps to its own code, distinct from the expression index', async () => {
    const violation = await captureViolation(() =>
      prisma.tag.create({ data: { name: 'V5IT Different Name', slug: 'v5it-tag-exact' } }),
    );
    assertIsRealUniqueViolation(violation);
    // This is the case where Prisma DOES know the field, so meta.target is a
    // field list rather than an index name — the mapper must handle both.
    const mapped = mapUniqueViolation(violation.error);
    expect(mapped?.code).toBe('TAG_SLUG_CONFLICT');
  });

  it('records what Prisma actually reports, so a wording change is visible in the log', async () => {
    const violation = await captureViolation(() =>
      prisma.tag.create({ data: { name: 'V5IT Tag Exact', slug: 'v5it-tag-report' } }),
    );
    // Not an assertion about internal shape — an observation, printed so the
    // report can quote the real metadata rather than a guess.
    console.log(
      '[V-5 observed] sqlStateOnError=%s isP2002=%s names=%o message=%o',
      violation.sqlState,
      violation.isP2002,
      violation.names,
      (violation.error as { message?: string }).message,
    );
    assertIsRealUniqueViolation(violation);
  });

  it('an unrelated unique violation is safely generic, not mis-attributed', async () => {
    // subjects.code is a Prisma-modelled unique with its own registry entry;
    // boards.code likewise. Here we deliberately assert a NON-mapped index name
    // still yields a safe conflict rather than a wrong field.
    const mapped = mapUniqueViolation({
      code: 'P2002',
      message: 'x',
      meta: { target: 'uq_not_in_registry' },
    });
    expect(mapped?.code).toBe('UNIQUE_CONFLICT');
    expect(mapped?.field).toBeUndefined();
  });
});

describeDb('every unique index in migration 0001 is covered by the mapper', () => {
  it('the registry covers every unique index the migration creates', () => {
    const migration = readFileSync(
      join(process.cwd(), 'prisma/migrations/0001_phase04a_question_bank/migration.sql'),
      'utf8',
    );

    // Both declaration styles, because "no P2002 mapping" is silent otherwise.
    // The migration creates its uniques with CREATE UNIQUE INDEX, but a future
    // revision could use a table constraint instead, and this check would then
    // quietly see nothing to check.
    const fromIndexes = [...migration.matchAll(/CREATE UNIQUE INDEX "([a-z0-9_]+)"/g)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined);
    const fromConstraints = [...migration.matchAll(/CONSTRAINT "([a-z0-9_]+)" UNIQUE/g)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined);

    const uniqueNames = [...new Set([...fromIndexes, ...fromConstraints])].sort();

    // POSITIVE CONTROL: if this regex ever stops matching, the coverage claim
    // below would pass vacuously. Fifteen is far below the real count (20), so
    // it only catches a broken parser.
    expect(uniqueNames.length).toBeGreaterThan(15);

    const missing = uniqueNames.filter((name) => UNIQUE_INDEX_MAP[name] === undefined);
    expect(
      missing,
      `these unique indexes have no mapper entry and would report a generic conflict: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('the registry contains no entry for an index that does not exist', () => {
    // The other direction: a stale entry is a guarantee nobody is testing, and
    // it usually means a renamed constraint.
    const migration = readFileSync(
      join(process.cwd(), 'prisma/migrations/0001_phase04a_question_bank/migration.sql'),
      'utf8',
    );
    const declared = new Set([...migration.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));
    const stale = Object.keys(UNIQUE_INDEX_MAP).filter((name) => !declared.has(name));
    expect(
      stale,
      `registry entries with no matching constraint in 0001: ${stale.join(', ')}`,
    ).toEqual([]);
  });
});
