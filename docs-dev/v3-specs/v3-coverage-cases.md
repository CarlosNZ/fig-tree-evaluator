# FigTree v3 — Fallback coverage cases

_Generated from test/coverage-cases.ts by `pnpm coverageCases`: edit the cases there, not this page. 163 cases for the precise `fallbackCoverage` of [#217](https://github.com/CarlosNZ/fig-tree-evaluator/issues/217), checked against the engine by test/coverage-cases.test.ts. The decisions behind them are in [v3-coverage-decisions.md](v3-coverage-decisions.md)._

Each case is an expression and what the analysis should report for it:

- ✗ a failure nothing catches, so it can reject `evaluate()`
- ✓ a failure a fallback catches

A finding names the node where the failure starts, the error code it would carry, and the parameter involved. **May fail** means some data makes it happen; the example is data under which the engine really does fail that way. **Always fails** means it fails whenever the node is reached. A finding no data can trigger is a false positive the design accepts, and its case says why.

Where a case uses an instance other than `new FigTree()`:

- **Fragments:**
  - **double**: `{ expression: { $multiply: ['$params.n', 2] }, parameters: { n: { type: 'number' } } }`
  - **maybeDouble**: `{ expression: { $multiply: ['$params.n', 2] }, parameters: { n: { type: ['number', 'null'] } } }`
  - **ratio**: `{ expression: { $divide: ['$params.a', '$params.b'] }, parameters: { a: { type: 'number' }, b: { type: 'number' } } }`
  - **safeRatio**: `{ expression: { $divide: ['$params.a', '$params.b'], fallback: 0 }, parameters: { a: { type: 'number' }, b: { type: 'number' } } }`
  - **shout**: `{ expression: { $upper: '$params.s' }, parameters: { s: { type: 'string' } } }`
- **Host operators:** `twice` doubles a number, and `shaky` fails on an empty string, both declaring nothing; `picky` fails on one and says so in its `coverage`.
- **Clients:** a working HTTP client answers `{ n: 1, s: 'x' }`, and a working SQL connection answers `[{ a: 1, b: 2 }]`.

## Contents

- [Constants and folding](#constants-and-folding)
- [References](#references)
- [Types between nodes](#types-between-nodes)
- [Null](#null)
- [Operator conditions with some inputs known](#operator-conditions-with-some-inputs-known)
- [Value ranges](#value-ranges)
- [Where failures surface, and fallbacks](#where-failures-surface-and-fallbacks)
- [Laziness and deciders](#laziness-and-deciders)
- [Iterators and bindings](#iterators-and-bindings)
- [Vars](#vars)
- [Fragments](#fragments)
- [Plain data](#plain-data)
- [Options](#options)
- [I/O and timeouts](#io-and-timeouts)
- [Host operators](#host-operators)

## Constants and folding

**a constant**

```json5
42
```

- Nothing can throw.

**an operator with constant arguments**

```json5
{ $plus: [1, 2] }
```

- Nothing can throw.

**folding carries upward**

```json5
{ $plus: [{ $multiply: [2, 3] }, 1] }
```

- Nothing can throw.

**a constant division by zero is certain**

```json5
{ $divide: [1, 0] }
```

- ✗ **divide** at the root — always fails: `non-finite-result`

**a certain failure under a constant parent**

```json5
{ $plus: [1, { $divide: [1, 0] }] }
```

- ✗ **divide** at `$plus[1]` — always fails: `non-finite-result`

**a certain failure, caught**

```json5
{ $divide: [1, 0], fallback: 0 }
```

- ✓ **divide** at the root — always fails: `non-finite-result`, caught by its own fallback

**folding exposes a type failure**

```json5
{ $plus: [1, { $upper: 'a' }] }
```

- ✗ **plus** at the root — always fails: `type-check`

**folding produces an empty aggregate**

```json5
{ $min: { $filter: { input: [1, 2], each: false } } }
```

- ✗ **min** at the root — always fails: `empty-aggregate`

**a folded value narrows a sibling**

```json5
{ $divide: ['$data.n', { $plus: [1, 1] }] }
```

- ✗ **divide** at the root — may fail: `type-check` on `value`. E.g. data `{ n: 'a' }`

**get with a constant from folds**

```json5
{ $get: { path: 'a', from: { a: 1 } } }
```

- Nothing can throw.

**get without from reads the data, so it never folds**

```json5
{ $get: 'a' }
```

- Nothing can throw.

## References

**a data reference**

```json5
'$data.x'
```

- Nothing can throw.

**a data reference under strictDataPaths** (with `strictDataPaths: true`)

```json5
'$data.x'
```

- ✗ `$data.x` at the root — may fail: `missing-data-path`

**bare $data under strictDataPaths** (with `strictDataPaths: true`)

```json5
'$data'
```

- Nothing can throw.

**untyped data into a typed parameter**

```json5
{ $lower: '$data.s' }
```

- ✗ **lower** at the root — may fail: `type-check` on `value`. E.g. data `{ s: 1 }`

**untyped data into an any parameter**

```json5
{ $not: '$data.x' }
```

- Nothing can throw.

**equal takes anything**

```json5
{ $equal: ['$data.a', '$data.b'] }
```

- Nothing can throw.

**if takes anything**

```json5
{ $if: ['$data.c', '$data.a', '$data.b'] }
```

- Nothing can throw.

**join renders anything in a literal array**

```json5
{ $join: ['$data.a', '$data.b'] }
```

- Nothing can throw.

**join given a whole computed array**

```json5
{ $join: '$data.list' }
```

- ✗ **join** at the root — may fail: `type-check` on `values`. E.g. data `{ list: 'x' }`

**get from computed data, with a constant path**

```json5
{ $get: { path: 'x', from: '$data.o' } }
```

- Nothing can throw.

**get with a computed path**

```json5
{ $get: '$data.k' }
```

- ✗ **get** at the root — may fail: `type-check` on `path`. E.g. data `{ k: 1 }`
- ✗ **get** at the root — may fail: `operator-failure` on `path`. E.g. data `{ k: 'a[' }`

## Types between nodes

**an output type inside the parameter type**

```json5
{ $plus: [{ $length: '$data.list', fallback: 0 }, 1] }
```

- ✓ **length** at `$plus[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ list: 1 }`

**plus narrowed to its operands’ kind**

```json5
{ $multiply: [{ $plus: [{ $length: '$data.list', fallback: 0 }, 1] }, 2] }
```

- ✓ **length** at `$multiply[0].$plus[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ list: 1 }`

**floor returns an integer**

```json5
{ $round: [3.14159, { $floor: { $divide: [{ $length: '$data.s', fallback: 4 }, 2] } }] }
```

- ✗ **round** at the root — may fail: `non-finite-result` on `decimals`. E.g. data `{ s: 'aaaa…' (618 characters) }`
- ✓ **length** at `$round[1].$floor.$divide[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a number where an integer is required**

```json5
{ $round: [3.14159, { $divide: [{ $length: '$data.s', fallback: 4 }, 2] }] }
```

- ✗ **round** at the root — may fail: `type-check` on `decimals`. E.g. data `{ s: 'abc' }`
- ✗ **round** at the root — may fail: `non-finite-result` on `decimals`. E.g. data `{ s: 'aaaa…' (618 characters) }`
- ✓ **length** at `$round[1].$divide[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**join never returns null**

```json5
{ $upper: { $join: ['$data.a', '$data.b'] } }
```

- Nothing can throw.

**buildString always returns a string**

```json5
{ $upper: { $buildString: ['Hi %1', '$data.name'] } }
```

- Nothing can throw.

**convert narrowed by to**

```json5
{ $plus: [{ $convert: ['$data.n', 'number'], fallback: 0 }, 1] }
```

- ✓ **convert** at `$plus[0]` — may fail: `operator-failure`, caught by its own fallback. E.g. data `{ n: 'abc' }`
- ✓ **convert** at `$plus[0]` — may fail: `non-finite-result`, caught by its own fallback. E.g. data `{ n: 'Infinity' }`

**convert to boolean never fails**

```json5
{ $not: { $convert: ['$data.x', 'boolean'] } }
```

- Nothing can throw.

**convert to array never fails**

```json5
{ $length: { $convert: ['$data.x', 'array'] } }
```

- Nothing can throw.

**convert to string fails on a composite**

```json5
{ $upper: { $convert: ['$data.x', 'string'] } }
```

- ✗ **convert** at `$upper` — may fail: `operator-failure`. E.g. data `{ x: [] }`

**regex narrowed by mode**

```json5
{
  $upper: {
    $regex: {
      value: { $lower: '$data.s', fallback: '' },
      pattern: 'a+',
      mode: 'extract',
      noMatchDefault: '',
    },
  },
}
```

- ✓ **lower** at `$upper.$regex.value` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**regex in test mode feeding a string parameter**

```json5
{ $upper: { $regex: [{ $lower: '$data.s', fallback: '' }, 'a+'] } }
```

- ✗ **upper** at the root — may fail: `type-check` on `value`. E.g. data `{ s: 'x' }`
- ✓ **lower** at `$upper.$regex[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a fallback widens the output type**

```json5
{ $multiply: [{ $length: '$data.list', fallback: 'none' }, 2] }
```

- ✗ **multiply** at the root — may fail: `type-check` on `values`. E.g. data `{ list: 5 }`
- ✓ **length** at `$multiply[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ list: 5 }`

**if returns the union of its branches**

```json5
{ $plus: [{ $if: ['$data.c', 1, 2] }, 1] }
```

- Nothing can throw.

**if with no else can return null**

```json5
{ $map: { input: { $if: ['$data.c', [1, 2]] }, each: '$element' } }
```

- ✗ **map** at the root — may fail: `type-check` on `input`. E.g. data `{ c: false }`

**match returns the union of its branches**

```json5
{
  $plus: [
    {
      $match: { value: { $lower: '$data.k', fallback: 'a' }, branches: { a: 1, b: 2 }, default: 0 },
    },
    1,
  ],
}
```

- ✓ **lower** at `$plus[0].$match.value` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ k: 1 }`

**firstOf with an untyped candidate**

```json5
{ $plus: [{ $firstOf: ['$data.a', 0] }, 1] }
```

- ✗ **plus** at the root — may fail: `type-check` on `values`. E.g. data `{ a: 'x' }`

**firstOf drops the nulls of all but the last candidate**

```json5
{ $plus: [{ $firstOf: [{ $length: '$data.a', fallback: null }, 0] }, 1] }
```

- ✓ **length** at `$plus[0].$firstOf[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ a: 1 }`

**max passes its candidates’ kind through**

```json5
{ $upper: { $max: [{ $lower: '$data.a', fallback: 'a' }, 'b'] } }
```

- ✓ **lower** at `$upper.$max[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ a: 1 }`

## Null

**a propagated null meets a parameter that rejects it**

```json5
{ $map: { input: { $split: [{ $lower: '$data.s', fallback: '' }, ','] }, each: '$element' } }
```

- ✗ **map** at the root — may fail: `type-check` on `input`. E.g. data `{ s: null }`
- ✓ **lower** at `$map.input.$split[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**nullInputDefault absorbs it**

```json5
{
  $map: {
    input: { $split: [{ $lower: '$data.s', fallback: '' }, ','] },
    nullInputDefault: [],
    each: '$element',
  },
}
```

- ✓ **lower** at `$map.input.$split[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a null operand propagates through plus**

```json5
{ $plus: [{ $lower: '$data.s', fallback: '' }, 'x'] }
```

- ✓ **lower** at `$plus[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a null key in buildObject**

```json5
{ $buildObject: [{ key: { $lower: '$data.k', fallback: 'k' }, value: 1 }] }
```

- ✗ **buildObject** at the root — may fail: `type-check` on `entries`. E.g. data `{ k: null }`
- ✓ **lower** at `$buildObject[0].key` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ k: 1 }`

**a null at an optional parameter takes the default**

```json5
{ $split: ['a,b', { $lower: '$data.d', fallback: ',' }] }
```

- ✓ **lower** at `$split[1]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ d: 1 }`

**equal takes null as a value**

```json5
{ $not: { $equal: [{ $lower: '$data.s', fallback: '' }, null] } }
```

- ✓ **lower** at `$not.$equal[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

## Operator conditions with some inputs known

**a known divisor**

```json5
{ $divide: [{ $length: '$data.list', fallback: 0 }, 2] }
```

- ✓ **length** at `$divide[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ list: 1 }`

**a computed divisor may be 0**

```json5
{ $divide: [10, { $length: '$data.list', fallback: 1 }] }
```

- ✗ **divide** at the root — may fail: `non-finite-result` on `by`. E.g. data `{ list: [] }`
- ✓ **length** at `$divide[1]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ list: 1 }`

**a known modulus**

```json5
{ $modulo: [{ $length: '$data.s', fallback: 0 }, 3] }
```

- ✓ **length** at `$modulo[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a computed modulus may be 0**

```json5
{ $modulo: [10, { $length: '$data.s', fallback: 1 }] }
```

- ✗ **modulo** at the root — may fail: `non-finite-result` on `mod`. E.g. data `{ s: '' }`
- ✓ **length** at `$modulo[1]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a computed exponent may overflow**

```json5
{ $power: [2, { $length: '$data.s', fallback: 0 }] }
```

- ✗ **power** at the root — may fail: `non-finite-result` on `exponent`. E.g. data `{ s: 'xxxx…' (1100 characters) }`
- ✓ **length** at `$power[1]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a computed base may be 0 under a negative exponent**

```json5
{ $power: [{ $length: '$data.s', fallback: 0 }, -1] }
```

- ✗ **power** at the root — may fail: `non-finite-result` on `base`. E.g. data `{ s: '' }`
- ✓ **length** at `$power[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a computed base under a small known exponent**

```json5
{ $power: [{ $length: '$data.s', fallback: 1 }, 2] }
```

- ✓ **length** at `$power[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

> **Open:** Is power’s overflow reachable whatever the exponent, or only when the exponent is unknown or large? With exponent 2 the base must pass 1e154. Expected: only an unknown or large exponent.

**a negative base under a fractional exponent, folded**

```json5
{ $power: [-8, { $divide: [1, 3] }] }
```

- ✗ **power** at the root — always fails: `non-finite-result`

**min of a computed array**

```json5
{ $min: '$data.list' }
```

- ✗ **min** at the root — may fail: `type-check` on `values`. E.g. data `{ list: 'x' }`
- ✗ **min** at the root — may fail: `empty-aggregate` on `values`. E.g. data `{ list: [] }`

**min of a literal array is never empty**

```json5
{ $min: ['$data.a', '$data.b'] }
```

- ✗ **min** at the root — may fail: `type-check` on `values`. E.g. data `{ a: 1, b: 'x' }`

**plus of a computed array**

```json5
{ $plus: '$data.list' }
```

- ✗ **plus** at the root — may fail: `type-check` on `values`. E.g. data `{ list: 'x' }`
- ✗ **plus** at the root — may fail: `empty-aggregate` on `values`. E.g. data `{ list: [] }`

**expect gives plus an identity, so it is never empty**

```json5
{ $plus: { values: '$data.list', expect: 'number' } }
```

- ✗ **plus** at the root — may fail: `type-check` on `values`. E.g. data `{ list: ['a'] }`

**expect disagrees with the operands’ kind**

```json5
{ $plus: { values: [{ $length: '$data.a', fallback: 0 }, 1], expect: 'string' } }
```

- ✗ **plus** at the root — may fail: `type-check` on `values`. E.g. data `{ a: [] }`
- ✓ **length** at `$plus.values[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ a: 1 }`

> Not certain: a null operand propagates before the body sees the mismatch.

**a condition known to hold, with inputs not all known**

```json5
{ $convert: [{ $buildObject: [{ key: 'a', value: '$data.x' }] }, 'string'] }
```

- ✗ **convert** at the root — always fails: `operator-failure`

> Certain from a declared condition rather than from evaluation: buildObject always returns an object.

**match with a computed value and no default**

```json5
{ $match: { value: '$data.k', branches: { a: 1, b: 2 } } }
```

- ✗ **match** at the root — may fail: `type-check` on `value`. E.g. data `{ k: [] }`
- ✗ **match** at the root — may fail: `operator-failure`. E.g. data `{ k: 'c' }`

**match with a default never misses**

```json5
{ $match: { value: '$data.k', branches: { a: 1, b: 2 }, default: 0 } }
```

- ✗ **match** at the root — may fail: `type-check` on `value`. E.g. data `{ k: [] }`

**match with a typed value can still miss**

```json5
{ $match: { value: { $lower: '$data.k', fallback: 'a' }, branches: { a: 1, b: 2 } } }
```

- ✗ **match** at the root — may fail: `operator-failure`. E.g. data `{ k: 'C' }`
- ✓ **lower** at `$match.value` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ k: 1 }`

**match with a known value selects its branch**

```json5
{ $match: { value: 'a', branches: { a: '$data.x', b: 2 } } }
```

- Nothing can throw.

**match fed a choice of known keys**

```json5
{ $match: { value: { $if: ['$data.c', 'a', 'b'] }, branches: { a: 1, b: 2 } } }
```

- Nothing can throw.

> The value is one of a few known values, so match runs once with each, and both find a branch.

**regex with untyped data**

```json5
{ $regex: ['$data.s', 'a+'] }
```

- ✗ **regex** at the root — may fail: `type-check` on `value`. E.g. data `{ s: 1 }`

**regex with a computed pattern**

```json5
{ $regex: [{ $lower: '$data.s', fallback: '' }, '$data.p'] }
```

- ✗ **regex** at the root — may fail: `type-check` on `pattern`. E.g. data `{ s: 'a', p: 1 }`
- ✗ **regex** at the root — may fail: `operator-failure` on `pattern`. E.g. data `{ s: 'a', p: 'a[' }`
- ✓ **lower** at `$regex[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a literal pattern with computed flags**

```json5
{ $regex: { value: 'abc', pattern: '\\-', flags: { $lower: '$data.f', fallback: '' } } }
```

- ✗ **regex** at the root — may fail: `operator-failure` on `flags`. E.g. data `{ f: 'u' }`
- ✓ **lower** at `$regex.flags` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ f: 1 }`

**buildObject with a computed key**

```json5
{ $buildObject: [{ key: '$data.k', value: 1 }] }
```

- ✗ **buildObject** at the root — may fail: `type-check` on `entries`. E.g. data `{ k: [] }`

## Value ranges

**a length plus 1 is never 0**

```json5
{ $divide: [10, { $plus: [{ $length: '$data.list', fallback: 0 }, 1] }] }
```

- ✓ **length** at `$divide[1].$plus[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ list: 1 }`

**a base that cannot be negative**

```json5
{ $power: [{ $length: '$data.s', fallback: 1 }, 0.5] }
```

- ✓ **length** at `$power[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**split on a delimiter never returns an empty array**

```json5
{ $min: { $split: [{ $lower: '$data.s', fallback: '' }, ','] } }
```

- ✗ **min** at the root — may fail: `type-check` on `values`. E.g. data `{ s: null }`
- ✓ **lower** at `$min.$split[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**split on a delimiter from the data may return an empty array**

```json5
{ $min: { $split: [{ $lower: '$data.s', fallback: '' }, '$data.d'] } }
```

- ✗ **min** at the root — may fail: `type-check` on `values`. E.g. data `{ s: null }`
- ✗ **min** at the root — may fail: `empty-aggregate` on `values`. E.g. data `{ s: '', d: '' }`
- ✗ **split** at `$min` — may fail: `type-check` on `delimiter`. E.g. data `{ s: 'a', d: 1 }`
- ✓ **lower** at `$min.$split[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**the greater of a length and 1 is never 0**

```json5
{ $divide: [10, { $max: [{ $length: '$data.list', fallback: 0 }, 1] }] }
```

- ✓ **length** at `$divide[1].$max[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ list: 1 }`

**a length less 1 may be 0**

```json5
{ $divide: [10, { $subtract: [{ $length: '$data.s', fallback: 0 }, 1] }] }
```

- ✗ **divide** at the root — may fail: `non-finite-result` on `by`. E.g. data `{ s: 'a' }`
- ✓ **length** at `$divide[1].$subtract[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**an absolute value is never negative**

```json5
{ $power: [{ $abs: { $subtract: [{ $length: '$data.s', fallback: 0 }, 5] } }, 0.5] }
```

- ✓ **length** at `$power[0].$abs.$subtract[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**$index plus 1 is never 0**

```json5
{ $map: { input: '$data.list', each: { $divide: [1, { $plus: ['$index', 1] }] } } }
```

- ✗ **map** at the root — may fail: `type-check` on `input`. E.g. data `{ list: 1 }`

## Where failures surface, and fallbacks

**a failure is reported where it starts, not on its ancestors**

```json5
{ $upper: { $trim: { $lower: '$data.s' } } }
```

- ✗ **lower** at `$upper.$trim` — may fail: `type-check` on `value`. E.g. data `{ s: 1 }`

**a fallback anywhere above covers it**

```json5
{ $upper: { $trim: { $lower: '$data.s' } }, fallback: '' }
```

- ✓ **lower** at `$upper.$trim` — may fail: `type-check` on `value`, caught by the fallback on **upper** at the root. E.g. data `{ s: 1 }`

**the nearest fallback is the one that covers**

```json5
{ $upper: { $trim: { $lower: '$data.s' }, fallback: 'x' }, fallback: '' }
```

- ✓ **lower** at `$upper.$trim` — may fail: `type-check` on `value`, caught by the fallback on **trim** at `$upper`. E.g. data `{ s: 1 }`

**a fallback that can itself throw**

```json5
{ $lower: '$data.s', fallback: { $upper: '$data.t' } }
```

- ✗ **upper** at `fallback` — may fail: `type-check` on `value`. E.g. data `{ s: 1, t: 1 }`
- ✓ **lower** at the root — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1, t: 'x' }`

**a fallback with a fallback of its own**

```json5
{ $lower: '$data.s', fallback: { $upper: '$data.t', fallback: '' } }
```

- ✓ **lower** at the root — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1, t: 'x' }`
- ✓ **upper** at `fallback` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1, t: 1 }`

**several ways one node can fail**

```json5
{ $divide: ['$data.a', '$data.b'] }
```

- ✗ **divide** at the root — may fail: `type-check` on `value`. E.g. data `{ a: 'x', b: 1 }`
- ✗ **divide** at the root — may fail: `type-check` on `by`. E.g. data `{ a: 1, b: 'x' }`
- ✗ **divide** at the root — may fail: `non-finite-result` on `by`. E.g. data `{ a: 1, b: 0 }`

**an operatorDefaults fallback covers** (with `operatorDefaults: { lower: { fallback: '' } }`)

```json5
{ $lower: '$data.s' }
```

- ✓ **lower** at the root — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**an inner fallback does not cover the node above it**

```json5
{ $plus: [{ $lower: '$data.s', fallback: '' }, '$data.t'] }
```

- ✗ **plus** at the root — may fail: `type-check` on `values`. E.g. data `{ s: 'a', t: 1 }`
- ✓ **lower** at `$plus[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a node whose child always fails never runs**

```json5
{ $plus: ['$data.n', { $divide: [1, 0] }] }
```

- ✗ **divide** at `$plus[1]` — always fails: `non-finite-result`

> **Open:** Is plus’s own type check on values reported, although plus can never run? Expected: no — fix the certain failure first.

## Laziness and deciders

**a branch that may be taken**

```json5
{ $if: ['$data.c', { $lower: '$data.s' }, 'x'] }
```

- ✗ **lower** at `$if[1]` — may fail: `type-check` on `value`. E.g. data `{ c: true, s: 1 }`

**a branch a constant condition never takes**

```json5
{ $if: [true, 'x', { $lower: '$data.s' }] }
```

- Nothing can throw.

**a computed branch a constant condition takes**

```json5
{ $if: [true, { $lower: '$data.s' }, 'x'] }
```

- ✗ **lower** at `$if[1]` — may fail: `type-check` on `value`. E.g. data `{ s: 1 }`

**a certain failure in the branch a constant condition takes**

```json5
{ $if: [false, 'x', { $divide: [1, 0] }] }
```

- ✗ **divide** at `$if[2]` — always fails: `non-finite-result`

**a certain failure in a branch never taken**

```json5
{ $if: [true, 'x', { $divide: [1, 0] }] }
```

- Nothing can throw.

> **Open:** Dead code that would always fail: worth a separate warning? Not a coverage finding.

**or decided by a constant**

```json5
{ $or: [true, { $lower: '$data.s' }] }
```

- Nothing can throw.

**or decided by a constant still starts every operand**

```json5
{ $or: [true, { $divide: [1, '$data.n'], fallback: 0 }] }
```

- ✓ **divide** at `$or[1]` — may fail: `type-check` on `by`, caught by its own fallback. E.g. data `{ n: 'a' }`
- ✓ **divide** at `$or[1]` — may fail: `non-finite-result` on `by`, caught by its own fallback. E.g. data `{ n: 0 }`

**or not decided by a constant**

```json5
{ $or: [false, { $lower: '$data.s' }] }
```

- ✗ **lower** at `$or[1]` — may fail: `type-check` on `value`. E.g. data `{ s: 1 }`

**and with a computed operand**

```json5
{ $and: ['$data.a', { $lower: '$data.s' }] }
```

- ✗ **lower** at `$and[1]` — may fail: `type-check` on `value`. E.g. data `{ a: true, s: 1 }`

**firstOf stops at a known non-null candidate**

```json5
{ $firstOf: [1, { $lower: '$data.s' }] }
```

- Nothing can throw.

**firstOf past a computed candidate**

```json5
{ $firstOf: ['$data.a', { $lower: '$data.s' }] }
```

- ✗ **lower** at `$firstOf[1]` — may fail: `type-check` on `value`. E.g. data `{ a: null, s: 1 }`

**firstOf always evaluates its first candidate**

```json5
{ $firstOf: [{ $lower: '$data.s' }, 'x'] }
```

- ✗ **lower** at `$firstOf[0]` — may fail: `type-check` on `value`. E.g. data `{ s: 1 }`

**match with a known value never runs the other branches**

```json5
{ $match: { value: 'a', branches: { a: 1, b: { $divide: [1, 0] } } } }
```

- Nothing can throw.

**match with a computed value may run any branch**

```json5
{ $match: { value: '$data.k', branches: { a: 1, b: { $divide: [1, 0] } }, default: 0 } }
```

- ✗ **match** at the root — may fail: `type-check` on `value`. E.g. data `{ k: [] }`
- ✗ **divide** at `$match.branches.b` — always fails: `non-finite-result`. E.g. data `{ k: 'b' }`

**some, folded past a failing element**

```json5
{ $some: { input: [0, 1], each: { $divide: [1, '$element'] } } }
```

- Nothing can throw.

**some, every element failing**

```json5
{ $some: { input: [1, 2], each: { $lower: '$element' } } }
```

- ✗ **lower** at `$some.each` — always fails: `type-check`

**every over computed input**

```json5
{ $every: { input: '$data.list', each: { $lower: '$element' } } }
```

- ✗ **every** at the root — may fail: `type-check` on `input`. E.g. data `{ list: 'x' }`
- ✗ **lower** at `$every.each` — may fail: `type-check` on `value`. E.g. data `{ list: [1] }`

**a lazy default is never demanded on a known hit**

```json5
{ $get: { path: 'x', from: { x: 1 }, default: { $divide: [1, 0] } } }
```

- Nothing can throw.

**a lazy default may be demanded**

```json5
{ $get: { path: 'x', from: '$data.o', default: { $lower: '$data.s' } } }
```

- ✗ **lower** at `$get.default` — may fail: `type-check` on `value`. E.g. data `{ o: {}, s: 1 }`

**a null replacement runs only on a null**

```json5
{ $plus: { values: ['$data.a', 1], nullValueDefault: { $lower: '$data.s' } } }
```

- ✗ **plus** at the root — may fail: `type-check` on `values`. E.g. data `{ a: 'x' }`
- ✗ **lower** at `$plus.nullValueDefault` — may fail: `type-check` on `value`. E.g. data `{ a: null, s: 1 }`

## Iterators and bindings

**untyped input and elements**

```json5
{ $map: { input: '$data.list', each: { $plus: ['$element', 1] } } }
```

- ✗ **map** at the root — may fail: `type-check` on `input`. E.g. data `{ list: 'x' }`
- ✗ **plus** at `$map.each` — may fail: `type-check` on `values`. E.g. data `{ list: ['a'] }`

**a constant input folds**

```json5
{ $map: { input: [1, 2, 3], each: { $plus: ['$element', 1] } } }
```

- Nothing can throw.

**$element takes the input’s element type**

```json5
{
  $map: {
    input: { $split: [{ $lower: '$data.s', fallback: '' }, ','] },
    nullInputDefault: [],
    each: { $upper: '$element' },
  },
}
```

- ✓ **lower** at `$map.input.$split[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a renamed binding**

```json5
{
  $map: {
    input: { $split: [{ $lower: '$data.s', fallback: '' }, ','] },
    nullInputDefault: [],
    as: 'word',
    each: { $upper: '$word' },
  },
}
```

- ✓ **lower** at `$map.input.$split[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**$index is an integer**

```json5
{ $map: { input: '$data.list', nullInputDefault: [], each: { $plus: ['$index', 1] } } }
```

- ✗ **map** at the root — may fail: `type-check` on `input`. E.g. data `{ list: 'x' }`

**an element type that does not fit**

```json5
{
  $map: {
    input: { $split: [{ $lower: '$data.s', fallback: '' }, ','] },
    nullInputDefault: [],
    each: { $plus: ['$element', 1] },
  },
}
```

- ✗ **plus** at `$map.each` — may fail: `type-check` on `values`. E.g. data `{ s: 'a' }`
- ✓ **lower** at `$map.input.$split[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**filter keeps its input’s element type**

```json5
{
  $map: {
    input: {
      $filter: {
        input: { $split: [{ $lower: '$data.s', fallback: '' }, ','] },
        nullInputDefault: [],
        each: '$element',
      },
    },
    each: { $upper: '$element' },
  },
}
```

- ✓ **lower** at `$map.input.$filter.input.$split[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**find returns an element or its noMatchDefault**

```json5
{
  $upper: {
    $find: {
      input: { $split: [{ $lower: '$data.s', fallback: '' }, ','] },
      nullInputDefault: [],
      each: { $equal: ['$element', 'b'] },
      noMatchDefault: '',
    },
  },
}
```

- ✓ **lower** at `$upper.$find.input.$split[0]` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**nested iterators over constants fold**

```json5
{
  $map: {
    input: [[1, 2], [3]],
    each: { $map: { input: '$element', each: { $plus: ['$element', 1] } } },
  },
}
```

- Nothing can throw.

**nested iterators over data**

```json5
{
  $map: {
    input: '$data.rows',
    nullInputDefault: [],
    each: { $map: { input: '$element', each: { $plus: ['$element', 1] } } },
  },
}
```

- ✗ **map** at the root — may fail: `type-check` on `input`. E.g. data `{ rows: 'x' }`
- ✗ **map** at `$map.each` — may fail: `type-check` on `input`. E.g. data `{ rows: ['x'] }`
- ✗ **plus** at `$map.each.$map.each` — may fail: `type-check` on `values`. E.g. data `{ rows: [['a']] }`

## Vars

**a var’s type flows to its references**

```json5
{ $multiply: ['$vars.n', 2], vars: { n: { $length: '$data.s', fallback: 0 } } }
```

- ✓ **length** at `vars.n` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a failure in a var is reported at its definition**

```json5
{ $upper: '$vars.n', vars: { n: { $lower: '$data.s' } } }
```

- ✗ **lower** at `vars.n` — may fail: `type-check` on `value`. E.g. data `{ s: 1 }`

**a var referenced twice is reported once**

```json5
{ $plus: [{ $upper: '$vars.n' }, { $trim: '$vars.n' }], vars: { n: { $lower: '$data.s' } } }
```

- ✗ **lower** at `vars.n` — may fail: `type-check` on `value`. E.g. data `{ s: 1 }`

**vars on plain data**

```json5
{ vars: { n: { $lower: '$data.s' } }, a: '$vars.n', b: { $upper: '$vars.n' } }
```

- ✗ **lower** at `vars.n` — may fail: `type-check` on `value`. E.g. data `{ s: 1 }`

**drilling a known var under strictDataPaths** (with `strictDataPaths: true`)

```json5
{ $plus: ['$vars.o.a', 1], vars: { o: { a: 1 } } }
```

- Nothing can throw.

**drilling a known var past a missing key, under strictDataPaths** (with `strictDataPaths: true`)

```json5
{ $plus: ['$vars.o.b', 1], vars: { o: { a: 1 } } }
```

- ✗ `$vars.o.b` at `$plus[0]` — always fails: `missing-data-path`

## Fragments

**a call with constant arguments folds** (with the fragments listed at the top)

```json5
{ $double: { n: 3 } }
```

- Nothing can throw.

**an untyped argument** (with the fragments listed at the top)

```json5
{ $double: { n: '$data.x' } }
```

- ✗ argument `n` of fragment **double** at `$double.n` — may fail: `type-check` on `n`. E.g. data `{ x: 'a' }`

**a propagated null at a parameter that excludes null** (with the fragments listed at the top)

```json5
{ $double: { n: { $length: '$data.s', fallback: 0 } } }
```

- ✗ argument `n` of fragment **double** at `$double.n` — may fail: `type-check` on `n`. E.g. data `{ s: null }`
- ✓ **length** at `$double.n` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a parameter that admits null** (with the fragments listed at the top)

```json5
{ $maybeDouble: { n: { $length: '$data.s', fallback: 0 } } }
```

- ✓ **length** at `$maybeDouble.n` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a failure inside the body, reported at the call** (with the fragments listed at the top)

```json5
{ $ratio: { a: 1, b: { $length: '$data.s', fallback: 1 } } }
```

- ✗ the body of fragment **ratio**, called at the root — may fail: `non-finite-result` on `by`. E.g. data `{ s: '' }`
- ✗ argument `b` of fragment **ratio** at `$ratio.b` — may fail: `type-check` on `b`. E.g. data `{ s: null }`
- ✓ **length** at `$ratio.b` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a fallback on the body root covers the call, arguments included** (with the fragments listed at the top)

```json5
{ $safeRatio: { a: 1, b: { $length: '$data.s', fallback: 1 } } }
```

- ✓ the body of fragment **safeRatio**, called at the root — may fail: `non-finite-result` on `by`, caught by the fallback on the body of fragment **safeRatio**. E.g. data `{ s: '' }`
- ✓ argument `b` of fragment **safeRatio** at `$safeRatio.b` — may fail: `type-check` on `b`, caught by the fallback on the body of fragment **safeRatio**. E.g. data `{ s: null }`
- ✓ **length** at `$safeRatio.b` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a call nested under an operator** (with the fragments listed at the top)

```json5
{ $plus: [{ $ratio: { a: 1, b: { $length: '$data.s', fallback: 1 } } }, 1] }
```

- ✗ the body of fragment **ratio**, called at `$plus[0]` — may fail: `non-finite-result` on `by`. E.g. data `{ s: '' }`
- ✗ argument `b` of fragment **ratio** at `$plus[0].$ratio.b` — may fail: `type-check` on `b`. E.g. data `{ s: null }`
- ✓ **length** at `$plus[0].$ratio.b` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ s: 1 }`

**a body analysed with its arguments’ types** (with the fragments listed at the top)

```json5
{ $shout: { s: { $lower: '$data.x', fallback: 'a' } } }
```

- ✗ argument `s` of fragment **shout** at `$shout.s` — may fail: `type-check` on `s`. E.g. data `{ x: null }`
- ✓ **lower** at `$shout.s` — may fail: `type-check` on `value`, caught by its own fallback. E.g. data `{ x: 1 }`

**a dynamic call** (with the fragments listed at the top)

```json5
{ fragment: 'double', parameters: '$data.args' }
```

- ✗ the arguments of fragment **double** — may fail: `type-check`. E.g. data `{ args: 5 }`
- ✗ the arguments of fragment **double** — may fail: `missing-required`. E.g. data `{ args: {} }`

**a dynamic call’s arguments fail outside the body’s fallback** (with the fragments listed at the top)

```json5
{ fragment: 'safeRatio', parameters: '$data.args' }
```

- ✗ the arguments of fragment **safeRatio** — may fail: `type-check`. E.g. data `{ args: { a: 1, b: 'x' } }`
- ✗ the arguments of fragment **safeRatio** — may fail: `missing-required`. E.g. data `{ args: {} }`
- ✓ the body of fragment **safeRatio**, called at the root — may fail: `non-finite-result` on `by`, caught by the fallback on the body of fragment **safeRatio**. E.g. data `{ args: { a: 1, b: 0 } }`

## Plain data

**a failure inside plain data**

```json5
{ a: { $lower: '$data.s' }, b: 1 }
```

- ✗ **lower** at `a` — may fail: `type-check` on `value`. E.g. data `{ s: 1 }`

**a certain failure inside an array**

```json5
[1, { $divide: [1, 0] }]
```

- ✗ **divide** at `[1]` — always fails: `non-finite-result`

**plain data that folds**

```json5
{ a: { $plus: [1, 2] } }
```

- Nothing can throw.

## Options

**strictDataPaths on a reference inside a parameter** (with `strictDataPaths: true`)

```json5
{ $plus: ['$data.n', 1] }
```

- ✗ `$data.n` at `$plus[0]` — may fail: `missing-data-path`
- ✗ **plus** at the root — may fail: `type-check` on `values`. E.g. data `{ n: 'a' }`

**strictDataPaths on get** (with `strictDataPaths: true`)

```json5
{ $get: 'a.b' }
```

- ✗ **get** at the root — may fail: `missing-data-path`

**a get default opts out of strictDataPaths** (with `strictDataPaths: true`)

```json5
{ $get: { path: 'a.b', default: 0 } }
```

- Nothing can throw.

**strictDataPaths on get from a known object** (with `strictDataPaths: true`)

```json5
{ $get: { path: 'b', from: { a: 1 } } }
```

- ✗ **get** at the root — always fails: `missing-data-path`

**ordinary numbers: no overflow on plus**

```json5
{
  $plus: [
    { $convert: ['$data.a', 'number'], fallback: 0 },
    { $convert: ['$data.b', 'number'], fallback: 0 },
  ],
}
```

- ✓ **convert** at `$plus[0]` — may fail: `operator-failure`, caught by its own fallback. E.g. data `{ a: 'x' }`
- ✓ **convert** at `$plus[0]` — may fail: `non-finite-result`, caught by its own fallback. E.g. data `{ a: 'Infinity' }`
- ✓ **convert** at `$plus[1]` — may fail: `operator-failure`, caught by its own fallback. E.g. data `{ b: 'x' }`
- ✓ **convert** at `$plus[1]` — may fail: `non-finite-result`, caught by its own fallback. E.g. data `{ b: 'Infinity' }`

**strict numbers: plus may overflow** (analysis options `{ numbers: 'strict' }`)

```json5
{
  $plus: [
    { $convert: ['$data.a', 'number'], fallback: 0 },
    { $convert: ['$data.b', 'number'], fallback: 0 },
  ],
}
```

- ✗ **plus** at the root — may fail: `non-finite-result`. E.g. data `{ a: '1e308', b: '1e308' }`
- ✓ **convert** at `$plus[0]` — may fail: `operator-failure`, caught by its own fallback. E.g. data `{ a: 'x' }`
- ✓ **convert** at `$plus[0]` — may fail: `non-finite-result`, caught by its own fallback. E.g. data `{ a: 'Infinity' }`
- ✓ **convert** at `$plus[1]` — may fail: `operator-failure`, caught by its own fallback. E.g. data `{ b: 'x' }`
- ✓ **convert** at `$plus[1]` — may fail: `non-finite-result`, caught by its own fallback. E.g. data `{ b: 'Infinity' }`

**ordinary numbers: data is finite**

```json5
{ $floor: '$data.n' }
```

- ✗ **floor** at the root — may fail: `type-check` on `value`. E.g. data `{ n: 'a' }`

**strict numbers: data may be NaN** (analysis options `{ numbers: 'strict' }`)

```json5
{ $floor: '$data.n' }
```

- ✗ **floor** at the root — may fail: `type-check` on `value`. E.g. data `{ n: 'a' }`
- ✗ **floor** at the root — may fail: `non-finite-result`. E.g. data `{ n: NaN }`

## I/O and timeouts

**a request can always fail** (with HTTP and SQL clients, and no `http.baseEndpoint`)

```json5
{ $http: 'https://x.test/a' }
```

- ✗ **http** at the root — may fail: `operator-failure` (external: whatever code it throws). E.g. with the client failing

**a request with a fallback** (with HTTP and SQL clients, and no `http.baseEndpoint`)

```json5
{ $http: 'https://x.test/a', fallback: null }
```

- ✓ **http** at the root — may fail: `operator-failure` (external: whatever code it throws), caught by its own fallback. E.g. with the client failing

**a response is untyped, and is never fetched by the analysis** (with HTTP and SQL clients, and no `http.baseEndpoint`)

```json5
{ $plus: [{ $http: { url: 'https://x.test/a', returnPath: 's' }, fallback: 0 }, 1] }
```

- ✗ **plus** at the root — may fail: `type-check` on `values`
- ✓ **http** at `$plus[0]` — may fail: `operator-failure` (external: whatever code it throws), caught by its own fallback. E.g. with the client failing

**a relative URL with no baseEndpoint fails every time** (with HTTP and SQL clients, and no `http.baseEndpoint`)

```json5
{ $http: '/users' }
```

- ✗ **http** at the root — may fail: `operator-failure` (external: whatever code it throws)

> The request is refused with type-check, which the external finding stands for; it is certain, but an external operator is never run, so it is reported as may fail.

**a relative URL with a baseEndpoint** (with HTTP and SQL clients, and `http.baseEndpoint: 'https://api.test'`)

```json5
{ $http: '/users' }
```

- ✗ **http** at the root — may fail: `operator-failure` (external: whatever code it throws). E.g. with the client failing

**graphQL with no endpoint fails every time** (with HTTP and SQL clients, and no `http.baseEndpoint`)

```json5
{ $graphQL: 'query { a }' }
```

- ✗ **graphQL** at the root — may fail: `operator-failure` (external: whatever code it throws)

> Certain, but an external operator is never run, so it is reported as may fail.

**a query can always fail** (with HTTP and SQL clients, and no `http.baseEndpoint`)

```json5
{ $sql: 'SELECT a FROM t' }
```

- ✗ **sql** at the root — may fail: `operator-failure` (external: whatever code it throws). E.g. with the client failing

**a single-value shape over rows the query decides** (with HTTP and SQL clients, and no `http.baseEndpoint`)

```json5
{ $sql: { query: 'SELECT a, b FROM t', shape: 'firstValue' } }
```

- ✗ **sql** at the root — may fail: `operator-failure` (external: whatever code it throws)

> A row of other than one column is refused with type-check, which the external finding stands for, as it does for the client failing.

**a computed method** (with HTTP and SQL clients, and no `http.baseEndpoint`)

```json5
{ $http: { url: 'https://x.test/a', method: '$data.m', body: { a: 1 } } }
```

- ✗ **http** at the root — may fail: `type-check` on `method`. E.g. data `{ m: 'put' }`
- ✗ **http** at the root — may fail: `operator-failure` (external: whatever code it throws). E.g. data `{ m: 'get' }`

> A GET carrying a body is refused with type-check, which the external finding stands for, as it does for the client failing.

**a computed query value** (with HTTP and SQL clients, and no `http.baseEndpoint`)

```json5
{ $http: { url: 'https://x.test/a', query: { q: '$data.q' } } }
```

- ✗ **http** at the root — may fail: `operator-failure` (external: whatever code it throws). E.g. data `{ q: [1] }`

> A composite query value is refused with type-check, which the external finding stands for, as it does for the client failing.

**a constant fallback shields a request from a timeout** (with HTTP and SQL clients, and no `http.baseEndpoint`; analysis options `{ timeout: 20 }`)

```json5
{ $http: 'https://x.test/a', fallback: null }
```

- ✓ **http** at the root — may fail: `operator-failure` (external: whatever code it throws), caught by its own fallback. E.g. with the client failing

**a fallback that folds is still not a constant to shielding** (with HTTP and SQL clients, and no `http.baseEndpoint`; analysis options `{ timeout: 20 }`)

```json5
{ $http: 'https://x.test/a', fallback: { $lower: 'X' } }
```

- ✗ **http** at the root — may fail: `timeout`. E.g. with a slow client
- ✓ **http** at the root — may fail: `operator-failure` (external: whatever code it throws), caught by its own fallback. E.g. with the client failing

**under a timeout, a value doing no I/O still needs a constant fallback when another does I/O** (with HTTP and SQL clients, and no `http.baseEndpoint`; analysis options `{ timeout: 20 }`)

```json5
{ a: { $http: 'https://x.test/a', fallback: 1 }, b: { $upper: 'x' } }
```

- ✗ **upper** at `b` — may fail: `timeout`. E.g. with a slow client
- ✓ **http** at `a` — may fail: `operator-failure` (external: whatever code it throws), caught by its own fallback. E.g. with the client failing

> Shielding is all-or-nothing: if any value is unshielded, the deadline rejects the whole evaluation.

**under a timeout, nothing doing I/O means nothing can be cut off** (analysis options `{ timeout: 20 }`)

```json5
{ a: { $upper: 'x' }, b: { $lower: 'Y' } }
```

- Nothing can throw.

**a constant fallback on the root shields everything under it** (with HTTP and SQL clients, and no `http.baseEndpoint`; analysis options `{ timeout: 20 }`)

```json5
{ $plus: [{ $http: { url: 'https://x.test/a', returnPath: 's' }, fallback: 1 }, 1], fallback: 0 }
```

- ✓ **plus** at the root — may fail: `type-check` on `values`, caught by its own fallback
- ✓ **http** at `$plus[0]` — may fail: `operator-failure` (external: whatever code it throws), caught by its own fallback. E.g. with the client failing

## Host operators

**an undeclared host operator may throw** (with the host operators listed at the top)

```json5
{ $twice: 2 }
```

- ✗ **twice** at the root — may fail: `operator-failure` (external: whatever code it throws) (no data makes it happen)

> A false positive the design accepts: twice never throws, but nothing says so, so it is neither run nor trusted.

**a host operator that does throw** (with the host operators listed at the top)

```json5
{ $shaky: '$data.s' }
```

- ✗ **shaky** at the root — may fail: `type-check` on `value`. E.g. data `{ s: 1 }`
- ✗ **shaky** at the root — may fail: `operator-failure` (external: whatever code it throws). E.g. data `{ s: '' }`

**a host operator that declares its failures** (with the host operators listed at the top)

```json5
{ $picky: '$data.s' }
```

- ✗ **picky** at the root — may fail: `type-check` on `value`. E.g. data `{ s: 1 }`
- ✗ **picky** at the root — may fail: `operator-failure` on `value`. E.g. data `{ s: '' }`

**a declared host operator whose rule cannot hold** (with the host operators listed at the top)

```json5
{ $picky: { $upper: 'x' } }
```

- Nothing can throw.
