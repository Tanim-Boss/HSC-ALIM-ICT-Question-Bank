/**
 * Phase 04B test actors for the integration suites.
 *
 * One profile per role, with fixed ids so every suite and every run uses the
 * same rows. Profiles are never deleted: audit_events references them and is
 * append-only, so a delete would be refused anyway. `ensureActorProfiles` is
 * idempotent (ON CONFLICT DO NOTHING).
 *
 * Fixture rows that start PUBLISHED or verified must name who did it — the
 * migration 0002 CHECKs require it for every new row — so `publishStamp` and
 * `verifyStamp` supply those columns.
 */

import type { PrismaClient } from '@/lib/generated/prisma/client';
import { AppRole } from '@/lib/generated/prisma/enums';
import type { Actor } from '@/server/auth/authorize';

export const ACTOR_IDS = {
  student: '0b000000-0000-4000-8000-000000000001',
  editor: '0b000000-0000-4000-8000-000000000002',
  moderator: '0b000000-0000-4000-8000-000000000003',
  moderator2: '0b000000-0000-4000-8000-000000000004',
  admin: '0b000000-0000-4000-8000-000000000005',
  superAdmin: '0b000000-0000-4000-8000-000000000006',
  editorModerator: '0b000000-0000-4000-8000-000000000007',
} as const;

export type ActorName = keyof typeof ACTOR_IDS;

const ROLES: Record<ActorName, readonly AppRole[]> = {
  student: [AppRole.STUDENT],
  editor: [AppRole.STUDENT, AppRole.EDITOR],
  moderator: [AppRole.STUDENT, AppRole.MODERATOR],
  moderator2: [AppRole.STUDENT, AppRole.MODERATOR],
  admin: [AppRole.STUDENT, AppRole.ADMIN],
  superAdmin: [AppRole.STUDENT, AppRole.SUPER_ADMIN],
  editorModerator: [AppRole.STUDENT, AppRole.EDITOR, AppRole.MODERATOR],
};

export function actorFor(name: ActorName): Actor {
  return { userId: ACTOR_IDS[name], roles: new Set(ROLES[name]) };
}

export async function ensureActorProfiles(client: PrismaClient): Promise<void> {
  const names = Object.keys(ACTOR_IDS) as ActorName[];
  await client.profile.createMany({
    data: names.map((name) => ({ id: ACTOR_IDS[name], displayName: `Test ${name}` })),
    skipDuplicates: true,
  });
  await client.userRole.createMany({
    data: names.flatMap((name) => ROLES[name].map((role) => ({ userId: ACTOR_IDS[name], role }))),
    skipDuplicates: true,
  });
}

/** Columns a row that starts PUBLISHED must carry (ck_question_versions_published_has_publisher). */
export function publishStamp(): { publishedById: string; publishedAt: Date } {
  return { publishedById: ACTOR_IDS.moderator2, publishedAt: new Date() };
}

/** Column a verified answer key must carry (ck_answer_keys_verified_has_verifier). */
export function verifyStamp(): { verifiedById: string } {
  return { verifiedById: ACTOR_IDS.moderator2 };
}
