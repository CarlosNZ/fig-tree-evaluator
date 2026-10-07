# FigTree v3 — Precise fallback coverage

_Spec (Claude, October 2026), from the [#217](https://github.com/CarlosNZ/fig-tree-evaluator/issues/217) design discussion with Carl. Built: this records what `fallbackCoverage` does, and replaces the version first specified in [v3-authoring.md](v3-authoring.md). The reasoning behind each decision is logged in [v3-coverage-decisions.md](v3-coverage-decisions.md); what every operator can fail on is in [v3-failure-inventory.md](v3-failure-inventory.md); the expected results, case by case, are in [v3-coverage-cases.md](v3-coverage-cases.md)._

## What it does

The first `fallbackCoverage` ([#209](https://github.com/CarlosNZ/fig-tree-evaluator/issues/209)) assumed every operator node could throw: only a fallback on a top-level value counted, and `{ $plus: [1, 2] }` was listed as a risk although it cannot fail.

This version works out which nodes can actually throw, and why. It walks the expression from the leaves up, giving each node a verdict and an output type, so an inner fallback counts and a node that cannot fail is not listed. It stays in `./authoring`, so `evaluate()` pays nothing for any of it.

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

- **One finding per way a node can fail**, in tree order, like `validate()`'s issues. Two rules that give one node the same failure (the same code, parameter and place) give one finding, `always` if either would. Across the elements of an `each` walked per element it is the other way round: a failure is `always` only where it is for every element a run reached (see "Per-element walks").
- **A finding sits where the failure starts**, never repeated on the ancestors it passes through. A fallback there, or on any ancestor, covers it.
- **A var or an argument is reported once per fallback that catches it.** Its failure is memoised and reaches every place that reads it, so the same finding can be covered by one fallback and uncovered by another route, or covered by two.
- **`code` is the runtime error's code**, so a finding and the error it predicts are classified the same way. The one exception is an external operator, whose one `operator-failure` finding stands for whatever code its own code throws (see "Operator rules").
- **CI checks `uncovered.length === 0`.** `covered` is for tools that show where fallbacks do their work.
- **It is async.** Rule 4 runs a pure node's own body, and the bodies of the operators that read their children one at a time or as they settle (`firstOf`, `and`, `or`, `find`, `filter`, `map`, `some`, `every`) are async.

For example, `{ $plus: [{ $divide: ['$data.a', '$data.b'] }, 1] }` gives three uncovered findings on `divide`: `type-check` on `value`, `type-check` on `by`, and `non-finite-result` on `by` (it may be 0). `plus` has none: `divide` returns a number or null, which `plus` accepts. With a fallback on `divide`, all three move to `covered`.

### Static errors

An expression with a static error, anything `validate()` reports at error severity, never runs: `evaluate()` refuses it before anything starts, so no fallback is ever reached ("fallback semantics" in [v3-api.md](v3-api.md)). Its report is every static error, `uncovered` with certainty `always`, and `covered` is empty. Nothing is walked, so none of the failures the expression could have at runtime are listed until the errors are fixed (agreed with Carl, October 2026, [#232](https://github.com/CarlosNZ/fig-tree-evaluator/issues/232)).

The errors come in the order `evaluate()` reads them: the instance's `maxDepth` and `maxNodes` first, then the rest in tree order. So `uncovered[0]` is the error `evaluate()` throws. Each finding carries the issue's path, code, message, operator and parameter.

For example, `{ a: { $plus: [{ operator: 'gone' }, 1], fallback: 0 }, b: { $divide: ['$data.n', '$data.d'] } }` gives one finding, `unknown-operator` at `['a', '$plus', 0]`, uncovered although `a` has a fallback. `b`'s divide findings appear once `gone` is fixed.

### Options

- **`strictNumbers`**: `false` by default. See "Numbers".

That is the analysis's only option. It answers as the instance would evaluate the expression, so the evaluation options it reads, `timeout` and `strictDataPaths`, are the instance's own. A host that passes a timeout to `evaluate()` per call analyses with an instance that carries it. An I/O operator's own `timeout` parameter is something else: it makes that request fail with `request-timeout`, which its finding stands for.

## The walk

The walk visits each node after its children. By the time it reaches a node, it has a result for every child:

- **its verdict**: whether it can throw (no, may, always), and its findings;
- **its output**: what the walk knows the child returns.

What the walk knows about a value is one of:

- **an exact value**: a constant, or a node the walk ran;
- **one of a few exact values**: `{ $if: ['$data.c', 'a', 'b'] }` returns `'a'` or `'b'`;
- **a type**: `number`, `string | null`, an array whose elements are numbers, an object with known keys. A `$data` reference is `any`.
- **a type with bounds**: a number between a minimum and a maximum, a string or an array at least so long. A length is an integer from 0 (see "Value ranges").

This representation is internal: richer than `ExpectedType` (element types, keys, exact values) and free to change.

### Fragment calls

A failure inside a body is reported at the call, with `fragment` and `fragmentPath`; the call itself fails on nothing of its own. Where an argument's failure surfaces depends on the arguments mode, as at runtime:

- **Static arguments** are evaluated when the body first reads `$params.x`, so a body fallback above that read catches the argument's failures. They keep the argument's own path, in the caller, with no `fragmentPath`, and include the declaration's type check on what the argument returns. An argument the body never reads is never evaluated. The walk records each read of a parameter as a demand that travels up the body like a failure, and each call answers its demands with its arguments' findings.
- **Dynamic arguments** are evaluated and checked before the body runs: `type-check`, and `missing-required` where a parameter is required, at `parameters`. Only the call's own fallback, or one above it, catches them, and the body reads values that can no longer fail.
- A `$params` reference itself fails only on a drill under `strictDataPaths`.

### Per-element walks

Where an iterator's `over` parameter receives one exact array, its `each` is walked once per element, with `$element` and `$index` (or their `as` names) bound to that element and its index, so a run sees what each element gives. `{ $some: { input: [0, 1], each: { $divide: [1, '$element'] } } }` reports nothing: element 1 decides `some` before element 0's division by 0 matters.

- **When.** Only over one exact array, a literal or a node the walk ran, and only while the walks stay within 16. A node in an `each` nested inside another walked per element is walked once for each combination of their elements, so the counts multiply. Otherwise `each` is walked once, with `$element` any of the elements and `$index` an integer from 0: over more elements, over a literal with a computed element, over an input that is one of several arrays.
- **Runs.** Each element's walk is a child of its own. `each.evaluate(i)` answers with element `i`'s, `each.settle()` streams them, and an index the input does not have is a stand-in. `settle()` reaches every element at once, since the engine starts every one, so an element a decider never needed still reports what its own fallbacks catch, as a parked operand does.
- **Findings.** A failure is `always` only where it is for every element a run reached, or every element where the node is not run, since its node is reached for each. A failure certain for one element and absent for another is `may`.
- **Vars** are walked where their block is declared, with the bindings in force there, once for each walk of that block: a block inside `each` once per element, one outside it once for all of them. A var declared on an inner iterator reads the outer element, as at runtime.
- **Output.** `{ arrayOf: { param: 'each' } }` over an `each` walked per element is the elements' results in order, so a `map` that is not run keeps its length and each element's range.

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

  An `each` walked per element delivers each element's own (see "Per-element walks"); one walked once comes to the same for every element, or is a stand-in.

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

Twenty-seven of the forty pure core operators need no **failure rules**: everything that can make them throw is a type check, a null rejection or a constraint, all read from their definitions. The other thirteen declare them. Separately, sixteen operators declare an **output** narrower than their `returns`.

### Failure rules

A rule names the error a failure carries and the conditions under which it happens:

```ts
interface FailureRule {
  code: FigTreeErrorCode
  /** The parameter the failure is about, which its finding names */
  parameter?: string
  /** Tests on parameters, by name; every one must hold. Absent: always holds */
  when?: Record<string, FailureTest>
  /** Options the rule needs, such as { strictDataPaths: true } */
  options?: Record<string, unknown>
  /** Holding makes the failure possible, not certain */
  may?: true
  /** An overflow only extreme inputs reach: counted under strictNumbers only, never certain */
  overflow?: true
}

type FailureTest =
  | string
  | number
  | boolean
  | null // equals this value
  | { type: ExpectedType } // has this type
  | { below: number } // a number less than this
  | { empty: true } // an empty array, string or object
  | { supplied: boolean } // it has a value, supplied or defaulted, or has none
  | { invalid: true } // the operator's validate hook refuses it
  | { some: FailureTest } // some element of an array, or value of an object
  | { not: FailureTest }
```

Each test answers no, maybe or yes from what the walk knows: `{ by: 0 }` is yes when `by` is exactly 0, no when it is exactly 2 or can only be null, maybe when it is an unknown number. A rule's answer is the combination of its tests: no if any is no, yes if all are yes, otherwise maybe. A yes on a rule without `may` or `overflow` gives an `always` finding; any other yes or maybe gives a `may` finding; no gives nothing. An overflow takes extreme numbers, which no test can ask for, so it is never certain: an `always` there would tell the walk that the node never returns, and its parent's own checks would be skipped. A test reads what the parameter receives, once the engine's layers have run: its default, a null replaced. `{ invalid: true }` is maybe while the value is unknown; once known, the operator's own `validate` hook decides, given every parameter known exactly and none of the others, as the static check gives it the literal ones only. A finding names the rule's `parameter`, if it has one. Its message is generated from the rule: `divide – non-finite-result when 'by' is 0`.

The core rules, in full:

```ts
divide:   { code: 'non-finite-result', parameter: 'by', when: { by: 0 } }
          { code: 'non-finite-result', overflow: true }
modulo:   { code: 'non-finite-result', parameter: 'mod', when: { mod: 0 } }
          { code: 'non-finite-result', overflow: true }
power:    { code: 'non-finite-result', parameter: 'base', when: { base: 0, exponent: { below: 0 } } }
          { code: 'non-finite-result', parameter: 'base', may: true, when: { base: { below: 0 }, exponent: { not: { type: 'integer' } } } }
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

`power`'s second rule is `may` although a negative base with a fractional exponent is always NaN: an infinite operand also passes its tests, and `(-2)^-Infinity` is 0. `match` and `get` need only the unknown case: with a known value, or a known path and `from`, rule 4 runs them instead. `round`'s first rule, found by the rule checker, is a judgment like `power`'s: `10^decimals` is infinite from 309, and below 300 it takes an extreme value to overflow.

`external` means never run, and may fail whatever the parameters: only a fallback covers an I/O node. An external node gets one finding, `operator-failure`, may, which stands for whatever code its own code throws: an I/O operator refuses a relative URL or a GET with a body with `type-check`, its own `timeout` with `request-timeout`, and a client or a host's body can throw anything. Its code is the one exception to a finding carrying the runtime error's code.

### Output declarations

For operators whose `returns` is wider than what a node can return:

```ts
type DeclaredOutput =
  | ExpectedType // a fixed type
  | { type: 'number' | 'integer'; min?: number; max?: number } // a number within bounds, inclusive
  | { type: 'string' | 'array'; minLength?: number } // at least so long (a string in code points)
  | { param: string } // what that parameter receives
  | { elementOf: string } // an element of an array parameter
  | { kindOf: string } // the types of an array parameter's elements, widened
  | { arrayOf: DeclaredOutput; minLength?: number }
  | { oneOf: DeclaredOutput[] }
  | { typeNamedBy: string } // the type a literal parameter names
  | { byParam: string; cases: Record<string, DeclaredOutput>; otherwise?: DeclaredOutput } // chosen by a literal parameter
  | { firstNonNull: string } // firstOf's candidates
  | { sum: string } // the sum of an array parameter's elements
  | { product: string } // the product of an array parameter's numbers
  | { difference: [string, string] } // one number parameter less another
  | { abs: string } // a number parameter's absolute value
  | { min: string } // the least of an array parameter's elements
  | { max: string } // the greatest of an array parameter's elements
```

```ts
if:          { oneOf: [{ param: 'then' }, { param: 'else' }] }
match:       { oneOf: [{ param: 'branches' }, { param: 'default' }] }
firstOf:     { firstNonNull: 'values' }
find:        { oneOf: [{ elementOf: 'input' }, { param: 'noMatchDefault' }] }
plus:        { oneOf: [{ sum: 'values' }, { typeNamedBy: 'expect' }] }
subtract:    { difference: ['value', 'minus'] }
multiply:    { product: 'values' }
abs:         { abs: 'value' }
min:         { min: 'values' }
max:         { max: 'values' }
length:      { type: 'integer', min: 0 }
filter:      { arrayOf: { elementOf: 'input' } }
map:         { arrayOf: { param: 'each' } }
split:       { byParam: 'delimiter', cases: { '': { arrayOf: 'string' } }, otherwise: { arrayOf: 'string', minLength: 1 } }
convert:     { typeNamedBy: 'to' }
regex:       { byParam: 'mode', cases: { test: 'boolean', extract: { oneOf: ['string', { param: 'noMatchDefault' }] }, match: { arrayOf: 'string' } } }
```

`{ param }` over a container-lazy parameter (`match.branches`, `firstOf.values`) means the union of its entries or elements, and over a `perElement` parameter (`map.each`) what one element gives; `{ arrayOf }` of that, where each element was walked on its own, is their results in order. `{ elementOf }` is one of the elements as it is, which is right for `min` and `max`; `{ kindOf }` widens each exact element to its type, which is right for `plus`, since a sum is none of its operands: `{ $plus: [-1, 1] }` is an integer, not -1 or 1. `{ typeNamedBy }` and `{ byParam }` take the named type or case when the parameter is known exactly, and every one otherwise; `byParam`'s `otherwise` is the case for any value its `cases` do not name. `split` needs it: an empty delimiter splits into code points, so `split('', '')` is `[]`, while any other delimiter gives at least one piece. The arithmetic forms are in "Value ranges". `{ firstNonNull }` reads a literal array's elements in order, and stops at the first that cannot be null.

`sql` has no declaration: `sqlOperators()` builds a definition for each connection, so there is no one definition to key a table by. It is external, and returns its `returns`, `any`. A literal array keeps its elements in order, which is what lets `firstNonNull` stop, and a drill into one reach the right element.

### Where the rules live

Split by who writes them:

- **Core operators:** a table in `./authoring`, keyed by the core definition itself rather than its name, so a host operator reusing a core name never inherits its rules. The root never imports it, so `evaluate()` pays nothing: the whole table is about 0.6 kB brotli.
- **Host operators:** an optional field on the definition, in the same shape (`analysis: { failures?, external?, output? }`), checked by `defineOperator()`: a rule's `when` keys and `parameter`, and the parameters an `output` names, must be declared, each test and output must be well formed, and `external: true` declares no `failures`. Declaring it says the operator is pure, so the walk may run it, and that its rules are complete. A declared body must therefore settle from its parameters alone (see "Running a node"). A host operator without it is external. The field is carried onto the built definition and never read by the engine.

The analysis reads the definition's field first, then the core table.

## Value ranges

The walk knows a value's bounds as well as its type, so `{ $divide: [10, { $plus: [{ $length: '$data.s', fallback: 0 }, 1] }] }` is not listed: the divisor is an integer from 1. A length is never negative, `split` on a delimiter never returns an empty array, and `{ $max: [<a length>, 1] }` is a guard a divisor can rely on.

**What the walk knows.** A number member carries an inclusive `min` and `max`, either open; a string or array member carries a `minLength`, beside an array's exact `length` where that is known. Bounds describe finite numbers only: NaN and the infinities stay their own member, so the result boundary reads them as before. The walk's own `$index` is an integer from 0.

- **Union** keeps members with different bounds apart, deduplicated by their bounds, so a value from 1 up or from −1 down is still known not to be 0. Each arithmetic form takes the span of each operand first, so members never multiply.
- **Past the exact-value limit**, exact numbers widen to the range they span, integers apart from other numbers, and strings and arrays to their least length, rather than to a bare type: twenty `match` branches from 1 to 20 are an integer from 1 to 20.
- **`narrow`** turns a number range checked as an integer into an integer range, its bounds rounded inwards; a literal type keeps the literals inside the range.
- **`fits`** admits a literal only inside the bounds, an integer where the member is one, and no shorter than `minLength`. A drill below an array's `minLength` finds its element.

**Where they are declared.** In the output declarations, since a range is part of what a node returns: the core table in `./authoring`, a host's `analysis.output`, which `defineOperator()` checks as it checks any output (bounds finite and in order, only on a number type; `minLength` a non-negative integer, only on a string or array; every parameter named declared). Nothing reaches the engine, so `evaluate()` pays nothing.

**The arithmetic** sits once in the walk's value representation (src/authoring/known.ts); a declaration names only the operation. Each computes its bounds with the operation the body performs, in the same order (a sum from 0, a product from 1, left to right), so what the body returns is within them: rounding never reverses an order, and a bound that overflows is open.

- **`sum`**: over a literal, the operands' spans added in order; over an array whose length is not known, only the elements' sign bounds it (non-negative elements sum to at least 0, or at least the least element once there is one). Anything not a number, a string say, contributes its kind, as `plus`'s operands do.
- **`product`**: corner products of the spans, a factor of 0 giving 0 even against an open bound; over an unknown count, factors within ±1 keep the product within ±1, and factors from 1 keep it from 1.
- **`difference`**, **`abs`**: the spans' difference, and its magnitude.
- **`min`**, **`max`**: a span between the elements' own (the least of their minimums to the least of their maximums, for `min`), and anything not a number as it is. NaN compares equal to anything, so where an element may be one, the answer is any element.
- A NaN or infinite element passes through each array form as it is: a sum, product or extreme with one among them is one too.

**The failure rules** need no change: their tests read what a parameter receives. `{ by: 0 }` answers no where 0 is outside the range; `{ below: n }` yes where the maximum is below `n`, no where the minimum is not; `{ empty: true }` no where `minLength` is at least 1; `{ some }` can answer yes on an array with a `minLength`. Every core rule is written with `below` and `not`, so the vocabulary has no `{ above }`.

**Runs** are unaffected: a range is not an exact value, so a child known only by its range is a stand-in, and a run's output is exact. Ranges matter where a node is not run.

**The rule checker** covers them: a declared range is part of an output, so every value the engine returns must be admitted by it, and it holds the arithmetic and the tests to the engine over ranges, not only over single values (see "Testing").

## Numbers

How strictly the analysis treats numbers is its own option, `strictNumbers`, not the evaluator's:

- **Off (the default):** arithmetic stays in range, except where everyday inputs overflow (`power`, `round`), and numbers in the data are finite. Rules marked `overflow` are not counted.
- **On:** every arithmetic node on unknown numbers may overflow (the `overflow` rules count), and any number from the data may be NaN or Infinity.

Non-finite results that are not overflow (`divide` by 0, `0^-1`, a negative base with a fractional exponent) count either way.

**The result boundary.** The engine refuses a NaN or infinite result at every operator node (`normalizeResult` in src/evaluate/operator.ts), not only at arithmetic. So the walk tracks, on each number it knows of, whether it may be non-finite: a number from the data may be, under `strictNumbers`; an operator returning a number may return one if a number it receives may be one (`floor`, `round`, `convert`); and an output declaration carries one through an operator that hands a value on (`if`, `match`, `get`, `min`). Under `strictNumbers`, a node whose result may be a non-finite number may fail `non-finite-result` there, unless a rule already says so; either way, so does one handed a non-finite constant. What passes the boundary is finite, so `{ $abs: { $floor: '$data.n', fallback: 0 } }` reports `floor` but not `abs`. A number the walk knows, or one no non-finite number can reach (`{ $length: '$data.s' }`), is never reported.

## Timeouts

Under a timeout, nothing runs after the deadline, so only a constant fallback can stand in for a value that has not finished, and shielding is all or nothing: if any top-level value lacks a constant fallback, the deadline rejects the whole evaluation; if every one has one, each value still unfinished at the deadline gets its fallback in its place. A top-level value is an embedded expression at any depth of plain data, so a nested object carrying its own `vars` block is not one value but a container of them, each listed at its own path. Only an evaluation that waits on something outside it can be cut off: one that runs on promises alone finishes before the deadline's timer can fire, however long it takes. So:

- **What can wait** is an I/O operator, and any host operator, declared or not: declaring `analysis` says what a body fails on and returns, not how long it takes, and a declared body may wait on a timer. A node waits where one of these is evaluated under it, through a var it reads, a fallback that can run, a fragment body, or an argument the body reads. As with failures, a child no run reaches does not count, and neither does one a run started but never waited on: `{ $or: [true, { $http: 'https://x.test/a' }] }` answers before its request does.
- **If anything can wait** and some top-level value lacks a constant fallback, every value lacking one is an uncovered `timeout` finding, including those that cannot wait themselves.
- **If anything can wait** and every top-level value has a constant fallback, each value that can wait is a covered `timeout` finding, covered by itself: the deadline may put its fallback in its place.
- **If nothing can**, a timeout adds nothing.

The timeout is the instance's (see "Options"). A constant fallback here means a literal one, as the engine's shielding reads it: a fallback that folds to a constant does not shield. A call with no fallback of its own shields with the one its body's root lifts, but a call with dynamic arguments still fails outside its body's fallbacks, which the walk reports as the call's own failures (see "Fragment calls").

## Testing

- **The corpus**, test/coverage-cases.ts (readable as v3-coverage-cases.md): 180 expressions and the findings each should give. A finding marked `external` stands for any code at its node, as the analysis's does. Each finding's witness is checked against the engine, and the analysis must give each case exactly its findings: no more and no fewer, each with the same certainty and covering fallback.
- **Soundness:** each corpus expression is evaluated over a spread of data values, and every failure the engine shows must be among the analysis's findings, uncovered or covered at the right fallback. A step may leave false positives, never a missed failure. Codes are matched exactly, except at an external node, whose one finding stands for any code its own code throws, which a timeout never is. A case with a timeout is evaluated under it as well, with a slow client where it does I/O, so a value cut off must be a `timeout` finding, covered at that value where its fallback stood in. A wrong `always` is unsound too, so no node the analysis says always fails may be shown returning a value, wherever the trace shows it evaluated.
- **The rule checker:** each pure core operator runs over edge-case values for its parameters' types, and every failure the engine shows must be predicted by its rules or its type checks, with no rule that never fires. It also checks the outputs: every value the engine returns must be admitted by the output the walk gives the node, so a wrong declaration, which would hide failures downstream, fails it. And it checks the runs: every run of the node, with each parameter known exactly, must end as the engine's evaluation does, with the same value or a certain failure with the same code, and every operator must be run at least once. An iterator is run again with its `each` walked per element, each element giving a value of its own or failing, against the engine's evaluation of an `each` that does the same. The outputs and the predictions are checked again with each parameter known only by a few ranges around its value (bounded at it on one side or both, reaching past it, a least length, an array's elements widened in turn), and a test's yes or no on a range must be its answer for the value in it. Where the analysis says the node always fails, the engine must fail. It reads each value from the data, so one compiled node serves every combination, and runs with the suite in about five seconds (test/coverage-rules.test.ts). It is what keeps the core tables complete: it found `round`'s rule, the result boundary under `strictNumbers`, that `regex`'s `returns` did not hold in `extract` mode ([#218](https://github.com/CarlosNZ/fig-tree-evaluator/issues/218), fixed in the engine by typing `noMatchDefault` as a string), and that an overflow is never certain.

## Known limits

- **Ranges come from a few operators only.** `divide`, `modulo`, `power`, `round`, `floor` and `ceil` declare no arithmetic, so `{ $divide: [<a length>, 2] }` is any number, and a length has no upper bound. Over an array whose length is not known, a sum or product is bounded by its elements' sign alone.
- **`plus` with `expect: 'number'` has no range:** `{ typeNamedBy: 'expect' }` adds every number, for the empty case's identity.
- **Under `strictNumbers`, an overflow rule counts whatever the ranges:** `{ $plus: [<a length>, 1] }` may overflow, although its operands are bounded.
- **Undeclared host operators** are external, so may always fail: `{ $twice: 2 }` is listed.
- **Under a timeout, a host operator is taken to wait**, declared or not, though its body may be synchronous: `{ a: { $twice: 2 }, b: { $upper: 'x' } }` lists a `timeout` on both values.
- **Per-element walks need one exact array of a few elements.** Over 17 elements, or over a literal with a computed element, an `each` is walked once, with `$element` any of the elements, so a run sees every element give the same: `some` over the integers 0 to 16, with `{ $divide: [1, '$element'] }`, lists the division by 0, although element 1 decides `some` before it matters.
- **A race body is taken to answer the same whatever order its operands settle in**, as the operator contract has it. A host operator's race body that took whichever operand answered first would break that.
- **The `power` and `round` thresholds**, `exponent` below 100 and `decimals` below 300 counting as safe from ordinary overflow, are judgments. A computed `decimals` gets a `may` finding unless a range keeps it below 300: `{ $min: [<a length>, 4] }` does, a length alone does not, since a string of 618 characters makes `{ $divide: [<its length>, 2] }` 309.
- **An external node's certain failures** are reported as may fail: `http` with a relative URL and no `http.baseEndpoint`, `graphQL` with no endpoint.
- **A host body that asks for an element its input does not have** is not followed. The engine evaluates `each` there with `$element` null, and no walk binds it so, so a failure that gives is missed: a host operator returning `each.evaluate(5)` over `[[1]]`, with `{ $map: { input: '$element', each: 1 } }` as its `each`, fails `type-check` and is not reported. A run treats such an index as a stand-in, so it never answers wrongly; core bodies only ever call `settle()`. Walking `each` once more with `$element` null, for host operators only, would close it ([#220](https://github.com/CarlosNZ/fig-tree-evaluator/issues/220)).
- **A declared `returns` is trusted.** The engine never checks a body's result against it, so a host operator whose body returns outside its `returns` can cause type failures downstream that are not reported. `validate()`'s feeding check relies on `returns` in the same way.

## Follow-ups

- **Wording:** finding messages, generated from the rule or the run, are part of the review of every message before release ([#219](https://github.com/CarlosNZ/fig-tree-evaluator/issues/219)).
- **A warning for a fallback that can never fire, a data shape, and a host iterator asking for an element its input does not have** ([#220](https://github.com/CarlosNZ/fig-tree-evaluator/issues/220)).
- **A default whole-evaluation timeout**, armed only where an expression can wait ([#221](https://github.com/CarlosNZ/fig-tree-evaluator/issues/221)). With one in force, every expression that can wait would be analysed under it.

## Development steps

Built in nine steps, each kept sound so it could land on its own. The corpus measured progress as each landed; at the close, every case gives exactly its expected findings, and the runner fails on any that does not.

1. **Shape and walk skeleton.** The new result types and the numbers option, `strictNumbers` since step 9 (accepted, no effect yet). The walk over the compiled tree, with scopes (vars, element bindings, fragment bodies), passing children's failures up for every delivery mode (rule 3, conservatively) and applying fallbacks (rule 6), with today's timeout logic carried into the new shape. Every operator node gets one placeholder finding, `operator-failure`, may. A fragment call gets none, since it fails on nothing of its own: it reports its body's findings, the placeholders included, and its arguments' (see "Fragment calls"). The soundness test is added, and test/authoring\*.test.ts move to the new shape. Result: today's precision, reported per node, with `covered`.
2. **Types between nodes** (rules 1, 2 and 7 without declarations). The internal representation of what is known about a value. Inputs with defaults and the null rules in the engine's order; outputs from `returns`, null propagation and fallbacks; `$data` as `any`, `$element` from the input's elements, `$index` an integer, `$vars` from their definitions, `$params` from the fragment's declarations, analysed per call. The subset type check, giving real `type-check` findings. The placeholder finding stays.
3. **Declared rules** (rule 5). The rule types and their no/maybe/yes evaluation, the core table in `./authoring`, `external` for the I/O operators and undeclared host operators, the host field and its check in `defineOperator()`. The placeholder finding goes; the numbers option takes effect. The rule checker is added.
4. **Output declarations** (rule 7). The output types and the core output table, the result boundary under strict numbers, and the rule checker's check of outputs.
5. **Running nodes** (rule 4). `fallbackCoverage` becomes async. The runner: nodes whose inputs are all known (folding, certain failures, the short-circuits), one run per combination of a few known values, and stand-ins for children whose value is not known, ruling out unused children. The rule checker's check of runs against the engine.
6. **Value ranges.** Bounds in what the walk knows, the range forms of the output vocabulary and their arithmetic, the core operators' ranges, and the tests reading them (see "Value ranges").
7. **Per-element walks.** Where an iterator's `input` is known exactly, its `each` walked once per element, with `$element` and `$index` bound to that element, so a run sees what each element gives. Findings merged across the elements' walks, `always` only where every element a run reached says so.
8. **Timeouts.** The all-or-nothing rule and the no-I/O case.
9. **Close-out.** The public names settled: `strictNumbers` for the numbers option, and `analysis` for the host field. `fallbackCoverage`'s `timeout` option removed, so the analysis reads the instance's. `floor` and `ceil` declare `returns: 'integer'` in their definitions, which leaves the output table. Exactness made a check the corpus fails on. v3-authoring.md's section replaced by a pointer to this spec, docs-dev/imports.md updated, the cases page regenerated, #217 closed. The README and CHANGELOG are left to v3's release.
