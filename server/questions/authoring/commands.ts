import 'server-only';

/**
 * Question authoring commands (Phase 04C).
 *
 * Every command:
 *   1. has the signature `(actor, input)`;
 *   2. calls `authorize` FIRST — before parsing, locking or reading;
 *   3. validates its input with Zod (./schemas.ts), and content with the
 *      existing content-block profiles;
 *   4. runs in ONE transaction that locks the question row (`FOR UPDATE`), so
 *      concurrent commands on the same question serialise;
 *   5. writes exactly ONE audit_events row on that same transaction — if the
 *      audit insert fails, the command rolls back;
 *   6. maps unique and foreign-key violations to clean `DomainError`s through
 *      the db-errors mapper. No raw driver text reaches a caller.
 *
 * Audit payloads are flat: ids, statuses, version numbers and changed-field
 * NAMES. Never content, options, answer keys or rubrics.
 */

import type { Prisma } from '@/lib/generated/prisma/client';
import { VersionStatus } from '@/lib/generated/prisma/enums';
import { getPrisma } from '@/lib/db';
import { authorize, type Actor } from '@/server/auth/authorize';
import { writeAuditEvent } from '@/server/auth/audit';
import { DomainError } from '@/server/shared/errors';
import { mapDatabaseError } from '../publish/db-errors';
import {
  assertVersionMutable,
  deriveQuestionStatus,
  type VersionRecordSnapshot,
} from '../publish/rules';
import {
  archiveQuestionInputSchema,
  archiveVersionInputSchema,
  createQuestionInputSchema,
  createRevisionInputSchema,
  parseInput,
  saveDraftInputSchema,
  validateDraft,
  verifyAnswerKeyInputSchema,
  type ArchiveQuestionInput,
  type ArchiveVersionInput,
  type CreateQuestionInput,
  type CreateRevisionInput,
  type SaveDraftInput,
  type ValidDraft,
  type VerifyAnswerKeyInput,
} from './schemas';
import {
  changedFields,
  verificationAfterSave,
  type ChangedField,
  type KeyPayload,
  type VerificationState,
} from './verification';

/* ------------------------------------------------------------------------- */
/* Shared plumbing                                                           */
/* ------------------------------------------------------------------------- */

async function inTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await getPrisma().$transaction(work);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    const mapped = mapDatabaseError(error);
    if (mapped !== null) throw mapped;
    throw error;
  }
}

function notFound(what: 'question' | 'version'): DomainError {
  return new DomainError({
    code: 'NOT_FOUND',
    message: what === 'question' ? 'That question does not exist.' : 'That version does not exist.',
    field: what === 'question' ? 'questionId' : 'versionId',
  });
}

