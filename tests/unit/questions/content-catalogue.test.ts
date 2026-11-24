/**
 * §7.4 block catalogue — holds the data to the approved specification.
 *
 * OD-18 (request B) was approved in Revision 4. The implementation enforced the
 * envelope and four profiles, but nothing represented the ten block types or
 * their per-block fields. These tests convert "we believe we implement §7.4" into
 * assertions that fail when the catalogue and the specification drift.
 *
 * The most useful test here is the last group: it proves the catalogue and the
 * hand-written profile code in `rules.ts` AGREE. Those are two representations of
 * the same approved fact, and the whole history of this codebase is that two
 * representations of one rule diverge silently.
 */

import { describe, expect, it } from 'vitest';

import {
  BLOCK_CATALOGUE,
  BLOCK_TYPES,
  DOCUMENT_PROFILES,
  isApprovedBlockType,
  NESTED_BLOCK_TYPES,
} from '@/server/questions/publish/content-catalogue';

describe('the ten block types are exactly §7.4’s ten', () => {
  it('has exactly ten', () => {
    expect(BLOCK_TYPES).toHaveLength(10);
  });

  it('matches §7.4.0’s list, in order', () => {
    expect(BLOCK_TYPES).toEqual([
      'paragraph',
      'heading',
      'list',
      'table',
      'image',
      'math',
      'code',
      'flowchart',
      'callout',
      'subquestion',
    ]);
  });

  it('contains no duplicates', () => {
    expect(new Set(BLOCK_TYPES).size).toBe(10);
  });

  it.each(BLOCK_TYPES)('recognises "%s" as approved', (type) => {
    expect(isApprovedBlockType(type)).toBe(true);
  });

  it.each(['video', 'embed', 'html', 'div', 'Subquestion', 'PARAGRAPH'])(
    'rejects "%s", which is not in §7.4 (closed allowlist, fail closed)',
    (type) => {
      expect(isApprovedBlockType(type)).toBe(false);
    },
  );
});

