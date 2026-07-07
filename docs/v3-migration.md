# FigTree v3 — Migration & conversion

*Working document — first sketch (Claude, July 2026), awaiting review. This is the last v3 design area. It discharges every deferral tagged "→ migration doc" or "→ Migration area" across the other docs: the `./convert` module contents ([v3-packaging.md](v3-packaging.md) § `./convert`), the CUSTOM_FUNCTIONS wrapper recipe ([v3-api.md](v3-api.md) Extensibility § Migration; [v3-operator-contract.md](v3-operator-contract.md)), the recycled-names callouts and operator/option disposition tables ([v3-api.md](v3-api.md)), the `evaluateExpression` one-liner ([v3-evaluator-methods.md](v3-evaluator-methods.md)), and the round-trip-utility homes. It unblocks [implementation-plan](v3-implementation-plan.md) Phase 15. Open questions collected at the end.*

*It leans on [v3-testing-strategy.md](v3-testing-strategy.md), which owns the converter's *validation* method (the frozen V2 corpus as oracle, the differential runner) and the divergence-catalog tags — this doc owns the converter's *shape and behaviour*, and the scope of the human-facing guide the catalog feeds.*

## Two artifacts, one area

The area produces two things that are easy to conflate:

1. **The converter** — code shipped in the `./convert` subpath. Mechanical, best-effort, testable against the oracle. Turns stored v2 expression trees into v3 ones.
2. **The migration guide** — prose shipped in the repo (`MIGRATION.md`, rendered into the docs site). What a human reads to upgrade: what changed, what the converter can't do for them, what to watch for. Partly generated from operator/option metadata, partly hand-written.

The division of labour is the spine of this whole area: **the converter does everything mechanical; the guide covers everything that needs a human.** Every ruling below serves that split.

## The upgrade, in one sentence

v3 ships as `fig-tree-evaluator@3.0.0` — same package identity, clean break in content ([v3-packaging.md](v3-packaging.md) § Publishing). Upgrading is: bump the dependency, run the converter over your stored expression trees once, review its report, hand-fix what it flags. Conversion is an **author-time / build-time step over your config, not a runtime accommodation** — this is the frame that kills the `v2Compat` flag (ruling below).

## `./convert` — the module surface

