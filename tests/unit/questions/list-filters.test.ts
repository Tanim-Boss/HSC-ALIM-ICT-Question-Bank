/**
 * Phase 04D — list-filter semantics, pinned without a database.
 *
 * The staff list's semantics live in one place (`list-filters.ts`) because two
 * consumers render them: the Prisma query the service runs, and the SQL renderer
 * the performance harness measures. This file pins the first half:
 *
 *   · a search box normalises to literal, lower-case, NFC substrings, and LIKE
 *     metacharacters can never become wildcards;
 *   · `q` that normalises to nothing is refused rather than silently ignored;
 *   · Board and College are INDEPENDENT dimensions — both may be set, neither
 *     clears the other, and each gets its own `EXISTS`;
 *   · a year qualifies board or college on the SAME source row;
 *   · the cursor predicate comes last, so the keyset page still uses the
 *     ordered index.
 *
 * The row-level behaviour of the same semantics against real PostgreSQL is
 * tests/integration/questions/staff-list-college.test.ts.
 */

import { describe, expect, it } from 'vitest';

import {
  buildListFilter,
  normalizeSearchQuery,
  SEARCH_QUERY_MAX,
  SEARCH_TOKENS_MAX,
  toPrismaWhere,
} from '@/server/questions/authoring/list-filters';

const BOARD = '1a000000-0000-4000-8000-000000000001';
const COLLEGE = '1a000000-0000-4000-8000-000000000002';
const YEAR = '1a000000-0000-4000-8000-000000000003';
const CHAPTER = '1a000000-0000-4000-8000-000000000004';
const TAG = '1a000000-0000-4000-8000-000000000005';

/** The `AND` array of a rendered where-clause. */
function andOf(where: unknown): unknown[] {
  return (where as { AND: unknown[] }).AND;
}

