# #290 — Analysis hooks: implementation plan

_Branch `new-fallback-coverage-spec`, off `v3.0-dev`. The spec is [v3-specs/v3-operator-coverage.md](v3-specs/v3-operator-coverage.md), and it is the authority: the issue predates it. Four steps, each landing green (`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm check:package`), with a pause for Carl's check after each. Carl handles commits. This file is deleted at close-out; its rulings go to the specs and its deviations to the PR body._

## Rulings

From the spec review on 2026-11-01, all defaults Carl agreed to:

1. Host bodies are never run. The walk runs core bodies only (rule 4). The ruling goes on #290 at close-out.
2. A declaration for an operator the instance lacks, or two for one operator, is an error.
3. A finding's message comes from the entry's `message`, author-written.
4. The testing kit for a host's hooks is a follow-up issue, not built here.
5. Names as the spec has them: `declareAnalysis`, `OperatorAnalysis`, `FailureEntry`, `helpers.is`, `isBelow`, `range`, `refused`, `span`.

Where the implementation has to depart from the spec, the departure is recorded under its step here and folded into the spec at close-out.

## How each step runs

- A short plan in chat first, then Carl's OK, then the build. Questions are answered in chat, not folded into this file.
- Soundness is the hard rule: no missed failure, false positives tolerated. The corpus runner (test/coverage-cases.test.ts) holds every case to exactly its findings; the rule checker (test/coverage-rules.test.ts) keeps the core table honest. Where a step adds a check, break the code on purpose to show the check catches it.
- Each step closes with: the corpus count, the rule checker's result, the `./authoring` and root sizes against their budgets in codegen/entries.mjs, a bundle-size diff in the PR comment's style against the previous step's state (changed rows only, script in the scratchpad), and before/after example expressions run for real, not described.
- A budget is raised only with Carl's OK, measured plus 5%.

## Step 1 — Hosts on hooks, the root freed

The public switch. A host declares through `declareAnalysis` and passes the result to `fallbackCoverage`; the definition carries nothing; the root stops checking a literal it no longer has. Core stays on its literal tables inside `./authoring` for this step, so the walk reads hooks for a host and the old tables for core, both live, neither inert.

- **New in `src/authoring/`:** `helpers.ts`, the bag the spec lists, built per node from src/authoring/known.ts (`is`, `isType`, `isBelow`, `isEmpty` over the existing test logic; `refused` over the validate hook as `{ invalid: true }` does today; `isSupplied`; `all`, `any`, `not`; `span`, `exactValues`, `elementOf`, `valueOf`, `lengthOf`; `type`, `exactly`, `range`, `union`, `arrayOf`, `nothing`). `declare.ts`: `declareAnalysis`, the `OperatorAnalysis` it returns, and the lookup that matches declarations to the instance's operators by identity, with the two errors.
- **The walk:** one `analysisOf(definition)` in place of `rulesOf` and `outputOf`; for a host, `gamut` gives the output (a throw or a non-gamut fails the analysis with an error naming the operator) and `failures` gives entries, turned into findings with the certainty guards `ownFailures` applies today (`may`, `overflow`, an operand that may be an infinity). `mayWait` is unchanged: a host's body may wait whether or not it is declared.
- **`fallbackCoverage`:** the `operators` option, validated like `strictNumbers`.
- **The root:** `analysis` leaves `OperatorDefinition` and `ValidatedOperatorDefinition`; `defineOperator` stops checking it, `buildOperator` stops cloning it, `introspect`'s key list drops it; `src/analysisCheck.ts` deleted; `src/authoringTypes.ts` loses `OperatorAnalysis`, `FailureRule`, `FailureTest`, `DeclaredOutput` and gains `Gamut`, `Answer`, `GamutHelpers`, `FailureEntry`, the new `OperatorAnalysis`; `src/index.ts` exports follow. `declareAnalysis` needs `isValidatedOperator` from src/operatorDefinition.ts, which is in the engine chunk already: add it to the lint allowance for `src/authoring/`.
- **Tests:** every test that writes `analysis:` (test/authoring.test.ts, coverage-cases.test.ts, authoring-timeout.test.ts, introspect-operators.test.ts, and any `grep -rn "analysis:" test` finds) moves to `declareAnalysis` plus `operators`. The analysisCheck tests become `declareAnalysis` tests: a definition that is not built, a hook that is not a function or list, an operator the instance lacks, a duplicate, a hook that throws, a hook returning a non-gamut. test/exports.test.ts's type list follows.
- **Close-out examples:** a host operator declared the old way and the new, with the same report; the root's size drop from the checker leaving.

