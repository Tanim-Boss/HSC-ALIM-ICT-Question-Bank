/**
 * Phase 04D — the staff search projection, pinned as a unit.
 *
 * `buildVersionSearchText` is the TS half of a rule that also exists in SQL
 * (`ict_version_search_text` in migration 0003). This file pins the TS half on
 * its own; tests/integration/questions/staff-search.test.ts pins the two halves
 * to each other.
 *
 * The properties asserted here are the ones the feature depends on:
 *   · text is found in EVERY approved block type, not only `paragraph`;
 *   · option documents are included, in display order, after the stem;
 *   · normalisation is NFC + lower case + collapsed whitespace, which is what
 *     the GIN trigram index sees;
 *   · answer keys and CQ rubrics are NOT reachable through the projection —
 *     the same row holds them, so this is a real risk, not a theoretical one.
 */

import { describe, expect, it } from 'vitest';

import {
  buildVersionSearchText,
  normalizeSearchText,
  SEARCH_TEXT_MAX,
  TEXT_BEARING_KEYS,
} from '@/server/questions/authoring/search-text';

const envelope = (blocks: unknown[]) => ({ format: 'rich_blocks', version: 1, blocks });
const paragraph = (text: string, lang: 'bn' | 'en' = 'bn') => ({
  type: 'paragraph',
  data: { text, lang },
});
const optionDoc = (text: string) => envelope([paragraph(text)]);

