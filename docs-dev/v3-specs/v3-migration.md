# FigTree v3 — Migration & conversion

_Working document — first sketch (Claude, July 2026), awaiting review. This is the last v3 design area. It discharges every deferral tagged "→ migration doc" or "→ Migration area" across the other docs: the `./migrate` module contents ([v3-packaging.md](v3-packaging.md) § `./migrate`), the CUSTOM_FUNCTIONS wrapper recipe ([v3-api.md](v3-api.md) Extensibility § Migration; [v3-operator-contract.md](v3-operator-contract.md)), the recycled-names callouts and operator/option disposition tables ([v3-api.md](v3-api.md)), the `evaluateExpression` one-liner ([v3-evaluator-methods.md](v3-evaluator-methods.md)), and the round-trip-utility homes. It unblocks [implementation-plan](v3-implementation-plan.md) Phase 15. Open questions collected at the end._

_It leans on [v3-testing-strategy.md](v3-testing-strategy.md), which owns the converter's *validation* method (the differential runner) and the divergence-catalog tags — this doc owns the converter's *shape and behaviour*, and the scope of the human-facing guide the catalog feeds._

_Amended at Phase 15 (September 2026) from the converter's design, [v3-converter.md](v3-converter.md), agreed with Carl: the module surface gains `migrateV2Fragments` and the v2 options, the custom-function recipe becomes a suggestion, the issue shape gains `code` and points at that doc's catalogue, and open questions 2 and 4 are answered. That doc is the design of how conversion works; this one stays the contract for what it promises._

## Two artifacts, one area

The area produces two things that are easy to conflate:

1. **The converter** — code shipped in the `./migrate` subpath. Mechanical, best-effort, testable against the oracle. Turns stored v2 expression trees into v3 ones.
2. **The migration guide** — prose shipped in the repo (`MIGRATION.md`, rendered into the docs site). What a human reads to upgrade: what changed, what the converter can't do for them, what to watch for. Partly generated from operator/option metadata, partly hand-written.

The division of labour is the spine of this whole area: **the converter does everything mechanical; the guide covers everything that needs a human.** Every ruling below serves that split.

## The upgrade, in one sentence

v3 ships as `fig-tree-evaluator@3.0.0` — same package identity, clean break in content ([v3-packaging.md](v3-packaging.md) § Publishing). Upgrading is: bump the dependency, run the converter over your stored expression trees once, review its report, hand-fix what it flags. Conversion is an **author-time / build-time step over your config, not a runtime accommodation** — this is the frame that kills the `v2Compat` flag (ruling below).

## `./migrate` — the module surface

Two functions, whose types export from the root. The root entry never imports it, and it imports types only from the root. Isolation is [v3-packaging.md](v3-packaging.md)'s; contents are fixed here, and designed in "Surface" in [v3-converter.md](v3-converter.md):

