#!/usr/bin/env bash
# =====================================================================
# READ-ONLY PostgreSQL collation profile probe — Phase 04A, task T1.
#
#   ./collation-probe.sh --out DIR --target <db>:<port> [--target ...]
#                        [--host HOST] [--user USER]
#
# WHAT IT IS FOR
#   Measure, for one or more already-migrated databases, what the database
#   default collation actually is (`pg_database`) and what collation each key
#   of the six approved hand-written indexes is actually attached to
#   (`pg_index`). It replaces a prediction with a fact.
#
# WHAT IT IS NOT
#   * It is NOT a guard. It does not compare against an approved profile and
#     it does not enforce a locale. Phase 1 is measurement-only (owner
#     authorisation A3): a measured locale of `C`, `C.utf8` or anything else
#     is a SUCCESS as long as the measurement itself was sound. OD-COLL-03
#     (the production locale) and OD-COLL-05 (the drift policy) are OPEN, so
#     there is nothing legitimate to fail against yet.
#   * It does NOT prove semantic collation integrity. It reports catalog
#     metadata. A collation OID is an identity, not a behaviour.
#   * It performs NO writes: no DDL, no DML, no SET, no temporary objects,
#     no configuration change. Every statement is a SELECT.
#
# SECURITY
#   It never prints a connection string, user name or password. It uses the
#   PGPASSWORD the workflow already exports and the psql already installed.
#   `current_user` is deliberately not collected, so the artifact carries no
#   identity data.
#
# EXIT CODES
#   0  every requested database was measured and validated
#   1  a measurement failed (see the state names below)
#   2  usage error
#
# FAILURE STATES (printed as `state=<NAME>` on the annotated error line)
#   MISSING_DATABASE          cannot connect / database absent
#   WRONG_DATABASE_IDENTITY   current_database() is not the requested name
#   UNSUPPORTED_CATALOG_FIELD a required pg_database field is absent on this
#                             server (pre-15); the server cannot be fingerprinted
#   MISSING_INDEX             an approved index does not exist
#   MALFORMED_RESULT          SQL succeeded but the output is not what this
#                             script promises (unparseable or inconsistent)
#   REFUSED_DEFAULT_DATABASE  the target is `postgres`, `template0` or
#                             `template1`; those are never the application
#                             database and measuring one would answer a
#                             question nobody asked
#
# VERSION SAFETY
#   Every field added in PostgreSQL 15 (`datlocprovider`, `daticulocale`,
#   `datcollversion`) is read through `to_jsonb(pg_database)` so that a server
#   without the column returns `false`/`null` instead of raising a parse
#   error. Absence is then reported as UNSUPPORTED_CATALOG_FIELD rather than
#   being silently treated as a NULL value.
#
# ANNOTATIONS
#   Exactly one GitHub `notice` annotation is emitted per database that passed
#   every check above, so the measured value is readable through the checks API
#   even when the job log and the artifact archive are not reachable:
#
#     ::notice title=collation profile <db>::observed CI measurement
#       (read-only, not an approval) database=<db> server=<version>
#       fingerprint=collation-fingerprint/v1;...
#
#   The message is escaped per the GitHub Actions workflow-command rules:
#   `%`->`%25`, CR->`%0D`, LF->`%0A` in the message, and additionally
#   `:`->`%3A`, `,`->`%2C` in the `title` property (properties are the part
#   before the second `::`). A value that does not look like this script's own
#   output — empty, not prefixed `collation-fingerprint/v1;`, or containing any
#   control character — is NOT annotated: the run fails closed with
#   MALFORMED_RESULT instead, so an unsafe value can never be published as if
#   it were a clean measurement, and no newline can turn into a new workflow
#   command.
#
#   The annotation is evidence, not an approval. It records what this run
#   observed; it does not compare it with anything and does not decide a locale.
#
# FINGERPRINT
#   The canonical string is the Session 15 §8.3 form, built exactly as
#   validated in Session 16 §6.3. The only clarification applied is the
#   provider word mapping (`c`→libc, `i`→icu, `b`→builtin), which Session 16
#   §8.6 C1 proposed; the raw `"char"` is preserved alongside it so nothing
#   is lost. Nothing else about the specification is changed here.
# =====================================================================
set -Eeuo pipefail

OUT="."
PSQL="${PSQL:-psql}"
HOST="${PROBE_HOST:-localhost}"
USER_NAME="${PROBE_USER:-${PGUSER:-g3}}"
TARGETS=()

