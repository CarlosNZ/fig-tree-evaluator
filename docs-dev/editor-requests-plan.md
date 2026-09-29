# Editor requests: implementation plan

Working plan for the upstream changes fig-tree-editor-react v3 asked for, in issues [#198](https://github.com/CarlosNZ/fig-tree-evaluator/issues/198), [#199](https://github.com/CarlosNZ/fig-tree-evaluator/issues/199) and [#200](https://github.com/CarlosNZ/fig-tree-evaluator/issues/200). The issues hold the full rationale; this doc groups their twelve items into five steps, records what each step touches and what has to be decided, and tracks progress so the work can continue across sessions.

The editor's side of each request is in fig-tree-editor-react's `docs-dev/v3-design.md` (its design) and `docs-dev/v3-upstream.md` (its log of upstream changes, with the F-numbers #200 cites).

## How to use this doc

- Work one step at a time, discussing the specifics at the start of each step before building.
- When a decision is made, record it under the step's **Decisions** and remove it from **Open questions**.
- Update the step's **Status** line as it moves: `Not started` → `In discussion` → `Building` → `Done (commit / PR)`.
- When a step is done, tick off its items in the issue it came from, and close the issue once all its items are done.
- Delete this file after all steps are complete

## Summary

| Step                                | Items                          | Why grouped                                           | Status                      |
| ----------------------------------- | ------------------------------ | ----------------------------------------------------- | --------------------------- |
| 1. Reading primitives in `./format` | #199 (all), #198.2             | Same subpath, export pin, spec section and import map | Done (`c7ac479`)            |
| 2. Metadata and hint polish         | #198.1, #198.3, #200.4, #200.6 | Data-only changes to definitions and hints            | Done (`d227952`)            |
| 3. Actionable `validate()` issues   | #200.1, #200.3                 | Both change the shape of what `validate()` reports    | Done (`82e9201`, `8d7ee44`) |
| 4. Fragment result types            | #200.2                         | Adds to the static analysis; changes `getFragments()` | Not started                 |
| 5. `renameBinding`                  | #200.5                         | Largest; needs a design pass first                    | Not started                 |

Order is by the editor's need, then by reach. Step 1 goes first because #199 is the one change the editor can't be built without. Step 5 goes last because the issue itself marks it least urgent: the quick fix it backs comes after the editor's first build.

## Throughout every step

- A change to the root's exports or public types is a spec change first ("Things easy to get wrong" in [CLAUDE.md](../CLAUDE.md)).
- Update [imports.md](imports.md) whenever an export changes or a size moves noticeably.
- README entries for anything user-visible; a CHANGELOG entry under the top (unreleased) version.
- Check the bundle-size report after `pnpm build`, especially when the `./format` chunk grows.
- Run `pnpm differential --check` after any change that could alter an outcome or an issue.
- All five steps are meant to land before 3.0 (Phase 18, the release, in [v3-implementation-plan.md](v3-specs/v3-implementation-plan.md)).

---

## Step 1: Reading primitives in `./format`

**Status:** Done (`c7ac479`, 2026-09-30). #199 closed; #198 commented that item 2 is done.

**Items**

- #199: export `classifyObject(raw, recognizes)` → `ObjectClass`, `positionalLayout(shape, length)` with `PositionalShape` and `PositionalLayout` (all [src/compile/grammar.ts](../src/compile/grammar.ts)), and `recognizeReference(value)` → `ReferenceRecognition` ([src/compile/references.ts](../src/compile/references.ts)) from `fig-tree-evaluator/format`, with their types.
- #198.2: export `typesIntersect` (now in [src/typeIntersection.ts](../src/typeIntersection.ts)) from `./format` too.

**Touches**

- [src/format/index.ts](../src/format/index.ts): the new exports.
- `test/format.test.ts`: its pin of the subpath's value exports gains the new names.
- [v3-format.md](v3-specs/v3-format.md): a short section on the reading primitives for tools, stable under semver like the rest of `./format`.
- [imports.md](imports.md): the new imports and their cost.
- The types exported from the root, if the new types aren't there already (the subpaths' types export from the root).

**Open questions**

(none)

**Decisions**

- **`typesIntersect` gets a module of its own** (Carl): [src/typeIntersection.ts](../src/typeIntersection.ts), added to `src/format/`'s allowed imports, rather than allowing all of `typeCheck.ts`. Rollup puts whole modules into the shared chunk, so the new module has no value imports: `isLiteralType`, the one value `typesIntersect` needs, moved with it, and `typeCheck.ts` and `buildOperator.ts` import it from there.
- **The new types export from the root**, as the subpaths' types do: `ObjectClass`, `PositionalShape`, `PositionalLayout`, `ReferenceRecognition`, and `ReferenceNamespace`, which `ReferenceRecognition` names and which wasn't exported before.
- **The result text isn't contract.** The spec's new section says the signatures and result shapes are semver-stable, but a malformed object's `message` and an invalid reference's `reason` may change, as an issue's message may.
- **A test holds each export to be the compiler's own function** (`toBe`, in `test/format.test.ts`), which is #199's point: a copy drifted in v1.
- **Size:** `./format` with its chunk is 6.25 → 6.49 kB brotli; the root with its chunk is unchanged (35.06 → 34.98 kB). All four primitives together cost a consumer 1.9 kB.

---

## Step 2: Metadata and hint polish

**Status:** Done (`d227952`, 2026-09-30). #198 closed (all three items); #200 commented that items 4 and 6 are done.

**Items**

- #198.1: `plus.values` declares `constraints: { homogeneous: ['number', 'string', 'array', 'object'] }` ([src/operators/math.ts](../src/operators/math.ts)).
- #198.3: descriptions for the nine parameters without one: `power.base`, `power.exponent`, and `value` on `round`, `floor`, `ceil`, `abs` (in `math.ts`, the `unary` helper) and `lower`, `upper`, `trim` (the `normalizer` helper in [src/operators/string.ts](../src/operators/string.ts)). Plus a test that every core and I/O parameter has a non-empty description, beside the editor-hints drift tests.
- #200.4: a `literal` entry in `./editor-hints`: display name, `docUrl`, colours, and the seed for `value` (the editor's fallback seed is `'No content inside a literal node is evaluated'`).
- #200.6: a `buildString` template seed that reads well without substitution: `operatorHints.buildString.seeds.template` is `'Hello {{name}}'` ([src/editor-hints/index.ts:263](../src/editor-hints/index.ts#L263)), and new nodes get required parameters only, so the optional `substitutions` seed never arrives.

**Touches**

- The operator definitions named above, and their README entries if the descriptions appear there.
- [src/editor-hints/index.ts](../src/editor-hints/index.ts) and [test/editor-hints.test.ts](../test/editor-hints.test.ts).
- The differential baseline, possibly (see below).

**Open questions**

(none)

**Decisions**

- **`plus` declares `homogeneous`** (Carl). Tested first: `validate()` catches mixed literal operands, the error code stays `type-check` everywhere, the differential didn't move, and no test changed. The body keeps its own check, which names the mode and still runs when `runtimeTypeCheck` is off; `expect` doesn't conflict.
- **The generic `homogeneous` message is better for every operator** (Carl): its `actual` was always "mixed types", even for `[true, false]`. It is now the first two types that differ (`received string beside number`), or the one disallowed type (`received array of boolean`), so `min`, `max` and `multiply` gain it too.
- **The descriptions** are as drafted: `power.base` "The number to raise", `power.exponent` "The power to raise it to", `round.value` "The number to round", `floor` / `ceil` "The number to round down / up", `abs` "The number", `lower` / `upper` / `trim` "The string to lowercase / uppercase / trim". `unary` and `normalizer` take the value's description as an argument. The test is in the editor-hints drift tests.
- **`literal` goes in `operatorHints`** (Carl), since the editor draws it as an operator node. The drift test's key set is the package's operators plus `literal`; the display checks run over every entry, and `literal` has its own seed test. Colour: a shade of Other's slate (`#d5dae4` on `#272a30`). Seed: the editor's `'No content inside a literal node is evaluated'` (Claude's pick, since the alternative, a demonstration like `'$data.name'`, wasn't chosen between).
- **`buildString` seeds `'Hello {{$data.name}}'`** (Carl), and the `substitutions` seed is dropped, since it would match no token. Without data it renders `"Hello "`, and under `strictDataPaths` it throws.
- **Size:** `operatorHints` 1.44 → 1.46 kB; the root with its chunk 34.98 → 35.08 kB.

---

## Step 3: Actionable `validate()` issues

**Status:** Done (`82e9201` the suggestion field, `8d7ee44` the sample-data paths, 2026-09-30). #179, an earlier issue asking for the sample-data half, closed by `8d7ee44`; #200 commented that items 1 and 3 are done, with the three possible suggestion follow-ups.

**Items**

- #200.1: a machine-readable `suggestion` field on unknown-name issues, beside the did-you-mean already in the message. The sites that compute one:
  - `unknown-node-key` on an operator ([src/compile/compile.ts:733](../src/compile/compile.ts#L733)) and on a fragment call ([src/compile/staticChecks.ts:394](../src/compile/staticChecks.ts#L394));
  - `unknown-operator` ([compile.ts:629](../src/compile/compile.ts#L629));
  - `unknown-fragment` ([compile.ts:1603](../src/compile/compile.ts#L1603));
  - the shorthand's `unrecognized-identifier` warning ([compile.ts:1759](../src/compile/compile.ts#L1759)).

  Also give the operator's `unknown-node-key` the unknown key as `parameter`, as the fragment-call version and `missing-required` already do.

- #200.3: `missing-data-path` warnings at the path of each reading node (a reference string, a `get` node with a literal path, or a string holding a `{{$data.…}}` token), one per reading node, where today there is one per path, at `path: []` ([src/validation.ts:60](../src/validation.ts#L60)). The dependency record keeps each reading node's path beside its segments.

**Touches**

- The `Issue` type, which is exported from the root: a spec change first.
- The five sites above; `validation.ts`; the compiler's dependency record.

**Open questions**

(none)

**Decisions**

- **`suggestion?: string` on `Issue` is a drop-in replacement for what was written** (Carl): the bare name at four sites, and the key with its sigil (`'$plus'`) at the shorthand warning, since the key is what gets replaced. The rename fix is then the same everywhere; the picker strips the `$` where the code says it's there. An alias may be suggested, as `nearestName` computes it. The field is absent when there is no suggestion, like `operator` / `fragment` / `parameter`.
- **The operator's `unknown-node-key` gains `parameter`**, and **the shorthand warning's path moves to the key** (Carl): `['condition', '$graeterThan']` rather than `['condition']`, so an issue about a key sits at that key, as `unknown-node-key` does, and no `key` field is needed. Its `order` stays the containing object's, so `inspect()` still links it to the object that passes through as data.
- **Only the five sites that compute a suggestion get the field** (Carl). Possible follow-ups, if the editor wants them: an unrecognized reference namespace (`'$dta.x'` → `$data`), `unresolved-var` (a var in scope) and `unresolved-param` (a declared parameter). The var case needs scope resolution, the ground step 5 covers.
- **The sample-data check reads a separate list of reads** (Carl): `dependencies.dataPaths` stays the deduplicated set, and the artifact gains a list of each read's segments and reading node's path, in tree order, the path kept as the compiler's linked path until a warning needs it. One warning per reading node; two identical tokens in one template string are one reading node. Each distinct path is resolved against the sample once.
- **A fragment body's reads are reported at the call** (Carl), one per call and missing path, with the fragment named in the message, since the body's paths aren't in the caller's expression. The call record carries the call's path for this, so a call inside a body composes the same way at registration.
- **Neither `getDependencies()` nor `inspect()` reports the reads** (Carl). `getDependencies()` answers what an expression needs, not where; `inspect()` runs the same check as `validate()` (`validationIssues`), so its warnings carry the paths already.
- **Two commits on `v3.0-dev`**: the suggestion field, then the sample-data paths, each with its spec changes.
- **Built as agreed, with two findings.** The sample-data warnings carry no `order` in `inspect()`, since the `inspect()` spec gives `order` only to compile-stream entries; a call's reads come from its registry entry, which registration completes, so a body artifact holds no half-composed copy. The root with its chunk grows 35.08 → 35.30 kB brotli.

---

## Step 4: Fragment result types

**Status:** Not started

**Items**

- #200.2: at registration, infer each fragment's result type from its body's root, and report it on `getFragments()` as `returns`:
  - an operator node, in any face: its declared `returns`;
  - a fragment call: the called fragment's inferred type (the rollup pass visits fragments in reverse topological order, so it's available);
  - `literal`: its content's type;
  - a constant: its own type;
  - a plain object or array: `object` or `array`;
  - a reference: `any`;
  - a `fallback` on the root is ignored, as the operator check ignores it.

  Then extend `returns-mismatch` to fragment calls in parameter positions. The feeding check runs only where `supplied.kind === 'operator'` ([src/compile/staticChecks.ts:322](../src/compile/staticChecks.ts#L322)).

- #200.2 (second part): the same feeding check for plain containers, so `{ $round: { value: { a: '$data.x' } } }` is reported.

**Touches**

- `FragmentInfo` and `getFragments()` ([src/FigTree.ts:282](../src/FigTree.ts#L282)), part of the root contract: a spec change first.
- Fragment registration ([src/fragments.ts](../src/fragments.ts)) and its rollup pass; `staticChecks.ts`.

**Open questions**

- **Order within the step.** The container check is independent and smaller, so it could land first.
- **Fragment calls with arguments.** A body whose root is `$params.x` is a reference, so `any`. Confirm nothing more is wanted there, such as reading a declared parameter's type.
- **Differential impact.** New static errors could move cases in the baseline.

**Decisions**

(none yet)

---

## Step 5: `renameBinding`

**Status:** Not started

**Items**

- #200.5: a scope-aware rename in `./format`, for example `renameBinding(expression, fig, { at, from, to })`, where `at` is the path of a `vars` block or an iterator. It renames the declaration and every reference that resolves to it, and returns the new expression with the paths it updated and the paths it refused. It covers:
  - **a var:** reference strings in its scope (including a `get`'s `from` and sibling vars) and `{{$vars.…}}` tokens in `buildString` templates, leaving references that read a shadowing var alone, and keeping short spellings (`$v.`);
  - **an iterator's `as`**, whether changed, added or removed: `$order` / `$orderIndex`, or `$element` / `$index` where they resolve to that iterator;
  - **a declared fragment parameter** in a fragment body: `$params.name`.

  It refuses a reference where the new name is declared closer, and one that would need a name the author can't write (the outer element inside a nested iterator without `as`, when `as` is removed).

**Open questions**

- **Where the scope rules come from.** They live in the compiler (`resolveVar`, [src/compile/staticChecks.ts:474](../src/compile/staticChecks.ts#L474)), as does the template-token grammar, and lint stops `./format` importing the compiler. Either extract the resolution rules and the token grammar into small shared modules that `./format` may import, or put the function somewhere other than `./format`. This needs its own design pass before any building.
- **Timing.** The editor plans the quick fix this backs for after its first build, so this step can wait until steps 1–4 are in.

**Decisions**

(none yet)
