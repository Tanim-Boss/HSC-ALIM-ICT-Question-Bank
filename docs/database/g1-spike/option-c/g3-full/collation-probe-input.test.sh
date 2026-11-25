#!/usr/bin/env bash
# =====================================================================
# Session 39 — input-handling regression tests for collation-probe.sh.
#
#   ./collation-probe-input.test.sh
#
# Covers the two hardened areas (JSON validation without eval, and safe
# artifact filename construction) plus the adjacent summary-JSON encoding.
# Deterministic and offline: psql is replaced by a stub in a temp directory,
# so no production, staging or even local database is contacted.
#
# Uses only bash, python3 and coreutils — the same tooling the probe already
# requires. No new dependencies and no changes to the workflow files.
# =====================================================================
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROBE="$HERE/collation-probe.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/out" "$TMP/bin"

# Sourcing defines the pure helpers (json_check, json_string,
# validate_db_name, artifact_component, artifact_path) without measuring
# anything. Set OUT afterwards for artifact_path assertions.
# shellcheck source=collation-probe.sh
source "$PROBE"
OUT="$TMP/out"

pass=0
fail=0
ok()  { printf '  PASS  %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  FAIL  %s\n' "$1" >&2; fail=$((fail + 1)); }

printf '== collation-probe input-handling regression tests ==\n\n'

# ---------------------------------------------------------------------
# JSON document builders. Values are supplied as argv to Python, never
# interpolated into Python source.
# ---------------------------------------------------------------------
profile_doc() { # $1 value for current_database (__OMIT__ to drop the key), $2 file
  python3 -X utf8 - "$1" >"$2" <<'PY'
import json, sys
doc = {
    'probe': 'collation-profile/v1',
    'server_version': '16.4',
    'server_version_num': 160004,
    'pg_major': 16,
    'encoding': 'UTF8',
    'fields_present': {
        'datlocprovider': True, 'daticulocale': True, 'datcollversion': True},
}
if sys.argv[1] != '__OMIT__':
    doc['current_database'] = sys.argv[1]
print(json.dumps(doc, ensure_ascii=False))
PY
}

indexes_doc() { # $1 value for database (__OMIT__ to drop the key), $2 file
  python3 -X utf8 - "$1" >"$2" <<'PY'
import json, sys
row = {
    'index_name': 'uq_tags_name_lower', 'key_ord': 1, 'table_name': 'tags',
    'key_kind': 'column', 'collation': 'default', 'collation_oid': 100,
    'opclass': 'text_ops', 'is_unique': True, 'nulls_not_distinct': False,
    'has_predicate': False, 'exists': True,
}
doc = {
    'probe': 'collation-indexes/v1', 'approved_count': 6, 'present_count': 6,
    'missing': [], 'declared_keys': 6, 'rows': [row],
}
if sys.argv[1] != '__OMIT__':
    doc['database'] = sys.argv[1]
print(json.dumps(doc, ensure_ascii=False))
PY
}

json_rc() { # $1 file, $2 db, $3 kind -> sets RC, writes $TMP/json.err
  if json_check "$1" "$2" "$3" >"$TMP/json.out" 2>"$TMP/json.err"; then RC=0; else RC=$?; fi
}

expect_json() { # $1 label, $2 want (0=success, 1=failure), $3 file, $4 db, $5 kind
  local label="$1" want="$2" f="$3" db="$4" kind="$5"
  json_rc "$f" "$db" "$kind"
  if { [ "$want" = 0 ] && [ "$RC" -eq 0 ]; } || \
     { [ "$want" = 1 ] && [ "$RC" -ne 0 ]; }; then
    ok "$label"
  else
    bad "$label (rc=$RC, want=$want, stderr=$(cat "$TMP/json.err"))"
  fi
}

expect_stderr() { # $1 label, $2 substring expected in last json_check stderr
  if grep -qF -- "$2" "$TMP/json.err"; then ok "$1"; else bad "$1 (missing '$2')"; fi
}
expect_no_stderr() { # $1 label, $2 substring that must NOT appear
  if grep -qF -- "$2" "$TMP/json.err"; then bad "$1 (unexpected '$2')"; else ok "$1"; fi
}

printf '%s\n' '-- JSON handling --'
D="$TMP/doc.json"

profile_doc 'g3f_main' "$D"
expect_json 'valid profile JSON, expected database name' 0 "$D" 'g3f_main' profile
expect_json 'unknown JSON kind fails closed' 1 "$D" 'g3f_main' 'unknown-kind'
expect_stderr 'unknown kind has a clear error' 'unknown JSON kind'

