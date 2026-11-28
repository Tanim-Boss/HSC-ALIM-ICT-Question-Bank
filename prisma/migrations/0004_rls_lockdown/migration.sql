-- =====================================================================
-- Migration 0004 — Row Level Security and Data API grant lockdown
--
-- WHY THIS EXISTS
-- ---------------
-- On Supabase, every table in `public` is exposed through the Data API
-- (PostgREST) to the `anon` and `authenticated` roles, and Supabase's
-- default privileges GRANT those roles ALL on new tables. Before this
-- migration no table had RLS and no grant was revoked, so anyone holding
-- the public anon key could read answer_keys (and every other table).
--
-- The application never uses the Data API. It talks to PostgreSQL only
-- through Prisma (lib/db.ts) as the table owner, and authorization is done
-- in server/ (docs/security/authorization.md). The Data API is therefore
-- denied completely:
--
--   PART A — ENABLE ROW LEVEL SECURITY on every table, with NO policies.
--            For any role that is not the owner (and has no BYPASSRLS),
--            no policy means no row is visible or writable. A grant made
--            by mistake later still returns zero rows.
--   PART B — REVOKE every privilege on tables, sequences and functions
--            from anon and authenticated, and the same for objects created
--            later by the migration owner (ALTER DEFAULT PRIVILEGES).
--   PART C — an assertion that no table in `public` is left without RLS.
--
-- WHAT IT DELIBERATELY DOES NOT DO
-- --------------------------------
--   * No FORCE ROW LEVEL SECURITY. The owner role (the one Prisma uses)
--     bypasses RLS on tables it owns; FORCE would make every application
--     query return nothing.
--   * No policies. A future feature that genuinely needs the Data API adds
--     narrow policies and grants in its own migration.
--   * No change to tables, columns, constraints or indexes: the 21/8/33/54
--     inventory is unchanged.
--
-- PORTABILITY
-- -----------
-- anon and authenticated exist only on Supabase. On plain PostgreSQL (CI,
-- local) PART B is skipped role by role after checking pg_roles. The owner
-- is `current_user` (whoever applies the migration), never a hard-coded
-- `postgres`. _prisma_migrations exists only when the history was applied
-- by `prisma migrate deploy` (it is absent when CI applies files with psql),
-- so it is handled by a to_regclass() check.
-- =====================================================================

-- =====================================================================
-- PART A — RLS on every table (no policies → deny-all for non-owners)
-- =====================================================================

-- Migration 0001 — question bank
ALTER TABLE "education_levels"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subjects"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "level_subjects"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chapters"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "topics"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subtopics"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "questions"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_versions"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_options"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "answer_keys"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_assets"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_version_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tags"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_tags"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "boards"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "colleges"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_years"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_sources"        ENABLE ROW LEVEL SECURITY;

-- Migration 0002 — identity, roles, audit
ALTER TABLE "profiles"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events"            ENABLE ROW LEVEL SECURITY;

-- Prisma's own history table — present only under `prisma migrate deploy`.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY';
  END IF;
END
$$;

-- =====================================================================
-- PART B — revoke Data API privileges (Supabase roles only)
-- =====================================================================
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      -- Existing objects.
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
      -- Objects the migration owner creates from now on.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
        current_user, api_role);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
        current_user, api_role);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I',
        current_user, api_role);
      RAISE NOTICE '0004: revoked public-schema privileges from %', api_role;
    ELSE
      RAISE NOTICE '0004: role % does not exist (not Supabase) — revoke skipped', api_role;
    END IF;
  END LOOP;
END
$$;

-- =====================================================================
-- PART C — assert: no table in public is left without RLS
-- =====================================================================
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO missing
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relkind IN ('r', 'p')
     AND NOT c.relrowsecurity;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '0004: row level security is not enabled on: %', missing
      USING HINT = 'Every table in public must ENABLE ROW LEVEL SECURITY (deny-all baseline).';
  END IF;
END
$$;
