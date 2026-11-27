import 'server-only';

/**
 * Who is acting on this request.
 *
 * `requireActor()` is the only way a domain service gets an `Actor`:
 *
 *   1. read the user Supabase verified for this request (lib/auth/session.ts);
 *      no session → UNAUTHENTICATED;
 *   2. load the profile and roles, provisioning a STUDENT profile on first use;
 *   3. a deactivated profile → INACTIVE.
 *
 * Domain services take the `Actor` as their FIRST parameter and call
 * `authorize` themselves. Nothing here trusts client-supplied ids or roles.
 */

import type { AppRole } from '@/lib/generated/prisma/enums';
import { DomainError } from '@/server/questions/publish/errors';
import type { Actor } from './authorize';
import type { ProfileIdentity, ProfileState } from './profiles';

export { authorize, type Actor, type AuthorizationContext } from './authorize';

/** The parts of a verified Supabase user this module uses. */
export interface VerifiedUser {
  readonly id: string;
  readonly email: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** Where `requireActor` reads from. Injected in unit tests; the default is Supabase + Prisma. */
export interface ActorSource {
  getVerifiedUser(): Promise<VerifiedUser | null>;
  loadProfile(identity: ProfileIdentity): Promise<ProfileState>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DISPLAY_NAME = 120;

/** Display name for a new profile: metadata name, else the email's local part, else "User". */
export function deriveDisplayName(user: VerifiedUser): string {
  for (const key of ['full_name', 'name', 'display_name']) {
    const value = user.metadata[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim().slice(0, MAX_DISPLAY_NAME);
    }
  }
  const local = user.email?.split('@')[0]?.trim();
  if (local !== undefined && local !== '') return local.slice(0, MAX_DISPLAY_NAME);
  return 'User';
}

const defaultSource: ActorSource = {
  async getVerifiedUser() {
    // Imported lazily so this module (and its unit tests) load without a
    // request context or a database.
    const { getUser } = await import('@/lib/auth/session');
    const user = await getUser();
    if (user === null) return null;
    return { id: user.id, email: user.email ?? null, metadata: user.user_metadata ?? {} };
  },
  async loadProfile(identity) {
    const [{ getPrisma }, { loadOrProvisionProfile }] = await Promise.all([
      import('@/lib/db'),
      import('./profiles'),
    ]);
    return loadOrProvisionProfile(getPrisma(), identity);
  },
};

export async function requireActor(source: ActorSource = defaultSource): Promise<Actor> {
  const user = await source.getVerifiedUser();
  if (user === null || !UUID.test(user.id)) {
    throw new DomainError({ code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' });
  }

  const profile = await source.loadProfile({ id: user.id, displayName: deriveDisplayName(user) });
  if (!profile.isActive) {
    throw new DomainError({
      code: 'INACTIVE',
      message: 'This account has been deactivated. Contact an administrator.',
    });
  }

  return { userId: user.id, roles: new Set<AppRole>(profile.roles) };
}
