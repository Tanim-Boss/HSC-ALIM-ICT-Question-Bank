/**
 * Separation of duties: the user who last edited a draft version cannot publish
 * it, or verify its answer key, unless they are SUPER_ADMIN.
 *
 * `lastEditorId` is the version's `updated_by`, falling back to `created_by`
 * (a version nobody has edited since creation was last edited by its author).
 * When both are NULL the version pre-dates migration 0002 and has no recorded
 * author; there is no identity to compare against, so the rule cannot fire.
 *
 * Pure: the caller reads the ids inside its own transaction and passes them in.
 * Lives in server/auth (moved from server/questions/publish/rules.ts in Phase
 * 04C) so that auth does not depend on the question module.
 */

import { DomainError } from '@/server/shared/errors';

export type SeparatedDuty = 'publish' | 'verify';

const MESSAGES: Record<SeparatedDuty, string> = {
  publish:
    'You were the last person to edit this version, so someone else must publish it. ' +
    'Ask another moderator to review and publish it.',
  verify:
    'You were the last person to edit this version, so someone else must verify its answer key. ' +
    'Ask another moderator to check and verify it.',
};

export function assertSeparationOfDuties(input: {
  readonly actorId: string;
  readonly actorIsSuperAdmin: boolean;
  readonly lastEditorId: string | null;
  readonly duty?: SeparatedDuty;
}): void {
  if (input.actorIsSuperAdmin) return;
  if (input.lastEditorId === null) return;
  if (input.lastEditorId !== input.actorId) return;
  throw new DomainError({
    code: 'FORBIDDEN',
    invariant: 'separation-of-duties',
    message: MESSAGES[input.duty ?? 'publish'],
  });
}
