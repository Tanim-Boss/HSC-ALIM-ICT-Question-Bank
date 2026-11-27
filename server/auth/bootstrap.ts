/**
 * One-time bootstrap: promote ONE existing Supabase auth user to SUPER_ADMIN.
 *
 * This is the only way the first SUPER_ADMIN comes into existence; every later
 * grant goes through `role.grant`, which only a SUPER_ADMIN holds. It refuses
 * when any SUPER_ADMIN already exists, so it cannot be re-run to take over an
 * installation.
 *
 * Everything happens in one transaction, serialised by an advisory lock so two
 * concurrent runs cannot both see "no SUPER_ADMIN yet":
 *   1. refuse if a SUPER_ADMIN exists;
 *   2. find exactly one auth.users row for the email;
 *   3. provision the profile (default STUDENT) if it does not exist;
 *   4. refuse if the profile is deactivated;
 *   5. grant SUPER_ADMIN and write a `role.grant` audit row with actor_id NULL
 *      (there is no human actor: the operator running the script is outside
 *      the application).
 *
 * Relative `.ts` imports and no `server-only`: the CLI wrapper runs under plain
 * Node. See server/auth/provision.ts.
 */

import type { PrismaClient } from '../../lib/generated/prisma/client.ts';
import { AppRole } from '../../lib/generated/prisma/enums.ts';
import { writeAuditEvent } from './audit.ts';
import { ensureProfile } from './provision.ts';

export type BootstrapRefusal =
  | 'INVALID_EMAIL'
  | 'AUTH_SCHEMA_MISSING'
  | 'AUTH_USER_NOT_FOUND'
  | 'AUTH_USER_AMBIGUOUS'
  | 'SUPER_ADMIN_EXISTS'
  | 'PROFILE_INACTIVE';

export class BootstrapRefusedError extends Error {
  readonly reason: BootstrapRefusal;

  constructor(reason: BootstrapRefusal, message: string) {
    super(message);
    this.name = 'BootstrapRefusedError';
    this.reason = reason;
  }
}

export interface BootstrapResult {
  readonly userId: string;
  readonly profileCreated: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Advisory-lock key; any stable bigint works, this one spells nothing in particular. */
const BOOTSTRAP_LOCK_KEY = 4_042_011_001n;

interface AuthUserRow {
  readonly id: string;
  readonly meta: unknown;
}

function displayNameFrom(email: string, meta: unknown): string {
  if (meta !== null && typeof meta === 'object') {
    for (const key of ['full_name', 'name', 'display_name']) {
      const value = (meta as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim() !== '') return value.trim().slice(0, 120);
    }
  }
  const local = email.split('@')[0]?.trim();
  return local !== undefined && local !== '' ? local.slice(0, 120) : 'Super Admin';
}

export async function bootstrapSuperAdmin(
  db: PrismaClient,
  rawEmail: string,
): Promise<BootstrapResult> {
  const email = rawEmail.trim();
  if (!EMAIL.test(email)) {
    throw new BootstrapRefusedError('INVALID_EMAIL', `"${rawEmail}" is not an email address.`);
  }

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`;

    const existing = await tx.userRole.count({ where: { role: AppRole.SUPER_ADMIN } });
    if (existing > 0) {
      throw new BootstrapRefusedError(
        'SUPER_ADMIN_EXISTS',
        'A SUPER_ADMIN already exists. Further grants must be made by a SUPER_ADMIN through the application.',
      );
    }

    const schema = await tx.$queryRaw<{ present: boolean }[]>`
      SELECT to_regclass('auth.users') IS NOT NULL AS present`;
    if (schema[0]?.present !== true) {
      throw new BootstrapRefusedError(
        'AUTH_SCHEMA_MISSING',
        'auth.users does not exist in this database. Run this against the Supabase project database.',
      );
    }

    const users = await tx.$queryRaw<AuthUserRow[]>`
      SELECT id::text AS id, raw_user_meta_data AS meta
        FROM auth.users
       WHERE lower(email) = lower(${email})
         AND deleted_at IS NULL`;
    if (users.length === 0) {
      throw new BootstrapRefusedError(
        'AUTH_USER_NOT_FOUND',
        'No Supabase auth user has that email. The user must sign up first.',
      );
    }
    const [user] = users;
    if (users.length > 1 || user === undefined) {
      throw new BootstrapRefusedError(
        'AUTH_USER_AMBIGUOUS',
        'More than one auth user matches that email; refusing to guess.',
      );
    }

    const profileCreated = await ensureProfile(
      tx,
      { id: user.id, displayName: displayNameFrom(email, user.meta) },
      null,
    );

    const profile = await tx.profile.findUniqueOrThrow({
      where: { id: user.id },
      select: { isActive: true },
    });
    if (!profile.isActive) {
      throw new BootstrapRefusedError(
        'PROFILE_INACTIVE',
        'That profile is deactivated; refusing to make it SUPER_ADMIN.',
      );
    }

    await tx.userRole.create({
      data: { userId: user.id, role: AppRole.SUPER_ADMIN, grantedById: null },
    });
    await writeAuditEvent(tx, {
      actorId: null,
      action: 'role.grant',
      resourceType: 'user_role',
      resourceId: user.id,
      after: { userId: user.id, role: AppRole.SUPER_ADMIN, via: 'bootstrap' },
    });

    return { userId: user.id, profileCreated };
  });
}
