# FigTree v3 — Evaluator methods & return shapes

*Working document, companion to [v3-api.md](v3-api.md). **Agreed** — reviewed and signed off (Carl, July 2026); the open questions below are closed, except two parked with the [operator contract](v3-operator-contract.md)'s open list (`related`/`OperatorFailure` finality; `context.trace.note`). The `report` mode *name* carries a **possibly-improve** marker (see Q11's record), and trace field names settle at implementation. This area's job was to discharge every deferral the other areas pointed at it: the `mode: 'report'` and `trace: true` return shapes, the timeout-under-report shape, the TypeScript story for mode-dependent returns, `getDependencies`, the exact `getFragments()`/`getOperators()` method shapes, and the result-immutability ruling. Because `report`, `trace` and `validate` are the least-explored corners of the design, this doc deliberately spells out the **process** — how each one works mechanically — alongside the shapes, so the shapes can be judged against the machinery that has to produce them.*

## The method surface at a glance

| Method | Sync? | Purpose | v2 disposition |
|---|---|---|---|
| `new FigTree(options?)` | — | construct; registration-time validation throws here | **Kept** (class renamed from `FigTreeEvaluator`) |
| `evaluate(expr, options?)` | async | the one evaluation method | **Kept** — signature agreed in Options; return shapes settled here |
| `validate(expr, options?)` | sync | full static-issue report for tooling/CI | **New** |
| `getDependencies(expr)` | sync | what the expression reads and invokes | **New** |
| `isEvaluable(expr)` | sync | registry-aware "would evaluation be non-identity?" | **Renamed** from method `isFigTreeExpression` (semantics sharpened) |
| `updateOptions(options)` | sync | the one sanctioned mutation path | **Kept** — agreed in Options |
| `getOptions()` | sync | options snapshot | **Kept** — snapshot, never live references (Options) |
| `getOperators()` | sync | full operator metadata, effective defaults merged | **Kept** — content fixed in the [operator contract](v3-operator-contract.md#introspection-getoperators) |
| `getFragments()` | sync | fragment metadata | **Kept** — content fixed in Fragments |
| `clearCache()` | sync | empty the result-memo store | **New** (replaces `getCache`/`setCache` — see Cache methods) |
| `version` | property | library version | **Modified** from `getVersion()` |
| `getCustomFunctions()` | | | **Deleted** — no functions tier; custom operators appear in `getOperators()` |
| `getConfig()` | | | **Deleted** — leaked live internals; `getOptions` + `getOperators` + `getFragments` cover every legitimate consumer |
| `getCache()` / `setCache()` | | | **Deleted** — persistence is the pluggable `cache.store`'s job (Options) |
| `evaluateSync()` | | | **Not added** — sketched in the assessment, cut here (see Rulings) |
| `evaluateExpression()` standalone | | | **Deleted** — see Rulings |

One principle across the surface, recorded once: **the engine never writes to the console.** Every diagnostic has a structured home — `validate()` issues, `report` errors, `trace` — and v2's stray `console.log` in FetchClient dies with the principle, not just the instance.

---

## One spine, three views

The key to reading everything below: `validate`, `mode: 'report'` and `trace` are not three features bolted onto evaluation — they are three views over machinery that deep evaluation already requires ([v3-implementation-notes.md](v3-implementation-notes.md) § Deep evaluation).

The parse/compile pass (run once per distinct input, cached) already produces:

1. **The canonical AST** — shorthand and aliases normalized away.
2. **The hole list** — every maximal evaluable node, each tagged with its **path in the input as authored** (the paths `FigTreeError` is tagged with).
3. **The issue stream** — every static error and warning the grammar defines, collected during the same walk.
4. **Constancy classification** — per subtree, which powers the identity short-circuit and the timeout-shielding flag.

Given that artifact:

- **`validate()`** = run the pass (or hit its cache), return the issue stream. No evaluation, no I/O, synchronous.
- **`evaluate()`** = run the pass, abort on error-severity issues (throw or report per `mode`), then evaluate the holes.
- **`mode: 'report'`** = identical evaluation, plus: uncaught runtime failures are collected against their node paths instead of aborting the call.
- **`trace`** = identical evaluation, plus: the engine's node-boundary wrapper (already doing `fallback`, cache gating, abort threading per the contract's "node machinery") also records what happened at each node instance.

Nothing here adds a traversal or a phase; each view is a different subset of the same bookkeeping switched on.

---

## Intended use, mode by mode

*Added at review (Carl, July 2026): the shapes and rulings in this doc are easier to judge against explicit intent, and disagreements about shape often turn out to be disagreements about intent (open question 11 is exactly this). Each surface has one primary consumer. A use case sitting awkwardly across two rows is the signal that a new mode may be warranted — rather than stretching an existing one.*

| Surface | Primary consumer | The situation it serves |
|---|---|---|
| `evaluate()`, plain | host runtime code | Production evaluation. Failures are exceptional: the expression handles the anticipated ones (`fallback`), the host try/catches the rest. The fast path — zero diagnostic bookkeeping. |
| `mode: 'report'` | host runtime code — the resilience path | Production evaluation of many-expression configs where one failure must not take down the rest: degrade that hole, render everything else, send `errors` to logging/telemetry. The `returnErrorAsString` lineage. |
| `trace: true` | humans — authors, and the editor on their behalf | Answering "why did it produce *that*?": which branch ran, which references resolved to null, which fallbacks fired, what the request actually was, what was cached, what each node cost. |
| `validate()` | authors, the editor, CI | Before evaluation — often before data exists: every statically-knowable mistake, at authoring or commit time. |

What falls out of the table:

