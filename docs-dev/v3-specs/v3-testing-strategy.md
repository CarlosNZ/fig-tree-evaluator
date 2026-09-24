# V3 Testing & Conversion Strategy

The existing V2 test suite is our most valuable asset for validating the V2→V3 conversion: a large corpus of real expression trees paired with known-correct results. Its expressions are the converter's test corpus, and V2 itself, run live, is the oracle (step 5).

## Process

1. **Freeze the V2 corpus.** Copy the current tests into a `V2/` folder, untouched. This is an immutable record of V2 semantics — expected outputs included. Never edit it.
2. **Hand-migrate to V3.** Migrate the working tests to V3 syntax (the frozen copy stays intact), then add new V3 tests covering all new functionality.
3. **Implement V3**, validating against the V3 tests as functionality lands.
4. **Write the V2→V3 converter** once V3 is stable.
5. **Run the differential:** for each expression case in the V2 tests, live V2 (the published package, following V2's releases until V3's release freezes it) evaluates the case, and V3 evaluates its conversion. The two outcomes should match, or differ as a catalogued divergence. The corpus is a data module extracted from the V2 release's tests, not the frozen files run in place, and the accepted result of every case is recorded in a baseline that CI checks for drift in either direction ("The differential runner" in [v3-converter.md](v3-converter.md)). Record divergences and write migration notes.

## Guardrails

- **The invariant is the evaluated result, not the tree shape.** Compare with the value V2 returns, never with "the converter produced the V3 tree I'd have written by hand."
- **Keep the V3 suite independent of the converter.** Hand-migration (step 2) is what makes the V3 tests an independent oracle. Do not regenerate them from the converter, however tempting once it exists — that would be circular.
- **Never edit the frozen `V2/` folder.** Verdicts on divergences go in the differential's review map and baseline, not the historical record.
- **Segregate expression tests from infrastructure tests.** Only cases that evaluate an expression and check what it returns, or that it fails, flow through the differential. I/O runs offline against shared mocks and recordings, so the HTTP and SQL cases flow through too; cases that check something other than an expression's result (a helper, metadata, cache statistics, options read back) do not ("The corpus" in [v3-converter.md](v3-converter.md)).

## Divergence catalog

The catalog of cases the converter can't reproduce exactly is a first-class output (it feeds the migration docs). Tag each divergence:

- **non-convertible** — V2 behaviour has no V3 equivalent; converter warns/errors.
- **intentional semantic change** — converts fine, but V3 rules deliberately produce a different result (null-policy / gradient rulings live here).
- **lossy default** — converter must pick a value and can't perfectly preserve intent.

## Notes on sequencing

The converter is partly a spec artifact — it encodes the full V2→V3 rule delta. Writing it (step 4) will likely surface rule gaps not yet decided; treat that as a spec-refinement pass, not just coding. Prioritise careful, genuinely independent authoring for tests covering changed semantics and new functionality; bulk mechanical ports can be lighter-touch but still reviewed.
