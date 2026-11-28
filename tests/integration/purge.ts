/**
 * Test-only removal of question rows, including published content.
 *
 * Migration 0005 makes published/archived versions undeletable (trigger
 * trg_question_versions_frozen) and question_versions.question_id
 * ON DELETE RESTRICT, so the old `prisma.question.deleteMany(...)` cleanup —
 * which relied on CASCADE — is refused, exactly as it would be in production.
 *
 * Disposable test databases still need to be emptied between runs. This helper
 * does it the way an operator would: inside ONE transaction it sets
 * `session_replication_role = replica` (which skips user triggers and FK
 * enforcement for this transaction only), deletes the version children and the
 * versions explicitly — CASCADE is an FK action, so it does not fire either —
 * then restores `origin` and deletes the questions normally, so their tags and
 * sources cascade as usual.
 *
 * Requires a role allowed to set session_replication_role (a superuser, as the
 * CI service user is). Never call it against a database you care about; it is
 * only imported by tests under tests/integration/.
 */

import type { Prisma, PrismaClient } from '@/lib/generated/prisma/client';

/** The versions of the questions in $1. */
const VERSIONS_OF = 'SELECT id FROM question_versions WHERE question_id = ANY($1::uuid[])';

export async function purgeQuestions(
  client: PrismaClient,
  where: Prisma.QuestionWhereInput,
): Promise<void> {
  const rows = await client.question.findMany({ where, select: { id: true } });
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return;

  await client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    await tx.$executeRawUnsafe(
      `DELETE FROM question_version_assets WHERE version_id IN (${VERSIONS_OF})`,
      ids,
    );
    await tx.$executeRawUnsafe(`DELETE FROM answer_keys WHERE version_id IN (${VERSIONS_OF})`, ids);
    await tx.$executeRawUnsafe(
      `DELETE FROM question_options WHERE version_id IN (${VERSIONS_OF})`,
      ids,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM question_versions WHERE question_id = ANY($1::uuid[])`,
      ids,
    );
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = origin');
    await tx.$executeRawUnsafe(`DELETE FROM questions WHERE id = ANY($1::uuid[])`, ids);
  });
}