- **Plain `evaluate()` is the only surface the engine optimizes for.** Every other surface may pay bookkeeping; this path must not.
- **Report is a production posture, not an inspection tool** — the draft's intent, now stated plainly. Its shape decisions all follow from that intent: results stay inside the JSON value domain because they get stored, rendered and transmitted; degraded holes look like nulls *in the value* because production consumers must never learn to fish diagnostics out of data; `errors` is machine-shaped (stable codes, paths) because its readers are host code and telemetry, not eyes. This intent was contested at review and **confirmed at close-off (Carl, July 2026)** — production resilience stands. The *name* stays `report` with a recorded **possibly-improve** marker: "report" can read like a debugging artifact; `'partial'` / `'resilient'` are the floated alternatives — revisit deliberately before v3.0 ships, not casually.
- **Trace is the debugging tool — in-band-style diagnostics live here.** The editor's failure display (highlight the responsible path in red) is trace consumption, not result inspection: evaluate with `{ mode: 'report', trace: true }` — never throws, full instance tree, every failure path-tagged with the error attached — and paint from the trace tree. The result value never needs to carry diagnostics because the trace tree carries all of them, addressable by path.
- **Composition.** Report + trace is the expected editor and debugging combination. Trace with throw mode is also legal, and a failing run must not lose its diagnostics: when trace is on and the evaluation throws, the thrown `FigTreeError` carries the partial instance tree as `error.trace` (added to the shape below).
- **The authoring dry-run** — evaluating against sample data to collect every runtime failure at once — rides report (+ trace). A dedicated authoring mode (loud in-band markers included) remains a possible later addition, left open at close-off; this is its seed use case, and the table is where it would slot in.
- **Validate against the rest**: `validate()` needs no data and runs synchronously at keystroke rate; trace and report require an actual evaluation. The editor is expected to use all three — validate continuously, report + trace on preview runs.

---

## `evaluate()` return shapes

### The envelope rule

> `evaluate()` returns the **bare result value** unless a diagnostic option is active. If effective `mode` is `'report'` **or** effective `trace` is `true`, it returns an **`EvaluationResult` envelope** instead.

```ts
await fig.evaluate(expr)                      // Value — the everyday call, v2 parity
await fig.evaluate(expr, { mode: 'report' })  // EvaluationResult
await fig.evaluate(expr, { trace: true })     // EvaluationResult

interface EvaluationResult {
  result: unknown          // the evaluated value (null where degraded — see Report)
  errors: FigTreeError[]   // empty array when nothing failed; always present in the envelope
  trace?: TraceNode        // present iff trace was on
}
```

Why one envelope for both diagnostics rather than shape-per-option: the alternatives were a bare-value-plus-`trace` shape for trace-only calls and a distinct report shape, giving three return types for `evaluate()`; one conditional (bare value vs envelope) is the least type machinery and the least documentation. `errors` is always present in the envelope — in throw-mode-with-trace it is simply always `[]` (an error would have thrown), and its presence means envelope consumers never branch on key existence.

In-band hazard, recorded honestly: a bare result that *happens* to be an object with `result`/`errors` keys is indistinguishable from the envelope by inspection. This is only a hazard for code written mode-agnostically — the caller chose the options, so the caller knows the shape; TypeScript enforces it (below). Not worth a wrapper class.

### The TypeScript story

Resolving the Options deferral. The class is generic over its construction options, and `evaluate`'s return type is conditional on the *merged* effective options:

```ts
class FigTree<InstanceOpts extends FigTreeOptions = {}> {
  evaluate<CallOpts extends FigTreeOptions = {}>(
    expr: unknown,
    options?: CallOpts
  ): Promise<ResultShape<Merge<InstanceOpts, CallOpts>>>
}

type ResultShape<O> = O extends { mode: 'report' } | { trace: true }
  ? EvaluationResult
  : unknown
```

- `new FigTree({ mode: 'report' })` types every `evaluate()` as returning the envelope; a per-call `{ mode: 'throw' }`... does not exist as an override concern in practice, but the merge type handles per-call overrides in both directions.
- **`updateOptions({ mode })` cannot re-type an existing instance** — recorded in the Options deferral, confirmed as an accepted limitation: the runtime shape follows the effective options faithfully; the static type follows the constructor. TS hosts that flip modes dynamically should set the mode per-call (which types correctly) or construct separate instances. A doc line, not machinery.
- If the conditional-type stack proves brittle, the fallback mirrors the contract's: explicit generic (`fig.evaluate<EvaluationResult>(…)`). Same posture as `defineOperator`'s inference caveat.

### Kill-switch shapes (discharging the Options deferral)

| Situation | `mode: 'throw'` | `mode: 'report'` |
|---|---|---|
| `timeout` fires, expression **unshielded** | throws `FigTreeError` (code `timeout`) | `{ result: null, errors: [...preDeadlineErrors, timeoutError] }` |
| `timeout` fires, expression **shielded** | **returns the shielded assembly** — no throw, no error signal (rule 3; `trace` is the visibility channel) | `{ result: <shielded assembly>, errors: [timeoutError] }` |
| `signal` aborts | rejects with the abort as a `FigTreeError` (code `aborted`) | **also rejects** — the one exception to "report never throws": the caller cancelled, nobody is waiting for a result, and resolving normally would invite code that treats cancellation as data. "Never throws" scopes to *expression* errors. **Agreed** (close-off, July 2026). |

A pleasing consequence, worth recording: a *shielded* expression's report-mode errors are exactly `[timeoutError]` — shielding requires a static `fallback` on every hole root, and a root fallback catches every runtime failure inside its hole, so no uncaught error can exist in a shielded expression. The presumed shape from the Options deferral (`{ result: <shielded assembly> ?? null, errors: [timeoutError] }`) is confirmed, and turns out to be derivable rather than stipulated.

---

## `mode: 'report'` — the process

### The granularity ruling: degradation is per hole