profile_doc 'other_database' "$D"
expect_json 'valid profile JSON, mismatching database name' 1 "$D" 'g3f_main' profile
expect_stderr 'mismatch reports the failed invariant' 'JSON invariant failed: current_database'

printf '{not json' >"$D"
expect_json 'malformed JSON fails closed' 1 "$D" 'g3f_main' profile
expect_stderr 'malformed JSON has a clear error' 'malformed or unreadable JSON'

printf '[]' >"$D"
expect_json 'JSON document that is not an object fails closed' 1 "$D" 'g3f_main' profile
expect_stderr 'non-object JSON has a clear error' 'JSON document is not an object'

profile_doc '__OMIT__' "$D"
expect_json 'missing database-name value fails closed' 1 "$D" 'g3f_main' profile

profile_doc '' "$D"
expect_json 'empty database-name value fails closed' 1 "$D" 'g3f_main' profile

printf '{"probe":"collation-profile/v1","current_database":"","fields_present":{}}' >"$D"
expect_json 'empty expected database name fails closed' 1 "$D" '' profile
expect_stderr 'empty expected name is rejected explicitly' 'empty expected database name'

QBS='db"quote\backslash'
profile_doc "$QBS" "$D"
expect_json 'quotes and backslashes in database name are plain data' 0 "$D" "$QBS" profile
expect_json 'quotes and backslashes: mismatch is still detected' 1 "$D" 'db"quote\other' profile

UNICODE='বাংলা_ডিবি_Δ'
profile_doc "$UNICODE" "$D"
expect_json 'Unicode database name is preserved' 0 "$D" "$UNICODE" profile
expect_json 'Unicode mismatch is detected' 1 "$D" 'বাংলা_ডিবি_Ω' profile

indexes_doc 'g3f_replay' "$D"
expect_json 'valid indexes JSON, expected database name' 0 "$D" 'g3f_replay' indexes
expect_json 'indexes JSON mismatch fails closed' 1 "$D" 'g3f_main' indexes
indexes_doc '__OMIT__' "$D"
expect_json 'indexes JSON missing database value fails closed' 1 "$D" 'g3f_replay' indexes
: >"$D"
expect_json 'empty JSON file fails closed' 1 "$D" 'g3f_main' profile

# Payloads that would have altered the old eval() expression. They must be
# treated as ordinary strings and must never execute Python code.
INJECT_MATCH="x' or __import__('os').system('touch PROBE_PWNED') or '"
INJECT_BYPASS="legit' or True or '"

profile_doc "$INJECT_MATCH" "$D"
expect_json 'expression-like payload is plain data (matching value)' 0 "$D" "$INJECT_MATCH" profile
expect_no_stderr 'payload is never echoed into Python source/error' "$INJECT_MATCH"
if [ -e "$TMP/PROBE_PWNED" ]; then
  bad 'expression-like payload did not execute'
  rm -f "$TMP/PROBE_PWNED"
else
  ok 'expression-like payload did not execute'
fi

profile_doc 'legit' "$D"
expect_json 'expression-like payload cannot forge a passing comparison' 1 "$D" "$INJECT_BYPASS" profile
expect_stderr 'forged comparison fails with a data-level invariant' 'JSON invariant failed: current_database'
expect_no_stderr 'forged payload is not interpolated into Python source' "$INJECT_BYPASS"

printf '\n%s\n' '-- summary JSON encoding --'
check_json_string() { # $1 label, $2 value
  local enc
  enc="$(json_string "$2")"
  if python3 -X utf8 - "$enc" "$2" <<'PY'
import json, sys
assert json.loads(sys.argv[1]) == sys.argv[2], (sys.argv[1], sys.argv[2])
PY
  then ok "$1"; else bad "$1 (encoded=$enc)"; fi
}
check_json_string 'json_string round-trips quotes/backslashes' 'db"q\z'
check_json_string 'json_string round-trips Unicode' "$UNICODE"
check_json_string 'json_string escapes control characters' "$(printf 'a\tb\nc"d\\e')"

printf '\n%s\n' '-- filename handling --'
component_rc() { # $1 db -> sets RC and COMP
  COMP=''
  if COMP="$(artifact_component "$1")"; then RC=0; else RC=$?; COMP=''; fi
}

