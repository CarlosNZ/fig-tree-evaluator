# V3 Testing & Conversion Strategy

The existing V2 test suite is our most valuable asset for validating the V2→V3
conversion: a large corpus of real expression trees paired with known-correct
results. We use it as the converter's oracle.

## Process

1. **Freeze the V2 corpus.** Copy the current tests into a `V2/` folder,
   untouched. This is an immutable record of V2 semantics — expected outputs
   included. Never edit it.
2. **Hand-migrate to V3.** Migrate the working tests to V3 syntax (the frozen
   copy stays intact), then add new V3 tests covering all new functionality.
3. **Implement V3**, validating against the V3 tests as functionality lands.
4. **Write the V2→V3 converter** once V3 is stable.
5. **Run the differential:** for each V2 expression-tree test,
   `evaluate(convert(v2Tree))` should equal the frozen V2 expected result — or
   be a catalogued divergence. Record divergences, write migration notes, and
   adjust expected outputs *on the converter/differential tests only*.

## Guardrails

- **The invariant is the evaluated result, not the tree shape.** Assert on the
  recorded V2 expected *value*, never on "the converter produced the V3 tree I'd
  have written by hand."
- **Keep the V3 suite independent of the converter.** Hand-migration (step 2) is
  what makes the V3 tests an independent oracle. Do not regenerate them from the
  converter, however tempting once it exists — that would be circular.
- **Never edit the frozen `V2/` folder.** Expected-output changes for new V3
  rules go on the differential tests, not the historical record.
- **Segregate node-eval tests from infrastructure tests.** Options handling,
  caching, HTTP/SQL wiring, and error-throwing tests don't flow through the
  converter differential — only pure expression-tree tests do. Split these out
  early.

## Divergence catalog

The catalog of cases the converter can't reproduce exactly is a first-class
output (it feeds the migration docs). Tag each divergence:

- **non-convertible** — V2 behaviour has no V3 equivalent; converter warns/errors.
- **intentional semantic change** — converts fine, but V3 rules deliberately
  produce a different result (null-policy / gradient rulings live here).
- **lossy default** — converter must pick a value and can't perfectly preserve intent.

## Notes on sequencing

The converter is partly a spec artifact — it encodes the full V2→V3 rule delta.
Writing it (step 4) will likely surface rule gaps not yet decided; treat that as
a spec-refinement pass, not just coding. Prioritise careful, genuinely
independent authoring for tests covering changed semantics and new
functionality; bulk mechanical ports can be lighter-touch but still reviewed.