Departures, for the spec at close-out:

- **A constant NaN or infinity on an input is carried into the output of a node not run.** A host body no longer runs, so `{ $toNumber: NaN }` on a host declared with `failures: []` and no `gamut` lost its boundary failure: only a constant counts at the ordinary level. The output now gains that constant (an infinity as both signs). Core is unaffected wherever it is run; the corpus and the rule checker are unchanged.
- **The stall guard is gone** (`SETTLE_LIMIT`, `Stalled`): it existed for host bodies, which never run. "A body that does not settle" in v3-fallback-coverage.md goes with step 4.
- **`declareAnalysis` takes `{ readonly name: string }`, not the definition type**, and `Gamut`'s brand is a string key. Each entry's declarations carry their own copy of the root types, and a type branded by a unique symbol (the definition's own, `WILDCARD` inside it) is a different type in each copy, so a `defineOperator()` result did not fit. Built-ness is checked at runtime, as `fallbackCoverage(fig: unknown)` does; checkPackage's packed typecheck holds it.
- **A declaration with neither hook is refused:** it would mean exactly what no declaration does.
- **A host may not declare a core operator** (its analysis is built in). The I/O operators are not core, so a host may declare one.
- **`HandleView` carries the registry**, which `./authoring` matches declarations to by identity.

Pause for Carl's check.

## Step 2 — Core on hooks

A refactor with no change in findings: the corpus must give exactly what it gives after step 1.

- **`src/authoring/core.ts`:** one `declareAnalysis` call per core operator that has either hook, the two tables merged, written with the same helpers a host uses. The arithmetic forms become calls into src/authoring/known.ts from the one hook that needs each (`sumOf`, `productOf`, `differenceOf`, `absOf`, `extremeOf`); `byParam`, `typeNamedBy` and `firstNonNull` become code; `kindOf` goes. A `map`'s per-element results: the helpers are built per node, so `arrayOf` given the `each` parameter's own gamut substitutes the elements' results in order, as the spec promises.
- **Deleted:** `CORE_RULES`, `CORE_OUTPUTS`, the literal evaluators (`testKnown`, `answerRule`, `evaluate(declared)`), and whatever of rules.ts and outputs.ts the walk no longer needs; what it does (`atBoundary`, the infinite-operand guard, the external finding) moves beside the walk.
- **The rule checker:** re-pointed at the table's hooks. Its three checks keep their meaning: every engine result in the gamut the hook gives; every engine failure predicted by an entry, and no entry that never occurs; an entry's answer over a range consistent with its answer for a value in it. Break a core hook on purpose to show each check fires.
- **Close-out:** corpus exact, the checker green, the `./authoring` size (functions in place of data may cost; measure, trim, and propose a budget only if needed). Before and after are identical by design; the examples are `divide`'s and `plus`'s table entries beside their old rules.

Departures, for the spec at close-out:

- **`plus`'s gamut keeps the sum beside the named type.** The spec's example returns `helpers.type(named)` alone where `expect` is given, but the named type is the finite numbers, and an infinite operand carries through `plus` (`[2, Infinity]` gives `Infinity`; so does a null replaced by an infinite `nullValueDefault`). The rule checker refused it; the hook is `union(sumOf(values), typeNamed(expect))`, as the old declaration was.
- **`plus`'s type-check entries carry an empty guard**, `helpers.not(helpers.isEmpty(values))`, beside the spec's `not(isType(elementOf(values), kind))`: without it an array of the wrong kind that may be empty answers `yes`, and `plus([], expect: 'number')` is `0`, so that would be a wrong `always`.
- **A core entry with a `gamut` alone writes `failures: []`**, as a host must: the table's "none" under `failures` in the spec is that list, not an omission, which would make the operator external. Every core operator has an analysis; the walk's "is core" is membership of that table.
- **Messages are the author's**, so the generated phrasing went with the literal: `'exponent' is 100 or more` where the rule printed `'exponent' is not below 100`; `'to' is number and 'value' is an array or object` where it printed the JSON of the test. The corpus compares codes, places and certainty, never messages.
- **Core reaches into known.ts for its arithmetic** (`sumOf`, `productOf`, `differenceOf`, `absOf`, `extremeOf`) and for `firstNonNull`'s walk over its candidates, which moved there from outputs.ts: the bag has no helper for them by the pruning rule, and a host that needs one writes it, as the spec's `quotientOf` shows.
- **The error-codes inventory asks the hooks with nothing known**: an entry's code does not depend on the inputs, so test/error-codes.test.ts calls each core `failures` hook with every parameter unknown and a bag that answers `maybe` to everything.

Pause for Carl's check.

## Step 3 — Precision

The three gaps the spec closes, each with corpus cases and a before/after run.

- **`max(x, 1)`:** `extremeOf` gives up where an element may be an infinity, which a `$data` path may. An infinity can only raise a `max` or lower a `min`, so the bound on the other side holds. Cases: `10 / max(x, 1)` loses its divide-by-zero finding (a wrong-type finding stays: the homogeneous constraint is not used to drop the string case, a known limit to record).
- **`divide`'s quotient:** the spec's `quotientOf` in core.ts. Case: `10 / ((length(list) + 2) / 2)` has no finding.
- **`length` reads its value:** `helpers.lengthOf(value)` in place of an integer from 0. Case: `10 / length(split(s, ','))` has no finding; `10 / (length(x) - 1)` keeps its `may`.
- `pnpm coverageCases` after the cases change.

Departures, for the spec at close-out:

- **The spec's `quotientOf` is unsound for a `by` that may be an infinity.** `helpers.span` holds the finite numbers only, and `1 / Infinity` is 0, which the corner range never holds where `by`'s finite part is bounded (`if(c, 2, Infinity)`). The hook adds 0 where `helpers.is(by, ±Infinity)` is not `no`, and returns that alone where `by` has no finite number. The worked example needs the same lines, and the spec should say what `span` leaves out, since a host's arithmetic meets the same trap.
- **The rule checker's ranges widen a number by an infinity**, two ways: a finite value as its bounds plus `{ type: 'infinite' }`, and an infinite value as itself plus finite numbers on its far side. The second is what lets the checker see an unsound bound beside an infinity; before it, neither the `extremeOf` guard nor the quotient's 0 could be broken visibly. Both breaks are caught now.
- **Six cases, not five:** `1 / (1 / if(c, 2, Infinity))` holds the quotient's 0, since without it only the overflow finding stays, which matches by code and place, so the soundness check alone would not miss it.

Pause for Carl's check.

## Step 4 — Close-out

- **Specs:** v3-fallback-coverage.md loses "Operator rules", "Failure rules", "Output declarations" and "Where the rules live" to a pointer at v3-operator-coverage.md, and its "Value ranges", "Testing" and "Known limits" say what the walk now does; v3-coverage-decisions.md gets the decision; v3-operator-contract.md's field table and v3-listings.md's shape lose `analysis`; v3-authoring.md gains `declareAnalysis` and the `operators` option; v3-packaging.md's `./authoring` value list and its type list follow. v3-operator-coverage.md's status becomes agreed, with its Open items resolved or moved.
- **Sizes:** `pnpm size:imports --write` and the prose in docs-dev/imports.md; budgets in codegen/entries.mjs as measured.
- **Issues:** the rulings as a comment on #290; the `./testing` kit opened as a follow-up.
- **This file deleted first**, its rulings in the specs and its deviations in the PR body, and then the **PR** to `v3.0-dev`, squash-merged, its body carrying those deviations and the per-step sizes.
- **For the docs branch**, listed in the PR body and done there after the merge: the `/authoring` page's Custom operators section rewritten around the two hooks; docs-site/src/lib/operators/median.ts loses `analysis` and gains `medianAnalysis` beside it; the `Expression` component's `customOperators` passes the analyses; the Playground likewise if it registers custom operators.
