/**
 * §7.11 — the public parse surface.
 *
 * §7.11 prescribes this layout (`envelope.ts`, `blocks.ts`, `profiles.ts`,
 * `rubric.ts`, `versions.ts`, `index.ts`) and these public parse functions. This
 * module is that entry point.
 *
 * ── OD-17 ISOLATION BOUNDARY ───────────────────────────────────────────────
 *
 * Everything exported here parses a CONTENT DOCUMENT. None of it parses an HTTP
 * REQUEST. That distinction is the whole OD-17 dependency, and it is why this
 * module can exist while OD-17 is open:
 *
 *   - a document's shape is fixed by §7 (approved, Revision 4);
 *   - a request's transport, field names, error envelope and HTTP status mapping
 *     are fixed by OD-17 (open).
 *
 * So there is deliberately NO `parseRequest`, no route-handler helper and no HTTP
 * status decision in this file. A caller that has a document — the publish gate,
 * a future save path, a future renderer read path — uses these functions and
 * decides its own transport. See `OD-17-DEPENDENCY.md` for the three questions
 * that would let a request layer be written, and note that §7.11 rule 11 already
 * fixes the *content* of an error (`{path, code, message}`) while explicitly
 * leaving "the wire shape" to OD-17.
 *
 * ── TWO CALL SITES, TWO BEHAVIOURS (§7.11 rule 7) ──────────────────────────
 *
 *   publish/save  → `parseDocumentOrThrow` — throws, because a publish attempt
 *                   with bad content must fail loudly and carry field paths.
 *   read/render   → `safeParseDocument` — never throws; returns an error the
 *                   caller logs and renders as the unsupported-content state.
 *                   "Never `parse()` inside a render path — a validation failure
 *                   must not become a 500 on an exam screen."
 *
 * ── WHAT THIS DOES NOT DO (§7.11, closing section) ─────────────────────────
 *
 * It does not sanitize. "It validates shape and rejects dangerous constructs.
 * Sanitization is a renderer property, because a sanitizer that rewrites stored
 * content would break the immutability of a published version." Sanitisation
 * remains §7.10's business and the renderer's job.
 */

import { z } from 'zod';

import { contentBlockSchema } from './blocks';
import { envelopeShape, formatIssue, LIMITS } from './envelope';
import {
  cqRubricSchema,
  cqStemSchema,
  mcqStemSchema,
  optionContentSchema,
  parseContent,
} from './profiles';

export * from './envelope';
export * from './blocks';
export * from './profiles';

/**
 * §7.11 rule 8 — the version registry.
 *
 * "`versions.ts` maps `1 → v1Schema`. Parsing reads `version` **only after**
 * confirming it is an integer, then dispatches; an unknown version is a validation
 * error, not a fallback to the newest schema (§7.8)."
 *
 * There is exactly one version today, which is why this is a lookup rather than
 * a chain of `if`s — the shape is right for v2 without pretending v2 exists.
 */
const DOCUMENT_SCHEMAS_BY_VERSION: Readonly<Record<number, z.ZodType>> = {
  1: z.strictObject({
    ...envelopeShape,
    blocks: z
      .array(contentBlockSchema)
      .min(LIMITS.blocksPerDocumentMin)
      .max(LIMITS.blocksPerDocumentMax),
  }),
};

/** The generic `rich_blocks` document, any of the ten block types. */
export const richBlocksDocumentSchema = DOCUMENT_SCHEMAS_BY_VERSION[1] as z.ZodType;

/**
 * Reads the envelope version WITHOUT validating the rest, so an unknown version
 * can be reported as such rather than as a block-type error.
 */
export function readDocumentVersion(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const version = (value as Record<string, unknown>)['version'];
  return typeof version === 'number' && Number.isInteger(version) ? version : null;
}

/** The four approved profiles, keyed by the profile name §7.5 uses. */
export const PROFILE_SCHEMAS = {
  mcq_stem: mcqStemSchema,
  cq_stem: cqStemSchema,
  option: optionContentSchema,
  cq_rubric: cqRubricSchema,
} as const;

export type ProfileName = keyof typeof PROFILE_SCHEMAS;

/**
 * Parses a document against a named profile. Returns formatted issues rather
 * than throwing — the throwing form is `parseDocumentOrThrow`.
 */
export function safeParseProfile(
  profile: ProfileName,
  value: unknown,
):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly issues: string[] } {
  // §7.8: dispatch on the stored version first, so an unknown version is reported
  // as a version problem rather than as a cascade of shape problems.
  if (profile !== 'cq_rubric') {
    const version = readDocumentVersion(value);
    if (version !== null && DOCUMENT_SCHEMAS_BY_VERSION[version] === undefined) {
      return {
        ok: false,
        issues: [`version: document schema version ${version} is not supported`],
      };
    }
  }
  return parseContent(PROFILE_SCHEMAS[profile] as z.ZodType<unknown>, value);
}

/**
 * Publish/save behaviour (§7.11 rule 7): throws with every issue, each carrying a
 * field path. The thrown value is a plain `Error` subclass so the caller can map
 * it to whatever its transport requires — which is OD-17's decision, not this
 * module's.
 */
export class ContentValidationError extends Error {
  readonly issues: readonly string[];

  constructor(profile: ProfileName, issues: readonly string[]) {
    super(
      `The ${profile} document is not valid: ${issues.length} problem` +
        `${issues.length === 1 ? '' : 's'} — ${issues[0] ?? ''}`,
    );
    this.name = 'ContentValidationError';
    this.issues = issues;
  }
}

/** Publish/save entry point. Throws `ContentValidationError` on any problem. */
export function parseDocumentOrThrow(profile: ProfileName, value: unknown): unknown {
  const result = safeParseProfile(profile, value);
  if (!result.ok) throw new ContentValidationError(profile, result.issues);
  return result.value;
}

/**
 * Read/render entry point. Never throws; returns `null` on failure so a renderer
 * shows its unsupported-content state instead of a 500.
 *
 * §7.11 rule 7 also requires logging a structured error (version id, pointer,
 * schema version) on this path. The caller owns that log line because only it
 * knows the version id — this function returns the issues for it to log.
 */
export function safeParseDocument(
  profile: ProfileName,
  value: unknown,
):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly issues: readonly string[] } {
  const result = safeParseProfile(profile, value);
  if (result.ok) return result;
  return { ok: false, issues: result.issues.map((i) => i) };
}

/** Formats a single issue the way §7.9's examples do: `blocks[i].prop: reason`. */
export { formatIssue };
