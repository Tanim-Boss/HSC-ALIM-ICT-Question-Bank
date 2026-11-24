#!/usr/bin/env bash
# =====================================================================
# Option C / G-3 — repository guard for the migration workflow
#
#   ./repo-guard.sh [repo-root]
#
# Exit codes: 0 = clean, 1 = violation found, 2 = usage error.
#
# WHY THIS EXISTS
# ---------------
# Option C keeps five composite foreign keys (C-1..C-5) that Prisma cannot
# represent. Prisma's own tooling reads the LIVE CATALOG, does not see those
# constraints, treats them as drift, and generates a migration that DROPs them.
# G-1 proved that twice; it remains FAILED and is not remediated by G-3.
#
# Four commands are therefore prohibited for this repository:
#
#   1. prisma migrate dev
#   2. prisma migrate reset
#   3. prisma db push
#   4. prisma migrate diff --from-migrations
#
# (4) deserves a note: `migrate diff` is APPROVED in its schema-to-schema shape
# (`--from-schema X --to-schema Y`, `--from-empty`, `--from-schema-datasource`).
# Only `--from-migrations` is prohibited, because it replays migration history
# into the shadow database and then introspects it — so it reports the five
# composite FKs as drift, exactly like `migrate dev`. Measured, not assumed:
# see option-c/run.sh step 5a and prod-ready/v1/probe-diff.sh.
#
# WHAT IS SCANNED — the "executed surfaces"
# -----------------------------------------
#   * scripts/                  every *.sh, *.bash, *.js, *.mjs, *.cjs, *.ts, *.py
#   * .github/workflows/        every *.yml / *.yaml
#   * package.json              every npm script, INCLUDING indirect ones
#   * transitive local references
#                               closes "put it in a wrapper script" and
#                               "chain two wrapper scripts" bypasses
#
# WHAT IS DELIBERATELY NOT SCANNED, AND WHY
# -----------------------------------------
#   * docs/database/g1-spike/** — ARCHIVED EVIDENCE HARNESS, not delivery code.
#     experiment-2/run.sh MUST invoke `migrate dev`, and option-c/run.sh MUST
#     invoke `--from-migrations`: reproducing the unsafe behaviour is the entire
#     point of G-1 and of the Option C analysis. Scanning them would either fail
#     on the very evidence that justifies the rule, or force those harnesses to
#     be weakened. Neither is acceptable, so references INTO docs/ are not
#     followed. The workflows that call those harnesses are still scanned
#     themselves; only the reference is not expanded.
#   * Documentation (*.md) — the proposal and the READMEs must be free to
#     discuss the prohibited commands. Prose about a rule is not a violation.
#   * Test fixtures (*.test.ts, *.spec.ts) — a test for this guard MUST contain
#     the prohibited command strings; scanning it would make the guard reject
#     its own regression suite. Helper scripts elsewhere in tests/ are still
#     followed.
#   * node_modules.
#
# Comment-only lines are skipped: a comment saying "never run this" is
# documentation inside code, not an invocation. Backslash-continued logical
# lines are joined BEFORE matching, so wrapping a command over two lines is not
# an evasion. Shell chaining (&&, ||, ;, |) needs no special handling: the whole
# logical line is tested, so a prohibited command anywhere on it is caught.
#
# REQUIREMENT TRACE
# -----------------
#   3.1.1 inspect package.json scripts ............... check_package_json
#   3.1.2 direct + indirect invocation ............... check_package_json
#   3.1.3 follow local script references ............. follow_references + queue
#   3.1.4 reject via npm script ...................... check_package_json
#   3.1.5 no false rejection of approved commands .... goodrepo regression test
#   3.1.6 clear messages ............................. "file:line → command" + summary
#   3.2   --from-migrations .......................... RE_PRISMA_DIFF + flag test
# =====================================================================
set -Eeuo pipefail

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)}"
[ -d "$ROOT" ] || { echo "usage: repo-guard.sh <repo-root>" >&2; exit 2; }

