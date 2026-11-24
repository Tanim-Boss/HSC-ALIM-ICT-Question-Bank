#!/usr/bin/env bash
#
# OD-26-5 — generate the durable milestone evidence record for ONE workflow run.
#
# WHY THIS EXISTS
#
# The owner approved 12 months of audit evidence (OD-26-5). This repository is
# PUBLIC, and GitHub caps Actions artifact retention at 90 days for public
# repositories (1-90 days; 1-400 only for private/internal). A 365-day
#   retention-days would fail the upload, so artifacts CANNOT carry the 12 months.
#
# The honest split, which this script exists to make explicit:
#
#   artifact        90 days   platform maximum, not a policy choice
#   this record     indefinite — it is a small text file, committed to git, and
#                   git history is what keeps it for 12 months and beyond
#
# So this record is not a convenience. For months 4-12 it is the ONLY surviving
# evidence, which is exactly why it must name the run precisely enough that a
# reader can reconstruct what happened even after the run itself, its logs and
# its artifacts are gone.
#
# WHAT IT DOES NOT DO
#
#   * it does not claim 12-month artifact retention anywhere;
#   * it does not push, commit or rewrite anything — it writes one file, and a
#     human commits it at the milestone;
#   * it does not invent a synthetic merge SHA when the event has none.
#
# Usage: build-milestone-record.sh <output-path> [suite-log ...]
# Requires the usual GitHub Actions GITHUB_* environment.

set -euo pipefail

OUT="${1:?usage: build-milestone-record.sh <output-path> [suite-log ...]}"
shift || true
LOGS=("$@")

# ── Environment identity ─────────────────────────────────────────────────────
# Resolved rather than assumed: an unset variable must read as "unknown", never
# silently default to something that looks like a real value.
unknown() { printf '%s' "${1:-unknown}"; }

WORKFLOW_NAME="$(unknown "${GITHUB_WORKFLOW:-}")"
WORKFLOW_REF="$(unknown "${GITHUB_WORKFLOW_REF:-}")"
RUN_ID="$(unknown "${GITHUB_RUN_ID:-}")"
RUN_ATTEMPT="$(unknown "${GITHUB_RUN_ATTEMPT:-}")"
RUN_NUMBER="$(unknown "${GITHUB_RUN_NUMBER:-}")"
SERVER_URL="$(unknown "${GITHUB_SERVER_URL:-}")"
REPOSITORY="$(unknown "${GITHUB_REPOSITORY:-}")"
EVENT_NAME="$(unknown "${GITHUB_EVENT_NAME:-}")"
REF_NAME="$(unknown "${GITHUB_REF_NAME:-}")"
REF_TYPE="$(unknown "${GITHUB_REF_TYPE:-}")"

if [ "${SERVER_URL}" = "unknown" ] || [ "${REPOSITORY}" = "unknown" ] || [ "${RUN_ID}" = "unknown" ]; then
  RUN_URL="unknown (run identity unavailable in this environment)"
else
  RUN_URL="${SERVER_URL}/${REPOSITORY}/actions/runs/${RUN_ID}"
fi

# ── Commit identity ──────────────────────────────────────────────────────────
# On a pull_request event GITHUB_SHA is GitHub's SYNTHETIC merge commit, not the
# branch commit. Naming it as the code that ran is the exact defect that was
# fixed in the PR comment, so it is labelled here too and never presented as a
# real commit on the branch.
MERGE_SHA="${GITHUB_SHA:-unknown}"
BRANCH_SHA="${GITHUB_PR_HEAD_SHA:-${GITHUB_EVENT_PULL_REQUEST_HEAD_SHA:-}}"
if [ -z "${BRANCH_SHA}" ]; then
  if [ "${EVENT_NAME:-}" = "pull_request" ] || [ "${EVENT_NAME:-}" = "pull_request_target" ]; then
    BRANCH_SHA="unknown (not supplied by this event)"
  else
    BRANCH_SHA="${MERGE_SHA}"
  fi
fi

# ── Database identity ────────────────────────────────────────────────────────
PG_IMAGE="$(unknown "${PG_IMAGE:-}")"
DATABASE_URL_ENV="${DATABASE_URL:-}"
if [ -z "${DATABASE_URL_ENV}" ]; then
  DB_IDENTITY="not configured for this job"
else
  # Never write the password into a committed file. Host/db/user only.
  DB_IDENTITY="$(printf '%s' "${DATABASE_URL_ENV}" | sed -E 's#^([a-z]+)://([^:]+):[^@]*@#\1://\2@#')"
fi

