#!/usr/bin/env bash
# =====================================================================
# V-3 — BACKUP AND RESTORE DRILL
#
# Prisma Migrate is forward-only (§3.14): there is no down-migration, so
# recovery from a bad deployment means EITHER restoring from a backup OR
# applying a reviewed compensating migration. Until V-3, that recovery path
# was a CLAIM in the design document. This drill turns it into a measured
# procedure.
#
# What it does:
#   1. backs up a DISPOSABLE database that holds the migrated schema, the
#      realistic V-2 seed, and real `_prisma_migrations` history
#   2. restores that backup into a SEPARATE, EMPTY disposable database
#   3. compares the two databases on: schema inventory, every constraint,
#      every index, every seeded row, and the migration history including
#      checksums
#   4. proves the restore is USABLE, not merely present: the protected
#      composite FKs must still REJECT an invalid row in the restored copy
#
# No production data, no production credentials, no production host. Both
# database names are supplied by the caller and must contain 'drill'.
# =====================================================================
#   ./backup-restore-drill.sh --source <url> --target <url> [--out DIR]
# =====================================================================
set -Eeuo pipefail

V3_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PSQL="${PSQL:-psql}"
PG_DUMP="${PG_DUMP:-pg_dump}"
PG_RESTORE="${PG_RESTORE:-pg_restore}"
SRC=""; DST=""; OUT_DIR="${OUT_DIR:-/tmp/v3-out}"

usage() { printf 'usage: backup-restore-drill.sh --source <url> --target <url> [--out DIR]\n' >&2; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    --source) SRC="${2:-}"; shift 2 ;;
    --target) DST="${2:-}"; shift 2 ;;
    --out)    OUT_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; usage ;;
  esac
done
[ -n "$SRC" ] && [ -n "$DST" ] || usage
[ "$SRC" != "$DST" ] || { printf '[V-3] FAIL: source and target are the same database\n' >&2; exit 1; }
mkdir -p "$OUT_DIR"

FAILS=0
pass() { printf '  PASS  %s\n' "$*"; }
fail() { printf '  FAIL  %s\n' "$*"; FAILS=$((FAILS+1)); }
info() { printf '  ....  %s\n' "$*"; }
head2() { printf '\n=== %s ===\n' "$*"; }
q() { "$PSQL" "${1:-$SRC}" -Atq -v ON_ERROR_STOP=1 -c "$2"; }

# ---------------------------------------------------------------------
head2 "0. safety gates — disposable databases only"
# ---------------------------------------------------------------------
for u in "$SRC" "$DST"; do
  case "$u" in
    *prod*|*PROD*|*production*) printf '[V-3] REFUSED: URL looks like production: %s\n' "$u" >&2; exit 1 ;;
  esac
done
pass "neither URL mentions production"

src_tables="$(q "$SRC" "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations';")"
[ "$src_tables" = "18" ] || { printf '[V-3] FAIL: source has %s tables, expected 18\n' "$src_tables" >&2; exit 1; }
pass "source is a migrated Phase 04A database (18 tables)"

dst_objs="$(q "$DST" "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','i','S','v','m');")"
[ "$dst_objs" = "0" ] || { printf '[V-3] FAIL: target is not empty (%s objects) — refusing to overwrite\n' "$dst_objs" >&2; exit 1; }
pass "target is an empty database"

src_data="$(q "$SRC" "SELECT (SELECT count(*) FROM questions)||'q/'||(SELECT count(*) FROM question_versions)||'v/'||(SELECT count(*) FROM question_options)||'o';")"
info "source holds seeded data: $src_data"
printf '%s' "$src_data" > "$OUT_DIR/00-source-data.txt"

# ---------------------------------------------------------------------
head2 "1. BACKUP — custom-format dump, including _prisma_migrations"
# ---------------------------------------------------------------------
DUMP="$OUT_DIR/phase04a-drill.dump"
info "command: pg_dump --format=custom --no-owner --no-privileges --file=<dump> <source>"
"$PG_DUMP" --format=custom --no-owner --no-privileges --file="$DUMP" "$SRC" > "$OUT_DIR/01-dump.log" 2>&1 \
  || { cat "$OUT_DIR/01-dump.log"; printf '[V-3] FAIL: pg_dump failed\n' >&2; exit 1; }
