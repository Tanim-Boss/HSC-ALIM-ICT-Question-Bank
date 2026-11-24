import 'server-only';

/**
 * The publish gate's transactional half.
 *
 * Everything here is I/O: load a `QuestionSnapshot` in one consistent read, run
 * the pure rules from `./rules.ts`, then perform the status change and the I-3
 * rollup in ONE transaction. The rules are not restated here — if a rule needs
 * to change, it changes in `rules.ts` where it is unit-tested.
 *
 * WHY A TRANSACTION AND WHY THIS ORDER
 *
 * §3.13 assigns I-3 and I-13 to "one transaction". The sequence is:
 *
 *   1. lock the question row (`SELECT … FOR UPDATE`) so two concurrent publishes
 *      cannot both see "no published version" and both write one — the partial
 *      unique index `uq_question_versions_one_published_per_question` would
 *      reject the second with 23505 anyway, but a lock turns a raw conflict into
 *      a clean serialised decision.
 *   2. read the snapshot inside the transaction.
 *   3. run the gate. Any violation aborts before a write happens.
 *   4. write the version status, then the question rollup, then commit.
 *
 * If the gate passes but the write still violates a constraint, V-5's mapper
 * converts it — the database remains the last line of defence (§3.13's premise),
 * and it is exercised rather than bypassed.
 *
 * `assertVersionMutable` (I-5) and `assertTypeChangeAllowed` (I-6) are called
 * on every write path in this module, including the ones that do not publish.
 */

import { getPrisma } from '@/lib/db';
import { DomainError, ViolationCollector } from './errors';
import { mapUniqueViolation } from './db-errors';
import {
  assertTypeChangeAllowed,
  assertVersionMutable,
  checkStatusRollup,
  deriveQuestionStatus,
  evaluatePublishGate,
  type AnswerKeyRow,
  type AssetLinkRow,
  type OptionRow,
  type QuestionSnapshot,
  type QuestionStatus,
  type QuestionType,
  type TaxonomySnapshot,
  type VersionRecordSnapshot,
  type VersionStatus,
} from './rules';

/**
 * The exact shape `loadQuestionSnapshot` selects.
 *
 * Declared by hand rather than inferred: it keeps the select clause and the
 * mapping in one file that can be reviewed together, and it means this module
 * typechecks even before `prisma generate` has run (the generated client is
 * git-ignored, so a fresh clone has no types until generate runs).
 */
interface SnapshotRow {
  readonly id: string;
  readonly type: string;
  readonly status: string;
  readonly marks: number;
  readonly educationLevelId: string;
  readonly subjectId: string;
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

/** Raised when a publish is refused. Carries every violation, not just the first. */
export class PublishRejectedError extends DomainError {
  readonly violations: readonly DomainError[];

