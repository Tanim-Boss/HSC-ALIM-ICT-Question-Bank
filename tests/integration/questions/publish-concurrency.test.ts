/**
 * Migration 0005 — publication vs child mutation, under REAL concurrency.
 *
 * Every case uses separate PostgreSQL connections (`pg` clients, plus the
 * application's own Prisma pool for publishVersion) with explicit BEGIN /
 * COMMIT / ROLLBACK. Interleavings are made deterministic by OBSERVING the
 * server, not by sleeping: a statement is sent without awaiting it, and the
 * test then waits until either `pg_blocking_pids()` shows that backend blocked
 * by the other transaction, or the statement has already finished. Each case
 * asserts which of the two happened, so a missing lock is a failed assertion
 * rather than a hang.
 *
 * The protocol under test (0005 + server/questions/publish/gate.ts):
 *   · a child write (option / answer key / asset pin) locks its version row
 *     FOR SHARE unconditionally and decides on the locked row;
 *   · a status change is an UPDATE of the version row (FOR NO KEY UPDATE), and
 *     publishVersion takes that lock before it reads the children it validates.
 *
 * Against the previous trigger (status-filtered FOR SHARE) the "blocked" cases
 * below FAIL: the child write does not wait, and a child change commits after
 * its version was published.
 */

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { saveDraft } from '@/server/questions/authoring';
import { publishVersion } from '@/server/questions/publish/gate';
import { DomainError } from '@/server/shared/errors';
import { actorFor, ACTOR_IDS } from '../auth-fixtures';
import { cleanupFixtures, createMcqFixture, prisma, taxonomy } from './publish-fixtures-db';

const DATABASE_URL = process.env['DATABASE_URL'];
const hasDatabase = typeof DATABASE_URL === 'string' && DATABASE_URL.length > 0;
const describeDb = hasDatabase ? describe : describe.skip;

if (!hasDatabase) {
  console.warn('[0005] DATABASE_URL is not set — publish-concurrency tests were SKIPPED.');
}

/* ── connection and coordination helpers ─────────────────────────────────── */

interface Session {
  readonly client: pg.Client;
  readonly pid: number;
}

async function session(name: string): Promise<Session> {
  const client = new pg.Client({ connectionString: DATABASE_URL, application_name: name });
  await client.connect();
  // A bound on every wait, so a protocol bug fails the case instead of hanging it.
  await client.query(`SET lock_timeout = '20s'`);
  await client.query(`SET statement_timeout = '30s'`);
  const result = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  return { client, pid: result.rows[0]?.pid ?? -1 };
}

/** A promise plus a synchronous "has it settled?" flag. */
function track<T>(promise: Promise<T>): { promise: Promise<T>; settled: () => boolean } {
  let done = false;
  const tracked = promise.finally(() => {
    done = true;
  });
  // Observed later; avoid an unhandled-rejection warning in the meantime.
  tracked.catch(() => undefined);
  return { promise: tracked, settled: () => done };
}

/**
 * Waits until the server reports a backend blocked by `blockerPid` (optionally a
 * specific `waiterPid`), or until `settled()` — the waiting statement finished
 * without ever blocking. Polls server state; it never sleeps to order events.
 */
async function blockedOrSettled(
  observer: pg.Client,
  blockerPid: number,
  settled: () => boolean,
  waiterPid?: number,
): Promise<'blocked' | 'settled'> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (settled()) return 'settled';
    const rows = await observer.query<{ pid: number }>(
      `SELECT pid FROM pg_stat_activity
        WHERE $1::int = ANY (pg_blocking_pids(pid)) AND ($2::int IS NULL OR pid = $2::int)`,
      [blockerPid, waiterPid ?? null],
    );
    if (rows.rows.length > 0) return 'blocked';
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('neither blocked nor settled within 15 s');
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

const sqlState = (error: unknown): unknown => (error as { code?: unknown } | null)?.code;

async function versionState(versionId: string) {
  return prisma.questionVersion.findUniqueOrThrow({
    where: { id: versionId },
    select: {
      status: true,
      updatedAt: true,
      options: { select: { key: true, order: true }, orderBy: { key: 'asc' } },
      answerKey: { select: { mcqCorrectOptionKey: true } },
    },
  });
}

const PUBLISH_SQL = `UPDATE question_versions SET status = 'PUBLISHED', published_by = $2::uuid, published_at = now() WHERE id = $1::uuid`;
const MOVE_OPTION_SQL = `UPDATE question_options SET sort_order = $2 WHERE version_id = $1::uuid AND key = $3`;

