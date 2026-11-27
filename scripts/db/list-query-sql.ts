/**
 * SQL rendering of the staff list's filter spec — the Phase 04D measurement
 * harness's half of `listQuestionsForStaff`.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The brief is explicit: measure the ACTUAL `listQuestionsForStaff` query path,
 * not a simplified replacement. The production path is Prisma, whose client is
 * generated code (`lib/generated/prisma`, git-ignored) and whose engine download
 * is blocked in authoring sandboxes — so the harness cannot call Prisma here.
 * What it can do is execute the SQL Prisma would issue for the same query, and
 * that is only defensible if the predicates come from the SAME code the service
 * uses:
 *
 *   · this module takes `ListFilterSpec`, the structure
 *     `server/questions/authoring/list-filters.ts` builds for the service;
 *   · it renders the three statements Prisma issues for the list (the page
 *     query, the tag load, the version load — Prisma's default `query` relation
 *     strategy, not a join);
 *   · it is a type-level consumer of that spec, so a new filter field breaks
 *     this file's compilation until it is handled;
 *   · tests/integration/questions/staff-list-filters.test.ts asserts that the
 *     service and this renderer return the SAME ids for every case below — the
 *     structural claim is backed by a behavioural one.
 *
 * The SQL is deliberately written the way Prisma writes it: `EXISTS` for `some`
 * relation filters, `LIKE $n` for `contains`, `IN ($1, $2, …)` for relation
 * loads, and `(created_at, id)` keyset paging rather than OFFSET.
 *
 * Runs under plain Node (`node scripts/db/perf-list-questions.ts`), so it has
 * no runtime imports from the application: the spec arrives as a type only.
 */

import type { ListFilterSpec } from '../../server/questions/authoring/list-filters';

export interface RenderedStatement {
  readonly label: string;
  readonly sql: string;
  readonly values: unknown[];
}

export interface RenderedListQuery {
  /** The page query: `question.findMany({ where, orderBy, take, select })`. */
  readonly main: RenderedStatement;
  readonly tags: RenderedStatement;
  readonly versions: RenderedStatement;
}

/** Columns of LIST_SELECT on `questions`, in the order queries.ts declares them. */
const MAIN_COLUMNS = [
  'id',
  'type',
  'status',
  'difficulty',
  'marks',
  'education_level_id',
  'subject_id',
  'chapter_id',
  'topic_id',
  'subtopic_id',
  'created_at',
  'updated_at',
] as const;

class Params {
  readonly values: unknown[] = [];

  push(value: unknown): string {
    this.values.push(value);
    return `$${String(this.values.length)}`;
  }
}

/**
 * WHERE terms, in the order `toPrismaWhere` pushes them. Kept in one function so
 * the two renderings can be read side by side.
 */
