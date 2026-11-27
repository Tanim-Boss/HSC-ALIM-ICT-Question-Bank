/**
 * The staff search projection (Phase 04D).
 *
 * WHAT IS INDEXED
 * ---------------
 * A question version's `content` document — the EXISTING content-block
 * envelope ({format, version, blocks}) validated by
 * lib/validation/content-blocks — plus the plain text of that version's
 * options. Options are included because a question is usually remembered by its
 * choices ("which one lists কিবোর্ড?"); they are pulled from
 * question_options, never from `content`.
 *
 * WHAT IS NOT INDEXED, AND WHY
 * ----------------------------
 *   · Answer keys. `answer_keys.mcq_correct_option_key` is a one-character
 *     secret: indexing it would turn the staff list into an oracle.
 *   · CQ rubrics. `answer_keys.cq_rubric` is the marking guide — private
 *     rubric text must not be searchable (the brief requires this explicitly).
 *   · Question ids, tag names, chapter titles and source names. Those are their
 *     own filters; folding them into content search would make "board" match
 *     every Rajshahi question and would blur two different search intentions.
 *
 * The projection therefore cannot contain an answer even though it is written
 * into the same row as the answer key: it is derived from `content` and
 * `question_options` only.
 *
 * HOW TEXT IS EXTRACTED
 * ---------------------
 * Key-name driven, recursively over the document: every STRING value whose key
 * is one of TEXT_BEARING_KEYS, in depth-first document order, bucketed by key
 * in TEXT_BEARING_KEYS order. One rule covers every approved block type (§7.4)
 * without enumerating them:
 *
 *   · `paragraph.text`, `heading.text`, `list.items[].text`,
 *     `table.rows[][].text` (a header cell is a text cell), `callout.text`, and
 *     the blocks nested inside a `subquestion` — via `text`;
 *   · `table.caption`, `image.caption`, `code.caption`, `flowchart.caption` —
 *     via `caption`;
 *   · `image.alt` and `image.longDescription` — via `alt` / `longDescription`.
 *
 * FOUR FIELDS ARE DELIBERATELY NOT INDEXED. Stated exhaustively, checked against
 * lib/validation/content-blocks/blocks.ts, because a search that silently misses
 * a field is worse than one that is documented to miss it:
 *
 *   · `code.code` — source text, not prose; a block may hold 5,000 characters,
 *     and searching `SELECT` should not match every SQL question.
 *   · `math.latex` — formula source, whose tokens are punctuation. Formula
 *     search is a different feature.
 *   · `flowchart.description` — the one prose field whose name differs from
 *     `longDescription`; extending the rule to it is a deliberate follow-up.
 *   · `callout.title` — a short label; the callout's `text` is indexed.
 *
 * Keeping the rule at four keys keeps the SQL function small enough to audit and
 * the GIN index small enough to be worth its write cost.
 *
 * The result is NORMALISED: Unicode NFC, lower-cased, whitespace collapsed to
 * single spaces. The stored projection is what the GIN trigram index sees and
 * what a query is compared against, so the two normalisations must be the same
 * one — see `normalizeSearchQuery` in ./list-filters.ts.
 *
 * ONE RULE, TWO IMPLEMENTATIONS
 * -----------------------------
 * Migration 0003 backfills existing rows with SQL function
 * `ict_version_search_text(content, options)`, which implements this same rule
 * in SQL (it is an IMMUTABLE function so an operator can also re-derive a row
 * to detect drift). Two implementations of one rule drift unless something
 * pins them together: tests/integration/questions/staff-search.test.ts asserts
 * TS and SQL produce identical text for every block type in the fixture set, and
 * tests/unit/questions/search-text.test.ts pins the TS rule itself.
 *
 * Pure: no Prisma client, no `server-only`, no I/O.
 */

/**
 * The prose-bearing keys of the approved content-block profiles (§7.4).
 * ORDER IS PART OF THE CONTRACT: the SQL function buckets in exactly this
 * order. The header lists what is deliberately excluded.
 */
export const TEXT_BEARING_KEYS = ['text', 'alt', 'longDescription', 'caption'] as const;

export type TextBearingKey = (typeof TEXT_BEARING_KEYS)[number];

/** Longest projection written to the column; matches the CHECK in migration 0003. */
export const SEARCH_TEXT_MAX = 20_000;

function collect(value: unknown, buckets: Map<TextBearingKey, string[]>): void {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, buckets);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (typeof child === 'string' && (TEXT_BEARING_KEYS as readonly string[]).includes(key)) {
      const bucket = buckets.get(key as TextBearingKey);
      if (bucket !== undefined) bucket.push(child);
      continue;
    }
    collect(child, buckets);
  }
}

/** NFC → lower case → single spaces → trimmed. Identical to ict_normalize_search_text. */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

/**
 * Builds the stored projection for one version.
 *
 * `optionContents` are the version's option documents in display order
 * (`question_options.sort_order`). Pass `[]` for a CQ version.
 */
export function buildVersionSearchText(
  content: unknown,
  optionContents: readonly unknown[] = [],
): string {
  const buckets = new Map<TextBearingKey, string[]>(
    TEXT_BEARING_KEYS.map((key) => [key, [] as string[]]),
  );
  collect(content, buckets);
  for (const option of optionContents) collect(option, buckets);

  const joined = TEXT_BEARING_KEYS.map((key) => (buckets.get(key) ?? []).join(' '))
    .filter((part) => part.length > 0)
    .join(' ');

  const normalized = normalizeSearchText(joined);
  // Truncation is measured in code points so a surrogate pair is never split.
  const codePoints = Array.from(normalized);
  return codePoints.length <= SEARCH_TEXT_MAX
    ? normalized
    : codePoints.slice(0, SEARCH_TEXT_MAX).join('');
}