| Export                    | Kind                                                            | Purpose                                                                                                                                                                                                        |
| ------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrateV2Expression`     | `(expression: unknown, options?: V2Options) => MigrationResult` | converts one v2 expression tree to v3                                                                                                                                                                          |
| `migrateV2Fragments`      | `(options: V2Options) => FragmentMigrationResult`               | converts the fragment definitions in `options.fragments`                                                                                                                                                       |
| `V2Options`               | type, from the root                                             | the part of v2's options that changes how an expression is read ("What the converter reads" in [v3-converter.md](v3-converter.md)); other keys are ignored, so a script can pass its real v2 options unchanged |
| `MigrationResult`         | type, from the root                                             | `{ expression, issues: MigrationIssue[] }` (shape below)                                                                                                                                                       |
| `FragmentMigrationResult` | type, from the root                                             | `{ fragments, issues: MigrationIssue[] }`: every definition, keyed as in the input unless renamed (shape below)                                                                                                |
| `MigrationIssue`          | type, from the root                                             | one catalogued divergence, with its code and tag (shape below)                                                                                                                                                 |

**Amended at Phase 15** (the converter's design, agreed with Carl): the Phase-14 ruling below had `./migrate` hold `migrateV2Expression` and nothing else. Fragment definitions get their own function because a fragment body is read differently from an expression, since its `$name` strings are parameter placeholders and its `metadata` key belongs to the definition, and because converting them is a once-per-host job where expressions are converted by the hundred. Conversion is still all the subpath is for.

### Parked: no shorthand round-trip utilities in 3.0

**Ruled (Carl, September 2026, Phase-14 review).** `./migrate` is for converting v2 expressions to v3, and nothing else: at this ruling, `migrateV2Expression` and its two types, joined at Phase 15 by `migrateV2Fragments` and two more (above). The `toShorthand` / `fromShorthand` pair this table carried as the editor's round-trip tools is not part of 3.0. A v3 expression can take several faces — canonical, shorthand with named arguments, shorthand with positional arguments — so converting between them in a way that means something needs its own design, not a table row. **Revisit after the 3.0 release.**

One constraint for that design, found at the same review: any such utility needs registry input, in both directions. `{ $plus: [1, 2] }` is an operator node only if `plus` is registered, mapping `[1, 2]` to named parameters needs `plus`'s `positionalParams`, and fragments are called with `$name` too — the limit that ruled out the structural node guards ("v2 root-export disposition" in [v3-packaging.md](v3-packaging.md)).

### Ruling: `migrateV2Expression` is a pure function carrying its own v2 tables

No `FigTree` instance argument (v2's converters took one, to read live operator metadata). v3 **deleted** the alias machinery and `parseChildren` functions the v2 converter leaned on, so the converter instead carries a **static, embedded v2-reference table** — the ~95 operator-name aliases, the property aliases, and the positional `parseChildren` mappings, mined from v2 as data (Phase 0's "mined, never ported" asset; generated from the published v2 package, per "The v2 reference table" in [v3-converter.md](v3-converter.md)). That table, with the per-operator rules beside it, _is_ the v2→v3 rule delta in machine form; it is the converter's, not the runtime's, and the runtime never sees it. A pure signature, over the expression and the v2 options that change how it is read, also means the converter runs anywhere — a CLI over a directory of config files, a CI check, the editor — with no evaluator construction.

### Ruling: best-effort, never throws

`migrateV2Expression` always returns a `MigrationResult`. A node it cannot convert becomes a **best-effort placeholder** (the closest v3 node, or the original subtree wrapped in `literal` when nothing safe exists) plus a tagged `issue` — it does **not** throw. Rationale: the common job is batch-converting a directory of stored configs; throwing on the first hard node would abort the whole run and force whack-a-mole. This mirrors `mode: 'report'`'s production-resilience posture ([v3-evaluator-methods.md](v3-evaluator-methods.md)) — collect everything, decide what to fix from the full picture. The result's `issues` array is the machine-readable divergence catalog for that tree.

```ts
interface MigrationResult {
  expression: unknown // the converted v3 tree (best-effort where issues exist)
  issues: MigrationIssue[] // empty ⇒ clean, fully-mechanical conversion
}

interface FragmentMigrationResult {
  fragments: Record<string, FragmentDefinition> // every definition, keyed as in the input unless renamed
  issues: MigrationIssue[] // paths rooted at the fragments object: ['getFlag', …]
}

interface MigrationIssue {
  code: 'split-trailing-empty' | 'remainder-sign' | … // kebab-case and stable
  tag: 'non-convertible' | 'intentional-semantic-change' | 'lossy-default'
  path: (string | number)[] // location in the *source* tree
  message: string // what differs, when it matters, and the fix
}
```

The three tags are [v3-testing-strategy.md](v3-testing-strategy.md)'s divergence-catalog vocabulary, reused verbatim so a converted tree's `issues` and the differential runner's catalog are the same shape. `code` names the issue within its tag, since three tags are too coarse to act on: it lets a page group issues, a script accept the ones it has checked, and the differential match a divergence to its issue. Every code is listed in "The issue catalogue" in [v3-converter.md](v3-converter.md). A `non-convertible` message is also written into the placeholder's `//` key, prefixed `v2 conversion: `, so it stays with the node when a script loses the `issues` array ("Placeholders" in [v3-converter.md](v3-converter.md)).

## What converts mechanically (issue-free)

The bulk. Driven by the embedded table and the per-operator rules ("The v2→v3 rules" in [v3-converter.md](v3-converter.md)):

