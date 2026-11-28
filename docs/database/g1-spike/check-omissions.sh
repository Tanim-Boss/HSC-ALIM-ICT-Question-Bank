#!/usr/bin/env bash
# =====================================================================
# G-1 spike — the step 3b omission invariant
#
#   bash check-omissions.sh <migrate-diff-script.sql>
#   bash check-omissions.sh --print-expected
#
# The spike datamodel deliberately omits exactly eight objects that the
# spike SQL creates (the G-1 question; G-1 is FAILED and not re-scored,
# owner decision B1a condition 2). A `prisma migrate diff` from the live
# database to that datamodel must therefore consist of EXACTLY these eight
# statements — each once, nothing else:
#
#   the five composite foreign keys C-1..C-5, each on its own table, and
#   the three support UNIQUE (id, parent_id) keys from sql/0001-schema.sql
#   (Prisma renders those as DROP INDEX).
#
# A count of eight is not enough, and neither is "nothing unexpected":
# both an empty diff and a diff with only some omissions would otherwise
# pass. This script checks every expected statement individually.
#
# Exit status (fail closed — every doubt is a failure):
#   0  exactly the eight expected statements, each exactly once
#   1  invariant violated; every problem is printed, one per line:
#        MISSING: <statement>          an expected statement is absent
#        DUPLICATE (<n>x): <statement> an expected statement occurs n > 1 times
#        UNEXPECTED: <statement>       any other statement
#        MALFORMED: <reason>           an unterminated statement
#        EMPTY: <reason>               no SQL statement at all
#   2  usage error, or the artifact does not exist / is not a readable file
#
# Parsing: blank lines and `--` comment lines between statements are
# ignored (Prisma writes a comment above each statement). A statement is
# every line up to and including the next line that ends in `;`, so a
# multi-line statement, or a second statement appended on the same line,
# can never be mistaken for an expected one. Matching is exact, after
# trailing whitespace is trimmed.
#
# This is the single implementation: run.sh step 3b calls it, and
# tests/unit/tooling/g1-omissions.test.ts runs it directly.
# =====================================================================
set -Eeuo pipefail

EXPECTED_OMISSIONS=(
  'ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_level_subject";'
  'ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_chapter_subject";'
  'ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_topic_chapter";'
  'ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_subtopic_topic";'
  'ALTER TABLE "answer_keys" DROP CONSTRAINT "fk_answer_keys_options_of_version";'
  'DROP INDEX "uq_chapters_id_subject";'
  'DROP INDEX "uq_topics_id_chapter";'
  'DROP INDEX "uq_subtopics_id_topic";'
)

usage() {
  printf 'usage: check-omissions.sh <migrate-diff-script.sql> | --print-expected\n' >&2
  exit 2
}
unreadable() {
  printf 'UNREADABLE: %s\n' "$1" >&2
  exit 2
}

[ "$#" -eq 1 ] || usage
if [ "$1" = "--print-expected" ]; then
  printf '%s\n' "${EXPECTED_OMISSIONS[@]}"
  exit 0
fi

file="$1"
[ -n "$file" ] || usage
[ -e "$file" ] || unreadable "'$file' does not exist"
[ -f "$file" ] || unreadable "'$file' is not a regular file"
[ -r "$file" ] || unreadable "'$file' is not readable"

# --- split the script into statements ---------------------------------
statements=()
pending=""
pending_start=0
lineno=0
while IFS= read -r line || [ -n "$line" ]; do
  lineno=$((lineno + 1))
  # trim trailing whitespace (an all-whitespace line becomes empty)
  line="${line%"${line##*[![:space:]]}"}"
  if [ -z "$pending" ]; then
    case "$line" in
      '') continue ;;
      *[![:space:]]*) : ;;
      *) continue ;;
    esac
    case "${line#"${line%%[![:space:]]*}"}" in
      --*) continue ;;
    esac
    pending="$line"
    pending_start=$lineno
  else
    pending="$pending"$'\n'"$line"
  fi
  case "$line" in
    *';')
      statements+=("$pending")
      pending=""
      ;;
  esac
done < "$file"

# --- classify ---------------------------------------------------------
problems=0
report() {
  printf '%s\n' "$1"
  problems=$((problems + 1))
}
oneline() { printf '%s' "$1" | tr '\n' ' ' | cut -c1-400; }

if [ -n "$pending" ]; then
  report "MALFORMED: statement starting at line $pending_start is not terminated by ';': $(oneline "$pending")"
fi

counts=()
for _ in "${EXPECTED_OMISSIONS[@]}"; do counts+=(0); done

matched=0
statement_count=${#statements[@]}
if [ "$statement_count" -gt 0 ]; then
  for statement in "${statements[@]}"; do
    hit=-1
    for i in "${!EXPECTED_OMISSIONS[@]}"; do
      if [ "$statement" = "${EXPECTED_OMISSIONS[$i]}" ]; then
        hit=$i
        break
      fi
    done
    if [ "$hit" -ge 0 ]; then
      counts[$hit]=$((counts[hit] + 1))
      matched=$((matched + 1))
    else
      report "UNEXPECTED: $(oneline "$statement")"
    fi
  done
fi

if [ "$statement_count" -eq 0 ] && [ -z "$pending" ]; then
  report "EMPTY: the diff contains no SQL statement; an empty diff cannot contain the ${#EXPECTED_OMISSIONS[@]} expected omissions"
fi

for i in "${!EXPECTED_OMISSIONS[@]}"; do
  if [ "${counts[$i]}" -eq 0 ]; then
    report "MISSING: ${EXPECTED_OMISSIONS[$i]}"
  elif [ "${counts[$i]}" -gt 1 ]; then
    report "DUPLICATE (${counts[$i]}x): ${EXPECTED_OMISSIONS[$i]}"
  fi
done

if [ "$problems" -ne 0 ]; then
  printf 'RESULT: FAIL — %d problem(s); expected exactly %d omission statements each once, found %d statement(s) of which %d matched\n' \
    "$problems" "${#EXPECTED_OMISSIONS[@]}" "$statement_count" "$matched"
  exit 1
fi
printf 'RESULT: PASS — all %d expected omissions present exactly once; no other statement\n' \
  "${#EXPECTED_OMISSIONS[@]}"