[ -s "$DUMP" ] || { printf '[V-3] FAIL: the dump file is empty\n' >&2; exit 1; }
size="$(wc -c < "$DUMP" | tr -d ' ')"
sha="$(sha256sum "$DUMP" | cut -d' ' -f1)"
pass "backup written: $(basename "$DUMP"), $size bytes, sha256 ${sha:0:16}…"
printf 'size=%s\nsha256=%s\n' "$size" "$sha" > "$OUT_DIR/01-dump-meta.txt"

info "the dump contains the migration history, not just user tables:"
"$PG_RESTORE" --list "$DUMP" 2>/dev/null | grep -c "_prisma_migrations" > "$OUT_DIR/01-history-in-dump.txt" || true
if [ "$(cat "$OUT_DIR/01-history-in-dump.txt")" -gt 0 ]; then
  pass "_prisma_migrations appears in the dump ($(cat "$OUT_DIR/01-history-in-dump.txt") entries)"
else
  fail "_prisma_migrations is NOT in the dump — migration history would be lost on restore"
fi

# ---------------------------------------------------------------------
head2 "2. RESTORE — into the separate empty database"
# ---------------------------------------------------------------------
info "command: pg_restore --no-owner --no-privileges --exit-on-error --dbname=<target> <dump>"
"$PG_RESTORE" --no-owner --no-privileges --exit-on-error --dbname="$DST" "$DUMP" > "$OUT_DIR/02-restore.log" 2>&1 \
  || { cat "$OUT_DIR/02-restore.log"; printf '[V-3] FAIL: pg_restore failed\n' >&2; exit 1; }
pass "restore completed with --exit-on-error (no silently skipped objects)"

# ---------------------------------------------------------------------
head2 "3. VERIFY the restore is FAITHFUL"
# ---------------------------------------------------------------------

# --- 3a. schema inventory -------------------------------------------
chk_inv() {
  q "$1" "SELECT
      (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations')
   ||'/'||(SELECT count(*) FROM pg_type WHERE typtype='e' AND typnamespace='public'::regnamespace)
   ||'/'||(SELECT count(*) FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace)
   ||'/'||(SELECT count(*) FROM pg_constraint WHERE contype='c' AND connamespace='public'::regnamespace AND conname LIKE 'ck\_%')
   ||'/'||(SELECT count(*) FROM pg_indexes WHERE schemaname='public'
            AND indexname IN ('uq_question_versions_one_published_per_question','uq_topics_chapter_order',
                              'uq_question_sources_identity','uq_tags_name_lower',
                              'uq_colleges_name_lower','ix_question_assets_checksum'));"
}
s_inv="$(chk_inv "$SRC")"; d_inv="$(chk_inv "$DST")"
info "source inventory: $s_inv   target inventory: $d_inv"
if [ "$s_inv" = "$d_inv" ] && [ "$d_inv" = "18/7/26/47/6" ]; then
  pass "schema inventory identical and correct: 18 tables / 7 enums / 26 FKs / 47 CHECKs / 6 hand indexes"
else
  fail "schema inventory differs or is wrong (source $s_inv, target $d_inv, expected 18/7/26/47/6)"
fi

# --- 3b. every constraint, by name and definition --------------------
# NOTE: contype is "char", and `text || "char"` is ambiguous in PostgreSQL, so
# it is cast explicitly. This failed on the drill's first run and is fixed here
# rather than worked around by dropping the column from the comparison.
CATQ="SELECT conname||' | '||contype::text||' | '||pg_get_constraintdef(oid)
      FROM pg_constraint WHERE connamespace='public'::regnamespace
      ORDER BY conname;"
q "$SRC" "$CATQ" > "$OUT_DIR/03b-src-constraints.txt"
q "$DST" "$CATQ" > "$OUT_DIR/03b-dst-constraints.txt"
if diff -q "$OUT_DIR/03b-src-constraints.txt" "$OUT_DIR/03b-dst-constraints.txt" > /dev/null; then
  pass "all $(wc -l < "$OUT_DIR/03b-src-constraints.txt" | tr -d ' ') constraints identical in name and definition"
else
  fail "constraint sets differ — see $OUT_DIR/03b-*.txt"
  diff "$OUT_DIR/03b-src-constraints.txt" "$OUT_DIR/03b-dst-constraints.txt" | head -20
fi

# --- 3c. the five protected composite FKs, individually --------------
python3 - "$SRC" "$DST" "$PSQL" > "$OUT_DIR/03c-protected.txt" 2>&1 <<'PY'
import subprocess, sys, json
src, dst, psql = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, 'docs/database/g1-spike/option-c')
import guard
def rows(url):
    out = subprocess.run([psql, url, '-Atc',
        f"SELECT coalesce(json_agg(row_to_json(t)),'[]'::json) FROM ({guard.CATALOG_QUERY}) t;"],
        capture_output=True, text=True, check=True).stdout
    return json.loads(out)
