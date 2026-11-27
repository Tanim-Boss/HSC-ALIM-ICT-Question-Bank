/**
 * Phase 04B — identity, authorization and audit against real PostgreSQL 16 with
 * migrations 0001 + 0002 applied.
 *
 * What is proven here, through the real services and the real database:
 *   · EDITOR publish → FORBIDDEN, no row changed, no audit row;
 *   · MODERATOR publish → PUBLISHED, published_by/at set, exactly one audit row;
 *   · separation of duties against a real `updated_by`;
 *   · a type change writes exactly one audit row;
 *   · audit_events rejects UPDATE, DELETE and TRUNCATE (trigger);
 *   · a failing audit insert rolls the publish back;
 *   · first-use provisioning creates one STUDENT profile, once;
 *   · bootstrap-super-admin refuses a second SUPER_ADMIN;
 *   · migration 0002 applies cleanly on top of 0001 holding existing data.
 *
 * Requires DATABASE_URL pointing at a disposable database with 0001 and 0002
 * applied, and `psql` on PATH for the migration-on-existing-data case (the CI
 * job installs postgresql-client-16).
 */

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@/lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapSuperAdmin } from '@/server/auth/bootstrap';
import { loadOrProvisionProfile } from '@/server/auth/profiles';
import { changeQuestionType } from '@/server/questions/change-type';
import { publishVersion } from '@/server/questions/publish/gate';
import { ACTOR_IDS, actorFor, ensureActorProfiles } from '../auth-fixtures';
import {
  cleanupFixtures,
  createMcqFixture,
  prisma as fixturePrisma,
} from '../questions/publish-fixtures-db';

const DATABASE_URL = process.env['DATABASE_URL'];
const hasDatabase = typeof DATABASE_URL === 'string' && DATABASE_URL.length > 0;
const describeDb = hasDatabase ? describe : describe.skip;

if (!hasDatabase) {
  console.warn('[04B] DATABASE_URL is not set — identity/audit integration tests were SKIPPED.');
}

const MIGRATIONS = fileURLToPath(new URL('../../../prisma/migrations/', import.meta.url));
const SEED = fileURLToPath(
  new URL('../../../docs/database/g1-spike/option-c/prod-ready/v2/seed-data.sql', import.meta.url),
);

let prisma: PrismaClient;

async function versionState(versionId: string) {
  return prisma.questionVersion.findUniqueOrThrow({
    where: { id: versionId },
    select: { status: true, publishedById: true, publishedAt: true, updatedAt: true },
  });
}

async function questionState(questionId: string) {
  return prisma.question.findUniqueOrThrow({
    where: { id: questionId },
    select: { status: true, type: true, updatedAt: true },
  });
}

