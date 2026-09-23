# FigTree v3 — null policy & suggested-defaults review sheet

_Working summary for eyeball review (July 2026) — compiled from the parameter passes in [v3-operator-parameters.md](v3-operator-parameters.md) (batches 1–4) and [v3-operator-parameters-2.md](v3-operator-parameters-2.md) (batches 5–8), plus the register ([v3-cases-for-review.md](v3-cases-for-review.md)). **Not normative** — the passes remain the home of every ruling; this sheet exists so the null cells and the absence-default family can be judged as one view. Case numbers (#N) refer to the register._

## The proposed rule under review

**Null is admitted at a parameter only where `null` is a named member of its declared type; a null arriving anywhere else is a runtime Type error.** Consequences:

- `reject` disappears from the declared policy vocabulary — it is _derived_ (null absent from the type), never declared. A null policy is declared only where the type names `null`, and it is one of two words: `propagate` or `value`.
- Every `propagate` cell in the passes therefore adds `| null` to its declared type — the tables below already show this, so a type column _without_ null is a reject-by-type row.
- `any` is defined as including `null` throughout, so `value`-policy cells on `any`-typed parameters already conform.
- Element-wise policies (ledger #8) follow the same rule one level down: the _element_ type names `null` where the element policy is `propagate`/`value`, while the parameter's own type omits it (whole-null stays #8's type error). The one drafted exception — the iterators' `input`, whole-null `propagate` (#24) — was flipped to reject at the group review, so container parameters are now uniform: whole-null is always a type error.

### Ruled: option (a) (Carl, 2026-07-07) — fixed point 3 (null-means-unset)

Fixed point 3 currently reads null at an _optional_ parameter as **unset** (the default applies) unless the type includes null. Under a strict reading of the new rule that becomes a Type error too — which would break, e.g., `round.decimals: '$data.settings.precision'` with the setting missing (#14), and `http.body: '$data.payload'` with the payload missing (#27, whose ruling explicitly relies on unset). Two ways to square it:

- **(a) Scope the rule to required parameters and element/value positions** _(recommended)_: fixed point 3 stands as global machinery — null at an optional parameter is unset, never an error — and optional types stay clean of `| null` noise. Cost: "reject at an optional parameter" becomes inexpressible; nothing currently drafted wants it.
- **(b) Apply the rule everywhere**: every optional parameter wanting unset behaviour declares `| null` plus a third policy word `unset`. Fully explicit metadata, noisier types, and the value-vs-unset distinction moves from a global rule into per-parameter policy.

**Ruled (a)** — the tables below use it: optional parameters show their drafted type without `| null` and policy "unset". Recorded in the Type area (v3-api.md § Null policy, "Admission is type-driven") and the register's fixed points 2–3.

## Post-review rulings (Carl, 2026-07-07 — two rounds)

Recorded from Carl's eyeball passes; the entries below are updated to match. Anything not listed passed review as drafted.

- **Names sharpened**: `nullDefault` → **`nullValueDefault`** (it must read as per-value — a whole-null `values` array stays #8's type error); the `get`/`http`/`graphQL` absence default → **`missingPathDefault`**. Folded through the passes, the register and v3-api.md (July 2026).
- **The ordering comparisons gain `nullValueDefault`** — promoted from extension-candidate to suggested (expected everyday setting: `0`).
- **Renderers**: `buildString` and `join` gain **`nullValueDefault`** — a null substitution/element renders this value instead of `""`; composites keep the `<array>` / `<object>` placeholders unchanged (localizing those is deferred — another day). A broader `invalidValue` covering composites too was considered (round 2) and withdrawn (round 3): null is _not_ invalid, and the two cells shouldn't share a knob.
- **`not` stays `value`** (resolved): the flip to `propagate` was weighed against the cases in its entry and declined. The #9 family is answered by guidance instead — `validate()` and the docs explicitly point authors at `missingPathDefault` on the getter (or `nullValueDefault` on the comparison) wherever negation meets possibly-missing data.
- **`pow` gains the alias `^`** (adopted — v3-api.md amended: the full set is now 13 symbols). `%` for `modulo` deliberately does _not_ follow — it would promise JS's truncated remainder where v3's `modulo` is floored (and Excel reads `%` as percent), the half-kept-familiarity trap the `regex` naming pass identified. The rename `pow` → **`power`** is confirmed (Carl, 2026-07-07 — plain-word rule; `^` carries the brevity) and folded through the api table, the batch-3 pass and this sheet.
- **The `fallback`-vs-`…Default` overhead, recorded**: the family asks authors "which do I reach for?" — accepted cost; the mitigation is tooling (editor affordances, `validate()` hints), not collapsing the failure/absence distinction. Folded into the register's headline-question resolution.
- **The group review is done** (Carl, 2026-07-07): `fallback` = failure only (headline question settled the drafted way); #3's null-operand `propagate` confirmed (a future flip to reject reserved — the register's one open reservation, with the `length` seam beside it); **#24 flipped to reject** — iterator `input` is `array` only, `nullInputDefault` the softener; #7/#8 confirmed; every register row now agreed. The register ([v3-cases-for-review.md](v3-cases-for-review.md)) is rewritten as the settled reference; this sheet stands as the working record behind it.

## Legend

- **propagate** — a null resolves the node to `null` (success).
- **value** — null is consumed as an ordinary operating value; the note says what it does there.
- **unset** — fixed point 3: the default applies (see the question above).
- **reject** — Type error; under the rule this is just "null not in the type", spelled out only where worth flagging.
- **structural** — not a value position (compile-time grammar or a compile boundary); the null question doesn't arise.
- _(req)_ in the Default column marks required parameters. Evaluation modes (lazy, sequential, per-element) are omitted — see the passes.
- `any` includes `null` throughout.

---

## The list

### `and` / `or` (no alias)

| Parameter | Type (incl. null)        | Default | Null policy (current)                                                                                       |
| --------- | ------------------------ | ------- | ----------------------------------------------------------------------------------------------------------- |
| `values`  | `array` — elements `any` | _(req)_ | param: reject (dynamic null fails the array check); elements: `value` — truthiness positions, null is falsy |

Suggested default: none — truthiness consumes null (there is no absence left to default), and empty input has its vacuous identity (#4).

### `not` (alias: `!`)

| Parameter | Type (incl. null) | Default | Null policy (current)                                                                                            |
| --------- | ----------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `value`   | `any`             | _(req)_ | `value` — truthiness; null is falsy, so `not: null` → `true` (**#9: flip to `propagate` is a live alternative**) |

Suggested default: none — a truthiness position either reads null as falsy (current) or propagates it (#9); a default parameter answers neither question.

**Resolved (Carl, 2026-07-07): `value` kept.** The deciding cases: **(1) Optional flags, the everyday `not`**: `{ $not: '$data.user.disabled' }` with the flag unset should read `true` — absent-means-false is the universal flag convention; under `propagate` it reads falsy, so `if(b)` and `if(not(b))` _both_ take the else branch on missing data — a condition and its negation agree. **(2) Complement coherence**: `and`/`or`/`if.condition` already read null as falsy (agreed, unflagged); under `value`, `not` is that algebra's exact inverter, while under `propagate` `{ $or: ['$data.flag', { $not: '$data.flag' }] }` reads `false` on a missing flag — a tautology failing. **(3) The is-unset idiom**: `{ $not: '$data.x' }` half-breaks under `propagate` — `0`/`""`/`false` still read `true`, but the missing-path null reads falsy: a presence test failing precisely on absence. The #9 trap — `$not` over a _propagating_ inner node (a comparison), where the inner null is "unknown" rather than a truthiness verdict — is answered by guidance, per the ruling: `validate()` lints `$not` directly over a propagate-family node, and the lint message and docs **explicitly recommend defaulting the absence at its source** — `missingPathDefault` on the getter (`{ $greaterThan: [{ $get: ['age', 0] }, 18] }`) or `nullValueDefault` on the comparison — so negation never sees a propagated null. Folded into #9's register row and the batch-1/2 passes (July 2026).

### `if` (alias: `?`)

| Parameter   | Type (incl. null) | Default | Null policy (current)                                           |
| ----------- | ----------------- | ------- | --------------------------------------------------------------- |
| `condition` | `any`             | _(req)_ | `value` — truthiness position                                   |
| `then`      | `any`             | _(req)_ | `value` — an explicit `null` branch is an ordinary value        |
| `else`      | `any`             | `null`  | `value` — `any` includes null, so unset-vs-value never triggers |

Suggested default: **already present — `else`** is the family's ur-member.
Default behaviour: condition falsy → the `else` value; omitted → `null` (#1). An unmet condition is success, never a `fallback` case.

Round-2 clarifications: a null `condition` is falsy → the `else` branch (or `null`), confirmed. A `condition` that _fails_ fails the node — `else` never answers errors (`else` answers "falsy", `fallback` answers "broke"); a node-level `fallback` catches it, and error-→-else is spelled with a fallback on the condition itself: `condition: { …, fallback: false }`.

### `match` (no alias)

| Parameter  | Type (incl. null)                            | Default                  | Null policy (current)                                             |
| ---------- | -------------------------------------------- | ------------------------ | ----------------------------------------------------------------- |
| `value`    | `string` \| `number` \| `boolean` \| `null`  | _(req)_                  | `value` — null is a legal match value that matches no branch (#8) |
| `branches` | `object` — literal map or node computing one | _(req)_                  | map mode: structural; dynamic mode: a null result is reject       |
| `default`  | `any`                                        | — _(presence-sensitive)_ | `value`                                                           |

Suggested default: **already present — `default`**.
Default behaviour: no branch matches (a null `value` included) → the `default` value; no `default` supplied → runtime failure (#7 — a genuine error, so `fallback` legitimately catches it).

### `firstOf` (no alias)

| Parameter | Type (incl. null)        | Default | Null policy (current)                                                                                     |
| --------- | ------------------------ | ------- | --------------------------------------------------------------------------------------------------------- |
| `values`  | `array` — elements `any` | _(req)_ | param: reject (#8); elements: `value` — skipping nulls _is_ the semantics; all-null / empty → `null` (#5) |

Suggested default: none — the operator _is_ the defaulting tool; the last candidate is the default. (A failing candidate is failure, not absence — #6.)

### `equal` (alias: `=`) / `notEqual` (alias: `!=`)

| Parameter         | Type (incl. null)        | Default | Null policy (current)                                                                                            |
| ----------------- | ------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `values`          | `array` — elements `any` | _(req)_ | param: reject (#8); elements: `value` — null is comparable: `null` = `null` → `true`, null vs anything → `false` |
| `caseInsensitive` | `boolean`                | `false` | unset                                                                                                            |

Suggested default: none — equality is total; there is no absence or failure cell to default. (`notEqual` powers the blessed is-set idiom `{ $notEqual: ['$data.x', null] }`.)

### `greaterThan` (`>`) / `greaterThanOrEqual` (`>=`) / `lessThan` (`<`) / `lessThanOrEqual` (`<=`)

| Parameter | Type (incl. null)                                                          | Default | Null policy (current)                                                                                                                 |
| --------- | -------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `values`  | `array` — exactly 2, elements `number` \| `string` \| `null` (homogeneous) | _(req)_ | param: reject (#8); elements: `propagate` — a null operand resolves the node to `null` (#10: `>=` on two nulls is `null`, not `true`) |

Suggested default: **`nullValueDefault`** _(adopted round 2 — promoted from extension-candidate; expected everyday setting: `0`)_.
Default behaviour: a null operand is replaced by this value before comparison — `{ $greaterThan: { values: ['$data.age', 18], nullValueDefault: 0 } }` states the treat-missing-as claim at the site without `firstOf` ceremony. Bonus: with it set the node is total (an actual boolean), so `$not`-wrapping _that_ node becomes safe — a per-site defusal of #9.

### `plus` (alias: `+`)

| Parameter | Type (incl. null)                                                                      | Default           | Null policy (current)                                                            |
| --------- | -------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------- |
| `values`  | `array` — elements homogeneous (`number` \| `string` \| `array` \| `object`) \| `null` | _(req)_           | param: reject (#8); elements: `propagate` (#3 — the headline ceremony complaint) |
| `expect`  | `'number'` \| `'string'` \| `'array'` \| `'object'`                                    | — (mode inferred) | unset                                                                            |

Suggested default: **`nullValueDefault`** _(adopted round 2 — per-value by name: a whole-null `values` array stays #8's type error)_.
Default behaviour: any operand that evaluates to `null` is replaced by this value before mode dispatch and the fold — `{ $plus: { values: '$data.scores', nullValueDefault: 0 } }` sums with missing scores as 0. Presence-sensitive: unset → element-wise propagate as drafted. Rides `operatorDefaults` for a host-wide stance. Directly answers #3's "firstOf ceremony" dissent inside fixed points 1–2 (#3 confirmed at the group review, with its future flip to reject reserved in the register's Open items).
(Empty input stays as drafted: unmoded → error, `fallback`-catchable — a genuine error, consistent with fallback-means-failure; `expect` pins the identity for the empty case, #11.)

### `subtract` (alias: `-`) / `divide` (alias: `/`) / `modulo` (no alias)

| Parameter              | Type (incl. null)  | Default | Null policy (current) |
| ---------------------- | ------------------ | ------- | --------------------- |
| `value`                | `number` \| `null` | _(req)_ | `propagate`           |
| `minus` / `by` / `mod` | `number` \| `null` | _(req)_ | `propagate`           |

Suggested default: none — a `nullValueDefault` here would apply to _either_ operand, and a binary op with one null operand rarely wants the same stand-in for both; the site wrap stays the honest spelling. Revisit only if the aggregate `nullValueDefault` proves popular.

### `multiply` (alias: `*`)

| Parameter | Type (incl. null)                     | Default | Null policy (current)                                                        |
| --------- | ------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| `values`  | `array` — elements `number` \| `null` | _(req)_ | param: reject (#8); elements: `propagate` (#3/#13 family); empty → `1` (#12) |

Suggested default: **`nullValueDefault`** _(adopted round 2)_ — as `plus`: each null factor replaced before the fold (`nullValueDefault: 1` reads "a missing factor doesn't compound").

### `power` (alias: `^`) — renamed from `pow`, both post-review

| Parameter  | Type (incl. null)  | Default | Null policy (current) |
| ---------- | ------------------ | ------- | --------------------- |
| `base`     | `number` \| `null` | _(req)_ | `propagate`           |
| `exponent` | `number` \| `null` | _(req)_ | `propagate`           |

Suggested default: none.

### `round` (no alias)

| Parameter  | Type (incl. null)  | Default | Null policy (current)                          |
| ---------- | ------------------ | ------- | ---------------------------------------------- |
| `value`    | `number` \| `null` | _(req)_ | `propagate`                                    |
| `decimals` | `integer`          | `0`     | unset → `0` (#14 — the fixed-point-3 showcase) |

Suggested default: none — `decimals`' unset behaviour already is the default mechanism.

### `floor` / `ceil` / `abs` (no alias)

| Parameter | Type (incl. null)  | Default | Null policy (current) |
| --------- | ------------------ | ------- | --------------------- |
| `value`   | `number` \| `null` | _(req)_ | `propagate`           |

Suggested default: none.

### `min` / `max` (no alias)

| Parameter | Type (incl. null)                                               | Default | Null policy (current)                                                                        |
| --------- | --------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `values`  | `array` — elements `number` \| `string` \| `null` (homogeneous) | _(req)_ | param: reject (#8); elements: `propagate` — one null candidate → `null` (#13); empty → error |

Suggested default: **`nullValueDefault`** _(adopted round 2)_ — each null candidate replaced by this value before comparison. Honest cell, recorded: this states "treat a missing reading as X", which is a claim about the field, not SQL's skip — the skip reading (`MIN` over what's there) would be a _flag_, not a default, and belongs to #13's resolution if wanted.
Also a candidate: **`emptyDefault`** — fires on empty `values`, returning the value instead of the error. Weaker case: empty input is a genuine error, so plain `fallback` already catches it legitimately; `emptyDefault` is merely sharper (it doesn't also swallow type errors). Take it only if the precision seems worth a second parameter.

### `buildString` (no alias)

| Parameter       | Type (incl. null)                           | Default | Null policy (current)                                                            |
| --------------- | ------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| `template`      | `string` \| `null`                          | _(req)_ | `propagate`                                                                      |
| `substitutions` | `array` \| `object` — elements/values `any` | `[]`    | param: unset → `[]`; elements/values: `value` — null renders `""` (#15's ledger) |
| `trim`          | `boolean`                                   | `false` | unset                                                                            |

Suggested default: **`nullValueDefault`** _(round 3 — the arithmetic family's name landing here too; the round-2 `invalidValue` proposal is withdrawn: null is not invalid, and composites shouldn't share its knob)_.
Default behaviour: a substitution or reference-token value that arrives `null` renders this value (via the stringification table) instead of `""` — `{ $buildString: { template: 'Name: {{name}}', substitutions: { name: null }, nullValueDefault: '<unknown>' } }` → `"Name: <unknown>"`. Presence-sensitive: unset keeps the drafted `""` (#15's rendering-ledger row). Composites are untouched — they keep the `<array>` / `<object>` placeholders (localizable some day, deferred). Unbound tokens are untouched — they render themselves (#15): an authoring seam, not a value seam. One shared contract with `join`, the `delimiter`/`trim` precedent.

### `join` (no alias)

| Parameter   | Type (incl. null)        | Default | Null policy (current)                                                                     |
| ----------- | ------------------------ | ------- | ----------------------------------------------------------------------------------------- |
| `values`    | `array` — elements `any` | _(req)_ | param: reject (#8); elements: `value` — null renders `""`, delimiter kept (#18, resolved) |
| `delimiter` | `string`                 | `' '`   | unset                                                                                     |

Suggested default: **`nullValueDefault`** _(round 3 — as `buildString`, one shared contract)_.
Default behaviour: a null element renders this value instead of `""`, still occupying its slot with its delimiter — #18's position-preserving ruling untouched. Composites are untouched and keep the `<array>` / `<object>` placeholders (the drafted rendering, confirmed in `join`'s pass; `validate()` still errors on statically-composite literal elements).

### `split` (no alias)

| Parameter   | Type (incl. null)  | Default | Null policy (current) |
| ----------- | ------------------ | ------- | --------------------- |
| `value`     | `string` \| `null` | _(req)_ | `propagate`           |
| `delimiter` | `string`           | `' '`   | unset                 |
| `trim`      | `boolean`          | `true`  | unset                 |

Suggested default: none.

### `lower` / `upper` / `trim` (no alias)

| Parameter | Type (incl. null)  | Default | Null policy (current) |
| --------- | ------------------ | ------- | --------------------- |
| `value`   | `string` \| `null` | _(req)_ | `propagate`           |

Suggested default: none.

### `regex` (no alias)

| Parameter | Type (incl. null)                    | Default  | Null policy (current)                                                                                                                    |
| --------- | ------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `value`   | `string` \| `null`                   | _(req)_  | `propagate`                                                                                                                              |
| `pattern` | `string` \| `null`                   | _(req)_  | `propagate` — _worth an eyeball: a null pattern is arguably authored machinery gone missing, not data absence; see the second-look list_ |
| `flags`   | `string`                             | `''`     | unset                                                                                                                                    |
| `mode`    | `'test'` \| `'extract'` \| `'match'` | `'test'` | unset                                                                                                                                    |

Suggested default: **`noMatchDefault`** _(new)_.
Default behaviour: in `mode: 'extract'`, no match → this value instead of `null` (#21); runtime default `null`, so unadorned behaviour is unchanged. A matched empty string (`\d*`-style patterns) is a _match_ and passes through — the parameter cleanly splits "matched nothing" from "matched `""`". Never fires in `test` (total) or `match` (`[]` is the answer). `find.noMatchDefault`'s sibling, same name because same firing condition.

### `length` (no alias)

| Parameter | Type (incl. null)             | Default | Null policy (current) |
| --------- | ----------------------------- | ------- | --------------------- |
| `value`   | `string` \| `array` \| `null` | _(req)_ | `propagate`           |

Suggested default: none. Note: `length` keeps `propagate` while the iterators' `input` flipped to reject (#24) — no longer twins; the seam is recorded in the register's Open items, to be decided when next touching `length`.

### `map` / `filter` / `find` / `some` / `every` (no alias)

| Parameter                      | Type (incl. null)             | Default                      | Null policy (current)                                                                                                        |
| ------------------------------ | ----------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `input`                        | `array`                       | _(req)_                      | reject — a null collection is a runtime type error (**#24 — flipped at the group review**); `nullInputDefault` softens       |
| `each`                         | `any` (expression)            | _(req)_                      | `value` — per-element results judged by the operator: `map` takes any value; predicates are truthiness positions, null falsy |
| `as`                           | `string` — literal identifier | — (bind `$element`/`$index`) | structural                                                                                                                   |
| `noMatchDefault` (`find` only) | `any`                         | `null`                       | `value` — fires on no-match only; a found null passes through (#23)                                                          |

Suggested default: `find` **already has `noMatchDefault`**. New for all five: **`nullInputDefault`**.
Default behaviour: when `input` evaluates to `null`, this value is used as the collection instead (typically `[]`). Presence-sensitive, applied before the type check: unset → #24's type error; supplied → no error at all. With `[]`: `map`/`filter` → `[]`, `some` → `false`, `every` → `true`, `find` → its `noMatchDefault`. Via `operatorDefaults: { map: { nullInputDefault: [] } }` a host buys null-as-empty per operator — opt-in and visible.

### `get` (no alias)

| Parameter            | Type (incl. null)             | Default                                 | Null policy (current)                                                                         |
| -------------------- | ----------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `path`               | `string` \| `array` \| `null` | _(req)_                                 | `propagate`                                                                                   |
| `from`               | `any`                         | the merged evaluation data (ledger #13) | `value` — a null source is a source where every path is missing (drill-through)               |
| `missingPathDefault` | `any`                         | — _(presence-sensitive, deliberately)_  | `value` — `missingPathDefault: null` is a supplied value: the `strictDataPaths` opt-out (#26) |

Suggested default: **already present — `missingPathDefault`** _(round-2 rename from `missingDefault`, since folded through the batch-6 pass — positional face `['path', 'missingPathDefault']` — the register and v3-api.md)_.
Default behaviour: missing path → the value; stored `null` passes through untouched; unsupplied → missing yields `null` (or fails under `strictDataPaths`).

### `buildObject` (no alias)

| Parameter | Type (incl. null)                           | Default | Null policy (current)                                                                                                                   |
| --------- | ------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `entries` | `array` — elements `{ key, value }` objects | _(req)_ | param: reject (#8); per entry: `key` (`string` \| `number` \| `boolean`) rejects null; `value` (`any`) holds it — the key is kept (#25) |

Suggested default: none — the drop-the-key idiom is one `filter` away, and the wire boundaries drop null pairs themselves (#28).

### `literal` (no alias)

| Parameter | Type (incl. null)       | Default | Null policy (current)                             |
| --------- | ----------------------- | ------- | ------------------------------------------------- |
| `value`   | `any` — never inspected | _(req)_ | structural — a null is content like anything else |

Suggested default: none — `literal` cannot fail and nothing is absent.

### `convert` (no alias)

| Parameter | Type (incl. null)                                    | Default | Null policy (current)                                                                                                     |
| --------- | ---------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `value`   | `any`                                                | _(req)_ | mode-conditional (ledger #14): `propagate` for `to: 'number'`/`'string'`/`'array'`; `value` → `false` for `to: 'boolean'` |
| `to`      | `'number'` \| `'string'` \| `'boolean'` \| `'array'` | _(req)_ | reject — null is not a union member                                                                                       |

Suggested default: none — a conversion _failure_ is a genuine failure and `fallback`'s legitimate business. (Under the type-driven rule, `value`'s null admission is unconditional — `any` names null — while the _policy_ stays keyed to `to`; the conditionality lives in the policy, not the admission.)

### `http` (no alias)

| Parameter    | Type (incl. null)                                             | Default                   | Null policy (current)                                                                                                         |
| ------------ | ------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `url`        | `string`                                                      | _(req)_                   | reject — an address is never manufactured from absence                                                                        |
| `method`     | `'get'` \| `'post'`                                           | `'get'`                   | unset                                                                                                                         |
| `query`      | `object` — values `string` \| `number` \| `boolean` \| `null` | — (no query string)       | param: unset (whole-null → the _unfiltered_ request — #28's honesty cell); per value: `value` — **the pair is omitted** (#28) |
| `body`       | JSON value — type deliberately excludes `null` (#27)          | — (no body)               | unset → no body; nulls _inside_ a present body serialize as JSON `null`                                                       |
| `headers`    | `object` — values `string` \| `number` \| `boolean` \| `null` | —                         | param: unset; per value: `value` — pair omitted (removes an instance-default header)                                          |
| `returnPath` | `string` \| `array`                                           | — (whole response)        | unset                                                                                                                         |
| `timeout`    | `integer` (ms)                                                | — (evaluation bound only) | unset                                                                                                                         |

Suggested default: **`missingPathDefault`** _(candidate, deferred-friendly)_ — fires when a supplied `returnPath` misses in the response, instead of `null`; same firing condition and name as `get`'s. Composition already covers it (wrap in `get`), so this is a frequency call, not a gap — non-breaking to add later if the field asks. Request failures (non-2xx, timeout) stay `fallback`'s.

### `graphQL` (no alias)

| Parameter    | Type (incl. null)                                             | Default                       | Null policy (current)                                                                 |
| ------------ | ------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| `query`      | `string`                                                      | _(req)_                       | reject                                                                                |
| `variables`  | `object` — values `any` (JSON)                                | —                             | param: unset; per value: `value` — **carried as JSON `null`** (nullable GraphQL args) |
| `url`        | `string`                                                      | the `graphQL.endpoint` option | unset                                                                                 |
| `headers`    | `object` — values `string` \| `number` \| `boolean` \| `null` | —                             | as `http.headers`                                                                     |
| `returnPath` | `string` \| `array`                                           | — (the whole `data` field)    | unset                                                                                 |
| `timeout`    | `integer` (ms)                                                | —                             | unset                                                                                 |

Suggested default: the same `missingPathDefault` candidate as `http`. A response with GraphQL `errors` is a genuine failure (#30) — `fallback`'s business, not a default's.

### `sql` (no alias)

| Parameter | Type (incl. null)                              | Default      | Null policy (current)                                                          |
| --------- | ---------------------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| `query`   | `string`                                       | _(req)_      | reject                                                                         |
| `values`  | `array` \| `object` — elements/values `any`    | — (no binds) | param: unset; per element/value: `value` — **SQL `NULL`** on the wire (agreed) |
| `shape`   | `'rows'` \| `'row'` \| `'column'` \| `'value'` | `'rows'`     | unset                                                                          |
| `timeout` | `integer` (ms)                                 | —            | unset                                                                          |

Suggested default: **`noRowDefault`** _(new — already anticipated as the natural sibling in #29)_.
Default behaviour: under `shape: 'row'` or `'value'`, an empty result set → this value instead of `null`; runtime default `null`, so unadorned behaviour is unchanged. Never fires under `'rows'`/`'column'` (`[]` is the answer) and never on genuine failures (connection, SQL error, timeout — `fallback`'s).

---

## Suggested defaults — one-glance summary

| Operator                             | Parameter            | Status                            | Fires on                              | Instead of                                            |
| ------------------------------------ | -------------------- | --------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| `if`                                 | `else`               | exists                            | condition unmet                       | `null`                                                |
| `match`                              | `default`            | exists                            | no branch matched                     | runtime failure                                       |
| `find`                               | `noMatchDefault`     | exists (batch 5)                  | no element matched                    | `null`                                                |
| `get`                                | `missingPathDefault` | exists (batch 6; renamed round 2) | missing path                          | `null` / `strictDataPaths` failure                    |
| `regex`                              | `noMatchDefault`     | **suggested**                     | `extract` mode, no match              | `null`                                                |
| `sql`                                | `noRowDefault`       | **suggested** (per #29's note)    | `'row'`/`'value'` shape, empty result | `null`                                                |
| `plus`, `multiply`, `min`, `max`     | `nullValueDefault`   | **suggested**                     | a null operand/element                | element-wise propagate (#3/#13)                       |
| `map`/`filter`/`find`/`some`/`every` | `nullInputDefault`   | **suggested**                     | `input` evaluates to null             | runtime type error (#24, flipped at the group review) |
| `min`, `max`                         | `emptyDefault`       | candidate (weaker)                | empty `values`                        | runtime failure (`fallback`-catchable)                |
| `http`, `graphQL`                    | `missingPathDefault` | candidate (deferred)              | supplied `returnPath` misses          | `null`                                                |
| ordering comparisons                 | `nullValueDefault`   | **suggested** (round 2)           | a null operand                        | propagate (#10)                                       |
| `buildString`, `join`                | `nullValueDefault`   | **suggested** (round 3)           | a null substitution/element at render | `""`                                                  |

All suggestions are presence-sensitive or default-`null`, so the unadorned drafted behaviour is unchanged; each rides the layered defaults chain (`operatorDefaults`), which is the family's structural advantage over any fallback-flavoured mechanism. **The `fallback` question resolved to failure-only at the group review** (July 2026), so the family stands as this sheet's premise assumed.

## Rows worth a second look

1. **Resolved**: the address-string asymmetry — `buildString.template`, `regex.pattern` and `get.path` propagate null while `http.url`, `graphQL.query` and `sql.query` reject it — was confirmed deliberately at Phase-7 implementation (Carl, September 2026). **All three keep `propagate`.** The boundary reads as stated (an aborted render costs nothing; a request fired at a manufactured address acts on the world), the `firstOf`-over-a-dynamic-template idiom in batch 4 depends on a null `template` propagating, and propagate is the reversible direction: it can be tightened later, where a reject relaxes only by breaking callers. The doubt recorded against `regex.pattern` specifically — authored machinery rather than data — stands as the reason to revisit if field experience shows a silently-nulled node misleading anyone.
2. **Resolved**: #24 flipped to reject at the group review — the iterators' `input` is plain `array`, `nullInputDefault` is the declared softener, and container parameters are uniform (whole-null always a type error). One seam recorded in the register's Open items: `length` still propagates null, no longer the iterators' twin.
3. **`not.value`** (#9): if the pending flip to `propagate` happens, nothing changes in the type column (`any` already names null) — only the policy word moves. The is-unset idiom breaks either way; #9 is unaffected by this sheet's rule.
4. **`http.body`**: the batch-8 table types it `any`, but #27's ruling depends on its type _excluding_ null (whole-null = unset = no body). Restated above as "JSON value excl. null" — the pass table should say so too, or under rule (b) this cell contradicts itself.
5. **`convert.value`** stays cleanly declarable under the type-driven rule: null is admitted unconditionally (`any`), and only the _policy_ is mode-conditional (ledger #14).

---

## Considered and rejected: an out-of-band "missing" sentinel

_Recorded September 2026, on Carl's question. The alternative to this sheet's whole premise — fixed point 1, absence-is-`null` — which had been argued *forward* from v2's conflation of failure and absence ("The required companion decision: absence resolves to `null`" in [v3-assessment.md](v3-assessment.md)) but never argued *against* the obvious competing design. Written up here because the premise permeates every cell above, and because the grounds against were, until now, only inferable across four documents._

**The proposal.** A missing `$data` path (and every other absence cell: no matching branch, no matching element, no row, no match) resolves not to `null` but to a guaranteed-unique out-of-band marker — a module-level `Symbol`, say `Missing`. Operators receive it and know it is absence rather than data, so propagation decisions can be made on absence specifically; a genuine stored `null` remains an ordinary value, fully distinguishable. Any marker still present in the finished result — including as the result itself — becomes `null` at the boundary, so the consumer-facing contract is unchanged.

**Why it is attractive.** It removes the acknowledged flaw of the settled design in one move: a missing value and a stored `null` stop being the same value, so every ruling above that had to make one policy word serve two meanings could instead say which one it means. The engine already leans on unique symbols (`EvaluationData`, `LAZY_HANDLE`, `VALIDATED_OPERATOR`) and already tracks absence out-of-band during parameter resolution — an **absent key** in the resolved params object, never a value ([src/evaluate/params.ts](../../src/evaluate/params.ts), pass 2 step 1). The proposal is therefore not foreign to the implementation; it is that same out-of-band marker promoted into the _value_ domain, which is precisely where it stops being free.

### The grounds

1. **The value domain is exactly JSON, and that is load-bearing, not decorative.** "The value domain" in [v3-api.md](v3-api.md) normalizes `undefined` away at every boundary, _fails_ on `NaN` / `±Infinity` rather than emitting them, and closes with "Nothing unrepresentable in JSON ever flows out of an operator." A `Symbol` is the same category of value as `NaN` here. Expressions come from config files and results go back into config, onto the wire (`http.body`, `graphQL.variables`, `sql` binds), into the per-instance cache, and into the report and trace shapes consumers store and render whole — each a serialization boundary, and each a place a marker in the value domain is a landmine rather than a convenience.
2. **There is no single boundary to convert at.** The proposal's final conversion assumes one throat; the architecture has many. Deep evaluation is the only semantics ("Deep evaluation" in [v3-api.md](v3-api.md)) — the everyday call returns a whole config with values at every depth. `literal` passes subtrees through by fiat. The I/O operators put parameter values on the wire mid-evaluation. Results are cached. And custom operator bodies receive resolved parameter values typed from their own declarations, so a marker in the domain widens every body's parameter types and makes handling it a third-party author's obligation — or the engine strips it at the parameter boundary first, which _is_ `propagate` (point 4).
3. **Symbol identity is already a ruled fragility.** ESM-only was ruled for exactly this reason: on a dual module load "the `defineOperator()` brand symbol, the `EvaluationData` sentinel and `instanceof FigTreeError` all fail across the copy boundary" ("Module format & platform floor" in [v3-packaging.md](v3-packaging.md)). Those three travel with _definitions_ and _errors_. A marker travelling with **values** — through host data, custom operators, fragments, the cache — multiplies that exposure across every object graph the engine touches, and its failure mode is silent: an unrecognized marker reads as ordinary opaque data.
4. **The propagation machinery already exists; what is declined is the marker, not the behaviour.** `propagate` means "null input → the node resolves to `null`, the body never runs" — an absence marker short-circuiting upward, discharged at the parameter boundary instead of carried past it. What the settled design gives up is not propagation but _distinguishability_, and it gives it up in-band only: the distinction is resolved at the site that actually knows which case occurred — `get.missingPathDefault` (row 26: missing fires it, a stored `null` passes through untouched), `find.noMatchDefault` (row 23), `sql.noRowDefault` (row 29), `regex.noMatchDefault` (row 21), and `strictDataPaths` host-wide. The `…Default` family _is_ the missing/null distinction, expressed in the metadata layer rather than the value layer.
5. **A marker is not authorable, and authorability is the point.** Authors write JSON, so they could never write a test against `Missing`; the blessed is-set idiom `{ $notEqual: ['$data.x', null] }` works precisely because `null` is in the authorable domain. The distinction would become an engine-internal concept observable only indirectly, through each operator's declared policy — the opposite of the readable-provenance property the reference design is built on. (The honest counter: expose it as an operator, `{ $isMissing: '$data.x' }`. That works — and lands the distinction in the operator layer, where the `…Default` family already put it.)
6. **The metadata surface roughly doubles for cells that would mostly agree.** Every null cell in this sheet becomes a missing × null matrix: two admissions to declare, two policies to choose, two `validate()` stories, two editor affordances. Reading the tables above with that lens, the large majority of pairs come out identical — the empirical case that the distinction does not pay its way at the parameter level, which is the level a sentinel would tax.
7. **The near-neighbour question was already decided this way.** "Why the filler is `null` (a loud sentinel — considered, rejected)" in [v3-evaluator-methods.md](v3-evaluator-methods.md) rejected a marker for report mode's holes on the transferable ground: a non-JSON sentinel "escapes the collision problem by breaking the value domain instead — results stop being JSON-serializable, precisely where report mode's consumers store and render whole configs." Different question, same domain argument, already ruled.

### What it would have bought — the honest ledger

The trade is real and is paid knowingly in four places above, three of them mitigated by tooling rather than by semantics, which is the tell:

- **#9, the `not` trap** — `{ $not: { $greaterThan: ['$data.age', 18] } }` with `age` missing reads `true`. Resolved by keeping `value` and answering the trap with a `validate()` lint plus docs guidance; under a marker it is fixed structurally (`not(Missing)` propagates, `not(null)` affirms).
- **Row 3's open reservation** (with row 13 attached) exists _because_ one policy word cannot say "a missing operand propagates, an authored `null` is an error". Under a marker those are two independent cells and the parked decision dissolves.
- **`firstOf` skips `null`**, so it cannot skip-missing-while-keeping-a-stored-null. Same root.
- **#24's flip** (iterator `input` null → type error, softened by `nullInputDefault`) forced both readings into one cell; a marker would have separated "the collection is absent" from "the collection is an authored `null`".

### Revisit conditions

The ruling is against a marker **in the value domain**, not against distinguishing absence — so the live ways to buy the distinction back are all metadata-layer: a further `…Default` cell, an `isMissing`-shaped operator, or (where a specific operator genuinely needs it) an absence-aware policy word whose marker never escapes that operator's parameter boundary. Reopen the wholesale version only if row 3's reservation is taken up, since a flip to reject re-touches every arithmetic operator at once and is the one occasion where the two readings must be spelled separately anyway; it should then be weighed as the alternative to that flip, not as a fresh idea.