expect_component() { # $1 label, $2 accept|reject, $3 db
  local label="$1" want="$2" db="$3" path base
  component_rc "$db"
  if [ "$want" = reject ]; then
    if [ "$RC" -ne 0 ]; then ok "$label (rejected)"; else bad "$label (should be rejected, got $COMP)"; fi
    return
  fi
  if [ "$RC" -ne 0 ] || ! [[ "$COMP" =~ ^[0-9a-f]+$ ]]; then
    bad "$label (rc=$RC, component=$COMP)"; return
  fi
  if ! python3 -X utf8 - "$COMP" "$db" <<'PY'
import sys
# Exact UTF-8 byte round-trip: no truncation and no normalisation.
assert bytes.fromhex(sys.argv[1]).decode('utf-8') == sys.argv[2]
PY
  then bad "$label (hex round-trip failed)"; return; fi
  path="$(artifact_path collation-profile .json "$COMP")"
  base="${path##*/}"
  if [[ "$path" == "$OUT/"* ]] && [ "$(dirname "$path")" = "$OUT" ] && \
     [[ "$base" =~ ^collation-profile-[0-9a-f]+\.json$ ]] && \
     [[ "$path" != *'..'* ]]; then
    ok "$label (accepted; path confined to OUT)"
  else
    bad "$label (unsafe path: $path)"
  fi
}

expect_component 'normal valid database name' accept 'g3f_main'
expect_component 'name with a dot' accept 'g3f.main'
expect_component 'name with quotes and spaces' accept 'db"q name'
expect_component 'Unicode database name' accept "$UNICODE"
expect_component 'empty name' reject ''
expect_component 'directory escape via ../' reject '../evil'
expect_component 'directory escape via ../../' reject '../../etc/passwd'
expect_component 'absolute path' reject '/etc/passwd'
expect_component 'POSIX path separator' reject 'db/sub'
expect_component 'embedded parent directory' reject 'db/../x'
expect_component 'Windows path separator' reject 'db\sub'
expect_component 'current directory' reject '.'
expect_component 'parent directory' reject '..'
expect_component 'newline in name' reject "$(printf 'db\nname')"
expect_component 'carriage return in name' reject "$(printf 'db\rname')"
expect_component 'tab in name' reject "$(printf 'db\tname')"
expect_component 'other control character in name' reject "$(printf 'db\001name')"
expect_component 'conninfo key=value form' reject 'host=elsewhere'
expect_component 'postgresql:// URI form' reject 'postgresql://elsewhere/db'
expect_component 'postgres:// URI form' reject 'postgres://elsewhere/db'
expect_component 'option-like leading dash' reject '-oops'
expect_component 'over-long name (64 bytes, no truncation)' reject "$(printf 'a%.0s' $(seq 1 64))"
expect_component 'invalid UTF-8 bytes' reject "$(printf 'db\377name')"

if artifact_path collation-profile .json '../../etc/passwd' >/dev/null 2>&1; then
  bad 'artifact_path rejects a non-hex component'
else
  ok 'artifact_path rejects a non-hex component'
fi

# Determinism and injectivity: distinct names must never share a filename.
printf '\n%s\n' '-- determinism and collisions --'
declare -a NAMES=('g3f_main' 'g3f-main' 'g3f main' 'G3F_MAIN' 'g3f_main ' 'db.name' 'db_name' "$UNICODE" "${UNICODE} ")
declare -A SEEN=()
collisions=0
for n in "${NAMES[@]}"; do
  if ! c="$(artifact_component "$n")"; then bad "collision set: unexpected rejection for '$n'"; continue; fi
  c2="$(artifact_component "$n")"
  if [ "$c" != "$c2" ]; then bad "non-deterministic component for '$n'"; fi
  if [ -n "${SEEN[$c]:-}" ]; then
    bad "filename collision: '$n' and '${SEEN[$c]}' both -> $c"
    collisions=$((collisions + 1))
  fi
  SEEN[$c]="$n"
done
if [ "$collisions" = 0 ]; then ok "all ${#NAMES[@]} distinct names map to distinct components"; fi
if c1="$(artifact_component 'a_b')" && component_rc 'a/b' && [ "$RC" -ne 0 ]; then
  ok 'sanitisation-style collision (a_b vs a/b) impossible'
else
  bad 'sanitisation-style collision check'
fi