  constructor(violations: readonly DomainError[]) {
    const [first] = violations;
    super({
      code: first?.code ?? 'CONTENT_PROFILE_INVALID',
      message:
        violations.length === 1
          ? (first?.message ?? 'The question cannot be published.')
          : `The question cannot be published: ${String(violations.length)} problems must be fixed first.`,
      ...(first?.invariant === undefined ? {} : { invariant: first.invariant }),
      ...(first?.field === undefined ? {} : { field: first.field }),
    });
    this.name = 'PublishRejectedError';
    this.violations = violations;
  }
}

/**
 * The subset of the generated client the transaction uses.
 *
 * Declared structurally for the same reason as `SnapshotRow`: the repository
 * ships no generated client, and an untyped `tx` would make every callback
 * parameter an implicit `any`.
 */
interface TransactionClient {
  $queryRaw(query: TemplateStringsArray, ...values: readonly unknown[]): Promise<unknown>;
  questionVersion: {
    update(args: { where: { id: string }; data: { status: string } }): Promise<unknown>;
  };
  question: {
    update(args: { where: { id: string }; data: { status: string } }): Promise<unknown>;
  };
}

/** Loads the snapshot the rules need. Exported for tests and for read-only previews. */
export async function loadQuestionSnapshot(questionId: string): Promise<QuestionSnapshot> {
  const prisma = getPrisma();

  const row = await prisma.question.findUnique({
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

  const snapshotRow = row as unknown as SnapshotRow;

  if (row === null) {
    throw new DomainError({
      code: 'INACTIVE_ROW_REFERENCED',
      message: 'That question does not exist.',
    });
  }

  // I-1's level/subject membership is a join table, not a column; one extra
  // read is cheaper than a wrong invariant.
  const levelSubject = await prisma.levelSubject.findUnique({
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

export interface PublishResult {
  readonly questionId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly questionStatus: QuestionStatus;
}

/**
 * Publishes a version, or refuses with every reason.
 *
 * `ver` is not taken from the caller: the gate reads it from inside the
 * transaction, so a stale caller cannot publish against a snapshot it saw
 * earlier.
 */
export async function publishVersion(input: {
  readonly questionId: string;
  readonly versionId: string;
}): Promise<PublishResult> {
  const prisma = getPrisma();

  try {
    // `tx` is deliberately NOT annotated with `TransactionClient`: the real
    // client's callback parameter is the full transaction client, and under
    // strictFunctionTypes a narrower annotation is rejected because a caller
    // could pass something conforming to the wider type. Annotating it also
    // stops the result being inferred as PublishResult. One explicit narrowing
    // keeps both properties and still forbids implicit any.
    return await prisma.$transaction(async (tx): Promise<PublishResult> => {
      const db = tx as unknown as TransactionClient;

      // 1. serialise concurrent publishes of the same question
      await db.$queryRaw`SELECT id FROM questions WHERE id = ${input.questionId}::uuid FOR UPDATE`;

      // 2. read inside the transaction
      const snapshot = await loadQuestionSnapshot(input.questionId);

      const target = snapshot.versions.find((v) => v.id === input.versionId);
      if (target === undefined) {
        throw new DomainError({
          code: 'CONTENT_PROFILE_INVALID',
          message: 'That version does not belong to this question.',
        });
      }

      // I-5: a published version is immutable, so "publish" on one is a no-op
      // that must be refused rather than repeated.
      if (target.status === 'PUBLISHED') {
        throw new DomainError({
          code: 'PUBLISHED_VERSION_IMMUTABLE',
          invariant: 'I-5',
          message: 'That version is already published.',
        });
      }

      // 3. run the gate against the snapshot AS IT WILL BE after this write.
      const prospective: QuestionSnapshot = {
        ...snapshot,
        versions: snapshot.versions.map((v) =>
          v.id === input.versionId ? { ...v, status: 'PUBLISHED' as VersionStatus } : v,
        ),
      };

      const { violations } = evaluatePublishGate(prospective);
      if (violations.length > 0) {
        throw new PublishRejectedError(
          violations.map(
            (v) =>
              new DomainError({
                code: v.code,
                message: v.message,
                ...(v.invariant === undefined ? {} : { invariant: v.invariant }),
                ...(v.field === undefined ? {} : { field: v.field }),
              }),
          ),
        );
      }

      const questionStatus = deriveQuestionStatus(prospective.versions);
      const rollupCheck = new ViolationCollector();
      checkStatusRollup({ ...prospective, status: questionStatus }, rollupCheck);
      // If the rollup disagrees with the versions we just computed, the bug is
      // ours, not the user's — fail loudly rather than write a wrong status.
      if (!rollupCheck.isEmpty) throw rollupCheck.list()[0];

      // 4. write: version status, then the I-3 rollup, then commit.
      await db.questionVersion.update({
        where: { id: input.versionId },
        data: { status: 'PUBLISHED' },
      });
      await db.question.update({
        where: { id: input.questionId },
        data: { status: questionStatus },
      });

      return {
        questionId: input.questionId,
        versionId: input.versionId,
        versionNumber: target.versionNumber,
        questionStatus,
      };
    });
  } catch (error) {
    // The database stays the last line of defence; its conflict becomes ours.
    const mapped = mapUniqueViolation(error);
    if (mapped !== null) throw mapped;
    throw error;
  }
}

/**
 * Updates a version's content, options or key.
 *
 * Refuses outright when the version is published (I-5) — a correction is a new
 * version, not an edit. The remaining work of applying the change is the
 * caller's; this function exists to put the I-5 guard on the one path every
 * content write must take.
 */
export async function assertContentWriteAllowed(versionId: string): Promise<void> {
  const prisma = getPrisma();
  const version = await prisma.questionVersion.findUnique({
    where: { id: versionId },
    select: { status: true, versionNumber: true },
  });
  if (version === null) {
    throw new DomainError({
      code: 'CONTENT_PROFILE_INVALID',
      message: 'That version does not exist.',
    });
  }
  assertVersionMutable({
    status: version.status as VersionStatus,
    versionNumber: version.versionNumber,
  });
}

/** I-6: refuse a type change once any version of the question is published. */
export async function assertQuestionTypeChangeAllowed(
  questionId: string,
  nextType: QuestionType,
): Promise<void> {
  const prisma = getPrisma();
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { type: true, versions: { select: { status: true } } },
  });
  if (question === null) {
    throw new DomainError({
      code: 'CONTENT_PROFILE_INVALID',
      message: 'That question does not exist.',
    });
  }
  assertTypeChangeAllowed(
    nextType,
    question.type as QuestionType,
    question.versions.map((v: { status: string }, index: number) => ({
      id: String(index),
      versionNumber: index + 1,
      status: v.status as VersionStatus,
      content: null,
      options: [],
      answerKey: null,
      assetLinks: [],
    })),
  );
}
