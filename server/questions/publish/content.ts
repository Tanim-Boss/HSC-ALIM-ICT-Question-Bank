/**
 * Structured-content traversal for the publish gate.
 *
 * §7.5's document profiles, §7.6.5's rooted asset pointers and §3.13's I‑8 /
 * I‑14 / I‑15 all depend on walking `question_versions.content`,
 * `question_options.content` and `answer_keys.cq_rubric` as *documents*. This
 * module is that walker and nothing else: no validation rules, no errors, no
 * database. Keeping it separate is what makes the rules unit-testable and keeps
 * the pointer grammar in exactly one place.
 *
 * The pointer grammar is fixed by `ck_question_version_assets_block_ref_pointer`
 * in migration 0001 and documented in §3.3.12 / §7.6.5:
 *
 *   /content/blocks/{i}                      — a top-level block of the stem
 *   /content/blocks/{i}/data/blocks/{j}      — a block nested in that block
 *   /options/{KEY}/blocks/{j}                — a block of an MCQ option's content
 *
 * Indices carry no leading zero (`blocks[01]` is not the grammar), and options
 * are addressed by immutable `key`, never by `sort_order`.
 */

/** A block as stored in a `rich_blocks` envelope. Loose by design. */
export interface ContentBlock {
  readonly type: string;
  readonly data?: Record<string, unknown>;
}

/** The `rich_blocks` envelope every content column uses (§3.9). */
export interface ContentDocument {
  readonly format: string;
  readonly version: number;
  readonly blocks: readonly ContentBlock[];
}

/** One block reached by a walk, with the pointer that addresses it. */
export interface LocatedBlock {
  /** Rooted pointer, exactly as `question_version_assets.block_ref` stores it. */
  readonly blockRef: string;
  /** Where the block lives, which decides the applicable §7.5 profile. */
  readonly home: 'content' | 'option';
  /** The option key when `home === 'option'`. */
  readonly optionKey?: string;
  /** 0-based index within its parent's `blocks` array. */
  readonly index: number;
  /** Nesting depth: 0 for a top-level block, 1 for a nested one. */
  readonly depth: number;
  readonly block: ContentBlock;
}

const BLOCK_TYPE_WITH_NESTING = new Set(['subquestion']);

/** True when a JSON value is a usable content document envelope. */
export function isContentDocument(value: unknown): value is ContentDocument {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['format'] === 'string' &&
    typeof candidate['version'] === 'number' &&
    Array.isArray(candidate['blocks'])
  );
}

function asBlock(value: unknown): ContentBlock | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate['type'] !== 'string') return null;
  const data = candidate['data'];
  return {
    type: candidate['type'],
    ...(typeof data === 'object' && data !== null ? { data: data as Record<string, unknown> } : {}),
  };
}

/** The nested `blocks` array of a block, if it has a well-formed one. */
export function nestedBlocks(block: ContentBlock): readonly ContentBlock[] {
  const raw = block.data?.['blocks'];
  if (!Array.isArray(raw)) return [];
  return raw.map(asBlock).filter((b): b is ContentBlock => b !== null);
}

/**
 * Walks every block of a document, top level and one level of nesting.
 *
 * Nesting is only descended for block types that can carry it
 * (`subquestion`), because §7.6.5 pins pointers at `/content/blocks/{i}` and
 * `/content/blocks/{i}/data/blocks/{j}` — there is no third level in the
 * grammar, and inventing one would produce pointers the database rejects.
 */
export function walkDocument(
  document: ContentDocument,
  opts: { home: 'content'; optionKey?: undefined } | { home: 'option'; optionKey: string },
): LocatedBlock[] {
  const found: LocatedBlock[] = [];
  const root = opts.home === 'content' ? '/content' : `/options/${opts.optionKey}`;

  document.blocks.forEach((rawBlock, index) => {
    const block = asBlock(rawBlock);
    if (block === null) return;
    const blockRef = `${root}/blocks/${index}`;
    found.push({
      blockRef,
      home: opts.home,
      ...(opts.home === 'option' ? { optionKey: opts.optionKey } : {}),
      index,
      depth: 0,
      block,
    });

    if (!BLOCK_TYPE_WITH_NESTING.has(block.type)) return;
    nestedBlocks(block).forEach((nested, nestedIndex) => {
      found.push({
        blockRef: `${blockRef}/data/blocks/${nestedIndex}`,
        home: opts.home,
        ...(opts.home === 'option' ? { optionKey: opts.optionKey } : {}),
        index: nestedIndex,
        depth: 1,
        block: nested,
      });
    });
  });

  return found;
}

/** Every `assetId` a block exposes, in the order it exposes them. */
export function assetIdsIn(block: ContentBlock): string[] {
  const value = block.data?.['assetId'];
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

/** The `subquestion` blocks of a stem, in document order. */
export function subquestionBlocks(document: ContentDocument): readonly ContentBlock[] {
  return document.blocks
    .map(asBlock)
    .filter((b): b is ContentBlock => b !== null && b.type === 'subquestion');
}

/** The `part` label of a subquestion block (`ক` … `ঘ`), when present. */
export function subquestionPart(block: ContentBlock): string | null {
  const value = block.data?.['part'];
  return typeof value === 'string' ? value : null;
}

/** The `maxMarks` of a subquestion block, when it is a positive integer. */
export function subquestionMaxMarks(block: ContentBlock): number | null {
  const value = block.data?.['maxMarks'];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/**
 * Splits a pointer into its root and the block indices it addresses.
 * Returns null when the pointer is not the documented grammar, so callers can
 * distinguish "grammar-valid but unresolved" from "not a pointer at all".
 */
export function parseBlockRef(
  blockRef: string,
): { root: 'content' | 'option'; optionKey?: string; index: number; nestedIndex?: number } | null {
  const content = /^\/content\/blocks\/(0|[1-9]\d*)(?:\/data\/blocks\/(0|[1-9]\d*))?$/.exec(
    blockRef,
  );
  if (content !== null) {
    const first = content[1];
    if (first === undefined) return null;
    const nested = content[2];
    return {
      root: 'content',
      index: Number(first),
      ...(nested === undefined ? {} : { nestedIndex: Number(nested) }),
    };
  }

  const option = /^\/options\/([^/]+)\/blocks\/(0|[1-9]\d*)$/.exec(blockRef);
  if (option !== null) {
    const key = option[1];
    const index = option[2];
    if (key === undefined || index === undefined) return null;
    return { root: 'option', optionKey: key, index: Number(index) };
  }

  return null;
}
