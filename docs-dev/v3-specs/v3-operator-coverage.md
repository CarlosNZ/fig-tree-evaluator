# FigTree v3 — Operator analysis declarations

_Spec (Claude, November 2026), from the [#290](https://github.com/CarlosNZ/fig-tree-evaluator/issues/290) discussion with Carl. Draft. Once agreed it replaces "Operator rules", "Where the rules live" and the output declarations in [v3-fallback-coverage.md](v3-fallback-coverage.md); the walk, its seven rules and everything it derives from a definition are unchanged and stay there. A literal declaration syntax was drafted first and ruled out the same day: its forms were single-use keywords (`quotient`, `byParam`) a reader had to learn, where a function's interface, gamuts in and a gamut out, is enough to read._

## What an operator declares

`fallbackCoverage` asks two questions of every operator node: what can it return, and when does it fail. The engine's own checks answer most of the second from the definition the author writes anyway: a parameter's type, constraints and null behaviour are a breaking set the walk reads for nothing. Beyond those, an operator declares two functions over gamuts, through `declareAnalysis` from `./authoring`:

```ts
import { declareAnalysis } from 'fig-tree-evaluator/authoring'

export const medianAnalysis = declareAnalysis(median, {
  // What the body returns, given what its parameters receive.
  // Omitted: the declared `returns`
  gamut: (params, helpers) => Gamut,
  // The ways the body itself fails, given what its parameters receive.
  // Omitted: the operator is external, and may fail whatever its inputs
  failures: (params, helpers) => FailureEntry[],
})
```

`failures: []` says the body never fails of itself: a plain list stands for a hook that returns it whatever the inputs, and the empty list is the common case. `null` is not accepted, since an omitted hook already means something, and two absent-looking values with opposite meanings would be misread. The two hooks are to the analysis what `validate` is to the compiler: a function the author writes against what the tool knows, in place of a declaration language.

**Nothing goes on the definition.** The hooks are tooling, needed only by `fallbackCoverage`, and a field on a definition is carried by every consumer of that definition, since a field on an object literal cannot be tree-shaken. A library's operator would then ship its analysis code to every app that uses the operator, where core's would not, which breaks the promise in [v3-api.md](v3-api.md) that a `defineOperator()` operator is indistinguishable from a native one. So `declareAnalysis` is the one door, for core and hosts alike: core's hooks are `declareAnalysis` calls in a table in `src/authoring/`, keyed by the built definition, and the root never imports them. A library follows the same split this package has, exporting its operators from its root and their analyses from its own `/authoring` subpath. `defineOperator()` has no `analysis` field, and the root loses `src/analysisCheck.ts` and the `OperatorAnalysis`, `FailureRule`, `FailureTest` and `DeclaredOutput` types.

Declaring says what a body fails on and what it returns, not how long it takes. A host's body may wait on something outside the evaluation, so a timeout can cut it off whether or not it is declared; a core body waits only on its children ("Timeout shielding" in [v3-fallback-coverage.md](v3-fallback-coverage.md)).

## Gamuts

A gamut is the set of values a node can return, as the walk knows it. It over-approximates: every value the node can actually return is in it, and it may hold values the node never returns. The walk holds one as a list of members, and a value is in the gamut when some member admits it:

```ts
type Gamut = readonly Member[]

type Member =
  // This one value, judged as the engine judges it
  | { exact: unknown }
  // A finite number, between `min` and `max` inclusive where they are given
  | { type: 'number' | 'integer'; min?: number; max?: number }
  // A string at least `minLength` code points long, where it is given
  | { type: 'string'; minLength?: number }
  // `opaque`: a value with no basic type, such as a Date or a function
  | { type: 'boolean' | 'null' | 'opaque' }
  // NaN, which no number parameter admits; ±Infinity, a number like any other
  | { type: 'nan' | 'infinite' }
  // `element`: a gamut every element is in; absent, anything. `items`: each
  // element's own gamut in order, for a literal. `length`: exact; `minLength`:
  // a least length where the length is not known
  | {
      type: 'array'
      element?: Gamut
      length?: number
      minLength?: number
      items?: readonly Gamut[]
    }
  // `keys`: exactly these keys, each value in its gamut; absent, any object
  | { type: 'object'; keys?: Record<string, Gamut> }

// The answer to any question asked of a gamut
type Answer = 'no' | 'maybe' | 'yes'
```

Some gamuts, to read the type by:

- `[{ exact: 0 }]` is exactly 0. `[{ exact: 2 }, { exact: 3 }]` is 2 or 3.
- `[{ type: 'integer', min: 1 }]` is any integer from 1. `[{ type: 'number' }]` is any finite number.
- `[{ type: 'integer', min: 1 }, { type: 'null' }]` is an integer from 1, or null. 0 is provably outside it.
- `[{ type: 'array', element: [{ type: 'string' }], minLength: 1 }]` is a non-empty array of strings.
- `[]`, the empty gamut, is nothing: what a node that never returns has, and what a parameter receives when it is unsupplied and has no default. It contributes nothing to a union and nothing to anything built over it.
- The gamut of a `$data` path is anything: one member of each kind, null, NaN and infinity included.

The walk keeps at most sixteen exact values in a gamut before widening them to the range they span. The cap is a chosen figure, not a measured one: it bounds the runs rule 4 makes, one per combination of the inputs' exact values, and keeps a long literal union from growing every gamut above it. Widening is sound and loses only precision, so the figure can change if a real expression shows it is wrong. Because a gamut is a set, a yes-or-no question about it has three outcomes, and that is what an `Answer` is: `yes` where every value in the set satisfies the question, `no` where none does, `maybe` where some do. "Is it 0?" is `yes` of an exact 0, `no` of an integer from 1, `maybe` of any number. The helpers that ask something of a gamut, `helpers.is`, `helpers.isType`, `helpers.isBelow`, `helpers.isEmpty` and `helpers.refused`, return one in place of a boolean, and a `failures` hook puts it in an entry's `occurs`, where it becomes the finding's certainty: `yes` an `always` finding, `maybe` a `may` finding, `no` no finding at all. The walk's own checks on a parameter's type are the same kind of question.

A gamut cannot say "any number except 0". A range is one stretch with inclusive ends, and the complement of a point is two open ones. Nothing needs it: divide by zero is a question asked of `by`'s gamut, does it include 0, which every gamut answers, and nothing has to store the complement. A stored exclusion would only come from a branch guarded by `x != 0`, and the walk has no such path sensitivity, so there is no producer for it. The integer case is two members already; if a producer ever appears, an exclusion list on the number member is a small addition.

Three things an author never declares, because the walk derives them:

- **Null by propagation.** A null a parameter propagates never reaches the body, so it is not in what the parameter receives, and the walk adds null to the node's output itself. A null the body returns of its own accord is declared, as a member of the output.
- **A fallback's values.** A node with a fallback returns its fallback's values too; the walk adds them.
- **The parameters' own layers.** What a parameter receives is its child's output after the engine's layers: the default where it is unsupplied or a null means omitted, the replacement where `replacesNullAt` applies, and the propagating null removed.

**What is contract.** `Gamut` and `Answer` are exported types, and both hooks are typed by them. The member list is not contract: a hook reads and builds gamuts through the helpers below, never by writing `[{ type: 'number', min: 1 }]` or reading `.min` off a member. The reason is soundness, not secrecy. A hook that switched on member kinds would go quietly wrong when a kind is added, because a gamut it does not recognise must still come back as a superset, and a hook that returns too little hides failures downstream. The helpers absorb that, and core writes against the same helpers, so a host's hook reads like core's. `Gamut` is therefore an opaque type, a brand on the walk's own list with no runtime wrapper: the walk passes its lists as they are and TypeScript refuses `.min` or an index on one, so the boundary costs nothing.

## The `gamut` hook

```ts
gamut?: (params: Record<string, Gamut>, helpers: GamutHelpers) => Gamut
```

`params` holds a gamut for every declared parameter, keyed by name, as described above: what the parameter receives after the engine's layers. For a parameter the body reads lazily it is what that child returns; for a `perElement` parameter such as `each`, what one element's walk returns; for a container parameter the body reads entry by entry, the gamut of the container itself, with `helpers.elementOf` or `helpers.valueOf` to reach inside. A parameter's gamut may be returned as it is: `({ value }) => value` passes the value through.

The walk calls it for every node of its operator that it does not run (rule 4 runs a node whose inputs are all known, and takes the run's exact result instead), so it must be cheap and must depend on nothing but its arguments. It never throws: a throw, or a result that is not a gamut, is the author's bug, and `fallbackCoverage` fails with an error naming the operator rather than guessing. Omit the hook where `returns` is already as narrow as the body: a boolean operator, a string operator whose result is any string.

It is checked in the suite: the rule checker runs every core operator over edge-case values and ranges and requires each result the engine returns to be in the gamut the hook gives, so a hook that returns too little, which would hide failures downstream, fails CI ("Testing" in [v3-fallback-coverage.md](v3-fallback-coverage.md)). A host gets the same check from the testing kit. TO-DO: the `./testing` kit is drafted, not yet an issue.

## The `failures` hook

```ts
failures?: (params: Record<string, Gamut>, helpers: GamutHelpers) => FailureEntry[]

interface FailureEntry {
  // The code the error would carry
  code: FallbackErrorCode
  // The parameter the failure is about, which the finding names
  parameter?: string
  // Whether it happens: the finding's certainty. Omitted: 'maybe', it
  // can happen and the entry says no more, since no body fails on every
  // input
  occurs?: Answer
  // Holding makes the failure possible, not certain: caps `occurs` at 'maybe'
  may?: true
  // Only extreme numbers cause it: counted under `strictNumbers` only, and
  // never certain
  overflow?: true
  // Instance options the failure needs, such as { strictDataPaths: true }
  options?: Record<string, unknown>
  // A short reason for the finding's message, such as "'by' is 0"
  message?: string
}
```

`params` is as for `gamut`. The hook returns one entry per way the body can fail, each with an answer computed from the parameters' gamuts: `helpers.is(by, 0)` is the whole of `divide`'s. The walk turns the list into findings: `no` gives nothing, `maybe` a `may` finding, `yes` an `always` finding, except where a certainty guard the walk keeps says otherwise. The guards are the ones the current rules have: an entry marked `overflow` or `may` is never certain, and a `non-finite-result` is not certain where an operand may be an infinity, since the body carries one through instead of failing (`Infinity / 0` is `Infinity`). A finding's message is the operator, the code and the entry's `message` where it gives one: `divide – non-finite-result when 'by' is 0`.

Only the body's own failures are declared: what it throws as an `OperatorFailure` (`operator-failure`), a NaN at the result boundary (`non-finite-result`), an `empty-aggregate`. The engine's checks on its parameters are not, since the walk reads them from the definition, and an entry naming one of their codes for the same reason would double the finding. The codes a hook may name are the `FallbackErrorCode`s, the ones a fallback catches.

The hook is called for a node the walk does not run. For one it runs, the run's outcome stands: the engine's own failure, or none.

## The helpers

One bag, `helpers`, the second argument of both hooks, as it is of `validate`. It holds what is common across operators or saves an implementation an author should not attempt, and nothing else: a step one operator needs is written in that operator's hook, as `divide`'s quotient is. Every helper that asks a question asks it of the value the parameter receives, over everything that value could be, and returns an `Answer`: "is it 0?" rather than "does the set include 0?", since the finding's certainty needs the three-way form. Two helpers ask about the parameter rather than its value, `isSupplied` and `refused`, and take its name; `isSupplied` is three-way too, since a parameter whose null means omitted is absent only when a null arrives.

### Asking

| Helper                                                                      | Answers                                                                                                                                                                                                          |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `helpers.is(gamut, value)`                                                  | is the value this one: `yes` of exactly that value, `no` where it cannot be, `maybe` otherwise. `helpers.is(by, 0)`                                                                                              |
| `helpers.isType(gamut, type)`                                               | is the value of this `ExpectedType`: `yes` where every value it could be is, `no` where none is. `helpers.isType(value, ['array', 'object'])`                                                                    |
| `helpers.isBelow(gamut, n)`                                                 | is the value a number less than `n`. `helpers.not(helpers.isBelow(decimals, 300))` is "300 or more"                                                                                                              |
| `helpers.isEmpty(gamut)`                                                    | is the value an empty array, string or object                                                                                                                                                                    |
| `helpers.refused(parameter)`                                                | would the operator's own `validate` hook refuse what this parameter receives: `maybe` while the value is not known, the hook's own answer once it is, given every parameter known exactly and none of the others |
| `helpers.isSupplied(parameter)`                                             | did the parameter receive anything, given or by default: `maybe` for one whose null means omitted, `nullBehavior: 'omit'` with no default, when a null may arrive                                                |
| `helpers.all(...answers)`, `helpers.any(...answers)`, `helpers.not(answer)` | combine answers: `all` is `no` if any is, `yes` if all are; `any` the reverse; `not` swaps `yes` and `no`                                                                                                        |

### Reading

| Helper                       | Gives                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `helpers.span(gamut)`        | its numbers as a range, `{ min, max, integer }` with an open end as an infinity, or nothing where it holds no number. What any bespoke arithmetic starts from |
| `helpers.exactValues(gamut)` | its values, where it is one of a few known exactly, or nothing: how a hook branches on a literal parameter such as `regex`'s `mode`                           |
| `helpers.elementOf(gamut)`   | one element of an array: what `find` returns                                                                                                                  |
| `helpers.valueOf(gamut)`     | one value of an object: what `match` picks from its branches                                                                                                  |
| `helpers.lengthOf(gamut)`    | the length of a string or array, an integer from 0: exact where the length is known, from its least length where that is                                      |

### Building

| Helper                                               | Builds                                                                                                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `helpers.type(type)`                                 | every value of an `ExpectedType`: `helpers.type('integer')`, `helpers.type(['string', 'null'])`, `helpers.type('any')`. A literal type is its values: `helpers.type({ literal: [-1] })` is exactly −1 |
| `helpers.exactly(value)`                             | that one value                                                                                                                                                                                        |
| `helpers.range({ min?, max?, integer? })`            | the numbers in a range, inclusive, either end open: `helpers.range({ min: 1, integer: true })`                                                                                                        |
| `helpers.union(...gamuts)`                           | anything in any of them                                                                                                                                                                               |
| `helpers.arrayOf(elements, { minLength?, length? })` | an array whose every element is in `elements`. Over an `each` walked once per element of a known input, the elements' results in order, so a `map` keeps its input's length                           |
| `helpers.nothing()`                                  | the empty gamut                                                                                                                                                                                       |

## Worked examples

`divide`, both hooks, beside the runtime body it describes:

```ts
// src/operators/math.ts: the definition, untouched
evaluate: ({ value, by }) => overflowChecked(value / by, [value, by])

// src/authoring/core.ts: its analysis
declareAnalysis(divide, {
  gamut: ({ value, by }, helpers) => quotientOf(value, by, helpers),
  failures: ({ by }, helpers) => [
    { code: 'non-finite-result', parameter: 'by', occurs: helpers.is(by, 0), message: "'by' is 0" },
    { code: 'non-finite-result', overflow: true },
  ],
})

// The quotient's range where `by` cannot be 0, any number where it can:
// one operator's step, so one operator's code
const quotientOf = (value: Gamut, by: Gamut, helpers: GamutHelpers): Gamut => {
  const a = helpers.span(value)
  const b = helpers.span(by)
  // No numbers on one side: nothing to divide, so nothing is returned
  if (a === undefined || b === undefined) return helpers.nothing()
  // `by` may be 0: the result can be any number (or the body fails, which
  // `failures` reports separately)
  if (b.min <= 0 && b.max >= 0) return helpers.type('number')
  // Otherwise the result lies between the smallest and the largest of four
  // candidates, each end of `value`'s range divided by each end of `by`'s.
  // An open end is an infinity, and an infinity over an infinity is NaN,
  // which is no candidate. For a value from 0 to 5 and a `by` from 10 up,
  // the candidates are 0/10, 0/∞, 5/10 and 5/∞: the result is from 0 to 0.5
  const corners = [a.min / b.min, a.min / b.max, a.max / b.min, a.max / b.max].filter(
    (corner) => !Number.isNaN(corner)
  )
  // A range from the smallest candidate to the largest
  return helpers.range({ min: Math.min(...corners), max: Math.max(...corners) })
}
```

`if`, a pass-through that never fails of itself:

```ts
declareAnalysis(ifOperator, {
  gamut: ({ then, else: otherwise }, helpers) => helpers.union(then, otherwise),
  failures: [],
})
```

`plus`, which branches on a literal parameter:

```ts
declareAnalysis(plus, {
  // The sum, or whatever type `expect` names where it is given
  gamut: ({ values, expect }, helpers) => {
    const named = helpers.exactValues(expect)
    return named !== undefined ? helpers.type(named as ExpectedType[]) : sumOf(values, helpers)
  },
  failures: ({ values, expect }, helpers) => [
    {
      code: 'empty-aggregate',
      parameter: 'values',
      occurs: helpers.all(helpers.isEmpty(values), helpers.not(helpers.isSupplied('expect'))),
    },
    ...(['number', 'string', 'array', 'object'] as const).map((kind) => ({
      code: 'type-check' as const,
      parameter: 'values',
      occurs: helpers.all(
        helpers.is(expect, kind),
        helpers.not(helpers.isType(helpers.elementOf(values), kind))
      ),
      message: `an operand is not a ${kind}`,
    })),
    { code: 'non-finite-result', overflow: true },
  ],
})
```

A host's `median`, the simplest useful declaration:

```ts
export const medianAnalysis = declareAnalysis(median, {
  // No gamut: its `returns`, a number, is the whole answer
  failures: ({ values }, helpers) => [
    {
      code: 'operator-failure',
      parameter: 'values',
      occurs: helpers.isEmpty(values),
      message: 'no values',
    },
  ],
})
```

## Reaching the analysis

```ts
declareAnalysis(
  definition: OperatorDefinition,
  hooks: { gamut?: GamutHook; failures?: FailureEntry[] | FailuresHook }
): OperatorAnalysis

fallbackCoverage(fig, expression, { operators?: OperatorAnalysis[], strictNumbers? })
```

`declareAnalysis` pairs a built definition with its hooks. It checks that the definition is one, that `gamut` is a function and `failures` a function or a list, and nothing more: there is no literal to validate, and calling a hook on made-up inputs would prove nothing. Core's analyses are built into `fallbackCoverage`; a host's are passed in `operators`, on every call, as the instance's own operators are passed at construction. The analysis matches each to the instance's registered operators by identity, so a definition registered on the instance and the one declared must be the same object. An operator with no analysis, core or host, is external. A declaration for an operator the instance does not have, or two for one operator, is an error: either is a mistake, and ignoring it would be inert.

A library exports its operators from its root and their analyses from its own `/authoring` subpath. An app with one custom operator writes `declareAnalysis` beside it and passes the result where it calls `fallbackCoverage`.

## The core operators

What a node of each operator returns and how its body fails, in words, with the hooks that say so. "None" under `gamut` means `returns` is the whole answer and there is no hook; under `failures` it means `[]`, the body never fails of itself. Null by propagation and a fallback's values are the walk's, so neither appears, and the engine's checks on parameters are the definition's, so nor do they.

### Logic and control

| Operator           | Returns                                                             | `gamut`                                                                                                                                 | `failures`                                                                |
| ------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `and`, `or`, `not` | a boolean                                                           | none                                                                                                                                    | none                                                                      |
| `if`               | whichever of `then` and `else` runs; null where `else` is omitted   | the union of `then` and `else`                                                                                                          | none                                                                      |
| `match`            | the value of the branch chosen, or `default`                        | the union of the branches' values and `default`                                                                                         | may `operator-failure` where `default` is unsupplied: no branch may match |
| `firstNonNull`     | the first candidate that is not null; null where every candidate is | the candidates in order, each with null removed, up to the first that cannot be null; null stays only where every candidate can be null | none                                                                      |

### Comparison

| Operator                                                                                | Returns   | `gamut` | `failures` |
| --------------------------------------------------------------------------------------- | --------- | ------- | ---------- |
| `equal`, `notEqual`, `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual` | a boolean | none    | none       |

### Arithmetic and math

| Operator           | Returns                                                                                                               | `gamut`                                                                                                                                   | `failures`                                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plus`             | numbers: their sum; strings or arrays: their concatenation; objects: their merge; with `expect`, a value of that type | the sum: the operands' ranges added in order, from 0, or their kind where they are not numbers; the type `expect` names where it is given | `empty-aggregate` where `values` is empty and `expect` unsupplied; `type-check` where `expect` names a kind an operand is not; overflow                                  |
| `subtract`         | `value` less `minus`                                                                                                  | the difference of the ranges                                                                                                              | overflow                                                                                                                                                                 |
| `multiply`         | the product; 1 of nothing                                                                                             | the product of the ranges, 1 when empty, 0 where a factor is 0                                                                            | overflow                                                                                                                                                                 |
| `divide`           | the quotient                                                                                                          | the quotient of the ranges where `by` cannot be 0; any number where it can                                                                | `non-finite-result` where `by` is 0; overflow                                                                                                                            |
| `modulo`           | the floored remainder                                                                                                 | none                                                                                                                                      | `non-finite-result` where `mod` is 0; overflow                                                                                                                           |
| `power`            | `base` to the `exponent`                                                                                              | none                                                                                                                                      | `non-finite-result` where `base` is 0 and `exponent` below 0; may, where `base` is below 0 and `exponent` not an integer; may, where `exponent` is 100 or more; overflow |
| `round`            | the value at `decimals` places                                                                                        | none                                                                                                                                      | may `non-finite-result` where `decimals` is 300 or more; overflow                                                                                                        |
| `floor`, `ceiling` | the nearest integer below, or above                                                                                   | none                                                                                                                                      | none                                                                                                                                                                     |
| `abs`              | the magnitude                                                                                                         | from 0: the range's magnitude                                                                                                             | none                                                                                                                                                                     |
| `min`, `max`       | the least, or the greatest, of the elements                                                                           | for numbers, between the elements' own ranges: `max(x, 1)` is from 1; strings as they are                                                 | `empty-aggregate` where `values` is empty                                                                                                                                |

### String

| Operator                                        | Returns                                                                                                               | `gamut`                                                                                                               | `failures`                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `buildString`, `join`, `lower`, `upper`, `trim` | a string                                                                                                              | none                                                                                                                  | none                                                                    |
| `split`                                         | the pieces                                                                                                            | an array of strings: of any length where `delimiter` is empty, since an empty value then gives none; from 1 otherwise | none                                                                    |
| `regex`                                         | by `mode`: `test` a boolean; `extract` the match or `noMatchDefault`; `match` an array of strings; `replace` a string | by `mode`'s exact value, or the union of every mode where it is not known                                             | `operator-failure` where `flags` is refused; where `pattern` is refused |

### Arrays and iteration

| Operator        | Returns                                          | `gamut`                                                                                  | `failures` |
| --------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- | ---------- |
| `length`        | the length                                       | `helpers.lengthOf(value)`: an integer from 0, or from the value's least length, or exact | none       |
| `map`           | each element's result, in order                  | an array of `each`, the input's length where it was walked per element                   | none       |
| `filter`        | some of the input's elements                     | an array of the input's elements                                                         | none       |
| `find`          | one of the input's elements, or `noMatchDefault` | the union of an element of `input` and `noMatchDefault`                                  | none       |
| `some`, `every` | a boolean                                        | none                                                                                     | none       |

### Data and objects

| Operator      | Returns                                                                                           | `gamut` | `failures`                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `get`         | the value at `path` in `from`, or `default`: anything. A node with a known path and source is run | none    | `operator-failure` where `path` is refused; may `missing-data-path` where `default` is unsupplied, under `strictDataPaths` |
| `buildObject` | an object                                                                                         | none    | none                                                                                                                       |

### Special

| Operator  | Returns                        | `gamut`                                                       | `failures`                                                                                                                                                                                                        |
| --------- | ------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convert` | a value of the type `to` names | the type `to` names, or the union of every type it could name | to `number`: `operator-failure` where `value` is an array or object; may `operator-failure` and may `non-finite-result` where it is a string. To `string`: `operator-failure` where `value` is an array or object |

### I/O

`http`, `graphQL` and `sql` have no analysis: the response is the server's, so they are external.

## Changes from today

- **The root sheds the field and its checker.** `analysis` leaves the definition type, `src/analysisCheck.ts` goes, and the root stops exporting `OperatorAnalysis`, `FailureRule`, `FailureTest` and `DeclaredOutput`. `Gamut`, `Answer`, `GamutHelpers`, `FailureEntry` and `OperatorAnalysis` (the new one, what `declareAnalysis` returns) export from the root as types, as the subpaths' types do.
- **The two core tables become one.** `CORE_RULES` in src/authoring/rules.ts and `CORE_OUTPUTS` in src/authoring/outputs.ts become `declareAnalysis` calls in one table, with the rule tests and output forms as code: a rule's tests become a helper call in `occurs`, `byParam` a branch on `helpers.exactValues`, `firstNonNull` a loop, each arithmetic form the function it already is in src/authoring/known.ts, called from the one hook that needs it.
- **Dropped:** the `kindOf` output form, declared by nothing, and the literal syntax's proposed `objectOf`. **Added:** `length` reads its value's length rather than declaring an integer from 0, so the length of a `split` is from 1; `divide` gains its quotient, which closes the false divide-by-zero on `(length + 2) / 2`. `modulo`, `power`, `round`, `floor` and `ceiling` keep `returns` alone: no realistic chain bounds them.
- **The `max(x, 1)` gap.** The min/max arithmetic gives up where an element may be an infinity, which a `$data` path may. An infinity can only raise a `max` or lower a `min`, so the bound on the other side holds; the fix is in that one function, and it makes the most natural divide-by-zero guard visible. The walk also does not use `max`'s homogeneous constraint to drop the string case where a literal number is present, so a wrong-type finding stays; a later fix.
- **Docs.** The Custom operators section of the `/authoring` page is rewritten around the two hooks, with `medianAnalysis` beside `median` in docs-site/src/lib/operators/.

Still not declared, accepted: `plus` with `expect: 'number'` has no range, since the named type replaces the sum; `map` over an input not walked per element loses the input's length; `lower` and `upper` keep the value's length in all but a few case mappings; `get` with a source of known shape; `buildObject`'s keys where they are literal.

## Open

1. **Host bodies are never run.** With no `analysis` field there is nothing to say a body is pure, and the walk cannot know, so it runs core bodies only (rule 4) and never a host's. An operator that reads the clock declares like any other. To be ruled with #290; this spec assumes it.
2. **A declaration for an operator the instance lacks** is an error here, as is a second for the same operator. The alternative, ignoring it, lets a library's analyses be passed whole when only some of its operators are registered. Ruled for the error; open to veto.
3. **Messages.** `message` on the entry, a short reason the author writes, against generating one from the code and parameter alone. The entry's is proposed.
4. **The testing kit.** A host's hooks get the rule checker's treatment only through the `./testing` kit, which is drafted and not yet an issue. Until it exists, a host's wrong `gamut` is caught by nothing.
5. **Names.** `declareAnalysis` and `OperatorAnalysis`; `FailureEntry`; `helpers.is`, `helpers.isBelow`, `helpers.range`, `helpers.refused`, `helpers.span`.