- **Operator & alias normalization** — every v2 name and symbolic/word alias → its v3 canonical name, per [v3-api.md](v3-api.md) § v2→v3 operator disposition. Includes the recycled names (`!`, `get`, `lower`, `join`, `data`, `convert`): the converter maps these **correctly** — the hazard is entirely human (guide § Recycled names), never the converter's.
- **`children` arrays → named parameters**, via the embedded positional mappings, since the converter writes canonical v3. This is also the sole v1 accommodation (see ruling below).
- **`getData` / OBJECT_PROPERTIES → `get`**, everyday form to a `"$data.…"` string; a v2 `getData` + `fallback` maps near-losslessly to `get` + `missingPathDefault` ([v3-api.md:422](v3-api.md#L422)), preserving the null-vs-missing distinction.
- **`greaterThan`/`lessThan` with `strict: false` → `greaterThanOrEqual`/`lessThanOrEqual`** ([v3-api.md:349-350](v3-api.md#L349-L350)).
- **GET / POST → `http`** with `method` set ([v3-api.md:357-358](v3-api.md#L357-L358)). Mechanical on the _expression_, though every converted `http` and `graphQL` node carries a `response-collapse` issue, since v2's collapse of single-key objects in a response depends on the response ("Batch 4: I/O" in [v3-converter.md](v3-converter.md)). The guide notes the host must register `httpOperators(client)` — registration is not the converter's to do.
- **Plain objects v2 read as data.** v2 looked inside a plain object only with `evaluateFullObject` on, and v3 evaluates everything, so a plain object holding anything v3 would evaluate or consume is wrapped in `literal`. The converter reads `evaluateFullObject` from the v2 options, so the wrap is a rule rather than a guess, and carries no issue ("The `literal` wrap" in [v3-converter.md](v3-converter.md)).
- **Options are read, not rewritten.** The converter reads the v2 options that change how an expression is read (`V2Options`: the fragments, the function names, `evaluateFullObject`, `noShorthand`, `caseInsensitive` and `useCache`), and converts the fragment definitions through `migrateV2Fragments`. The other moved options — `baseEndpoint`/`headers` → `http` block, cache options → `cache.*`, `returnErrorAsString` → `mode: 'report'`, etc. ([v3-api.md](v3-api.md) § option disposition) — are migrated by hand, from the guide's table.

## What emits an issue

"The issue catalogue" in [v3-converter.md](v3-converter.md) lists every issue the converter emits, with its code, tag, path and message, and nothing emits an issue that is not listed there. By tag:

- **`intentional-semantic-change`** — the node converts, but v3's rules can give a different result by design, in a way that depends on the data and that no v3 check finds later. The everyday cases are every converted `outputType` (v3's `convert` is strict, so v2's number-mining — `outputType: 'number'` on `"abc4.5xyz"` → `4.5` — is gone, with `regex` extract + `convert` as the replacement), every `split` (v2 dropped a trailing empty piece), every `http` and `graphQL` (the response collapse), and a `fallback` that caught missing data in v2.
- **`lossy-default`** — something v2 discarded, or applied from outside the expression, which the converter removes or cannot carry: a value v2 never read because another spelling won, `values` beyond the two a binary operator compares, v2's instance-wide `caseInsensitive`, a fragment name renamed so that v3 can register it.
- **`non-convertible`** — no mechanical v3 equivalent. The node becomes a placeholder, with the message in its `//` note: a computed or unrecognized value the rule chooses by, a computed operator, function or fragment name, a template part v3 has no counterpart for, and every custom-function call (below).

**Null policy** gets no issue. v2's ad-hoc null handling → v3's type-driven null-policy vocabulary ([v3-api.md](v3-api.md) Type § Null policy). Most trees are unaffected, and where one is, the difference depends on the data, so the converter does not flag it: the guide lists the differences ("Per operator" in [v3-converter.md](v3-converter.md)). The same holds for v3's other general rules, such as no implicit coercion.

### CUSTOM_FUNCTIONS

The one case that always needs the host, because the function _bodies_ were never in the expression tree — they lived in the host's `functions` option as JS the converter never sees. A host's v3 operator can also declare whatever parameters suit it, so the converter cannot know a call's v3 shape. So:

1. **It rewrites each call to the nearest v3 call on the function's name**, since the arguments are v2 expressions that need converting regardless. Positional `args` become a shorthand call (`{ $X: […] }`), and a call with an `input` names it (`{ operator: 'X', input: …, args: […] }`) ("Batch 5: custom functions" in [v3-converter.md](v3-converter.md)).
2. **It puts a `non-convertible` issue on every call site**, not one per function name, saying the call must be checked against the operator the host registers. Where the name holds a `.` or is a core operator's, the issue also says to register it under another name and rename the call.

The wrapper recipe below is the suggested registration.

## Ruling: v1 (`children`) support is dropped from v3

_(Confirmed with Carl, July 2026.)_ `./migrate` is **v2→v3 only**. v3 carries no dedicated v1 path and no `convertV1ToV2`. Rationale:

- v1's `children`-array syntax predates v2 by years; anyone still on it in 2026 has a two-hop path via the **still-published v2** (`v2` dist-tag, fix-only — [v3-packaging.md](v3-packaging.md) § Publishing): run v2's `convertV1ToV2`, then v3's `migrateV2Expression`.
- v1 has **no frozen test corpus** (the oracle is the v2 suite), so a first-class v1→v3 path would ship untested by the one mechanism that makes the converter trustworthy.
- It is exactly the relic-carrying v2 itself over-served (`supportDeprecatedValueNodes`, kept longer than it earned — [v3-api.md:652](v3-api.md#L652)).

**One concession, free:** because `children` is just v2's positional form and the converter already owns the positional-mapping table, `migrateV2Expression` **recognizes a stray `children` array and maps it as positional input** on a best-effort basis — enough that a mostly-v2 tree with a v1 remnant doesn't hard-fail. This is a courtesy inside the v2 converter, not a supported, tested v1→v3 product. The guide states plainly: v1 users convert via v2 first.

This **overrides** [v3-packaging.md](v3-packaging.md)'s v2-root-export table, which provisionally listed `convertV1ToV2` / `isV1Node` as "moved & reshaped → `./migrate`". Under this ruling they are **deleted**, not moved (packaging doc amended to match).

## Ruling: no `v2Compat` runtime flag

_(Confirmed with Carl, July 2026.)_ The assessment ([v3-assessment.md:271](v3-assessment.md#L271)) floated an optional runtime flag accepting old aliases and `children` with deprecation warnings for one major cycle. **Rejected.**

- v3's performance model and its entire grammar rest on **compile-once**: recognition, alias normalization and positional mapping happen at compile and never again. A runtime compat flag would resurrect the per-visit alias tables and `standardiseOperatorName` machinery the redesign deliberately deleted — the single biggest simplification, undone by an option.
- It confuses the layer. Accepting deprecated _syntax_ is an **authoring** concern, and authoring is strict (the disruption-gradient stance: runtime grace, authoring strictness). Runtime grace is about _evaluation_ resilience — a missing datum resolving to `null`, `mode: 'report'` degrading gracefully — never about tolerating dead syntax.
- The clean-break posture ([v3-packaging.md](v3-packaging.md)) means the upgrade _is_ the conversion step. A flag that let hosts skip it would strand them one `updateOptions` away from silent alias behaviour forever.

## The migration guide (prose)

A single hand-authored `MIGRATION.md`, rendered into the docs site. Its disposition tables are **generated from the same metadata that generates the README operator reference** (assessment §3.6's single-source commitment — [v3-packaging.md](v3-packaging.md) § Build), so operator names, aliases and defaults can never drift from the runtime. Its prose sections are written once. Contents:

- **Upgrade at a glance** — same package, `3.0.0`, clean break; the four-step path (bump → convert → review report → hand-fix). Points at the converter.
- **Operator disposition** _(generated)_ — the [v3-api.md](v3-api.md) § v2→v3 operator table.
- **Recycled names — read this** _(hand-written, loud)_ — `!`, `get`, `lower`, `join`, `data`, `convert` ([v3-api.md:366-377](v3-api.md#L366-L377)). The converter handles them; **human muscle memory won't**, so anyone hand-editing or reading converted output needs the callout.
- **Option disposition** _(generated where possible)_ — the [v3-api.md](v3-api.md) § option table, each deleted option with its v3 replacement.
- **Method-surface changes** _(hand-written)_ — `FigTreeEvaluator` → `FigTree`; `evaluateExpression(expr)` → `new FigTree().evaluate(expr)` (the one-liner [v3-evaluator-methods.md:484](v3-evaluator-methods.md#L484) defers here, with its compile-cache caveat); the deleted introspection/guard methods and their replacements ([v3-packaging.md](v3-packaging.md) § v2 root-export disposition).
- **Custom functions** _(hand-written)_ — the wrapper recipe below, as the suggested registration. It is a suggestion, not a shape the converter relies on: the converter writes each call in its nearest v3 form and flags every call site for checking against the host's operator (CUSTOM_FUNCTIONS, above).
- **Intentional semantic changes** _(hand-written)_ — no implicit coercion (`outputType`/number-mining → `convert` + `regex`), the null-policy deltas, deep-evaluation-by-default, and **`updateOptions` now merges `data` and `fragments`** where v2 replaced them wholesale (one rule, uniform with per-call options — so a v2 host that relied on replacement to _drop_ a data key or a fragment has no v3 equivalent; see the removal position in the Options area and issue #157). The "your results may differ, on purpose" list.
- **`getOptions()` no longer reports the registry** _(hand-written, short)_ — the v2 idiom `...exp.getOptions().fragments`, used to extend the fragment set without clobbering it, reads `undefined` in v3. It is also unnecessary: `updateOptions({ fragments })` merges. `getFragments()` is the introspection route, and it returns declarations rather than bodies, so a fragment body cannot be round-tripped out of an instance at all.
- **Client & connection setup** _(hand-written)_ — I/O is now opt-in by construction: register `httpOperators(client)` / `sqlOperators(connection)`; the SQL wrappers are renamed ([v3-packaging.md](v3-packaging.md) open Q2).

### The custom-function wrapper recipe

A v2 host function:

```js
// v2 options
functions: {
  getFullName: (first, last) => `${first} ${last}`,
}
// v2 call site
{ operator: 'customFunctions', functionName: 'getFullName', args: ['$data.first', '$data.last'] }
```

can become a v3 first-class operator with a **single rest-positional `args` parameter spread into the original function**:

```js
// v3: re-register once, at construction
const getFullName = defineOperator({
  name: 'getFullName',
  category: 'other',
  description: 'Joins a first and a last name',
  parameters: { args: { type: 'array', description: 'The arguments, as v2 passed them' } },
  positionalParams: ['...args'],
  evaluate: ({ args }) => rawGetFullName(...args), // your v2 body, unchanged, spread
})
new FigTree({ operators: [coreOperators, getFullName] })
```

```jsonc
// v3 call site — what the converter writes for a call with positional `args`
{ "$getFullName": ["$data.first", "$data.last"] }
```

The author keeps their function body verbatim; only the registration wrapper is new. v2 called a function as `f(input, ...args)`, so a call that passed `input` has no positional reading, and the converter names it: `{ "operator": "getFullName", "input": …, "args": […] }`. A host whose function takes `input` declares an `input` parameter beside `args`. The recipe is one way to register, not the only one: the shorthand array binds to whatever positional parameters the host's operator declares, which is why the converter flags every call site rather than assume this shape.

## Divergence catalog — the shared output

The catalog is [v3-testing-strategy.md](v3-testing-strategy.md)'s first-class deliverable (it feeds these guide sections) and this doc's `MigrationIssue` stream is its runtime form — same three tags. Phase 15.2's differential runner accumulates every tree's issues into the master catalog; the `intentional-semantic-change` and `lossy-default` entries become the guide's "semantic changes" prose, and the `non-convertible` entries become its "you must do this by hand" list. Writing the converter is expected to surface spec gaps (testing-strategy § Notes on sequencing) — each is a spec-refinement loop, not a coding decision.

## Open questions

1. **Guide home & format.** `MIGRATION.md` at repo root vs `docs/MIGRATION.md` vs a docs-site page; and how much is generated vs hand-written (the tables clearly generated — is anything else?). Low stakes, decide at Phase 15.
2. **Does the converter accept an options object too, or expressions only?** The option-disposition rewrite (moved cache keys, `returnErrorAsString` → `mode`, client factories) is useful but a different input shape than an expression tree. Ship `migrateV2Expression` for trees only and document option changes as a manual table, or add a sibling `convertV2Options`? Leaning trees-only (options are edited by hand once per host; expressions are the bulk data) — confirm. — **Answered at Phase 15 ([v3-converter.md](v3-converter.md), agreed with Carl): options are read as context, fragments are converted, and the other options are migrated by hand.** `migrateV2Expression` takes the v2 options that change how an expression is read, `migrateV2Fragments` converts `options.fragments`, and there is no `convertV2Options`.
3. **CLI wrapper?** A tiny `npx fig-tree-convert <glob>` over a directory would make the batch story real, but it's a bin script with its own arg-parsing and file-IO surface, arguably out of a zero-dependency library's scope. In-package bin, separate tiny package, or documented "here's the 10-line script" recipe? Leaning recipe.
4. **`literal`-wrap heuristic for deep-eval loss.** What exactly triggers the converter to wrap a bare object (§ lossy-default)? Any object with no recognized node keys anywhere in its subtree is the safe-but-aggressive rule; a narrower heuristic risks under-wrapping. Settle when Phase 15 has the corpus to measure against — this is the likeliest spec-gap the differential surfaces. — **Answered at Phase 15 ([v3-converter.md](v3-converter.md), agreed with Carl): by `evaluateFullObject`, which the converter reads from the v2 options.** With it off, v2 treated every plain object as data, so the wrap is a rule, not a heuristic: a plain object is wrapped when anything inside it is something v3 evaluates or consumes ("The `literal` wrap").
