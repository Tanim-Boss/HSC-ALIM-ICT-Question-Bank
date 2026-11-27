/**
 * Phase 04B — the permission matrix, every action × every role, table-driven.
 *
 * The expected table below is written out by hand on purpose: it is the
 * specification, and the code is checked against it. Deriving the expectation
 * from PERMISSIONS would only prove the matrix agrees with itself.
 */

import { describe, expect, it } from 'vitest';

import { AppRole } from '@/lib/generated/prisma/enums';
import { authorize, type Actor } from '@/server/auth/authorize';
import { ACTIONS, PERMISSIONS, isAllowed, isKnownAction } from '@/server/auth/permissions';
import { DomainError } from '@/server/questions/publish/errors';

const S = AppRole.STUDENT;
const E = AppRole.EDITOR;
const M = AppRole.MODERATOR;
const A = AppRole.ADMIN;
const SA = AppRole.SUPER_ADMIN;
const ALL_ROLES = [S, E, M, A, SA] as const;

/** The approved matrix (Phase 04B decision 3; `question.read_staff` added in Phase 04C). */
const EXPECTED: Record<(typeof ACTIONS)[number], readonly AppRole[]> = {
  'question.read_staff': [E, M, A, SA],
  'question.create': [E, M, A, SA],
  'question.edit_draft': [E, M, A, SA],
  'question.change_type': [E, M, A, SA],
  'question.publish': [M, A, SA],
  'question.archive': [M, A, SA],
  'answer_key.verify': [M, A, SA],
  'taxonomy.manage': [A, SA],
  'role.grant': [SA],
};

const actorWith = (...roles: AppRole[]): Actor => ({
  userId: '0b000000-0000-4000-8000-000000000099',
  roles: new Set(roles),
});

describe('the matrix covers exactly the approved actions', () => {
  it('lists the nine approved actions, no more and no fewer', () => {
    expect([...ACTIONS].sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(Object.keys(PERMISSIONS).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('every role in the enum is considered by the table', () => {
    expect([...ALL_ROLES].sort()).toEqual(Object.values(AppRole).sort());
  });
});

describe('every action × every role', () => {
  const cases = ACTIONS.flatMap((action) =>
    ALL_ROLES.map((role) => ({ action, role, allowed: EXPECTED[action].includes(role) })),
  );

  it.each(cases)('$role → $action is allowed=$allowed', ({ action, role, allowed }) => {
    expect(isAllowed(new Set([role]), action)).toBe(allowed);
    if (allowed) {
      expect(() => authorize(actorWith(role), action)).not.toThrow();
    } else {
      expect(() => authorize(actorWith(role), action)).toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    }
  });
});

describe('the rules stated in the decision', () => {
  it('EDITOR can create and edit drafts but cannot publish', () => {
    const editor = actorWith(E);
    expect(() => authorize(editor, 'question.create')).not.toThrow();
    expect(() => authorize(editor, 'question.edit_draft')).not.toThrow();
    expect(() => authorize(editor, 'question.publish')).toThrow(DomainError);
  });

  it('the staff read model is EDITOR and up — never STUDENT', () => {
    expect(isAllowed(new Set([S]), 'question.read_staff')).toBe(false);
    for (const role of [E, M, A, SA]) {
      expect(isAllowed(new Set([role]), 'question.read_staff')).toBe(true);
    }
  });

  it('only SUPER_ADMIN can grant roles', () => {
    for (const role of [S, E, M, A]) {
      expect(isAllowed(new Set([role]), 'role.grant')).toBe(false);
    }
    expect(isAllowed(new Set([SA]), 'role.grant')).toBe(true);
  });

  it('ADMIN is MODERATOR plus taxonomy.manage', () => {
    const moderatorActions = ACTIONS.filter((a) => isAllowed(new Set([M]), a));
    const adminActions = ACTIONS.filter((a) => isAllowed(new Set([A]), a));
    expect(adminActions.sort()).toEqual([...moderatorActions, 'taxonomy.manage'].sort());
  });

  it('roles combine: STUDENT + EDITOR may create, STUDENT alone may not', () => {
    expect(isAllowed(new Set([S, E]), 'question.create')).toBe(true);
    expect(isAllowed(new Set([S]), 'question.create')).toBe(false);
  });
});

describe('deny by default', () => {
  const unknown = [
    'question.delete',
    'QUESTION.PUBLISH',
    'question.publish ',
    '',
    'toString',
    'constructor',
    '__proto__',
    'hasOwnProperty',
  ];

  it.each(unknown)('unknown action %j is refused even for every role at once', (action) => {
    const everyone = actorWith(...ALL_ROLES);
    expect(isKnownAction(action)).toBe(false);
    expect(isAllowed(everyone.roles, action)).toBe(false);
    expect(() => authorize(everyone, action)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('an actor with no roles is refused every action', () => {
    for (const action of ACTIONS) {
      expect(() => authorize(actorWith(), action)).toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    }
  });

  it('the FORBIDDEN error carries no internal detail', () => {
    const error = (() => {
      try {
        authorize(actorWith(S), 'role.grant');
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).message).not.toMatch(/role\.grant|SUPER_ADMIN|STUDENT/);
  });
});