# ---------------------------------------------------------------------
# Detection patterns (POSIX ERE, used with bash [[ =~ ]])
# ---------------------------------------------------------------------
_PRISMA='(^|[^[:alnum:]_./-])((npx|pnpm|yarn|bunx|bun)[[:space:]]+(exec[[:space:]]+)?)?(\./)?(node_modules/\.bin/)?prisma'

# 1-3: migrate dev | migrate reset | db push
RE_DEV_RESET_PUSH="${_PRISMA}[[:space:]]+(migrate[[:space:]]+(dev|reset)|db[[:space:]]+push)([^[:alnum:]_-]|\$)"

# 4a: the diff subcommand — always paired with the flag test below.
RE_PRISMA_DIFF="${_PRISMA}[[:space:]]+migrate[[:space:]]+diff([^[:alnum:]_-]|\$)"
# 4b: the prohibited flag, tested on the same logical line so argument order
# does not matter and `--from-migrations=<dir>` is covered.
FROM_MIGRATIONS_FLAG='--from-migrations'

# Extensions we are willing to follow a local reference INTO.
FOLLOW_EXTS='sh|bash|js|mjs|cjs|ts'

violations=0
declare -a offenders=()
declare -a scanned=()
declare -A seen_files=()
declare -A seen_scripts=()

# ---------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------
rel() { printf '%s' "${1#"$ROOT"/}"; }

report() {
  local file="$1" where="$2" cmd="$3"
  offenders+=("$(rel "$file")${where:+ $where}  →  ${cmd}")
  violations=$((violations + 1))
}

# ---------------------------------------------------------------------
# File queue — dedupe doubles as depth control
# ---------------------------------------------------------------------
declare -a file_queue=()

enqueue_file() {
  local f="$1"
  [ -f "$f" ] || return 0
  local key="${f#"$ROOT"}"
  [ -n "${seen_files["$key"]+set}" ] && return 0
  seen_files["$key"]=1
  file_queue+=("$f")
}

# ---------------------------------------------------------------------
# Core: scan one file's logical lines
# ---------------------------------------------------------------------
# Joins backslash-continued lines into a single logical line while keeping the
# starting line number, so "prisma migrate \<newline> dev" cannot slip through.
logical_lines() {
  awk '
    { if (buf == "") { start = NR }
      line = $0
      if (line ~ /\\[[:space:]]*$/) {
        sub(/\\[[:space:]]*$/, "", line)
        buf = buf line " "
        next
      }
      buf = buf line
      print start "\t" buf
      buf = ""
    }
    END { if (buf != "") print start "\t" buf }
  ' "$1" 2>/dev/null || true
}

scan_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  scanned+=("$(rel "$file")")

  local ln text trimmed
  while IFS=$'\t' read -r ln text; do
    [ -n "${text:-}" ] || continue
    trimmed="${text#"${text%%[![:space:]]*}"}"
    # Comment-only lines are documentation about a rule, not an invocation of
    # it. `#` covers shell/YAML; `//` and `*` cover JS/TS line and block
    # comments, so application source cannot be tripped by prose.
    case "$trimmed" in
      '#'*|'//'*|'*'*) continue ;;
    esac

    # Space-prefixed so a word boundary always exists at position 0.
    local probe=" $trimmed"

    if [[ $probe =~ $RE_DEV_RESET_PUSH ]]; then
      report "$file" "line $ln" "$(printf '%s' "$trimmed" | cut -c1-160)"
      continue
    fi

    if [[ $probe =~ $RE_PRISMA_DIFF ]] && [[ $probe == *"$FROM_MIGRATIONS_FLAG"* ]]; then
      report "$file" "line $ln" "$(printf '%s' "$trimmed" | cut -c1-160)"
    fi
  done < <(logical_lines "$file")

  follow_references "$file"
}