/* ── suite ───────────────────────────────────────────────────────────────── */

describeDb('Migration 0005 — publication and child mutation serialize (real concurrency)', () => {
  let observer: Session;
  let a: Session;
  let b: Session;

  beforeAll(async () => {
    await cleanupFixtures();
    await taxonomy();
    observer = await session('concurrency-observer');
    a = await session('concurrency-a');
    b = await session('concurrency-b');
  });

  afterAll(async () => {
    for (const s of [a, b, observer]) {
      await s.client.query('ROLLBACK').catch(() => undefined);
      await s.client.end().catch(() => undefined);
    }
    await cleanupFixtures();
  });

  /** Ends any transaction a failed case left open, so cases stay independent. */
  async function reset(): Promise<void> {
    await a.client.query('ROLLBACK');
    await b.client.query('ROLLBACK');
  }

  it('A — concurrent child edits of one DRAFT do not block each other, and both commit', async () => {
    const { versionId } = await createMcqFixture();
    try {
      await a.client.query('BEGIN');
      await a.client.query(MOVE_OPTION_SQL, [versionId, 10, 'A']);

      await b.client.query('BEGIN');
      const second = track(b.client.query(MOVE_OPTION_SQL, [versionId, 11, 'B']));
      // FOR SHARE does not conflict with FOR SHARE: B must not wait for A.
      expect(await blockedOrSettled(observer.client, a.pid, second.settled, b.pid)).toBe('settled');
      await second.promise;

      await a.client.query('COMMIT');
      await b.client.query('COMMIT');
      const after = await versionState(versionId);
      expect(after.status).toBe('DRAFT');
      expect(after.options.find((o) => o.key === 'A')?.order).toBe(10);
      expect(after.options.find((o) => o.key === 'B')?.order).toBe(11);
    } finally {
      await reset();
    }
  });

  it('B/C — publish first: a child write waits for the publication and is refused when it commits', async () => {
    const { versionId } = await createMcqFixture();
    const before = await versionState(versionId);
    try {
      await a.client.query('BEGIN');
      await a.client.query(PUBLISH_SQL, [versionId, ACTOR_IDS.moderator]);

      await b.client.query('BEGIN');
      const child = track(b.client.query(MOVE_OPTION_SQL, [versionId, 9, 'B']));
      expect(
        await blockedOrSettled(observer.client, a.pid, child.settled, b.pid),
        'the child write must WAIT for the uncommitted publication',
      ).toBe('blocked');

      await a.client.query('COMMIT');
      const error = await caught(child.promise);
      expect(sqlState(error)).toBe('IA001');
      await b.client.query('ROLLBACK');

      const after = await versionState(versionId);
      expect(after.status).toBe('PUBLISHED');
      expect(after.options).toEqual(before.options);
    } finally {
      await reset();
    }
  });

  it('B/C — publish first, then ROLLED BACK: the waiting child write proceeds on the DRAFT', async () => {
    const { versionId } = await createMcqFixture();
    try {
      await a.client.query('BEGIN');
      await a.client.query(PUBLISH_SQL, [versionId, ACTOR_IDS.moderator]);

      await b.client.query('BEGIN');
      const child = track(b.client.query(MOVE_OPTION_SQL, [versionId, 9, 'B']));
      expect(await blockedOrSettled(observer.client, a.pid, child.settled, b.pid)).toBe('blocked');

      await a.client.query('ROLLBACK');
      await child.promise;
      await b.client.query('COMMIT');

      const after = await versionState(versionId);
      expect(after.status).toBe('DRAFT');
      expect(after.options.find((o) => o.key === 'B')?.order).toBe(9);
    } finally {
      await reset();
    }
  });

  it('B/C/D — child first: the publication waits for it, publishes the committed child state, and later child writes are refused', async () => {
    const { versionId } = await createMcqFixture();
    try {
      await b.client.query('BEGIN');
      await b.client.query(MOVE_OPTION_SQL, [versionId, 9, 'B']);

      await a.client.query('BEGIN');
      const publish = track(a.client.query(PUBLISH_SQL, [versionId, ACTOR_IDS.moderator]));
      expect(
        await blockedOrSettled(observer.client, b.pid, publish.settled, a.pid),
        'the publication must WAIT for the in-flight child write',
      ).toBe('blocked');

      await b.client.query('COMMIT');
      await publish.promise;
      await a.client.query('COMMIT');

      const after = await versionState(versionId);
      expect(after.status).toBe('PUBLISHED');
      expect(after.options.find((o) => o.key === 'B')?.order).toBe(9);

      // D — after publication, a child write is refused outright.
      const late = await caught(b.client.query(MOVE_OPTION_SQL, [versionId, 1, 'B']));
      expect(sqlState(late)).toBe('IA001');
    } finally {
      await reset();
    }
  });

  it('B — publishVersion waits for an in-flight answer-key delete and then REFUSES to publish without a key', async () => {
    const { questionId, versionId } = await createMcqFixture();
    try {
      await b.client.query('BEGIN');
      await b.client.query(`DELETE FROM answer_keys WHERE version_id = $1::uuid`, [versionId]);

      const publish = track(publishVersion(actorFor('moderator'), { questionId, versionId }));
      expect(
        await blockedOrSettled(observer.client, b.pid, publish.settled),
        'publishVersion must wait for the in-flight child write before validating',
      ).toBe('blocked');

      await b.client.query('COMMIT');
      const error = await caught(publish.promise);
      expect(error).toBeInstanceOf(DomainError);

      const after = await versionState(versionId);
      expect(after.status, 'no version may be published without an answer key').toBe('DRAFT');
      expect(after.answerKey).toBeNull();
    } finally {
      await reset();
    }
  });

  it('E — publishVersion waits for an in-flight valid child edit, then publishes the committed state', async () => {
    const { questionId, versionId } = await createMcqFixture();
    try {
      await b.client.query('BEGIN');
      await b.client.query(MOVE_OPTION_SQL, [versionId, 0, 'D']);
      await b.client.query(MOVE_OPTION_SQL, [versionId, 3, 'A']);

      const publish = track(publishVersion(actorFor('moderator'), { questionId, versionId }));
      expect(await blockedOrSettled(observer.client, b.pid, publish.settled)).toBe('blocked');

      await b.client.query('COMMIT');
      const result = await publish.promise;
      expect(result.questionStatus).toBe('PUBLISHED');

      const after = await versionState(versionId);
      expect(after.status).toBe('PUBLISHED');
      expect(after.options.find((o) => o.key === 'D')?.order).toBe(0);
      expect(after.options.find((o) => o.key === 'A')?.order).toBe(3);
    } finally {
      await reset();
    }
  });

  it('F — concurrent saveDraft and publishVersion through the services: no deadlock, no raw failure, a consistent result', async () => {
    for (let round = 0; round < 8; round += 1) {
      const { questionId, versionId } = await createMcqFixture();
      const { updatedAt } = await versionState(versionId);
      const editedText = `সম্পাদিত ${String(round)}`;

      const [save, publish] = await Promise.allSettled([
        saveDraft(actorFor('editor'), {
          questionId,
          versionId,
          expectedUpdatedAt: updatedAt,
          draft: {
            content: {
              format: 'rich_blocks',
              version: 1,
              blocks: [{ type: 'paragraph', data: { text: editedText, lang: 'bn' } }],
            },
            options: (['A', 'B', 'C', 'D'] as const).map((key) => ({
              key,
              content: {
                format: 'rich_blocks',
                version: 1,
                blocks: [{ type: 'paragraph', data: { text: 'উত্তর', lang: 'bn' } }],
              },
            })),
            answerKey: { mcqCorrectOptionKey: 'A' },
          },
        }),
        publishVersion(actorFor('moderator'), { questionId, versionId }),
      ]);

      // Any failure must be a mapped domain outcome — never a deadlock (40P01),
      // a serialization failure, or a raw driver error.
      for (const outcome of [save, publish]) {
        if (outcome.status === 'rejected') {
          expect(outcome.reason, `round ${String(round)}`).toBeInstanceOf(DomainError);
        }
      }

      const final = await prisma.questionVersion.findUniqueOrThrow({
        where: { id: versionId },
        select: { status: true, content: true },
      });
      const savedText = JSON.stringify(final.content).includes(editedText);
      if (save.status === 'fulfilled' && publish.status === 'fulfilled') {
        // Serialized save → publish: the published content is the saved one.
        expect(final.status).toBe('PUBLISHED');
        expect(savedText).toBe(true);
      } else if (publish.status === 'fulfilled') {
        // Publish won; the save was refused and changed nothing.
        expect(final.status).toBe('PUBLISHED');
        expect(savedText).toBe(false);
      } else if (save.status === 'fulfilled') {
        expect(final.status).toBe('DRAFT');
        expect(savedText).toBe(true);
      } else {
        throw new Error(`round ${String(round)}: both operations failed`);
      }
    }
  });
});