# ── Suite results, read from the logs that were passed in ────────────────────
# Counts are parsed from real vitest output. If a log is absent the field says
# so; it is never guessed and never carries forward a previous run's number.
suite_rows() {
  if [ "${#LOGS[@]}" -eq 0 ]; then
    printf '| none supplied | — | — |\n'
    return
  fi
  local log clean passed failed files
  for log in "${LOGS[@]}"; do
    if [ ! -f "${log}" ]; then
      printf '| `%s` | log not available | — |\n' "$(basename "${log}")"
      continue
    fi
    clean="$(sed 's/\x1b\[[0-9;]*m//g' "${log}" | tr -d '\r')"
    passed="$(printf '%s' "${clean}" | grep -oE 'Tests +[0-9]+ passed' | grep -oE '[0-9]+' | head -1)"
    failed="$(printf '%s' "${clean}" | grep -oE 'Tests +.*[0-9]+ failed' | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' | head -1)"
    files="$(printf '%s' "${clean}" | grep -oE 'Test Files +[0-9]+ passed' | grep -oE '[0-9]+' | head -1)"
    printf '| `%s` | %s | %s |\n' \
      "$(basename "${log}")" "${passed:-<unread>}" "${failed:-0}"
    if [ -n "${files:-}" ]; then
      printf '| ↳ test files | %s passed | |\n' "${files}"
    fi
  done
}

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > "${OUT}" <<EOF
<!-- od-26-5-milestone-evidence -->
# Milestone evidence record — run ${RUN_ID} (attempt ${RUN_ATTEMPT})

This file is DURABLE, COMMITTED EVIDENCE for one CI run. It exists because
artifact retention (90 days, the platform maximum for a public repository)
cannot satisfy the owner-approved 12-month audit window (OD-26-5). For months
4–12 this record — not the artifact — is the surviving evidence.

**It does not claim 12-month artifact retention. No such retention is
implemented, and none is possible on a public repository.**

## Run identity

| Field | Value |
|---|---|
| Workflow run URL | ${RUN_URL} |
| Workflow run ID | \`${RUN_ID}\` |
| Run attempt | ${RUN_ATTEMPT} |
| Run number | ${RUN_NUMBER} |
| Workflow name | ${WORKFLOW_NAME} |
| Workflow identity | \`${WORKFLOW_REF}\` |
| Event | ${EVENT_NAME} |
| Ref | \`${REF_NAME}\` (${REF_TYPE}) |
| Repository | \`${REPOSITORY}\` |

## Commit identity

| Field | Value |
|---|---|
| Branch commit SHA (the code that ran) | \`${BRANCH_SHA}\` |
| **Synthetic merge commit SHA (test-only)** | \`${MERGE_SHA}\` |

The synthetic merge SHA is GitHub's throwaway merge of branch into base. **It is
not a commit on any branch** and must never be cited as the code under test. It
is recorded only so a reader can match this record to the run, because that is
the SHA the run itself is keyed by.

## Environment identity

| Field | Value |
|---|---|
| Runner | \`$(unknown "${RUNNER_OS:-}")\` / \`$(unknown "${RUNNER_ARCH:-}")\` |
| Node | \`$(node --version 2>/dev/null || echo unknown)\` |
| PostgreSQL | \`${PG_IMAGE}\` |
| Database identity | \`${DB_IDENTITY}\` |

Credentials are excluded by construction: only host, user and database name are
recorded, never a password.

## Suite results

| Suite log | Passed | Failed |
|---|---|---|
$(suite_rows)

Counts are parsed from the run's own output. \`<unread>\` means the line could not
be parsed — it is not a zero and not a pass.

## Evidence classification

State plainly which of these apply, and do not promote one to another:

- [ ] **Verified in this run** — a suite executed here and passed here.
- [ ] **Verified earlier, unchanged** — passed in the linked earlier run; the
      relevant files did not change since. Cite that run's ID.
- [ ] **Not verified** — no run covers it. Say so.

## Retention statement

| Channel | Retention | Capability |
|---|---|---|
| Actions artifact (\`v45-application-evidence\`) | 90 days | platform maximum for a public repo |
| Job logs | 90 days | same cap |
| PR comment (run-specific) | life of the PR | points at this exact run |
| **This committed record** | **indefinite (git history)** | the 12-month carrier |

Owner-approved requirement: 12 months. Artifacts deliver 3 of those months.
**This record is the mechanism for the remaining 9. It is not equivalent to
artifact retention** — the artifact holds the full log, this record holds the
identity, the counts and the classification. Both are required; neither is a
substitute.

## Known limitations

1. Artifacts expire at 90 days on a public repository. Not configurable upward.
2. This record is a *summary*. When the artifact expires, per-case detail is
   gone unless it was reproduced in a committed test or report.
3. It proves a run happened and what it reported. It does not re-verify the
   result after the fact; re-running the workflow is the only re-verification.
4. A reader can detect deletion of a *previous* record from git history, but the
   record cannot prove the absence of a run that was never recorded.
EOF

echo "wrote ${OUT}"