/** Serialises commands on one question. Throws NOT_FOUND when it does not exist. */
async function lockQuestion(tx: Prisma.TransactionClient, questionId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM questions WHERE id = ${questionId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw notFound('question');
}

function lastEditorOf(version: {
  readonly updatedById: string | null;
  readonly createdById: string | null;
}): string | null {
  return version.updatedById ?? version.createdById;
}

/** A refusal for editing anything but a DRAFT. PUBLISHED keeps its I-5 code. */
function assertDraft(version: {
  readonly status: VersionStatus;
  readonly versionNumber: number;
}): void {
  assertVersionMutable(version); // I-5: PUBLISHED → PUBLISHED_VERSION_IMMUTABLE
  if (version.status === VersionStatus.ARCHIVED) {
    throw new DomainError({
      code: 'VERSION_NOT_EDITABLE',
      message: `Version ${String(version.versionNumber)} is archived and cannot be changed.`,
    });
  }
}

/** Rows read back from the database are JSON; writing them back needs the input type. */
function toInputObject(value: Prisma.JsonValue): Prisma.InputJsonObject {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value;
  throw new Error('stored document is not a JSON object');
}

function keyPayloadOf(row: {
  readonly mcqCorrectOptionKey: string | null;
  readonly cqRubric: Prisma.JsonValue;
}): KeyPayload | null {
  if (row.mcqCorrectOptionKey !== null) {
    return { kind: 'mcq', mcqCorrectOptionKey: row.mcqCorrectOptionKey };
  }
  if (row.cqRubric !== null) return { kind: 'cq', cqRubric: row.cqRubric };
  return null;
}

function draftKeyPayload(draft: ValidDraft): KeyPayload | null {
  const key = draft.answerKey;
  if (key === null) return null;
  return key.kind === 'mcq'
    ? { kind: 'mcq', mcqCorrectOptionKey: key.mcqCorrectOptionKey }
    : { kind: 'cq', cqRubric: key.cqRubric };
}

/**
 * Replaces a version's options and answer key. The key is deleted first:
 * C-5 (`fk_answer_keys_options_of_version`) is ON DELETE RESTRICT, so the
 * options a key points at cannot be removed while it exists.
 */
async function writeChildren(
  tx: Prisma.TransactionClient,
  versionId: string,
  draft: ValidDraft,
  verification: VerificationState | null,
): Promise<void> {
  await tx.answerKey.deleteMany({ where: { versionId } });
  await tx.questionOption.deleteMany({ where: { versionId } });
  if (draft.options.length > 0) {
    await tx.questionOption.createMany({
      data: draft.options.map((o) => ({
        versionId,
        key: o.key,
        content: o.content,
        order: o.sortOrder,
      })),
    });
  }
  const key = draft.answerKey;
  if (key === null) return;
  const state = verification ?? { isVerified: false, verifiedById: null, verifiedAt: null };
  await tx.answerKey.create({
    data: {
      versionId,
      ...(key.kind === 'mcq'
        ? { mcqCorrectOptionKey: key.mcqCorrectOptionKey }
        : { cqRubric: key.cqRubric }),
      isVerified: state.isVerified,
      verifiedById: state.verifiedById,
      verifiedAt: state.verifiedAt,
    },
  });
}

function statusRecord(v: {
  readonly id: string;
  readonly versionNumber: number;
  readonly status: VersionStatus;
}): VersionRecordSnapshot {
  // The rollup reads only `status`; the other members are typed placeholders.
  return {
    id: v.id,
    versionNumber: v.versionNumber,
    status: v.status,
    content: null,
    options: [],
    answerKey: null,
    assetLinks: [],
  };
}

/** A strictly later timestamp, so two saves in the same millisecond still differ. */
function nextUpdatedAt(previous: Date): Date {
  return new Date(Math.max(Date.now(), previous.getTime() + 1));
}

const requestIdOf = (input: { readonly requestId?: string | undefined }) =>
  input.requestId === undefined ? {} : { requestId: input.requestId };

/* ------------------------------------------------------------------------- */
/* 1. createQuestion — question.create                                       */
/* ------------------------------------------------------------------------- */

export interface CreateQuestionResult {
  readonly questionId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly versionUpdatedAt: Date;
}

/**
 * Creates the question (DRAFT) and version 1 (DRAFT, created_by = updated_by =
 * actor), with its tags, sources, options and (unverified) answer key.
 *
 * The taxonomy chain is NOT pre-checked: the composite foreign keys are the
 * authority, and their violations are mapped to `TAXONOMY_CHAIN_INVALID` /
 * `REFERENCE_NOT_FOUND`.
 */
export async function createQuestion(
  actor: Actor,
  input: CreateQuestionInput,
): Promise<CreateQuestionResult> {
  authorize(actor, 'question.create');
  const data = parseInput(createQuestionInputSchema, input);
  const draft = validateDraft(data.type, data.draft);

  return inTransaction(async (tx) => {
    const question = await tx.question.create({
      data: {
        type: data.type,
        status: 'DRAFT',
        difficulty: data.difficulty,
        marks: data.marks,
        educationLevelId: data.educationLevelId,
        subjectId: data.subjectId,
        chapterId: data.chapterId ?? null,
        topicId: data.topicId ?? null,
        subtopicId: data.subtopicId ?? null,
      },
      select: { id: true },
    });

    if (data.tagIds.length > 0) {
      await tx.questionTag.createMany({
        data: data.tagIds.map((tagId) => ({ questionId: question.id, tagId })),
      });
    }
    if (data.sources.length > 0) {
      await tx.questionSource.createMany({
        data: data.sources.map((s) => ({
          questionId: question.id,
          sourceType: s.sourceType,
          boardId: s.boardId ?? null,
          collegeId: s.collegeId ?? null,
          academicYearId: s.academicYearId ?? null,
          sourceName: s.sourceName ?? null,
        })),
      });
    }

    const version = await tx.questionVersion.create({
      data: {
        questionId: question.id,
        versionNumber: 1,
        status: VersionStatus.DRAFT,
        content: draft.content,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
      select: { id: true, versionNumber: true, updatedAt: true },
    });
    await writeChildren(tx, version.id, draft, null);

    const provided: ChangedField[] = ['content'];
    if (draft.options.length > 0) provided.push('options');
    if (draft.answerKey !== null) provided.push('answerKey');

    await writeAuditEvent(tx, {
      actorId: actor.userId,
      action: 'question.create',
      resourceType: 'question',
      resourceId: question.id,
      after: {
        questionId: question.id,
        versionId: version.id,
        versionNumber: version.versionNumber,
        type: data.type,
        questionStatus: 'DRAFT',
        versionStatus: 'DRAFT',
        tagCount: data.tagIds.length,
        sourceCount: data.sources.length,
        fields: provided,
      },
      ...requestIdOf(data),
    });

    return {
      questionId: question.id,
      versionId: version.id,
      versionNumber: version.versionNumber,
      versionUpdatedAt: version.updatedAt,
    };
  });
}

/* ------------------------------------------------------------------------- */
/* 2. saveDraft — question.edit_draft                                        */
/* ------------------------------------------------------------------------- */

export interface SaveDraftResult {
  readonly versionId: string;
  readonly versionUpdatedAt: Date;
  readonly changedFields: readonly ChangedField[];
  readonly answerKeyVerified: boolean | null;
}

/**
 * Replaces a DRAFT version's content, options and answer key.
 *
 * Refused on PUBLISHED (I-5) and ARCHIVED versions. Optimistic concurrency:
 * `expectedUpdatedAt` must equal the version's `updated_at`, else `CONFLICT` —
 * another editor saved first, and their work is not silently overwritten.
 * Any change to the key or rubric resets verification (./verification.ts).
 */
export async function saveDraft(actor: Actor, input: SaveDraftInput): Promise<SaveDraftResult> {
  authorize(actor, 'question.edit_draft');
  const data = parseInput(saveDraftInputSchema, input);

  return inTransaction(async (tx) => {
    await lockQuestion(tx, data.questionId);
    const question = await tx.question.findUniqueOrThrow({
      where: { id: data.questionId },
      select: { type: true },
    });
    const version = await tx.questionVersion.findFirst({
      where: { id: data.versionId, questionId: data.questionId },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        content: true,
        updatedAt: true,
        options: { select: { key: true, content: true }, orderBy: { order: 'asc' } },
        answerKey: {
          select: {
            mcqCorrectOptionKey: true,
            cqRubric: true,
            isVerified: true,
            verifiedById: true,
            verifiedAt: true,
          },
        },
      },
    });
    if (version === null) throw notFound('version');
    assertDraft(version);

    if (version.updatedAt.getTime() !== data.expectedUpdatedAt.getTime()) {
      throw new DomainError({
        code: 'CONFLICT',
        message:
          'Someone else saved this draft after you opened it. Reload it to see their changes, then save again.',
        field: 'expectedUpdatedAt',
      });
    }

    const draft = validateDraft(question.type, data.draft);
    const previousKey = version.answerKey === null ? null : keyPayloadOf(version.answerKey);
    const nextKey = draftKeyPayload(draft);
    const verification = verificationAfterSave(
      version.answerKey === null || previousKey === null
        ? null
        : {
            payload: previousKey,
            isVerified: version.answerKey.isVerified,
            verifiedById: version.answerKey.verifiedById,
            verifiedAt: version.answerKey.verifiedAt,
          },
      nextKey,
    );
    const changed = changedFields(
      { content: version.content, options: version.options, key: previousKey },
      { content: draft.content, options: draft.options, key: nextKey },
    );

    const updated = await tx.questionVersion.update({
      where: { id: version.id },
      data: {
        content: draft.content,
        updatedById: actor.userId,
        updatedAt: nextUpdatedAt(version.updatedAt),
      },
      select: { updatedAt: true },
    });
    await writeChildren(tx, version.id, draft, verification);

    const wasVerified = version.answerKey?.isVerified ?? null;
    const isVerified = verification?.isVerified ?? null;
    await writeAuditEvent(tx, {
      actorId: actor.userId,
      action: 'question.save_draft',
      resourceType: 'question_version',
      resourceId: version.id,
      before: {
        questionId: data.questionId,
        versionNumber: version.versionNumber,
        isVerified: wasVerified,
      },
      after: {
        questionId: data.questionId,
        versionNumber: version.versionNumber,
        versionStatus: version.status,
        isVerified,
        verificationReset: wasVerified === true && isVerified !== true,
        changedFields: changed,
      },
      ...requestIdOf(data),
    });

    return {
      versionId: version.id,
      versionUpdatedAt: updated.updatedAt,
      changedFields: changed,
      answerKeyVerified: isVerified,
    };
  });
}

/* ------------------------------------------------------------------------- */
/* 3. createRevision — question.edit_draft                                   */
/* ------------------------------------------------------------------------- */

export interface CreateRevisionResult {
  readonly versionId: string;
  readonly versionNumber: number;
  readonly fromVersionId: string;
  readonly versionUpdatedAt: Date;
}

/**
 * Copies the PUBLISHED version (content, options, answer key, asset links) into
 * a new DRAFT numbered max + 1. The copied key starts unverified. Refused when a
 * DRAFT already exists, or when nothing is published.
 */
export async function createRevision(
  actor: Actor,
  input: CreateRevisionInput,
): Promise<CreateRevisionResult> {
  authorize(actor, 'question.edit_draft');
  const data = parseInput(createRevisionInputSchema, input);

  return inTransaction(async (tx) => {
    await lockQuestion(tx, data.questionId);
    const versions = await tx.questionVersion.findMany({
      where: { questionId: data.questionId },
      select: { id: true, versionNumber: true, status: true },
    });
    if (versions.some((v) => v.status === VersionStatus.DRAFT)) {
      throw new DomainError({
        code: 'DRAFT_ALREADY_EXISTS',
        message: 'This question already has a draft. Edit that draft instead of starting another.',
      });
    }
    const publishedRef = versions.find((v) => v.status === VersionStatus.PUBLISHED);
    if (publishedRef === undefined) {
      throw new DomainError({
        code: 'NO_PUBLISHED_VERSION',
        message: 'There is no published version to revise.',
      });
    }
    const published = await tx.questionVersion.findUniqueOrThrow({
      where: { id: publishedRef.id },
      select: {
        content: true,
        options: { select: { key: true, content: true, order: true } },
        answerKey: { select: { mcqCorrectOptionKey: true, cqRubric: true } },
        assets: { select: { assetId: true, blockRef: true } },
      },
    });
    const versionNumber = Math.max(...versions.map((v) => v.versionNumber)) + 1;

    const revision = await tx.questionVersion.create({
      data: {
        questionId: data.questionId,
        versionNumber,
        status: VersionStatus.DRAFT,
        content: toInputObject(published.content),
        createdById: actor.userId,
        updatedById: actor.userId,
      },
      select: { id: true, updatedAt: true },
    });
    if (published.options.length > 0) {
      await tx.questionOption.createMany({
        data: published.options.map((o) => ({
          versionId: revision.id,
          key: o.key,
          content: toInputObject(o.content),
          order: o.order,
        })),
      });
    }
    const key = published.answerKey;
    if (key !== null) {
      await tx.answerKey.create({
        data: {
          versionId: revision.id,
          ...(key.mcqCorrectOptionKey !== null
            ? { mcqCorrectOptionKey: key.mcqCorrectOptionKey }
            : { cqRubric: toInputObject(key.cqRubric) }),
          isVerified: false,
          verifiedById: null,
          verifiedAt: null,
        },
      });
    }
    if (published.assets.length > 0) {
      await tx.questionVersionAsset.createMany({
        data: published.assets.map((a) => ({
          versionId: revision.id,
          assetId: a.assetId,
          blockRef: a.blockRef,
        })),
      });
    }
    // The question stays PUBLISHED: a published version still exists (I-3).

    await writeAuditEvent(tx, {
      actorId: actor.userId,
      action: 'question.create_revision',
      resourceType: 'question_version',
      resourceId: revision.id,
      before: {
        questionId: data.questionId,
        fromVersionId: publishedRef.id,
        fromVersionNumber: publishedRef.versionNumber,
      },
      after: {
        questionId: data.questionId,
        versionNumber,
        versionStatus: 'DRAFT',
        isVerified: key === null ? null : false,
      },
      ...requestIdOf(data),
    });

    return {
      versionId: revision.id,
      versionNumber,
      fromVersionId: publishedRef.id,
      versionUpdatedAt: revision.updatedAt,
    };
  });
}

/* ------------------------------------------------------------------------- */
/* 4. verifyAnswerKey — answer_key.verify                                    */
/* ------------------------------------------------------------------------- */

export interface VerifyAnswerKeyResult {
  readonly versionId: string;
  readonly verifiedById: string;
  readonly verifiedAt: Date;
}

/**
 * Marks a DRAFT version's answer key verified. Separation of duties: the
 * version's last editor cannot verify it unless SUPER_ADMIN.
 */
export async function verifyAnswerKey(
  actor: Actor,
  input: VerifyAnswerKeyInput,
): Promise<VerifyAnswerKeyResult> {
  authorize(actor, 'answer_key.verify');
  const data = parseInput(verifyAnswerKeyInputSchema, input);

  return inTransaction(async (tx) => {
    await lockQuestion(tx, data.questionId);
    const version = await tx.questionVersion.findFirst({
      where: { id: data.versionId, questionId: data.questionId },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        createdById: true,
        updatedById: true,
        answerKey: { select: { id: true, isVerified: true } },
      },
    });
    if (version === null) throw notFound('version');
    assertDraft(version);
    // Separation of duties, read under the lock.
    authorize(actor, 'answer_key.verify', { lastEditorId: lastEditorOf(version) });

    const key = version.answerKey;
    if (key === null) {
      throw new DomainError({
        code: 'ANSWER_KEY_MISSING',
        message: 'This version has no answer key to verify yet.',
      });
    }
    if (key.isVerified) {
      throw new DomainError({
        code: 'ALREADY_VERIFIED',
        message: 'This answer key is already verified.',
      });
    }

    const verifiedAt = new Date();
    await tx.answerKey.update({
      where: { id: key.id },
      data: { isVerified: true, verifiedById: actor.userId, verifiedAt },
    });
    await writeAuditEvent(tx, {
      actorId: actor.userId,
      action: 'answer_key.verify',
      resourceType: 'answer_key',
      resourceId: key.id,
      before: { questionId: data.questionId, versionId: version.id, isVerified: false },
      after: {
        questionId: data.questionId,
        versionId: version.id,
        versionNumber: version.versionNumber,
        isVerified: true,
        verifiedBy: actor.userId,
      },
      ...requestIdOf(data),
    });

    return { versionId: version.id, verifiedById: actor.userId, verifiedAt };
  });
}

