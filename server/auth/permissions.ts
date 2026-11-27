/**
 * The permission matrix: which roles may perform which action.
 *
 * Permissions are code, not data. Changing who may do what is a reviewed code
 * change with tests, never a row someone edits in production.
 *
 * Rules:
 *   - Deny by default. An action that is not in the matrix is refused, and so is
 *     an actor with no role that grants it.
 *   - Staff roles are cumulative: EDITOR ⊂ MODERATOR ⊂ ADMIN ⊂ SUPER_ADMIN.
 *     EDITOR creates and edits drafts but cannot publish; MODERATOR adds
 *     publish / archive / verify; ADMIN adds taxonomy.manage; only SUPER_ADMIN
 *     grants roles.
 *   - STUDENT holds no question-bank permission.
 *   - Separation of duties is NOT in this table: it depends on the resource (who
 *     last edited the version), so it is checked by `authorize` with context.
 *
 * Dependency-free apart from the generated enum, so it is unit-testable without
 * a database or `server-only`.
 */

import { AppRole } from '@/lib/generated/prisma/enums';

export const ACTIONS = [
  'question.create',
  'question.edit_draft',
  'question.change_type',
  'question.publish',
  'question.archive',
  'answer_key.verify',
  'taxonomy.manage',
  'role.grant',
] as const;

export type Action = (typeof ACTIONS)[number];

const EDITOR_AND_UP: readonly AppRole[] = [
  AppRole.EDITOR,
  AppRole.MODERATOR,
  AppRole.ADMIN,
  AppRole.SUPER_ADMIN,
];
const MODERATOR_AND_UP: readonly AppRole[] = [
  AppRole.MODERATOR,
  AppRole.ADMIN,
  AppRole.SUPER_ADMIN,
];
const ADMIN_AND_UP: readonly AppRole[] = [AppRole.ADMIN, AppRole.SUPER_ADMIN];
const SUPER_ADMIN_ONLY: readonly AppRole[] = [AppRole.SUPER_ADMIN];

/** Action → the roles allowed to perform it. `satisfies` makes a missing action a type error. */
export const PERMISSIONS = {
  'question.create': EDITOR_AND_UP,
  'question.edit_draft': EDITOR_AND_UP,
  'question.change_type': EDITOR_AND_UP,
  'question.publish': MODERATOR_AND_UP,
  'question.archive': MODERATOR_AND_UP,
  'answer_key.verify': MODERATOR_AND_UP,
  'taxonomy.manage': ADMIN_AND_UP,
  'role.grant': SUPER_ADMIN_ONLY,
} as const satisfies Record<Action, readonly AppRole[]>;

/** Runtime guard: true only for an action that is a key of the matrix. */
export function isKnownAction(action: string): action is Action {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, action);
}

/**
 * True when at least one of `roles` grants `action`. Unknown actions — including
 * strings that only look like actions, and inherited keys such as `toString` —
 * are denied.
 */
export function isAllowed(roles: ReadonlySet<AppRole>, action: string): boolean {
  if (!isKnownAction(action)) return false;
  const allowed: readonly AppRole[] = PERMISSIONS[action];
  return allowed.some((role) => roles.has(role));
}
