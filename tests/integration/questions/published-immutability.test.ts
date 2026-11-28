/**
 * Migration 0005 — published content is immutable IN THE DATABASE.
 *
 * Two halves, both against real PostgreSQL with every migration applied:
 *
 *   1. Refusals. On a PUBLISHED (and on an ARCHIVED) version, raw SQL — which
 *      bypasses every service guard — cannot change or delete the version, its
 *      options, its answer key or its asset pins, cannot TRUNCATE them, and a
 *      question that has versions cannot be deleted. Each refusal is the 0005
 *      SQLSTATE (IA001) or the RESTRICT FK, and maps to a stable DomainError.
 *
 *   2. Every legitimate write found in server/ still works: verify-then-publish,
 *      archive (version and question), re-publish of an archived version,
 *      createRevision + saveDraft on the new draft, a no-op UPDATE, and deleting
 *      a DRAFT (and then its draft-only question).
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  archiveQuestion,
  archiveVersion,
  createRevision,
  saveDraft,
  verifyAnswerKey,
} from '@/server/questions/authoring';
import {
  isFrozenContentViolation,
  mapDatabaseError,
  mapForeignKeyViolation,
  mapFrozenContentViolation,
} from '@/server/questions/publish/db-errors';
import { publishVersion } from '@/server/questions/publish/gate';
import { actorFor, ACTOR_IDS } from '../auth-fixtures';
import {
  OPTION_CONTENT,
  cleanupFixtures,
  createMcqFixture,
  prisma,
  taxonomy,
} from './publish-fixtures-db';

const DATABASE_URL = process.env['DATABASE_URL'];
const hasDatabase = typeof DATABASE_URL === 'string' && DATABASE_URL.length > 0;
const describeDb = hasDatabase ? describe : describe.skip;

if (!hasDatabase) {
  console.warn('[0005] DATABASE_URL is not set — published-immutability tests were SKIPPED.');
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

/** Asserts the 0005 trigger refused it, and that it maps to I-5. */
async function expectFrozen(promise: Promise<unknown>): Promise<void> {
  const error = await caught(promise);
  expect(error, 'the write should have been refused').not.toBeNull();
  expect(isFrozenContentViolation(error)).toBe(true);
  expect(mapFrozenContentViolation(error)).toMatchObject({
    code: 'PUBLISHED_VERSION_IMMUTABLE',
    invariant: 'I-5',
  });
}

/** A mutable option document (OPTION_CONTENT is `as const`, which JSON inputs reject). */
const optionDocument = () => ({
  format: 'rich_blocks',
  version: 1,
  blocks: [{ type: 'paragraph', data: { text: 'উত্তর', lang: 'bn' } }],
});

const sql = (text: string, ...values: unknown[]) => prisma.$executeRawUnsafe(text, ...values);

/** A version whose key has been verified by a second moderator, then published. */
async function publishedFixture(): Promise<{ questionId: string; versionId: string }> {
  const ids = await createMcqFixture({ unverified: true });
  // Legitimate flow: verification happens while the version is a DRAFT.
  await verifyAnswerKey(actorFor('moderator2'), ids);
  await publishVersion(actorFor('moderator'), ids);
  return ids;
}

async function snapshotOf(versionId: string) {
  return prisma.questionVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: { options: { orderBy: { key: 'asc' } }, answerKey: true, assets: true },
  });
}

async function newAsset(): Promise<string> {
  const asset = await prisma.questionAsset.create({
    data: {
      storageKey: `immutability-test/${randomUUID()}.png`,
      mimeType: 'image/png',
      sizeBytes: 10,
      altText: 'probe',
    },
    select: { id: true },
  });
  return asset.id;
}

