/**
 * Question authoring (Phase 04C): the public surface.
 *
 * | Command / read           | Permission action      |
 * |--------------------------|------------------------|
 * | createQuestion           | question.create        |
 * | saveDraft                | question.edit_draft    |
 * | createRevision           | question.edit_draft    |
 * | verifyAnswerKey          | answer_key.verify      |
 * | archiveVersion           | question.archive       |
 * | archiveQuestion          | question.archive       |
 * | listQuestionsForStaff    | question.read_staff    |
 * | getQuestionForStaff      | question.read_staff    |
 *
 * Publishing stays in ../publish/gate.ts (`publishVersion`, question.publish).
 */

export {
  archiveQuestion,
  archiveVersion,
  createQuestion,
  createRevision,
  saveDraft,
  verifyAnswerKey,
  type ArchiveResult,
  type CreateQuestionResult,
  type CreateRevisionResult,
  type SaveDraftResult,
  type VerifyAnswerKeyResult,
} from './commands';
export {
  getQuestionForStaff,
  listQuestionsForStaff,
  type StaffQuestionDetail,
  type StaffQuestionListItem,
  type StaffQuestionPage,
} from './queries';
export type { CreateQuestionInput, SaveDraftInput, ListQuestionsInput } from './schemas';