function auditRowsFor(resourceId: string) {
  return prisma.auditEvent.findMany({ where: { resourceId }, orderBy: { occurredAt: 'asc' } });
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describeDb('Phase 04B — identity, authorization and audit (real PostgreSQL)', () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL ?? '' }) });
    await ensureActorProfiles(prisma);
  });

  beforeEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
    await fixturePrisma.$disconnect();
  });

  it('precondition: migration 0002 is applied (the audit trigger exists)', async () => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM pg_trigger
       WHERE tgname IN ('trg_audit_events_append_only', 'trg_audit_events_no_truncate')`;
    expect(Number(rows[0]?.n)).toBe(2);
  });

  // ── publishing ─────────────────────────────────────────────────────────

  it('EDITOR publish → FORBIDDEN, no row changed and no audit row', async () => {
    const { questionId, versionId } = await createMcqFixture();
    const vBefore = await versionState(versionId);
    const qBefore = await questionState(questionId);

    const error = await caught(publishVersion(actorFor('editor'), { questionId, versionId }));

    expect(error).toMatchObject({ code: 'FORBIDDEN' });
    expect(await versionState(versionId)).toEqual(vBefore);
    expect(await questionState(questionId)).toEqual(qBefore);
    expect(await auditRowsFor(versionId)).toHaveLength(0);
  });

  it('STUDENT publish → FORBIDDEN as well', async () => {
    const { questionId, versionId } = await createMcqFixture();
    const error = await caught(publishVersion(actorFor('student'), { questionId, versionId }));
    expect(error).toMatchObject({ code: 'FORBIDDEN' });
    expect((await versionState(versionId)).status).toBe('DRAFT');
  });

  it('MODERATOR publish → PUBLISHED, published_by set, exactly one audit row', async () => {
    const { questionId, versionId } = await createMcqFixture();
    const startedAt = Date.now();

    await publishVersion(actorFor('moderator'), { questionId, versionId, requestId: 'req-04b-1' });

    const v = await versionState(versionId);
    expect(v.status).toBe('PUBLISHED');
    expect(v.publishedById).toBe(ACTOR_IDS.moderator);
    expect(v.publishedAt).not.toBeNull();
    expect(v.publishedAt?.getTime()).toBeGreaterThanOrEqual(startedAt - 5_000);
    expect((await questionState(questionId)).status).toBe('PUBLISHED');

    const rows = await auditRowsFor(versionId);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({
      actorId: ACTOR_IDS.moderator,
      action: 'question.publish',
      resourceType: 'question_version',
      resourceId: versionId,
      requestId: 'req-04b-1',
    });
    expect(row?.before).toMatchObject({ status: 'DRAFT', questionId });
    expect(row?.after).toMatchObject({ status: 'PUBLISHED', publishedBy: ACTOR_IDS.moderator });
    // Never answer data: the fixture's correct option is 'A'; no key may carry it.
    const payload = JSON.stringify([row?.before, row?.after]);
    expect(payload).not.toMatch(/answer|rubric|correct|mcq/i);
  });

  it('separation of duties: the last editor cannot publish their own version', async () => {
    const { questionId, versionId } = await createMcqFixture();
    await prisma.questionVersion.update({
      where: { id: versionId },
      data: { createdById: ACTOR_IDS.editor, updatedById: ACTOR_IDS.editorModerator },
    });

    const error = await caught(
      publishVersion(actorFor('editorModerator'), { questionId, versionId }),
    );
    expect(error).toMatchObject({ code: 'FORBIDDEN', invariant: 'separation-of-duties' });
    expect((await versionState(versionId)).status).toBe('DRAFT');
    expect(await auditRowsFor(versionId)).toHaveLength(0);

    // A different moderator may publish it.
    await publishVersion(actorFor('moderator'), { questionId, versionId });
    expect((await versionState(versionId)).publishedById).toBe(ACTOR_IDS.moderator);
  });

  it('separation of duties falls back to created_by when nobody edited since creation', async () => {
    const { questionId, versionId } = await createMcqFixture();
    await prisma.questionVersion.update({
      where: { id: versionId },
      data: { createdById: ACTOR_IDS.moderator },
    });
    const error = await caught(publishVersion(actorFor('moderator'), { questionId, versionId }));
    expect(error).toMatchObject({ invariant: 'separation-of-duties' });
  });

  it('SUPER_ADMIN may publish a version they last edited', async () => {
    const { questionId, versionId } = await createMcqFixture();
    await prisma.questionVersion.update({
      where: { id: versionId },
      data: { updatedById: ACTOR_IDS.superAdmin },
    });
    await publishVersion(actorFor('superAdmin'), { questionId, versionId });
    expect((await versionState(versionId)).publishedById).toBe(ACTOR_IDS.superAdmin);
  });

  it('a failing audit insert rolls the publish back', async () => {
    const { questionId, versionId } = await createMcqFixture();
    const vBefore = await versionState(versionId);
    const qBefore = await questionState(questionId);

    // A trigger scoped to THIS version's id, so nothing else is affected even if
    // the drop below were missed. The failure happens on the audit insert, the
    // LAST write of the publish transaction, after the version and question
    // rows have already been updated inside it.
    const fn = `test_fail_audit_${versionId.replaceAll('-', '')}`;
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN RAISE EXCEPTION 'simulated audit failure'; END; $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${fn} BEFORE INSERT ON audit_events FOR EACH ROW
         WHEN (NEW.resource_id = '${versionId}'::uuid) EXECUTE FUNCTION ${fn}()`,
    );
    try {
      const error = await caught(publishVersion(actorFor('moderator'), { questionId, versionId }));
      expect(String((error as Error | null)?.message)).toMatch(/simulated audit failure/);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${fn} ON audit_events`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`);
    }

    expect(await versionState(versionId)).toEqual(vBefore);
    expect(await questionState(questionId)).toEqual(qBefore);
    expect(await auditRowsFor(versionId)).toHaveLength(0);

    // And with the failure gone, the same publish succeeds — the rollback left
    // nothing half-done behind.
    await publishVersion(actorFor('moderator'), { questionId, versionId });
    expect(await auditRowsFor(versionId)).toHaveLength(1);
  });

  // ── type change ────────────────────────────────────────────────────────

  it('a type change by an EDITOR writes exactly one audit row; a no-op writes none', async () => {
    const { questionId } = await createMcqFixture();

    await changeQuestionType(actorFor('editor'), { questionId, nextType: 'MCQ' });
    expect(await auditRowsFor(questionId)).toHaveLength(0);

    await changeQuestionType(actorFor('editor'), { questionId, nextType: 'CQ' });
    const rows = await auditRowsFor(questionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: ACTOR_IDS.editor,
      action: 'question.change_type',
      resourceType: 'question',
      before: { type: 'MCQ' },
      after: { type: 'CQ' },
    });
  });

  it('a STUDENT type change → FORBIDDEN and nothing written', async () => {
    const { questionId } = await createMcqFixture();
    const error = await caught(
      changeQuestionType(actorFor('student'), { questionId, nextType: 'CQ' }),
    );
    expect(error).toMatchObject({ code: 'FORBIDDEN' });
    expect((await questionState(questionId)).type).toBe('MCQ');
    expect(await auditRowsFor(questionId)).toHaveLength(0);
  });

  // ── audit_events is append-only ────────────────────────────────────────

  describe('audit_events is append-only', () => {
    let eventId: string;

    beforeAll(async () => {
      const row = await prisma.auditEvent.create({
        data: {
          actorId: ACTOR_IDS.moderator,
          action: 'question.publish',
          resourceType: 'question_version',
          resourceId: randomUUID(),
        },
        select: { id: true },
      });
      eventId = row.id;
    });

    it('rejects UPDATE', async () => {
      const error = await caught(
        prisma.$executeRaw`UPDATE audit_events SET action = 'question.archive' WHERE id = ${eventId}::uuid`,
      );
      expect(String((error as Error | null)?.message)).toMatch(/append-only/);
    });

    it('rejects UPDATE through Prisma too', async () => {
      const error = await caught(
        prisma.auditEvent.update({ where: { id: eventId }, data: { action: 'question.archive' } }),
      );
      expect(error).not.toBeNull();
    });

    it('rejects DELETE', async () => {
      const error = await caught(
        prisma.$executeRaw`DELETE FROM audit_events WHERE id = ${eventId}::uuid`,
      );
      expect(String((error as Error | null)?.message)).toMatch(/append-only/);
    });

    it('rejects TRUNCATE', async () => {
      const error = await caught(prisma.$executeRawUnsafe('TRUNCATE audit_events'));
      expect(String((error as Error | null)?.message)).toMatch(/append-only/);
    });

    it('the row is still there, unchanged', async () => {
      const row = await prisma.auditEvent.findUniqueOrThrow({ where: { id: eventId } });
      expect(row.action).toBe('question.publish');
    });
  });

  // ── provisioning and bootstrap ─────────────────────────────────────────

  it('first use provisions one STUDENT profile with one audit row; second use adds nothing', async () => {
    const id = randomUUID();
    const first = await loadOrProvisionProfile(prisma, { id, displayName: 'নতুন ছাত্র' });
    expect(first).toEqual({ isActive: true, roles: ['STUDENT'] });

    const again = await loadOrProvisionProfile(prisma, { id, displayName: 'ignored' });
    expect(again).toEqual(first);

    const roles = await prisma.userRole.findMany({ where: { userId: id } });
    expect(roles.map((r) => r.role)).toEqual(['STUDENT']);
    const audit = await auditRowsFor(id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: id, action: 'profile.provision' });
  });

  it('bootstrap-super-admin refuses while a SUPER_ADMIN exists, and writes nothing', async () => {
    // The fixture set includes a SUPER_ADMIN, so this database already has one.
    const before = await prisma.auditEvent.count();
    const error = await caught(bootstrapSuperAdmin(prisma, 'anyone@example.com'));
    expect(error).toMatchObject({ reason: 'SUPER_ADMIN_EXISTS' });
    expect(await prisma.auditEvent.count()).toBe(before);
  });

  // ── migration 0002 on a database that already holds 0001 data ─────────

  it('migration 0002 applies cleanly on top of 0001 with existing data', () => {
    const base = new URL(DATABASE_URL ?? '');
    const dbName = `m0002_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const target = new URL(base);
    target.pathname = `/${dbName}`;
    const psql = (url: URL, args: readonly string[]): string =>
      execFileSync('psql', [url.toString(), '-v', 'ON_ERROR_STOP=1', '-q', '-At', ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

    psql(base, ['-c', `CREATE DATABASE ${dbName}`]);
    try {
      psql(target, ['-f', `${MIGRATIONS}0001_phase04a_question_bank/migration.sql`]);
      // The V-2 realistic seed: it contains PUBLISHED versions and verified
      // keys with no author — exactly the legacy rows NOT VALID exists for.
      psql(target, ['-f', SEED]);
      const legacy = psql(target, [
        '-c',
        `SELECT (SELECT count(*) FROM question_versions WHERE status = 'PUBLISHED') || '/' ||
                (SELECT count(*) FROM answer_keys WHERE is_verified)`,
      ]).trim();
      const [published, verified] = legacy.split('/').map(Number);
      expect(published, 'the seed must contain legacy PUBLISHED rows').toBeGreaterThan(0);
      expect(verified, 'the seed must contain legacy verified keys').toBeGreaterThan(0);

      psql(target, ['-f', `${MIGRATIONS}0002_identity_audit/migration.sql`]);

      const inventory = psql(target, [
        '-c',
        `SELECT (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') || '/' ||
                (SELECT count(*) FROM pg_type WHERE typtype = 'e' AND typnamespace = 'public'::regnamespace) || '/' ||
                (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace) || '/' ||
                (SELECT count(*) FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace AND conname LIKE 'ck\\_%')`,
      ]).trim();
      expect(inventory).toBe('21/8/33/54');

      // Legacy rows survived untouched.
      expect(
        psql(target, [
          '-c',
          `SELECT count(*) FROM question_versions WHERE status = 'PUBLISHED' AND published_by IS NULL`,
        ]).trim(),
      ).toBe(String(published));

      // The two authorship CHECKs are NOT VALID (existing rows unscanned)...
      expect(
        psql(target, [
          '-c',
          `SELECT string_agg(conname || '=' || convalidated, ',' ORDER BY conname) FROM pg_constraint
            WHERE conname IN ('ck_question_versions_published_has_publisher', 'ck_answer_keys_verified_has_verifier')`,
        ]).trim(),
      ).toBe(
        'ck_answer_keys_verified_has_verifier=false,ck_question_versions_published_has_publisher=false',
      );

      // ...and still enforced for every new write: a new PUBLISHED version
      // with no publisher is refused by the CHECK (evaluated before the
      // one-published-version index, so the CHECK is what fires).
      expect(() =>
        psql(target, [
          '-c',
          `INSERT INTO question_versions (id, question_id, version_number, status, content, updated_at)
           SELECT gen_random_uuid(), id, 999, 'PUBLISHED',
                  '{"format":"rich_blocks","version":1,"blocks":[]}', now()
             FROM questions LIMIT 1`,
        ]),
      ).toThrow(/ck_question_versions_published_has_publisher/);
    } finally {
      psql(base, ['-c', `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`]);
    }
  });
});
