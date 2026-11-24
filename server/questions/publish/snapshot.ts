/**
 * Snapshot loading — the read half of the publish gate.
 *
 * WHY THIS IS ITS OWN MODULE (defect D2)
 *
 * `loadQuestionSnapshot` used to call `getPrisma()` itself. That made it
 * silently open a connection from the pool, so when `publishVersion` called it
 * from inside `prisma.$transaction(...)` the reads ran on a DIFFERENT connection
 * from the one holding `SELECT … FOR UPDATE`. PostgreSQL then served the
 * pre-transaction committed state, and the row lock protected nothing that was
 * read. Measured on PostgreSQL 16.2:
 *
 *     inside the open transaction : PUBLISHED   <- what the gate would believe
 *     separate pooled connection  : DRAFT       <- what the gate actually read
 *
 * The defect was possible because the client was implicit. It is now an
 * explicit, REQUIRED parameter (`QuestionReader`): a caller has to decide which
 * connection to read through, and there is no fallback to the global client.
 *
 * This module deliberately has no `import 'server-only'`: it is pure data
 * access over an injected client. The server-only boundary belongs to the
 * module that owns the pool (`gate.ts`), so this half can be exercised against
 * a real transaction client in tests.
 */

import { DomainError } from './errors';
import type {
  AnswerKeyRow,
  AssetLinkRow,
  OptionRow,
  QuestionSnapshot,
  QuestionStatus,
  QuestionType,
  TaxonomySnapshot,
  VersionRecordSnapshot,
  VersionStatus,
} from './rules';

/**
 * The exact shape the select below produces.
 *
 * Declared by hand rather than inferred: it keeps the select clause and the
 * mapping reviewable together, and it means this module typechecks even before
 * `prisma generate` has run (the generated client is git-ignored).
 */
export interface SnapshotRow {
  readonly id: string;
  readonly type: string;
  readonly status: string;
  readonly marks: number;
  readonly educationLevelId: string;
  readonly subjectId: string;
  readonly chapterId: string | null;
  readonly topicId: string | null;
  readonly subtopicId: string | null;
  readonly educationLevel: { readonly id: string; readonly isActive: boolean };
  readonly subject: { readonly id: string; readonly isActive: boolean };
  readonly chapter: {
    readonly id: string;
    readonly subjectId: string;
    readonly isActive: boolean;
  } | null;
  readonly topic: {
    readonly id: string;
    readonly chapterId: string;
    readonly isActive: boolean;
  } | null;
  readonly subtopic: {
    readonly id: string;
    readonly topicId: string;
    readonly isActive: boolean;
  } | null;
  readonly versions: readonly {
    readonly id: string;
    readonly versionNumber: number;
    readonly status: string;
    readonly content: unknown;
    readonly options: readonly {
      readonly id: string;
      readonly key: string;
      readonly order: number;
      readonly content: unknown;
    }[];
    readonly answerKey: {
      readonly mcqCorrectOptionKey: string | null;
      readonly cqRubric: unknown;
      readonly isVerified: boolean;
    } | null;
    readonly assets: readonly { readonly assetId: string; readonly blockRef: string }[];
  }[];
}

/**
 * What a snapshot read requires of its client.
 *
 * Both the global `PrismaClient` and an interactive `tx` satisfy this, which is
 * exactly why the parameter must be explicit: they are the same shape but NOT
 * the same connection.
 */
export interface QuestionReader {
  /**
   * Generic in the result type: the caller supplies the `select`, so the
   * client is not fixed to one projection. That keeps `TransactionClient` able
   * to use the same client for its other reads.
   */
  readonly question: {
    findUnique<T = SnapshotRow>(args: unknown): Promise<T | null>;
  };
  readonly levelSubject: {
    findUnique<T = { readonly levelId: string }>(args: unknown): Promise<T | null>;
  };
}

/**
 * Loads the snapshot the publish rules need.
 *
 * `client` is REQUIRED and is used for every read. There is no `getPrisma()`
 * fallback by design: a fallback would restore defect D2 the moment a caller
 * forgot to pass the transaction client.
 *
 * Callers that need consistency with a lock MUST pass the transaction client
 * that holds it — see `publishVersion`.
 */