The agreed sentence ("an erroring node resolves to its `fallback` if present, otherwise `null`, and evaluation of everything else continues") needs one sharpening: *which* node resolves to null when nothing catches. The answer cannot be the failing node itself — substituting `null` at the failure origin would bypass enclosing `fallback`s (rule 1 machinery would never see the error) and then trigger cascade type-errors at `reject`-typed positions downstream. And it cannot literally be "the root", or nothing partial would survive. The coherent unit is the **hole** — the maximal evaluable node, the same unit timeout shielding is defined on:

1. A runtime failure propagates by **`fallback` rule 1, unchanged** — nearest enclosing catch, identical in both modes. A caught failure is handled; it was designed for.
2. An *uncaught* failure — one that escapes every enclosing `fallback` inside its hole — resolves **that hole** to `null`, and is recorded as a `FigTreeError` tagged with the **failing node's path** (the origin, not the hole).
3. Sibling holes are unaffected and continue. Within a hole nothing "continues" past the failure — a computation that needed the failed value has failed with it, which is what rule-1 propagation already says. (In throw mode the first uncaught failure additionally aborts all in-flight sibling work via the abort scope; in report mode siblings run to completion.)
4. Errors are collected per failing hole — one error each, since a hole fails once. Deterministic multi-failure attribution *inside* a node follows the operators' own rules (the `and`/`or` lowest-parked-index rule; iterators likewise).

No cascade problem exists under this ruling: `null` is never substituted mid-computation, only at hole boundaries, where the skeleton splice is defined to accept any value.

### The throw/report invariant

> For a given expression, data and registry: **`mode: 'throw'` throws if and only if `mode: 'report'` returns a non-empty `errors` array.**

The thrown error is always *a member* of that set — with a single failing hole it is exactly `errors[0]`, but with several holes failing concurrently, throw mode rejects with the first failure to **occur** (the abort races; timing-dependent), while report's array is the complete set in deterministic tree order. (Sharpened while building [the worked examples](v3-worked-examples.md) — the first draft claimed `errors[0]` exactly, which only a serialize-everything throw mode could honour.)

This is the anchor that makes `errors` well-defined: it contains exactly the failures that had no author-designed answer. Consequences, each a ruling:

