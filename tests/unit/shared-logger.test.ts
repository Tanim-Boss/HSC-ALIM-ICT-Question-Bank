/**
 * server/shared/logger.ts — JSON lines on stderr, redaction, and the rule that
 * an error's own text must not smuggle secrets or query arguments into a log.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { describeError, logger, newRequestId, redact } from '@/server/shared/logger';

describe('redact', () => {
  it('removes the password from a connection string, keeping user and host', () => {
    expect(redact('connect postgresql://postgres:hunter2@db.example:6543/ict')).toBe(
      'connect postgresql://postgres:[REDACTED]@db.example:6543/ict',
    );
  });

  it('removes KEY/TOKEN/SECRET/PASSWORD assignments and JWT-shaped tokens', () => {
    const out = redact(
      'SUPABASE_SERVICE_ROLE_KEY=abc123 PDF_WORKER_TOKEN=t0k DB_PASSWORD=pw jwt eyJhbGciOi.eyJzdWIi.sig',
    );
    expect(out).not.toMatch(/abc123|t0k|=pw\b|eyJhbGciOi/);
    expect(out).toContain('SUPABASE_SERVICE_ROLE_KEY=[REDACTED]');
    expect(out).toContain('[REDACTED_TOKEN]');
  });

  it('removes the value from a PostgreSQL DETAIL "Key (...)=(...)" line', () => {
    expect(redact('Key (version_id, mcq_correct_option_key)=(1f, B) is not present')).toBe(
      'Key (version_id, mcq_correct_option_key)=([REDACTED]) is not present',
    );
  });

  it('caps very long text', () => {
    expect(redact('x'.repeat(10_000))).toHaveLength(4000);
  });
});

describe('describeError', () => {
  it('reports name, message, stack and the driver SQLSTATE', () => {
    const error = Object.assign(new Error('boom'), {
      code: 'P2039',
      meta: { driverAdapterError: { cause: { originalCode: 'IA001' } } },
    });
    expect(describeError(error)).toMatchObject({
      errorName: 'Error',
      errorCode: 'P2039',
      sqlState: 'IA001',
      errorMessage: 'boom',
      errorStack: expect.stringContaining('boom'),
    });
  });

  it('omits message and stack of a Prisma validation error, which echo the query arguments', () => {
    class PrismaClientValidationError extends Error {}
    const fields = describeError(
      new PrismaClientValidationError(
        'Argument `content`: {"text":"secret stem"} mcqCorrectOptionKey: "B"',
      ),
    );
    expect(fields['errorName']).toBe('PrismaClientValidationError');
    expect(JSON.stringify(fields)).not.toMatch(/secret stem|mcqCorrectOptionKey/);
    expect(fields['errorStack']).toBeUndefined();
  });

  it('handles a non-Error throw', () => {
    expect(describeError('postgresql://u:p@h/db')).toEqual({
      errorName: 'string',
      errorMessage: 'postgresql://u:[REDACTED]@h/db',
    });
  });
});

describe('logger', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => spy.mockRestore());

  it('writes one JSON line to stderr, dropping undefined fields', () => {
    logger.error('test.event', { requestId: 'r1', count: 2, absent: undefined });
    expect(spy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(entry).toMatchObject({ level: 'error', event: 'test.event', requestId: 'r1', count: 2 });
    expect(entry).not.toHaveProperty('absent');
    expect(Number.isNaN(Date.parse(String(entry['time'])))).toBe(false);
  });

  it('a field cannot overwrite level, time or event', () => {
    logger.warn('real.event', { level: 'debug', event: 'fake', time: 'never' });
    const entry = JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(entry).toMatchObject({ level: 'warn', event: 'real.event' });
    expect(entry['time']).not.toBe('never');
  });

  it('request ids are unique UUIDs', () => {
    const a = newRequestId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(newRequestId()).not.toBe(a);
  });
});