describe('buildVersionSearchText — what is indexed', () => {
  it('finds text in every approved block type that carries it', () => {
    const content = envelope([
      { type: 'heading', data: { text: 'শিরোনাম', level: 2 } },
      paragraph('অনুচ্ছেদ'),
      { type: 'list', data: { style: 'ordered', items: [{ text: 'প্রথম' }, { text: 'দ্বিতীয়' }] } },
      {
        // The real §7.4.4 shape: rows of cells, where a header cell is a cell
        // with `header: true` — still a `text` cell, so it is still indexed.
        type: 'table',
        data: {
          caption: 'সারণি',
          headerRow: true,
          lang: 'bn',
          rows: [
            [{ text: 'কলাম', header: true }, { text: 'মান', header: true }],
            [{ text: 'ঘর-এক' }, { text: '১' }],
            [{ text: 'ঘর-দুই' }, { text: '২' }],
          ],
        },
      },
      { type: 'code', data: { text: 'print("হ্যালো")', language: 'python' } },
      { type: 'image', data: { assetId: 'a', alt: 'ছবির বর্ণনা', longDescription: 'দীর্ঘ বর্ণনা' } },
      { type: 'flowchart', data: { assetId: 'b', alt: 'প্রবাহচিত্র', caption: 'চিত্র-ক্যাপশন' } },
    ]);

    const text = buildVersionSearchText(content);

    for (const expected of [
      'শিরোনাম',
      'কলাম',
      'মান',
      'অনুচ্ছেদ',
      'প্রথম',
      'দ্বিতীয়',
      'সারণি',
      'ঘর-এক',
      'ঘর-দুই',
      'print("হ্যালো")',
      'ছবির বর্ণনা',
      'দীর্ঘ বর্ণনা',
      'চিত্র-ক্যাপশন',
      'প্রবাহচিত্র',
    ]) {
      expect(text).toContain(expected.toLowerCase());
    }
  });

  it('buckets by key in TEXT_BEARING_KEYS order, then by document order', () => {
    // `caption` in the figure text is collected before the `text` block below it,
    // but the projection groups all `text` values first, then `alt`, then
    // `longDescription`, then `caption` — the order the SQL function uses.
    const content = envelope([
      { type: 'flowchart', data: { assetId: 'b', alt: 'বিকল্প', caption: 'ক্যাপশন' } },
      paragraph('টেক্সট'),
      { type: 'image', data: { assetId: 'a', alt: 'বিকল্প', longDescription: 'দীর্ঘ' } },
    ]);

    const buckets = TEXT_BEARING_KEYS.map((key) => {
      if (key === 'text') return 'টেক্সট';
      if (key === 'alt') return 'বিকল্প বিকল্প';
      if (key === 'longDescription') return 'দীর্ঘ';
      return 'ক্যাপশন';
    });

    expect(buildVersionSearchText(content)).toBe(buckets.join(' '));
  });

  it('includes option documents in display order, after the stem', () => {
    const content = envelope([paragraph('নিচের কোনটি ইনপুট ডিভাইস?')]);
    const text = buildVersionSearchText(content, [
      optionDoc('কিবোর্ড'),
      optionDoc('মনিটর'),
      optionDoc('প্রিন্টার'),
      optionDoc('স্পিকার'),
    ]);

    const positions = ['কিবোর্ড', 'মনিটর', 'প্রিন্টার', 'স্পিকার'].map((word) => text.indexOf(word));
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(text.startsWith('নিচের কোনটি ইনপুট ডিভাইস?')).toBe(true);
  });

  it('normalises NFC, lower case and whitespace — Bangla keeps its conjuncts', () => {
    const content = envelope([paragraph('  Computer   Network\tও  শিক্ষা  ')]);
    expect(buildVersionSearchText(content)).toBe('computer network ও শিক্ষা');
    // ক্ষ is a single conjunct cluster; normalisation must not decompose it.
    expect(buildVersionSearchText(envelope([paragraph('ক্ষ')]))).toBe('ক্ষ');
    expect(buildVersionSearchText(envelope([paragraph('ক্ষ')]))).toBe('\u0995\u09CD\u09B7');
  });

  it('folds a decomposed Latin sequence onto the composed one', () => {
    const composed = 'caf\u00E9';
    const decomposed = 'cafe\u0301';
    expect(normalizeSearchText(decomposed)).toBe(composed);
    expect(buildVersionSearchText(envelope([paragraph(decomposed)]))).toBe(composed);
  });

  it('normalises Bangla without changing it: Bengali has no canonical decomposition', () => {
    const conjunct = '\u0995\u09CD\u09B7'; // ক্ষ
    expect(conjunct.normalize('NFD')).toBe(conjunct);
    expect(normalizeSearchText(conjunct)).toBe(conjunct);
    // A zero-width joiner is preserved rather than stripped: removing it would
    // silently change which conjunct the author wrote.
    expect(normalizeSearchText('\u09B0\u09CD\u200D\u09AF')).toBe('\u09B0\u09CD\u200D\u09AF');
  });

  it('keeps punctuation, so a search for it can be written down', () => {
    const text = buildVersionSearchText(envelope([paragraph('কি? হ্যাঁ; ঠিক আছে!')]));
    expect(text).toBe('কি? হ্যাঁ; ঠিক আছে!');
  });

  it('produces an empty projection for a document with no text blocks', () => {
    expect(buildVersionSearchText(envelope([]))).toBe('');
    expect(buildVersionSearchText({})).toBe('');
    expect(buildVersionSearchText(null)).toBe('');
  });

  it('ignores non-text keys, so ids and enums never become searchable', () => {
    const content = envelope([
      { type: 'image', data: { assetId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', alt: 'ছবি' } },
    ]);
    const text = buildVersionSearchText(content);
    expect(text).toBe('ছবি');
    expect(text).not.toContain('aaaaaaaa');
  });

  it('truncates at SEARCH_TEXT_MAX code points without splitting a surrogate pair', () => {
    const emoji = '😀'; // two UTF-16 code units, one code point
    const content = envelope([paragraph(emoji.repeat(SEARCH_TEXT_MAX + 50))]);
    const text = buildVersionSearchText(content);
    expect(Array.from(text)).toHaveLength(SEARCH_TEXT_MAX);
    expect(text.endsWith('\uD83D')).toBe(false);
    expect(text).toBe(emoji.repeat(SEARCH_TEXT_MAX));
  });
});

describe('buildVersionSearchText — what must never be indexed', () => {
  it('cannot reach an MCQ answer key: it is not part of content or options', () => {
    const content = envelope([paragraph('নিচের কোনটি ইনপুট ডিভাইস?')]);
    const text = buildVersionSearchText(content, [optionDoc('কিবোর্ড'), optionDoc('মনিটর')]);
    // 'A' is the correct option KEY; the key itself is not a document field.
    expect(text).not.toMatch(/\ba\b/);
    expect(text).toBe('নিচের কোনটি ইনপুট ডিভাইস? কিবোর্ড মনিটর');
  });

  it('a rubric document passed in the options slot would be indexed — so callers never do', () => {
    // Documents what the projection is: purely structural. The service passes
    // only `content` + `question_options.content`, and the CQ branch of
    // `validateDraft` refuses options entirely, so a rubric can never arrive here.
    const rubricText = 'zzrubriccanaryzz';
    expect(buildVersionSearchText(envelope([]), [envelope([paragraph(rubricText)])])).toBe(
      rubricText,
    );
    // The real guarantee, tested in the integration suite: a rubric stored in
    // answer_keys.cq_rubric is not visible to a staff search.
    expect(buildVersionSearchText(envelope([paragraph('প্রশ্ন')]))).not.toContain(rubricText);
  });
});

describe('normalizeSearchText', () => {
  it('is idempotent', () => {
    const once = normalizeSearchText('  Computer   NETWORK ');
    expect(normalizeSearchText(once)).toBe(once);
    expect(once).toBe('computer network');
  });

  it('leaves Bangla unchanged apart from whitespace', () => {
    expect(normalizeSearchText('কম্পিউটার   নেটওয়ার্ক')).toBe('কম্পিউটার নেটওয়ার্ক');
  });
});