describeDb('Migration 0005 — published content is immutable in the database', () => {
  const assetIds: string[] = [];

  beforeAll(async () => {
    await cleanupFixtures();
    await taxonomy();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.questionAsset.deleteMany({ where: { id: { in: assetIds } } });
  });

  describe('refusals on a PUBLISHED version (raw SQL, no service in the way)', () => {
    let ids: { questionId: string; versionId: string };
    let before: Awaited<ReturnType<typeof snapshotOf>>;

    beforeAll(async () => {
      ids = await publishedFixture();
      before = await snapshotOf(ids.versionId);
      expect(before.status).toBe('PUBLISHED');
    });

    afterAll(async () => {
      // Nothing above may have changed a single column.
      expect(await snapshotOf(ids.versionId)).toEqual(before);
    });

    it('UPDATE of content is refused', async () => {
      await expectFrozen(
        sql(
          `UPDATE question_versions SET content = '{"format":"rich_blocks","version":1,"blocks":[]}' WHERE id = $1::uuid`,
          ids.versionId,
        ),
      );
    });

    it('UPDATE of version_number is refused', async () => {
      await expectFrozen(
        sql(`UPDATE question_versions SET version_number = 99 WHERE id = $1::uuid`, ids.versionId),
      );
    });

    it('UPDATE of question_id is refused', async () => {
      const other = await createMcqFixture();
      await expectFrozen(
        sql(
          `UPDATE question_versions SET question_id = $2::uuid WHERE id = $1::uuid`,
          ids.versionId,
          other.questionId,
        ),
      );
    });

    it('UPDATE of search_text, authorship or the publication stamp is refused', async () => {
      await expectFrozen(
        sql(`UPDATE question_versions SET search_text = 'x' WHERE id = $1::uuid`, ids.versionId),
      );
      await expectFrozen(
        sql(
          `UPDATE question_versions SET published_by = $2::uuid WHERE id = $1::uuid`,
          ids.versionId,
          ACTOR_IDS.admin,
        ),
      );
      await expectFrozen(
        sql(
          `UPDATE question_versions SET updated_by = $2::uuid WHERE id = $1::uuid`,
          ids.versionId,
          ACTOR_IDS.admin,
        ),
      );
    });

    it('un-publishing (PUBLISHED → DRAFT) is refused', async () => {
      await expectFrozen(
        sql(
          `UPDATE question_versions SET status = 'DRAFT', published_by = NULL, published_at = NULL WHERE id = $1::uuid`,
          ids.versionId,
        ),
      );
    });

    it('archiving while also changing content is refused', async () => {
      await expectFrozen(
        sql(
          `UPDATE question_versions SET status = 'ARCHIVED', search_text = 'x' WHERE id = $1::uuid`,
          ids.versionId,
        ),
      );
    });

    it('DELETE of the version is refused', async () => {
      await expectFrozen(sql(`DELETE FROM question_versions WHERE id = $1::uuid`, ids.versionId));
    });

    it('options: UPDATE, INSERT and DELETE are refused', async () => {
      await expectFrozen(
        sql(
          `UPDATE question_options SET sort_order = 9 WHERE version_id = $1::uuid AND key = 'B'`,
          ids.versionId,
        ),
      );
      await expectFrozen(
        sql(
          `INSERT INTO question_options (id, version_id, key, content, sort_order) VALUES (gen_random_uuid(), $1::uuid, 'ক', $2::jsonb, 5)`,
          ids.versionId,
          JSON.stringify(OPTION_CONTENT),
        ),
      );
      await expectFrozen(
        sql(
          `DELETE FROM question_options WHERE version_id = $1::uuid AND key = 'D'`,
          ids.versionId,
        ),
      );
    });

    it('answer key: changing the answer, un-verifying, deleting and inserting are refused', async () => {
      await expectFrozen(
        sql(
          `UPDATE answer_keys SET mcq_correct_option_key = 'B' WHERE version_id = $1::uuid`,
          ids.versionId,
        ),
      );
      await expectFrozen(
        sql(
          `UPDATE answer_keys SET is_verified = false, verified_by = NULL, verified_at = NULL WHERE version_id = $1::uuid`,
          ids.versionId,
        ),
      );
      await expectFrozen(sql(`DELETE FROM answer_keys WHERE version_id = $1::uuid`, ids.versionId));
      await expectFrozen(
        sql(
          `INSERT INTO answer_keys (id, version_id, mcq_correct_option_key, updated_at) VALUES (gen_random_uuid(), $1::uuid, 'C', now())`,
          ids.versionId,
        ),
      );
    });

    it('asset pins: INSERT is refused', async () => {
      const assetId = await newAsset();
      assetIds.push(assetId);
      await expectFrozen(
        sql(
          `INSERT INTO question_version_assets (id, version_id, asset_id, block_ref) VALUES (gen_random_uuid(), $1::uuid, $2::uuid, '/content/blocks/0')`,
          ids.versionId,
          assetId,
        ),
      );
    });

    it('TRUNCATE of the version tables is refused (row triggers would not fire)', async () => {
      for (const table of ['question_options', 'answer_keys', 'question_version_assets']) {
        await expectFrozen(sql(`TRUNCATE ${table} CASCADE`));
      }
      // Last: if the guard were missing this would empty the table, so the
      // afterAll snapshot comparison is the backstop.
      await expectFrozen(sql('TRUNCATE question_versions CASCADE'));
    });

    it('the same refusal through Prisma maps to PUBLISHED_VERSION_IMMUTABLE via mapDatabaseError', async () => {
      const error = await caught(
        prisma.questionVersion.update({
          where: { id: ids.versionId },
          data: { content: { format: 'rich_blocks', version: 1, blocks: [] } },
        }),
      );
      expect(mapDatabaseError(error)).toMatchObject({ code: 'PUBLISHED_VERSION_IMMUTABLE' });
    });

    it('deleting the question is refused by the RESTRICT foreign key', async () => {
      const error = await caught(sql(`DELETE FROM questions WHERE id = $1::uuid`, ids.questionId));
      expect(mapForeignKeyViolation(error)).toMatchObject({
        code: 'QUESTION_HAS_VERSIONS',
        constraintNames: ['question_versions_question_id_fkey'],
      });
      expect(await prisma.question.count({ where: { id: ids.questionId } })).toBe(1);
    });

    it('a no-op UPDATE is allowed (it changes nothing)', async () => {
      await expect(
        sql(`UPDATE question_versions SET status = status WHERE id = $1::uuid`, ids.versionId),
      ).resolves.toBe(1);
    });
  });

  describe('refusals on an ARCHIVED version', () => {
    it('content, options and key of an archived version are frozen too', async () => {
      const ids = await publishedFixture();
      await archiveVersion(actorFor('moderator'), ids);
      await expectFrozen(
        sql(`UPDATE question_versions SET search_text = 'x' WHERE id = $1::uuid`, ids.versionId),
      );
      await expectFrozen(
        sql(
          `UPDATE question_options SET sort_order = 9 WHERE version_id = $1::uuid AND key = 'A'`,
          ids.versionId,
        ),
      );
      await expectFrozen(sql(`DELETE FROM answer_keys WHERE version_id = $1::uuid`, ids.versionId));
      await expectFrozen(sql(`DELETE FROM question_versions WHERE id = $1::uuid`, ids.versionId));
    });

    it('an archived draft (never published) is frozen as well', async () => {
      const ids = await createMcqFixture();
      await archiveVersion(actorFor('moderator'), ids);
      await expectFrozen(
        sql(
          `UPDATE question_options SET sort_order = 9 WHERE version_id = $1::uuid AND key = 'A'`,
          ids.versionId,
        ),
      );
    });
  });

  describe('every legitimate write still works', () => {
    it('verify (DRAFT) → publish → archive version → re-publish, through the services', async () => {
      const ids = await publishedFixture();
      const published = await snapshotOf(ids.versionId);
      expect(published).toMatchObject({ status: 'PUBLISHED', publishedById: ACTOR_IDS.moderator });
      expect(published.answerKey?.isVerified).toBe(true);

      await archiveVersion(actorFor('moderator'), ids);
      const archived = await snapshotOf(ids.versionId);
      expect(archived.status).toBe('ARCHIVED');
      expect(archived.content).toEqual(published.content);
      expect(archived.publishedById).toBe(published.publishedById);

      // ARCHIVED → PUBLISHED: publishVersion does not refuse an archived target.
      const republished = await publishVersion(actorFor('moderator2'), ids);
      expect(republished.questionStatus).toBe('PUBLISHED');
      const after = await snapshotOf(ids.versionId);
      expect(after.status).toBe('PUBLISHED');
      expect(after.publishedById).toBe(ACTOR_IDS.moderator2);
      expect(after.content).toEqual(published.content);
      expect(after.options).toEqual(published.options);
      expect(after.answerKey).toEqual(published.answerKey);
    });

    it('archiveQuestion archives every version', async () => {
      const ids = await publishedFixture();
      const result = await archiveQuestion(actorFor('moderator'), { questionId: ids.questionId });
      expect(result.questionStatus).toBe('ARCHIVED');
      expect((await snapshotOf(ids.versionId)).status).toBe('ARCHIVED');
    });

    it('createRevision copies the published version into an editable DRAFT; the original is untouched', async () => {
      const ids = await publishedFixture();
      const before = await snapshotOf(ids.versionId);

      const revision = await createRevision(actorFor('editor'), { questionId: ids.questionId });
      const draft = await snapshotOf(revision.versionId);
      expect(draft.status).toBe('DRAFT');

      await saveDraft(actorFor('editor'), {
        questionId: ids.questionId,
        versionId: revision.versionId,
        expectedUpdatedAt: draft.updatedAt,
        draft: {
          content: {
            format: 'rich_blocks',
            version: 1,
            blocks: [{ type: 'paragraph', data: { text: 'সংশোধিত প্রশ্ন', lang: 'bn' } }],
          },
          options: (['A', 'B', 'C', 'D'] as const).map((key) => ({
            key,
            content: optionDocument(),
          })),
          answerKey: { mcqCorrectOptionKey: 'B' },
        },
      });
      const saved = await snapshotOf(revision.versionId);
      expect(saved.answerKey?.mcqCorrectOptionKey).toBe('B');

      expect(await snapshotOf(ids.versionId)).toEqual(before);
    });

    it('a DRAFT version can be deleted (children cascade), and then its draft-only question', async () => {
      const ids = await createMcqFixture();
      await expect(
        sql(`DELETE FROM question_versions WHERE id = $1::uuid`, ids.versionId),
      ).resolves.toBe(1);
      expect(await prisma.questionOption.count({ where: { versionId: ids.versionId } })).toBe(0);
      expect(await prisma.answerKey.count({ where: { versionId: ids.versionId } })).toBe(0);
      await expect(sql(`DELETE FROM questions WHERE id = $1::uuid`, ids.questionId)).resolves.toBe(
        1,
      );
    });

    it('a question that still has a DRAFT version cannot be deleted directly (RESTRICT)', async () => {
      const ids = await createMcqFixture();
      const error = await caught(sql(`DELETE FROM questions WHERE id = $1::uuid`, ids.questionId));
      expect(mapForeignKeyViolation(error)?.code).toBe('QUESTION_HAS_VERSIONS');
    });
  });
});
