/**
 * Authorization decisions. Pure: no I/O, no `server-only`, so every branch is
 * unit-tested directly.
 *
 * Domain services are the enforcement point. UI state, `proxy.ts` and (future)
 * RLS policies are not: a service that performs an action calls `authorize`
 * first, every time.
 */

import { AppRole } from '@/lib/generated/prisma/enums';
import { DomainError } from '@/server/questions/publish/errors';
import { assertSeparationOfDuties } from '@/server/questions/publish/rules';
import { isAllowed, isKnownAction } from './permissions';

/** Who is acting. Built by `requireActor`; never from client-supplied data. */
export interface Actor {
  readonly userId: string;
  readonly roles: ReadonlySet<AppRole>;
}

/**
 * Resource facts some decisions depend on.
 *
 * `lastEditorId` — the publishing version's `updated_by ?? created_by`. Passing
 * it is what turns on the separation-of-duties check for `question.publish`;
 * `publishVersion` always passes it.
 */
export interface AuthorizationContext {
  readonly lastEditorId?: string | null;
}

/**
 * Throws `FORBIDDEN` unless `actor` may perform `action`.
 *
 * Deny by default: an unknown action string is refused even for SUPER_ADMIN.
 */
export function authorize(actor: Actor, action: string, context?: AuthorizationContext): void {
  if (!isKnownAction(action) || !isAllowed(actor.roles, action)) {
    throw new DomainError({
      code: 'FORBIDDEN',
      message: 'You do not have permission to do that.',
    });
  }

  if (action === 'question.publish' && context?.lastEditorId !== undefined) {
    assertSeparationOfDuties({
      actorId: actor.userId,
      actorIsSuperAdmin: actor.roles.has(AppRole.SUPER_ADMIN),
      lastEditorId: context.lastEditorId,
    });
  }
}
