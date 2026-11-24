/**
 * D2 regression — the snapshot used by the gate MUST be read through the same
 * transaction that holds the row lock.
 *
 * THE DEFECT THIS PINS
 *
 * `publishVersion` took `SELECT … FOR UPDATE` through `tx`, then called
 * `loadQuestionSnapshot(questionId)`, which called `getPrisma()` — a DIFFERENT
 * pooled connection. PostgreSQL served that connection the pre-transaction
 * committed state, so the lock protected nothing that was read.
 *
 * HOW THIS TEST DETECTS IT
 *
 * The test drives a real interactive transaction against real PostgreSQL. It
 * writes an uncommitted change (publish version 2), then asks a question that
 * only has a different answer depending on which connection is used to read:
 *
 *     same connection as the lock : sees the write   → snapshot says PUBLISHED
 *     a separate pooled connection: sees the old row → snapshot says DRAFT
 *
 * It then asserts the snapshot the gate would receive reflects the in-flight
 * write. Against the old implementation (`getPrisma()` inside the loader) this
 * fails, because the pooled read cannot see the uncommitted row. Against the
 * corrected implementation (`loadQuestionSnapshot(db, …)`) it passes.
 *
 * A note on scope: this does NOT call `publishVersion` itself, because
 * `publishVersion` owns its transaction and does not accept a client — that is
 * precisely the property being enforced. What is exercised here is the exact
 * call the service makes, with the exact client it now passes. The service
 * end-to-end behaviour is covered in `publish-service.test.ts`.
 */

import { PrismaClient } from '@/lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadQuestionSnapshot } from '@/server/questions/publish/snapshot';
import { cleanupFixtures, createMcqFixture, prisma as fixturePrisma } from './publish-fixtures-db';

const DATABASE_URL = process.env['DATABASE_URL'];
const hasDatabase = typeof DATABASE_URL === 'string' && DATABASE_URL.length > 0;
const describeDb = hasDatabase ? describe : describe.skip;

if (!hasDatabase) {
  console.warn('[D2] DATABASE_URL is not set — the D2 regression test was SKIPPED.');
}

/**
 * The transactional client, typed structurally.
 *
 * Deriving it from `PrismaClient['$transaction']` fails when the generated
 * client is absent (the sandbox case), so this mirrors the shape `gate.ts`
 * requires. It is also the more meaningful type: it asserts that the object
 * passed to `loadQuestionSnapshot` satisfies the interface the service
 * actually demands.
 */
type Tx = {
  $queryRaw(query: TemplateStringsArray, ...values: readonly unknown[]): Promise<unknown>;
  question: {
    findUnique<T = unknown>(args: unknown): Promise<T | null>;
    update(args: unknown): Promise<unknown>;
  };
  levelSubject: { findUnique<T = unknown>(args: unknown): Promise<T | null> };
  questionVersion: { update(args: unknown): Promise<unknown> };
};

let prisma: PrismaClient;

describeDb('D2 — the gate reads through the transaction that holds the lock', () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
  });

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
    await fixturePrisma.$disconnect();
  });

  it('sees an uncommitted write made inside the same transaction', async () => {
    const fixture = await makePublishableQuestion();

    await prisma
      .$transaction(async (tx) => {
        const db = tx as unknown as Tx;

        // 1. the lock, exactly as publishVersion takes it
        await db.$queryRaw`SELECT id FROM questions WHERE id = ${fixture.questionId}::uuid FOR UPDATE`;

        // 2. an uncommitted write that must be visible to a reader on THIS connection
        await db.questionVersion.update({
          where: { id: fixture.draftVersionId },
          data: { status: 'PUBLISHED' },
        });

        // 3. THE ASSERTION: the snapshot comes back through the transaction.
        const viaTx = await loadQuestionSnapshot(db, fixture.questionId);
        const txVersion = viaTx.versions.find((v) => v.id === fixture.draftVersionId);
        expect(
          txVersion?.status,
          'the snapshot did not see the transaction’s own uncommitted write — this is defect D2',
        ).toBe('PUBLISHED');

        // 4. POSITIVE CONTROL for the detector itself: a pooled client, reading
        //    the same rows at the same moment, must NOT see that write. If it
        //    did, the assertion above would prove nothing.
        const viaPool = await loadQuestionSnapshot(prisma as never, fixture.questionId);
        const poolVersion = viaPool.versions.find((v) => v.id === fixture.draftVersionId);
        expect(
          poolVersion?.status,
          'a separate pooled connection saw the uncommitted write, so this harness cannot distinguish the two clients',
        ).toBe('DRAFT');

        // Roll back so the fixture stays as created.
        throw new Error('rollback-by-design');
      })
      .catch((error: unknown) => {
        if ((error as Error).message !== 'rollback-by-design') throw error;
      });

    // 5. After the rollback the write is gone, so the difference above was
    //    genuinely transaction-scoped and not a stale read on either side.
    const after = await prisma.questionVersion.findUniqueOrThrow({
      where: { id: fixture.draftVersionId },
      select: { status: true },
    });
    expect(after.status).toBe('DRAFT');
  });

  it('a pooled read is demonstrably a different view (the D2 mechanism)', async () => {
    // Kept separate so the mechanism is stated once, plainly: a pooled client
    // used inside a transaction is NOT the same connection, and the snapshot is
    // sensitive to that difference. This is the whole bug in one assertion.
    const fixture = await makePublishableQuestion();

    await prisma
      .$transaction(async (tx) => {
        const db = tx as unknown as Tx;
        await db.questionVersion.update({
          where: { id: fixture.draftVersionId },
          data: { status: 'ARCHIVED' },
        });

        const viaTx = await loadQuestionSnapshot(db, fixture.questionId);
        const viaPool = await loadQuestionSnapshot(prisma as never, fixture.questionId);

        expect(viaTx.versions.find((v) => v.id === fixture.draftVersionId)?.status).toBe(
          'ARCHIVED',
        );
        expect(viaPool.versions.find((v) => v.id === fixture.draftVersionId)?.status).toBe('DRAFT');
        expect(viaTx.status).not.toBe(viaPool.status);

        throw new Error('rollback-by-design');
      })
      .catch((error: unknown) => {
        if ((error as Error).message !== 'rollback-by-design') throw error;
      });
  });
});

/* ---------------------------------------------------------------- */
/* Fixture                                                           */
/* ---------------------------------------------------------------- */

/** One publishable MCQ, built by the shared fixture module. */
async function makePublishableQuestion(): Promise<{
  questionId: string;
  draftVersionId: string;
}> {
  const { questionId, versionId } = await createMcqFixture();
  return { questionId, draftVersionId: versionId };
}
