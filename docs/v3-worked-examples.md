# FigTree v3 — worked examples

*Working document, companion to [v3-evaluator-methods.md](v3-evaluator-methods.md) and [v3-implementation-notes.md](v3-implementation-notes.md). Each example traces the machinery end to end on concrete inputs — these double as seed cases for the hand-authored v3 test suite ([v3-testing-strategy.md](v3-testing-strategy.md) step 2).*

*How to read the outputs: the **behaviours are binding** — result values, error codes/paths/causes, which requests fire and how often, cache hit/miss patterns, invalidation effects. The **encodings are illustrative** — exact cache-key serialization, `TraceNode` field names, hash spellings and message wording settle at implementation. A test asserts the former and never the latter.*

---

## 1 · Report mode with depth — failures at different depths, different fates

One config, five holes, five different fates: plain success, success *via the null gradient*, designed degradation (`fallback` catches), a deep uncaught failure, and a failing fallback.

```js
const dashboard = {
  meta: { generated: 'v3-example', version: 3 },        // constant subtree — not a hole; identity short-circuit
  user: {
    displayName: { $buildString: ['%1 %2', '$data.user.first', '$data.user.last'] },
    avatar: {
      operator: 'http',
      url: { $buildString: ['https://api.example.com/avatar/%1', '$data.user.id'] },
      fallback: 'https://api.example.com/avatar/default.png',
    },
  },
  stats: {
    total: { $plus: ['$data.stats.wins', '$data.stats.losses'] },
    summary: { $buildString: ['Win ratio: %1', { $divide: ['$data.stats.wins', '$data.stats.losses'] }] },
  },
  activity: {
    operator: 'http',
    url: 'https://api.example.com/activity',
    fallback: { operator: 'http', url: 'https://backup.example.com/activity' },   // dynamic fallback — a backup call
  },
}

const data = { user: { first: 'Ada', id: 42 }, stats: { wins: 10, losses: 0 } }
// user.last is missing; both the activity API and its backup are down; the avatar API is down too
```

```js
await fig.evaluate(dashboard, { mode: 'report', data })
// {
//   result: {
//     meta: { generated: 'v3-example', version: 3 },
//     user: {
//       displayName: 'Ada ',                                  // null rendered '' — success, no error
//       avatar: 'https://api.example.com/avatar/default.png', // fallback caught — success, no error
//     },
//     stats: {
//       total: 10,
//       summary: null,                                        // degraded hole
//     },
//     activity: null,                                         // degraded hole
//   },
//   errors: [   // tree order (document order of the holes), NOT completion order
//     FigTreeError {
//       code: 'operator-failure', operator: 'divide',
//       path: ['stats', 'summary', '$buildString', 1],        // the failing node — deep
//       holePath: ['stats', 'summary'],                       // the unit that degraded to null
//       message: 'divide – division by zero',
//     },
//     FigTreeError {
//       code: 'operator-failure', operator: 'http',
//       path: ['activity'], holePath: ['activity'],           // failing node IS the hole root here
//       message: 'http – request failed (503): https://backup.example.com/activity',
//       errorData: { status: 503, url: 'https://backup.example.com/activity', /* header names only */ },
//       cause: FigTreeError { code: 'operator-failure', path: ['activity'],
//                             message: 'http – request failed (503): https://api.example.com/activity' },
//     },
//   ],
// }
```

Walking the five fates:

