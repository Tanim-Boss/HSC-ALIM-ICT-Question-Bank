-- =====================================================================
-- Migration 0005 — published content is immutable in the database
--
-- WHY THIS EXISTS
-- ---------------
-- I-5 says a published version never changes: a correction is a new
-- version (createRevision), and future exams will reference version ids.
-- Until now only the service layer enforced it, and
-- question_versions.question_id was ON DELETE CASCADE, so one DELETE on
-- questions removed every published version, option and answer key.
--
-- WHAT "FROZEN" MEANS
-- -------------------
-- A version is frozen once status <> 'DRAFT' OR published_at IS NOT NULL.
-- (The second half covers a row that was published and is somehow back to
-- DRAFT; no service does that, but the database does not trust it.)
-- A DRAFT that was never published stays fully editable and deletable.
--
-- THE LEGITIMATE WRITES TO A FROZEN VERSION
-- -----------------------------------------
-- Every write path in server/ was read (publish/gate.ts,
-- authoring/commands.ts, change-type.ts). The only writes that touch a
-- version which is, or is becoming, non-DRAFT are:
--
--   publishVersion   DRAFT → PUBLISHED: status, published_by, published_at,
--                    updated_at. OLD is DRAFT, so it is not restricted here.
--   publishVersion   ARCHIVED → PUBLISHED: the gate does not refuse an
--                    archived target, so a re-publish is reachable. Allowed:
--                    status, published_by, published_at, updated_at only.
--   archiveVersion   PUBLISHED → ARCHIVED (or DRAFT → ARCHIVED): status and
--   archiveQuestion  updated_at (Prisma's @updatedAt) only.
--
-- Nothing else writes a frozen version or its children: saveDraft and
-- verifyAnswerKey refuse non-DRAFT versions (verification happens BEFORE
-- publish, and the gate requires it); createRevision only READS the
-- published version and writes a new DRAFT; search_text is written only
-- with draft content; no service deletes a version or a question.
--
-- So, once frozen:
--   question_versions  DELETE refused. UPDATE refused unless every column
--                      other than the allowed set above is unchanged (the
--                      comparison is over the whole row as jsonb, so a
--                      column added later is frozen by default). content,
--                      question_id and version_number can never change.
--   question_options,  INSERT, UPDATE and DELETE refused (no exception was
--   answer_keys,       found). question_version_assets is included because
--   question_version_  an asset pin is part of the published content: an
--   assets             UPDATE of asset_id would swap a published image.
--   TRUNCATE           of any of those four tables is refused while a frozen
--                      version exists (TRUNCATE skips row triggers).
--   questions          question_versions_question_id_fkey becomes
--                      ON DELETE RESTRICT: a question with any version cannot
--                      be deleted. A DRAFT-only question can be deleted by
--                      deleting its drafts first.
--
-- ERRORS
-- ------
-- Every refusal raises SQLSTATE 'IA001' (custom class "IA" = ICT Atlas)
-- with CONSTRAINT set to the trigger's name, mapped by
-- server/questions/publish/db-errors.ts to PUBLISHED_VERSION_IMMUTABLE.
-- The style follows the append-only trigger on audit_events (0002): the
-- triggers only refuse writes, they never make one. A table owner can still
-- DISABLE TRIGGER; that is an operator action visible in the catalog, and is
-- how a future reviewed data migration (e.g. the published_by backfill 0002
-- anticipates) would have to run.
--
-- Inventory: no table, enum or CHECK is added; the FK is replaced by one
-- with the same name, so 21/8/33/54 is unchanged.
-- =====================================================================

-- ── question_versions ─────────────────────────────────────────────────
CREATE FUNCTION question_versions_guard_frozen() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'DRAFT' AND OLD.published_at IS NULL THEN
    -- An unpublished draft: editable and deletable.
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'question version % (status %) is published content and cannot be deleted',
      OLD.id, OLD.status
      USING ERRCODE = 'IA001',
            CONSTRAINT = 'trg_question_versions_frozen',
            HINT = 'Archive the version instead; published versions are kept forever.';
  END IF;

  -- A no-op UPDATE changes nothing and is harmless.
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;

  -- PUBLISHED → ARCHIVED (archiveVersion / archiveQuestion).
  IF OLD.status = 'PUBLISHED' AND NEW.status = 'ARCHIVED'
     AND (to_jsonb(NEW) - 'status' - 'updated_at') = (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RETURN NEW;
  END IF;

  -- ARCHIVED → PUBLISHED (publishVersion on an archived version). Content,
  -- identity and authorship stay; only the publication stamp is renewed.
  IF OLD.status = 'ARCHIVED' AND NEW.status = 'PUBLISHED'
     AND (to_jsonb(NEW) - 'status' - 'updated_at' - 'published_by' - 'published_at')
       = (to_jsonb(OLD) - 'status' - 'updated_at' - 'published_by' - 'published_at') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'question version % (status %) is published content and cannot be changed',
    OLD.id, OLD.status
    USING ERRCODE = 'IA001',
          CONSTRAINT = 'trg_question_versions_frozen',
          HINT = 'Only PUBLISHED -> ARCHIVED and ARCHIVED -> PUBLISHED are allowed. Create a revision to change content.';
END;
$$;

CREATE TRIGGER trg_question_versions_frozen
  BEFORE UPDATE OR DELETE ON question_versions
  FOR EACH ROW EXECUTE FUNCTION question_versions_guard_frozen();

-- ── children: question_options, answer_keys, question_version_assets ──
--
-- The parent row is read FOR SHARE so a concurrent publish of the same
-- version waits for this write to commit (and, under READ COMMITTED, this
-- write sees a publish that committed first). A parent that no longer
-- exists is a DRAFT being deleted with ON DELETE CASCADE: allowed.
CREATE FUNCTION question_version_children_guard_frozen() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  checked uuid[] := ARRAY[]::uuid[];
  vid uuid;
  frozen_status text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    checked := checked || OLD.version_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    checked := checked || NEW.version_id;
  END IF;

  FOREACH vid IN ARRAY checked LOOP
    SELECT v.status::text INTO frozen_status
      FROM question_versions v
     WHERE v.id = vid AND (v.status <> 'DRAFT' OR v.published_at IS NOT NULL)
       FOR SHARE;
    IF FOUND THEN
      RAISE EXCEPTION '% on %: question version % (status %) is published content and cannot be changed',
        TG_OP, TG_TABLE_NAME, vid, frozen_status
        USING ERRCODE = 'IA001',
              CONSTRAINT = 'trg_' || TG_TABLE_NAME || '_frozen',
              HINT = 'Options, answer keys and asset pins of a published or archived version are fixed. Create a revision instead.';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_question_options_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON question_options
  FOR EACH ROW EXECUTE FUNCTION question_version_children_guard_frozen();

CREATE TRIGGER trg_answer_keys_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON answer_keys
  FOR EACH ROW EXECUTE FUNCTION question_version_children_guard_frozen();

CREATE TRIGGER trg_question_version_assets_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON question_version_assets
  FOR EACH ROW EXECUTE FUNCTION question_version_children_guard_frozen();

-- ── TRUNCATE skips row triggers: refuse it while frozen content exists ─
CREATE FUNCTION question_versions_guard_truncate() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM question_versions WHERE status <> 'DRAFT' OR published_at IS NOT NULL) THEN
    RAISE EXCEPTION 'TRUNCATE of % is not allowed while published or archived versions exist',
      TG_TABLE_NAME
      USING ERRCODE = 'IA001',
            CONSTRAINT = 'trg_' || TG_TABLE_NAME || '_no_truncate',
            HINT = 'Published content is kept forever.';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_question_versions_no_truncate
  BEFORE TRUNCATE ON question_versions
  FOR EACH STATEMENT EXECUTE FUNCTION question_versions_guard_truncate();

CREATE TRIGGER trg_question_options_no_truncate
  BEFORE TRUNCATE ON question_options
  FOR EACH STATEMENT EXECUTE FUNCTION question_versions_guard_truncate();

CREATE TRIGGER trg_answer_keys_no_truncate
  BEFORE TRUNCATE ON answer_keys
  FOR EACH STATEMENT EXECUTE FUNCTION question_versions_guard_truncate();

CREATE TRIGGER trg_question_version_assets_no_truncate
  BEFORE TRUNCATE ON question_version_assets
  FOR EACH STATEMENT EXECUTE FUNCTION question_versions_guard_truncate();

-- ── question_versions.question_id: CASCADE → RESTRICT ─────────────────
--
-- One statement, so there is no moment without the constraint. ON UPDATE
-- CASCADE is kept as it was; an id change on a question with a frozen
-- version is refused by the trigger above (question_id is frozen).
-- schema.prisma carries `onDelete: Restrict` to match.
ALTER TABLE "question_versions"
  DROP CONSTRAINT "question_versions_question_id_fkey",
  ADD CONSTRAINT "question_versions_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
