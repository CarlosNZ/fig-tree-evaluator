# v2 working copy — conversion / migration source

An **editable** copy of the v2 test suite, taken at the v3-rebuild freeze. This is the working set: the source you hand-migrate into the v3 suite (at the `test/` top level) and the material the Phase-15 converter is developed against.

Distinct from its pristine twin:

| | `test/V2/` | `test/v2-working/` (here) |
|---|---|---|
| Role | frozen historical record + Phase-15 differential **oracle** | working / conversion source |
| Edited? | **never** — byte-identical to v2 forever | freely — annotate, delete files as you migrate them |
| Runs? | on demand vs `/v2-src` via `yarn test:v2` | not run by any suite (excluded from v3 CI) |

Both start byte-identical. Keep the *oracle* (`test/V2/`) untouched so the Phase-15 differential always compares against a clean v2 record; do your working / progress-tracking here.

To see live v2 behaviour while migrating, run the frozen copy: `yarn test:v2 <file>` (it executes against the frozen v2 engine in `/v2-src`).

Migration workflow (per [implementation plan](../../docs/v3-implementation-plan.md) working rule 1): for each chunk, author the v3 tests at the `test/` top level — hand-migrated from here where v2 coverage exists (never converter-generated), plus new tests for new semantics. Tick files off here as you go.