1. **`displayName` — success via the null gradient.** `user.last` is a missing path → `null` → `buildString` renders `''` (References, agreed) → `'Ada '` with a trailing space. No error, no fallback involvement — absence is not failure. `trace` records the null render; the opt-out, if `'Ada '` offends, is `nullValueDefault` on the node (register #18), not `fallback`.
2. **`avatar` — designed degradation.** The API is down; the node's own `fallback` catches (rule 1). Success in both modes, **nothing in `errors`** — the author designed this path. The catch is visible only in `trace`.
3. **`total` — plain success.** `10 + 0 = 10`.
4. **`summary` — deep uncaught failure.** `10 / 0` fails (finite-number guard); no `fallback` anywhere between the `divide` and the hole root, so the failure escapes: the *hole* `['stats','summary']` resolves to `null`, and the error is tagged with the deep failing node's `path` plus the `holePath`. Note the sibling `total` inside the same `stats` literal is untouched — `stats` is plain structure; the holes are independent.
5. **`activity` — failing fallback (rule 4).** The primary request fails, the dynamic fallback evaluates and *also* fails → the node fails with the **fallback's** error, the original attached as `cause`. Nothing above catches → degraded hole.

**Throw-mode contrast**: the same call with `mode: 'throw'` rejects — with whichever of the two uncaught failures *occurred first* (the divide, in practice — no network round-trip), cancelling all in-flight work. Report's `errors` array is the complete set in deterministic tree order; the temporal race only affects throw mode's pick. And note what throw mode *destroys*: the three healthy values, computed and discarded.

---

## 2 · Full lifecycle — two expressions, two caches, one instance

The centerpiece example. A module-level singleton, two structurally different expressions, then re-evaluations across instance identity, content identity, and changing data. Assume a mock HTTP client so request counts are observable.

### Step 0 — construction

```js
import { FigTree, coreOperators, httpOperators } from 'fig-tree-evaluator'

const fig = new FigTree({
  operators: [coreOperators, httpOperators()], // no argument → FetchClient over global fetch (Packaging ruling)
  data: { org: 'Acme' },                                  // instance-level data
  operatorDefaults: { join: { delimiter: ', ' } },
  cache: { maxSize: 50 },
})
```

What now exists inside the instance — and what doesn't:

| Stored | Content |
|---|---|
| operator registry | canonical name → definition for every core operator plus `http`/`graphQL` (client closed over); alias map (`+` → `plus`, …) — collision-checked at this moment |
| fragment registry | empty (fragments would be **compiled here**, at registration — none supplied) |
| validated `operatorDefaults` | `join.delimiter = ', '` — checked against metadata (parameter exists, optional, type `string`); a typo or a *required*-parameter target would have thrown here |
| options snapshot | `data`, cache config, everything else |
| parse cache | identity `WeakMap` + content LRU — **both empty** |
| result cache | store bound to `maxSize: 50` — **empty** |

Nothing has been parsed, evaluated, or fetched. Construction is pure registration + validation.

### Step 1 — evaluate expression A (a config-literal root)

```js
const exprA = {
  greeting: { $buildString: ['Welcome to %1', '$data.org'] },
  team: { $join: '$data.team[*].name' },
  rate: { operator: 'http', url: 'https://api.example.com/rates',
          query: { currency: '$data.currency' }, returnPath: 'rate' },
}
const dataA = { currency: 'NZD', team: [{ name: 'Ada' }, { name: 'Grace' }] }

await fig.evaluate(exprA, { data: dataA })                // → { greeting: 'Welcome to Acme', team: 'Ada, Grace', rate: 0.61 }
```

**Parse** — identity miss, content miss → compile. The artifact (cached under both keys):

```js
// artifact(A) — illustrative rendering
{
  skeleton: { greeting: ◦, team: ◦, rate: ◦ },            // constant shell + three holes
  holes: [
    { path: ['greeting'],                                  // shorthand normalized away at parse:
      node: { operator: 'buildString', template: 'Welcome to %1', substitutions: [ref('$data.org')] } },
    { path: ['team'],
      node: { operator: 'join', values: ref('$data.team[*].name') } },   // single-value payload → whole-array reading
    { path: ['rate'],
      node: { operator: 'http', url: '…/rates', query: { currency: ref('$data.currency') }, returnPath: 'rate' } },
  ],
  issues: [], shielded: false,                             // no hole root carries a static fallback
  nodeCount: 9, maxDepth: 3,                               // stored as numbers; limits compared per call
}
// parse cache after: identityMap { exprA → artifact(A) } ; contentLRU { hashA → artifact(A) }
```

**Evaluate** — three holes, concurrently:

- `greeting`: instance `data` merges under per-call `data` → `org` resolves → `'Welcome to Acme'`. Pure operator, effective `useCache` false (metadata default) → computed, **not** memoized.
- `team`: the `[*]` projection yields `['Ada', 'Grace']`; `join`'s effective `delimiter` comes from `operatorDefaults` → `'Ada, Grace'`.
- `rate`: I/O, effective `useCache` **true** (metadata default). Result-cache lookup on the **effective request**:

```js
// key(illustrative): 'http|get|https://api.example.com/rates?currency=NZD|headers:{}'
// MISS → fetch #1 fires → response { rate: 0.61, base: 'USD' }
// stored VALUE is the FULL response — returnPath applies post-cache:
// resultStore { 'http|get|…currency=NZD|…' → { rate: 0.61, base: 'USD' } }
// node returns 0.61
```

State after step 1: parse cache 1 artifact (both layers), result store 1 entry, fetch count **1**.

### Step 2 — evaluate expression B (a node root, lazy branches)

```js
const exprB = {
  operator: 'match',
  value: '$data.tier',
  branches: {
    gold: { $http: 'https://api.example.com/perks/gold' },
    silver: ['standard-support'],
  },
  default: [],
}

await fig.evaluate(exprB, { data: { tier: 'silver' } })   // → ['standard-support']
```

- **Parse**: miss → compile. A node root is the degenerate case — the whole expression is the single hole, at path `[]`, with no constant shell around it:

```js
// artifact(B) — illustrative rendering
{
  skeleton: ◦,                                            // nothing but the hole
  holes: [
    { path: [],
      node: {
        operator: 'match',
        value: ref('$data.tier'),                          // eager — resolves before the body runs
        branches: {                                        // lazyEntries: static keys, individually-lazy values
          gold: thunk({ operator: 'http',                  // $http shorthand normalized away:
                        url: 'https://api.example.com/perks/gold' }),  // single-value payload → url
          silver: constant(['standard-support']),          // classified constant → a pre-resolved handle
        },
        default: constant([]),                             // declared lazy, but constant — nothing to defer
      } },
  ],
  issues: [], shielded: false,                             // the hole root carries no static fallback
  nodeCount: 6, maxDepth: 3,                               // illustrative
}
// parse cache after: identityMap { exprA → artifact(A), exprB → artifact(B) } ; contentLRU { hashA, hashB }
```

  Three things the compile bound in, all from registry metadata: parameter **delivery modes** (`value` eager, `branches` lazyEntries, `default` lazy — this is where "lazy branches" becomes structure rather than behaviour); **constancy** per entry — `silver` and `default` are constants, compiled to pre-resolved handles (the contract's degeneration rule: the body's uniform `branches[key].evaluate()` works identically for the thunk and the constant), leaving `gold` as the artifact's only genuinely evaluable subunit; and shorthand normalization (`$http` with a single-value payload → the `url` positional). One micro-optimization the artifact *could* carry (implementation notes, key-skeleton note): `gold`'s http node has all-literal parameters, so its effective-request cache key is fully computable at parse.
- **Evaluate**: `'silver'` renders to the branch key `'silver'` → only that entry's handle is demanded → `['standard-support']` by identity. **The `gold` thunk never runs: no fetch, nothing cached.** Fetch count still **1**; result store still 1 entry.

Laziness is observable purely through the mock client — that's the test hook.

### Step 3 — evaluate A again: same instance, same data

```js
await fig.evaluate(exprA, { data: dataA })                // → same result
```

- **Parse**: identity **hit** — a pointer lookup; the input is never walked again.
- `greeting`, `team`: recomputed (pure, cheap, uncached by design).
- `rate`: same resolved query → same effective-request key → result-cache **hit** → no network; `returnPath` re-applied to the shared entry → `0.61`.

Fetch count still **1**. This is the steady-state hot path: O(1) parse lookup + O(holes) work + memoized I/O.

### Step 4 — evaluate B again: *new object instance*, same content

```js
const exprB2 = JSON.parse(JSON.stringify(exprB))          // fresh instance — a new request loading the same config
await fig.evaluate(exprB2, { data: { tier: 'silver' } })  // → ['standard-support']
```

- **Parse**: identity **miss** (new reference) → serialize + hash → content **hit** (`hashB`) → artifact(B) reused, and **re-registered under `exprB2`'s identity**, so any further calls with `exprB2` are O(1).
- Evaluation as step 2. Fetch count still **1**.

### Step 5 — both expressions again, different data

```js
await fig.evaluate(exprA, { data: { currency: 'AUD', team: [{ name: 'Ada' }, { name: 'Grace' }, { name: 'Alan' }] } })
// → { greeting: 'Welcome to Acme', team: 'Ada, Grace, Alan', rate: 0.7301 }

await fig.evaluate(exprB2, { data: { tier: 'gold' } })
// → ['priority-support', 'swag']
```

- **Parse: both identity hits.** The artifact is data-independent — one compile serves every data input forever. This is the two-caches split doing its job.
- `rate`: the resolved query is now `currency=AUD` → **different** effective-request key → miss → fetch #2 → second store entry. Data changes fork result-cache entries *naturally*, because the key is built from resolved values, not from the authored spelling.
- `exprB2` with `tier: 'gold'`: this time the `gold` branch is demanded → fetch #3 (first time this request has ever run) → cached; `silver` doesn't evaluate on this call.

Fetch count **3**; result store 3 entries; parse cache still exactly 2 artifacts.

### Step 6 — coda: the two invalidation stories

```js
fig.updateOptions({ operatorDefaults: { join: { delimiter: ' | ' } } })
await fig.evaluate(exprA, { data: dataA })
// → { greeting: 'Welcome to Acme', team: 'Ada | Grace', rate: 0.61 }
```

`operatorDefaults` is one of the three parse-cache invalidators (with `operators` and `fragments` — modifier defaults bake into precomputed shielding, so artifacts can't survive the change). Both parse layers drop → this call **recompiles** exprA. The **result store is untouched** — its keys derive from resolved requests, which no option default affects — so `rate` is still a cache hit: recompile, but no fetch.

```js
fig.clearCache()
```

The mirror image: the result store empties (next `rate` evaluation refetches), the parse cache is untouched (nothing recompiles — there is never a correctness reason to clear it).

---

## 3 · Timeout shielding — throw, report, and the validate badge

```js
const banner = {
  greeting: { $buildString: ['Hi %1', '$data.name'], fallback: 'Hi there' },   // static fallback
  offers: { operator: 'http', url: 'https://api.example.com/offers', fallback: [] }, // static fallback
}

fig.validate(banner)
// { valid: true, issues: [], timeoutShielded: true }     // every hole root carries a STATIC fallback
```

Evaluate with a 50ms budget; the offers request takes ~900ms, `greeting` completes in ~1ms:

```js
await fig.evaluate(banner, { data: { name: 'Ada' }, timeout: 50 })
// → { greeting: 'Hi Ada', offers: [] }                   // RETURNS, in throw mode — no throw
```

On the deadline: `greeting` finished → contributes its **real** value; `offers` didn't → contributes its **static fallback**; the constant skeleton assembles around them. Pure constant-splicing, zero post-deadline evaluation. Throw mode returns this silently (shielding is author-sanctioned degradation — `trace` records a `shielded-fallback` event on the `offers` hole); report mode is the informative channel:

```js
await fig.evaluate(banner, { data: { name: 'Ada' }, timeout: 50, mode: 'report' })
// { result: { greeting: 'Hi Ada', offers: [] },
//   errors: [ FigTreeError { code: 'timeout', message: 'Evaluation exceeded 50ms' } ] }
// note: exactly [timeoutError] — a shielded expression CANNOT have other uncaught errors,
// since every hole root's fallback catches everything inside its hole
```

Now un-shield it — change one fallback to a *dynamic* expression:

```js
const banner2 = { ...banner, offers: { ...banner.offers, fallback: '$data.cachedOffers' } }
fig.validate(banner2)   // → { valid: true, issues: [], timeoutShielded: false }

await fig.evaluate(banner2, { data: { name: 'Ada' }, timeout: 50 })
// ✗ rejects: FigTreeError { code: 'timeout' }            // all-or-nothing: greeting's finished value is discarded
await fig.evaluate(banner2, { data: { name: 'Ada' }, timeout: 50, mode: 'report' })
// { result: null, errors: [ FigTreeError { code: 'timeout' } ] }
```

The dynamic fallback still catches *ordinary* runtime failures (a 503 from the offers API) — it just can't shield the kill switch, because it could start new work past the deadline. Shielding is all-or-nothing per expression precisely so `validate()` can badge it statically — the edit from `banner` to `banner2` is exactly the silent un-shielding hazard the Node-grammar discoverability note warns about, and the badge flipping `true → false` is the mitigation.

---

## 4 · A failure inside a fragment body — the two-level pointer

```js
fig.updateOptions({
  fragments: {
    userSummary: {
      expression: { $buildString: ['%1 (%2)', '$params.name', { $lower: '$params.role' }] },
      parameters: { name: { type: 'string' }, role: { type: 'string', default: 'member' } },
    },
  },
})
// the body compiles and validates HERE — registration is the fragment's parse moment

const expr = {
  banner: { $userSummary: { name: '$data.user.name', role: '$data.user.role' } },
}

await fig.evaluate(expr, { mode: 'report', data: { user: { name: 'Ada', role: 7 } } })   // role is a number
// {
//   result: { banner: null },
//   errors: [
//     FigTreeError {
//       code: 'type-check', operator: 'lower',
//       path: ['banner'],                                 // the CALL NODE, in the input
//       fragment: 'userSummary',
//       fragmentPath: ['expression', '$buildString', 2],  // the failing node, inside the registered body
//       holePath: ['banner'],
//       message: "lower – parameter 'value': expected string, received number",
//     },
//   ],
// }
```

A fragment-body failure has no single location in the input — the error carries both ends of the pointer: `path` says *which call* failed, `fragment` + `fragmentPath` say *where in the body*. (Had the failure been in the **argument** expression instead — say `role: { $http: … }` with the API down — the failure origin is caller-side and `path` points straight into the input; no `fragmentPath`.) The runtime type error lands at evaluation, not registration, because `role`'s value is dynamic; a *literal* `role: 7` at the call site would have been a `validate()`-time error instead.

---

## 5 · Kleene parking in `or` — the same failure, mattering and not mattering

```js
const canEdit = {
  $or: ['$data.isAdmin', { operator: 'http', url: 'https://api.example.com/permissions/42', returnPath: 'canEdit' }],
}
// the permissions API is down in both runs
```

| Run | `data` | Result | `errors` (report mode) |
|---|---|---|---|
| 1 | `{ isAdmin: true }` | `true` | `[]` — operand 0 settles truthy and *decides*; the in-flight request is **cancelled**, and a failure that already parked would be discarded. Cancellation is not failure. |
| 2 | `{ isAdmin: false }` | node fails → hole `null` | one error: the http failure (lowest parked index that matters — here the only one) |

Run 1's teaching point: the outcome is **deterministic** regardless of completion order — even if the request had already failed before `isAdmin` resolved, `or(parked-failure, true)` is `true`; the parked failure never surfaces in report output (agreed in the passes). Run 2: with no decider, the result *depends* on the failed operand, so the node fails. `trace` is where the full per-operand story lives either way: `value` / `failed-discarded` / `cancelled` statuses per element.

---

## Using these as test cases

- **Inject a scripted mock `HttpClient`** (fixed responses, failure switches, a call counter) and a **recording `CacheStore`** (`{ get, set }` that logs keys). Laziness, memoization, effective-request keying and invalidation all become assertable as *counts and call logs* — no reaching into engine internals.
- Binding assertions per example: result values; error `code` / `path` / `holePath` / `fragmentPath` / `cause` presence; `errors` length and tree order; fetch counts per step (1 / 1 / 1 / 1 / 3 across the lifecycle); which cache layer hit (observable indirectly: step 4's content hit = no recompile = still no fetch); recompile-vs-refetch split in step 6; the `timeoutShielded` badge flip; report/throw divergence points.
- Non-assertions (illustrative only): cache-key encodings, hash spellings, error message wording, `TraceNode` field names, timing values.
- These map to testing-strategy **step 2** (hand-authored v3 tests) and are deliberately converter-independent.
