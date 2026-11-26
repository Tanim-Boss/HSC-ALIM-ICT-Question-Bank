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
#   INVALID_TARGET_ENCODING   a --target contains bytes that are not valid
#                             UTF-8; rejected before the value can reach a
#                             log line, annotation, JSON document or psql
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

# The pure helpers below are defined at top level so the input-handling
# regression tests can source this file without running a measurement. Only
# the side-effecting sections are guarded; normal execution keeps the same
# order as before.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
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
fi

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
  # Accept every name that passed the probe's input validation (including
  # Unicode and quoted identifiers) instead of an ASCII-only allow-list. That
  # validation rejects control characters, path separators and conninfo
  # forms, and the title is escaped below, so this cannot forge a command.
  validate_db_name "$db" || return 1
  # No control characters anywhere: a CR or LF would let the message spawn a
  # second workflow command, and nothing this script produces contains one.
  if [[ "$fp_text$server$db" == *[[:cntrl:]]* ]]; then return 1; fi
  msg="observed CI measurement (read-only, not an approval) database=${db} server=${server} fingerprint=${fp_text}"
  printf '::notice title=%s::%s\n' \
    "$(gha_escape_property "collation profile ${db}")" \
    "$(gha_escape_data "$msg")"
}

# Reject byte sequences that are not well-formed UTF-8 BEFORE a raw --target
# reaches a log line, a ::error:: annotation, a JSON encoder, an artifact path
# or psql argv. Under -X utf8 Python decodes argv with surrogateescape, so an
# ill-formed byte becomes a lone surrogate (U+DC80..U+DCFF) that a strict
# UTF-8 re-encode refuses. This is a validation, not a repair: nothing is
# normalised, replaced or truncated.
validate_target_encoding() {
  python3 -X utf8 -c 'import sys; sys.argv[1].encode("utf-8")' "$1" >/dev/null 2>&1
}

# JSON-encode an untrusted string with the standard library. Used for the
# summary so a database name containing quotes, backslashes or Unicode cannot
# forge or corrupt the JSON document.
#
# ensure_ascii=False is deliberate and preserved: the documented summary and
# artifact format carries a human-readable UTF-8 identity. Escaping every
# non-ASCII byte to \uXXXX would change that output AND would not be a safe
# boundary anyway -- a lone surrogate is emitted as "\udcff", which parses as
# JSON text but is not a valid Unicode scalar value. Input validation in
# main() is the boundary; the check below is defence in depth so no caller can
# silently publish invalid bytes even if a future path bypasses it.
json_string() {
  python3 -X utf8 -c 'import json, sys
s = sys.argv[1]
try:
    s.encode("utf-8")
except UnicodeEncodeError:
    sys.exit("state=MALFORMED_RESULT refusing to JSON-encode ill-formed UTF-8")
print(json.dumps(s, ensure_ascii=False))' "$1"
}

