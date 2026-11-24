#!/usr/bin/env python3
"""
G-3 — protected-constraint integrity checks for the Option C workflow.

This module is the single definition of "is this migration safe?" that both the
repository guard and the CI job use. Keeping it in one place matters: a guard
that CI and the repo enforce differently is not a control.

WHY THIS IS NOT A GREP FOR "DROP CONSTRAINT"
--------------------------------------------
A naive guard that rejects any DROP CONSTRAINT of a protected FK is WRONG, and
was disproved during G-3 development:

  * changing a column that participates in a composite FK (e.g. altering
    questions.subject_id) REQUIRES dropping and re-adding that FK;
  * PostgreSQL refuses the ALTER while the FK exists, so the drop is not
    optional.

The naive guard therefore blocks the only correct fix for a legitimate change.
The rule encoded here is the one that is actually right:

    A protected FK may be dropped ONLY if the SAME migration re-adds it with an
    equivalent definition: same referencing columns, same referenced columns,
    and the approved ON UPDATE CASCADE / ON DELETE RESTRICT actions.

Anything else — dropped and not re-added, weakened, narrowed, retargeted,
escalated to CASCADE — is a violation.

This is a textual pre-deployment check. It is necessary but NOT sufficient; the
authoritative check is the post-deployment comparison of the live catalog
against the approved definitions (assert_protected_fks below).

THIRD CHECK — APPLIED-MIGRATION INTEGRITY (``history``)
------------------------------------------------------
`prisma migrate deploy` and `prisma migrate status` were MEASURED not to notice
that an already-applied migration file had been edited (CI run 45262383682,
criterion 5b: both exited 0 after the file was rewritten). Prisma is therefore
not a control for tampering with applied history, and this module supplies one:
`_prisma_migrations.checksum` holds the SHA-256 of the file as it was applied, so
recomputing it over the file on disk detects any edit. See ``check_history``.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from typing import Any

# The five approved composite foreign keys (Request C, §3.11.6).
# Tuple: (referencing columns, referenced columns). Actions are asserted
# separately because every one of the five uses the same approved pair.
PROTECTED_FKS: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "fk_questions_level_subject": (("education_level_id", "subject_id"), ("level_id", "subject_id")),
    "fk_questions_chapter_subject": (("chapter_id", "subject_id"), ("id", "subject_id")),
    "fk_questions_topic_chapter": (("topic_id", "chapter_id"), ("id", "chapter_id")),
    "fk_questions_subtopic_topic": (("subtopic_id", "topic_id"), ("id", "topic_id")),
    "fk_answer_keys_options_of_version": (("version_id", "mcq_correct_option_key"), ("version_id", "key")),
}

APPROVED_ON_UPDATE = "CASCADE"
APPROVED_ON_DELETE = "RESTRICT"

PROTECTED_TABLES = (
    "questions", "answer_keys", "question_options",
    "topics", "chapters", "subtopics", "level_subjects",
)


def _norm(sql: str) -> str:
    return re.sub(r'[\s"]+', " ", sql).strip()


def _cols(definition: str, keyword: str) -> tuple[str, ...]:
    m = re.search(keyword + r'\s*\(([^)]*)\)', definition, re.I)
    if not m:
        return ()
    return tuple(c.strip().strip('"').lower() for c in m.group(1).split(","))


def check_migration_sql(sql: str) -> tuple[bool, list[str]]:
    """Pre-deployment textual check of one or more migration files.

    Returns (ok, reasons). Empty reasons means no violation was found.
    """
    reasons: list[str] = []

    for fk, (fcols, rcols) in PROTECTED_FKS.items():
        drops = re.findall(r'DROP\s+CONSTRAINT\s+"?' + fk + r'"?', sql, re.I)
        adds = re.findall(
            r'ADD\s+CONSTRAINT\s+"?' + fk + r'"?\s*(FOREIGN\s+KEY[^;]*;)', sql, re.I | re.S
        )

        if drops and not adds:
            reasons.append(f"{fk}: dropped and never re-added in the same migration")
            continue
        if not adds:
            continue

        definition = _norm(adds[-1])
        got_f = _cols(definition, r'FOREIGN\s+KEY')
        got_r = _cols(definition, r'REFERENCES\s+"?\w+"?')
        if got_f != fcols:
            reasons.append(
                f"{fk}: referencing columns changed from {list(fcols)} to {list(got_f) or 'none'}"
            )
        if got_r != rcols:
            reasons.append(
                f"{fk}: referenced columns changed from {list(rcols)} to {list(got_r) or 'none'}"
            )
        if not re.search(r'ON\s+UPDATE\s+CASCADE', definition, re.I):
            reasons.append(f"{fk}: ON UPDATE CASCADE is missing from the re-added definition")
        if not re.search(r'ON\s+DELETE\s+RESTRICT', definition, re.I):
            reasons.append(f"{fk}: ON DELETE RESTRICT is missing from the re-added definition")

    for table in PROTECTED_TABLES:
        if re.search(r'DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?' + table + r'"?', sql, re.I):
            reasons.append(f"drops the protected table '{table}'")

    return (not reasons, reasons)


def assert_protected_fks(catalog_rows: list[dict[str, Any]]) -> tuple[bool, list[str]]:
    """Post-deployment authoritative check against the live catalog.

    catalog_rows comes from `fetch_catalog` below: one row per foreign key.
    Verifies that all five exist with the approved shape. This is the check a
    textual guard cannot substitute for, because it reads what PostgreSQL
    actually stored.
    """
    by_name = {r["conname"]: r for r in catalog_rows}
    problems: list[str] = []

    for fk, (fcols, rcols) in PROTECTED_FKS.items():
        row = by_name.get(fk)
        if row is None:
            problems.append(f"{fk}: MISSING from the catalog")
            continue
        got_f = tuple(row.get("confcols") or ())
        got_r = tuple(row.get("refcols") or ())
        if got_f != fcols:
            problems.append(f"{fk}: catalog referencing columns {list(got_f)} != approved {list(fcols)}")
        if got_r != rcols:
            problems.append(f"{fk}: catalog referenced columns {list(got_r)} != approved {list(rcols)}")
        if str(row.get("onupdate", "")).upper() != APPROVED_ON_UPDATE:
            problems.append(f"{fk}: ON UPDATE is {row.get('onupdate')}, approved is {APPROVED_ON_UPDATE}")
        if str(row.get("ondelete", "")).upper() != APPROVED_ON_DELETE:
            problems.append(f"{fk}: ON DELETE is {row.get('ondelete')}, approved is {APPROVED_ON_DELETE}")

    return (not problems, problems)


# SQL that returns the five constraints in a form assert_protected_fks can read.
CATALOG_QUERY = r"""
SELECT
  c.conname,
  (SELECT array_agg(a.attname ORDER BY k.ord)
     FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS confcols,
  (SELECT array_agg(a.attname ORDER BY k.ord)
     FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
     JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS refcols,
  CASE c.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
       WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS onupdate,
  CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
       WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS ondelete
FROM pg_constraint c
WHERE c.contype = 'f'
  AND c.connamespace = 'public'::regnamespace
  AND c.conname = ANY (ARRAY[
    'fk_questions_level_subject','fk_questions_chapter_subject',
    'fk_questions_topic_chapter','fk_questions_subtopic_topic',
    'fk_answer_keys_options_of_version'])
"""


def check_history(rows: list[dict[str, Any]], migrations_dir: str) -> tuple[bool, list[str]]:
    """Compare on-disk migration files against `_prisma_migrations.checksum`.

    `rows` is one JSON object per applied migration with `migration_name` and
    `checksum`. Prisma records the SHA-256 of `migration.sql` at apply time; a
    file edited afterwards no longer matches. This check exists because Prisma's
    own `migrate deploy`/`migrate status` were measured NOT to detect such an
    edit (it was applied to a disposable database and both commands exited 0).
    """
    problems: list[str] = []
    if not rows:
        problems.append("no applied migrations were supplied — nothing to verify, refusing to pass")
        return False, problems

    checked = 0
    for row in rows:
        name = row.get("migration_name") or ""
        expected = (row.get("checksum") or "").strip()
        path = os.path.join(migrations_dir, name, "migration.sql")
        if not os.path.isfile(path):
            problems.append(f"{name}: recorded as applied but {path} does not exist")
            continue
        with open(path, "rb") as fh:
            actual = hashlib.sha256(fh.read()).hexdigest()
        if not expected:
            problems.append(f"{name}: no checksum recorded in _prisma_migrations")
            continue
        if actual != expected:
            problems.append(
                f"{name}: migration.sql was MODIFIED after it was applied "
                f"(recorded {expected[:12]}…, on disk {actual[:12]}…)"
            )
            continue
        checked += 1
    if problems:
        return False, problems
    return True, [f"{checked} applied migration(s) match their recorded checksums"]


def main(argv: list[str]) -> int:
    """CLI: `python3 guard.py sql <file...>` or `python3 guard.py catalog <json>`."""
    if len(argv) < 2:
        print("usage: guard.py sql <migration.sql...> | guard.py catalog <rows.json> | "
              "guard.py history <rows.json> <migrations-dir>", file=sys.stderr)
        return 2

    mode = argv[1]
    if mode == "sql":
        bad = False
        for path in argv[2:]:
            with open(path, encoding="utf-8") as fh:
                ok, reasons = check_migration_sql(fh.read())
            if ok:
                print(f"OK      {path}")
            else:
                bad = True
                print(f"REJECT  {path}")
                for r in reasons:
                    print(f"          - {r}")
        return 1 if bad else 0

    if mode == "history":
        if len(argv) < 4:
            print("usage: guard.py history <rows.json> <migrations-dir>", file=sys.stderr)
            return 2
        with open(argv[2], encoding="utf-8") as fh:
            rows = json.load(fh)
        if isinstance(rows, dict):
            rows = [rows]
        ok, notes = check_history(rows or [], argv[3])
        for n in notes:
            print(("OK      " if ok else "REJECT  ") + n)
        return 0 if ok else 1

    if mode == "catalog":
        raw = open(argv[2], encoding="utf-8").read().strip()
        if not raw:
            print(f"REJECT  {argv[2]} is empty — no catalog rows were returned, "
                  f"which is indistinguishable from no constraints existing")
            return 1
        try:
            rows = json.loads(raw)
        except json.JSONDecodeError as exc:
            print(f"REJECT  {argv[2]} is not valid JSON ({exc})")
            return 1
        if isinstance(rows, dict):
            rows = [rows]
        ok, problems = assert_protected_fks(rows or [])
        if ok:
            print("OK      all five protected composite FKs present with approved definitions")
            return 0
        for p in problems:
            print(f"REJECT  {p}")
        return 1

    print(f"unknown mode: {mode}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
