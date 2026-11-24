#!/usr/bin/env python3
"""Deployment-path guard — every repository-controlled `prisma migrate deploy`
must go through the approved checksum gate.

WHY THIS EXISTS
---------------

`scripts/db/deploy-gate.sh` verifies the applied migration history against the
files on disk before deploying, and `tests/unit/tooling/deploy-gate.test.ts`
proves that gating works. Neither of those stops a *new* deployment path from
being added beside the gate: a package script, a wrapper, a workflow step, or a
fresh harness that calls Prisma directly would deploy without verification and
no existing test would notice.

This guard is that missing control. It is the deployment analogue of
`repo-guard.sh` (which blocks the prohibited *development* commands); it does not
replace it, and it does not re-implement the checksum algorithm — it only checks
that the one approved implementation is on the path.

WHAT IT CONSIDERS A DEPLOYMENT
------------------------------

A non-comment, non-string occurrence of `migrate deploy` in an executed surface:

  · every `package.json` script value (the command itself is a surface);
  · every shell/Python/JS/TS file under `scripts/`;
  · every shell/Python/JS/TS file under `docs/database/g1-spike/` (the G-1/G-3
    harnesses live there);
  · every `.github/workflows/*.yml|yaml`.

Two textual cases are deliberately NOT counted, because they cannot execute:

  · a match inside a quoted string or a heredoc body (prose, log messages,
    `echo`/`fail`/`info` text, the gate's own usage block);
  · a match inside a comment (shell/Python/YAML `#`, JS/TS `//`).

A match inside a string that is *evaluated* (`eval`, `bash -c`, `sh -c`) is
counted anyway — that is a real way to hide an invocation.

APPROVED PATHS AND NARROW EXCEPTIONS
------------------------------------

Approved implementation: `scripts/db/deploy-gate.sh`, which may invoke the
deploy command only *after* the authoritative history verification runs. The
guard asserts that structurally: the file must reference `guard.py` with the
`history` subcommand, that call must come before the first deploy invocation, and
the file may contain at most `GATE_MAX_DEPLOY_INVOCATIONS` of them.

Exceptions are per-file and counted: `EXCEPTIONS` maps an exact repository path to
the exact number of deploy invocations it is allowed. There are no globs and no
directory-wide exemptions, so:

  · adding another invocation to an excepted file fails;
  · copying an excepted file to a new path fails (the path is not exempt);
  · adding a new harness file fails until it is listed here, in review;
  · a listed file that no longer exists fails (a stale entry would silently cover
    a future file of the same shape).

The listed files are the G-1/G-3 evidence harnesses. They are deliberately NOT
wired to the gate: they run against disposable databases, and `g3-full/run.sh`
step 5 exists specifically to demonstrate that `migrate deploy` does not notice an
edited migration. Routing them through the gate would destroy that evidence.

WHAT THIS GUARD DOES NOT DO (stated so it is not mistaken for completeness)
--------------------------------------------------------------------------

  · It does not stop a person typing `npx prisma migrate deploy` in a terminal.
    A repository text guard cannot.
  · It does not cover raw-SQL migration paths (`psql -f migration.sql`), which
    create no Prisma history; the Prisma checksum gate does not apply to them and
    must not be described as covering them.
  · It does not read migration contents; that is `guard.py`'s job.

Exit codes: 0 clean · 1 violation · 2 cannot verify (fail closed).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

DEPLOY_PATTERN = re.compile(r"\bmigrate\s+deploy\b")
HEREDOC_PATTERN = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
TRIPLE_OPENERS = ('"""', "'''")

# A heredoc body is normally human-readable data (usage text, log output), so it
# cannot execute. Two forms can: feeding the body to a shell, or writing it into a
# script file. Those are counted, because a generated deploy script is exactly the
# bypass a heredoc-blind guard would miss.
EXEC_HEREDOC = re.compile(r"\b(?:bash|sh|eval)\s+<<")
REDIRECT_TARGET = re.compile(r"(?:>>?|\btee)\s+(\"[^\"]+\"|'[^']+'|[^\s\"'|<>]+)")
SCRIPT_EXTENSIONS = (".sh", ".bash", ".py", ".mjs", ".js", ".cjs")

# Ways a command hidden inside a string still gets executed.
EVALUATED_STRING = re.compile(
    r"\b(?:eval|bash\s+-c|sh\s+-c)\b|\bshell\s*=\s*True\b|\bos\.system\s*\("
)

GATE_PATH = "scripts/db/deploy-gate.sh"
GATE_MAX_DEPLOY_INVOCATIONS = 2

SCAN_ROOTS = ("scripts", "docs/database/g1-spike", ".github/workflows")
SCAN_SUFFIXES = {".sh", ".bash", ".py", ".mjs", ".js", ".cjs", ".ts", ".yml", ".yaml"}
SKIP_DIRS = {"node_modules", ".git", ".next", "dist", "build", "coverage"}

