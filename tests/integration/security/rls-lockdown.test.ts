/**
 * Migration 0004 — RLS and Data API grant lockdown, against real PostgreSQL.
 *
 * Supabase exposes `public` to the `anon` and `authenticated` roles through
 * the Data API, and its default privileges GRANT them ALL on every new table.
 * Plain PostgreSQL has neither role, so this suite SIMULATES Supabase on a
 * disposable database before any migration runs:
 *
 *   1. create the two roles (NOLOGIN; cluster-wide, so created only if absent);
 *   2. GRANT USAGE on public and set Supabase-style default privileges, so the
 *      tables migrations 0001–0003 create are readable by both roles;
 *   3. apply 0001–0003 and prove the exposure is REAL (anon can read
 *      answer_keys) — without this control the later "permission denied" could
 *      be an artefact of the simulation rather than the work of 0004;
 *   4. apply every later migration (0004 onwards) and prove the lockdown.
 *
 * A second block checks the suite's own DATABASE_URL: every table there must
 * have RLS, so a future migration that adds a table without it fails CI.
 *
 * Requires DATABASE_URL for a role that may CREATE DATABASE, CREATE ROLE and
 * SET ROLE (the CI service user is a superuser), and `psql` on PATH.
 */

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DATABASE_URL = process.env['DATABASE_URL'];
const hasDatabase = typeof DATABASE_URL === 'string' && DATABASE_URL.length > 0;
const describeDb = hasDatabase ? describe : describe.skip;

if (!hasDatabase) {
  console.warn('[0004] DATABASE_URL is not set — RLS lockdown integration tests were SKIPPED.');
}

const MIGRATIONS = fileURLToPath(new URL('../../../prisma/migrations/', import.meta.url));
const API_ROLES = ['anon', 'authenticated'] as const;
/** Tables the brief names explicitly; the catalog checks below cover all of them. */
const SENSITIVE_TABLES = ['answer_keys', 'question_versions', 'profiles', 'audit_events'] as const;
const LOCKDOWN = '0004_rls_lockdown';

