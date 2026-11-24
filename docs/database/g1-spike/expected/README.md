# Recorded output

| File | What it is |
|---|---|
| `local-run.log` | A complete `run.sh` transcript from the first attempt's environment. It stops at step 3 with `FAIL: prisma db pull failed` — the Prisma engine could not be downloaded there. **This is a record of a BLOCKED run, not a pass.** |
| `enforcement.log` | Step 2 output alone: 14/14 cases `PASS`, `G1_FAIL=0`. PostgreSQL-only. |
| `catalog.txt` | Step 1 output: the five composite FKs and the three support keys as PostgreSQL reports them. |
| `versions.txt` | Tool versions and the exact engine-download error, including a reproduction with the project's own pinned install. |

A successful run — once one exists — should add the outputs of steps 3–7
(`03-introspected.prisma`, `04-drift-empty.sql`, `05-drift-additive.sql`,
`06-migrate-dev.log`, `07-final-catalog.txt`) and the workflow run URL in §11.3.1.
None of those exist yet, because no Prisma step has ever executed.