# ---------------------------------------------------------------------
# Transitive references: a wrapper that calls another wrapper must not hide
# a prohibited command. Skips docs/, node_modules/, test fixtures and *.md.
# ---------------------------------------------------------------------
follow_references() {
  local file="$1"
  local ref path

  # Only expand references FROM delivery code (`scripts/`). Workflow files are
  # scanned themselves, but their references are NOT expanded: they point at the
  # archived G-1 evidence harnesses (g1-experiment-2.yml → experiment-2/run.sh,
  # which must invoke the prohibited command), and expanding them would also drag
  # application source into a migration-surface check where it does not belong.
  case "${file#"$ROOT"/}" in
    scripts/*) : ;;
    *) return 0 ;;
  esac

  while IFS= read -r ref; do
    [ -n "$ref" ] || continue
    case "$ref" in
      *docs/*|*node_modules/*|*://*) continue ;;
      *.test.ts|*.test.tsx|*.spec.ts) continue ;;
    esac
    path="$ref"
    [[ $path == /* ]] || path="$ROOT/${path#./}"
    enqueue_file "$path"
  done < <(grep -oE "[A-Za-z0-9_][A-Za-z0-9_./-]*\.($FOLLOW_EXTS)" "$file" 2>/dev/null | sort -u || true)
}

# ---------------------------------------------------------------------
# package.json — parse the scripts, not the raw bytes
# ---------------------------------------------------------------------
# Parsing matters twice over: the raw text contains the KEY `db:migrate` and a
# message explaining the prohibition, and scanning bytes would flag a key name
# or a sentence. Only command VALUES are invocations.
# FAIL CLOSED. A guard that silently skips its own hardest surface when the
# toolchain is missing is not a control: absence of evidence would be read as
# evidence of safety. If package.json exists and cannot be parsed, the guard
# refuses to report success.
PARSE_ERROR_MARKER='__REPO_GUARD_PARSE_ERROR__'

package_scripts() {
  local pkg="$ROOT/package.json"
  [ -f "$pkg" ] || return 0
  python3 - "$pkg" <<'PY' 2>/dev/null || true
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as fh:
        data = json.load(fh)
except Exception as exc:
    print("__REPO_GUARD_PARSE_ERROR__\t" + str(exc).replace("\n", " "))
    raise SystemExit(0)
scripts = data.get("scripts") or {}
if not isinstance(scripts, dict):
    print("__REPO_GUARD_PARSE_ERROR__\t'scripts' is not an object")
    raise SystemExit(0)
for name, cmd in scripts.items():
    if isinstance(cmd, str):
        print(f"{name}\t{cmd}")
PY
}

check_package_json() {
  local pkg="$ROOT/package.json"
  [ -f "$pkg" ] || return 0
  scanned+=("package.json")
  seen_files["/package.json"]=1

  # The npm surface is only verifiable if python3 is present. Fail closed.
  if ! command -v python3 >/dev/null 2>&1; then
    echo "ERROR: package.json exists but python3 is unavailable — the npm script" >&2
    echo "       surface cannot be verified. Refusing to report success." >&2
    exit 2
  fi

  declare -A cmds=()
  local name cmd
  while IFS=$'\t' read -r name cmd; do
    [ -n "${name:-}" ] || continue
    if [ "$name" = "$PARSE_ERROR_MARKER" ]; then
      report "$pkg" "" "package.json is malformed (${cmd}) — the npm surface cannot be verified"
      return 0
    fi
    cmds["$name"]="$cmd"
  done < <(package_scripts)

  [ ${#cmds[@]} -eq 0 ] && return 0

  local -a queue=()
  for name in "${!cmds[@]}"; do queue+=("$name"); done

  while [ ${#queue[@]} -gt 0 ]; do
    local cur="${queue[0]}"
    queue=("${queue[@]:1}")
    [ -n "${seen_scripts["$cur"]+set}" ] && continue
    seen_scripts["$cur"]=1
    cmd="${cmds[$cur]:-}"
    [ -n "$cmd" ] || continue

    local probe=" $cmd"

    if [[ $probe =~ $RE_DEV_RESET_PUSH ]]; then
      report "$pkg" "scripts[\"$cur\"]" "$cmd"
      continue
    fi
    if [[ $probe =~ $RE_PRISMA_DIFF ]] && [[ $probe == *"$FROM_MIGRATIONS_FLAG"* ]]; then
      report "$pkg" "scripts[\"$cur\"]" "$cmd"
      continue
    fi

    # Indirect through another npm script.
    if [[ $probe =~ (npm|pnpm)[[:space:]]+(run|run-script)[[:space:]]+([^[:space:]]+) ]]; then
      local next="${BASH_REMATCH[3]}"
      [ -n "${cmds[$next]+set}" ] && queue+=("$next")
    elif [[ $probe =~ (^|[[:space:]])yarn[[:space:]]+(run[[:space:]]+)?([^[:space:]]+) ]]; then
      local nexty="${BASH_REMATCH[3]}"
      [ -n "${cmds[$nexty]+set}" ] && queue+=("$nexty")
    fi

    # Indirect through a local wrapper script (followed, then followed again).
    local ref path
    while IFS= read -r ref; do
      [ -n "$ref" ] || continue
      case "$ref" in
        *docs/*|*node_modules/*|*://*) continue ;;
        *.test.ts|*.test.tsx|*.spec.ts) continue ;;
      esac
      path="$ref"
      [[ $path == /* ]] || path="$ROOT/${path#./}"
      enqueue_file "$path"
    done < <(printf '%s\n' "$cmd" | grep -oE "[A-Za-z0-9_][A-Za-z0-9_./-]*\.($FOLLOW_EXTS)" | sort -u || true)
  done
}

# ---------------------------------------------------------------------
# Directly scanned surfaces
# ---------------------------------------------------------------------
scan_tree() {
  local dir="$1"; shift
  local full="$ROOT/$dir"
  [ -d "$full" ] || return 0
  local glob f
  for glob in "$@"; do
    while IFS= read -r -d '' f; do
      enqueue_file "$f"
    done < <(find "$full" -type f -name "$glob" -print0 2>/dev/null)
  done
}

check_package_json
scan_tree scripts '*.sh' '*.bash' '*.js' '*.mjs' '*.cjs' '*.ts' '*.py'
scan_tree .github/workflows '*.yml' '*.yaml'

# Drain the queue; scan_file may append to it (transitive wrappers).
while [ ${#file_queue[@]} -gt 0 ]; do
  f="${file_queue[0]}"
  file_queue=("${file_queue[@]:1}")
  scan_file "$f"
done

# ---------------------------------------------------------------------
# Verdict
# ---------------------------------------------------------------------
if [ "$violations" -gt 0 ]; then
  echo
  printf 'PROHIBITED COMMAND — %d finding(s)\n' "$violations"
  echo "-------------------------------------------------------------"
  local_i=0
  for local_i in "${!offenders[@]}"; do
    printf '  %s\n' "${offenders[$local_i]}"
  done
  echo "-------------------------------------------------------------"
  echo "Option C forbids these commands for this schema:"
  echo "  • prisma migrate dev      (reads the live catalog; generates DROPs for C-1..C-5)"
  echo "  • prisma migrate reset    (destroys history and data)"
  echo "  • prisma db push          (reads the live catalog; same failure mode)"
  echo "  • prisma migrate diff --from-migrations"
  echo "                            (replays + introspects history, so it also reports"
  echo "                             C-1..C-5 as drift — measured, see option-c/run.sh 5a)"
  echo
  echo "Use instead:  prisma migrate deploy | prisma migrate status |"
  echo "              prisma migrate diff --from-schema <prev> --to-schema <next> --script"
  echo "See docs/development/database-migrations.md."
  exit 1
fi

echo "OK: no prohibited Prisma migration command in any executed surface"
printf '    scanned %d surface(s): ' "${#scanned[@]}"
printf '%s ' "${scanned[@]}"
echo
exit 0
