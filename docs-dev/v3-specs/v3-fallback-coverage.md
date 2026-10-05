# FigTree v3 — Precise fallback coverage

_Spec (Claude, October 2026), from the [#217](https://github.com/CarlosNZ/fig-tree-evaluator/issues/217) design discussion with Carl. It replaces the `fallbackCoverage` section of [v3-authoring.md](v3-authoring.md) once built. The reasoning behind each decision is logged in [v3-coverage-decisions.md](v3-coverage-decisions.md); what every operator can fail on is in [v3-failure-inventory.md](v3-failure-inventory.md); the expected results, case by case, are in [v3-coverage-cases.md](v3-coverage-cases.md)._

## What changes

Today `fallbackCoverage` assumes every operator node can throw. Only a fallback on a top-level value counts, and `{ $plus: [1, 2] }` is listed as a risk although it cannot fail.

The precise version works out which nodes can actually throw, and why. It walks the expression from the leaves up, giving each node a verdict and an output type, so an inner fallback counts and a node that cannot fail is not listed. It stays in `./authoring`, so `evaluate()` pays nothing for any of it.

## What it returns

```ts
await fallbackCoverage(fig, expression, options?) // → { uncovered, covered }

interface FallbackCoverage {
  /** Failures nothing catches: each can reject evaluate(). Empty when none can */
  uncovered: CoverageFinding[]
  /** Failures a fallback catches */
  covered: CoveredFinding[]
}

interface CoverageFinding {
  /** The node where the failure starts; for a failure inside a fragment body, the call */
  path: NodePath
  /** The code the runtime error would carry: 'type-check', 'non-finite-result', … */
  code: FigTreeErrorCode
  message: string
  /** 'always': whenever the node is reached. 'may': for some inputs */
  certainty: 'may' | 'always'
  operator?: string
  parameter?: string
  /** A failure inside a fragment body: the fragment, and where in its body */
  fragment?: string
  fragmentPath?: NodePath
}

interface CoveredFinding extends CoverageFinding {
  /** The node whose fallback catches it (the call, for a fallback in a body) */
  coveredBy: NodePath
  coveredByFragmentPath?: NodePath
}
```

- **One finding per way a node can fail**, in tree order, like `validate()`'s issues. Two rules that give one node the same failure (the same code, parameter and place) give one finding, `always` if either would.
- **A finding sits where the failure starts**, never repeated on the ancestors it passes through. A fallback there, or on any ancestor, covers it.
- **A var or an argument is reported once per fallback that catches it.** Its failure is memoised and reaches every place that reads it, so the same finding can be covered by one fallback and uncovered by another route, or covered by two.
- **`code` is the runtime error's code**, so a finding and the error it predicts are classified the same way. The one exception is an external operator, whose one `operator-failure` finding stands for whatever code its own code throws (see "Operator rules").
- **CI checks `uncovered.length === 0`.** `covered` is for tools that show where fallbacks do their work.
- **It is async.** Rule 4 runs a pure node's own body, and the bodies of the operators that read their children one at a time or as they settle (`firstOf`, `and`, `or`, `find`, `filter`, `map`, `some`, `every`) are async.

For example, `{ $plus: [{ $divide: ['$data.a', '$data.b'] }, 1] }` gives three uncovered findings on `divide`: `type-check` on `value`, `type-check` on `by`, and `non-finite-result` on `by` (it may be 0). `plus` has none: `divide` returns a number or null, which `plus` accepts. With a fallback on `divide`, all three move to `covered`.

### Options

- **`timeout`**, as today: a timeout the host passes to `evaluate()` per call.
- **`numbers`**: `'ordinary'` (the default) or `'strict'`. See "Numbers". Names provisional.

Where the analysis's own options sit beside the stand-ins for `evaluate()`'s options is deferred.

## The walk

The walk visits each node after its children. By the time it reaches a node, it has a result for every child:

- **its verdict**: whether it can throw (no, may, always), and its findings;
- **its output**: what the walk knows the child returns.

What the walk knows about a value is one of:

- **an exact value**: a constant, or a node the walk ran;
- **one of a few exact values**: `{ $if: ['$data.c', 'a', 'b'] }` returns `'a'` or `'b'`;
- **a type**: `number`, `string | null`, an array whose elements are numbers, an object with known keys. A `$data` reference is `any`.

This representation is internal: richer than `ExpectedType` (element types, keys, exact values) and free to change.

### Fragment calls

A failure inside a body is reported at the call, with `fragment` and `fragmentPath`; the call itself fails on nothing of its own. Where an argument's failure surfaces depends on the arguments mode, as at runtime:

- **Static arguments** are evaluated when the body first reads `$params.x`, so a body fallback above that read catches the argument's failures. They keep the argument's own path, in the caller, with no `fragmentPath`, and include the declaration's type check on what the argument returns. An argument the body never reads is never evaluated. The walk records each read of a parameter as a demand that travels up the body like a failure, and each call answers its demands with its arguments' findings.
- **Dynamic arguments** are evaluated and checked before the body runs: `type-check`, and `missing-required` where a parameter is required, at `parameters`. Only the call's own fallback, or one above it, catches them, and the body reads values that can no longer fail.
- A `$params` reference itself fails only on a drill under `strictDataPaths`.

### The seven rules

These apply to every operator node. None of them names an operator: each reads the node's definition and its children's results.

1. **Inputs.** Each parameter receives its child's output. An unsupplied one receives its default: the `operatorDefaults` one, else the declared `default`. The engine's null rules then apply in the engine's order: replacement (`replacesNullAt`), null meaning unset, and propagation. A null that can propagate adds null to the node's output.
2. **Type check.** If what a parameter receives is not a subset of its declared type and constraints, the node may fail `type-check` on that parameter. A parameter typed `any` never does. Subset, not equality: `integer` fits `number`, `number` fits `number | null`.
3. **Children's failures.** A child that can throw makes the node able to throw if the node uses that parameter. An `eager` parameter is always used. Any other delivery mode is used when the operator asks for it, which the walk assumes it does unless rule 4 shows otherwise.
4. **Running the node.** When enough is known, the walk runs the node's own body (pure operators only; see "Running a node").
5. **Declared rules.** If the node was not run, its operator's failure rules are tested against the inputs (see "Operator rules"). An operator with none adds nothing. An `external` operator may always fail.
6. **Fallback.** If the node has a fallback (its own, or its operator's `operatorDefaults` one), everything that can fail in or under it is covered there. The node's verdict becomes the fallback's, and its output gains the fallback's output.
7. **Output.** What a run returned, if the node was run. Otherwise the operator's output declaration if it has one, else its declared `returns`. Plus null where rule 1 found propagation.

The rules fill in three separate parts of the result, so they are not a decision list where the first match wins: findings (rules 2, 3 and 4 or 5), output (rules 1, 4, 6, 7), and verdict (the findings, then rule 6). A fallback comes late because the node's own findings still matter: they are reported as covered, and its parent needs its output.

### Short-circuits

1. **A run replaces guessing.** If rule 4 ran the node, rule 5 is skipped, the run's output replaces rule 7's declaration, and a child no run reached is unreachable, which overrides rule 3: it reports nothing, neither its failures nor what its own fallbacks catch. A child a run reached, but whose failure never decided a run's answer (an operand a decider parked), reports only what its own fallbacks catch.
2. **An eager child that always fails means the node never runs.** Only the child's failure is reported; the node's own checks are moot, and its only output is its fallback's. The only children reached are a race's elements, which the engine starts beside the eager ones.
3. **A null that must propagate means the body never runs.** If a parameter can only receive null and its policy propagates, the node returns null: rule 5 and its later type checks are skipped.

### Worked example: `if`

`if`'s definition already holds everything the rules read: `condition` is `any` and eager, `then` and `else` are `any` and lazy (`else` defaulting to null), it has no failure rules, and its output declaration is one of `then` or `else`.

| Rule                   | `{ $if: ['$data.c', { $lower: '$data.s' }, 'x'] }`                     | `{ $if: [true, 'x', { $lower: '$data.s' }] }`                                               |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1. Inputs              | `condition`: `any`; `then`: `string \| null`, may throw; `else`: `'x'` | `condition`: `true`; `then`: `'x'`; `else`: `string \| null`, may throw                     |
| 2. Type check          | every parameter is `any`: nothing                                      | nothing                                                                                     |
| 3. Children's failures | `then` may be used, so `lower`'s failure counts                        | `else` may be used, so `lower`'s failure counts, for now                                    |
| 4. Running the node    | `condition` is unknown: no run                                         | runs `{ $if: [true, 'x', <stand-in>] }`; it never asks for `else`, so `else` is unreachable |
| 5. Declared rules      | none                                                                   | skipped                                                                                     |
| 6. Fallback            | none                                                                   | none                                                                                        |
| 7. Output              | `string \| null` or `'x'`                                              | `'x'`                                                                                       |
| **Verdict**            | **may fail**, through `lower` at `$if[1]`                              | **safe**                                                                                    |

### Running a node

Rule 4 runs a node only when its operator is pure: every core operator except `http`, `graphQL` and `sql`, and a host operator that declares rules (see "Where the rules live"). It runs the node alone, so children are never run again: each is summarised by its result.

A run calls the operator's own `evaluate`, on parameters the walk resolves as the engine's layers would (rules 1 and 2, given exact values), with a context of its own: the evaluation options, a signal that never aborts, a `memo` that keeps nothing and a silent `note`. It applies the result boundary, and gives a throw the code the engine would. It is not the engine's node wrapper, which hides what a body does with each child, and starts every `race` operand whether or not the answer needs it. The rule checker holds every run to the engine's evaluation instead (see "Testing").

- **Eager inputs** must each be known exactly, or as one of a few values. Otherwise there is no run, and rule 5 decides the node's own failures.
- **Each child the body asks for** (a lazy parameter's, an element or entry of a literal container at a container-lazy parameter, an `each`) is delivered through a handle or a stream the run owns, as:
  - each value it is known to be, one run apiece;
  - its failure, as a run of its own, where it may fail;
  - a stand-in, where its value is not known.

  An `each` comes to the same for every element, or is a stand-in.

- **A stand-in has no value.** A run in which the body waits on one is inconclusive, and the node is not run after all. The exception is a synchronous body that hands the stand-in's own promise straight back as its answer (`if`, `match`, `get`'s `default`, `regex`'s `noMatchDefault`): the node then returns whatever that child returns, and fails with whatever it fails with. So `{ $match: { value: 'a', branches: { a: '$data.x', b: 2 } } }` runs, while `{ $firstOf: ['$data.a', …] }`, whose body inspects its candidate for null, does not.
- **A race** delivers its known operands first, in index order, and never any stand-in. That relies on the race contract: a body's answer does not depend on the order its operands settle in. The engine starts every operand, so each is reached; its failure counts only where a run's answer depended on it.
- **A `replacesNullAt` holder** is asked for by the layers, not the body: it is reached only where a null meets its target, and a run that needs a holder whose value is not known is inconclusive.

What the runs give the walk:

- **Output:** each run's value, and the output of any child handed straight back, through the result boundary.
- **The node's own failures:** each with the engine's code and message, `always` for a code every run failed with, `may` otherwise. A finding names the parameter whose type check failed, else that of the first failure rule with its code that holds on the run's inputs.
- **Children:** as short-circuit 1 says. A child handed back keeps its parameter's type check, which the body's demand runs.
- **Verdict:** `always` if every run failed.

`{ $plus: [{ $multiply: [2, 3] }, 1] }` folds to 7; `{ $divide: [1, 0] }` always fails; `{ $divide: [1, { $if: ['$data.c', 0, 2] }] }` may.

**Cost.** One run per combination: the eager inputs' values times each child's outcomes, usually one or two. At most 16, as many exact values as the walk keeps: above that, a child with several outcomes becomes a stand-in, and if there are still too many, the node is not run. A run is one call of the body.

**A body that does not settle.** A declared host body may wait on something the analysis cannot give it: the host's own state, such as a table it loads at startup, or a signal, which never aborts in a run. An async body still waiting after 100 ms is given up on, and its operator is not run again in that analysis: those nodes are analysed as if not run, by their rules and their declared output. That costs precision, never soundness. Core bodies settle within microtasks.

## Operator rules

Twenty-seven of the forty pure core operators need no **failure rules**: everything that can make them throw is a type check, a null rejection or a constraint, all read from their definitions. The other thirteen declare them. Separately, fifteen operators declare an **output** narrower than their `returns`.

### Failure rules

A rule names the error a failure carries and the conditions under which it happens:

```ts
interface FailureRule {
  code: FigTreeErrorCode
  /** The parameter the failure is about, which its finding names */
  parameter?: string
  /** Tests on parameters, by name; every one must hold. Absent: always holds */
  when?: Record<string, CoverageTest>
  /** Options the rule needs, such as { strictDataPaths: true } */
  options?: Record<string, unknown>
  /** Holding makes the failure possible, not certain */
  may?: true
  /** An overflow only extreme inputs reach: counted under numbers: 'strict' only */
  overflow?: true
}

type CoverageTest =
  | string
  | number
  | boolean
  | null // equals this value
  | { type: ExpectedType } // has this type
  | { below: number } // a number less than this
  | { empty: true } // an empty array, string or object
  | { supplied: boolean } // it has a value, supplied or defaulted, or has none
  | { invalid: true } // the operator's validate hook refuses it
  | { some: CoverageTest } // some element of an array, or value of an object
  | { not: CoverageTest }
```

Each test answers no, maybe or yes from what the walk knows: `{ by: 0 }` is yes when `by` is exactly 0, no when it is exactly 2 or can only be null, maybe when it is an unknown number. A rule's answer is the combination of its tests: no if any is no, yes if all are yes, otherwise maybe. A yes on a rule without `may` gives an `always` finding; any other yes or maybe gives a `may` finding; no gives nothing. A test reads what the parameter receives, once the engine's layers have run: its default, a null replaced. `{ invalid: true }` is maybe while the value is unknown; once known, the operator's own `validate` hook decides, given every parameter known exactly and none of the others, as the static check gives it the literal ones only. A finding names the rule's `parameter`, if it has one. Its message is generated from the rule: `divide – non-finite-result when 'by' is 0`.

The core rules, in full:

```ts
divide:   { code: 'non-finite-result', parameter: 'by', when: { by: 0 } }
          { code: 'non-finite-result', overflow: true }
modulo:   { code: 'non-finite-result', parameter: 'mod', when: { mod: 0 } }
          { code: 'non-finite-result', overflow: true }
power:    { code: 'non-finite-result', parameter: 'base', when: { base: 0, exponent: { below: 0 } } }
          { code: 'non-finite-result', parameter: 'base', when: { base: { below: 0 }, exponent: { not: { type: 'integer' } } } }
          { code: 'non-finite-result', parameter: 'exponent', may: true, when: { exponent: { not: { below: 100 } } } }
          { code: 'non-finite-result', overflow: true }
round:    { code: 'non-finite-result', parameter: 'decimals', may: true, when: { decimals: { not: { below: 300 } } } }
          { code: 'non-finite-result', overflow: true }
plus:     { code: 'empty-aggregate', parameter: 'values', when: { values: { empty: true }, expect: { supplied: false } } }
          { code: 'type-check', parameter: 'values', when: { expect: 'number', values: { some: { not: { type: 'number' } } } } }
          // …and one each for 'string', 'array', 'object'
          { code: 'non-finite-result', overflow: true }
subtract, multiply:
          { code: 'non-finite-result', overflow: true }
min, max: { code: 'empty-aggregate', parameter: 'values', when: { values: { empty: true } } }
match:    { code: 'operator-failure', may: true, when: { default: { supplied: false } } }
regex:    { code: 'operator-failure', parameter: 'flags', when: { flags: { invalid: true } } }
          { code: 'operator-failure', parameter: 'pattern', when: { pattern: { invalid: true } } }
get:      { code: 'operator-failure', parameter: 'path', when: { path: { invalid: true } } }
          { code: 'missing-data-path', may: true, options: { strictDataPaths: true }, when: { default: { supplied: false } } }
convert:  { code: 'operator-failure', when: { to: 'number', value: { type: ['array', 'object'] } } }
          { code: 'operator-failure', may: true, when: { to: 'number', value: { type: 'string' } } }
          { code: 'non-finite-result', may: true, when: { to: 'number', value: { type: 'string' } } }
          { code: 'operator-failure', when: { to: 'string', value: { type: ['array', 'object'] } } }
http, graphQL, sql: external
```

`match` and `get` need only the unknown case: with a known value, or a known path and `from`, rule 4 runs them instead. `round`'s first rule, found by the rule checker, is a judgment like `power`'s: `10^decimals` is infinite from 309, and below 300 it takes an extreme value to overflow.

`external` means never run, and may fail whatever the parameters: only a fallback covers an I/O node. An external node gets one finding, `operator-failure`, may, which stands for whatever code its own code throws: an I/O operator refuses a relative URL or a GET with a body with `type-check`, its own `timeout` with `request-timeout`, and a client or a host's body can throw anything. Its code is the one exception to a finding carrying the runtime error's code.

### Output declarations

For operators whose `returns` is wider than what a node can return:

```ts
type CoverageOutput =
  | ExpectedType // a fixed type
  | { param: string } // what that parameter receives
  | { elementOf: string } // an element of an array parameter
  | { kindOf: string } // the types of an array parameter's elements, widened
  | { arrayOf: CoverageOutput }
  | { oneOf: CoverageOutput[] }
  | { typeNamedBy: string } // the type a literal parameter names
  | { byParam: string; cases: Record<string, CoverageOutput> } // chosen by a literal parameter
  | { firstNonNull: string } // firstOf's candidates
```

```ts
if:          { oneOf: [{ param: 'then' }, { param: 'else' }] }
match:       { oneOf: [{ param: 'branches' }, { param: 'default' }] }
firstOf:     { firstNonNull: 'values' }
find:        { oneOf: [{ elementOf: 'input' }, { param: 'noMatchDefault' }] }
plus:        { oneOf: [{ kindOf: 'values' }, { typeNamedBy: 'expect' }] }
min, max:    { elementOf: 'values' }
filter:      { arrayOf: { elementOf: 'input' } }
map:         { arrayOf: { param: 'each' } }
split:       { arrayOf: 'string' }
convert:     { typeNamedBy: 'to' }
regex:       { byParam: 'mode', cases: { test: 'boolean', extract: { oneOf: ['string', { param: 'noMatchDefault' }] }, match: { arrayOf: 'string' } } }
floor, ceil: 'integer'
```

`{ param }` over a container-lazy parameter (`match.branches`, `firstOf.values`) means the union of its entries or elements, and over a `perElement` parameter (`map.each`) what one element gives. `{ elementOf }` is one of the elements as it is, which is right for `min` and `max`; `{ kindOf }` widens each exact element to its type, which is right for `plus`, since a sum is none of its operands: `{ $plus: [-1, 1] }` is an integer, not -1 or 1. `{ typeNamedBy }` and `{ byParam }` take the named type or case when the parameter is known exactly, and every one otherwise. `{ firstNonNull }` reads a literal array's elements in order, and stops at the first that cannot be null.

`sql` has no declaration: `sqlOperators()` builds a definition for each connection, so there is no one definition to key a table by. It is external, and returns its `returns`, `any`. A literal array keeps its elements in order, which is what lets `firstNonNull` stop, and a drill into one reach the right element.

### Where the rules live

Split by who writes them:

- **Core operators:** a table in `./authoring`, keyed by the core definition itself rather than its name, so a host operator reusing a core name never inherits its rules. The root never imports it, so `evaluate()` pays nothing: the whole table is about 0.6 kB brotli.
- **Host operators:** an optional field on the definition, in the same shape (`coverage: { failures?, external?, output? }`; name provisional), checked by `defineOperator()`: a rule's `when` keys and `parameter`, and the parameters an `output` names, must be declared, each test and output must be well formed, and `external: true` declares no `failures`. Declaring it says the operator is pure, so the walk may run it, and that its rules are complete. A declared body must therefore settle from its parameters alone (see "Running a node"). A host operator without it is external. The field is carried onto the built definition and never read by the engine.

The analysis reads the definition's field first, then the core table.

## Value ranges

_To build at step 6 (agreed with Carl, 2026-10-06)._

The walk knows a value's type, not its range, so `{ $divide: [10, { $plus: [{ $length: '$data.s', fallback: 0 }, 1] }] }` is listed: it knows the divisor is an integer, not that it is at least 1. Ranges close that, and the like: a length is never negative, `split` never returns an empty array, a computed `decimals` is usually small.

- **What the walk knows** gains bounds: a minimum and maximum on a number, and a minimum length on an array or string.
- **Where they are declared:** in the output declarations, since a range is part of what a node returns. The core operators' are in the output table in `./authoring`, a host's in its `coverage.output`, checked by `defineOperator()` as outputs already are. Nothing reaches the engine, so `evaluate()` pays nothing.
- **The output vocabulary** gains bounds on a fixed type (`{ type: 'integer', min: 0 }` for `length`; `minLength` for arrays and strings, so `split` declares at least one element) and a few arithmetic forms over parameters (`{ sum: 'values' }`, `{ difference: ['value', 'minus'] }`, and the like for `multiply`, `abs`, `min` and `max`). The range arithmetic sits once in the walk's value representation; an operator, or a host's, declares only which operation it performs.
- **The failure rules** need no change: their tests read what a parameter receives, so with a range `{ by: 0 }` answers no where 0 is outside it, and `{ below }` and `{ empty }` read the bounds. The test vocabulary may gain an `{ above }` beside `{ below }`.
- **The rule checker** covers it unchanged: a declared range is part of an output, and every value the engine returns must be admitted by it.

## Numbers

How strictly the analysis treats numbers is its own option, not the evaluator's:

- **`'ordinary'` (default):** arithmetic stays in range, except where everyday inputs overflow (`power`, `round`), and numbers in the data are finite. Rules marked `overflow` are not counted.
- **`'strict'`:** every arithmetic node on unknown numbers may overflow (the `overflow` rules count), and any number from the data may be NaN or Infinity.

Non-finite results that are not overflow (`divide` by 0, `0^-1`, a negative base with a fractional exponent) count at both levels.

**The result boundary.** The engine refuses a NaN or infinite result at every operator node (`normalizeResult` in src/evaluate/operator.ts), not only at arithmetic. So the walk tracks, on each number it knows of, whether it may be non-finite: a number from the data may be, under `strict`; an operator returning a number may return one if a number it receives may be one (`floor`, `round`, `convert`); and an output declaration carries one through an operator that hands a value on (`if`, `match`, `get`, `min`). Under `strict`, a node whose result may be a non-finite number may fail `non-finite-result` there, unless a rule already says so; at both levels, so does one handed a non-finite constant. What passes the boundary is finite, so `{ $abs: { $floor: '$data.n', fallback: 0 } }` reports `floor` but not `abs`. A number the walk knows, or one no non-finite number can reach (`{ $length: '$data.s' }`), is never reported.

## Timeouts

Under a timeout, nothing runs after the deadline, and shielding is all or nothing: if any top-level value lacks a constant fallback, the deadline rejects the whole evaluation. So:

- **If anything can do I/O** (an I/O operator, or an external host operator), every top-level value needs a constant fallback, including those doing no I/O. Each that lacks one is an uncovered `timeout` finding on that value.
- **If nothing can**, every value settles before the deadline's timer can fire, and a timeout adds nothing.

A constant fallback here means a literal one, as the engine's shielding reads it: a fallback that folds to a constant does not shield. The fragment-call exception carries over from v3-authoring.md: a call with dynamic arguments fails outside its body's fallbacks.

## Testing

- **The corpus**, test/coverage-cases.ts (readable as v3-coverage-cases.md): 158 expressions and the findings each should give. A finding marked `external` stands for any code at its node, as the analysis's does. Each finding's witness is checked against the engine already; the analysis's results are asserted against the expected findings as each step lands.
- **Soundness**, at every step: each corpus expression is evaluated over a spread of data values, and every failure the engine shows must be among the analysis's findings, uncovered or covered at the right fallback. A step may leave false positives, never a missed failure. Codes are matched exactly, except at an external node, whose one finding stands for any code.
- **The rule checker:** each pure core operator runs over edge-case values for its parameters' types, and every failure the engine shows must be predicted by its rules or its type checks, with no rule that never fires. It also checks the outputs: every value the engine returns must be admitted by the output the walk gives the node, so a wrong declaration, which would hide failures downstream, fails it. And it checks the runs: every run of the node, with each parameter known exactly, must end as the engine's evaluation does, with the same value or a certain failure with the same code, and every operator must be run at least once. It reads each value from the data, so one compiled node serves every combination, and runs with the suite in about two seconds (test/coverage-rules.test.ts). It is what keeps the core tables complete: it found `round`'s rule, the result boundary under `strict`, and `regex`'s `returns` ([#218](https://github.com/CarlosNZ/fig-tree-evaluator/issues/218)).

## Known limits

- **No value ranges, until step 6.** `{ $divide: [10, { $plus: [<a length>, 1] }] }` is listed: the walk knows the divisor is an integer, not that it is at least 1. Likewise a length is never negative, and `split` never returns an empty array (see "Value ranges").
- **Undeclared host operators** are external, so may always fail: `{ $twice: 2 }` is listed.
- **No per-element analysis, until step 7.** An `each` is walked once, with `$element` any of the elements, so a run sees every element give the same: `{ $some: { input: [0, 1], each: { $divide: [1, '$element'] } } }` lists the division by 0, although element 1 decides `some` before it matters.
- **A race body is taken to answer the same whatever order its operands settle in**, as the operator contract has it. A host operator's race body that took whichever operand answered first would break that.
- **The `power` and `round` thresholds**, `exponent` below 100 and `decimals` below 300 counting as safe from ordinary overflow, are judgments. Without value ranges, every `round` with a computed `decimals` gets a `may` finding.
- **`regex` declares a `returns` its `extract` mode breaks** ([#218](https://github.com/CarlosNZ/fig-tree-evaluator/issues/218)). The walk reads its output declaration instead, so the analysis is unaffected; `validate()`'s feeding check is not.
- **An external node's certain failures** are reported as may fail: `http` with a relative URL and no `http.baseEndpoint`, `graphQL` with no endpoint.
- **A declared `returns` is trusted.** The engine never checks a body's result against it, so a host operator whose body returns outside its `returns` can cause type failures downstream that are not reported. `validate()`'s feeding check relies on `returns` in the same way.

## Open

- The names: the `numbers` levels, and the host definition field.
- Where the analysis's own options sit beside the stand-ins for `evaluate()`'s (deferred).
- Whether to warn about a fallback that can never fire. A child no run reaches reports nothing, its failures included (decided at step 5).
- Whether `floor` and `ceil` should declare `returns: 'integer'` in their definitions rather than in the output table.
- Finding messages: their wording, generated from the rule or the run.

## Development steps

Each step keeps the analysis sound, so it can land and be used at any point. The corpus measures progress: how many of its cases give exactly their expected findings.

1. **Shape and walk skeleton.** The new result types and the `numbers` option (accepted, no effect yet). The walk over the compiled tree, with scopes (vars, element bindings, fragment bodies), passing children's failures up for every delivery mode (rule 3, conservatively) and applying fallbacks (rule 6), with today's timeout logic carried into the new shape. Every operator node gets one placeholder finding, `operator-failure`, may. A fragment call gets none, since it fails on nothing of its own: it reports its body's findings, the placeholders included, and its arguments' (see "Fragment calls"). The soundness test is added, and test/authoring\*.test.ts move to the new shape. Result: today's precision, reported per node, with `covered`.
2. **Types between nodes** (rules 1, 2 and 7 without declarations). The internal representation of what is known about a value. Inputs with defaults and the null rules in the engine's order; outputs from `returns`, null propagation and fallbacks; `$data` as `any`, `$element` from the input's elements, `$index` an integer, `$vars` from their definitions, `$params` from the fragment's declarations, analysed per call. The subset type check, giving real `type-check` findings. The placeholder finding stays.
3. **Declared rules** (rule 5). The rule types and their no/maybe/yes evaluation, the core table in `./authoring`, `external` for the I/O operators and undeclared host operators, the host field and its check in `defineOperator()`. The placeholder finding goes; the `numbers` option takes effect. The rule checker is added.
4. **Output declarations** (rule 7). The output types and the core output table, the result boundary under `strict` numbers, and the rule checker's check of outputs.
5. **Running nodes** (rule 4). `fallbackCoverage` becomes async. The runner: nodes whose inputs are all known (folding, certain failures, the short-circuits), one run per combination of a few known values, and stand-ins for children whose value is not known, ruling out unused children. The rule checker's check of runs against the engine.
6. **Value ranges.** Bounds in what the walk knows, the range forms of the output vocabulary and their arithmetic, the core operators' ranges, and the tests reading them (see "Value ranges").
7. **Per-element walks.** Where an iterator's `input` is known exactly, its `each` walked once per element, with `$element` and `$index` bound to that element, so a run sees what each element gives. Findings merged across the elements' walks, `always` only where every element's walk says so.
8. **Timeouts.** The all-or-nothing rule and the no-I/O case.
9. **Close-out.** v3-authoring.md's `fallbackCoverage` section replaced by this spec, README, docs-dev/imports.md sizes, CHANGELOG, the cases page regenerated, #217 closed.