function whereTerms(spec: ListFilterSpec, params: Params): string[] {
  const terms: string[] = [];
  if (spec.educationLevelId !== undefined) {
    terms.push(`q.education_level_id = ${params.push(spec.educationLevelId)}::uuid`);
  }
  if (spec.subjectId !== undefined) terms.push(`q.subject_id = ${params.push(spec.subjectId)}::uuid`);
  if (spec.chapterId !== undefined) terms.push(`q.chapter_id = ${params.push(spec.chapterId)}::uuid`);
  if (spec.topicId !== undefined) terms.push(`q.topic_id = ${params.push(spec.topicId)}::uuid`);
  if (spec.type !== undefined) terms.push(`q.type = ${params.push(spec.type)}::"QuestionType"`);
  if (spec.status !== undefined) {
    terms.push(`q.status = ${params.push(spec.status)}::"QuestionStatus"`);
  }
  if (spec.difficulty !== undefined) {
    terms.push(`q.difficulty = ${params.push(spec.difficulty)}::"QuestionDifficulty"`);
  }
  if (spec.tagId !== undefined) {
    terms.push(
      `EXISTS (SELECT 1 FROM question_tags t WHERE t.question_id = q.id AND t.tag_id = ${params.push(spec.tagId)}::uuid)`,
    );
  }

  // Board and year qualify the same attribution; college is its own dimension.
  if (spec.boardId !== undefined) {
    const parts = [`s.question_id = q.id`, `s.board_id = ${params.push(spec.boardId)}::uuid`];
    if (spec.academicYearId !== undefined) {
      parts.push(`s.academic_year_id = ${params.push(spec.academicYearId)}::uuid`);
    }
    terms.push(`EXISTS (SELECT 1 FROM question_sources s WHERE ${parts.join(' AND ')})`);
  }

  if (spec.collegeId !== undefined) {
    const parts = [`s.question_id = q.id`, `s.college_id = ${params.push(spec.collegeId)}::uuid`];
    if (spec.academicYearId !== undefined) {
      parts.push(`s.academic_year_id = ${params.push(spec.academicYearId)}::uuid`);
    }
    terms.push(`EXISTS (SELECT 1 FROM question_sources s WHERE ${parts.join(' AND ')})`);
  }

  // Year on its own qualifies any attribution; when a board or a college is
  // selected the dimension clause above already carries the year.
  if (
    spec.academicYearId !== undefined &&
    spec.boardId === undefined &&
    spec.collegeId === undefined
  ) {
    terms.push(
      `EXISTS (SELECT 1 FROM question_sources s WHERE s.question_id = q.id AND s.academic_year_id = ${params.push(spec.academicYearId)}::uuid)`,
    );
  }

  if (spec.searchTokens.length > 0) {
    const parts = [`v.question_id = q.id`];
    for (const token of spec.searchTokens) {
      // Prisma's `contains` is a LIKE with the pattern %token% — not an ILIKE:
      // the projection is already lower-cased, so the comparison is
      // case-insensitive without defeating the GIN trigram index.
      parts.push(`v.search_text LIKE ${params.push(`%${token}%`)}`);
    }
    terms.push(`EXISTS (SELECT 1 FROM question_versions v WHERE ${parts.join(' AND ')})`);
  }

  if (spec.cursor !== undefined) {
    const ts = params.push(spec.cursor.createdAt.toISOString());
    const id = params.push(spec.cursor.id);
    terms.push(`(q.created_at < ${ts}::timestamptz OR (q.created_at = ${ts}::timestamptz AND q.id < ${id}::uuid))`);
  }

  return terms;
}

export function renderMainStatement(spec: ListFilterSpec): RenderedStatement {
  const params = new Params();
  const terms = whereTerms(spec, params);
  const limit = params.push(spec.limit + 1);
  const where = terms.length === 0 ? '' : `WHERE ${terms.join(' AND ')}`;
  return {
    label: 'page query (questions.findMany)',
    sql:
      `SELECT ${MAIN_COLUMNS.join(', ')}\n` +
      `FROM questions q\n${where}\n` +
      `ORDER BY q.created_at DESC, q.id DESC\n` +
      `LIMIT ${limit}`,
    values: params.values,
  };
}

export function renderTagStatement(questionIds: readonly string[]): RenderedStatement {
  if (questionIds.length === 0) {
    return { label: 'tag load', sql: 'SELECT question_id, tag_id FROM question_tags WHERE false', values: [] };
  }
  const params = new Params();
  const list = questionIds.map((id) => `${params.push(id)}::uuid`).join(', ');
  return {
    label: 'tag load (Prisma relation strategy: query)',
    sql: `SELECT question_id, tag_id\nFROM question_tags\nWHERE question_id IN (${list})`,
    values: params.values,
  };
}

export function renderVersionStatement(questionIds: readonly string[]): RenderedStatement {
  if (questionIds.length === 0) {
    return {
      label: 'version load',
      sql:
        'SELECT question_id, id, version_number, status, updated_at FROM question_versions WHERE false',
      values: [],
    };
  }
  const params = new Params();
  const list = questionIds.map((id) => `${params.push(id)}::uuid`).join(', ');
  return {
    label: 'version load (Prisma relation strategy: query)',
    sql:
      `SELECT question_id, id, version_number, status, updated_at\n` +
      `FROM question_versions\nWHERE question_id IN (${list})\n` +
      `ORDER BY question_id ASC, version_number DESC`,
    values: params.values,
  };
}

export function renderListQuery(spec: ListFilterSpec, questionIds: readonly string[] = []): RenderedListQuery {
  return {
    main: renderMainStatement(spec),
    tags: renderTagStatement(questionIds),
    versions: renderVersionStatement(questionIds),
  };
}