printf '\n%s\n' '-- end-to-end with stub psql (no database) --'
cat >"$TMP/bin/psql" <<'PY'
#!/usr/bin/env python3
"""Offline psql stand-in: returns fixed catalog evidence for the probe."""
import json, os, sys
a = sys.argv[1:]
def v(flag):
    if flag in a:
        i = a.index(flag)
        if i + 1 < len(a):
            return a[i + 1]
    return ''
db = v('-d')
sql = v('-c')
if sql.strip() == 'SELECT current_database();':
    print(db)
elif 'count(*) FROM pg_database' in sql:
    print('1')
elif "'collation-profile/v1'" in sql:
    print(json.dumps({
        'probe': 'collation-profile/v1',
        'current_database': os.environ.get('STUB_PROFILE_DB', db),
        'server_version': '16.4', 'server_version_num': 160004, 'pg_major': 16,
        'encoding': 'UTF8', 'datlocprovider': 'c', 'provider_name': 'libc',
        'datcollate': 'C', 'datctype': 'C', 'daticulocale': None,
        'datcollversion': None,
        'fields_present': {'datlocprovider': True, 'daticulocale': True,
                           'datcollversion': True},
    }, ensure_ascii=False))
elif 'collation-fingerprint/v1' in sql:
    print('collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=C;'
          'ctype=C;iculocale=-;collversion=-')
elif "'collation-indexes/v1'" in sql:
    row = {
        'index_name': 'uq_tags_name_lower', 'key_ord': 1, 'table_name': 'tags',
        'key_kind': 'column', 'collation': 'default', 'collation_oid': 100,
        'opclass': 'text_ops', 'is_unique': True, 'nulls_not_distinct': False,
        'has_predicate': False, 'exists': True,
    }
    rows = [dict(row, index_name='approved_index_%d' % i) for i in range(6)]
    print(json.dumps({
        'probe': 'collation-indexes/v1', 'database': db, 'approved_count': 6,
        'present_count': 6, 'missing': [], 'declared_keys': 6, 'rows': rows,
    }, ensure_ascii=False))
else:
    sys.exit('stub psql: unexpected SQL: ' + sql[:120])
PY
chmod +x "$TMP/bin/psql"

E2E_N=0
e2e() { # $1 label, $2 db, $3 want_rc (0/1), $4... extra env assignments
  local label="$1" db="$2" want="$3"; shift 3
  E2E_N=$((E2E_N + 1))
  local out="$TMP/e2e$E2E_N" rc
  mkdir -p "$out"
  if (cd "$TMP" && env PSQL="$TMP/bin/psql" PROBE_HOST=localhost PROBE_USER=g3 "$@" \
        bash "$PROBE" --out "$out" --target "$db:5432") \
        >"$TMP/e2e.out" 2>"$TMP/e2e.err"; then rc=0; else rc=$?; fi
  E2E_OUT="$out"; E2E_RC="$rc"
  if { [ "$want" = 0 ] && [ "$rc" -eq 0 ]; } || \
     { [ "$want" = 1 ] && [ "$rc" -ne 0 ]; }; then
    ok "$label (exit $rc)"
  else
    bad "$label (exit $rc, want $want): $(tail -3 "$TMP/e2e.err")"
  fi
}

all_artifact_names_safe() { # $1 out dir
  local f b
  for f in "$1"/*; do
    [ -f "$f" ] || continue
    b="${f##*/}"
    if ! [[ "$b" =~ ^(collation-summary\.json|collation-(profile|fingerprint|indexes)-[0-9a-f]+\.(json|txt|err))$ ]]; then
      bad "unexpected/unsafe artifact filename: $b"
      return 1
    fi
  done
  return 0
}

assert_summary() { # $1 label, $2 out, $3 db, $4 expected state
  if python3 -X utf8 - "$2/collation-summary.json" "$3" "$4" <<'PY'
import json, sys
doc = json.load(open(sys.argv[1], encoding='utf-8'))
r = doc['results'][0]
assert r['database'] == sys.argv[2], (r['database'], sys.argv[2])
assert r['state'] == sys.argv[3], (r['state'], sys.argv[3])
assert doc['ok'] == (sys.argv[3] == 'OK'), doc['ok']
PY
  then ok "$1"; else bad "$1 (summary invalid or mismatched)"; fi
}

