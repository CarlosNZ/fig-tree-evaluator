# FigTree v3 — `inspect()`: the compiled-expression inspector

_The design record for [#156](https://github.com/CarlosNZ/fig-tree-evaluator/issues/156), built up field by field as each is agreed (Carl, September 2026). It stacks on the `compile()` handle ([#155](https://github.com/CarlosNZ/fig-tree-evaluator/issues/155), PRs #175 → #176). **Agreed:** the purpose, the surface, the stability stance, value conversion, and the top-level fields `version`, `expression`, `options`, `canonicalForm`, `issues`, `timeoutShielded`, `nodeCount`, `maxDepth`, `dependencies` and `own` (provisionally), with the artifact's `holes` folded into `canonicalForm`, its `hasErrors` left to `issues`, and `identityOnly`, `fragmentCalls` and a proposed `fragments` map dropped — every top-level field is decided — and the surface: the standalone `inspect(x, options?)` only, with no method on the handle. **Built** (see "Implementation"); the follow-ups are listed under "Open" at the end._

## Purpose

A dev tool for inspecting the inner structure of a compiled expression — what the compiler made of it: canonical names and parameters, what is constant and what is evaluated, where the holes are, which compiled shape each parameter took. The internal shape is the point, not a by-product: the reader is someone asking how the engine sees an expression. A canonical-expression rendering (the input rewritten in full form, itself valid input) was considered and set aside for exactly that reason — it answers what an expression means, and hides the structure this tool exists to show.

## Surface

- **`inspect(x, options?)`**, a standalone root export, takes the `CompiledExpression` handle `fig.compile()` returns and gives back a plain object — the report. Pretty-printing is the host's: `JSON.stringify(inspect(x), null, 2)`. It is a pure function of the handle: the report is assembled from the source, the artifact and the effective options, and nothing is written anywhere. Nothing in the engine imports it, so a bundle that never imports `inspect` never carries it — #156's decision 3 (a root export, verified) as it stands. Anything but a handle is refused with a `TypeError`.
- **No method on the handle** (Carl, September 2026). A method would be convenience only, and it was weighed two ways. Injected at the constructor (`new FigTree(options, inspect)`), it is the one form in which the method earns its place — the import happens once, where the instance is built, and every other call site gets `x.inspect()` — but it costs the primary constructor a parameter for a dev tool. Injected at `compile()` (`fig.compile(expr, inspect)`), it needs the import at every call site, so it saves nothing over `inspect(fig.compile(expr))`. The standalone function keeps both the constructor and `compile()` clean, and a method is purely additive later. The handle's stand-in `prettyPrint()` is removed with this ruling.
- **A handle only, never a plain expression** (Carl, September 2026). Compiling needs an instance — its operators, fragments and `operatorDefaults` decide what the compiler makes of an expression — so the plain form would be `inspect(fig, expr)`, saving only the `.compile(` in `inspect(fig.compile(expr))`. A bare `inspect(expr)` against an implied core-only registry would report a compile the host's instance never makes, custom operators and fragments reading as unknown. The overload would also blur the signature (a handle or an instance first, `options` moving from second place to third), and compiling on the caller's behalf would put in the compile cache an expression nobody asked to evaluate — the reason `validate()` compiles fresh — or need a second route into the instance to avoid it. Purely additive later.
- **`options` is `CallOptions`**, the per-call shape `validate()` and `evaluate()` take, laid over the options the handle pinned. As with `validate()`, only `data` bears on the report: it drives the sample-data check (see `issues`).
- **Fully JSON-serializable.** The report holds only `null`, booleans, finite numbers, strings, arrays and plain objects, so `JSON.parse(JSON.stringify(report))` deep-equals `report` — a promise with a test. Non-JSON authored values are converted by the rules in "Converting authored values" below.

## Stability

The report's shape follows the compiler and is **outside semver**: it may change in any release, exactly as the artifact types in [src/compile/artifact.ts](../../src/compile/artifact.ts) may. The type is exported — a dev tool without types is painful — and documented as unstable. The top-level **`version`** field carries the library version, so a snapshot or a tool knows what produced a report.

One consequence for [v3-artifact-obligations.md](v3-artifact-obligations.md), whose header rules that no test may depend on the artifact's field shapes: `inspect()` is the one sanctioned reader of those shapes, and its tests move with the compiler by design.

## Top-level fields

| Field                   | Status                                                                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`               | Agreed — the library version                                                                                                                                                                                                                   |
| `expression`            | Agreed                                                                                                                                                                                                                                         |
| `options`               | Agreed                                                                                                                                                                                                                                         |
| `canonicalForm`         | Agreed — the artifact's `root`                                                                                                                                                                                                                 |
| `holes`                 | Dropped — which nodes are holes follows from `canonicalForm`, and each hole's `timeoutFallback` rides its node                                                                                                                                 |
| `issues`                | Agreed — `validate()`'s list, with each compile-stream entry's `order`                                                                                                                                                                         |
| `hasErrors`             | Dropped — `issues` states it: any error-severity entry is what `validate()` calls invalid and `evaluate()` would refuse, and an error carrying an `order` is the compile stream's own                                                          |
| `timeoutShielded`       | Agreed — the artifact's flag, renamed from `shielded` to match `validate()`'s badge                                                                                                                                                            |
| `nodeCount`, `maxDepth` | Agreed — the artifact's numbers as they are: composed through fragment calls, the values the limits compare against                                                                                                                            |
| `dependencies`          | Agreed — the artifact's raw record, not `getDependencies()`'s reshaping; `dataPaths` as the record's canonical renders                                                                                                                         |
| `identityOnly`          | Dropped — a compile-cache eligibility flag, so machinery; the markers in `canonicalForm` show more, literal payloads included                                                                                                                  |
| `own`                   | Agreed, provisionally (Carl may revisit) — the uncomposed `nodeCount`, `maxDepth` and `dependencies`                                                                                                                                           |
| `fragmentCalls`         | Dropped — each call site is a `fragmentCall` node in `canonicalForm`; the per-call depth only feeds `maxDepth` composition                                                                                                                     |
| `fragments`             | Dropped — the names are in `dependencies.fragments` (everything reachable) and `own.dependencies.fragments` (direct calls); declarations, body warnings and each fragment's own reads are `getFragments()`'s, which withholds bodies by ruling |

Nothing of the handle's machinery appears: not the registry, the compile cache or the result store.

### `expression`

The source exactly as provided — the handle's `x.expression` — converted by the value rules. Authored `//` comments and spellings survive here, which is what lets `canonicalForm` drop them. Its markers are the same as `canonicalForm`'s, by the same rule.

### `options`

The effective options — those the handle pinned at compile (`FigTreeOptions` less `operators` and `fragments`), with any the call supplies laid over, which are the options the report's checks ran under — **only those set**, so the block shows what the host changed rather than every default. Most print as they are; four are rendered:

| Option                            | Rendered as                                                                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`                            | `"[supplied: n top-level keys]"` — it can be large and personal                                                                                                 |
| `http.headers`, `graphQL.headers` | Header names kept, every value `"[redacted]"` — they routinely carry `Authorization` tokens, and a report is exactly what gets pasted into bug reports and logs |
| `signal`                          | `"[supplied]"`                                                                                                                                                  |
| `cache.store`                     | `"[supplied]"`                                                                                                                                                  |

### `canonicalForm`

The artifact's `root`: the compiled tree in canonical form, one object per compiled node. The artifact's name is meaningless to a reader, and `compiledExpression` would collide with the `CompiledExpression` class.

```ts
type Path = (string | number)[]
type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

type InspectNode = { order: number; path: Path } & (
  | { kind: 'constant'; value: Json }
  | { kind: 'reference'; reference: string; authored: string; binding?: string }
  | {
      kind: 'operator'
      vars?: Record<string, InspectNode>
      operator: string
      params: Record<string, InspectNode>
      fallback?: InspectNode
      timeoutFallback?: Json // the constant a timeout splices in; present iff shielded
      useCache?: boolean
      instanceDefaults?: string[]
    }
  | {
      kind: 'fragmentCall'
      vars?: Record<string, InspectNode>
      fragment: string
      resolved: boolean
      argumentsMode: 'static' | 'dynamic'
      parameters?: Record<string, InspectNode> | InspectNode
      fallback?: InspectNode
      timeoutFallback?: Json
    }
  | {
      kind: 'skeleton'
      vars?: Record<string, InspectNode>
      shape: Json
      holes: { at: Path; node: InspectNode }[]
    }
  | { kind: 'elements'; elements: InspectNode[] }
  | { kind: 'entries'; vars?: Record<string, InspectNode>; entries: Record<string, InspectNode> }
  | { kind: 'invalid'; raw: Json }
)
```

- **`order`** — the node's position in the compile walk's preorder: the DFS sequence, and the number issues carry, so it is the key that links an issue to its node (the invalid node and its `unknown-operator` error are both #34 in the example). A reader should know two things about it:
  - It is **compile order**, not authored or evaluation order. Reserved modifiers compile first, so `total`'s `fallback` is #30 and its `values` #31; evaluation is concurrent and lazy in any case.
  - It has **gaps**. Every walked value takes a number on entry, before its constancy is known (`walk` in [src/compile/compile.ts](../../src/compile/compile.ts)), and a constant folded into a skeleton's shape leaves no node behind — see "When a constant is a node" below. The gaps cannot be closed, since `order` must match the issues'.
- **`path`** — the node's location in the source as authored: the path issues and `FigTreeError` report. It differs from the node's position in the tree wherever normalization moved things — `["status", "$match", 0]` is `match`'s `value` parameter.
- **Key order** — `order`, `kind`, `path`, then `vars` where present (compiled first, and in scope for everything below it), then the kind's own fields.
- **`reference`** — the canonical spelling: namespace aliases normalized (`$d.customer.name` → `$data.customer.name`), the drill path rendered by `renderSegments` (so a `[*]` projection survives), and an `as` binding under its bound name (`$item.name`, with `binding: "item"`). `authored` keeps the raw spelling.
- **`operator`** — the canonical name only; the registry entry behind it is machinery. `instanceDefaults` lists the keys `operatorDefaults` applied to the node; the values are in `options.operatorDefaults`.
- **`fragmentCall`** — `resolved` is false only where the name resolved to nothing, which is already an error issue. The body is not in the report at all: the names of every fragment reachable are in `dependencies.fragments`, and the rest is `getFragments()`'s (see `fragments` in the table).
- **`timeoutFallback`** — on an `operator` or `fragmentCall` node that is a top-level hole, where the hole has one: the constant itself, converted like any authored value. The key's presence is the fact, so a constant `null` fallback reads as `timeoutFallback: null`. See "Timeout shielding" below.
- **`skeleton`** — `shape` is the constant container with each hole's slot holding `"<hole>"`, and `holes` lists each hole's splice position `at` (relative to the shape) with its node. The `at` list is what identifies the holes, so an authored `"<hole>"` string cannot be mistaken for one. A hole's absolute path is its node's `path`. The shape is filled by the engine's own `splice()`, a placeholder standing in for each hole's value, so it is assembled exactly as evaluation assembles a result. In an object shape the hole keys therefore follow the constant ones rather than keeping their authored places — the artifact's skeleton holds a hole's key only as its `at` — and a `__proto__` key reads as the engine treats it, dropped beside a hole ([#182](https://github.com/CarlosNZ/fig-tree-evaluator/issues/182)).
- **`elements`, `entries`** — one node per element or entry, for the reason below.
- **Left out:** the artifact's `precomputed` slot — nothing sets it.

#### When a constant is a node

Two parts of the example look inconsistent and are not: `"no contact"` is a `constant` node, while `"Due: "` is part of a shape, with no node and no order. What decides it is the delivery mode of the parameter the value sits in, not the value.

- `join`'s `values` is delivered **whole**: the body receives one finished array, with every hole evaluated first. A skeleton is exactly that, so the constants inside it fold into the shape — the walk makes a `ConstantNode` for `"Due: "` (#22), and container assembly keeps only its value. Evaluation then copies only the containers on each splice path and shares the constant parts by reference, which is why constants inside a container are structure rather than work, and why `nodeCount` does not count them.
- `firstOf`'s `values` is **`lazyElements`**: the body receives one handle per element and evaluates them one at a time, stopping at the first non-null — the sequencing is its semantics, since a backup lookup must not fire when the primary answered. A skeleton can only produce the whole array at once, every hole evaluated, and has no "element 2" to hand over; a partly-constant element would dissolve into the enclosing shape entirely. So each element needs a node to build its handle from, the constant included — and a constant node's handle answers at once. `race` (`and`, `or`) and `lazyEntries` (`match`'s branches) have the same need.

The rule: a constant is a node where it fills a slot that needs one — a parameter value, a `fallback`, an element of `elements`, an entry of `entries`, the root — and part of the shape where it sits inside a plain container that has holes. An all-constant literal in any of those slots stays a single `constant` node. The compile-side record is the Phase-5 amendment to B3 in [v3-artifact-obligations.md](v3-artifact-obligations.md). `inspect()` shows this faithfully rather than inventing nodes for folded values, which would need order numbers the artifact does not have.

#### Timeout shielding

`timeoutFallback` is the artifact's shielding precompute (obligation B2): the constant a top-level hole contributes when the whole-evaluation `timeout` fires before it finishes (rule 3 of "`fallback` semantics" in [v3-api.md](v3-api.md)). Only a top-level hole has one, because a timeout is a kill switch — no expression work of any kind runs past the deadline — so the one thing that can happen after it is splicing constants into the root's constant skeleton. A top-level hole's value goes straight into that skeleton, so its constant can be spliced in with no evaluation at all. A deeper node's value feeds an operator body instead: in `{ $plus: [{ $divide: [1, '$data.x'], fallback: 0 }, 1] }`, turning the `divide`'s `0` into a result means running `plus` after the deadline, exactly what the bound forbids. The `divide`'s `fallback` still catches its ordinary failures before the deadline; it has no part in a timeout. Here the `plus` is the hole, it has no fallback, and the expression is unshielded.

A top-level hole takes its `timeoutFallback` from one of three sources, and only the first is visible on the node without it:

- its own constant `fallback` — `total`, `0`, beside its `fallback` node;
- a constant `fallback` in `operatorDefaults` — `contact`, `"unknown"`, which the node otherwise shows only as `instanceDefaults: ["fallback"]`;
- for a fragment call with no `fallback` of its own, the timeout fallback of its target's body, lifted — `greeting`, `"Hello!"`, invisible at the call site.

A dynamic `fallback` (`fallback: '$data.x'`) never counts, since it could start new work past the deadline.

Having a `timeoutFallback` is not the same as being shielded. The expression is `timeoutShielded` only when every top-level hole has one, and shielding is all-or-nothing: a shielded expression assembles on a timeout (finished holes keep their real values, unfinished ones take their timeout fallbacks), while an unshielded one rejects outright and uses none of them. The example has three of six, so a timeout rejects it and its three timeout fallbacks go unused.

Which nodes are top-level holes follows from the tree: each hole of a root skeleton, whether or not it has `vars`; otherwise the root itself, if it is evaluable; none for a constant root. An unshielded top-level hole looks like any other node — the rule identifies it, not a marker.

### `issues`

What `validate()` returns under the same options — the same entries, in the same order — each carrying the `order` of its node where it came from the compile stream:

```ts
type InspectIssue = Issue & { order?: number }
```

- **The list is `validate()`'s, computed on the handle.** `validate()` adds two option-dependent checks to the compile stream: the limit checks (`max-nodes`, `max-depth`) against `maxNodes` / `maxDepth`, and the sample-data check (`missing-data-path`) against `data`. Both read only the artifact and the effective options, which the handle holds, so they move out of `validate()` into one function both call, and the two agree by construction. `inspect()` does not call `fig.validate()`: the handle holds no instance (deliberately — it keeps only what it reads), the instance's current registry and options may no longer be the handle's snapshot, and `validate()` compiles afresh.
- **`order` is present exactly on the entries from the compile stream**, grammar and static checks alike. The report does not tell those two apart: the artifact records no layer, and `code` does not identify one (`unresolved-binding`, `unreferenced-var` and `unknown-node-key` are emitted by both). A computed entry has no `order` — it concerns the whole expression, which is also why its `path` is `[]`.
- **A top-level list, not issues on nodes.** An issue's `order` can name a value with no node: the `$colour` warning is #36, but `extras` is inert data folded into the root's shape. `order` links an issue to its node where there is one; `path` always locates it.
- **`path` stays `[]` for a whole-expression issue, not `null`** (considered): `[]` keeps the entries identical to `validate()`'s, keeps the promise that a path always resolves in the input ("Fragments" in [v3-evaluator-methods.md](v3-evaluator-methods.md)), and is accurate — `[]` is the whole expression.
- **`missing-data-path` sits at the root, once per distinct path**, because the check walks the deduplicated dependency record, which holds no read sites. [#179](https://github.com/CarlosNZ/fig-tree-evaluator/issues/179) moves it to the reference that reads it; the report follows through the shared function, leaving only the two limit checks at `[]`.
- **The text is whatever `Issue` carries**, so the report follows any change there — the message catalogue ([#149](https://github.com/CarlosNZ/fig-tree-evaluator/issues/149)) included.

### `timeoutShielded`

The artifact's flag, under the name `validate()` already publishes it by: true when every top-level hole has a `timeoutFallback` (see "Timeout shielding" above). It is kept although it can be derived, because deriving it means applying the top-level-hole rule rather than reading a list, and because it is the switch that decides whether any `timeoutFallback` is used at all. A constant expression is vacuously shielded — nothing in it can time out. The artifact field was renamed from `shielded` to `timeoutShielded` alongside, so the report still mirrors it.

### `nodeCount`, `maxDepth`

The artifact's two measurements as they are — the numbers the `maxNodes` / `maxDepth` limit checks in `issues` compare against. What each counts is not what a reader would count in `canonicalForm`:

- **`nodeCount` counts evaluable nodes only** — `operator`, `fragmentCall`, `reference` and `invalid`. Constants, skeletons, `elements` and `entries` are structure, not work (obligation B4), and `literal` contents are never walked.
- **`maxDepth` measures the walked input's nesting, containers included**, capped by the walk's built-in ceiling (`DEPTH_CEILING`, 500).
- **Both are composed through fragment calls.** A call adds its body's `nodeCount` — once per call site, since two calls are two evaluations — and takes `max(current, call depth + body maxDepth)` for depth, a maximum along a path rather than a sum. So neither matches a count of `canonicalForm` alone when the expression calls a fragment. In the example the tree holds 20 evaluable nodes and `greet`'s body 2, so `nodeCount` is 22 — and the expression alone sits exactly at `maxNodes: 20`, which the fragment body tips into the `max-nodes` error. `maxDepth` is 5 either way: `greet`'s call sits at depth 1 and its body is 2 deep.

### `dependencies`

The artifact's dependency record (obligation B6) as it is, rather than `getDependencies()`'s reshaping of it:

- **`dataPaths`** — each statically known `$data` path in its canonical render, in the order the compile found them; `getDependencies()` spells them the same way and sorts them, the report does not. The render is the key the record already deduplicates on, and the spelling the `missing-data-path` messages use too. It is unambiguous, where the record's segment arrays are not JSON — the `[*]` projection is a symbol there — so the projection and a data key literally named `[*]` stay apart:

  <!-- prettier-ignore -->
  ```ts
  '$data.items[*].id'                        // → "items[*].id"
  { $get: { path: ['items', '[*]', 'id'] } } // → 'items["[*]"].id'
  ```

  Segment arrays were the first cut, for the same array shape as every `path` in the report. Dropped at the PR #180 review: a `path` is a location in the authored expression, where these are paths into data, which have a canonical spelling of their own — and writing the symbol as `"[*]"` made the two lines above read alike.

- **`dynamic`** — true when the read-set is not statically enumerable: a computed `get` path, a bare `$data`, or a dynamic-arguments fragment call. The listed paths still hold beside it.
- **`operators`, `fragments`** — canonical operator names and fragment names, in the order found.
- **Composed through fragment calls**, like the counts: a body's `$data` reads and operators are included. In the example the composed and own records coincide — `greet`'s body reads only `$params`, and its `join` is already listed.

### `own`

The same three measurements — `nodeCount`, `maxDepth` and `dependencies`, rendered as above — taken over this expression alone, before composition through its fragment calls. Kept provisionally: it is the plainest statement of how much of each composed number is the expression's own and how much its fragments', and `own.maxDepth` is not easily read off `canonicalForm`, depth counting containers — though `own.nodeCount` and most of `own.dependencies` could be, by counting and scanning the tree.

Internally the artifact keeps these for fragment registration, which composes bodies in dependency order after their targets are complete: composing from values already composed would count a fragment called through another fragment twice, so every artifact carries its uncomposed measurements (and its call sites) as the material composition works from. In the example `own.nodeCount` is 20 against a composed 22 — the difference being `greet`'s body — while `maxDepth` and `dependencies` coincide, `greet`'s call adding no depth and its body reading only `$params`. They would differ in `dataPaths` wherever a body read `$data` directly. The artifact's `own.identityOnly` is dropped with `identityOnly`, and `fragmentCalls` with it: each call site is already a `fragmentCall` node in the tree.

## Converting authored values

Authored data reaches the report in `expression`, in `options`, in three node fields — `constant.value`, `skeleton.shape` and `invalid.raw` — and in `timeoutFallback`. JSON values pass through unchanged. Anything else follows one rule: **it prints as a marker string naming its type, and a value whose `toJSON` returns a string carries that string** (ruled at the PR #180 review, Carl, September 2026):

- a non-plain object: `[Name]` from its constructor — `[Map]`, `[Widget]`, `[Object]` for an anonymous class — and, where its own `toJSON` returns a string, that string too: `[Date 2026-09-23T00:00:00.000Z]`, and the same for a Luxon or Moment value or a `Decimal`. A `toJSON` that throws or returns anything else (`Buffer`'s `{ type, data }`) leaves the name alone;
- anything else outside JSON: `[function name]` (or `[function]`), `[Symbol(desc)]`, `[bigint 12]`, `[undefined]`, `[NaN]` / `[Infinity]` / `[-Infinity]`, and `[-0]` — on the list although it is a number, because JSON writes it as `0` and the round-trip promise would not hold; it still evaluates as `-0`, the marker being only how the report prints it.

A `Date` prints as a marker rather than as its bare ISO string because the marker is what the engine holds: the artifact carries the `Date` itself, and evaluation returns the object, not its text. Never `String(value)`, which is timezone-dependent for a `Date`, `[object Object]` for most instances, and a function's whole source text.

A **cycle**, or nesting past the walk's own ceiling (`DEPTH_CEILING`, 500), can only reach the report through what the compiler never walks — the source itself, or a `literal` payload — and would otherwise never finish converting. A revisited container prints `[circular]` and one past the ceiling `[too deep]`.

An **unassigned array slot** (`[1, , 3]`, which only an expression built in JavaScript can contain) converts exactly as `undefined` does, since reading it gives `undefined`.

`undefined` shows the difference between the two fields that hold authored data. In `expression` it appears wherever it was written — object keys included, which `JSON.stringify` would drop silently. In `canonicalForm` it is rare, because the compiler has already normalized it: an array element becomes `null`, an object key or a modifier is dropped, and a whole-input `undefined` compiles to a `null` constant. It survives only inside a `literal` payload, which is never walked, so that is the one place its marker appears there. The example has one of each: `note` is gone from the root's shape, and `defaults.discount` keeps its marker. An unassigned slot compiles to `null` in the same way once [#178](https://github.com/CarlosNZ/fig-tree-evaluator/issues/178) is fixed; until then the compiler throws on it.

**A marker could be mistaken for data**, and that is accepted throughout: a marker is a string, authored data can hold any string, and the report is a reading aid rather than data to act on — an authored `"[undefined]"` reads like a replaced `undefined`, and a `[*]` key in authored data reads like the projection in a reference's text. The places the report stays exact are structure rather than records: a skeleton's holes, because `holes[].at` says which `"<hole>"` slots are holes, and `dependencies.dataPaths`, whose canonical renders keep the projection and a `[*]` key apart. An earlier cut also kept an out-of-band `opaque: [{ at, type }]` list on each node, dropped at the PR #180 review: it made `canonicalForm` exact where `expression`, holding the same authored values, was not, and it cost a path allocated per converted value for values expressions rarely hold. What it alone recorded — the type behind a converted string — the marker now carries. The `options` renderings of `data`, `signal`, `cache.store` and header values lose nothing either way: the first three are never strings, and every header value is redacted.

## Example

The input — every node kind, a registered fragment, a `Date`, `undefined` in two places, a timeout fallback from each of the three sources, issues of each kind, and options exercising each rendering rule — with `maxNodes` low enough to fail:

```ts
const fragments = {
  greet: {
    expression: { $join: ['Hello, ', '$params.name'], fallback: 'Hello!' },
    parameters: { name: { type: 'string' } },
  },
}

const options = {
  data: { subtotal: 40, shipping: 5, status: 'pending', customer: {}, items: [] },
  maxNodes: 20,
  operatorDefaults: { join: { delimiter: '' }, firstOf: { fallback: 'unknown' } },
  http: { baseEndpoint: 'https://api.example.com', headers: { Authorization: 'Bearer s3cret' } },
  signal: new AbortController().signal,
}

const expression = {
  '//': 'Order summary',
  vars: { sum: { $plus: ['$data.subtotal', '$data.shipping'] } },
  createdAt: new Date('2026-09-23T00:00:00Z'),
  greeting: { $greet: { name: '$d.customer.name' } },
  lines: {
    $map: { input: '$data.items', as: 'item', each: { $join: ['$item.name', ' × ', '$item.qty'] } },
  },
  status: {
    $match: ['$data.status', { paid: 'Thanks!', pending: { $join: ['Due: ', '$vars.sum'] } }],
  },
  contact: { $firstOf: ['$data.customer.email', '$data.customer.phone', 'no contact'] },
  total: { operator: '+', values: ['$vars.sum', 0], fallback: 0, useCache: false },
  broken: { operator: 'flibble' },
  note: undefined,
  defaults: { $literal: { currency: 'NZD', discount: undefined } },
  extras: { $colour: 'red' },
}
```

An excerpt of the report (the whole is about 300 lines): `expression` and `options` in full, then the root node with its `vars` block and three of its six holes elided and the other three in full, then `issues`, `timeoutShielded`, `nodeCount`, `maxDepth`, `dependencies` and `own` in full.

<!-- prettier-ignore -->
```jsonc
{
  "version": "3.0.0-dev",
  "expression": {
    "//": "Order summary",
    "vars": { "sum": { "$plus": ["$data.subtotal", "$data.shipping"] } },
    "createdAt": "[Date 2026-09-23T00:00:00.000Z]",
    "greeting": { "$greet": { "name": "$d.customer.name" } },
    "lines": {
      "$map": {
        "input": "$data.items",
        "as": "item",
        "each": { "$join": ["$item.name", " × ", "$item.qty"] }
      }
    },
    "status": {
      "$match": [
        "$data.status",
        { "paid": "Thanks!", "pending": { "$join": ["Due: ", "$vars.sum"] } }
      ]
    },
    "contact": { "$firstOf": ["$data.customer.email", "$data.customer.phone", "no contact"] },
    "total": { "operator": "+", "values": ["$vars.sum", 0], "fallback": 0, "useCache": false },
    "broken": { "operator": "flibble" },
    "note": "[undefined]",
    "defaults": { "$literal": { "currency": "NZD", "discount": "[undefined]" } },
    "extras": { "$colour": "red" }
  },
  "options": {
    "data": "[supplied: 5 top-level keys]",
    "maxNodes": 20,
    "operatorDefaults": { "join": { "delimiter": "" }, "firstOf": { "fallback": "unknown" } },
    "http": {
      "baseEndpoint": "https://api.example.com",
      "headers": { "Authorization": "[redacted]" }
    },
    "signal": "[supplied]"
  },
  "canonicalForm": {
    "order": 0,
    "kind": "skeleton",
    "path": [],
    "vars": { "sum": { /* #1–4: plus over $data.subtotal, $data.shipping */ } },
    "shape": {
      "createdAt": "[Date 2026-09-23T00:00:00.000Z]",
      "defaults": { "currency": "NZD", "discount": "[undefined]" },
      "extras": { "$colour": "red" },
      "greeting": "<hole>",
      "lines": "<hole>",
      "status": "<hole>",
      "contact": "<hole>",
      "total": "<hole>",
      "broken": "<hole>"
    },
    "holes": [
      // greeting (#6, fragmentCall, timeoutFallback "Hello!" lifted from greet's body),
      // lines (#8, map), status (#16, match with an entries node)
      {
        "at": ["contact"],
        "node": {
          "order": 24,
          "kind": "operator",
          "path": ["contact"],
          "operator": "firstOf",
          "params": {
            "values": {
              "order": 25,
              "kind": "elements",
              "path": ["contact", "$firstOf"],
              "elements": [
                {
                  "order": 26,
                  "kind": "reference",
                  "path": ["contact", "$firstOf", 0],
                  "reference": "$data.customer.email",
                  "authored": "$data.customer.email"
                },
                {
                  "order": 27,
                  "kind": "reference",
                  "path": ["contact", "$firstOf", 1],
                  "reference": "$data.customer.phone",
                  "authored": "$data.customer.phone"
                },
                {
                  "order": 28,
                  "kind": "constant",
                  "path": ["contact", "$firstOf", 2],
                  "value": "no contact"
                }
              ]
            }
          },
          "timeoutFallback": "unknown",
          "instanceDefaults": ["fallback"]
        }
      },
      {
        "at": ["total"],
        "node": {
          "order": 29,
          "kind": "operator",
          "path": ["total"],
          "operator": "plus",
          "params": {
            "values": {
              "order": 31,
              "kind": "skeleton",
              "path": ["total", "values"],
              "shape": ["<hole>", 0],
              "holes": [
                {
                  "at": [0],
                  "node": {
                    "order": 32,
                    "kind": "reference",
                    "path": ["total", "values", 0],
                    "reference": "$vars.sum",
                    "authored": "$vars.sum"
                  }
                }
              ]
            }
          },
          "fallback": { "order": 30, "kind": "constant", "path": ["total", "fallback"], "value": 0 },
          "timeoutFallback": 0,
          "useCache": false
        }
      },
      {
        "at": ["broken"],
        "node": {
          "order": 34,
          "kind": "invalid",
          "path": ["broken"],
          "raw": { "operator": "flibble" }
        }
      }
    ]
  },
  "issues": [
    {
      "severity": "error",
      "code": "max-nodes",
      "message": "the expression holds 22 evaluable nodes — maxNodes is 20",
      "path": []
    },
    {
      "order": 34,
      "severity": "error",
      "code": "unknown-operator",
      "message": "'flibble' names no registered operator",
      "path": ["broken"]
    },
    {
      "order": 36,
      "severity": "warning",
      "code": "unrecognized-identifier",
      "message": "'$colour' is not a registered operator or fragment and will pass through as data",
      "path": ["extras"]
    },
    {
      "severity": "warning",
      "code": "missing-data-path",
      "message": "'$data.customer.name' is absent from the supplied sample data",
      "path": []
    },
    {
      "severity": "warning",
      "code": "missing-data-path",
      "message": "'$data.customer.email' is absent from the supplied sample data",
      "path": []
    },
    {
      "severity": "warning",
      "code": "missing-data-path",
      "message": "'$data.customer.phone' is absent from the supplied sample data",
      "path": []
    }
  ],
  "timeoutShielded": false,
  "nodeCount": 22,
  "maxDepth": 5,
  "dependencies": {
    "dataPaths": [
      "subtotal",
      "shipping",
      "customer.name",
      "items",
      "status",
      "customer.email",
      "customer.phone"
    ],
    "dynamic": false,
    "operators": ["plus", "map", "join", "match", "firstOf"],
    "fragments": ["greet"]
  },
  "own": {
    "nodeCount": 20,
    "maxDepth": 5,
    "dependencies": {
      "dataPaths": [
        "subtotal",
        "shipping",
        "customer.name",
        "items",
        "status",
        "customer.email",
        "customer.phone"
      ],
      "dynamic": false,
      "operators": ["plus", "map", "join", "match", "firstOf"],
      "fragments": ["greet"]
    }
  }
}
```

## Implementation

_Built (September 2026): the standalone `inspect()`, in `src/inspect/` — `index.ts` holds the function, the report's types and the `options` and `dependencies` renderings, `nodes.ts` the `canonicalForm` tree, `values.ts` the conversion rule. A skeleton's shape is filled by the engine's own `splice()`. The report for the example above is exactly the one shown there, key for key._

- **The shared checks.** `validate()`'s option-dependent checks moved out of `src/FigTree.ts` into `src/validation.ts`. `validationIssues(artifact, options, entry)` assembles the whole list for both callers, `entry` shaping each compile-stream issue — the bare `Issue` for `validate()`, the issue with its `order` for `inspect()` — so the two lists agree by construction, and a test compares them entry for entry. `evaluate()`'s static gate imports the limit checks from there too.
- **The handle accessor.** The handle's state is `#`-private, so `src/FigTree.ts` exports `viewHandle`: the one reader of that state outside the class, an `export let` declared ahead of the class and assigned from a `static {}` block inside it, which may name `#` fields. An importer cannot reassign an imported binding, so the `let` is fixed from outside. It is not barrel surface. A brand check (`#entry in value`) turns away anything the constructor did not make, and a call option that is instance configuration is refused exactly as `evaluate()` refuses it. The check stays although reading a `#` field off anything else throws natively: the native message names an internal private field, where `inspect()`'s own says what to pass. The imports run one way, from the inspector to the engine.
- **A `TypeError` for anything but a handle**, not a `FigTreeError`: a wrong-typed argument is a programming error in the host, not a finding about an expression.
- **Nothing shared with the artifact.** The artifact is the compile cache's, handed to every holder, so every path is copied and every authored value converted into new containers. A test scribbles on one report and takes another.
- **Exported types:** `InspectReport`, `InspectNode`, `InspectIssue` and `InspectDependencies`.
- **Tree-shaking, checked by hand.** Bundling an app that imports only `{ FigTree, coreOperators }` from `build/` with rollup carries none of the inspector — none of its marker strings are in the output — and importing `inspect` as well adds about 4 kB before minification. The accessor itself stays in the engine, a few lines in the class. The Phase-14 tree-shake fixture should assert the absence.
- **Tests:** [test/inspect.test.ts](../../test/inspect.test.ts).

## Open

- **The dev [src/dev/inspect.ts](../../src/dev/inspect.ts)**: a thin console-printing wrapper over the report, or replaced.
- **The Phase-14 tree-shake fixture** should assert the inspector's absence from an engine-only bundle — checked by hand so far (see "Implementation"), and carried into Phase 14's entry in [v3-implementation-plan.md](v3-implementation-plan.md).