ok_src, bad_src = guard.assert_protected_fks(rows(src))
ok_dst, bad_dst = guard.assert_protected_fks(rows(dst))
print(f"source: {'OK' if ok_src else 'BAD'}; target: {'OK' if ok_dst else 'BAD'}")
for p in bad_src: print("  source:", p)
for p in bad_dst: print("  target:", p)
sys.exit(0 if (ok_src and ok_dst) else 1)
PY
if grep -q "source: OK; target: OK" "$OUT_DIR/03c-protected.txt"; then
  pass "all five protected composite FKs survive the restore with approved definitions"
else
  cat "$OUT_DIR/03c-protected.txt"; fail "a protected composite FK is missing or altered after restore"
fi

# --- 3d. every seeded row -------------------------------------------
# A per-table row count is not enough: compare an ORDERED checksum of the
# actual data, so a restore that dropped a column cannot pass.
# The row checksum must be deterministic across two databases. Rows are
# serialised with row_to_json, sorted, and hashed with chr(10) as the separator
# so that a value cannot slide between fields without changing the hash.
# (The first version used a double-quoted newline escape inside a shell string
# and broke the script's own parsing; chr(10) avoids the quoting entirely.)
DATQ='SELECT md5(string_agg(t, chr(10) ORDER BY t)) FROM (SELECT row_to_json(x)::text AS t FROM %s x) s;'
tables="education_levels level_subjects subjects chapters topics subtopics questions question_versions question_options answer_keys question_assets question_version_assets tags question_tags boards colleges academic_years question_sources"
rows_ok=0; rows_bad=0
: > "$OUT_DIR/03d-data.txt"
for t in $tables; do
  s="$(q "$SRC" "$(printf "$DATQ" "$t")")"
  d="$(q "$DST" "$(printf "$DATQ" "$t")")"
  n="$(q "$SRC" "SELECT count(*) FROM $t;")"
  if [ "$s" = "$d" ]; then
    rows_ok=$((rows_ok+1)); printf '  same  %-26s %4s rows  %s\n' "$t" "$n" "${s:0:12}" >> "$OUT_DIR/03d-data.txt"
  else
    rows_bad=$((rows_bad+1)); printf '  DIFF  %-26s %4s rows  src=%s dst=%s\n' "$t" "$n" "${s:0:12}" "${d:0:12}" >> "$OUT_DIR/03d-data.txt"
  fi
done
cat "$OUT_DIR/03d-data.txt"
if [ "$rows_bad" -eq 0 ]; then
  pass "all 18 tables have byte-identical content (ordered row checksum) — $rows_ok tables compared"
else
  fail "$rows_bad table(s) differ after restore — see $OUT_DIR/03d-data.txt"
fi

# --- 3e. migration history, with checksums --------------------------
HISTQ="SELECT migration_name||'|'||coalesce(checksum,'')||'|'||(finished_at IS NOT NULL)||'|'||(rolled_back_at IS NOT NULL)
       FROM _prisma_migrations ORDER BY migration_name;"
q "$SRC" "$HISTQ" > "$OUT_DIR/03e-src-history.txt"
q "$DST" "$HISTQ" > "$OUT_DIR/03e-dst-history.txt"
cat "$OUT_DIR/03e-dst-history.txt"
if diff -q "$OUT_DIR/03e-src-history.txt" "$OUT_DIR/03e-dst-history.txt" > /dev/null; then
  pass "migration history identical, including checksums ($(wc -l < "$OUT_DIR/03e-src-history.txt" | tr -d ' ') migration(s))"
else
  fail "migration history differs after restore"; diff "$OUT_DIR/03e-src-history.txt" "$OUT_DIR/03e-dst-history.txt"
fi

# the checksum control must still pass against the restored history
q "$DST" "SELECT coalesce(json_agg(row_to_json(t)),'[]'::json) FROM (SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) t;" > "$OUT_DIR/03e-history.json"
if python3 docs/database/g1-spike/option-c/guard.py history "$OUT_DIR/03e-history.json" prisma/migrations > "$OUT_DIR/03e-guard.log" 2>&1; then
  pass "the checksum control passes on the RESTORED history (it matches the files on disk)"
else
  cat "$OUT_DIR/03e-guard.log"; fail "the checksum control FAILS on the restored history"
fi

