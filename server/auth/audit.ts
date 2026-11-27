/**
 * Audit writer. Every audited change writes its row through `writeAuditEvent`
 * on the SAME transaction client as the change, so the two commit or roll back
 * together: if the audit insert fails, the change is undone.
 *
 * `before` / `after` are flat records of ids and status fields. The type allows
 * only scalars and string lists — no nested objects — and the runtime check
 * below refuses keys that would carry answer keys, rubrics or question content.
 * The database adds its own guard: `audit_events` is append-only (trigger
 * trg_audit_events_append_only, migration 0002).
 */

import type { Prisma } from '@/lib/generated/prisma/client';

export type AuditAction =
  'question.publish' | 'question.change_type' | 'profile.provision' | 'role.grant';

export type AuditResourceType = 'question' | 'question_version' | 'profile' | 'user_role';

export type AuditValue = string | number | boolean | null | readonly string[];
export type AuditState = Readonly<Record<string, AuditValue>>;

export interface AuditEventInput {
  /** NULL only for system actions with no human actor (the bootstrap script). */
  readonly actorId: string | null;
  readonly action: AuditAction;
  readonly resourceType: AuditResourceType;
  readonly resourceId: string;
  readonly before?: AuditState;
  readonly after?: AuditState;
  readonly requestId?: string;
}

/**
 * Key fragments that must never appear in an audit payload. Answer keys and
 * rubrics are server-only (README L4); an audit log is readable by more people
 * than the answer key is, so it must not become a second copy of one.
 */
const FORBIDDEN_KEY = /answer|rubric|correct|content|option_key|optionkey/i;

/** Throws if a payload key could carry answer or content data. Exported for tests. */
export function assertAuditStateIsSafe(state: AuditState | undefined): void {
  if (state === undefined) return;
  for (const key of Object.keys(state)) {
    if (FORBIDDEN_KEY.test(key)) {
      throw new Error(
        `audit payload key "${key}" is not allowed: audit rows carry ids and status fields only`,
      );
    }
    const value = state[key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      throw new Error(`audit payload key "${key}" holds an object: audit rows are flat`);
    }
  }
}

export async function writeAuditEvent(
  tx: Prisma.TransactionClient,
  event: AuditEventInput,
): Promise<void> {
  assertAuditStateIsSafe(event.before);
  assertAuditStateIsSafe(event.after);
  await tx.auditEvent.create({
    data: {
      actorId: event.actorId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      ...(event.before === undefined ? {} : { before: event.before }),
      ...(event.after === undefined ? {} : { after: event.after }),
      ...(event.requestId === undefined ? {} : { requestId: event.requestId }),
    },
  });
}