e2e 'normal database name: full measurement succeeds' 'g3f_main' 0
if [ "$E2E_RC" = 0 ]; then
  assert_summary 'summary is valid JSON with human-readable identity' "$E2E_OUT" 'g3f_main' 'OK'
  if all_artifact_names_safe "$E2E_OUT"; then ok 'all artifact names use hex components'; fi
  if [ ! -e "$E2E_OUT/collation-profile-g3f_main.json" ]; then
    ok 'raw database name is absent from artifact filenames'
  else
    bad 'raw database name still appears in an artifact filename'
  fi
  prof=''
  for candidate in "$E2E_OUT"/collation-profile-*.json; do
    if [ -f "$candidate" ]; then prof="$candidate"; break; fi
  done
  if python3 -X utf8 - "$prof" <<'PY'
import json, sys
assert json.load(open(sys.argv[1], encoding='utf-8'))['current_database'] == 'g3f_main'
PY
  then ok 'human-readable identity is preserved inside the artifact'; else bad 'profile artifact identity'; fi
fi

e2e 'Unicode database name: full measurement succeeds' "$UNICODE" 0
if [ "$E2E_RC" = 0 ]; then
  assert_summary 'Unicode identity round-trips through summary JSON' "$E2E_OUT" "$UNICODE" 'OK'
  if all_artifact_names_safe "$E2E_OUT"; then ok 'Unicode artifacts use hex components'; fi
fi

e2e 'name with quotes and spaces: summary JSON stays valid' 'db"q name' 0
if [ "$E2E_RC" = 0 ]; then
  assert_summary 'quote/space name is JSON-escaped, not interpolated' "$E2E_OUT" 'db"q name' 'OK'
fi

e2e 'expression-like payload: no Python execution, plain data' "$INJECT_MATCH" 0
if [ ! -e "$TMP/PROBE_PWNED" ]; then ok 'no side-effect file was created by the payload'; else
  bad 'payload executed a side effect'; rm -f "$TMP/PROBE_PWNED"; fi
if [ "$E2E_RC" = 0 ]; then assert_summary 'payload is JSON-escaped in the summary' "$E2E_OUT" "$INJECT_MATCH" 'OK'; fi

e2e 'mismatching profile JSON fails closed' 'g3f_main' 1 'STUB_PROFILE_DB=other_database'
if grep -qF 'state=MALFORMED_RESULT' "$TMP/e2e.err"; then ok 'mismatch reports MALFORMED_RESULT'; else
  bad 'mismatch did not report MALFORMED_RESULT'; fi
assert_summary 'failure summary is valid JSON' "$E2E_OUT" 'g3f_main' 'MALFORMED_RESULT'

e2e 'path traversal name is rejected before artifacts are written' '../evil' 1
if grep -qF 'cannot be represented safely' "$TMP/e2e.err"; then ok 'rejection reason is explicit'; else
  bad 'rejection reason missing'; fi
per_db_artifacts=0
for candidate in "$E2E_OUT"/collation-profile-* "$E2E_OUT"/collation-indexes-* "$E2E_OUT"/collation-fingerprint-*; do
  if [ -f "$candidate" ]; then per_db_artifacts=$((per_db_artifacts + 1)); fi
done
if [ "$per_db_artifacts" = 0 ]; then
  ok 'no per-database artifacts were created for the rejected name'
else
  bad "artifacts were created for a rejected name ($per_db_artifacts files)"
fi

# Control characters in the raw target must not forge a workflow command.
E2E_N=$((E2E_N + 1))
CTL_OUT="$TMP/e2e$E2E_N"
mkdir -p "$CTL_OUT"
ctl_target="$(printf 'evil\n::error::forged:5432')"
if (cd "$TMP" && env PSQL="$TMP/bin/psql" PROBE_HOST=localhost PROBE_USER=g3 \
      bash "$PROBE" --out "$CTL_OUT" --target "$ctl_target") \
      >"$TMP/ctl.out" 2>"$TMP/ctl.err"; then ctl_rc=0; else ctl_rc=$?; fi
if [ "$ctl_rc" -ne 0 ]; then ok 'control-character target is rejected'; else
  bad 'control-character target was accepted'; fi
if grep -qF '::error::forged' "$TMP/ctl.err"; then bad 'control character forged a workflow command'; else
  ok 'no workflow command was forged'; fi
if python3 -c 'import json,sys; json.load(open(sys.argv[1], encoding="utf-8"))' "$CTL_OUT/collation-summary.json" 2>/dev/null; then
  ok 'summary remains valid JSON for a rejected target'
else
  bad 'summary JSON invalid for a rejected target'
fi

printf '\n== %d passed, %d failed ==\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
