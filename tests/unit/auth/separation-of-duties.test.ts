/**
 * Phase 04B — separation of duties: the user who last edited a draft version
 * cannot publish it unless they are SUPER_ADMIN.
 *
 * Tested twice: the pure rule in server/auth/separation-of-duties.ts, and
 * `authorize` for `question.publish` / `answer_key.verify`, which is how the
 * services reach it.
 */

import { describe, expect, it } from 'vitest';

import { AppRole } from '@/lib/generated/prisma/enums';
import { authorize, type Actor } from '@/server/auth/authorize';
import { assertSeparationOfDuties } from '@/server/auth/separation-of-duties';

const ME = '0b000000-0000-4000-8000-0000000000aa';
const OTHER = '0b000000-0000-4000-8000-0000000000bb';

describe('assertSeparationOfDuties (pure rule)', () => {
  it('refuses the last editor', () => {
    expect(() =>
      assertSeparationOfDuties({ actorId: ME, actorIsSuperAdmin: false, lastEditorId: ME }),
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN', invariant: 'separation-of-duties' }));
  });

  it('allows someone who did not edit the version', () => {
    expect(() =>
      assertSeparationOfDuties({ actorId: ME, actorIsSuperAdmin: false, lastEditorId: OTHER }),
    ).not.toThrow();
  });

  it('lets a SUPER_ADMIN publish their own edit', () => {
    expect(() =>
      assertSeparationOfDuties({ actorId: ME, actorIsSuperAdmin: true, lastEditorId: ME }),
    ).not.toThrow();
  });

  it('does not fire for a version with no recorded editor (pre-0002 row)', () => {
    expect(() =>
      assertSeparationOfDuties({ actorId: ME, actorIsSuperAdmin: false, lastEditorId: null }),
    ).not.toThrow();
  });

  it('tells the user what to do next, without internal detail', () => {
    try {
      assertSeparationOfDuties({ actorId: ME, actorIsSuperAdmin: false, lastEditorId: ME });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toMatch(/someone else must publish/i);
      expect((error as Error).message).not.toContain(ME);
    }
  });
});

describe('authorize(question.publish) applies separation of duties', () => {
  const actor = (...roles: AppRole[]): Actor => ({ userId: ME, roles: new Set(roles) });

  it('MODERATOR who last edited the version is refused', () => {
    expect(() =>
      authorize(actor(AppRole.MODERATOR), 'question.publish', { lastEditorId: ME }),
    ).toThrow(expect.objectContaining({ invariant: 'separation-of-duties' }));
  });

  it('EDITOR + MODERATOR who last edited the version is refused', () => {
    expect(() =>
      authorize(actor(AppRole.EDITOR, AppRole.MODERATOR), 'question.publish', {
        lastEditorId: ME,
      }),
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  it('MODERATOR who did not edit the version may publish', () => {
    expect(() =>
      authorize(actor(AppRole.MODERATOR), 'question.publish', { lastEditorId: OTHER }),
    ).not.toThrow();
  });

  it('SUPER_ADMIN who last edited the version may publish', () => {
    expect(() =>
      authorize(actor(AppRole.SUPER_ADMIN), 'question.publish', { lastEditorId: ME }),
    ).not.toThrow();
  });

  it('the role check still comes first: an EDITOR is refused for the role, not for SoD', () => {
    expect(() =>
      authorize(actor(AppRole.EDITOR), 'question.publish', { lastEditorId: OTHER }),
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN', invariant: undefined }));
  });

  it('applies to answer_key.verify too: the last editor cannot verify their own key', () => {
    expect(() =>
      authorize(actor(AppRole.MODERATOR), 'answer_key.verify', { lastEditorId: ME }),
    ).toThrow(expect.objectContaining({ invariant: 'separation-of-duties' }));
    expect(() =>
      authorize(actor(AppRole.MODERATOR), 'answer_key.verify', { lastEditorId: OTHER }),
    ).not.toThrow();
    expect(() =>
      authorize(actor(AppRole.SUPER_ADMIN), 'answer_key.verify', { lastEditorId: ME }),
    ).not.toThrow();
  });

  it('the verify refusal says "verify", not "publish"', () => {
    try {
      authorize(actor(AppRole.MODERATOR), 'answer_key.verify', { lastEditorId: ME });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toMatch(/verify its answer key/);
    }
  });

  it('separation of duties applies only to publishing and verifying', () => {
    expect(() =>
      authorize(actor(AppRole.EDITOR), 'question.edit_draft', { lastEditorId: ME }),
    ).not.toThrow();
  });
});
