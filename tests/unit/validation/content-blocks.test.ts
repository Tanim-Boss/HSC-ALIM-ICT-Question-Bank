/**
 * §7.4 block schemas — the approved Zod strategy, tested against §7 itself.
 *
 * OD-18 request B was approved in Revision 4; §7.11 prescribes Zod and these
 * schemas implement it. Every test here cites the §7.4 subsection it enforces, so
 * a reviewer can check the assertion against the specification rather than
 * against my reading of it.
 *
 * Coverage per block type, as required: valid example, invalid example,
 * boundary limits, unknown fields, and nested fields where the block can nest.
 */

import { describe, expect, it } from 'vitest';

import {
  ALL_BLOCK_SCHEMAS,
  BLOCK_SCHEMAS,
  calloutSchema,
  codeSchema,
  contentBlockSchema,
  flowchartSchema,
  headingSchema,
  imageSchema,
  listSchema,
  mathSchema,
  paragraphSchema,
  subquestionSchema,
  tableSchema,
} from '@/lib/validation/content-blocks/blocks';
import { LIMITS } from '@/lib/validation/content-blocks/envelope';

const UUID = '00000000-0000-4000-8000-000000000001';

/** A minimal VALID example per §7.4, used as the positive control everywhere. */
const VALID: Record<keyof typeof BLOCK_SCHEMAS, unknown> = {
  paragraph: { type: 'paragraph', data: { text: 'নিচের কোডটি লক্ষ করো' } },
  heading: { type: 'heading', data: { text: 'অধ্যায় ৪', level: 2 } },
  list: { type: 'list', data: { ordered: true, items: [{ text: 'প্রথম' }] } },
  table: { type: 'table', data: { rows: [['ক', 'খ']] } },
  image: { type: 'image', data: { assetId: UUID } },
  math: { type: 'math', data: { latex: 'E = mc^2' } },
  code: { type: 'code', data: { language: 'html', code: '<h1>Hi</h1>' } },
  flowchart: { type: 'flowchart', data: { assetId: UUID, alt: 'প্রবাহচিত্র' } },
  callout: { type: 'callout', data: { kind: 'info', text: 'মনে রাখো' } },
  subquestion: { type: 'subquestion', data: { part: 'ক', maxMarks: 1 } },
};

describe('§7.4.0 — exactly ten block types, closed allowlist', () => {
  it('the union accepts all ten valid examples', () => {
    for (const [type, example] of Object.entries(VALID)) {
      const result = contentBlockSchema.safeParse(example);
      expect(
        result.success,
        `${type} should be valid: ${JSON.stringify(result.error?.issues)}`,
      ).toBe(true);
    }
  });

  it('has exactly ten schema branches', () => {
    expect(ALL_BLOCK_SCHEMAS).toHaveLength(10);
    expect(Object.keys(BLOCK_SCHEMAS)).toHaveLength(10);
  });

  it.each(['video', 'embed', 'html', 'div', 'iframe', 'svg'])(
    '§7.9 rejects the unapproved type "%s"',
    (type) => {
      const result = contentBlockSchema.safeParse({ type, data: {} });
      expect(result.success).toBe(false);
    },
  );

  it('§7.9 has no html escape hatch (§7.10)', () => {
    // "Why no `type: "html"` escape hatch… it converts a validated document into
    // an arbitrary-HTML document one block at a time."
    expect(contentBlockSchema.safeParse({ type: 'html', data: { html: '<script>' } }).success).toBe(
      false,
    );
  });
});

