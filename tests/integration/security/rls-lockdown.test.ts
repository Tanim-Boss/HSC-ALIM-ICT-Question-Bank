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
 * Functions: PostgreSQL grants EXECUTE on every function to PUBLIC, and anon /
 * authenticated inherit PUBLIC. So the suite also proves — by privilege
 * inspection AND by real call attempts as anon, authenticated and a role with
 * no grants at all (i.e. PUBLIC only) — that 0004 removed PUBLIC's EXECUTE,
 * that the owner still executes, that triggers still fire, and that functions
 * created later get no PUBLIC EXECUTE. The "before 0004" controls show the
 * exposure is real in this simulation.
 *
 * A second block checks the suite's own DATABASE_URL: every table there must
 * have RLS and no project function may be executable by PUBLIC, so a future
 * migration that forgets either fails CI.
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
/** A role with no grants of its own: what it can do, PUBLIC can do. */
const PUBLIC_ONLY = 'ict_public_only_probe';
/** Every project (non-extension) function in public after all migrations. */
const PROJECT_FUNCTIONS = [
  'ict_normalize_search_text(text)',
  'ict_search_text_of(jsonb)',
  'ict_version_search_text(jsonb,jsonb)',
  'audit_events_reject_mutation()',
  'question_versions_guard_frozen()',
  'question_version_children_guard_frozen()',
  'question_versions_guard_truncate()',
] as const;
/** A real call for each function (trigger functions are called directly: the
 *  EXECUTE check happens before PostgreSQL notices it is a trigger function). */
const CALL: Record<(typeof PROJECT_FUNCTIONS)[number], string> = {
  'ict_normalize_search_text(text)': `SELECT ict_normalize_search_text('X')`,
  'ict_search_text_of(jsonb)': `SELECT ict_search_text_of('{}'::jsonb)`,
  'ict_version_search_text(jsonb,jsonb)': `SELECT ict_version_search_text('{}'::jsonb, '[]'::jsonb)`,
  'audit_events_reject_mutation()': 'SELECT audit_events_reject_mutation()',
  'question_versions_guard_frozen()': 'SELECT question_versions_guard_frozen()',
  'question_version_children_guard_frozen()': 'SELECT question_version_children_guard_frozen()',
  'question_versions_guard_truncate()': 'SELECT question_versions_guard_truncate()',
};
const CALLERS = [...API_ROLES, PUBLIC_ONLY] as const;

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
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PUBLIC_ONLY}') THEN CREATE ROLE ${PUBLIC_ONLY} NOLOGIN; END IF;
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

  it('control: before 0004 PUBLIC, anon and authenticated CAN execute the 0003 search functions', () => {
    expect(
      psql(target, [
        '-c',
        `SELECT has_function_privilege('public', 'ict_normalize_search_text(text)', 'EXECUTE')`,
      ]).trim(),
    ).toBe('t');
    for (const role of CALLERS) {
      expect(
        psqlError(target, `SET ROLE ${role}; ${CALL['ict_normalize_search_text(text)']}`),
        `${role} should execute before 0004 — otherwise the simulation proves nothing`,
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
      // No explicit grant by name either (PUBLIC is covered by the cases below).
      const functions = psql(target, [
        '-c',
        `SELECT count(*) FROM pg_proc p, aclexplode(p.proacl) a
          WHERE p.pronamespace = 'public'::regnamespace
            AND a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated'))`,
      ]).trim();
      expect(functions).toBe('0');
    });

    it.each(PROJECT_FUNCTIONS)(
      'privilege inspection: PUBLIC, anon and authenticated have no EXECUTE on %s',
      (fn) => {
        const row = psql(target, [
          '-c',
          `SELECT has_function_privilege('public', '${fn}', 'EXECUTE')
             || ',' || has_function_privilege('anon', '${fn}', 'EXECUTE')
             || ',' || has_function_privilege('authenticated', '${fn}', 'EXECUTE')
             || ',' || has_function_privilege(current_user, '${fn}', 'EXECUTE')`,
        ]).trim();
        expect(row, 'public,anon,authenticated,owner').toBe('false,false,false,true');
      },
    );

    it.each(CALLERS.flatMap((role) => PROJECT_FUNCTIONS.map((fn) => [role, fn] as const)))(
      'execution attempt: %s calling %s is refused (permission denied)',
      (role, fn) => {
        expect(psqlError(target, `SET ROLE ${role}; ${CALL[fn]}`)).toMatch(
          /permission denied for function/,
        );
      },
    );

    it('no function in public owned by the migration owner — extension members included — is executable by PUBLIC', () => {
      expect(
        psql(target, [
          '-c',
          `SELECT coalesce(string_agg(p.oid::regprocedure::text, ', '), '') FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.proowner = current_user::regrole
              AND has_function_privilege('public', p.oid, 'EXECUTE')`,
        ]).trim(),
      ).toBe('');
    });

    it('the owner still executes the search functions, and the triggers still fire', () => {
      expect(psql(target, ['-c', `SELECT ict_normalize_search_text('  ICT  Atlas ')`]).trim()).toBe(
        'ict atlas',
      );
      const error = psqlError(
        target,
        `BEGIN;
         INSERT INTO audit_events (id, action, resource_type, resource_id)
           VALUES ('00000000-0000-4000-8000-0000000000aa', 'probe.fire', 'probe', gen_random_uuid());
         UPDATE audit_events SET action = 'probe.changed' WHERE id = '00000000-0000-4000-8000-0000000000aa';
         ROLLBACK;`,
      );
      expect(error).toMatch(/append-only/);
    });

    it('default privileges: a function the owner creates later — in public or another schema — gets no PUBLIC EXECUTE', () => {
      psql(target, [
        '-c',
        `CREATE FUNCTION fn_probe_future() RETURNS int LANGUAGE sql AS 'SELECT 1';
         CREATE SCHEMA fn_probe_schema;
         CREATE FUNCTION fn_probe_schema.fn_probe_future() RETURNS int LANGUAGE sql AS 'SELECT 1';`,
      ]);
      try {
        expect(
          psql(target, [
            '-c',
            `SELECT has_function_privilege('public', 'public.fn_probe_future()', 'EXECUTE')
               || ',' || has_function_privilege('anon', 'public.fn_probe_future()', 'EXECUTE')
               || ',' || has_function_privilege('public', 'fn_probe_schema.fn_probe_future()', 'EXECUTE')
               || ',' || has_function_privilege(current_user, 'public.fn_probe_future()', 'EXECUTE')`,
          ]).trim(),
          'public(public),anon(public),public(other schema),owner',
        ).toBe('false,false,false,true');
        for (const role of CALLERS) {
          expect(psqlError(target, `SET ROLE ${role}; SELECT public.fn_probe_future()`)).toMatch(
            /permission denied for function/,
          );
        }
      } finally {
        psql(target, [
          '-c',
          'DROP FUNCTION public.fn_probe_future(); DROP SCHEMA fn_probe_schema CASCADE;',
        ]);
      }
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

  it('no project function in public is executable by PUBLIC', () => {
    const exposed = psql(new URL(DATABASE_URL ?? ''), [
      '-c',
      `SELECT coalesce(string_agg(p.oid::regprocedure::text, ', '), '') FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass
                            AND d.objid = p.oid AND d.deptype = 'e')
          AND has_function_privilege('public', p.oid, 'EXECUTE')`,
    ]).trim();
    expect(exposed, 'functions callable by PUBLIC — REVOKE EXECUTE … FROM PUBLIC').toBe('');
  });
});