# Exact path → allowed number of deploy invocations. Narrow by construction.
EXCEPTIONS: dict[str, tuple[int, str]] = {
    "docs/database/g1-spike/run.sh": (1, "G-1 experiment driver (disposable databases)"),
    "docs/database/g1-spike/experiment-2/run.sh": (3, "G-1 experiment 2 (disposable databases)"),
    "docs/database/g1-spike/option-c/run.sh": (3, "Option C prototype harness"),
    "docs/database/g1-spike/option-c/g3/run.sh": (5, "G-3 workflow gate (prototype)"),
    "docs/database/g1-spike/option-c/g3-full/run.sh": (5, "G-3 full 18-table schema gate"),
    "docs/database/g1-spike/option-c/prod-ready/v1/v1-second-migration.sh": (
        2,
        "V-1 driver: builds a throwaway 0002 in a temporary session",
    ),
}

APPROVED_DEPLOY_SCRIPT = "bash scripts/db/deploy-gate.sh deploy"
APPROVED_VERIFY_SCRIPT = "bash scripts/db/deploy-gate.sh verify"


class Unverifiable(Exception):
    """The guard cannot reach a decision. Always fatal (exit 2)."""


def state_at(line: str, index: int, triple_in: str | None) -> tuple[bool, str | None]:
    """Return (inside_string_or_comment, triple_quote_state) at `index`."""
    i = 0
    single = double = False
    triple = triple_in
    while i < index:
        if triple is not None:
            if line.startswith(triple, i):
                i += 3
                triple = None
                continue
            i += 1
            continue
        char = line[i]
        if single:
            if char == "\\":
                i += 2
                continue
            if char == "'":
                single = False
            i += 1
            continue
        if double:
            if char == "\\":
                i += 2
                continue
            if char == '"':
                double = False
            i += 1
            continue
        for opener in TRIPLE_OPENERS:
            if line.startswith(opener, i):
                triple = opener
                i += 3
                break
        else:
            if char == "#":
                return True, triple
            if line.startswith("//", i):
                return True, triple
            if char == "'":
                single = True
            elif char == '"':
                double = True
            i += 1
    return (single or double or triple is not None), triple


def heredoc_is_executable(line: str, position: int) -> bool:
    """True when a heredoc opened on `line` produces something executable."""
    if EXEC_HEREDOC.search(line[: position + 2]):
        return True
    target = REDIRECT_TARGET.search(line)
    if target is None:
        return False
    name = target.group(1).strip("\"'")
    return name.endswith(SCRIPT_EXTENSIONS)


def deploy_invocations(source: str) -> list[int]:
    """Line numbers of `migrate deploy` occurrences that can actually execute."""
    hits: list[int] = []
    triple: str | None = None
    heredocs: list[tuple[str, bool]] = []

    for lineno, line in enumerate(source.splitlines(), start=1):
        if heredocs:
            delimiter, executable = heredocs[0]
            if line.strip() == delimiter:
                heredocs.pop(0)
                continue
            if executable and DEPLOY_PATTERN.search(line):
                # A generated script/executed body is code, not prose.
                hits.append(lineno)
            continue  # plain heredoc bodies are data, never commands

        start_state = triple
        for match in DEPLOY_PATTERN.finditer(line):
            inside, _ = state_at(line, match.start(), start_state)
            if not inside:
                hits.append(lineno)
                break
            # A match inside a string is still an invocation when the string is
            # about to be evaluated: a shell `eval`/`-c`, or a Python shell-out
            # (`subprocess.run(..., shell=True)`, `os.system(...)`).
            if EVALUATED_STRING.search(line):
                hits.append(lineno)
                break
        _, triple = state_at(line, len(line), start_state)

        for match in HEREDOC_PATTERN.finditer(line):
            inside, _ = state_at(line, match.start(), triple)
            if not inside:
                heredocs.append((match.group(2), heredoc_is_executable(line, match.start())))

    return hits


def iter_surfaces(root: Path):
    """Yield repository-relative paths of files the guard must scan."""
    for relative_root in SCAN_ROOTS:
        base = root / relative_root
        if not base.exists():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file() or path.suffix not in SCAN_SUFFIXES:
                continue
            if any(part in SKIP_DIRS for part in path.relative_to(root).parts):
                continue
            yield path.relative_to(root).as_posix()


