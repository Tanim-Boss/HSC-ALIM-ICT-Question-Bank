-- =====================================================================
-- Phase 04B — Identity, authorization & audit foundation
-- Migration 0002 (additive only; nothing in 0001 is altered or dropped)
--
-- PART A was generated with the approved Option C workflow
-- (docs/development/database-migrations.md), never with `migrate dev`:
--
--   prisma migrate diff --from-schema snapshots/prev.prisma \
--     --to-schema prisma/schema.prisma --script
--
-- where prev.prisma is the datamodel as of 0001. PART B is reviewed
-- hand-written SQL that Prisma cannot express.
--
--   PART A — Prisma-generated DDL (unmodified): enum AppRole, tables
--            profiles / user_roles / audit_events, authorship columns,
--            7 single-column foreign keys to profiles(id).
--   PART B — 7 CHECK constraints (2 of them NOT VALID) and the
--            append-only trigger on audit_events.
--
-- profiles.id is the Supabase auth.users.id. There is deliberately NO
-- foreign key into the `auth` schema: it does not exist outside Supabase
-- (CI, local PostgreSQL), and the link is validated at runtime by
-- server/auth/actor.ts.
--
-- Every new foreign key is ON DELETE RESTRICT ON UPDATE RESTRICT: profiles
-- are deactivated (is_active = false), never deleted, and an identity id
-- never changes. ON UPDATE CASCADE would also be unusable on audit_events,
-- whose rows the trigger below refuses to update.
-- =====================================================================

-- =====================================================================
-- PART A — Prisma-generated DDL
-- =====================================================================
-- CreateEnum
CREATE TYPE "AppRole" AS ENUM ('STUDENT', 'EDITOR', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN');

-- AlterTable
ALTER TABLE "question_versions" ADD COLUMN     "created_by" UUID,
ADD COLUMN     "published_at" TIMESTAMPTZ(3),
ADD COLUMN     "published_by" UUID,
ADD COLUMN     "updated_by" UUID;

-- AlterTable
ALTER TABLE "answer_keys" ADD COLUMN     "verified_by" UUID;

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role" "AppRole" NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "request_id" TEXT,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_user_roles_role" ON "user_roles"("role");

-- CreateIndex
CREATE INDEX "ix_audit_events_resource" ON "audit_events"("resource_type", "resource_id", "occurred_at");

-- CreateIndex
CREATE INDEX "ix_audit_events_actor" ON "audit_events"("actor_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "answer_keys" ADD CONSTRAINT "answer_keys_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- =====================================================================
-- PART B — hand-written constraints and trigger
-- =====================================================================

-- ── New tables: format guards ────────────────────────────────────────
ALTER TABLE profiles
  ADD CONSTRAINT ck_profiles_display_name_not_blank CHECK (btrim(display_name) <> '');

-- action is "<resource>.<verb>" in snake_case, e.g. question.publish.
ALTER TABLE audit_events
  ADD CONSTRAINT ck_audit_events_action_format
    CHECK (action ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'),
  ADD CONSTRAINT ck_audit_events_resource_type_format
    CHECK (resource_type ~ '^[a-z][a-z_]*$'),
  ADD CONSTRAINT ck_audit_events_before_object
    CHECK (before IS NULL OR jsonb_typeof(before) = 'object'),
  ADD CONSTRAINT ck_audit_events_after_object
    CHECK (after IS NULL OR jsonb_typeof(after) = 'object');

-- ── Authorship guards on 0001 tables — NOT VALID, deliberately ───────
--
-- Rows written before this migration have no author: published_by,
-- published_at and verified_by are NULL on every one of them. A PUBLISHED
-- version or a verified answer key that already exists would therefore
-- fail these checks, and a plain ADD CONSTRAINT would abort the migration
-- on any database that holds such a row (the V-2 seed does).
--
-- NOT VALID means: PostgreSQL skips the scan of existing rows, but the
-- constraint IS enforced for every INSERT and every UPDATE from now on.
-- Consequences, stated so nobody is surprised:
--   * a legacy PUBLISHED version cannot be UPDATEd while it stays PUBLISHED
--     unless published_by/published_at are filled in — which I-5 (published
--     versions are immutable) already requires of the service;
--   * archiving a legacy published version (status -> ARCHIVED) is allowed;
--   * a legacy verified answer key cannot be UPDATEd while is_verified stays
--     true unless verified_by is set — re-verification names a verifier.
-- Run ALTER TABLE ... VALIDATE CONSTRAINT once legacy rows are backfilled
-- or archived; that is a separate, later migration.
ALTER TABLE question_versions
  ADD CONSTRAINT ck_question_versions_published_has_publisher
    CHECK (status <> 'PUBLISHED' OR (published_by IS NOT NULL AND published_at IS NOT NULL))
    NOT VALID;

ALTER TABLE answer_keys
  ADD CONSTRAINT ck_answer_keys_verified_has_verifier
    CHECK (is_verified = false OR verified_by IS NOT NULL)
    NOT VALID;

-- ── audit_events is append-only ──────────────────────────────────────
--
-- Rejects UPDATE and DELETE row by row, and TRUNCATE per statement. This
-- does not bypass the service layer — it refuses a write; it never makes
-- one. A table owner can still DISABLE TRIGGER; that is an operator action
-- outside the application and is itself visible in the catalog.
CREATE FUNCTION audit_events_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege',
          HINT = 'Audit rows are never changed or removed. Write a new event instead.';
END;
$$;

CREATE TRIGGER trg_audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_reject_mutation();

CREATE TRIGGER trg_audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_reject_mutation();