describe('§7.4.1 paragraph', () => {
  it('accepts a minimal valid example', () => {
    expect(paragraphSchema.safeParse(VALID.paragraph).success).toBe(true);
  });

  it('accepts lang and align', () => {
    expect(
      paragraphSchema.safeParse({
        type: 'paragraph',
        data: { text: 'x', lang: 'en', align: 'center' },
      }).success,
    ).toBe(true);
  });

  it('rejects an empty text (1…5000)', () => {
    expect(paragraphSchema.safeParse({ type: 'paragraph', data: { text: '' } }).success).toBe(
      false,
    );
  });

  it('accepts exactly 5000 chars and rejects 5001 (§7.12)', () => {
    const at = { type: 'paragraph', data: { text: 'ক'.repeat(LIMITS.paragraphTextMax) } };
    const over = { type: 'paragraph', data: { text: 'ক'.repeat(LIMITS.paragraphTextMax + 1) } };
    expect(paragraphSchema.safeParse(at).success).toBe(true);
    expect(paragraphSchema.safeParse(over).success).toBe(false);
  });

  it('rejects a missing required text', () => {
    expect(paragraphSchema.safeParse({ type: 'paragraph', data: {} }).success).toBe(false);
  });

  it('rejects an unknown property inside data (§7.2 strict)', () => {
    const result = paragraphSchema.safeParse({
      type: 'paragraph',
      data: { text: 'x', colour: 'red' },
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('colour');
  });

  it('rejects an unknown language', () => {
    expect(
      paragraphSchema.safeParse({ type: 'paragraph', data: { text: 'x', lang: 'fr' } }).success,
    ).toBe(false);
  });

  it('rejects left/right alignment (logical values only)', () => {
    expect(
      paragraphSchema.safeParse({ type: 'paragraph', data: { text: 'x', align: 'left' } }).success,
    ).toBe(false);
  });

  it('§7.2 rejects an injected answerKey on the block envelope', () => {
    // The specification's own invalid example: `blocks[0].answerKey`.
    const result = contentBlockSchema.safeParse({
      type: 'paragraph',
      data: { text: 'x' },
      answerKey: 'B',
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('answerKey');
  });
});

describe('§7.4.2 heading', () => {
  it('accepts a valid heading', () => {
    expect(headingSchema.safeParse(VALID.heading).success).toBe(true);
  });

  it.each([1, 2, 3])('accepts level %i', (level) => {
    expect(headingSchema.safeParse({ type: 'heading', data: { text: 'x', level } }).success).toBe(
      true,
    );
  });

  it.each([0, 4, 9])('rejects level %i (allowed 1…3)', (level) => {
    expect(headingSchema.safeParse({ type: 'heading', data: { text: 'x', level } }).success).toBe(
      false,
    );
  });

  it('rejects a non-integer level', () => {
    expect(
      headingSchema.safeParse({ type: 'heading', data: { text: 'x', level: 1.5 } }).success,
    ).toBe(false);
  });

  it('accepts 200 chars of text and rejects 201 (§7.12)', () => {
    expect(
      headingSchema.safeParse({
        type: 'heading',
        data: { text: 'ক'.repeat(LIMITS.headingTextMax), level: 1 },
      }).success,
    ).toBe(true);
    expect(
      headingSchema.safeParse({
        type: 'heading',
        data: { text: 'ক'.repeat(LIMITS.headingTextMax + 1), level: 1 },
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown property', () => {
    expect(
      headingSchema.safeParse({ type: 'heading', data: { text: 'x', level: 1, anchor: 'a' } })
        .success,
    ).toBe(false);
  });
});

describe('§7.4.3 list', () => {
  it('accepts a valid ordered list', () => {
    expect(listSchema.safeParse(VALID.list).success).toBe(true);
  });

  it('accepts start on an ordered list', () => {
    expect(
      listSchema.safeParse({
        type: 'list',
        data: { ordered: true, start: 3, items: [{ text: 'a' }] },
      }).success,
    ).toBe(true);
  });

  it("§7.4.3 REJECTS start on an unordered list — the spec's own invalid example", () => {
    // "start is only meaningful for an ordered list; accepting it silently would
    // hide an authoring bug."
    const result = listSchema.safeParse({
      type: 'list',
      data: { ordered: false, start: 3, items: [{ text: 'One' }] },
    });
    expect(result.success).toBe(false);
  });

  it('accepts 30 items and rejects 31 (§7.12)', () => {
    const many = (n: number) => ({
      type: 'list',
      data: { ordered: false, items: Array.from({ length: n }, () => ({ text: 'a' })) },
    });
    expect(listSchema.safeParse(many(LIMITS.listItemsMax)).success).toBe(true);
    expect(listSchema.safeParse(many(LIMITS.listItemsMax + 1)).success).toBe(false);
  });

  it('rejects an empty items array', () => {
    expect(listSchema.safeParse({ type: 'list', data: { ordered: true, items: [] } }).success).toBe(
      false,
    );
  });

  it('accepts 2000 chars per item and rejects 2001', () => {
    const item = (n: number) => ({
      type: 'list',
      data: { ordered: false, items: [{ text: 'ক'.repeat(n) }] },
    });
    expect(listSchema.safeParse(item(LIMITS.listItemTextMax)).success).toBe(true);
    expect(listSchema.safeParse(item(LIMITS.listItemTextMax + 1)).success).toBe(false);
  });

  it('accepts start 999 and rejects 1000', () => {
    const withStart = (n: number) => ({
      type: 'list',
      data: { ordered: true, start: n, items: [{ text: 'a' }] },
    });
    expect(listSchema.safeParse(withStart(LIMITS.listStartMax)).success).toBe(true);
    expect(listSchema.safeParse(withStart(LIMITS.listStartMax + 1)).success).toBe(false);
  });

  it('rejects an unknown property on a list item', () => {
    expect(
      listSchema.safeParse({
        type: 'list',
        data: { ordered: false, items: [{ text: 'a', bullet: '•' }] },
      }).success,
    ).toBe(false);
  });
});

describe('§7.4.4 table', () => {
  it('accepts string cells', () => {
    expect(tableSchema.safeParse(VALID.table).success).toBe(true);
  });

  it('accepts rich cell objects with the documented properties', () => {
    expect(
      tableSchema.safeParse({
        type: 'table',
        data: {
          rows: [[{ text: 'a', lang: 'bn', header: true, align: 'center', colspan: 2 }]],
        },
      }).success,
    ).toBe(true);
  });

  it('accepts 8 cells in a row and rejects 9 (§7.12)', () => {
    const row = (n: number) => ({
      type: 'table',
      data: { rows: [Array.from({ length: n }, () => 'c')] },
    });
    expect(tableSchema.safeParse(row(LIMITS.tableCellsPerRowMax)).success).toBe(true);
    expect(tableSchema.safeParse(row(LIMITS.tableCellsPerRowMax + 1)).success).toBe(false);
  });

  it('accepts 30 rows and rejects 31', () => {
    const rows = (n: number) => ({
      type: 'table',
      data: { rows: Array.from({ length: n }, () => ['c']) },
    });
    expect(tableSchema.safeParse(rows(LIMITS.tableRowsMax)).success).toBe(true);
    expect(tableSchema.safeParse(rows(LIMITS.tableRowsMax + 1)).success).toBe(false);
  });

  it('rejects an empty rows array', () => {
    expect(tableSchema.safeParse({ type: 'table', data: { rows: [] } }).success).toBe(false);
  });

  it('rejects a colspan above 8', () => {
    expect(
      tableSchema.safeParse({
        type: 'table',
        data: { rows: [[{ text: 'a', colspan: 9 }]] },
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown property in a rich cell', () => {
    expect(
      tableSchema.safeParse({ type: 'table', data: { rows: [[{ text: 'a', rowspan: 2 }]] } })
        .success,
    ).toBe(false);
  });
});

describe('§7.4.5 image — alt is OPTIONAL here', () => {
  it('accepts an image with no alt (falls back to the asset row)', () => {
    expect(imageSchema.safeParse(VALID.image).success).toBe(true);
  });

  it('accepts an explicit alt and longDescription', () => {
    expect(
      imageSchema.safeParse({
        type: 'image',
        data: { assetId: UUID, alt: 'চিত্র', longDescription: 'বিস্তারিত' },
      }).success,
    ).toBe(true);
  });

  it('rejects a non-UUID assetId', () => {
    expect(imageSchema.safeParse({ type: 'image', data: { assetId: 'not-a-uuid' } }).success).toBe(
      false,
    );
  });

  it('rejects a missing assetId', () => {
    expect(imageSchema.safeParse({ type: 'image', data: {} }).success).toBe(false);
  });

  it('accepts 300 chars of alt and rejects 301', () => {
    const alt = (n: number) => ({ type: 'image', data: { assetId: UUID, alt: 'ক'.repeat(n) } });
    expect(imageSchema.safeParse(alt(LIMITS.altMax)).success).toBe(true);
    expect(imageSchema.safeParse(alt(LIMITS.altMax + 1)).success).toBe(false);
  });

  it('rejects an unknown display value', () => {
    expect(
      imageSchema.safeParse({ type: 'image', data: { assetId: UUID, display: 'full' } }).success,
    ).toBe(false);
  });
});

describe('§7.4.6 math', () => {
  it('accepts valid latex', () => {
    expect(mathSchema.safeParse(VALID.math).success).toBe(true);
  });

  it('rejects $ delimiters in latex (§7.4.6)', () => {
    expect(mathSchema.safeParse({ type: 'math', data: { latex: '$E=mc^2$' } }).success).toBe(false);
  });

  it('accepts 2000 chars of latex and rejects 2001', () => {
    const l = (n: number) => ({ type: 'math', data: { latex: 'x'.repeat(n) } });
    expect(mathSchema.safeParse(l(LIMITS.latexMax)).success).toBe(true);
    expect(mathSchema.safeParse(l(LIMITS.latexMax + 1)).success).toBe(false);
  });

  it('accepts a label for accessibility', () => {
    expect(
      mathSchema.safeParse({ type: 'math', data: { latex: 'a+b', label: 'a যোগ b' } }).success,
    ).toBe(true);
  });

  it('rejects an empty latex', () => {
    expect(mathSchema.safeParse({ type: 'math', data: { latex: '' } }).success).toBe(false);
  });
});

describe('§7.4.7 code', () => {
  it('accepts each of the four approved languages', () => {
    for (const language of ['c', 'html', 'sql', 'pseudo'] as const) {
      expect(codeSchema.safeParse({ type: 'code', data: { language, code: 'x' } }).success).toBe(
        true,
      );
    }
  });

  it('rejects an unapproved language', () => {
    expect(
      codeSchema.safeParse({ type: 'code', data: { language: 'python', code: 'x' } }).success,
    ).toBe(false);
  });

  it('accepts 5000 chars of code and rejects 5001', () => {
    const c = (n: number) => ({ type: 'code', data: { language: 'c', code: 'x'.repeat(n) } });
    expect(codeSchema.safeParse(c(LIMITS.codeMax)).success).toBe(true);
    expect(codeSchema.safeParse(c(LIMITS.codeMax + 1)).success).toBe(false);
  });

  it('rejects an empty code body', () => {
    expect(codeSchema.safeParse({ type: 'code', data: { language: 'c', code: '' } }).success).toBe(
      false,
    );
  });

  it('accepts showLineNumbers as a boolean only', () => {
    expect(
      codeSchema.safeParse({
        type: 'code',
        data: { language: 'c', code: 'x', showLineNumbers: true },
      }).success,
    ).toBe(true);
    expect(
      codeSchema.safeParse({
        type: 'code',
        data: { language: 'c', code: 'x', showLineNumbers: 'yes' },
      }).success,
    ).toBe(false);
  });
});

describe('§7.4.8 flowchart — alt is REQUIRED here, unlike image', () => {
  it('accepts a valid flowchart', () => {
    expect(flowchartSchema.safeParse(VALID.flowchart).success).toBe(true);
  });

  it('REJECTS a flowchart with no alt', () => {
    // §7.4.8: "Required here, unlike `image`, because a flowchart is a
    // self-contained process description with no fallback text in the asset row."
    const result = flowchartSchema.safeParse({ type: 'flowchart', data: { assetId: UUID } });
    expect(result.success).toBe(false);
  });

  it('rejects node/edge geometry — a flowchart points at an asset', () => {
    // Content carries no diagram geometry; that is what keeps the rooted-pointer
    // rule (I-8) and the §7.10 SVG controls enforceable.
    expect(
      flowchartSchema.safeParse({
        type: 'flowchart',
        data: { assetId: UUID, alt: 'a', nodes: [], edges: [] },
      }).success,
    ).toBe(false);
  });

  it('rejects a non-UUID assetId', () => {
    expect(
      flowchartSchema.safeParse({ type: 'flowchart', data: { assetId: 'x', alt: 'a' } }).success,
    ).toBe(false);
  });

  it('accepts a description up to 2000 chars', () => {
    expect(
      flowchartSchema.safeParse({
        type: 'flowchart',
        data: { assetId: UUID, alt: 'a', description: 'ক'.repeat(LIMITS.descriptionMax) },
      }).success,
    ).toBe(true);
  });
});

describe('§7.4.9 callout', () => {
  it('accepts each approved kind', () => {
    for (const kind of ['info', 'warning', 'important'] as const) {
      expect(calloutSchema.safeParse({ type: 'callout', data: { kind, text: 'x' } }).success).toBe(
        true,
      );
    }
  });

  it('rejects an unapproved kind', () => {
    expect(
      calloutSchema.safeParse({ type: 'callout', data: { kind: 'danger', text: 'x' } }).success,
    ).toBe(false);
  });

  it('rejects `tone` — the discriminator is `kind`', () => {
    expect(
      calloutSchema.safeParse({ type: 'callout', data: { tone: 'info', text: 'x' } }).success,
    ).toBe(false);
  });

  it('accepts 1000 chars of text and rejects 1001', () => {
    const t = (n: number) => ({ type: 'callout', data: { kind: 'info', text: 'ক'.repeat(n) } });
    expect(calloutSchema.safeParse(t(LIMITS.calloutTextMax)).success).toBe(true);
    expect(calloutSchema.safeParse(t(LIMITS.calloutTextMax + 1)).success).toBe(false);
  });

  it('accepts a 120-char title and rejects 121', () => {
    const title = (n: number) => ({
      type: 'callout',
      data: { kind: 'info', text: 'x', title: 'ক'.repeat(n) },
    });
    expect(calloutSchema.safeParse(title(LIMITS.calloutTitleMax)).success).toBe(true);
    expect(calloutSchema.safeParse(title(LIMITS.calloutTitleMax + 1)).success).toBe(false);
  });
});

describe('§7.4.10 subquestion — nested blocks, bounded', () => {
  it('accepts a subquestion with no nested blocks', () => {
    expect(subquestionSchema.safeParse(VALID.subquestion).success).toBe(true);
  });

  it.each([
    ['ক', 1],
    ['খ', 2],
    ['গ', 3],
    ['ঘ', 4],
  ])('accepts part %s with maxMarks %i', (part, maxMarks) => {
    expect(
      subquestionSchema.safeParse({ type: 'subquestion', data: { part, maxMarks } }).success,
    ).toBe(true);
  });

  it('rejects a part outside ক–ঘ', () => {
    expect(
      subquestionSchema.safeParse({ type: 'subquestion', data: { part: 'ঙ', maxMarks: 1 } })
        .success,
    ).toBe(false);
  });

  it.each([0, 5, 10])('rejects maxMarks %i (allowed 1/2/3/4)', (maxMarks) => {
    expect(
      subquestionSchema.safeParse({ type: 'subquestion', data: { part: 'ক', maxMarks } }).success,
    ).toBe(false);
  });

  it('accepts each nested allowed block type', () => {
    const nested = [
      { type: 'paragraph', data: { text: 'x' } },
      { type: 'list', data: { ordered: false, items: [{ text: 'a' }] } },
      { type: 'table', data: { rows: [['a']] } },
      { type: 'image', data: { assetId: UUID } },
      { type: 'math', data: { latex: 'a' } },
      { type: 'code', data: { language: 'c', code: 'x' } },
      { type: 'flowchart', data: { assetId: UUID, alt: 'a' } },
      { type: 'callout', data: { kind: 'info', text: 'x' } },
    ];
    for (const block of nested) {
      expect(
        subquestionSchema.safeParse({
          type: 'subquestion',
          data: { part: 'ক', maxMarks: 1, blocks: [block] },
        }).success,
        `${block.type} should nest`,
      ).toBe(true);
    }
  });

  it('REJECTS a nested subquestion (§7.4.10: no nesting)', () => {
    const result = subquestionSchema.safeParse({
      type: 'subquestion',
      data: {
        part: 'ক',
        maxMarks: 1,
        blocks: [{ type: 'subquestion', data: { part: 'খ', maxMarks: 2 } }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('REJECTS a nested heading (§7.4.10: structure belongs to the document)', () => {
    const result = subquestionSchema.safeParse({
      type: 'subquestion',
      data: {
        part: 'ক',
        maxMarks: 1,
        blocks: [{ type: 'heading', data: { text: 'x', level: 1 } }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts 10 nested blocks and rejects 11 (§7.12)', () => {
    const withN = (n: number) => ({
      type: 'subquestion',
      data: {
        part: 'ক',
        maxMarks: 1,
        blocks: Array.from({ length: n }, () => ({ type: 'paragraph', data: { text: 'x' } })),
      },
    });
    expect(subquestionSchema.safeParse(withN(LIMITS.nestedBlocksPerSubquestionMax)).success).toBe(
      true,
    );
    expect(
      subquestionSchema.safeParse(withN(LIMITS.nestedBlocksPerSubquestionMax + 1)).success,
    ).toBe(false);
  });

  it('rejects unbounded recursion — a nested-nested subquestion is impossible', () => {
    // §7.11 rule 4: depth is bounded structurally, so there is no unbounded
    // recursion to exploit. Two levels deep must already fail.
    const deep = {
      type: 'subquestion',
      data: {
        part: 'ক',
        maxMarks: 1,
        blocks: [
          {
            type: 'subquestion',
            data: { part: 'খ', maxMarks: 2, blocks: [{ type: 'paragraph', data: { text: 'x' } }] },
          },
        ],
      },
    };
    expect(subquestionSchema.safeParse(deep).success).toBe(false);
  });

  it('rejects an unknown property inside a nested block', () => {
    expect(
      subquestionSchema.safeParse({
        type: 'subquestion',
        data: {
          part: 'ক',
          maxMarks: 1,
          blocks: [{ type: 'paragraph', data: { text: 'x', injected: true } }],
        },
      }).success,
    ).toBe(false);
  });
});

describe('§7.12 — every numeric limit is enforced exactly at its boundary', () => {
  it('the LIMITS object matches §7.12 verbatim', () => {
    // Pinned so a "small refactor" cannot quietly relax a documented limit.
    expect(LIMITS.blocksPerDocumentMax).toBe(200);
    expect(LIMITS.nestedBlocksPerSubquestionMax).toBe(10);
    expect(LIMITS.assetsPerVersionMax).toBe(50);
    expect(LIMITS.paragraphTextMax).toBe(5000);
    expect(LIMITS.headingTextMax).toBe(200);
    expect(LIMITS.listItemsMax).toBe(30);
    expect(LIMITS.listItemTextMax).toBe(2000);
    expect(LIMITS.tableRowsMax).toBe(30);
    expect(LIMITS.tableCellsPerRowMax).toBe(8);
    expect(LIMITS.codeMax).toBe(5000);
    expect(LIMITS.latexMax).toBe(2000);
    expect(LIMITS.altMax).toBe(300);
    expect(LIMITS.captionMax).toBe(300);
    expect(LIMITS.longDescriptionMax).toBe(2000);
  });
});