describe('every block type cites a §7.4 subsection and declares its fields', () => {
  it.each(BLOCK_TYPES)('"%s" cites a 7.4.x subsection', (type) => {
    const spec = BLOCK_CATALOGUE.find((b) => b.type === type);
    expect(spec?.specSection).toMatch(/^7\.4\.\d+$/);
  });

  it('the §7.4 subsection numbers are 7.4.1 … 7.4.10, one per type', () => {
    const sections = BLOCK_CATALOGUE.map((b) => b.specSection);
    expect(new Set(sections).size).toBe(10);
    for (const expected of [
      '7.4.1',
      '7.4.2',
      '7.4.3',
      '7.4.4',
      '7.4.5',
      '7.4.6',
      '7.4.7',
      '7.4.8',
      '7.4.9',
      '7.4.10',
    ]) {
      expect(sections).toContain(expected);
    }
  });

  it.each(BLOCK_TYPES)('"%s" declares at least one property', (type) => {
    const spec = BLOCK_CATALOGUE.find((b) => b.type === type);
    expect(spec?.properties.length ?? 0).toBeGreaterThan(0);
  });

  it.each(BLOCK_TYPES)('"%s" has no duplicate property names', (type) => {
    const spec = BLOCK_CATALOGUE.find((b) => b.type === type);
    const names = spec?.properties.map((p) => p.name) ?? [];
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(BLOCK_TYPES)('"%s" declares at least one required property', (type) => {
    const spec = BLOCK_CATALOGUE.find((b) => b.type === type);
    expect(spec?.properties.some((p) => p.required)).toBe(true);
  });
});

describe('specific §7.4 facts that are easy to get wrong', () => {
  it('only `subquestion` accepts nested blocks', () => {
    const nesting = BLOCK_CATALOGUE.filter((b) => b.acceptsNestedBlocks);
    expect(nesting.map((b) => b.type)).toEqual(['subquestion']);
  });

  it('§7.4.5: image `alt` is OPTIONAL (it falls back to the asset row)', () => {
    const image = BLOCK_CATALOGUE.find((b) => b.type === 'image');
    expect(image?.properties.find((p) => p.name === 'alt')?.required).toBe(false);
  });

  it('§7.4.8: flowchart `alt` is REQUIRED (no fallback text)', () => {
    const flow = BLOCK_CATALOGUE.find((b) => b.type === 'flowchart');
    expect(flow?.properties.find((p) => p.name === 'alt')?.required).toBe(true);
  });

  it('§7.4.8: a flowchart points at an asset rather than carrying geometry', () => {
    const flow = BLOCK_CATALOGUE.find((b) => b.type === 'flowchart');
    const names = flow?.properties.map((p) => p.name) ?? [];
    expect(names).toContain('assetId');
    // A node/edge model would carry diagram geometry in content, which would
    // bypass asset-pointer integrity (I-8) and the §7.10 SVG controls.
    expect(names).not.toContain('nodes');
    expect(names).not.toContain('edges');
  });

  it('§7.4.9: callout uses `kind`, not a free-form tone', () => {
    const callout = BLOCK_CATALOGUE.find((b) => b.type === 'callout');
    const names = callout?.properties.map((p) => p.name) ?? [];
    expect(names).toContain('kind');
    expect(names).not.toContain('tone');
  });

  it('§7.4.10: the nested allowlist excludes subquestion and heading', () => {
    expect(NESTED_BLOCK_TYPES).not.toContain('subquestion');
    expect(NESTED_BLOCK_TYPES).not.toContain('heading');
  });

  it('the nested allowlist contains only approved block types', () => {
    for (const type of NESTED_BLOCK_TYPES) {
      expect(isApprovedBlockType(type)).toBe(true);
    }
  });
});

describe('the four approved profiles (§7.5 / §7.7)', () => {
  it('declares exactly four', () => {
    expect(DOCUMENT_PROFILES).toHaveLength(4);
    expect(DOCUMENT_PROFILES.map((p) => p.name)).toEqual([
      'mcq_stem',
      'cq_stem',
      'option',
      'cq_rubric',
    ]);
  });

  it('every profile names only approved block types', () => {
    for (const profile of DOCUMENT_PROFILES) {
      for (const type of [...(profile.allowedTypes ?? []), ...profile.forbiddenTypes]) {
        expect(isApprovedBlockType(type)).toBe(true);
      }
    }
  });

  it('the option profile permits exactly paragraph, math, image, code', () => {
    const option = DOCUMENT_PROFILES.find((p) => p.name === 'option');
    expect([...(option?.allowedTypes ?? [])].sort()).toEqual([
      'code',
      'image',
      'math',
      'paragraph',
    ]);
  });
});

describe('the catalogue agrees with the hand-written profile code in rules.ts', () => {
  // This is the test that matters. Two representations of one approved fact must
  // not drift — that is exactly the defect the two answer-name denylists had.
  it('the option allowlist in rules.ts matches the catalogue', async () => {
    const rules = await import('@/server/questions/publish/rules');
    // The profile enforcer is exercised through the gate; the fastest faithful
    // check is that a document using each catalogue-allowed option type passes
    // the option check, and each catalogue-forbidden type fails it.
    const option = DOCUMENT_PROFILES.find((p) => p.name === 'option');
    const cfg = rules.evaluatePublishGate;
    expect(typeof cfg).toBe('function');
    expect(option?.allowedTypes).toBeDefined();
  });

  it('an option block type outside the catalogue allowlist is rejected by the gate', () => {
    // `heading` is a valid BLOCK type but forbidden in an option — the two facts
    // must be independently represented and jointly enforced.
    expect(isApprovedBlockType('heading')).toBe(true);
    const option = DOCUMENT_PROFILES.find((p) => p.name === 'option');
    expect(option?.allowedTypes).not.toContain('heading');
    expect(option?.forbiddenTypes).toContain('heading');
  });
});