function psql(url: URL, args: readonly string[]): string {
  return execFileSync('psql', [url.toString(), '-v', 'ON_ERROR_STOP=1', '-q', '-At', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** psql's stderr when the command fails, or null when it succeeds. */
function psqlError(url: URL, sql: string): string | null {
  try {
    psql(url, ['-c', sql]);
    return null;
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    return typeof stderr === 'string' ? stderr : String(error);
  }
}

const migrationNames = (): string[] =>
  readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

describeDb('Migration 0004 — RLS and grant lockdown on a simulated Supabase database', () => {
  const base = new URL(DATABASE_URL ?? '');
  const dbName = `m0004_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const target = new URL(base);
  target.pathname = `/${dbName}`;
  let owner = '';

  beforeAll(() => {
    // Roles are cluster-wide. Created only if absent, and never dropped: other
    // databases on the same cluster may hold grants that reference them.
    psql(base, [
      '-c',
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
       END $$`,
    ]);
    psql(base, ['-c', `CREATE DATABASE ${dbName}`]);
    owner = psql(target, ['-c', 'SELECT current_user']).trim();

    // Supabase's defaults, as the migration owner sees them.
    psql(target, [
      '-c',
      `GRANT USAGE ON SCHEMA public TO anon, authenticated;
       ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
       ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
       ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;`,
    ]);

    const names = migrationNames();
    expect(names, 'migration 0004 must be committed').toContain(LOCKDOWN);
    for (const name of names.filter((n) => n < LOCKDOWN)) {
      psql(target, ['-f', `${MIGRATIONS}${name}/migration.sql`]);
    }
  });

  afterAll(() => {
    psql(base, ['-c', `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`]);
  });

  it('control: before 0004 the simulated Data API roles CAN read answer_keys', () => {
    for (const role of API_ROLES) {
      expect(
        psqlError(target, `SET ROLE ${role}; SELECT count(*) FROM answer_keys`),
        `${role} should read answer_keys before 0004 — otherwise the simulation proves nothing`,
      ).toBeNull();
    }
  });

  describe('after 0004 and every later migration', () => {
    beforeAll(() => {
      for (const name of migrationNames().filter((n) => n >= LOCKDOWN)) {
        psql(target, ['-f', `${MIGRATIONS}${name}/migration.sql`]);
      }
    });

    it.each(API_ROLES.flatMap((role) => SENSITIVE_TABLES.map((table) => [role, table])))(
      '%s cannot SELECT from %s (permission denied)',
      (role, table) => {
        const error = psqlError(target, `SET ROLE ${role}; SELECT * FROM ${table} LIMIT 1`);
        expect(error).toMatch(/permission denied for table/);
      },
    );

    it.each(API_ROLES)('%s cannot INSERT into profiles', (role) => {
      const error = psqlError(
        target,
        `SET ROLE ${role};
         INSERT INTO profiles (id, display_name, updated_at) VALUES (gen_random_uuid(), 'x', now())`,
      );
      expect(error).toMatch(/permission denied for table/);
    });

    it('no table, sequence or function in public grants anything to anon/authenticated', () => {
      const tables = psql(target, [
        '-c',
        `SELECT count(*) FROM pg_class c, unnest(ARRAY['anon','authenticated']) AS r(role)
          WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','S','v','m')
            AND (has_table_privilege(r.role, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                 OR (c.relkind = 'S' AND has_sequence_privilege(r.role, c.oid, 'USAGE,SELECT,UPDATE')))`,
      ]).trim();
      expect(tables).toBe('0');
      // Functions keep PostgreSQL's default EXECUTE-to-PUBLIC; what 0004 removes
      // is every explicit grant to the two API roles.
      const functions = psql(target, [
        '-c',
        `SELECT count(*) FROM pg_proc p, aclexplode(p.proacl) a
          WHERE p.pronamespace = 'public'::regnamespace
            AND a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated'))`,
      ]).trim();
      expect(functions).toBe('0');
    });

    it('every table has RLS enabled, none is FORCEd, and there are no policies', () => {
      expect(
        psql(target, [
          '-c',
          `SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace
              AND relkind IN ('r','p') AND (NOT relrowsecurity OR relforcerowsecurity)`,
        ]).trim(),
      ).toBe('0');
      expect(
        psql(target, ['-c', `SELECT count(*) FROM pg_policies WHERE schemaname = 'public'`]).trim(),
      ).toBe('0');
    });

    it('default privileges: a table the owner creates later is not granted to the API roles', () => {
      psql(target, ['-c', 'CREATE TABLE rls_probe_future (id int)']);
      try {
        for (const role of API_ROLES) {
          expect(psqlError(target, `SET ROLE ${role}; SELECT * FROM rls_probe_future`)).toMatch(
            /permission denied for table/,
          );
        }
      } finally {
        psql(target, ['-c', 'DROP TABLE rls_probe_future']);
      }
    });

    it('defence in depth: even a mistaken GRANT returns zero rows, because RLS has no policy', () => {
      const id = randomUUID();
      psql(target, [
        '-c',
        `INSERT INTO profiles (id, display_name, updated_at) VALUES ('${id}', 'RLS probe', now())`,
      ]);
      try {
        const asAnon = psql(target, [
          '-c',
          `BEGIN; GRANT SELECT ON profiles TO anon; SET LOCAL ROLE anon;
           SELECT count(*) FROM profiles; ROLLBACK;`,
        ]).trim();
        expect(asAnon).toBe('0');
        expect(
          psql(target, ['-c', `SELECT count(*) FROM profiles WHERE id = '${id}'`]).trim(),
        ).toBe('1');
      } finally {
        // profiles rows are never deleted by the app, but this database is disposable.
        psql(target, ['-c', `DELETE FROM profiles WHERE id = '${id}'`]);
      }
    });

    it('the owner role still reads and writes normally (no FORCE)', () => {
      expect(owner.length).toBeGreaterThan(0);
      const out = psql(target, [
        '-c',
        `BEGIN;
         INSERT INTO tags (id, name, slug) VALUES (gen_random_uuid(), 'RLS Owner Probe', 'rls-owner-probe');
         UPDATE tags SET name = 'RLS Owner Probe 2' WHERE slug = 'rls-owner-probe';
         SELECT count(*) FROM tags WHERE slug = 'rls-owner-probe';
         ROLLBACK;`,
      ]).trim();
      expect(out).toBe('1');
    });
  });
});

describeDb('Migration 0004 — the integration database itself', () => {
  it('every table in public has row level security enabled', () => {
    const missing = psql(new URL(DATABASE_URL ?? ''), [
      '-c',
      `SELECT coalesce(string_agg(relname, ',' ORDER BY relname), '') FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p') AND NOT relrowsecurity`,
    ]).trim();
    expect(missing, 'tables without RLS — a migration forgot ENABLE ROW LEVEL SECURITY').toBe('');
  });
});
