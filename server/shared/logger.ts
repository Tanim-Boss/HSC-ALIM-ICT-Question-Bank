/**
 * A tiny structured logger: one JSON object per line on stderr (console.error).
 *
 * No dependency and no transport — whatever hosts the app (Vercel, a container)
 * collects stderr. This exists so the application boundaries can record an
 * unexpected failure before they replace it with a sanitized error; without it
 * the original error was simply lost.
 *
 * WHAT MAY BE LOGGED
 *   · an event name, a request id, and the error's name / code / SQLSTATE /
 *     message / stack, after redaction (below).
 *
 * WHAT MUST NEVER BE LOGGED
 *   · input payloads, question content, options, answer keys, rubrics, or any
 *     value a caller passed in. Callers pass only the error; `LogFields` takes
 *     scalars so an object payload cannot be dropped in by accident.
 *
 * REDACTION — an error's own text can still carry secrets or data:
 *   · connection strings (`postgresql://user:password@host`) → password removed;
 *   · `NAME_KEY=…`, `…TOKEN=…`, `…SECRET=…`, `…PASSWORD=…` assignments and
 *     JWT-shaped tokens → value removed;
 *   · PostgreSQL DETAIL `Key (col)=(value)` → value removed (it can be an answer);
 *   · a Prisma validation error echoes the whole query arguments (content,
 *     answer keys) in its message and stack, so both are omitted for it.
 *
 * Dependency-free apart from node:crypto, so it is unit-testable anywhere.
 */

import { randomUUID } from 'node:crypto';

export type LogFieldValue = string | number | boolean | null | undefined;
export type LogFields = Readonly<Record<string, LogFieldValue>>;

const MAX_TEXT = 4000;

/** A new correlation id for one request / one failure. */
export function newRequestId(): string {
  return randomUUID();
}

/** Removes credentials, tokens and row values from free text an error carries. */
export function redact(text: string): string {
  return text
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s@/]*@/gi, '$1:[REDACTED]@')
    .replace(/\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))=\S+/g, '$1=[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*/g, '[REDACTED_TOKEN]')
    .replace(/\bKey \(([^)]*)\)=\((?:[^()]|\([^()]*\))*\)/g, 'Key ($1)=([REDACTED])')
    .slice(0, MAX_TEXT);
}

/** Prisma errors whose message reproduces the query arguments. */
const ARGUMENT_ECHOING_ERRORS = new Set(['PrismaClientValidationError']);

function stringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : undefined;
}

/** The SQLSTATE a Prisma 7 driver-adapter error carries, if any. */
function sqlStateOf(error: unknown): string | undefined {
  const meta = (error as { meta?: unknown } | null)?.meta;
  const adapter = (meta as { driverAdapterError?: unknown } | undefined)?.driverAdapterError;
  return stringField((adapter as { cause?: unknown } | undefined)?.cause, 'originalCode');
}

/** The loggable, redacted description of a thrown value. */
export function describeError(error: unknown): LogFields {
  if (!(error instanceof Error)) {
    return { errorName: typeof error, errorMessage: redact(String(error)) };
  }
  const name = error.constructor.name === 'Error' ? error.name : error.constructor.name;
  const omitText = ARGUMENT_ECHOING_ERRORS.has(name);
  return {
    errorName: name,
    errorCode: stringField(error, 'code'),
    sqlState: sqlStateOf(error),
    errorMessage: omitText
      ? '[omitted: this error type echoes query arguments]'
      : redact(error.message),
    errorStack: omitText || error.stack === undefined ? undefined : redact(error.stack),
  };
}

function write(level: 'error' | 'warn', event: string, fields: LogFields): void {
  const entry: Record<string, LogFieldValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) entry[key] = value;
  }
  // Fixed keys last, so a field can never overwrite them.
  entry['level'] = level;
  entry['time'] = new Date().toISOString();
  entry['event'] = event;
  console.error(JSON.stringify(entry));
}

export const logger = {
  error(event: string, fields: LogFields = {}): void {
    write('error', event, fields);
  },
  warn(event: string, fields: LogFields = {}): void {
    write('warn', event, fields);
  },
};