# Print the header block, without hard-coding a line number that would rot.
usage() {
  sed -n '2,/^set -Eeuo pipefail/p' "${BASH_SOURCE[0]}" | sed '$d' | sed '$d' >&2
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --out)     OUT="${2:-}";        shift 2 ;;
    --target)  TARGETS+=("${2:-}"); shift 2 ;;
    --host)    HOST="${2:-}";       shift 2 ;;
    --user)    USER_NAME="${2:-}";  shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown argument: $1" >&2; usage ;;
  esac
done

[ -n "$OUT" ]            || usage
[ "${#TARGETS[@]}" -gt 0 ] || usage
command -v "$PSQL"   >/dev/null || { echo "::error::state=MALFORMED_RESULT psql not found" >&2; exit 1; }
command -v python3   >/dev/null || { echo "::error::state=MALFORMED_RESULT python3 not found" >&2; exit 1; }
mkdir -p "$OUT"

# --- SQL ------------------------------------------------------------------
# Identity: the one value that must match the requested database name.
IDENTITY_SQL="SELECT current_database();"

read -r -d '' PROFILE_SQL <<'SQL' || true
SELECT jsonb_pretty(jsonb_build_object(
  'probe',              'collation-profile/v1',
  'current_database',   current_database(),
  'server_version',     current_setting('server_version'),
  'server_version_num', current_setting('server_version_num')::int,
  'pg_major',           (current_setting('server_version_num')::int / 10000),
  'encoding',           pg_encoding_to_char(d.encoding),
  'datlocprovider',     to_jsonb(d) ->> 'datlocprovider',
  'provider_name',      CASE to_jsonb(d) ->> 'datlocprovider'
                          WHEN 'c' THEN 'libc'
                          WHEN 'i' THEN 'icu'
                          WHEN 'b' THEN 'builtin'
                          WHEN 'd' THEN 'database_default'
                          ELSE 'unknown' END,
  'datcollate',         d.datcollate,
  'datctype',           d.datctype,
  'daticulocale',       to_jsonb(d) ->> 'daticulocale',
  'datcollversion',     to_jsonb(d) ->> 'datcollversion',
  'fields_present', jsonb_build_object(
     'datlocprovider', (to_jsonb(d) ? 'datlocprovider'),
     'daticulocale',   (to_jsonb(d) ? 'daticulocale'),
     'datcollversion', (to_jsonb(d) ? 'datcollversion'))
))
FROM pg_database d
WHERE d.datname = current_database();
SQL

read -r -d '' FINGERPRINT_SQL <<'SQL' || true
SELECT 'collation-fingerprint/v1'
    || ';pg='          || (current_setting('server_version_num')::int / 10000)
    || ';enc='         || pg_encoding_to_char(d.encoding)
    || ';provider='    || CASE to_jsonb(d) ->> 'datlocprovider'
                              WHEN 'c' THEN 'libc'
                              WHEN 'i' THEN 'icu'
                              WHEN 'b' THEN 'builtin'
                              ELSE 'unknown' END
    || ';collate='     || coalesce(d.datcollate, '-')
    || ';ctype='       || coalesce(d.datctype, '-')
    || ';iculocale='   || coalesce(to_jsonb(d) ->> 'daticulocale', '-')
    || ';collversion=' || coalesce(to_jsonb(d) ->> 'datcollversion', '-')
FROM pg_database d
WHERE d.datname = current_database();
SQL

# The six approved hand-written indexes. `indcollation` and `indclass` have
# indnkeyatts entries; `indkey` has indnatts. Both are 0-based vectors, so key
# `ord` (1-based from generate_series) is `[ord - 1]`.
read -r -d '' INDEXES_SQL <<'SQL' || true
WITH approved(name) AS (VALUES
  ('uq_question_versions_one_published_per_question'),
  ('uq_question_sources_identity'),
  ('uq_topics_chapter_order'),
  ('uq_tags_name_lower'),
  ('uq_colleges_name_lower'),
  ('ix_question_assets_checksum')),