Functions and types only; the root entry never imports it; it may import the root (built on the parser's normalizer). Isolation is [v3-packaging.md](v3-packaging.md)'s; contents are fixed here:

| Export | Kind | Purpose |
|---|---|---|
| `convertV2ToV3` | `(expr: unknown) => ConversionResult` | the migration converter — v2 (or v1-relic `children`) expression trees → v3 |
| `ConversionResult` | type | `{ expression, issues: ConversionIssue[] }` (shape below) |
| `ConversionIssue` | type | one catalogued divergence, tagged (shape below) |
| `toShorthand` | `(expr, definitions) => expr` | canonical v3 node → shorthand face; needs the definitions for `positionalParams` |
| `fromShorthand` | `(expr) => expr` | shorthand face → canonical v3 node; the parser's normalizer, exposed standalone |

`toShorthand` / `fromShorthand` are **not migration** — they are the editor's round-trip tools, homed here because `./convert` is the tooling-side subpath and the evaluator-methods ruling already decided they are not instance methods. They operate on v3 syntax only (v3 in, v3 out). Recorded here so the subpath's surface is complete in one place.

### Ruling: `convertV2ToV3` is a pure function carrying its own v2 tables

No `FigTree` instance argument (v2's converters took one, to read live operator metadata). v3 **deleted** the alias machinery and `parseChildren` functions the v2 converter leaned on, so the converter instead carries a **static, embedded v2-reference table** — the ~95 operator-name aliases, the property aliases, and the positional `parseChildren` mappings, mined from the v2 source as data (Phase 0's "mined, never ported" asset). That table *is* the v2→v3 rule delta in machine form; it is the converter's, not the runtime's, and the runtime never sees it. A pure `(expr) => result` signature also means the converter runs anywhere — a CLI over a directory of config files, a CI check, the editor — with no evaluator construction.

### Ruling: best-effort, never throws

`convertV2ToV3` always returns a `ConversionResult`. A node it cannot convert becomes a **best-effort placeholder** (the closest v3 node, or the original subtree wrapped in `literal` when nothing safe exists) plus a tagged `issue` — it does **not** throw. Rationale: the common job is batch-converting a directory of stored configs; throwing on the first hard node would abort the whole run and force whack-a-mole. This mirrors `mode: 'report'`'s production-resilience posture ([v3-evaluator-methods.md](v3-evaluator-methods.md)) — collect everything, decide what to fix from the full picture. The result's `issues` array is the machine-readable divergence catalog for that tree.

```ts
interface ConversionResult {
  expression: unknown          // the converted v3 tree (best-effort where issues exist)
  issues: ConversionIssue[]    // empty ⇒ clean, fully-mechanical conversion
}

interface ConversionIssue {
  tag: 'non-convertible' | 'intentional-semantic-change' | 'lossy-default'
  path: (string | number)[]    // location in the *source* tree
  message: string              // what happened and what the human must check
  // 'non-convertible' issues additionally point at the guide section for the fix
}
```

The three tags are [v3-testing-strategy.md](v3-testing-strategy.md)'s divergence-catalog vocabulary, reused verbatim so a converted tree's `issues` and the differential runner's catalog are the same shape.

## What converts mechanically (issue-free)

The bulk. Driven entirely by the embedded table:

- **Operator & alias normalization** — every v2 name and symbolic/word alias → its v3 canonical name, per [v3-api.md](v3-api.md) § v2→v3 operator disposition. Includes the recycled names (`!`, `get`, `lower`, `join`, `data`, `convert`): the converter maps these **correctly** — the hazard is entirely human (guide § Recycled names), never the converter's.
- **`children` arrays → shorthand positional / named params**, via the embedded `parseChildren` mappings. This is also the sole v1 accommodation (see ruling below).
- **`getData` / OBJECT_PROPERTIES → `get`**, everyday form to a `"$data.…"` string; a v2 `getData` + `fallback` maps near-losslessly to `get` + `missingPathDefault` ([v3-api.md:422](v3-api.md#L422)), preserving the null-vs-missing distinction.
- **`greaterThan`/`lessThan` with `strict: false` → `greaterThanOrEqual`/`lessThanOrEqual`** ([v3-api.md:349-350](v3-api.md#L349-L350)).
- **GET / POST → `http`** with `method` set ([v3-api.md:357-358](v3-api.md#L357-L358)). Mechanical on the *expression*; the guide notes the host must register `httpOperators(client)` — registration is not the converter's to do.
- **Moved options** — `baseEndpoint`/`headers` → `http` block, cache options → `cache.*`, `returnErrorAsString` → `mode: 'report'`, etc. ([v3-api.md](v3-api.md) § option disposition). The converter rewrites an options object when given one; the guide's table is the human reference.

## What emits an issue

### `intentional-semantic-change` — converts, but v3's rules produce a different result by design

- **`outputType` (and its `type` alias) → `convert`.** The node converts, but v3's `convert` is strict: v2's implicit number-mining (`outputType: 'number'` on `"abc4.5xyz"` → `4.5`) is **gone** ([v3-api.md:678-685](v3-api.md#L678-L685)). Where a v2 expression relied on mining, the converted tree errors or returns differently; the issue names the site and points at `regex` extract + `convert` as the deliberate replacement.
- **Null policy.** v2's ad-hoc null handling → v3's type-driven null-policy vocabulary ([v3-api.md](v3-api.md) Type § Null policy). Most trees are unaffected; the converter flags the corners the null-policy review catalogued.

These are the null-policy / gradient rulings the testing-strategy anticipated landing under this tag.

### `lossy-default` — the converter must pick a value it can't perfectly justify

- **Deep-evaluation object wrapping.** v3 deep-evaluates the whole input object; v2 default-shallow expressions that relied on a plain object passing through verbatim are the rare loss ([v3-api.md:152](v3-api.md#L152)). The converter wraps a bare object in `literal` when it looks like pass-through data — but it cannot always tell data from a node it should walk, so the wrap is a flagged guess, not a certainty.

### `non-convertible` — no mechanical v3 equivalent

- **CUSTOM_FUNCTIONS.** The single genuinely non-mechanical case, because the function *bodies* were never in the expression tree — they lived in the host's `functions` option as JS the converter never sees. So the converter does the half it can and flags the half it can't:
  1. **Rewrites the call site** mechanically: `{ operator: 'customFunctions', functionName: 'X', args: […] }` → an operator call on `X` by name (`{ $X: […] }`), against the guide's prescribed wrapper shape.
  2. **Emits one `non-convertible` issue per distinct function name**, listing the functions the host must re-register as custom operators (guide § Custom functions), because that re-registration involves host JS the converter has no access to.
  - v2 call sites using a **named-`input` object** rather than positional `args` can't ride the positional wrapper shape mechanically — flagged individually for manual review.

## Ruling: v1 (`children`) support is dropped from v3

*(Confirmed with Carl, July 2026.)* `./convert` is **v2→v3 only**. v3 carries no dedicated v1 path and no `convertV1ToV2`. Rationale:

- v1's `children`-array syntax predates v2 by years; anyone still on it in 2026 has a two-hop path via the **still-published v2** (`v2` dist-tag, fix-only — [v3-packaging.md](v3-packaging.md) § Publishing): run v2's `convertV1ToV2`, then v3's `convertV2ToV3`.
- v1 has **no frozen test corpus** (the oracle is the v2 suite), so a first-class v1→v3 path would ship untested by the one mechanism that makes the converter trustworthy.
- It is exactly the relic-carrying v2 itself over-served (`supportDeprecatedValueNodes`, kept longer than it earned — [v3-api.md:652](v3-api.md#L652)).

**One concession, free:** because `children` is just v2's positional form and the converter already owns the positional-mapping table, `convertV2ToV3` **recognizes a stray `children` array and maps it as positional input** on a best-effort basis — enough that a mostly-v2 tree with a v1 remnant doesn't hard-fail. This is a courtesy inside the v2 converter, not a supported, tested v1→v3 product. The guide states plainly: v1 users convert via v2 first.

This **overrides** [v3-packaging.md](v3-packaging.md)'s v2-root-export table, which provisionally listed `convertV1ToV2` / `isV1Node` as "moved & reshaped → `./convert`". Under this ruling they are **deleted**, not moved (packaging doc amended to match).

## Ruling: no `v2Compat` runtime flag

*(Confirmed with Carl, July 2026.)* The assessment ([v3-assessment.md:271](v3-assessment.md#L271)) floated an optional runtime flag accepting old aliases and `children` with deprecation warnings for one major cycle. **Rejected.**

- v3's performance model and its entire grammar rest on **parse-once**: recognition, alias normalization and positional mapping happen at parse and never again. A runtime compat flag would resurrect the per-visit alias tables and `standardiseOperatorName` machinery the redesign deliberately deleted — the single biggest simplification, undone by an option.
- It confuses the layer. Accepting deprecated *syntax* is an **authoring** concern, and authoring is strict (the disruption-gradient stance: runtime grace, authoring strictness). Runtime grace is about *evaluation* resilience — a missing datum resolving to `null`, `mode: 'report'` degrading gracefully — never about tolerating dead syntax.
- The clean-break posture ([v3-packaging.md](v3-packaging.md)) means the upgrade *is* the conversion step. A flag that let hosts skip it would strand them one `updateOptions` away from silent alias behaviour forever.

## The migration guide (prose)

A single hand-authored `MIGRATION.md`, rendered into the docs site. Its disposition tables are **generated from the same metadata that generates the README operator reference** (assessment §3.6's single-source commitment — [v3-packaging.md](v3-packaging.md) § Build), so operator names, aliases and defaults can never drift from the runtime. Its prose sections are written once. Contents:

- **Upgrade at a glance** — same package, `3.0.0`, clean break; the four-step path (bump → convert → review report → hand-fix). Points at the converter.
- **Operator disposition** *(generated)* — the [v3-api.md](v3-api.md) § v2→v3 operator table.
- **Recycled names — read this** *(hand-written, loud)* — `!`, `get`, `lower`, `join`, `data`, `convert` ([v3-api.md:366-377](v3-api.md#L366-L377)). The converter handles them; **human muscle memory won't**, so anyone hand-editing or reading converted output needs the callout.
- **Option disposition** *(generated where possible)* — the [v3-api.md](v3-api.md) § option table, each deleted option with its v3 replacement.
- **Method-surface changes** *(hand-written)* — `FigTreeEvaluator` → `FigTree`; `evaluateExpression(expr)` → `new FigTree().evaluate(expr)` (the one-liner [v3-evaluator-methods.md:484](v3-evaluator-methods.md#L484) defers here, with its parse-cache caveat); the deleted introspection/guard methods and their replacements ([v3-packaging.md](v3-packaging.md) § v2 root-export disposition).
- **Custom functions** *(hand-written, prescriptive)* — the wrapper recipe below. Prescriptive by necessity: the converter rewrites call sites against **this exact shape**, so an improvised per-host shape would make call-site conversion non-mechanical.
- **Intentional semantic changes** *(hand-written)* — no implicit coercion (`outputType`/number-mining → `convert` + `regex`), the null-policy deltas, deep-evaluation-by-default. The "your results may differ, on purpose" list.
- **Client & connection setup** *(hand-written)* — I/O is now opt-in by construction: register `httpOperators(client)` / `sqlOperators(connection)`; the SQL wrappers are renamed ([v3-packaging.md](v3-packaging.md) open Q2).

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

becomes a v3 first-class operator with a **single variadic positional `args` parameter spread into the original function**:

```js
// v3: re-register once, at construction
const getFullName = defineOperator({
  name: 'getFullName',
  parameters: [{ name: 'args', type: 'array', positional: true /* variadic */ }],
  evaluate: async ({ args }) => rawGetFullName(...args),  // your v2 body, unchanged, spread
})
new FigTree({ operators: [coreOperators, getFullName] })
```

```jsonc
// v3 call site — the converter produces this mechanically
{ "$getFullName": ["$data.first", "$data.last"] }
```

The author keeps their function body verbatim; only the registration wrapper is new, and the converter has already rewritten every call site to match. *(Exact parameter-declaration spelling — `positional`/variadic keyword — is the operator contract's; this recipe fixes the shape the converter targets.)*

## Divergence catalog — the shared output

The catalog is [v3-testing-strategy.md](v3-testing-strategy.md)'s first-class deliverable (it feeds these guide sections) and this doc's `ConversionIssue` stream is its runtime form — same three tags. Phase 15.2's differential runner accumulates every tree's issues into the master catalog; the `intentional-semantic-change` and `lossy-default` entries become the guide's "semantic changes" prose, and the `non-convertible` entries become its "you must do this by hand" list. Writing the converter is expected to surface spec gaps (testing-strategy § Notes on sequencing) — each is a spec-refinement loop, not a coding decision.

## Open questions

1. **Guide home & format.** `MIGRATION.md` at repo root vs `docs/MIGRATION.md` vs a docs-site page; and how much is generated vs hand-written (the tables clearly generated — is anything else?). Low stakes, decide at Phase 15.
2. **Does the converter accept an options object too, or expressions only?** The option-disposition rewrite (moved cache keys, `returnErrorAsString` → `mode`, client factories) is useful but a different input shape than an expression tree. Ship `convertV2ToV3` for trees only and document option changes as a manual table, or add a sibling `convertV2Options`? Leaning trees-only (options are edited by hand once per host; expressions are the bulk data) — confirm.
3. **CLI wrapper?** A tiny `npx fig-tree-convert <glob>` over a directory would make the batch story real, but it's a bin script with its own arg-parsing and file-IO surface, arguably out of a zero-dependency library's scope. In-package bin, separate tiny package, or documented "here's the 10-line script" recipe? Leaning recipe.
4. **`literal`-wrap heuristic for deep-eval loss.** What exactly triggers the converter to wrap a bare object (§ lossy-default)? Any object with no recognized node keys anywhere in its subtree is the safe-but-aggressive rule; a narrower heuristic risks under-wrapping. Settle when Phase 15 has the corpus to measure against — this is the likeliest spec-gap the differential surfaces.
