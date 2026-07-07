# FigTree v3 — null policy & suggested-defaults review sheet

*Working summary for eyeball review (July 2026) — compiled from the parameter passes in [v3-operator-parameters.md](v3-operator-parameters.md) (batches 1–4) and [v3-operator-parameters-2.md](v3-operator-parameters-2.md) (batches 5–8), plus the register ([v3-cases-for-review.md](v3-cases-for-review.md)). **Not normative** — the passes remain the home of every ruling; this sheet exists so the null cells and the absence-default family can be judged as one view. Case numbers (#N) refer to the register.*

## The proposed rule under review

**Null is admitted at a parameter only where `null` is a named member of its declared type; a null arriving anywhere else is a runtime Type error.** Consequences:

- `reject` disappears from the declared policy vocabulary — it is *derived* (null absent from the type), never declared. A null policy is declared only where the type names `null`, and it is one of two words: `propagate` or `value`.
- Every `propagate` cell in the passes therefore adds `| null` to its declared type — the tables below already show this, so a type column *without* null is a reject-by-type row.
- `any` is defined as including `null` throughout, so `value`-policy cells on `any`-typed parameters already conform.
- Element-wise policies (ledger #8) follow the same rule one level down: the *element* type names `null` where the element policy is `propagate`/`value`, while the parameter's own type omits it (whole-null stays #8's type error) — except the iterators' `input`, the one drafted whole-null `propagate` (#24), whose type honestly becomes `array | null`. The rule makes that provisional call visible in the metadata, which seems like a feature.

### Ruled: option (a) (Carl, 2026-07-07) — fixed point 3 (null-means-unset)

Fixed point 3 currently reads null at an *optional* parameter as **unset** (the default applies) unless the type includes null. Under a strict reading of the new rule that becomes a Type error too — which would break, e.g., `round.decimals: '$data.settings.precision'` with the setting missing (#14), and `http.body: '$data.payload'` with the payload missing (#27, whose ruling explicitly relies on unset). Two ways to square it:

- **(a) Scope the rule to required parameters and element/value positions** *(recommended)*: fixed point 3 stands as global machinery — null at an optional parameter is unset, never an error — and optional types stay clean of `| null` noise. Cost: "reject at an optional parameter" becomes inexpressible; nothing currently drafted wants it.
- **(b) Apply the rule everywhere**: every optional parameter wanting unset behaviour declares `| null` plus a third policy word `unset`. Fully explicit metadata, noisier types, and the value-vs-unset distinction moves from a global rule into per-parameter policy.

**Ruled (a)** — the tables below use it: optional parameters show their drafted type without `| null` and policy "unset". Recorded in the Type area (v3-api.md § Null policy, "Admission is type-driven") and the register's fixed points 2–3.

## Post-review rulings (Carl, 2026-07-07 — two rounds)

Recorded from Carl's eyeball passes; the entries below are updated to match. Anything not listed passed review as drafted.

- **Names sharpened**: `nullDefault` → **`nullValueDefault`** (it must read as per-value — a whole-null `values` array stays #8's type error); the `get`/`http`/`graphQL` absence default → **`missingPathDefault`**. Folded through the passes, the register and v3-api.md (July 2026).
- **The ordering comparisons gain `nullValueDefault`** — promoted from extension-candidate to suggested (expected everyday setting: `0`).
- **Renderers**: `buildString` and `join` gain **`nullValueDefault`** — a null substitution/element renders this value instead of `""`; composites keep the `<array>` / `<object>` placeholders unchanged (localizing those is deferred — another day). A broader `invalidValue` covering composites too was considered (round 2) and withdrawn (round 3): null is *not* invalid, and the two cells shouldn't share a knob.
- **`not` stays `value`** (resolved): the flip to `propagate` was weighed against the cases in its entry and declined. The #9 family is answered by guidance instead — `validate()` and the docs explicitly point authors at `missingPathDefault` on the getter (or `nullValueDefault` on the comparison) wherever negation meets possibly-missing data.
- **`pow` gains the alias `^`** (adopted — v3-api.md amended: the full set is now 13 symbols). `%` for `modulo` deliberately does *not* follow — it would promise JS's truncated remainder where v3's `modulo` is floored (and Excel reads `%` as percent), the half-kept-familiarity trap the `regex` naming pass identified. The rename `pow` → **`power`** is confirmed (Carl, 2026-07-07 — plain-word rule; `^` carries the brevity) and folded through the api table, the batch-3 pass and this sheet.
- **The `fallback`-vs-`…Default` overhead, recorded**: the family asks authors "which do I reach for?" — accepted cost; the mitigation is tooling (editor affordances, `validate()` hints), not collapsing the failure/absence distinction. Fold into the register's headline-question note at the group review.

## Legend

- **propagate** — a null resolves the node to `null` (success).
- **value** — null is consumed as an ordinary operating value; the note says what it does there.
- **unset** — fixed point 3: the default applies (see the question above).
- **reject** — Type error; under the rule this is just "null not in the type", spelled out only where worth flagging.
- **structural** — not a value position (parse-time grammar or a parse boundary); the null question doesn't arise.
- *(req)* in the Default column marks required parameters. Evaluation modes (lazy, sequential, per-element) are omitted — see the passes.
- `any` includes `null` throughout.

---

## The list

### `and` / `or` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `values` | `array` — elements `any` | *(req)* | param: reject (dynamic null fails the array check); elements: `value` — truthiness positions, null is falsy |

Suggested default: none — truthiness consumes null (there is no absence left to default), and empty input has its vacuous identity (#4).

### `not` (alias: `!`)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `value` | `any` | *(req)* | `value` — truthiness; null is falsy, so `not: null` → `true` (**#9: flip to `propagate` is a live alternative**) |

Suggested default: none — a truthiness position either reads null as falsy (current) or propagates it (#9); a default parameter answers neither question.

**Resolved (Carl, 2026-07-07): `value` kept.** The deciding cases: **(1) Optional flags, the everyday `not`**: `{ $not: '$data.user.disabled' }` with the flag unset should read `true` — absent-means-false is the universal flag convention; under `propagate` it reads falsy, so `if(b)` and `if(not(b))` *both* take the else branch on missing data — a condition and its negation agree. **(2) Complement coherence**: `and`/`or`/`if.condition` already read null as falsy (agreed, unflagged); under `value`, `not` is that algebra's exact inverter, while under `propagate` `{ $or: ['$data.flag', { $not: '$data.flag' }] }` reads `false` on a missing flag — a tautology failing. **(3) The is-unset idiom**: `{ $not: '$data.x' }` half-breaks under `propagate` — `0`/`""`/`false` still read `true`, but the missing-path null reads falsy: a presence test failing precisely on absence. The #9 trap — `$not` over a *propagating* inner node (a comparison), where the inner null is "unknown" rather than a truthiness verdict — is answered by guidance, per the ruling: `validate()` lints `$not` directly over a propagate-family node, and the lint message and docs **explicitly recommend defaulting the absence at its source** — `missingPathDefault` on the getter (`{ $greaterThan: [{ $get: ['age', 0] }, 18] }`) or `nullValueDefault` on the comparison — so negation never sees a propagated null. Folded into #9's register row and the batch-1/2 passes (July 2026).

### `if` (alias: `?`)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `condition` | `any` | *(req)* | `value` — truthiness position |
| `then` | `any` | *(req)* | `value` — an explicit `null` branch is an ordinary value |
| `else` | `any` | `null` | `value` — `any` includes null, so unset-vs-value never triggers |

Suggested default: **already present — `else`** is the family's ur-member.
Default behaviour: condition falsy → the `else` value; omitted → `null` (#1). An unmet condition is success, never a `fallback` case.

Round-2 clarifications: a null `condition` is falsy → the `else` branch (or `null`), confirmed. A `condition` that *fails* fails the node — `else` never answers errors (`else` answers "falsy", `fallback` answers "broke"); a node-level `fallback` catches it, and error-→-else is spelled with a fallback on the condition itself: `condition: { …, fallback: false }`.

### `match` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `value` | `string` \| `number` \| `boolean` \| `null` | *(req)* | `value` — null is a legal match value that matches no branch (#8) |
| `branches` | `object` — literal map or node computing one | *(req)* | map mode: structural; dynamic mode: a null result is reject |
| `default` | `any` | — *(presence-sensitive)* | `value` |

Suggested default: **already present — `default`**.
Default behaviour: no branch matches (a null `value` included) → the `default` value; no `default` supplied → runtime failure (#7 — a genuine error, so `fallback` legitimately catches it).

### `firstOf` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `values` | `array` — elements `any` | *(req)* | param: reject (#8); elements: `value` — skipping nulls *is* the semantics; all-null / empty → `null` (#5) |

Suggested default: none — the operator *is* the defaulting tool; the last candidate is the default. (A failing candidate is failure, not absence — #6.)

### `equal` (alias: `=`) / `notEqual` (alias: `!=`)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `values` | `array` — elements `any` | *(req)* | param: reject (#8); elements: `value` — null is comparable: `null` = `null` → `true`, null vs anything → `false` |
| `caseInsensitive` | `boolean` | `false` | unset |

Suggested default: none — equality is total; there is no absence or failure cell to default. (`notEqual` powers the blessed is-set idiom `{ $notEqual: ['$data.x', null] }`.)

### `greaterThan` (`>`) / `greaterThanOrEqual` (`>=`) / `lessThan` (`<`) / `lessThanOrEqual` (`<=`)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `values` | `array` — exactly 2, elements `number` \| `string` \| `null` (homogeneous) | *(req)* | param: reject (#8); elements: `propagate` — a null operand resolves the node to `null` (#10: `>=` on two nulls is `null`, not `true`) |

Suggested default: **`nullValueDefault`** *(adopted round 2 — promoted from extension-candidate; expected everyday setting: `0`)*.
Default behaviour: a null operand is replaced by this value before comparison — `{ $greaterThan: { values: ['$data.age', 18], nullValueDefault: 0 } }` states the treat-missing-as claim at the site without `firstOf` ceremony. Bonus: with it set the node is total (an actual boolean), so `$not`-wrapping *that* node becomes safe — a per-site defusal of #9.

### `plus` (alias: `+`)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `values` | `array` — elements homogeneous (`number` \| `string` \| `array` \| `object`) \| `null` | *(req)* | param: reject (#8); elements: `propagate` (#3 — the headline ceremony complaint) |
| `expect` | `'number'` \| `'string'` \| `'array'` \| `'object'` | — (mode inferred) | unset |

Suggested default: **`nullValueDefault`** *(adopted round 2 — per-value by name: a whole-null `values` array stays #8's type error)*.
Default behaviour: any operand that evaluates to `null` is replaced by this value before mode dispatch and the fold — `{ $plus: { values: '$data.scores', nullValueDefault: 0 } }` sums with missing scores as 0. Presence-sensitive: unset → element-wise propagate as drafted. Rides `operatorDefaults` for a host-wide stance. Directly answers #3's "firstOf ceremony" dissent inside fixed points 1–2; if the group review flips #3 globally instead, this parameter is moot.
(Empty input stays as drafted: unmoded → error, `fallback`-catchable — a genuine error, consistent with fallback-means-failure; `expect` pins the identity for the empty case, #11.)

### `subtract` (alias: `-`) / `divide` (alias: `/`) / `modulo` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `value` | `number` \| `null` | *(req)* | `propagate` |
| `minus` / `by` / `mod` | `number` \| `null` | *(req)* | `propagate` |

Suggested default: none — a `nullValueDefault` here would apply to *either* operand, and a binary op with one null operand rarely wants the same stand-in for both; the site wrap stays the honest spelling. Revisit only if the aggregate `nullValueDefault` proves popular.

### `multiply` (alias: `*`)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `values` | `array` — elements `number` \| `null` | *(req)* | param: reject (#8); elements: `propagate` (#3/#13 family); empty → `1` (#12) |

Suggested default: **`nullValueDefault`** *(adopted round 2)* — as `plus`: each null factor replaced before the fold (`nullValueDefault: 1` reads "a missing factor doesn't compound").

### `power` (alias: `^`) — renamed from `pow`, both post-review

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `base` | `number` \| `null` | *(req)* | `propagate` |
| `exponent` | `number` \| `null` | *(req)* | `propagate` |

Suggested default: none.

### `round` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `value` | `number` \| `null` | *(req)* | `propagate` |
| `decimals` | `integer` | `0` | unset → `0` (#14 — the fixed-point-3 showcase) |

Suggested default: none — `decimals`' unset behaviour already is the default mechanism.

### `floor` / `ceil` / `abs` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `value` | `number` \| `null` | *(req)* | `propagate` |

Suggested default: none.

### `min` / `max` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `values` | `array` — elements `number` \| `string` \| `null` (homogeneous) | *(req)* | param: reject (#8); elements: `propagate` — one null candidate → `null` (#13); empty → error |

Suggested default: **`nullValueDefault`** *(adopted round 2)* — each null candidate replaced by this value before comparison. Honest cell, recorded: this states "treat a missing reading as X", which is a claim about the field, not SQL's skip — the skip reading (`MIN` over what's there) would be a *flag*, not a default, and belongs to #13's resolution if wanted.
Also a candidate: **`emptyDefault`** — fires on empty `values`, returning the value instead of the error. Weaker case: empty input is a genuine error, so plain `fallback` already catches it legitimately; `emptyDefault` is merely sharper (it doesn't also swallow type errors). Take it only if the precision seems worth a second parameter.

### `buildString` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `template` | `string` \| `null` | *(req)* | `propagate` |
| `substitutions` | `array` \| `object` — elements/values `any` | `[]` | param: unset → `[]`; elements/values: `value` — null renders `""` (#15's ledger) |
| `trim` | `boolean` | `false` | unset |

Suggested default: **`nullValueDefault`** *(round 3 — the arithmetic family's name landing here too; the round-2 `invalidValue` proposal is withdrawn: null is not invalid, and composites shouldn't share its knob)*.
Default behaviour: a substitution or reference-token value that arrives `null` renders this value (via the stringification table) instead of `""` — `{ $buildString: { template: 'Name: {{name}}', substitutions: { name: null }, nullValueDefault: '<unknown>' } }` → `"Name: <unknown>"`. Presence-sensitive: unset keeps the drafted `""` (#15's rendering-ledger row). Composites are untouched — they keep the `<array>` / `<object>` placeholders (localizable some day, deferred). Unbound tokens are untouched — they render themselves (#15): an authoring seam, not a value seam. One shared contract with `join`, the `delimiter`/`trim` precedent.

### `join` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `values` | `array` — elements `any` | *(req)* | param: reject (#8); elements: `value` — null renders `""`, delimiter kept (#18, resolved) |
| `delimiter` | `string` | `' '` | unset |

Suggested default: **`nullValueDefault`** *(round 3 — as `buildString`, one shared contract)*.
Default behaviour: a null element renders this value instead of `""`, still occupying its slot with its delimiter — #18's position-preserving ruling untouched. Composites are untouched and keep the `<array>` / `<object>` placeholders (the drafted rendering, confirmed in `join`'s pass; `validate()` still errors on statically-composite literal elements).

### `split` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `value` | `string` \| `null` | *(req)* | `propagate` |
| `delimiter` | `string` | `' '` | unset |
| `trim` | `boolean` | `true` | unset |

Suggested default: none.

### `lower` / `upper` / `trim` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `value` | `string` \| `null` | *(req)* | `propagate` |

Suggested default: none.

### `regex` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `value` | `string` \| `null` | *(req)* | `propagate` |
| `pattern` | `string` \| `null` | *(req)* | `propagate` — *worth an eyeball: a null pattern is arguably authored machinery gone missing, not data absence; see the second-look list* |
| `flags` | `string` | `''` | unset |
| `mode` | `'test'` \| `'extract'` \| `'match'` | `'test'` | unset |

Suggested default: **`noMatchDefault`** *(new)*.
Default behaviour: in `mode: 'extract'`, no match → this value instead of `null` (#21); runtime default `null`, so unadorned behaviour is unchanged. A matched empty string (`\d*`-style patterns) is a *match* and passes through — the parameter cleanly splits "matched nothing" from "matched `""`". Never fires in `test` (total) or `match` (`[]` is the answer). `find.noMatchDefault`'s sibling, same name because same firing condition.

### `length` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `value` | `string` \| `array` \| `null` | *(req)* | `propagate` |

Suggested default: none — follow whatever the iterators' `nullInputDefault` decision (below) implies; `length` is the same "absent collection" cell wearing a scalar result.

### `map` / `filter` / `find` / `some` / `every` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `input` | `array` \| `null` | *(req)* | `propagate` — a missing collection resolves the node to `null` (**#24 — judgement explicitly reserved**) |
| `each` | `any` (expression) | *(req)* | `value` — per-element results judged by the operator: `map` takes any value; predicates are truthiness positions, null falsy |
| `as` | `string` — literal identifier | — (bind `$element`/`$index`) | structural |
| `noMatchDefault` (`find` only) | `any` | `null` | `value` — fires on no-match only; a found null passes through (#23) |

Suggested default: `find` **already has `noMatchDefault`**. New for all five: **`nullInputDefault`**.
Default behaviour: when `input` evaluates to `null`, this value is used as the collection instead (typically `[]`). Presence-sensitive: unset → propagate as drafted, so the quantifier trap (#24's `every`-over-missing → vacuous `true`) stays opt-in rather than default. With `[]`: `map`/`filter` → `[]`, `some` → `false`, `every` → `true`, `find` → its `noMatchDefault`. Via `operatorDefaults: { map: { nullInputDefault: [] } }` a host buys null-as-empty per operator without flipping #24 globally — it resolves both of #24's bad cells (safe default, cheap opt-out for the render pipelines).

### `get` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `path` | `string` \| `array` \| `null` | *(req)* | `propagate` |
| `from` | `any` | the merged evaluation data (ledger #13) | `value` — a null source is a source where every path is missing (drill-through) |
| `missingPathDefault` | `any` | — *(presence-sensitive, deliberately)* | `value` — `missingPathDefault: null` is a supplied value: the `strictDataPaths` opt-out (#26) |

Suggested default: **already present — `missingPathDefault`** *(round-2 rename from `missingDefault`, since folded through the batch-6 pass — positional face `['path', 'missingPathDefault']` — the register and v3-api.md)*.
Default behaviour: missing path → the value; stored `null` passes through untouched; unsupplied → missing yields `null` (or fails under `strictDataPaths`).

### `buildObject` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `entries` | `array` — elements `{ key, value }` objects | *(req)* | param: reject (#8); per entry: `key` (`string` \| `number` \| `boolean`) rejects null; `value` (`any`) holds it — the key is kept (#25) |

Suggested default: none — the drop-the-key idiom is one `filter` away, and the wire boundaries drop null pairs themselves (#28).

### `literal` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `value` | `any` — never inspected | *(req)* | structural — a null is content like anything else |

Suggested default: none — `literal` cannot fail and nothing is absent.

### `convert` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `value` | `any` | *(req)* | mode-conditional (ledger #14): `propagate` for `to: 'number'`/`'string'`/`'array'`; `value` → `false` for `to: 'boolean'` |
| `to` | `'number'` \| `'string'` \| `'boolean'` \| `'array'` | *(req)* | reject — null is not a union member |

Suggested default: none — a conversion *failure* is a genuine failure and `fallback`'s legitimate business. (Under the type-driven rule, `value`'s null admission is unconditional — `any` names null — while the *policy* stays keyed to `to`; the conditionality lives in the policy, not the admission.)

### `http` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `url` | `string` | *(req)* | reject — an address is never manufactured from absence |
| `method` | `'get'` \| `'post'` | `'get'` | unset |
| `query` | `object` — values `string` \| `number` \| `boolean` \| `null` | — (no query string) | param: unset (whole-null → the *unfiltered* request — #28's honesty cell); per value: `value` — **the pair is omitted** (#28) |
| `body` | JSON value — type deliberately excludes `null` (#27) | — (no body) | unset → no body; nulls *inside* a present body serialize as JSON `null` |
| `headers` | `object` — values `string` \| `number` \| `boolean` \| `null` | — | param: unset; per value: `value` — pair omitted (removes an instance-default header) |
| `returnPath` | `string` \| `array` | — (whole response) | unset |
| `timeout` | `integer` (ms) | — (evaluation bound only) | unset |

Suggested default: **`missingPathDefault`** *(candidate, deferred-friendly)* — fires when a supplied `returnPath` misses in the response, instead of `null`; same firing condition and name as `get`'s. Composition already covers it (wrap in `get`), so this is a frequency call, not a gap — non-breaking to add later if the field asks. Request failures (non-2xx, timeout) stay `fallback`'s.

### `graphQL` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `query` | `string` | *(req)* | reject |
| `variables` | `object` — values `any` (JSON) | — | param: unset; per value: `value` — **carried as JSON `null`** (nullable GraphQL args) |
| `url` | `string` | the `graphQL.endpoint` option | unset |
| `headers` | `object` — values `string` \| `number` \| `boolean` \| `null` | — | as `http.headers` |
| `returnPath` | `string` \| `array` | — (the whole `data` field) | unset |
| `timeout` | `integer` (ms) | — | unset |

Suggested default: the same `missingPathDefault` candidate as `http`. A response with GraphQL `errors` is a genuine failure (#30) — `fallback`'s business, not a default's.

### `sql` (no alias)

| Parameter | Type (incl. null) | Default | Null policy (current) |
| --- | --- | --- | --- |
| `query` | `string` | *(req)* | reject |
| `values` | `array` \| `object` — elements/values `any` | — (no binds) | param: unset; per element/value: `value` — **SQL `NULL`** on the wire (agreed) |
| `shape` | `'rows'` \| `'row'` \| `'column'` \| `'value'` | `'rows'` | unset |
| `timeout` | `integer` (ms) | — | unset |

Suggested default: **`noRowDefault`** *(new — already anticipated as the natural sibling in #29)*.
Default behaviour: under `shape: 'row'` or `'value'`, an empty result set → this value instead of `null`; runtime default `null`, so unadorned behaviour is unchanged. Never fires under `'rows'`/`'column'` (`[]` is the answer) and never on genuine failures (connection, SQL error, timeout — `fallback`'s).

---

## Suggested defaults — one-glance summary

| Operator | Parameter | Status | Fires on | Instead of |
| --- | --- | --- | --- | --- |
| `if` | `else` | exists | condition unmet | `null` |
| `match` | `default` | exists | no branch matched | runtime failure |
| `find` | `noMatchDefault` | exists (batch 5) | no element matched | `null` |
| `get` | `missingPathDefault` | exists (batch 6; renamed round 2) | missing path | `null` / `strictDataPaths` failure |
| `regex` | `noMatchDefault` | **suggested** | `extract` mode, no match | `null` |
| `sql` | `noRowDefault` | **suggested** (per #29's note) | `'row'`/`'value'` shape, empty result | `null` |
| `plus`, `multiply`, `min`, `max` | `nullValueDefault` | **suggested** | a null operand/element | element-wise propagate (#3/#13) |
| `map`/`filter`/`find`/`some`/`every` | `nullInputDefault` | **suggested** | `input` evaluates to null | propagate (#24) |
| `min`, `max` | `emptyDefault` | candidate (weaker) | empty `values` | runtime failure (`fallback`-catchable) |
| `http`, `graphQL` | `missingPathDefault` | candidate (deferred) | supplied `returnPath` misses | `null` |
| ordering comparisons | `nullValueDefault` | **suggested** (round 2) | a null operand | propagate (#10) |
| `buildString`, `join` | `nullValueDefault` | **suggested** (round 3) | a null substitution/element at render | `""` |

All suggestions are presence-sensitive or default-`null`, so the unadorned drafted behaviour is unchanged; each rides the layered defaults chain (`operatorDefaults`), which is the family's structural advantage over any fallback-flavoured mechanism. **The whole family assumes the headline `fallback` question resolves to failure-only** (as this sheet's premise states); restoring the v2 reading would dissolve most of it.

## Rows worth a second look

1. **The address-string asymmetry**: `buildString.template`, `regex.pattern` and `get.path` all *propagate* null, while `http.url`, `graphQL.query` and `sql.query` *reject* it. If the boundary is "I/O rejects, pure propagates" it's defensible (an aborted render costs nothing; a request fired at a manufactured address acts on the world) — but `regex.pattern` is authored machinery more than data, and a propagated-null pattern silently nulls the node where a reject would name the real problem. Worth confirming each deliberately.
2. **`input: array | null`** on the iterators is the one *required* parameter whose type names null — the rule surfaces #24's provisional propagate as visible metadata. If #24 flips to null-as-empty (or `nullInputDefault` covers the need), the type follows.
3. **`not.value`** (#9): if the pending flip to `propagate` happens, nothing changes in the type column (`any` already names null) — only the policy word moves. The is-unset idiom breaks either way; #9 is unaffected by this sheet's rule.
4. **`http.body`**: the batch-8 table types it `any`, but #27's ruling depends on its type *excluding* null (whole-null = unset = no body). Restated above as "JSON value excl. null" — the pass table should say so too, or under rule (b) this cell contradicts itself.
5. **`convert.value`** stays cleanly declarable under the type-driven rule: null is admitted unconditionally (`any`), and only the *policy* is mode-conditional (ledger #14).