describe('normalizeSearchQuery', () => {
  it('lower-cases Latin text and splits on whitespace', () => {
    expect(normalizeSearchQuery('  Computer   NETWORK ')).toEqual(['computer', 'network']);
  });

  it('leaves Bangla untouched apart from NFC and whitespace', () => {
    expect(normalizeSearchQuery('কম্পিউটার   নেটওয়ার্ক')).toEqual(['কম্পিউটার', 'নেটওয়ার্ক']);
  });

  it('keeps a Bangla conjunct intact', () => {
    expect(normalizeSearchQuery('ক্ষ')).toEqual(['ক্ষ']);
    expect(normalizeSearchQuery('শিক্ষা')).toEqual(['শিক্ষা']);
  });

  it('strips LIKE metacharacters so a query cannot become a wildcard', () => {
    expect(normalizeSearchQuery('100%')).toEqual(['100']);
    expect(normalizeSearchQuery('a_b')).toEqual(['a', 'b']);
    expect(normalizeSearchQuery('back\\slash')).toEqual(['back', 'slash']);
    expect(normalizeSearchQuery('%%%')).toEqual([]);
  });

  it('folds decomposed Latin onto composed', () => {
    expect(normalizeSearchQuery('cafe\u0301')).toEqual(['café']);
  });

  it(`caps a query at ${String(SEARCH_TOKENS_MAX)} tokens`, () => {
    const tokens = normalizeSearchQuery('a b c d e f g');
    expect(tokens).toHaveLength(SEARCH_TOKENS_MAX);
    expect(tokens).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('returns nothing for a blank query', () => {
    expect(normalizeSearchQuery('   ')).toEqual([]);
  });
});

describe('buildListFilter — validation', () => {
  it('defaults to page size 20 with no search tokens', () => {
    const spec = buildListFilter();
    expect(spec.limit).toBe(20);
    expect(spec.searchTokens).toEqual([]);
    expect(spec.cursor).toBeUndefined();
  });

  it('turns q into normalised tokens', () => {
    expect(buildListFilter({ q: 'HTML ওয়েব' }).searchTokens).toEqual(['html', 'ওয়েব']);
  });

  it('refuses a q that normalises to nothing, instead of ignoring it', () => {
    expect(() => buildListFilter({ q: '%%%' })).toThrowError(/no searchable characters/);
  });

  it('refuses a q longer than the bound', () => {
    expect(() => buildListFilter({ q: 'x'.repeat(SEARCH_QUERY_MAX + 1) })).toThrowError(
      /VALIDATION_FAILED|too big|at most/i,
    );
  });

  it('refuses an empty q (the schema trims first)', () => {
    expect(() => buildListFilter({ q: '   ' })).toThrow();
  });

  it('refuses an unknown field — the schema is strict', () => {
    expect(() =>
      buildListFilter({ boardId: BOARD, bogus: 1 } as unknown as Parameters<
        typeof buildListFilter
      >[0]),
    ).toThrow();
  });

  it('accepts Board and College together (04D removed the 04C refusal)', () => {
    const spec = buildListFilter({ boardId: BOARD, collegeId: COLLEGE });
    expect(spec.boardId).toBe(BOARD);
    expect(spec.collegeId).toBe(COLLEGE);
  });

  it('refuses a cursor it did not issue', () => {
    expect(() => buildListFilter({ cursor: 'not-a-cursor' })).toThrowError(/cursor/i);
  });

  it('refuses a page size outside 1…50', () => {
    expect(() => buildListFilter({ limit: 0 })).toThrow();
    expect(() => buildListFilter({ limit: 51 })).toThrow();
  });
});

describe('toPrismaWhere — one EXISTS per provenance dimension', () => {
  it('renders no predicates for an empty filter', () => {
    expect(toPrismaWhere(buildListFilter())).toEqual({ AND: [] });
  });

  it('board alone: one source EXISTS carrying the board', () => {
    const where = toPrismaWhere(buildListFilter({ boardId: BOARD }));
    expect(andOf(where)).toEqual([{ sources: { some: { boardId: BOARD } } }]);
  });

  it('college alone: one source EXISTS carrying the college, and nothing else', () => {
    const where = toPrismaWhere(buildListFilter({ collegeId: COLLEGE }));
    expect(andOf(where)).toEqual([{ sources: { some: { collegeId: COLLEGE } } }]);
  });

  it('board + college: two independent EXISTS clauses, neither clearing the other', () => {
    const where = toPrismaWhere(buildListFilter({ boardId: BOARD, collegeId: COLLEGE }));
    expect(andOf(where)).toEqual([
      { sources: { some: { boardId: BOARD } } },
      { sources: { some: { collegeId: COLLEGE } } },
    ]);
  });

  it('year qualifies the board on the SAME source row', () => {
    const where = toPrismaWhere(buildListFilter({ boardId: BOARD, academicYearId: YEAR }));
    expect(andOf(where)).toEqual([{ sources: { some: { boardId: BOARD, academicYearId: YEAR } } }]);
  });

  it('year qualifies the college on the SAME source row', () => {
    const where = toPrismaWhere(buildListFilter({ collegeId: COLLEGE, academicYearId: YEAR }));
    expect(andOf(where)).toEqual([
      { sources: { some: { collegeId: COLLEGE, academicYearId: YEAR } } },
    ]);
  });

  it('year with both dimensions is applied to both of them', () => {
    const where = toPrismaWhere(
      buildListFilter({ boardId: BOARD, collegeId: COLLEGE, academicYearId: YEAR }),
    );
    expect(andOf(where)).toEqual([
      { sources: { some: { boardId: BOARD, academicYearId: YEAR } } },
      { sources: { some: { collegeId: COLLEGE, academicYearId: YEAR } } },
    ]);
  });

  it('year alone matches any source row', () => {
    const where = toPrismaWhere(buildListFilter({ academicYearId: YEAR }));
    expect(andOf(where)).toEqual([{ sources: { some: { academicYearId: YEAR } } }]);
  });

  it('a tag is its own EXISTS, not a source predicate', () => {
    const where = toPrismaWhere(buildListFilter({ tagId: TAG }));
    expect(andOf(where)).toEqual([{ tags: { some: { tagId: TAG } } }]);
  });
});

describe('toPrismaWhere — search and paging', () => {
  it('requires every token inside ONE version projection', () => {
    const where = toPrismaWhere(buildListFilter({ q: 'html ওয়েব' }));
    expect(andOf(where)).toEqual([
      {
        versions: {
          some: {
            AND: [{ searchText: { contains: 'html' } }, { searchText: { contains: 'ওয়েব' } }],
          },
        },
      },
    ]);
  });

  it('combines search with college and chapter without merging them', () => {
    const where = toPrismaWhere(
      buildListFilter({ chapterId: CHAPTER, collegeId: COLLEGE, q: 'ক্ষ' }),
    );
    expect(andOf(where)).toEqual([
      { chapterId: CHAPTER },
      { sources: { some: { collegeId: COLLEGE } } },
      { versions: { some: { AND: [{ searchText: { contains: 'ক্ষ' } }] } } },
    ]);
  });

  it('puts the cursor predicate LAST so the ordered index can drive the page', () => {
    const first = toPrismaWhere(buildListFilter({ collegeId: COLLEGE }));
    const spec = buildListFilter({ collegeId: COLLEGE });
    const cursor = {
      createdAt: new Date('2026-01-02T03:04:05.006Z'),
      id: '1a000000-0000-4000-8000-00000000000f',
    };
    const where = toPrismaWhere({ ...spec, cursor });
    const predicates = andOf(where);
    expect(predicates).toHaveLength(2);
    expect(predicates[0]).toEqual(andOf(first)[0]);
    expect(predicates[1]).toEqual({
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ],
    });
  });

  it('does not mutate the spec it renders', () => {
    const spec = buildListFilter({ boardId: BOARD });
    const snapshot = JSON.stringify(spec);
    toPrismaWhere(spec);
    expect(JSON.stringify(spec)).toBe(snapshot);
  });
});