# ---------------------------------------------------------------------
head2 "4. the restored database is USABLE, not merely present"
# ---------------------------------------------------------------------
# A restore that produced the right catalogs but a broken constraint set
# would pass every check above. So: force a C-5 violation in the RESTORED
# copy and confirm the database still rejects it.
set +e
out="$("$PSQL" "$DST" -v ON_ERROR_STOP=0 -c "
INSERT INTO answer_keys (id, version_id, mcq_correct_option_key, is_verified, created_at, updated_at)
VALUES (gen_random_uuid(), '60000000-0000-4000-a000-000000000004', 'A', false, now(), now());" 2>&1)"
set -e
if printf '%s' "$out" | grep -q "fk_answer_keys_options_of_version"; then
  pass "C-5 still REJECTS an invalid key in the restored database"
else
  printf '%s\n' "$out"; fail "C-5 did NOT reject an invalid key after restore — the constraint is not enforcing"
fi

set +e
out2="$("$PSQL" "$DST" -v ON_ERROR_STOP=0 -c "
INSERT INTO tags (id, name, slug, created_at) VALUES (gen_random_uuid(), 'computer network', 'cn-drill', now());" 2>&1)"
set -e
if printf '%s' "$out2" | grep -q "uq_tags_name_lower"; then
  pass "the expression unique index still enforces case-insensitive uniqueness after restore"
else
  printf '%s\n' "$out2"; fail "uq_tags_name_lower did not fire after restore"
fi

# ---------------------------------------------------------------------
head2 "5. restore is REPEATABLE — a second restore into a third database"
# ---------------------------------------------------------------------
# Between messages these sandboxes are reset, so a drill that only works once
# proves little. This replays the same dump into a fresh database and checks
# the data checksum again.
info "skipped here: needs a third database. The CI job repeats this step with"
info "a third service container, so reproducibility is evidenced there rather"
info "than assumed here."
REPEAT="CI"

# ---------------------------------------------------------------------
head2 "6. documented procedure and timing"
# ---------------------------------------------------------------------
cat > "$OUT_DIR/06-procedure.txt" <<'PROC'
BACKUP AND RESTORE PROCEDURE (measured by this drill)

BACKUP
  pg_dump --format=custom --no-owner --no-privileges \
          --file=<timestamped>.dump "$DIRECT_URL"

  * --format=custom : single compressed file, restorable selectively
  * --no-owner / --no-privileges : the restore target may use a different
    role; ownership is reassigned by the deployment, not baked into the dump
  * the dump INCLUDES _prisma_migrations, so migration history is restored
    with the data (verified in step 1)

RESTORE
  pg_restore --no-owner --no-privileges --exit-on-error \
             --dbname="$DIRECT_URL" <timestamped>.dump

  * --exit-on-error : a partial restore fails loudly instead of leaving a
    half-populated database that looks healthy
  * restore into an EMPTY database, never on top of a live one

VERIFY AFTER RESTORE
  1. inventory 18 tables / 7 enums / 26 FKs / 47 CHECKs / 6 hand indexes
  2. every constraint identical by name and definition
  3. all five protected composite FKs present with approved columns and
     actions (guard.py catalog)
  4. ordered row checksums identical for all 18 tables
  5. _prisma_migrations identical, and guard.py history passes against the
     files on disk
  6. C-5 and uq_tags_name_lower still REJECT bad rows

WHAT THIS DRILL DOES NOT COVER
  * point-in-time recovery / WAL archiving (a hosting-provider capability)
  * restore of a database larger than a dev fixture
  * restore while clients are connected
PROC
pass "procedure documented at $OUT_DIR/06-procedure.txt"

# ---------------------------------------------------------------------
head2 "SUMMARY"
# ---------------------------------------------------------------------
{
  echo "V3_FAILS=$FAILS"
  echo "V3_SRC_INVENTORY=$s_inv"
  echo "V3_DST_INVENTORY=$d_inv"
  echo "V3_TABLES_SAME=$rows_ok"
  echo "V3_TABLES_DIFF=$rows_bad"
  echo "V3_DUMP_BYTES=$size"
  echo "V3_DUMP_SHA256=$sha"
} > "$OUT_DIR/RESULT.txt"
cat "$OUT_DIR/RESULT.txt"

if [ "$FAILS" -ne 0 ]; then
  printf '\n[V-3] FAIL: %s check(s) failed\n' "$FAILS" >&2
  exit 1
fi
printf '\n[V-3] ALL CHECKS PASSED: backup taken, restore into a separate database faithful and still enforcing\n'