def check_package_scripts(root: Path, violations: list[str]) -> tuple[bool, int]:
    """The npm surface: wiring must be present, and no script may deploy directly."""
    package_json = root / "package.json"
    if not package_json.is_file():
        raise Unverifiable("package.json is missing, so the npm surface cannot be checked")
    try:
        data = json.loads(package_json.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise Unverifiable(f"package.json is not valid JSON ({error})") from error
    scripts = data.get("scripts")
    if not isinstance(scripts, dict):
        raise Unverifiable("package.json has no `scripts` object")

    deploy_script = scripts.get("db:deploy")
    if deploy_script != APPROVED_DEPLOY_SCRIPT:
        violations.append(
            "package.json: `db:deploy` must be "
            f"`{APPROVED_DEPLOY_SCRIPT}` (found {deploy_script!r}). "
            "The approved gate must stay on the deploy path."
        )
    verify_script = scripts.get("db:verify-history")
    if verify_script != APPROVED_VERIFY_SCRIPT:
        violations.append(
            "package.json: `db:verify-history` must be "
            f"`{APPROVED_VERIFY_SCRIPT}` (found {verify_script!r})."
        )

    checked = 0
    for name, value in sorted(scripts.items()):
        if not isinstance(value, str):
            continue
        checked += 1
        if name == "db:deploy" and value == APPROVED_DEPLOY_SCRIPT:
            continue  # the approved path, verified above
        # Script values are commands, so quote-awareness does not apply here:
        # `"x": "prisma migrate deploy"` executes after the shell parses it.
        if DEPLOY_PATTERN.search(value):
            violations.append(
                f"package.json: script `{name}` runs a deploy directly ({value!r}). "
                "Use `npm run db:deploy` so the checksum gate runs first."
            )
    return True, checked


def check_gate(root: Path, violations: list[str]) -> int:
    """The approved gate: present, verifying, and not multiplying invocations."""
    gate = root / GATE_PATH
    if not gate.is_file():
        raise Unverifiable(f"approved gate {GATE_PATH} is missing")
    source = gate.read_text(encoding="utf-8")

    invocations = deploy_invocations(source)
    first_deploy = invocations[0] if invocations else None

    if not invocations:
        violations.append(
            f"{GATE_PATH}: contains no deploy invocation — the approved deploy path is gone."
        )
    elif len(invocations) > GATE_MAX_DEPLOY_INVOCATIONS:
        violations.append(
            f"{GATE_PATH}: {len(invocations)} deploy invocations "
            f"(at most {GATE_MAX_DEPLOY_INVOCATIONS} expected)."
        )

    verify_lines = [
        number
        for number, line in enumerate(source.splitlines(), start=1)
        if "guard.py" in line and "history" in line
    ]
    if not verify_lines:
        violations.append(
            f"{GATE_PATH}: does not invoke the authoritative checksum utility "
            "(`guard.py … history`). Verification must not be replaced by a "
            "second implementation."
        )
    elif first_deploy is not None and min(verify_lines) > first_deploy:
        violations.append(
            f"{GATE_PATH}: the history verification (line {min(verify_lines)}) "
            f"comes after the deploy invocation (line {first_deploy})."
        )
    return len(invocations)


def main(argv: list[str]) -> int:
    if "--print-exceptions" in argv:
        # Read-only introspection, used by the regression suite so fixture repos
        # can reproduce the real exception set without a second copy of it.
        print(json.dumps({path: allowed for path, (allowed, _) in EXCEPTIONS.items()}, indent=2))
        return 0
    root = Path(argv[1] if len(argv) > 1 else Path(__file__).resolve().parents[2]).resolve()
    violations: list[str] = []
    scanned = 0
    excepted_hits = 0

    try:
        _, npm_scripts = check_package_scripts(root, violations)
        gate_invocations = check_gate(root, violations)

        for relative in iter_surfaces(root):
            scanned += 1
            if relative == GATE_PATH:
                continue  # handled above
            source = (root / relative).read_text(encoding="utf-8", errors="replace")
            hits = deploy_invocations(source)
            if not hits:
                continue

            if relative in EXCEPTIONS:
                allowed, reason = EXCEPTIONS[relative]
                excepted_hits += len(hits)
                if len(hits) > allowed:
                    violations.append(
                        f"{relative}: {len(hits)} deploy invocation(s) at lines "
                        f"{hits}, but the exception allows {allowed} ({reason}). "
                        "A wider exception must be reviewed, not assumed."
                    )
            else:
                violations.append(
                    f"{relative}:{hits[0]}: runs `migrate deploy` directly "
                    f"(lines {hits}). Route it through scripts/db/deploy-gate.sh, "
                    "or add a narrow, counted exception to this guard."
                )
    except Unverifiable as error:
        print(f"UNVERIFIABLE: {error}", file=sys.stderr)
        print("Refusing to report success for a surface that cannot be checked.", file=sys.stderr)
        return 2

    # A stale exception would silently cover a future file with the same shape.
    missing = sorted(path for path in EXCEPTIONS if not (root / path).exists())
    for path in missing:
        violations.append(f"{path}: listed as an exception but does not exist (stale entry).")

    if violations:
        for violation in violations:
            print(f"VIOLATION: {violation}", file=sys.stderr)
        print(
            f"FAILED: {len(violations)} deployment-path violation(s). "
            "Every repository-controlled `prisma migrate deploy` must run through "
            "scripts/db/deploy-gate.sh.",
            file=sys.stderr,
        )
        return 1

    print("OK: every repository-controlled `prisma migrate deploy` goes through the checksum gate")
    print(f"    approved gate: {gate_invocations} deploy invocation(s), after history verification")
    print(f"    npm surface: {npm_scripts} script(s) checked; db:deploy is the gate")
    print(f"    scanned {scanned} file(s) across {', '.join(SCAN_ROOTS)}")
    print(f"    explicit counted exceptions: {len(EXCEPTIONS)} harness file(s), {excepted_hits} invocation(s)")
    print("    not covered: a human typing a deploy in a terminal; raw-SQL paths without Prisma history")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
