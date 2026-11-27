/**
 * Profile provisioning core, shared by the request path (server/auth/profiles.ts)
 * and the bootstrap script (scripts/db/bootstrap-super-admin.ts).
 *
 * Relative `.ts` imports and no `server-only`, on purpose: the bootstrap script
 * runs under plain Node (built-in type stripping), which resolves neither the
 * `@/` alias nor the `react-server` export condition. Keep it that way.
 */

import type { Prisma } from '../../lib/generated/prisma/client.ts';
import { AppRole } from '../../lib/generated/prisma/enums.ts';
import { writeAuditEvent } from './audit.ts';

export interface ProfileIdentity {
  /** auth.users.id, already verified by Supabase (or looked up by the bootstrap). */
  readonly id: string;
  readonly displayName: string;
}

/**
 * Creates the profile and its default STUDENT role if they do not exist yet,
 * on the caller's transaction. Returns true when this call created the profile.
 *
 * The insert is ON CONFLICT DO NOTHING (`skipDuplicates`), so two first
 * requests racing each other create exactly one profile and one STUDENT grant.
 */
export async function ensureProfile(
  tx: Prisma.TransactionClient,
  identity: ProfileIdentity,
  auditActorId: string | null,
): Promise<boolean> {
  const inserted = await tx.profile.createMany({
    data: [{ id: identity.id, displayName: identity.displayName }],
    skipDuplicates: true,
  });
  if (inserted.count === 0) return false;

  await tx.userRole.create({
    data: { userId: identity.id, role: AppRole.STUDENT, grantedById: null },
  });
  await writeAuditEvent(tx, {
    actorId: auditActorId,
    action: 'profile.provision',
    resourceType: 'profile',
    resourceId: identity.id,
    after: { isActive: true, roles: [AppRole.STUDENT] },
  });
  return true;
}
