/**
 * Phase 04B — requireActor: who is acting, or a typed refusal.
 *
 * The Supabase session and the profile store are injected as an `ActorSource`,
 * so these tests run without a request, a network or a database.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { requireActor, deriveDisplayName } = await import('@/server/auth/actor');
const { AppRole } = await import('@/lib/generated/prisma/enums');
type ActorSource = import('@/server/auth/actor').ActorSource;
type VerifiedUser = import('@/server/auth/actor').VerifiedUser;

const USER_ID = '6f1c2b8e-4a3d-4e5f-9a7b-1c2d3e4f5a6b';

function source(
  user: VerifiedUser | null,
  profile: { isActive: boolean; roles: (typeof AppRole)[keyof typeof AppRole][] },
) {
  const loadProfile = vi.fn<ActorSource['loadProfile']>(() => Promise.resolve(profile));
  const src: ActorSource = {
    getVerifiedUser: () => Promise.resolve(user),
    loadProfile,
  };
  return { src, loadProfile };
}

const user = (over: Partial<VerifiedUser> = {}): VerifiedUser => ({
  id: USER_ID,
  email: 'rahim@example.com',
  metadata: {},
  ...over,
});

describe('requireActor', () => {
  it('refuses a request with no verified user as UNAUTHENTICATED and reads no profile', async () => {
    const { src, loadProfile } = source(null, { isActive: true, roles: [AppRole.STUDENT] });
    await expect(requireActor(src)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it('refuses an id that is not a UUID as UNAUTHENTICATED', async () => {
    const { src, loadProfile } = source(user({ id: 'not-a-uuid' }), {
      isActive: true,
      roles: [AppRole.STUDENT],
    });
    await expect(requireActor(src)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it('refuses a deactivated profile as INACTIVE', async () => {
    const { src } = source(user(), { isActive: false, roles: [AppRole.MODERATOR] });
    await expect(requireActor(src)).rejects.toMatchObject({ code: 'INACTIVE' });
  });

  it('returns the verified id and the stored roles — never anything from the client', async () => {
    const { src, loadProfile } = source(user(), {
      isActive: true,
      roles: [AppRole.STUDENT, AppRole.EDITOR],
    });
    const actor = await requireActor(src);
    expect(actor.userId).toBe(USER_ID);
    expect([...actor.roles].sort()).toEqual([AppRole.EDITOR, AppRole.STUDENT]);
    expect(loadProfile).toHaveBeenCalledWith({ id: USER_ID, displayName: 'rahim' });
  });

  it('an active profile with only the default role is a STUDENT actor', async () => {
    const { src } = source(user(), { isActive: true, roles: [AppRole.STUDENT] });
    const actor = await requireActor(src);
    expect(actor.roles.has(AppRole.STUDENT)).toBe(true);
    expect(actor.roles.size).toBe(1);
  });
});

describe('deriveDisplayName', () => {
  it('prefers the metadata name', () => {
    expect(deriveDisplayName(user({ metadata: { full_name: '  রহিম উদ্দিন ' } }))).toBe(
      'রহিম উদ্দিন',
    );
  });

  it('falls back to the email local part, then to "User"', () => {
    expect(deriveDisplayName(user({ metadata: { full_name: '   ' } }))).toBe('rahim');
    expect(deriveDisplayName(user({ email: null }))).toBe('User');
  });

  it('never returns a blank name (ck_profiles_display_name_not_blank)', () => {
    expect(deriveDisplayName(user({ email: '@example.com' })).trim()).not.toBe('');
  });
});