resolved AS (
  SELECT a.name, i.indexrelid, i.indrelid, i.indnkeyatts
  FROM approved a
  LEFT JOIN pg_index i ON i.indexrelid = to_regclass('public.' || quote_ident(a.name))
),
keyrows AS (
  SELECT r.name                            AS index_name,
         r.indrelid::regclass::text        AS table_name,
         (r.indexrelid IS NOT NULL)        AS exists,
         i.indisunique                     AS is_unique,
         i.indisvalid                      AS is_valid,
         i.indisready                      AS is_ready,
         i.indislive                       AS is_live,
         i.indnullsnotdistinct             AS nulls_not_distinct,
         (i.indpred IS NOT NULL)           AS has_predicate,
         pg_get_expr(i.indpred, i.indrelid) AS predicate,
         r.indnkeyatts                     AS key_count,
         k.ord                             AS key_ord,
         CASE WHEN i.indkey[k.ord - 1] = 0 THEN 'expression' ELSE 'column' END AS key_kind,
         i.indcollation[k.ord - 1]::int    AS collation_oid,
         coalesce(c.collnamespace::regnamespace::text || '.' || c.collname, '-') AS collation,
         coalesce(c.collprovider::text, '-') AS collation_provider,
         c.collisdeterministic             AS deterministic,
         coalesce(c.collcollate, '-')      AS collate,
         coalesce(c.collctype, '-')        AS ctype,
         coalesce(c.collversion, '-')      AS collversion,
         coalesce(o.opcname, '-')          AS opclass
  FROM resolved r
  LEFT JOIN pg_index   i ON i.indexrelid = r.indexrelid
  LEFT JOIN LATERAL generate_series(1, coalesce(r.indnkeyatts, 1)) k(ord) ON true
  LEFT JOIN pg_collation c ON c.oid = i.indcollation[k.ord - 1]
  LEFT JOIN pg_opclass   o ON o.oid = i.indclass[k.ord - 1]
)
SELECT jsonb_pretty(jsonb_build_object(
  'probe',          'collation-indexes/v1',
  'database',       current_database(),
  'approved_count', (SELECT count(*) FROM approved),
  'present_count',  (SELECT count(*) FROM resolved WHERE indexrelid IS NOT NULL),
  'missing',        (SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb)
                     FROM resolved WHERE indexrelid IS NULL),
  'declared_keys',  (SELECT coalesce(sum(indnkeyatts), 0) FROM resolved),
  'rows',           (SELECT coalesce(jsonb_agg(to_jsonb(keyrows) ORDER BY index_name, key_ord), '[]'::jsonb)
                     FROM keyrows)
));
SQL

# --- helpers --------------------------------------------------------------
fail_state() { printf '::error::state=%s db=%s %s\n' "$1" "$2" "$3" >&2; }

# GitHub Actions workflow-command escaping.
#   Message: `%`, CR, LF.  Property values additionally: `:`, `,`.
# `%` is escaped first, otherwise the escapes introduced below would be
# re-escaped and GitHub would decode the wrong text.
gha_escape_data() {
  local s="$1"
  s="${s//'%'/'%25'}"
  s="${s//$'\r'/'%0D'}"
  s="${s//$'\n'/'%0A'}"
  printf '%s' "$s"
}

gha_escape_property() {
  local s
  s="$(gha_escape_data "$1")"
  s="${s//':'/'%3A'}"
  s="${s//','/'%2C'}"
  printf '%s' "$s"
}

# Emit exactly one notice annotation for a database whose measurement passed
# every check. $1 db, $2 fingerprint text, $3 server version.
# Returns 1 — emitting nothing — if any value is not what this script itself
# produced, so an unsafe or ambiguous value can never be published.
emit_notice() {
  local db="$1" fp_text="$2" server="$3" msg
  [ -n "$fp_text" ] || return 1
  [ -n "$server" ]  || return 1
  [[ "$fp_text" == collation-fingerprint/v1\;* ]] || return 1
  [[ "$db" =~ ^[A-Za-z0-9_]+$ ]] || return 1
  # No control characters anywhere: a CR or LF would let the message spawn a
  # second workflow command, and nothing this script produces contains one.
  if [[ "$fp_text$server$db" == *[[:cntrl:]]* ]]; then return 1; fi
  msg="observed CI measurement (read-only, not an approval) database=${db} server=${server} fingerprint=${fp_text}"
  printf '::notice title=%s::%s\n' \
    "$(gha_escape_property "collation profile ${db}")" \
    "$(gha_escape_data "$msg")"
}

# Validate a JSON document produced above. $1 file, $2 db, $3 kind, $4 python expr
json_check() {
  local file="$1" db="$2" kind="$3" expr="$4"
  python3 - "$file" "$expr" <<'PY'
import json, sys
path, expr = sys.argv[1], sys.argv[2]
with open(path, encoding='utf-8') as fh:
    doc = json.load(fh)
if not isinstance(doc, dict):
    sys.exit('not a JSON object')
if not eval(expr, {'d': doc}):   # expression is a fixed literal from this script
    sys.exit('invariant failed: ' + expr)
PY
}

