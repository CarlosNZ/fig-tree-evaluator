# FigTree v3 — Failure inventory

_Working document (Claude, October 2026), groundwork for [#217](https://github.com/CarlosNZ/fig-tree-evaluator/issues/217): a more precise `fallbackCoverage`. Inventory only: what can fail, and what each node can return. The declaration vocabulary is the next step._

## Purpose

#217 proposes a walk that gives every node a verdict (safe or not) and an output type, so that an inner fallback can count and `{ $plus: [1, 2] }` stops being listed. The walk can only be as precise as its knowledge of where failures come from. This document lists every condition under which a node can throw, read from the code in `src/operators/` and `src/evaluate/` and checked by running the edge cases against the engine.

Each condition is tagged with its source, because the source decides whether it needs anything new. A condition derived from what a definition already declares needs no new declaration; the rest are what #217 has to give a way to declare.

## Tags

| Tag            | The node throws when                                                                                                                                                                                | Already declared?                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **type**       | a computed value falls outside the parameter's declared type, including a null at a required parameter whose type excludes null (the derived reject)                                                | yes: `type`, `required`, null policies, defaults |
| **constraint** | a container breaks its `length`, `homogeneous` or `elementShape` constraint                                                                                                                         | yes: `constraints`                               |
| **internal**   | the operator's own code (its `evaluate` function) throws, after the engine has passed its inputs                                                                                                    | no                                               |
| **engine**     | the engine refuses the operator's result: a number that is ±Infinity or NaN (`normalizeResult` in src/evaluate/operator.ts). The operator's arithmetic triggers it, so it is per-operator knowledge | no                                               |
| **option**     | as internal, but whether it can happen depends on an instance or call option                                                                                                                        | no                                               |
| **external**   | something outside the expression fails: a client, a driver, a response, a deadline. Always possible, whatever the inputs                                                                            | no                                               |

Notation in the tables: `by: number` means a computed `by` fails unless it is a number. "null propagates" means a null resolves the node to null without running the body, so it is not a failure and none of the operator's own conditions apply. "null → default" means a null counts as unset (an optional parameter whose type excludes null). Where a parameter is not mentioned, its type is `any` and a computed value cannot fail it.

## How a child's failure reaches its node

A failure in a parameter's subtree fails the node, unless the delivery mode means the subtree was never needed. The modes are declared, so none of this needs a new declaration either.

| Delivery mode                    | A child's failure fails the node when                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `eager`                          | always: every eager parameter is evaluated before the body runs                                                                                        |
| `lazy`                           | the body demands it: `if`'s untaken branch, a `noMatchDefault` with a match, `get.default` with a hit                                                  |
| `replacesNullAt` holder          | a null arrives at its target                                                                                                                           |
| `race` (`and`, `or`)             | no operand decides. `{ $or: [{ $divide: [1, 0] }, true] }` is `true`; `{ $and: [true, { $divide: [1, 0] }] }` throws                                   |
| `lazyElements` (`firstOf`)       | every earlier candidate was null. `{ $firstOf: [1, <failing>] }` is 1                                                                                  |
| `lazyEntries` (`match.branches`) | it is the selected branch                                                                                                                              |
| `perElement`, `map` / `filter`   | any element fails                                                                                                                                      |
| `perElement`, `find`             | the element is at or before the first truthy one                                                                                                       |
| `perElement`, `some` / `every`   | no element decides. `{ $some: { input: [1, 0], each: { $divide: [1, '$element'] } } }` is `true`                                                       |
| `structural`                     | never: the value is a literal                                                                                                                          |
| a fallback                       | the node failed and the fallback is evaluated; its failure replaces the node's. An `operatorDefaults` fallback is returned as it is, so it never fails |

## The operators

### Logic & control

| Operator    | Typed parameters                                                                            | Internal, engine, option, external                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `and`, `or` | `values: array`                                                                             | none                                                                                                                                   |
| `not`       |                                                                                             | none                                                                                                                                   |
| `if`        |                                                                                             | none                                                                                                                                   |
| `match`     | `value: string \| number \| boolean \| null` (an array or object fails); `branches: object` | **internal:** no own key of `branches` equals the value's canonical string, and `default` is not supplied. A null value matches no key |
| `firstOf`   | `values: array`                                                                             | none                                                                                                                                   |

### Comparison

| Operator                                                           | Typed parameters                                                                                                                                                                                                                                                                         | Internal, engine, option, external |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `equal`, `notEqual`                                                | `values: array`; `caseInsensitive: boolean` (null → default)                                                                                                                                                                                                                             | none                               |
| `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual` | `values: array`. **constraint:** exactly two elements (a null counts toward the length), and the non-null ones both numbers or both strings. A null propagates unless `nullValueDefault` replaces it, and the replacement is checked with the rest. `nullValueDefault: number \| string` | none                               |

### Arithmetic & math

The `number` type admits NaN and ±Infinity, so a non-finite number in the evaluation data passes every type check and fails the first number-returning node it reaches. JSON cannot carry one, so this only arises from data a host builds in JS. It applies to every operator below and is not repeated.

| Operator               | Typed parameters                                                                                                                                                                                                                                             | Internal, engine, option, external                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plus`                 | `values: array`. **constraint:** the non-null elements are all numbers, all strings, all arrays or all plain objects; a null propagates unless `nullValueDefault` replaces it. `expect`: one of the four (null → unset). `nullValueDefault`: one of the four | **internal:** `values` is empty and `expect` is unset (a literal empty array is a static error, so only a computed `values`). **internal:** `expect` is set and the operands are another kind (`{ values: [1, 2], expect: 'string' }`). **engine:** in number mode, the sum overflows |
| `subtract`             | `value`, `minus: number` (null propagates)                                                                                                                                                                                                                   | **engine:** the difference overflows (`1.7e308 - -1.7e308`)                                                                                                                                                                                                                           |
| `multiply`             | `values: array`. **constraint:** the non-null elements are all numbers. `nullValueDefault: number`                                                                                                                                                           | **engine:** the product overflows (`1e200 * 1e200`). An empty `values` is 1, not a failure                                                                                                                                                                                            |
| `divide`               | `value`, `by: number` (null propagates)                                                                                                                                                                                                                      | **engine:** `by` is 0 (±Infinity, or NaN for 0/0). **engine:** the quotient overflows (`1e308 / 1e-10`)                                                                                                                                                                               |
| `modulo`               | `value`, `mod: number` (null propagates)                                                                                                                                                                                                                     | **engine:** `mod` is 0 (NaN). **engine:** the floored step overflows when both are near the maximum (`modulo(1.7e308, 1.75e308)` is NaN)                                                                                                                                              |
| `power`                | `base`, `exponent: number` (null propagates)                                                                                                                                                                                                                 | **engine:** `base` is 0 and `exponent` negative (Infinity). **engine:** `base` is negative and `exponent` not an integer (NaN). **engine:** the power overflows, which is well within reach (`10^400`, `2^1024`)                                                                      |
| `round`                | `value: number` (null propagates); `decimals: integer`, so a non-integer number fails (null → default 0)                                                                                                                                                     | **engine:** `value × 10^decimals` overflows, which comes back NaN (`round(5, 400)`, `round(1e300, 10)`). A large negative `decimals` is 0, not a failure                                                                                                                              |
| `floor`, `ceil`, `abs` | `value: number` (null propagates)                                                                                                                                                                                                                            | none                                                                                                                                                                                                                                                                                  |
| `min`, `max`           | `values: array`. **constraint:** the non-null elements are all numbers or all strings. `nullValueDefault: number \| string`                                                                                                                                  | **internal:** `values` is empty (computed only; a literal empty array is a static error)                                                                                                                                                                                              |

### String

| Operator                 | Typed parameters                                                                                                                                                            | Internal, engine, option, external                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildString`            | `template: string` (null propagates); `substitutions: array \| object` (null → default `[]`); `trim`, `closeGaps: boolean`; `nullValueDefault: string \| number \| boolean` | none: an unbound token renders as written, a computed composite as its placeholder (a literal one is a static error)                                                                                                                                                                                                                                                    |
| `split`                  | `value: string` (null propagates); `delimiter: string` (null → default); `trim: boolean`                                                                                    | none                                                                                                                                                                                                                                                                                                                                                                    |
| `join`                   | `values: array`; `delimiter: string`; `nullValueDefault: string \| number \| boolean`                                                                                       | none: a computed composite element renders as its placeholder (a literal one is a static error)                                                                                                                                                                                                                                                                         |
| `lower`, `upper`, `trim` | `value: string` (null propagates)                                                                                                                                           | none                                                                                                                                                                                                                                                                                                                                                                    |
| `regex`                  | `value`, `pattern: string` (null propagates); `flags: string` (null → default `''`); `mode`: one of `test`, `extract`, `match`                                              | **internal:** `flags` holds a letter outside `imsu`, or a repeated one (only a computed `flags`; literal flags are checked statically). **internal:** `pattern` does not compile with `flags`, which needs a computed pattern or computed flags (`'\\-'` compiles on its own but not with `u`). Catastrophic backtracking hangs rather than throws, and is out of scope |

### Arrays & iteration

| Operator                                 | Typed parameters                                                                                                                                                                                                                 | Internal, engine, option, external |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `length`                                 | `value: string \| array` (null propagates)                                                                                                                                                                                       | none                               |
| `map`, `filter`, `find`, `some`, `every` | `input: array`, with null rejected unless `nullInputDefault` is supplied, and then its value must be an array. `each` is typed `any`, so an element's result never fails the type check; `$element` takes `input`'s element type | none                               |

### Data & objects

| Operator      | Typed parameters                                                                                                                                                                                   | Internal, engine, option, external                                                                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get`         | `path: string \| array` (null propagates)                                                                                                                                                          | **internal:** a computed string `path` does not parse (a segments array is taken as it is and never fails). **option:** `strictDataPaths` is on, `default` is not supplied, and the path misses in `from`, which is the evaluation data when `from` is unsupplied |
| `buildObject` | `entries: array`. **constraint:** every element is an object with a `key` that is a string, number or boolean (null fails) and a `value`; a null element fails, as there is no element null policy | none: a repeated key is traced and the last one wins                                                                                                                                                                                                              |

### Special

| Operator  | Typed parameters                                                                                                               | Internal, engine, option, external                                                                                                                                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convert` | `to`: one of `number`, `string`, `boolean`, `array`. `value` is `any`; null propagates, except to `boolean`, where it is false | **internal,** by `to`. `number`: the value is a string that is not numeric once trimmed (`''` included), an array or an object; numbers and booleans never fail. **engine:** a numeric string beyond the range, `'Infinity'` or `'1e999'`, converts to Infinity. `string`: the value is an array or any non-null object (a `Date` included). `boolean`, `array`: never |

### I/O

| Operator  | Typed parameters                                                                                                                                                                                                 | Internal, engine, option, external                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http`    | `url: string` (null fails); `method`: `get` or `post` (null → default); `query`, `headers: object` (null → unset); `body`: anything but null (null → no body); `returnPath: string \| array`; `timeout: integer` | **internal:** `method` is `get` and a `body` is supplied (needs either computed; the literal pair is a static error). **option:** the URL is relative and there is no `http.baseEndpoint`. **internal:** the assembled URL does not parse. **internal:** a query or header value, the node's or the `http.headers` option's, is an array or object. **internal:** a computed string `returnPath` does not parse. **external:** the client fails (network, non-2xx status, a body that is not JSON); the node's `timeout` expires |
| `graphQL` | `query: string`; `variables`, `headers: object`; `url: string`; `returnPath: string \| array`; `timeout: integer`                                                                                                | **option:** no `url` and no `graphQL.endpoint` option, which fails every time. **option:** the endpoint is relative and there is no `http.baseEndpoint`. **internal:** the URL does not parse; a header value is an array or object; a computed `returnPath` does not parse. **external:** the client fails; the response is not an object, carries a non-empty `errors`, or carries neither `data` nor `errors`; the node's `timeout` expires                                                                                   |
| `sql`     | `query: string`; `values: array \| object`; `shape`: one of `rows`, `firstRow`, `column`, `firstValue`; `timeout: integer`                                                                                       | **external:** the driver fails; under `column` or `firstValue` a row has other than one column; a row is not an object; the node's `timeout` expires                                                                                                                                                                                                                                                                                                                                                                             |

## Other nodes

| Node                                             | Throws when                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a constant                                       | never                                                                                                                                                                                                                                                                                                                                                    |
| `$data.x`, `$element.x`, a renamed binding       | `strictDataPaths` is on and the path misses. Bare `$data` never. Without strict a miss is null, so null belongs in the reference's output type. `$data` has no declared shape, so its output type is `any`                                                                                                                                               |
| `$index`                                         | never                                                                                                                                                                                                                                                                                                                                                    |
| `$vars.x`                                        | x's definition throws, in the scope it was declared in; or strict is on and a drill past x misses                                                                                                                                                                                                                                                        |
| `$params.x`                                      | strict is on and a drill past x misses. The argument has passed the declaration's type check at the call, so inside the body it has the declared type, or null or the default where the parameter is optional                                                                                                                                            |
| plain data with computed values                  | any value in it throws                                                                                                                                                                                                                                                                                                                                   |
| an operator node                                 | a delivered child throws (by the delivery-mode table); a type or constraint check fails; the body throws; the result is non-finite; the body returns a lazy handle instead of its value (a body bug: never in a core operator, possible in a host's). Then a fallback, if there is one, answers instead                                                  |
| a static fragment call                           | a computed argument fails the parameter's declared type or constraints (literal arguments are checked statically); the body throws; then the call's fallback answers instead                                                                                                                                                                             |
| a dynamic fragment call                          | as a static call, and also: the arguments value is not an object, or omits a required parameter. These fail outside the body, so the body's own fallbacks never catch them                                                                                                                                                                               |
| a host operator                                  | anything its body does, beside everything above that its declarations give                                                                                                                                                                                                                                                                               |
| any top-level value, under an evaluation timeout | the deadline passes, and some top-level value has no constant fallback. Shielding is all or nothing: one unshielded value makes the deadline reject the whole evaluation, so when anything does I/O (an I/O operator, or a host operator) every value needs a constant fallback, including those doing no I/O. With no I/O at all nothing can be cut off |

Out of scope: the caller's kill switch and abort signal, which cut through every fallback by design, and internal errors, which are engine bugs.

## What the inventory shows

**Most failures are declared already.** Of the 40 core operators that do no I/O, 27 have no condition of their own. Everything that can make them throw is a type check, a null reject or a constraint, all read from their definitions. "Plus fails if its elements are not all the same type" is the `homogeneous` constraint, already declared. Ten have an internal, engine or option condition worth stating (`match`, `plus`, `divide`, `modulo`, `power`, `min`, `max`, `regex`, `get`, `convert`), and three more fail only on overflow (`subtract`, `multiply`, `round`). The three I/O operators can always fail.

**The conditions come in a few shapes:**

1. **A parameter value the body cannot handle.** `divide.by` is 0; `modulo.mod` is 0.
2. **A relation between parameters.** `power` (base and exponent); `plus` (`expect` and the operands' kind); `http` (`method` and `body`); `convert` (`to` decides which value types work); `round` (value and decimals).
3. **An empty aggregate.** `min`, `max`, and `plus` without `expect`.
4. **A computed value the `validate` hook would have refused as a literal.** `regex.pattern` and `flags`, `get.path`, and `returnPath` on `http` and `graphQL`. The hook checks the literal case statically and the body checks the computed case at runtime, so the hook already holds the predicate.
5. **A miss.** `get` under strict with no `default`; `match` with no matching key and no `default`. Both involve an absent parameter.
6. **An option that decides it outright.** A relative `http` URL with no `http.baseEndpoint`; `graphQL` with no endpoint. With a constant URL these are certain, which is closer to a static error than a possible failure.
7. **External.** The three I/O operators, always.
8. **Overflow.** Every number-returning arithmetic operator, at magnitudes near `1.8e308`, except `power`, where it is easy to reach.

Shapes 1, 3 and 4 name one parameter and a predicate on it. Shapes 2 and 5 relate parameters, or test whether one was supplied, so the vocabulary needs predicates over the whole parameter set rather than flags on single parameters.

**Delivery modes already decide how a child's failure travels.** `and`, `or`, `some` and `every` absorb a failure when something else decides, and `if`, `match`, `firstOf` and `find` never evaluate what they do not choose. These are declared, so a walk can read them. Used conservatively, a lazy subtree counts as demanded; with a constant condition or a constant deciding operand, the walk can do better.

**`returns` is too coarse for some operators.** `plus` returns any of four types, and `if`, `match`, `firstOf`, `find` and `get` return `any`, so a node fed by one of them can never prove its type check passes. `{ $multiply: [{ $plus: [<safe number>, 1] }, 2] }` fails to prove, because `plus` might return a string. Each has an obvious rule from its inputs, listed in "Output types" below. That is a second thing to declare, beside failure conditions: an output type narrowed by the inputs.

## Output types

What a node can return decides whether the parameter it feeds can fail its type check. The walk needs the narrowest type it can prove, and the declared `returns` is the operator's whole range, taken as declared (`staticType` in src/compile/staticType.ts). For some operators that is far wider than what a given node returns. This section lists, per operator, what the inputs narrow it to.

Null is listed apart, because it gets into an output two ways:

- **Propagation**, derivable from the declarations: a node returns null without running its body when a parameter with null policy `propagate` receives a null, or an element does at a parameter whose element null policy is `propagate`. `returns` never says so: `divide` declares `number` and can return null.
- **The body** returns null itself in a few operators (`get`, `firstOf`, `find`, `regex`'s `extract`, `if` with no `else`, `sql`'s single-row shapes), whose `returns` already admits null or is `any`.

Every other parameter stops a null rather than passing it on: it takes the null as a value (`equal`, `join`, `match.value`, `convert` to `boolean`), treats it as unset and uses the default, or rejects it as a type error (`map.input`, any whole `values` array).

Notation: `array<T>` is an array whose elements are all `T`. "+ null" means null by propagation, when a propagating parameter can receive one.

### Logic & control

| Operator           | Declared `returns` | What the inputs narrow it to                                                                                                              |
| ------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `and`, `or`, `not` | `boolean`          | `boolean`, never null                                                                                                                     |
| `if`               | `any`              | `then` ∪ `else`, with null when `else` is omitted. A known condition: the taken branch only                                               |
| `match`            | `any`              | every branch ∪ `default`. A known value: its branch, or `default`                                                                         |
| `firstOf`          | `any`              | the candidates' non-null types, with null when every candidate can be null. The union stops at the first candidate known never to be null |

### Comparison

| Operator            | Declared `returns` | What the inputs narrow it to                            |
| ------------------- | ------------------ | ------------------------------------------------------- |
| `equal`, `notEqual` | `boolean`          | `boolean`, never null                                   |
| the four orderings  | `boolean`          | `boolean` + null, unless `nullValueDefault` is supplied |

### Arithmetic & math

| Operator                                            | Declared `returns`                    | What the inputs narrow it to                                                                                                                      |
| --------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plus`                                              | `number \| string \| array \| object` | the operands' kind, or `expect`'s, + null. Arrays concatenate, so `array<the union of their element types>`; objects merge, so their keys combine |
| `subtract`, `multiply`, `divide`, `modulo`, `power` | `number`                              | `number` + null                                                                                                                                   |
| `round`                                             | `number`                              | `integer` when `decimals` is 0 or less, else `number`; + null                                                                                     |
| `floor`, `ceil`                                     | `number`                              | `integer` + null                                                                                                                                  |
| `abs`                                               | `number`                              | `integer` when `value` is; + null                                                                                                                 |
| `min`, `max`                                        | `number \| string`                    | the candidates' kind, + null                                                                                                                      |

### String

| Operator                 | Declared `returns`                   | What the inputs narrow it to                                                                                                                                 |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `buildString`            | `string`                             | `string` + null (from `template`)                                                                                                                            |
| `split`                  | `array`                              | `array<string>` + null                                                                                                                                       |
| `join`                   | `string`                             | `string`, never null: a whole null `values` is rejected                                                                                                      |
| `lower`, `upper`, `trim` | `string`                             | `string` + null                                                                                                                                              |
| `regex`                  | `boolean \| string \| array \| null` | by `mode`: `test` gives `boolean`, `extract` gives `string` ∪ `noMatchDefault` (null by default), `match` gives `array<string>`; + null (`value`, `pattern`) |

### Arrays & iteration

| Operator        | Declared `returns` | What the inputs narrow it to                                |
| --------------- | ------------------ | ----------------------------------------------------------- |
| `length`        | `integer`          | `integer` + null                                            |
| `map`           | `array`            | `array<each's type>`                                        |
| `filter`        | `array`            | `array<input's element type>`                               |
| `find`          | `any`              | `input`'s element type ∪ `noMatchDefault` (null by default) |
| `some`, `every` | `boolean`          | `boolean`                                                   |

The iterators never return null by propagation, since `input` rejects a null.

### Data & objects

| Operator      | Declared `returns` | What the inputs narrow it to                                                                                                                                                                           |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get`         | `any`              | the type at `path` in `from`: exact when both are known, read from `from`'s shape when it has one, otherwise `any`. ∪ `default` when supplied. A miss is null, unless `strictDataPaths` throws instead |
| `buildObject` | `object`           | an object with known keys and their values' types, when the keys are literal                                                                                                                           |

### Special

| Operator  | Declared `returns`                     | What the inputs narrow it to                                                                                          |
| --------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `convert` | `number \| string \| boolean \| array` | `to`'s type. For `array`: `value`'s type when it is an array, else `array<value's type>`. + null, except to `boolean` |

### I/O

| Operator          | Declared `returns` | What the inputs narrow it to                                                                                                          |
| ----------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `http`, `graphQL` | `any`              | `any`: the response is the server's                                                                                                   |
| `sql`             | `any`              | by `shape`: `rows` gives `array<object>`, `firstRow` `object` ∪ `noRowDefault`, `column` `array`, `firstValue` `any` ∪ `noRowDefault` |

### Other nodes

| Node                            | Output type                                                                 |
| ------------------------------- | --------------------------------------------------------------------------- |
| a constant                      | its exact value                                                             |
| plain data with computed values | its shape, with each computed value's type in place                         |
| `$data.x`                       | `any`, which includes null                                                  |
| `$element`, `$index`            | `input`'s element type; `integer`                                           |
| `$vars.x`                       | its definition's type                                                       |
| `$params.x`                     | the declared type, with null or the default where the parameter is optional |
| a fragment call                 | its body's output, with the arguments' types bound to `$params`             |
| any node with a fallback        | its own output ∪ the fallback's                                             |

### The shapes

1. **Already exact.** Most boolean, number and string operators. Nothing to declare, and null by propagation is derivable.
2. **Chosen by a literal parameter.** `convert` (`to`), `regex` (`mode`), `plus` (`expect`), `sql` (`shape`).
3. **An input's type passed through.** `plus`, `min` and `max` (the operands' kind), `filter` (`input`'s elements), `find`.
4. **A union of lazy branches.** `if`, `match`, `firstOf`.
5. **A container built from another type.** `map` (`array<each>`), `split` and `regex`'s `match` (`array<string>`), `convert` to `array`, `buildObject`.
6. **A refinement inside the declared type.** `floor`, `ceil`, and `round` to whole places return integers. That matters wherever one feeds an `integer` parameter: `round.decimals`, `timeout`, a host's.
7. **A path lookup.** `get`.
8. **Opaque.** `http` and `graphQL`, and `sql` beyond the outer shape.

Shapes 3 and 5 need element types (`array<T>`), which the type vocabulary (`ExpectedType`) does not have: it has `array`, and for parameters the `homogeneous` constraint. So the walk needs a richer type representation than `ExpectedType`: element types for arrays, keys for objects, exact values for constants. Binding `$element` needs the same thing.