# Validate a database name before it is used in a filesystem path or passed
# to psql -d. PostgreSQL identifiers may contain Unicode, quotes, spaces and
# punctuation; those remain valid. What is rejected is anything that could
# escape the output directory, forge a workflow command, or make psql read
# the value as a conninfo/URI connection string instead of a database name.
validate_db_name() {
  local db="$1"
  [ -n "$db" ] || return 1
  [[ "$db" != *[[:cntrl:]]* ]] || return 1
  case "$db" in
    */*|*\\*|.|..|-*|*=*|postgresql://*|postgres://*) return 1 ;;
  esac
  # Reject byte sequences that are not valid UTF-8, so both the JSON encoder
  # and the hex round-trip stay well defined instead of producing bad JSON.
  # Same shared boundary main() applies to the raw --target before anything
  # else; a raw invalid byte is not a control character, so the guard below
  # that rejects CR/LF cannot see it.
  validate_target_encoding "$db" || return 1
  # Bound the encoded filename without truncating it. PostgreSQL identifiers
  # are at most 63 bytes (NAMEDATALEN - 1); a longer name could not be a real
  # database and would risk ENAMETOOLONG after hex encoding.
  [ "$(printf '%s' "$db" | wc -c)" -le 63 ] || return 1
  return 0
}

# Deterministic, injective, path-safe component for artifact filenames: the
# lowercase hex of the name's full UTF-8 byte sequence. Nothing is truncated
# or normalised, so two distinct names can never map to one filename, and the
# only characters that reach the filesystem are [0-9a-f]. Human-readable
# identity stays inside the artifacts (profile/summary JSON), not in the path.
artifact_component() {
  local db="$1" hex
  validate_db_name "$db" || return 1
  hex="$(printf '%s' "$db" | od -An -v -tx1 | tr -d '[:space:]')" || return 1
  [ -n "$hex" ] || return 1
  [[ "$hex" =~ ^[0-9a-f]+$ ]] || return 1
  printf '%s' "$hex"
}

# Join the designated output directory, a fixed literal prefix/suffix and a
# validated hex component. The variable part can never contain a separator.
artifact_path() {
  local prefix="$1" suffix="$2" component="$3"
  [[ "$component" =~ ^[0-9a-f]+$ ]] || return 1
  printf '%s/%s-%s%s' "$OUT" "$prefix" "$component" "$suffix"
}

# Validate a JSON document produced above. $1 file, $2 db, $3 kind.
# The database name is passed as a separate argv value and compared as an
# ordinary string against a value parsed by the standard json module; it is
# never interpolated into Python source, and no expression is evaluated.
json_check() {
  local file="$1" db="$2" kind="$3"
  python3 -X utf8 - "$file" "$kind" "$db" <<'PY'
import json, sys
path, kind, expected = sys.argv[1], sys.argv[2], sys.argv[3]
if not expected:
    sys.exit('state=MALFORMED_RESULT empty expected database name')
try:
    with open(path, encoding='utf-8') as fh:
        doc = json.load(fh)
except (OSError, UnicodeError, json.JSONDecodeError) as exc:
    sys.exit('state=MALFORMED_RESULT malformed or unreadable JSON: ' + str(exc))
if not isinstance(doc, dict):
    sys.exit('state=MALFORMED_RESULT JSON document is not an object')
if kind == 'profile':
    checks = {
        'probe':            doc.get('probe') == 'collation-profile/v1',
        'current_database': doc.get('current_database') == expected,
        'fields_present':   isinstance(doc.get('fields_present'), dict),
    }
elif kind == 'indexes':
    checks = {
        'probe':    doc.get('probe') == 'collation-indexes/v1',
        'database': doc.get('database') == expected,
        'rows':     isinstance(doc.get('rows'), list),
    }
else:
    sys.exit('state=MALFORMED_RESULT unknown JSON kind: ' + kind)
failed = [name for name, ok in checks.items() if not ok]
if failed:
    sys.exit('state=MALFORMED_RESULT JSON invariant failed: ' + ','.join(failed))
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

  # Fail closed: never publish a summary that is not strict UTF-8 and valid
  # JSON. Read the BYTES first -- a lenient decoder would hide exactly the
  # defect this guard exists for. If any entry did smuggle an ill-formed byte
  # past the input boundary, delete the artifact rather than leaving evidence
  # that looks valid but cannot be decoded (Session 41 / F-3).
  if ! python3 -X utf8 - "$file" <<'PY'
import json, sys
raw = open(sys.argv[1], 'rb').read()
text = raw.decode('utf-8')
json.loads(text)
PY
  then
    rm -f "$file"
    printf '::error::state=MALFORMED_RESULT db=<invalid> refusing to publish an invalid summary artifact\n' >&2
    return 1
  fi
}

# --- main loop ------------------------------------------------------------
# Wrapped in a function only so sourcing this file for the regression tests
# defines the pure helpers without performing a measurement. Executed
# normally, main() is called immediately below with identical control flow.
main() {
rc=0
SUMMARY=()

for target in "${TARGETS[@]}"; do
  # Reject ill-formed UTF-8 in the RAW --target before it is split, logged,
  # annotated, JSON-encoded, turned into an artifact filename or passed to
  # psql. An invalid byte is not a control character, so the control-character
  # guard below cannot catch it; json_string(ensure_ascii=False) would write
  # that byte verbatim into collation-summary.json (Session 40 finding F-3).
  # The diagnostic uses a fixed placeholder, never the raw bytes.
  if ! validate_target_encoding "$target"; then
    fail_state INVALID_TARGET_ENCODING "<invalid>" \
      "target contains bytes that are not valid UTF-8"
    SUMMARY+=('{"database": "", "state": "INVALID_TARGET_ENCODING"}')
    rc=1; continue
  fi

  db="${target%:*}"
  port="${target##*:}"
  conn_ok=1

  # Control characters in the raw target must never reach a log line: CR/LF
  # could forge a second GitHub workflow command. Use a fixed placeholder.
  if [[ "$target" == *[[:cntrl:]]* ]]; then
    fail_state MALFORMED_RESULT "<invalid>" "target contains control characters"
    SUMMARY+=("{\"database\": \"\", \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  if [ -z "$db" ] || [ -z "$port" ] || [ "$db" = "$target" ]; then
    fail_state MALFORMED_RESULT "$target" "target must be <database>:<port>"
    SUMMARY+=("{\"database\": $(json_string "$target"), \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  # The port is written into the summary as a JSON number; only digits are
  # safe to interpolate there.
  if [[ ! "$port" =~ ^[0-9]+$ ]]; then
    fail_state MALFORMED_RESULT "$db" "target port is not numeric"
    SUMMARY+=("{\"database\": $(json_string "$db"), \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  # Validate and encode the database name BEFORE any path is built or any
  # artifact is created. Rejection writes nothing for this target.
  if ! key="$(artifact_component "$db")"; then
    fail_state MALFORMED_RESULT "$db" \
      "database name cannot be represented safely in an artifact path"
    SUMMARY+=("{\"database\": $(json_string "$db"), \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi
  prof="$(artifact_path collation-profile .json "$key")"
  prof_err="$(artifact_path collation-profile .err "$key")"
  fp="$(artifact_path collation-fingerprint .txt "$key")"
  idx="$(artifact_path collation-indexes .json "$key")"
  idx_err="$(artifact_path collation-indexes .err "$key")"

  case "$db" in
    postgres|template0|template1)
      fail_state REFUSED_DEFAULT_DATABASE "$db" \
        "refusing to measure a default or template database; measure the database the migration targets"
      SUMMARY+=("{\"database\": $(json_string "$db"), \"port\": $port, \"state\": \"REFUSED_DEFAULT_DATABASE\"}")
      rc=1; continue ;;
  esac

  echo "=== collation probe: database '$db' on port $port"

  # 1. identity -----------------------------------------------------------
  if ! actual="$("$PSQL" -h "$HOST" -p "$port" -U "$USER_NAME" -d "$db" \
                   -Atq -v ON_ERROR_STOP=1 -c "$IDENTITY_SQL" 2>&1)"; then
    fail_state MISSING_DATABASE "$db" "cannot connect or query: $(printf '%s' "$actual" | tail -1)"
    SUMMARY+=("{\"database\": $(json_string "$db"), \"port\": $port, \"state\": \"MISSING_DATABASE\"}")
    rc=1; continue
  fi
  if [ "$actual" != "$db" ]; then
    fail_state WRONG_DATABASE_IDENTITY "$db" "current_database() is '$actual'"
    SUMMARY+=("{\"database\": $(json_string "$db"), \"port\": $port, \"state\": \"WRONG_DATABASE_IDENTITY\"}")
    rc=1; continue
  fi

  # 2. exactly one pg_database row ---------------------------------------
  rows="$("$PSQL" -h "$HOST" -p "$port" -U "$USER_NAME" -d "$db" -Atq \
            -v ON_ERROR_STOP=1 \
            -c "SELECT count(*) FROM pg_database WHERE datname = current_database();" 2>&1)" || conn_ok=0
  if [ "$conn_ok" = 0 ] || [ "$rows" != "1" ]; then
    fail_state MALFORMED_RESULT "$db" "pg_database row count is '${rows:-?}', expected 1"
    SUMMARY+=("{\"database\": $(json_string "$db"), \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  # 3. profile ------------------------------------------------------------
  # prof/prof_err/fp/idx/idx_err come from the validated hex key above.
  if ! "$PSQL" -h "$HOST" -p "$port" -U "$USER_NAME" -d "$db" -Atq \
         -v ON_ERROR_STOP=1 -c "$PROFILE_SQL" > "$prof" 2>"$prof_err"; then
    fail_state MALFORMED_RESULT "$db" "profile query failed: $(tail -1 "$prof_err")"
    SUMMARY+=("{\"database\": $(json_string "$db"), \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  if ! json_check "$prof" "$db" profile; then
    fail_state MALFORMED_RESULT "$db" "profile JSON is missing required keys"
    SUMMARY+=("{\"database\": $(json_string "$db"), \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
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
    SUMMARY+=("{\"database\": $(json_string "$db"), \"port\": $port, \"state\": \"UNSUPPORTED_CATALOG_FIELD\"}")
    rc=1; continue
  fi

  # 5. fingerprint --------------------------------------------------------
  if ! "$PSQL" -h "$HOST" -p "$port" -U "$USER_NAME" -d "$db" -Atq \
         -v ON_ERROR_STOP=1 -c "$FINGERPRINT_SQL" > "$fp" 2>/dev/null; then
    fail_state MALFORMED_RESULT "$db" "fingerprint query failed"
    SUMMARY+=("{\"database\": $(json_string "$db"), \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi
  if [ ! -s "$fp" ] || ! grep -q '^collation-fingerprint/v1;' "$fp"; then
    fail_state MALFORMED_RESULT "$db" "fingerprint string is empty or malformed"
    SUMMARY+=("{\"database\": $(json_string "$db"), \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  # 6. six-index metadata -------------------------------------------------
  if ! "$PSQL" -h "$HOST" -p "$port" -U "$USER_NAME" -d "$db" -Atq \
         -v ON_ERROR_STOP=1 -c "$INDEXES_SQL" > "$idx" 2>"$idx_err"; then
    fail_state MALFORMED_RESULT "$db" "index query failed: $(tail -1 "$idx_err")"
    SUMMARY+=("{\"database\": $(json_string "$db"), \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  if ! json_check "$idx" "$db" indexes; then
    fail_state MALFORMED_RESULT "$db" "index JSON is missing required keys"
    SUMMARY+=("{\"database\": $(json_string "$db"), \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
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
    SUMMARY+=("{\"database\": $(json_string "$db"), \"port\": $port, \"state\": \"MISSING_INDEX\"}")
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
    SUMMARY+=("{\"database\": $(json_string "$db"), \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
    rc=1; continue
  fi

  # 7. publish the measured value as a check-run annotation ---------------
  # Only reached after identity, row-count, profile-JSON, catalog-field,
  # fingerprint and six-index checks have all passed for this database.
  server_version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["server_version"])' "$prof")"
  if ! emit_notice "$db" "$(cat "$fp")" "$server_version"; then
    fail_state MALFORMED_RESULT "$db" \
      "refusing to annotate: fingerprint or server version is not this script's own output"
    SUMMARY+=("{\"database\": $(json_string "$db"), \"port\": $port, \"state\": \"MALFORMED_RESULT\"}")
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

  SUMMARY+=("{\"database\": $(json_string "$db"), \"port\": $port, \"state\": \"OK\", \"fingerprint\": $(python3 -c 'import json,sys;print(json.dumps(open(sys.argv[1],encoding="utf-8").read().strip()))' "$fp")}")
done

write_summary "$rc"
echo "=== summary: $OUT/collation-summary.json"
cat "$OUT/collation-summary.json"
exit "$rc"
}

# Only an executed probe measures anything; sourcing stops after the helper
# definitions above.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main
fi