write_summary() {
  local rc="$1" file="$OUT/collation-summary.json"
  {
    printf '{\n  "probe": "collation-summary/v1",\n  "results": [\n'
    local first=1
    for entry in "${SUMMARY[@]:-}"; do
      [ -n "$entry" ] || continue
      [ "$first" = 1 ] || printf ',\n'
      printf '    %s' "$entry"
      first=0
    done
    printf '\n  ],\n  "ok": %s\n}\n' "$([ "$rc" = 0 ] && echo true || echo false)"
  } > "$file"
}

# --- main loop ------------------------------------------------------------
rc=0
SUMMARY=()

for target in "${TARGETS[@]}"; do
  db="${target%:*}"
  port="${target##*:}"
  conn_ok=1

  if [ -z "$db" ] || [ -z "$port" ] || [ "$db" = "$target" ]; then
    fail_state MALFORMED_RESULT "$target" "target must be <database>:<port>"
    SUMMARY+=("{\"database\": \"$target\", \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  case "$db" in
    postgres|template0|template1)
      fail_state REFUSED_DEFAULT_DATABASE "$db" \
        "refusing to measure a default or template database; measure the database the migration targets"
      SUMMARY+=("{\"database\": \"$db\", \"port\": $port, \"state\": \"REFUSED_DEFAULT_DATABASE\"}")
      rc=1; continue ;;
  esac

  echo "=== collation probe: database '$db' on port $port"

  # 1. identity -----------------------------------------------------------
  if ! actual="$("$PSQL" -h "$HOST" -p "$port" -U "$USER_NAME" -d "$db" \
                   -Atq -v ON_ERROR_STOP=1 -c "$IDENTITY_SQL" 2>&1)"; then
    fail_state MISSING_DATABASE "$db" "cannot connect or query: $(printf '%s' "$actual" | tail -1)"
    SUMMARY+=("{\"database\": \"$db\", \"port\": $port, \"state\": \"MISSING_DATABASE\"}")
    rc=1; continue
  fi
  if [ "$actual" != "$db" ]; then
    fail_state WRONG_DATABASE_IDENTITY "$db" "current_database() is '$actual'"
    SUMMARY+=("{\"database\": \"$db\", \"port\": $port, \"state\": \"WRONG_DATABASE_IDENTITY\"}")
    rc=1; continue
  fi

  # 2. exactly one pg_database row ---------------------------------------
  rows="$("$PSQL" -h "$HOST" -p "$port" -U "$USER_NAME" -d "$db" -Atq \
            -v ON_ERROR_STOP=1 \
            -c "SELECT count(*) FROM pg_database WHERE datname = current_database();" 2>&1)" || conn_ok=0
  if [ "$conn_ok" = 0 ] || [ "$rows" != "1" ]; then
    fail_state MALFORMED_RESULT "$db" "pg_database row count is '${rows:-?}', expected 1"
    SUMMARY+=("{\"database\": \"$db\", \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  # 3. profile ------------------------------------------------------------
  prof="$OUT/collation-profile-$db.json"
  if ! "$PSQL" -h "$HOST" -p "$port" -U "$USER_NAME" -d "$db" -Atq \
         -v ON_ERROR_STOP=1 -c "$PROFILE_SQL" > "$prof" 2>"$OUT/collation-profile-$db.err"; then
    fail_state MALFORMED_RESULT "$db" "profile query failed: $(tail -1 "$OUT/collation-profile-$db.err")"
    SUMMARY+=("{\"database\": \"$db\", \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  if ! json_check "$prof" "$db" profile \
       "d['probe'] == 'collation-profile/v1' and d['current_database'] == '$db' and isinstance(d.get('fields_present'), dict)"; then
    fail_state MALFORMED_RESULT "$db" "profile JSON is missing required keys"
    SUMMARY+=("{\"database\": \"$db\", \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  # 4. all required catalog fields present --------------------------------
  absent="$(python3 - "$prof" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
print(','.join(k for k, v in (d.get('fields_present') or {}).items() if v is not True))
PY
)"
  if [ -n "$absent" ]; then
    fail_state UNSUPPORTED_CATALOG_FIELD "$db" "field(s) absent on this server: $absent"
    SUMMARY+=("{\"database\": \"$db\", \"port\": $port, \"state\": \"UNSUPPORTED_CATALOG_FIELD\"}")
    rc=1; continue
  fi

  # 5. fingerprint --------------------------------------------------------
  fp="$OUT/collation-fingerprint-$db.txt"
  if ! "$PSQL" -h "$HOST" -p "$port" -U "$USER_NAME" -d "$db" -Atq \
         -v ON_ERROR_STOP=1 -c "$FINGERPRINT_SQL" > "$fp" 2>/dev/null; then
    fail_state MALFORMED_RESULT "$db" "fingerprint query failed"
    SUMMARY+=("{\"database\": \"$db\", \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi
  if [ ! -s "$fp" ] || ! grep -q '^collation-fingerprint/v1;' "$fp"; then
    fail_state MALFORMED_RESULT "$db" "fingerprint string is empty or malformed"
    SUMMARY+=("{\"database\": \"$db\", \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  # 6. six-index metadata -------------------------------------------------
  idx="$OUT/collation-indexes-$db.json"
  if ! "$PSQL" -h "$HOST" -p "$port" -U "$USER_NAME" -d "$db" -Atq \
         -v ON_ERROR_STOP=1 -c "$INDEXES_SQL" > "$idx" 2>"$OUT/collation-indexes-$db.err"; then
    fail_state MALFORMED_RESULT "$db" "index query failed: $(tail -1 "$OUT/collation-indexes-$db.err")"
    SUMMARY+=("{\"database\": \"$db\", \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  if ! json_check "$idx" "$db" indexes \
       "d['probe'] == 'collation-indexes/v1' and d['database'] == '$db' and isinstance(d.get('rows'), list)"; then
    fail_state MALFORMED_RESULT "$db" "index JSON is missing required keys"
    SUMMARY+=("{\"database\": \"$db\", \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  # 6a. every approved index present -------------------------------------
  missing="$(python3 - "$idx" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
print(','.join(d.get('missing') or []))
PY
)"
  if [ -n "$missing" ]; then
    fail_state MISSING_INDEX "$db" "approved index/indices absent: $missing"
    SUMMARY+=("{\"database\": \"$db\", \"port\": $port, \"state\": \"MISSING_INDEX\"}")
    rc=1; continue
  fi

  # 6b. row count equals the declared key count --------------------------
  if ! python3 - "$idx" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
rows, keys, present = d['rows'], d['declared_keys'], d['present_count']
assert len(rows) == keys, f'rows={len(rows)} declared_keys={keys}'
assert present == d['approved_count'], f'present={present} approved={d["approved_count"]}'
assert all(r['exists'] for r in rows), 'a row reports exists=false'
PY
  then
    fail_state MALFORMED_RESULT "$db" "index row count does not match declared key count"
    SUMMARY+=("{\"database\": \"$db\", \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  # 7. publish the measured value as a check-run annotation ---------------
  # Only reached after identity, row-count, profile-JSON, catalog-field,
  # fingerprint and six-index checks have all passed for this database.
  server_version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["server_version"])' "$prof")"
  if ! emit_notice "$db" "$(cat "$fp")" "$server_version"; then
    fail_state MALFORMED_RESULT "$db" \
      "refusing to annotate: fingerprint or server version is not this script's own output"
    SUMMARY+=("{\"database\": \"$db\", \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  # 8. readable report ----------------------------------------------------
  echo "--- fingerprint: $(cat "$fp")"
  python3 - "$prof" "$idx" <<'PY'
import json, sys
prof = json.load(open(sys.argv[1], encoding='utf-8'))
idx  = json.load(open(sys.argv[2], encoding='utf-8'))
def show(v): return 'NULL' if v is None else str(v)
print(f"--- server: PostgreSQL {prof['server_version']} (num {prof['server_version_num']}, major {prof['pg_major']})")
print(f"--- database: {prof['current_database']}  encoding={prof['encoding']}")
print(f"--- provider: {show(prof['datlocprovider'])} ({prof['provider_name']})")
print(f"--- datcollate={show(prof['datcollate'])}  datctype={show(prof['datctype'])}")
print(f"--- daticulocale={show(prof['daticulocale'])}  datcollversion={show(prof['datcollversion'])}")
print(f"--- tables/indexes measured: {idx['present_count']}/{idx['approved_count']}, keys={idx['declared_keys']}")
for row in idx['rows']:
    print(f"    {row['index_name']} key{row['key_ord']} "
          f"table={row['table_name']} {row['key_kind']} "
          f"collation={row['collation']} oid={row['collation_oid']} "
          f"opclass={row['opclass']} unique={row['is_unique']} "
          f"nnd={row['nulls_not_distinct']} predicate={row['has_predicate']}")
PY

  SUMMARY+=("{\"database\": \"$db\", \"port\": $port, \"state\": \"OK\", \"fingerprint\": $(python3 -c 'import json,sys;print(json.dumps(open(sys.argv[1],encoding="utf-8").read().strip()))' "$fp")}")
done

write_summary "$rc"
echo "=== summary: $OUT/collation-summary.json"
cat "$OUT/collation-summary.json"
exit "$rc"
