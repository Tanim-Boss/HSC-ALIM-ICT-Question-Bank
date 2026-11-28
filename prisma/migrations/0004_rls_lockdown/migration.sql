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
--   PART D — REVOKE EXECUTE on every function in `public` from PUBLIC, and
--            from PUBLIC in the migration owner's default privileges, then
--            assert no project function is left executable by PUBLIC.
--
-- WHY PART D IS SEPARATE FROM PART B
-- ----------------------------------
-- PostgreSQL grants EXECUTE on every new function to PUBLIC, and anon and
-- authenticated — like every role — inherit PUBLIC's privileges. Revoking from
-- the two roles by name (PART B) removes only grants made to them by name; it
-- leaves the PUBLIC grant, so before PART D anon could still call
-- ict_normalize_search_text, ict_search_text_of, ict_version_search_text (0003),
-- the trigger functions and the pg_trgm functions through the Data API's /rpc.
-- A per-schema default (`ALTER DEFAULT PRIVILEGES … IN SCHEMA public`) cannot
-- remove that built-in PUBLIC grant — per-schema defaults only ADD to the global
-- ones — so PART D changes the owner's GLOBAL function default instead. That
-- applies to every function the migration owner creates in any schema: a
-- function meant to be callable by other roles needs an explicit GRANT.
--
-- What keeps working: the owner (the role Prisma and the migrations use)
-- holds EXECUTE on its own functions implicitly, and PostgreSQL checks EXECUTE
-- on a trigger function only when the trigger is CREATED, not when it fires —
-- so the 0002/0005 triggers still guard every role's writes. The application
-- calls none of these functions at query time (search is ILIKE through Prisma;
-- GIN operator-class support functions are not EXECUTE-checked).
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

-- =====================================================================
-- PART D — functions: no EXECUTE for PUBLIC (and so none for anon/authenticated)
-- =====================================================================
DO $$
DECLARE
  fn regprocedure;
  exposed text;
  extension_left text;
BEGIN
  -- Existing functions. A REVOKE by a role that is not the function's owner
  -- (e.g. an extension installed by another role) is a WARNING, not an error;
  -- the assertion below decides what that means.
  FOR fn IN
    SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
  END LOOP;

  -- Functions the migration owner creates from now on (global default: the
  -- only kind that can remove the built-in PUBLIC grant).
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC', current_user);

  -- Project functions (not extension members) must not be callable by PUBLIC.
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY 1)
    INTO exposed
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
     AND has_function_privilege('public', p.oid, 'EXECUTE');
  IF exposed IS NOT NULL THEN
    RAISE EXCEPTION '0004: PUBLIC can still execute: %', exposed
      USING HINT = 'Apply this migration as the owner of these functions.';
  END IF;

  -- Extension members owned by another role cannot be changed here; report them.
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY 1)
    INTO extension_left
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND has_function_privilege('public', p.oid, 'EXECUTE');
  IF extension_left IS NOT NULL THEN
    RAISE NOTICE '0004: extension functions not owned by % stay executable by PUBLIC: %',
      current_user, extension_left;
  END IF;
END
$$;