/* ------------------------------------------------------------------------- */
/* 5. archiveVersion / archiveQuestion — question.archive                    */
/* ------------------------------------------------------------------------- */

export interface ArchiveResult {
  readonly questionId: string;
  readonly archivedVersionIds: readonly string[];
  readonly questionStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

/**
 * Archives one version (DRAFT or PUBLISHED) and re-derives the question's
 * status from its versions (I-3). Never deletes a row.
 */
export async function archiveVersion(
  actor: Actor,
  input: ArchiveVersionInput,
): Promise<ArchiveResult> {
  authorize(actor, 'question.archive');
  const data = parseInput(archiveVersionInputSchema, input);

  return inTransaction(async (tx) => {
    await lockQuestion(tx, data.questionId);
    const versions = await tx.questionVersion.findMany({
      where: { questionId: data.questionId },
      select: { id: true, versionNumber: true, status: true },
    });
    const target = versions.find((v) => v.id === data.versionId);
    if (target === undefined) throw notFound('version');
    if (target.status === VersionStatus.ARCHIVED) {
      throw new DomainError({
        code: 'ALREADY_ARCHIVED',
        message: `Version ${String(target.versionNumber)} is already archived.`,
      });
    }

    await tx.questionVersion.update({
      where: { id: target.id },
      data: { status: VersionStatus.ARCHIVED },
    });
    const questionStatus = deriveQuestionStatus(
      versions.map((v) =>
        statusRecord(v.id === target.id ? { ...v, status: VersionStatus.ARCHIVED } : v),
      ),
    );
    await tx.question.update({ where: { id: data.questionId }, data: { status: questionStatus } });

    await writeAuditEvent(tx, {
      actorId: actor.userId,
      action: 'question.archive',
      resourceType: 'question_version',
      resourceId: target.id,
      before: {
        questionId: data.questionId,
        versionNumber: target.versionNumber,
        versionStatus: target.status,
      },
      after: {
        questionId: data.questionId,
        versionNumber: target.versionNumber,
        versionStatus: 'ARCHIVED',
        questionStatus,
      },
      ...requestIdOf(data),
    });

    return { questionId: data.questionId, archivedVersionIds: [target.id], questionStatus };
  });
}

/** Archives every non-archived version; the question becomes ARCHIVED. Never deletes. */
export async function archiveQuestion(
  actor: Actor,
  input: ArchiveQuestionInput,
): Promise<ArchiveResult> {
  authorize(actor, 'question.archive');
  const data = parseInput(archiveQuestionInputSchema, input);

  return inTransaction(async (tx) => {
    await lockQuestion(tx, data.questionId);
    const question = await tx.question.findUniqueOrThrow({
      where: { id: data.questionId },
      select: { status: true },
    });
    const versions = await tx.questionVersion.findMany({
      where: { questionId: data.questionId },
      select: { id: true, versionNumber: true, status: true },
    });
    if (versions.length === 0) {
      throw new DomainError({
        code: 'NOTHING_TO_ARCHIVE',
        message: 'This question has no versions to archive.',
      });
    }
    const toArchive = versions.filter((v) => v.status !== VersionStatus.ARCHIVED);
    if (toArchive.length === 0) {
      throw new DomainError({
        code: 'ALREADY_ARCHIVED',
        message: 'This question is already archived.',
      });
    }

    await tx.questionVersion.updateMany({
      where: { id: { in: toArchive.map((v) => v.id) } },
      data: { status: VersionStatus.ARCHIVED },
    });
    const questionStatus = deriveQuestionStatus(
      versions.map((v) => statusRecord({ ...v, status: VersionStatus.ARCHIVED })),
    );
    await tx.question.update({ where: { id: data.questionId }, data: { status: questionStatus } });

    const archivedVersionIds = toArchive.map((v) => v.id);
    await writeAuditEvent(tx, {
      actorId: actor.userId,
      action: 'question.archive',
      resourceType: 'question',
      resourceId: data.questionId,
      before: { questionStatus: question.status },
      after: { questionStatus, archivedVersionIds },
      ...requestIdOf(data),
    });

    return { questionId: data.questionId, archivedVersionIds, questionStatus };
  });
}