- **Fallback-caught failures are not in `errors`.** A `fallback` firing is the author's designed degradation — success, in both modes (matching the pass language: "a discarded failure is not an error of the evaluation"). The diagnostic record of *how often your fallbacks fire* is `trace`'s job, which records every fallback application. **Agreed** (close-off, July 2026) — the agreed Options sentence ("every error is collected") was ambiguous on this point and this is the deliberate reading; the alternative (collect caught failures too) makes `errors` noisy precisely where the author already handled things, and breaks the invariant above.
- **`and`/`or` parked failures that lose the race never appear** (already agreed in the passes). When such a node *does* fail, it contributes **one** error — the lowest-index parked failure — with the other parked failures attached as `related: FigTreeError[]` on that error rather than as separate entries, keeping one-entry-per-failing-hole. **Agreed** (close-off, July 2026; shape finality with the contract's `OperatorFailure` question) — this discharges the implementation-notes question ("whether sibling parked failures also appear in report output").
- **Static errors do not throw under report mode.** A parse/validation failure returns `{ result: null, errors: [...allStaticErrors] }` — all of them, not just the first, since the validate pass collects the full stream anyway. Rationale: the report-mode host (Conforma evaluating author-supplied config) chose resilience; one uniform channel beats "resilient except for typos". The error `code` distinguishes static from runtime cleanly. **Agreed** (close-off, July 2026). (In throw mode, evaluate throws the first error-severity issue in tree order, with the full issue list attached to the thrown error as `issues` — deterministic, and nothing is hidden.)
- One recorded exception to the invariant: the **shielded timeout**, where throw mode returns the assembly silently but report mode includes the `timeout` error (table above). Report mode is strictly more informative there; the asymmetry is inherent to shielding having no side channel in a bare return value.

### Ordering

`errors` is ordered by node path, tree order — deterministic and stable, never completion order. Timeout cases carry the inherent caveat: *which* holes completed before the deadline is timing-dependent, so pre-deadline error *content* can vary run to run; ordering of what is present remains tree-order.

### `FigTreeError` — the shape the area owns

Both `errors` entries and thrown errors are instances of one class (the contract's open question 6 asked whether `FigTreeError` is simply exposed — proposed shape here, final naming with the contract):

```ts
class FigTreeError extends Error {
  code: string                    // stable, machine-readable: 'unknown-operator', 'type-check',
                                  // 'operator-failure', 'timeout', 'aborted', … (vocabulary fixed at implementation)
  path: (string | number)[]       // the failing node, in the input as authored
  holePath?: (string | number)[]  // report mode: the containing hole that degraded to null — the splice
                                  // point for hosts writing their own in-band markers (see Why the filler is null)
  operator?: string               // canonical name, where applicable
  fragment?: string               // set when the failure is inside a fragment body…
  fragmentPath?: (string | number)[]  // …with the location inside that body; `path` then points at the call node
  errorData?: Record<string, unknown> // structured payload (I/O status/url/response — header names only, per batch 8)
  related?: FigTreeError[]        // sibling parked failures (and/or), per the ruling above
  cause?: unknown                 // fallback rule 4: the original failure when a fallback itself failed
  issues?: Issue[]                // static-error throws only: the full validate stream
  trace?: TraceNode               // when trace was on and the evaluation threw: the partial instance tree up to the failure
  prettyPrint(): string           // kept from v2 — the human-facing rendering
}
```

The two-level path story (call-site `path` + `fragmentPath`) is forced by fragments: a failure inside a registered body has no single location in the input expression, and the editor needs both ends of the pointer.

### Worked example

```js
const config = {
  title: { $buildString: ['Report for %1', '$data.user.name'] },
  rate: { $http: 'https://api.example.com/rate', fallback: 1.0 },
  items: { $map: { input: '$data.items', each: { $upper: '$element.sku' } } },
}
// data: { user: { name: 'Ada' }, items: "oops-a-string" } ; the rate API is down

// ── mode: 'throw' (the default) ─────────────────────────────
await fig.evaluate(config)
// ✗ rejects — no result at all; in-flight sibling holes are cancelled:
// FigTreeError {
//   code: 'type-check', path: ['items'], operator: 'map',
//   message: "map – parameter 'input': expected array, received string",
// }

// ── mode: 'report' ──────────────────────────────────────────
await fig.evaluate(config, { mode: 'report' })
// {
//   result: { title: 'Report for Ada', rate: 1.0, items: null },
//   errors: [
//     FigTreeError {
//       code: 'type-check', path: ['items'], operator: 'map',
//       message: "map – parameter 'input': expected array, received string",
//     },
//   ],
// }
```

Three holes, and the two modes agree on everything except what happens *after* the uncaught failure. `title` succeeds. `rate`'s HTTP failure is caught by its `fallback` — designed degradation, identical in both modes: `1.0`, **nothing** in `errors`, no throw (the catch is visible in `trace`). `items` fails uncaught — and here the modes diverge: throw mode aborts the whole call with that error and discards the siblings' work; report mode resolves the `items` hole to `null`, keeps everything else, and hands back the **same error object** as `errors[0]` — the throw/report invariant made concrete.

Note what the `null` at `items` is **not**: it is not `map` null-propagating — iterator `input` is `array`-only and *rejects* bad input ([the gradient register](v3-cases-for-review.md) #24); the node genuinely failed. The `null` is report mode's placeholder at a failed hole. This makes a result-side `null` ambiguous between a successful propagated null and a degraded hole — deliberate, and `errors` is what tells the two apart: **a degraded hole always has a path-tagged entry in `errors`; a propagated null never does.**

### Why the filler is `null` (a loud sentinel — considered, rejected)

The ambiguity just noted invites the obvious counter-proposal: fill degraded holes with something self-signaling — `"__ERROR__"`, say — so a human scanning the result sees the failure. Rejected, on four grounds:

- **An in-band marker is the `returnErrorAsString` flaw re-created** — the flaw report mode exists to kill (Options, agreed). Any JSON value the engine could pick is a value some host's data legitimately contains; the engine cannot know a collision-free sentinel in a domain it doesn't own, and consumers checking `x === '__ERROR__'` is in-band signaling hardened into a contract. A *non*-JSON sentinel (a Symbol, an engine class) escapes the collision problem by breaking the value domain instead — results stop being JSON-serializable, precisely where report mode's consumers store and render whole configs.
- **The author-controlled loud filler already exists: `fallback`.** A hole that should degrade to something visible declares it — `fallback: 'unavailable'`, `fallback: []` — and only the author knows the appropriate placeholder *and its type* (the argument that put timeout shielding in the expression rather than in options, reapplied). Host-wide, `operatorDefaults` fallbacks cover whole operator classes. Report's `null` is only the floor for holes whose author declared nothing — and `null` is the domain's one honest "no result exists here".
- **It is the layered pattern References already committed to**: a missing `$data` path and a stored `null` are deliberately indistinguishable at the value level, with the layer below (`missingPathDefault`, `strictDataPaths`) preserving the distinction when it matters. Uniform `null` in the result plus the path-tagged `errors` entry is the same shape at the evaluation level.
- **A host that genuinely wants in-band markers can splice its own** — it knows its domain, so *it* can choose a collision-safe value. `holePath` on the error (the shape above) makes this a three-line post-process: for each error, set the marker at `result[holePath]`. An `errorPlaceholder` option (host-chosen sentinel, engine-spliced) was considered as the middle ground and left out: it is exactly that post-process moved into the engine, at the cost of another shape-affecting option multiplying the TypeScript story. Revisit on real demand — adding it later is non-breaking.

*Contested at review, **resolved at close-off** (Carl, July 2026).* The counter-position — report as a *debugging* tool that never runs in production, which would have dissolved the collision and serialization grounds and made a loud sentinel (or exported Symbol) viable — fell with the intent ruling: report is the production-resilience mode, and **`null` stands**. The debugging use the counter-position served belongs to `trace` (§ Intended use); a dedicated authoring mode with loud in-band markers remains a possible later addition, seeded by the dry-run row there.

---

## `trace: true` — the process

### What must be recorded (the requirements, gathered)

The passes and areas have already committed `trace` to specific content; collecting it in one place, since the shape must carry all of it:

| Requirement | Source |
|---|---|
| Annotated intermediate values per node | Options (the option's one-line description) |
| Per-operand status for `and`/`or` and the deciding iterators: value / failed-discarded / cancelled | batch 1, batch 5 |
| Fallback applications — which fallback fired, catching what | fallback rules; shielding discoverability note ("trace shows what applied") |
| Which holes contributed real values vs static fallbacks on a shielded timeout | Node grammar rule 3 |
| References that resolved to `null` | assessment § 3.2 mitigations |
| Unrecognized-`$` inert data encountered | Operators § Unrecognized `$` |
| `buildString`: literally-rendered (unbound) tokens, placeholder renders, null renders | batch 4; case #15 |
| `join`: placeholder and null renders | batch 4 |
| `buildObject`: runtime duplicate-key overwrites | batch 6 |
| Cache hits and misses | ledger #16 |
| I/O: the effective request, **header names only** | batch 8 |

### The mechanism

Trace collection is the node-boundary wrapper the contract already assigns to the engine ("node machinery: … `trace` bookkeeping"), switched on:

1. **The dynamic tree is the record.** An evaluation is a tree of *node instances* — the static AST unrolled by iteration (one instance of `each` per element), fragment calls (one body instance per call site) and var evaluations. Trace mirrors exactly this instance tree; each entry points back to its **static location** (`path`, plus fragment name for body nodes), which is how the editor overlays instances onto the one tree it renders — grouping instances by static location is a join on `(source, path)`.
2. **Engine-recorded statuses.** The wrapper records, per instance: the outcome (`value` / `failed` / `fallback` — with the caught error / `cancelled` / `skipped`), the resolved value, and wall-clock timing. `skipped` marks statically-present-but-never-demanded subtrees (the unevaluated `if` branch, undemanded `firstOf` candidates, unreferenced vars) as a single entry with no descendants — laziness made visible, which is half of trace's diagnostic value. `cancelled` marks work started and then aborted by early resolution or the kill switch.
3. **References and vars get lightweight entries.** References are values, not nodes, but "which references resolved to null" is a committed requirement — each reference occurrence records its path, the reference string and the resolved value. A var's evaluation is **one entry, not two**: the entry of its definition expression — which lives at the declaration site (`['vars', name]`), the stable static home; its lazy trigger is a detail — annotated with the var name (`var: 'country'`). No separate wrapper entry: a var's definition and its declaration share one path, so a wrapper would put two entries at one location and break the `(source, path)` join's one-instance-per-location property. Each `$vars` read records the memoized value.
4. **Body-level events need a channel — a contract addition.** Statuses and values are engine-visible, but literal-token renders, placeholder renders and duplicate-key overwrites happen *inside* operator bodies, and the effective request is assembled by the I/O bodies. Proposed: **`context.trace.note(event)`** on the operator context — a no-op stub when trace is off, so bodies emit unconditionally and pay nothing. Cache hits/misses need no body involvement (`context.cache.memo` records them itself). This goes back to [v3-operator-contract.md](v3-operator-contract.md) as an addition to `OperatorContext` and the open-questions list — it is the one place this area touches the contract.
5. **Parse-time warnings ride along.** The unrecognized-`$` requirement is a parse fact, not an evaluation fact; the trace root simply echoes the validate pass's warning stream, so a trace consumer sees them without a second call.
6. **Cost when off: nothing.** No recorder in the context, `note` is the no-op, the wrapper skips bookkeeping. Trace must never tax the plain path.

### The shape (sketch — field names settle at implementation)

```ts
interface TraceNode {
  path: (string | number)[]                 // static location within its source
  source?: { fragment: string }             // absent = the input expression
  kind: 'operator' | 'fragment' | 'reference' | 'literal'
  operator?: string                         // canonical name
  ref?: string                              // reference occurrences: the canonical reference string
  var?: string                              // set when this entry is a var's definition evaluating (see mechanism note 3)
  status: 'value' | 'failed' | 'fallback' | 'cancelled' | 'skipped'
  value?: unknown                           // for value / fallback (the value returned)
  error?: FigTreeError                      // for failed; for fallback, the error the fallback caught
  events?: TraceEvent[]                     // body/renderer notes via context.trace.note + engine cache events
  children?: TraceNode[]                    // instance children, structural order (parameter/element order)
  elapsed?: number                          // ms
}

type TraceEvent =
  | { type: 'cache'; hit: boolean }
  | { type: 'request'; method: string; url: string; headers: string[] }  // names only — batch 8
  | { type: 'render'; token: string; rendered: 'literal' | 'placeholder' | 'empty' }
  | { type: 'key-overwrite'; key: string }
  | { type: 'shielded-fallback' }           // this hole contributed its static fallback on timeout
  // vocabulary extends at implementation; consumers must ignore unknown types
```

`children` is in **structural order** (declaration/element order), not completion order — deterministic and stable for diffing and testing; timing lives in `elapsed`. A `seq` completion counter can be added if a real consumer needs arrival order; not speculatively.

### Worked example

```js
const expr = {
  vars: { country: { $http: 'https://restcountries.com/v3.1/name/zealand', fallback: null } },
  operator: 'if',
  condition: { $notEqual: ['$vars.country', null] },
  then: '$vars.country[0].name.common',
  else: 'Not found',
}

const { result, trace } = await fig.evaluate(expr, { trace: true })
// result: 'New Zealand'
// trace (abridged):
// { path: [], kind: 'operator', operator: 'if', status: 'value', value: 'New Zealand', elapsed: 141,
//   children: [
//     { path: ['vars', 'country'], kind: 'operator', operator: 'http', var: 'country',
//       status: 'value', value: [/* API response */], elapsed: 138,
//       events: [ { type: 'cache', hit: false },
//                 { type: 'request', method: 'get', url: 'https://restcountries.com/…', headers: ['Accept'] } ] },
//     { path: ['condition'], kind: 'operator', operator: 'notEqual', status: 'value', value: true,
//       children: [ { path: ['condition', '$notEqual', 0], kind: 'reference', ref: '$vars.country', status: 'value' } ] },
//     { path: ['then'], kind: 'reference', ref: '$vars.country[0].name.common', status: 'value', value: 'New Zealand' },
//     { path: ['else'], kind: 'literal', status: 'skipped' },
//   ] }
```

Everything trace exists for is visible in miniature: the var evaluated once at its declaration site with the request and cache events attached, the memoized reads, the never-evaluated `else` as a single `skipped` leaf, and header names without values.

### Open, recorded

- **Value size.** Traced values can be large (whole API responses, whole configs). v3.0 records them by reference and documents it; a truncation/summary option (`trace: 'summary'`?) is maybe-later, added on real demand rather than guessed at now.
- The exact `TraceEvent` vocabulary and field names — implementation-shaped, same posture as the contract's runtime interface.

---

## `validate()` — the process

### Signature and behaviour

```ts
fig.validate(expression, options?): ValidationResult   // synchronous

interface ValidationResult {
  valid: boolean               // no error-severity issues
  issues: Issue[]              // tree order; empty when clean
  timeoutShielded: boolean     // the rule-3 badge — statically computed, surfaced for the editor
}

interface Issue {
  severity: 'error' | 'warning' | 'hint'   // the contract's vocabulary
  code: string                              // stable, machine-readable — shared vocabulary with FigTreeError.code
  message: string                           // human-facing; includes did-you-mean suggestions where cheap
  path: (string | number)[]
  operator?: string
  parameter?: string
}
```

- **`validate()` never throws on expression content** — reporting is its entire job; even hard "parse errors" come back as `severity: 'error'` issues. (It throws only on misuse of the method itself, e.g. per-call `operators`.)
- **Synchronous by construction**: the parse pass touches no I/O, and the contract's operator `validate` hooks are sync functions returning `Issue[]`. Editors get keystroke-rate validation with no async ceremony.
- It accepts per-call options under the standard merge (minus the barred `operators`/`fragments`) because options legitimately affect static checking: `maxDepth`/`maxNodes` are structural checks, `excludeOperators` drives a warning (below), `data` enables the sample-data check (below).
- Calling it warms the parse cache as a side effect — a host that validates at config-save time gets its first `evaluate()` pre-parsed for free. No public `parse`/`compile` method exists; the pipeline stays engine architecture (assessment § 3.3), and this side effect is the only "pre-warm" anyone needs.
- Relationship to `evaluate()`: the same pass with the same checks runs (cached) inside every evaluation — `validate()` adds nothing evaluation doesn't already know; it just returns the stream instead of acting on it. Warnings never block evaluation and are *only* visible through `validate()` (and the trace echo) — the no-console principle.

### The check inventory

The value of this section is consolidation — these are all already agreed in their home areas; `validate()` is defined as **exactly this list**, and the error rows are exactly the static class of the error-partition table (Node grammar), which is what makes the partition contract auditable.

**Errors** (any one ⇒ `valid: false`; evaluation would throw/report the same):

| Check | Source |
|---|---|
| Unknown `operator:` / `fragment:` name; unknown `$name` invocation is *not* this (see warnings) | Operators; Node grammar |
| Malformed nodes: `operator`+`fragment` together; non-literal-string invocation values; canonical key beside a `$name` key; two recognized `$name` keys; non-reserved sibling on a shorthand node; unknown key on any node (the no-hoisting rule — catches the `thn:` typo class) | Node grammar § Malformed-node hard errors |
| Missing required parameter; unknown parameter/argument name (operators and static-mode fragment calls); positional arity vs `positionalParams` | Node grammar; Fragments |
| Literal parameter values vs declared types, `constraints` included | Type area; contract #9 |
| Literal empty aggregate input (where no identity is defined) | Type § Aggregates |
| Unresolved `$vars` in lexical scope; `$params` outside a body or undeclared; `$element`/`$index` outside an iterator; bare `$vars`/`$params` | References |
| `vars` shape rule violations; var cycles; `as` legality/collisions | References; Node grammar |
| `fragment` `parameters` value neither plain object nor node | Fragments |
| `maxDepth` / `maxNodes` exceeded | Options |
| Operator `validate`-hook errors: `regex` pattern compile, `buildString` literal-face token mismatches, statically-composite literal render inputs, literal path parse for `get`/`http` | contract § Registration & validation; batches 4, 6, 8 |
| `returns` feeding-position check: empty intersection between a feeding node's declared `returns` and the receiving parameter's type | contract § `returns` |

One clarification the missing-required row forces, **agreed** (exposed at review, signed off at close-off — Carl, July 2026): **`operatorDefaults` cannot make a required parameter optional.** An `operatorDefaults` entry naming a *required* parameter is a construction-time validation error, extending Options' agreed unknown-operator / unknown-parameter / type-mismatch list — so the missing-required check consults no options context: required means on-the-node, always. The boundary is *optionality*, not declared defaults: optional-**without**-default parameters are legitimate targets — the host-wide `nullValueDefault` opt-out ([gradient register](v3-cases-for-review.md) #3) depends on exactly that. Rationale: required parameters are the semantic core inputs (`round.value`, `http.url`, `map.input`), and an instance-wide constant for one is a preset node in disguise — presets are **fragments'** job; the parameters that sensibly default instance-wide (`caseInsensitive`, `join.delimiter`, `nullValueDefault`) are the optional ones by construction. The amendment to Options § `operatorDefaults` is made in [v3-api.md](v3-api.md) (question 12's record).

**Warnings** (evaluation proceeds):

| Check | Source |
|---|---|
| Unrecognized `$`-shaped keys and strings (inert data — the `$typo` class, with did-you-mean) | Operators |
| Var shadowing; unreferenced vars (the misread-data signature) | References; Node grammar |
| Useless modifier combinations (`vars` / `fallback` on `literal`) | Node grammar; fallback rule 6 |
| `$not` over a propagate-family node (recommends `missingPathDefault` / `nullValueDefault`) | cases #9 |
| `buildObject` duplicate literal keys | batch 6 |
| I/O lints: literal `sql.query` opening with a write verb; the injection lints | batch 8 |
| Use of an operator excluded by *instance-level* `excludeOperators` — statically knowable certain-failure, but per-call exclusion can differ, hence warning not error | **new here — agreed at close-off** |
| **Sample-data check** (only when `data` is supplied to `validate`): `$data` paths absent from the supplied object | **agreed at close-off** — see below |

**Hints**: the `buildString` positional renumber hint (case #17); vocabulary open for more.

**The sample-data check — ships in v3.0** (agreed at close-off, July 2026). `fig.validate(expr, { data: sampleData })` additionally walks every statically-known `$data` path (the `getDependencies` machinery, below) against the supplied object and warns on misses. This is the assessment's typo-protection mitigation made first-class: the pieces exist regardless, the editor wants it, and CI configs usually have a representative data sample. If implementation finds real scope creep it can still be cut cleanly — tooling can compose it from `getDependencies()` — but it is cheap and the single most useful check for the null-on-missing world.

**Boundary, restated:** registration-time validation (fragments, operator definitions, `operatorDefaults`) is *not* `validate()`'s job — it already threw at `new FigTree()` / `updateOptions()` (Fragments; the contract). `validate()` checks expressions against a registry that is by construction already valid; fragment *calls* are checked here, fragment *bodies* were checked at registration.

### Worked example

```js
fig.validate({
  operator: 'if',
  condition: { $graeterThan: ['$data.age', 18] },
  thn: 'Adult',
  else: '$vars.username',
})
// {
//   valid: false,
//   timeoutShielded: false,
//   issues: [
//     { severity: 'error', code: 'unknown-node-key', path: ['thn'], operator: 'if',
//       message: "'thn' is not a parameter of 'if' — did you mean 'then'?" },
//     { severity: 'error', code: 'unresolved-var', path: ['else'],
//       message: "'$vars.username': no var 'username' is declared in scope" },
//     { severity: 'warning', code: 'unrecognized-sigil', path: ['condition'],
//       message: "'$graeterThan' is not a registered operator or fragment and will pass through as data — did you mean '$greaterThan'?" },
//   ],
// }
```

---

## `getDependencies()`

```ts
fig.getDependencies(expression): Dependencies   // synchronous, parse-backed

interface Dependencies {
  data: {
    paths: string[]        // every statically-known $data path, shared path grammar, deduplicated, sorted
    dynamic: boolean       // true if any read is not statically enumerable:
  }                        //   a dynamic get path, a bare "$data", a dynamic-arguments fragment call
  operators: string[]      // canonical names actually invoked, custom operators included
  fragments: string[]      // fragments called
}
```

- **Transitive through fragments** — a call site pulls in the registered body's dependencies (bodies are static and already compiled, so this is a lookup, not a walk). "What does this expression need" is the question being answered; per-fragment attribution is available by calling `getDependencies` against a body via its own tooling if ever needed.
- **`dynamic` is the honesty bit**: `get` with a computed path, a bare `$data` reference and dynamic fragment arguments make the read-set unenumerable, and pretending otherwise would quietly break cache-invalidation and prefetch consumers. Statically-known paths are still listed alongside `dynamic: true`.
- Paths include `get` operators with *literal* paths (the sugar equivalence: `{ $get: 'a.b' }` ≡ `"$data.a.b"`), and projection segments appear as written (`orders[*].total`).
- Internal namespaces (`$vars`, `$params`, `$element`, `$index`) are deliberately absent — they name nothing outside the expression.
- The operators list doubles as the capability probe: I/O use = intersection with `['http', 'graphQL', 'sql']`; nothing more is needed.

---

## Introspection & housekeeping methods

**`getOperators()`** — content and posture fixed in the [contract](v3-operator-contract.md#introspection-getoperators) (declarative half verbatim; effective `operatorDefaults` merged visibly; function-valued fields as capability flags). Method shape settled here: returns a fresh array of plain objects (snapshot, never live definitions — mutating the return must not touch the registry), in **registration order** (the `operators` array order — stable and author-controlled; v2's alias-table sort dies with the alias table). Reflects instance-level `excludeOperators`.

**`getFragments()`** — content fixed in Fragments (name, `description`, parameter declarations with effective optionality and defaults, `metadata` verbatim). Same snapshot posture, registration order. The body `expression` is deliberately **not** returned — fragments are the host's own registrations (it has them), and the editor consumes the declaration surface, not the implementation.

**`getOptions()`** — snapshot per Options, with one shape ruling, **agreed at close-off**: the returned object excludes the two registry keys (`operators`, `fragments`), which have dedicated, richer introspection above; returning definition arrays here would be a second, worse way to ask the same question, and the closures inside them don't snapshot meaningfully.

**`isEvaluable(expr)`** — the v2 instance method `isFigTreeExpression` renamed, because deep evaluation changed the question: *everything* is a valid v3 expression (any JSON evaluates), so "is this a FigTree expression" no longer discriminates. The question that remains meaningful — the one the editor was really asking — is "would this instance's evaluation be non-identity?": `true` iff the (cached) parse finds at least one evaluable hole, or any static error (a malformed node *engaged* the grammar — it is an expression, a broken one; classifying it as inert data would be the silent de-invocation failure mode the sibling-key rule was designed against). Never throws. The v2 *structural* export's fate (`isOperatorNode` or nothing) belongs to Packaging.

**`clearCache()`** — **new, agreed at close-off** (all-or-nothing — no per-operator filter; the store interface is where finer control lives): empties the operator-result memo store (the `cache` option's store). The concrete case: the host knows external state changed (a DB write landed, a config was republished) and wants the next evaluation fresh without waiting out `maxTime` or constructing a new instance. Does *not* touch the parse cache, which is semantically transparent (keyed on input identity against a stable registry — there is never a correctness reason to clear it; `updateOptions` invalidates it on any change to `operators`, `fragments` or `operatorDefaults`, the three options the compile artifact consumes — see the implementation notes' invalidation-set entry). v2's `getCache()`/`setCache()` die: persistence and inspection are the pluggable `cache.store`'s business — a host that wants to serialize its cache supplies a store it holds a reference to.

**`version`** — a readonly instance property (plus the module-level export, Packaging area). Instance-level because the realistic consumer is the editor handed a `fig` instance from a host whose bundled copy may differ from the editor's own import. v2's `getVersion()` method form retires.

---

## Result immutability — the ruling

Discharging the deep-evaluation deferral. The compile mechanism means results can share structure with three things: the cached constant skeleton, the caller's original input (the identity short-circuit returns it outright), and the caller's own `data` objects (references return them by reference — v2 parity). The implementation-notes options, weighed:

| Option | Verdict |
|---|---|
| `structuredClone` per evaluation | **Rejected** — forfeits the O(holes) cost model that is the compile phase's entire point, on every call, to protect against a caller mistake |
| Deep-freeze the skeleton / results | **Rejected** — freezing reaches objects the caller owns: the identity short-circuit would freeze the caller's *input expression*, and reference results would freeze their *data objects*. An engine has no business making the caller's own objects throw on write |
| Copy-on-write along hole paths | **Rejected as a guarantee** — constant subtrees still share, so mutation still leaks; all cost, partial protection |

**Ruling (agreed at close-off, July 2026): results are contractually read-only, enforced by documentation, not machinery.** Two documented lines carry it:

1. **Treat evaluation results as immutable.** Results may share structure with the input, with cached compile artifacts, and with the evaluation data; mutating them corrupts future evaluations.
2. **Don't mutate an expression object after evaluating it.** The parse cache is keyed on object identity; mutation makes the cached compile stale (this rule exists regardless of the immutability question and is the same contract `WeakMap`-keyed caching always implies).

This is v2 parity (v2 already returns shared references from `getData` et al.) and the only position that doesn't tax the hot path or the caller's own objects. A dev-mode freeze option for flushing out violations is maybe-later, on demand. Trace values are covered by the same lines — they are references to the same results.

---

## Rulings on the surface (cuts and non-additions)

- **No `evaluateSync()`.** The assessment sketched it; cut for v3.0. The contract makes every body potentially async (`Value | Promise<Value>`), and the interesting machinery — race, lazy handles, memoized vars — is promise-shaped; a genuinely synchronous path is a second evaluation engine, not a flag. The performance story it targeted is already answered by the parse cache and lazy evaluation. Adding it later is non-breaking; shipping it now doubles the surface the differential suite must hold still. *(Non-addition — nothing existed in v2.)*
- **No standalone `evaluateExpression()`.** v2's convenience wrapper constructs a throwaway instance per call — under v3 that silently discards the parse cache (the performance model) and, with registration now explicit, quietly means "core operators only". It is also a second way to say a one-liner: `new FigTree().evaluate(expr)`. The migration doc shows the one-liner.
- **No consumer-facing `parse`/`compile`.** Reaffirmed from the assessment; `validate()`'s cache-warming side effect is the pre-warm story.
- **`toShorthand` / conversion utilities** are `./convert` / Packaging-area material, not instance methods — recorded here only so this doc is checkably complete about the method surface.

---

## v2 → v3 method disposition

| v2 | v3 | Notes |
|---|---|---|
| `evaluate(expr, options)` | **Kept** | per-call options frozen, never mutate the instance (Options); return shapes per this doc |
| `evaluateFullObject` option / assessment's `evaluateDeep()` | **Deleted** | deep evaluation is the only semantics (Options) |
| `getOptions()` | **Modified** | snapshot; registry keys excluded |
| `updateOptions(options)` | **Kept** | agreed merge semantics (Options); throws on registration errors (Fragments) |
| `getOperators()` | **Modified** | contract shape; registration order; capability flags |
| `getFragments()` | **Modified** | Fragments shape; declarations, not bodies |
| `getCustomFunctions()` | **Deleted** | no functions tier |
| `getConfig()` | **Deleted** | leaked live internals |
| `getCache()` / `setCache()` | **Deleted** → `clearCache()` | store is pluggable via options |
| `getVersion()` | **Modified** | `version` readonly property |
| `isFigTreeExpression()` (method) | **Renamed** → `isEvaluable()` | semantics sharpened for deep evaluation |
| `evaluateExpression()` (standalone) | **Deleted** | see Rulings |
| — | **New**: `validate()`, `getDependencies()` | the tooling pair |

---

## Open questions — closed at sign-off (Carl, July 2026)

All twelve adjudicated at the area's close-off; two park with the [operator contract](v3-operator-contract.md)'s open list rather than closing here. Verdicts, one line each (rationale lives in the sections above):

1. **Caught-fallback exclusion from report `errors`** — **confirmed as drafted**: the invariant reading; fallback-caught failures are success, `trace` is their record.
2. **Static errors under report mode** — **confirmed as drafted**: reported, not thrown; one uniform channel for the resilient host.
3. **`signal` rejection under report mode** — **confirmed as drafted**: the one "never throws" exception.
4. **`related` on `FigTreeError`** — attachment ruling stands as drafted; **shape parks with the contract's `OperatorFailure` question** (its #6).
5. **`context.trace.note()`** — **moved to the contract's open list** (its #9): the contract addition trace requires for body-level events. Alternative recorded there: engine-supplied (rather than imported) shared renderers that record implicitly — rejected for contradicting the contract's "shared primitives are importable" line, but worth a second look at implementation.
6. **The sample-data check inside `validate()`** — **ships in v3.0**.
7. **`isEvaluable` naming** — **rename confirmed** (the editor is rewritten against v3 anyway).
8. **`clearCache()`** — **confirmed, all-or-nothing**; no operator-name filter — the store interface is where finer control lives.
9. **Trace value size** — **by-reference in v3.0** with the documented caveat; truncation/summary mode maybe-later.
10. **`getOptions()` excluding the registry keys** — **confirmed as drafted**.
11. **What report mode is *for*** — **resolved: production resilience**, the draft's premise throughout (contested at review, confirmed at close-off — § Intended use records the intent, § Why the filler is `null` records the resolution). The hole-filler stays `null`; the mode **name stays `report` with a possibly-improve marker** (`'partial'` / `'resilient'` floated — revisit deliberately before v3.0 ships); a separate authoring/debug mode with loud in-band markers stays a possible later addition (seed use case: the dry-run row in § Intended use).
12. **`operatorDefaults` may not target required parameters** — **confirmed: construction-time error** (required = on-the-node, always; the boundary is optionality, so optional-without-default targets like the host-wide `nullValueDefault` stay legal). The one-line amendment to Options § `operatorDefaults` is made in [v3-api.md](v3-api.md).
