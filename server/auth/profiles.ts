import 'server-only';

/**
 * Profile loading for the request path: one `profiles` row per Supabase auth
 * user, provisioned with the default STUDENT role on first use.
 *
 * There is no foreign key into Supabase's `auth` schema. The caller passes an
 * id that Supabase has just verified (server/auth/actor.ts); that runtime check
 * is the link.
 */

import type { Prisma, PrismaClient } from '@/lib/generated/prisma/client';
import type { AppRole } from '@/lib/generated/prisma/enums';
import { ensureProfile, type ProfileIdentity } from './provision';

export type { ProfileIdentity } from './provision';

export interface ProfileState {
  readonly isActive: boolean;
  readonly roles: readonly AppRole[];
}

async function readProfileState(
  db: Prisma.TransactionClient | PrismaClient,
  id: string,
): Promise<ProfileState | null> {
  const profile = await db.profile.findUnique({
    where: { id },
    select: { isActive: true, roles: { select: { role: true } } },
  });
  if (profile === null) return null;
  return { isActive: profile.isActive, roles: profile.roles.map((r) => r.role) };
}

/** Reads the profile and roles, provisioning them on first use. */
export async function loadOrProvisionProfile(
  db: PrismaClient,
  identity: ProfileIdentity,
): Promise<ProfileState> {
  const existing = await readProfileState(db, identity.id);
  if (existing !== null) return existing;

  return db.$transaction(async (tx) => {
    // The user provisions themselves: they are the actor of their own row.
    await ensureProfile(tx, identity, identity.id);
    const state = await readProfileState(tx, identity.id);
    if (state === null) throw new Error('profile provisioning did not produce a profile');
    return state;
  });
}