export async function loadQuestionSnapshot(
  client: QuestionReader,
  questionId: string,
): Promise<QuestionSnapshot> {
  const row = await client.question.findUnique<SnapshotRow>({
    where: { id: questionId },
    select: {
      id: true,
      type: true,
      status: true,
      marks: true,
      educationLevelId: true,
      subjectId: true,
      chapterId: true,
      topicId: true,
      subtopicId: true,
      educationLevel: { select: { id: true, isActive: true } },
      subject: { select: { id: true, isActive: true } },
      chapter: { select: { id: true, subjectId: true, isActive: true } },
      topic: { select: { id: true, chapterId: true, isActive: true } },
      subtopic: { select: { id: true, topicId: true, isActive: true } },
      versions: {
        orderBy: { versionNumber: 'asc' },
        select: {
          id: true,
          versionNumber: true,
          status: true,
          content: true,
          options: {
            orderBy: { order: 'asc' },
            select: { id: true, key: true, order: true, content: true },
          },
          answerKey: {
            select: { mcqCorrectOptionKey: true, cqRubric: true, isVerified: true },
          },
          assets: { select: { assetId: true, blockRef: true } },
        },
      },
    },
  });

  if (row === null) {
    throw new DomainError({
      code: 'INACTIVE_ROW_REFERENCED',
      message: 'That question does not exist.',
    });
  }

  const snapshotRow = row;

  // I-1's level/subject membership is a join table, not a column; one extra
  // read is cheaper than a wrong invariant. It uses the SAME client, so a
  // transaction sees a consistent view of both reads.
  const levelSubject = await client.levelSubject.findUnique<{ levelId: string }>({
    where: {
      levelId_subjectId: {
        levelId: snapshotRow.educationLevelId,
        subjectId: snapshotRow.subjectId,
      },
    },
    select: { levelId: true },
  });

  const taxonomy: TaxonomySnapshot = {
    educationLevelId: snapshotRow.educationLevelId,
    subjectId: snapshotRow.subjectId,
    subjectOfferedAtLevel: levelSubject !== null,
    educationLevelActive: snapshotRow.educationLevel.isActive,
    subjectActive: snapshotRow.subject.isActive,
    chapter:
      snapshotRow.chapter === null
        ? null
        : {
            id: snapshotRow.chapter.id,
            subjectId: snapshotRow.chapter.subjectId,
            isActive: snapshotRow.chapter.isActive,
          },
    topic:
      snapshotRow.topic === null
        ? null
        : {
            id: snapshotRow.topic.id,
            chapterId: snapshotRow.topic.chapterId,
            isActive: snapshotRow.topic.isActive,
          },
    subtopic:
      snapshotRow.subtopic === null
        ? null
        : {
            id: snapshotRow.subtopic.id,
            topicId: snapshotRow.subtopic.topicId,
            isActive: snapshotRow.subtopic.isActive,
          },
  };

  const versions: VersionRecordSnapshot[] = snapshotRow.versions.map(
    (version: SnapshotRow['versions'][number]) => {
      const options: OptionRow[] = version.options.map(
        (option: SnapshotRow['versions'][number]['options'][number]) => ({
          id: option.id,
          key: option.key,
          sortOrder: option.order,
          content: option.content,
        }),
      );
      const answerKey: AnswerKeyRow | null =
        version.answerKey === null
          ? null
          : {
              mcqCorrectOptionKey: version.answerKey.mcqCorrectOptionKey,
              cqRubric: version.answerKey.cqRubric,
              isVerified: version.answerKey.isVerified,
            };
      const assetLinks: AssetLinkRow[] = version.assets.map(
        (asset: SnapshotRow['versions'][number]['assets'][number]) => ({
          assetId: asset.assetId,
          blockRef: asset.blockRef,
        }),
      );
      return {
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status as VersionStatus,
        content: version.content,
        options,
        answerKey,
        assetLinks,
      };
    },
  );

  return {
    id: snapshotRow.id,
    type: snapshotRow.type as QuestionType,
    status: snapshotRow.status as QuestionStatus,
    marks: snapshotRow.marks,
    taxonomy,
    versions,
  };
}
