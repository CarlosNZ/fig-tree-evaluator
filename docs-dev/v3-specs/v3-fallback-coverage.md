# FigTree v3 — Precise fallback coverage

_Spec (Claude, October 2026), from the [#217](https://github.com/CarlosNZ/fig-tree-evaluator/issues/217) design discussion with Carl. It replaces the `fallbackCoverage` section of [v3-authoring.md](v3-authoring.md) once built. The reasoning behind each decision is logged in [v3-coverage-decisions.md](v3-coverage-decisions.md); what every operator can fail on is in [v3-failure-inventory.md](v3-failure-inventory.md); the expected results, case by case, are in [v3-coverage-cases.md](v3-coverage-cases.md)._

## What changes

Today `fallbackCoverage` assumes every operator node can throw. Only a fallback on a top-level value counts, and `{ $plus: [1, 2] }` is listed as a risk although it cannot fail.

The precise version works out which nodes can actually throw, and why. It walks the expression from the leaves up, giving each node a verdict and an output type, so an inner fallback counts and a node that cannot fail is not listed. It stays in `./authoring`, so `evaluate()` pays nothing for any of it.

## What it returns

```ts
fallbackCoverage(fig, expression, options?) // → { uncovered, covered }

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

- **One finding per way a node can fail**, in tree order, like `validate()`'s issues.
- **A finding sits where the failure starts**, never repeated on the ancestors it passes through. A fallback there, or on any ancestor, covers it.
- **A var or an argument is reported once per fallback that catches it.** Its failure is memoised and reaches every place that reads it, so the same finding can be covered by one fallback and uncovered by another route, or covered by two.
- **`code` is the runtime error's code**, so a finding and the error it predicts are classified the same way. The one exception is an external operator, whose one `operator-failure` finding stands for whatever code its own code throws (see "Operator rules").
- **CI checks `uncovered.length === 0`.** `covered` is for tools that show where fallbacks do their work.

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
4. **Running the node.** When enough is known, the walk runs the node through the engine (pure operators only; see "Running a node").
5. **Declared rules.** If the node was not run, its operator's failure rules are tested against the inputs (see "Operator rules"). An operator with none adds nothing. An `external` operator may always fail.
6. **Fallback.** If the node has a fallback (its own, or its operator's `operatorDefaults` one), everything that can fail in or under it is covered there. The node's verdict becomes the fallback's, and its output gains the fallback's output.
7. **Output.** What a run returned, if the node was run. Otherwise the operator's output declaration if it has one, else its declared `returns`. Plus null where rule 1 found propagation.

The rules fill in three separate parts of the result, so they are not a decision list where the first match wins: findings (rules 2, 3 and 4 or 5), output (rules 1, 4, 6, 7), and verdict (the findings, then rule 6). A fallback comes late because the node's own findings still matter: they are reported as covered, and its parent needs its output.

### Short-circuits

1. **A run replaces guessing.** If rule 4 ran the node, rule 5 is skipped, the run's output replaces rule 7's declaration, and a lazy parameter no run asked for is unreachable, which overrides rule 3.
2. **An eager child that always fails means the node never runs.** Only the child's failure is reported; the node's own checks are moot, and its only output is its fallback's.
3. **A null that must propagate means the body never runs.** If a parameter can only receive null and its policy propagates, the node returns null: rule 5 and its later type checks are skipped.

### Worked example: `if`

`if`'s definition already holds everything the rules read: `condition` is `any` and eager, `then` and `else` are `any` and lazy (`else` defaulting to null), it has no failure rules, and its output declaration is one of `then` or `else`.

| Rule                   | `{ $if: ['$data.c', { $lower: '$data.s' }, 'x'] }`                     | `{ $if: [true, 'x', { $lower: '$data.s' }] }`                                                     |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1. Inputs              | `condition`: `any`; `then`: `string \| null`, may throw; `else`: `'x'` | `condition`: `true`; `then`: `'x'`; `else`: `string \| null`, may throw                           |
| 2. Type check          | every parameter is `any`: nothing                                      | nothing                                                                                           |
| 3. Children's failures | `then` may be used, so `lower`'s failure counts                        | `else` may be used, so `lower`'s failure counts, for now                                          |
| 4. Running the node    | `condition` is unknown: no run                                         | runs `{ $if: [true, <stand-in>, <stand-in>] }`; it asks for `then` only, so `else` is unreachable |
| 5. Declared rules      | none                                                                   | skipped                                                                                           |
| 6. Fallback            | none                                                                   | none                                                                                              |
| 7. Output              | `string \| null` or `'x'`                                              | `'x'`                                                                                             |
| **Verdict**            | **may fail**, through `lower` at `$if[1]`                              | **safe**                                                                                          |

### Running a node

Rule 4 runs a node only when its operator is pure: every core operator except `http`, `graphQL` and `sql`, and a host operator that declares rules (see "Where the rules live"). It runs the node alone, with constant parameters, so children are never run again: a child is summarised by its result.

- **Every input known exactly, or as one of a few values:** the node runs once per combination. The runs give its exact output, and its own failures exactly: `always` if every run failed, `may` if some did. `{ $plus: [{ $multiply: [2, 3] }, 1] }` folds to 7; `{ $divide: [1, 0] }` always fails.
- **Every eager input known, others not:** known non-eager children are passed as they are, each unknown one gets a stand-in, and the run shows which stand-ins the operator asked for. That is how a constant `if` condition, a known `match` value, an `or` with a constant `true`, or a `firstOf` whose first candidate is known not to be null, rule out the children they never use. A `get` with a literal `from` and a known path runs the same way.
- **Otherwise:** no run; rule 5 decides the node's own failures.

The cost is a run per combination of known values: usually one or two.

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
type OutputType =
  | ExpectedType // a fixed type
  | { param: string } // what that parameter receives
  | { elementOf: string } // the element type of an array parameter
  | { arrayOf: OutputType }
  | { oneOf: OutputType[] }
  | { typeNamedBy: string } // the type a literal parameter names
  | { byParam: string; cases: Record<string, OutputType> } // chosen by a literal parameter
  | { firstNonNull: string } // firstOf's candidates
```

```ts
if:          { oneOf: [{ param: 'then' }, { param: 'else' }] }
match:       { oneOf: [{ param: 'branches' }, { param: 'default' }] }
firstOf:     { firstNonNull: 'values' }
find:        { oneOf: [{ elementOf: 'input' }, { param: 'noMatchDefault' }] }
plus:        { oneOf: [{ elementOf: 'values' }, { typeNamedBy: 'expect' }] }
min, max:    { elementOf: 'values' }
filter:      { arrayOf: { elementOf: 'input' } }
map:         { arrayOf: { param: 'each' } }
split:       { arrayOf: 'string' }
convert:     { typeNamedBy: 'to' }
regex:       { byParam: 'mode', cases: { test: 'boolean', extract: { oneOf: ['string', { param: 'noMatchDefault' }] }, match: { arrayOf: 'string' } } }
sql:         { byParam: 'shape', cases: { rows: { arrayOf: 'object' }, firstRow: { oneOf: ['object', { param: 'noRowDefault' }] }, column: 'array', firstValue: 'any' } }
floor, ceil: 'integer'
```

`{ param }` over a container-lazy parameter (`match.branches`, `firstOf.values`) means the union of its entries or elements.

### Where the rules live

Split by who writes them:

- **Core operators:** a table in `./authoring`, keyed by the core definition itself rather than its name, so a host operator reusing a core name never inherits its rules. The root never imports it, so `evaluate()` pays nothing: the whole table is about 0.6 kB brotli.
- **Host operators:** an optional field on the definition, in the same shape (`coverage: { failures?, external? }`, with `output?` from step 4; name provisional), checked by `defineOperator()`: a rule's `when` keys and `parameter` must name declared parameters, each test must be well formed, and `external: true` declares no `failures`. Declaring it says the operator is pure, so the walk may run it, and that its rules are complete. A host operator without it is external. The field is carried onto the built definition and never read by the engine.

The analysis reads the definition's field first, then the core table.

## Numbers

How strictly the analysis treats numbers is its own option, not the evaluator's:

- **`'ordinary'` (default):** arithmetic stays in range, except where everyday inputs overflow (`power`), and numbers in the data are finite. Rules marked `overflow` are not counted.
- **`'strict'`:** every arithmetic node on unknown numbers may overflow (the `overflow` rules count), and any number from the data may be NaN or Infinity, so `floor`, `ceil` and `abs` may fail too.

Non-finite results that are not overflow (`divide` by 0, `0^-1`, a negative base with a fractional exponent) count at both levels.

## Timeouts

Under a timeout, nothing runs after the deadline, and shielding is all or nothing: if any top-level value lacks a constant fallback, the deadline rejects the whole evaluation. So:

- **If anything can do I/O** (an I/O operator, or an external host operator), every top-level value needs a constant fallback, including those doing no I/O. Each that lacks one is an uncovered `timeout` finding on that value.
- **If nothing can**, every value settles before the deadline's timer can fire, and a timeout adds nothing.

A constant fallback here means a literal one, as the engine's shielding reads it: a fallback that folds to a constant does not shield. The fragment-call exception carries over from v3-authoring.md: a call with dynamic arguments fails outside its body's fallbacks.

## Testing

- **The corpus**, test/coverage-cases.ts (readable as v3-coverage-cases.md): 156 expressions and the findings each should give. A finding marked `external` stands for any code at its node, as the analysis's does. Each finding's witness is checked against the engine already; the analysis's results are asserted against the expected findings as each step lands.
- **Soundness**, at every step: each corpus expression is evaluated over a spread of data values, and every failure the engine shows must be among the analysis's findings, uncovered or covered at the right fallback. A step may leave false positives, never a missed failure. Codes are matched exactly, except at an external node, whose one finding stands for any code.
- **The rule checker:** each pure core operator runs over edge-case values for its parameters' types, and every failure the engine shows must be predicted by its rules or its type checks, with no rule that never fires. It reads each value from the data, so one compiled node serves every combination, and runs with the suite in about two seconds (test/coverage-rules.test.ts). It is what keeps the core table complete: it found `round`'s rule, and the two questions in "To resolve".

## Known limits

- **No value ranges.** `{ $divide: [10, { $plus: [<a length>, 1] }] }` is listed: the walk knows the divisor is an integer, not that it is at least 1. Likewise a length is never negative, and `split` never returns an empty array.
- **Undeclared host operators** are external, so may always fail: `{ $twice: 2 }` is listed.
- **The `power` threshold**, `exponent` below 100 counting as safe from ordinary overflow, is a judgment.
- **An external node's certain failures** are reported as may fail: `http` with a relative URL and no `http.baseEndpoint`, `graphQL` with no endpoint.
- **A declared `returns` is trusted.** The engine never checks a body's result against it, so a host operator whose body returns outside its `returns` can cause type failures downstream that are not reported. `validate()`'s feeding check relies on `returns` in the same way.

## Open

- The names: the `numbers` levels, and the host definition field.
- Where the analysis's own options sit beside the stand-ins for `evaluate()`'s (deferred).
- Whether to report a fallback that can never fire, and a certain failure in a branch never taken.
- Whether `floor` and `ceil` should declare `returns: 'integer'` in their definitions rather than in the output table.
- Finding messages: their wording, generated from the rule or the run.

## Development steps

Each step keeps the analysis sound, so it can land and be used at any point. The corpus measures progress: how many of the 154 cases give exactly their expected findings.

1. **Shape and walk skeleton.** The new result types and the `numbers` option (accepted, no effect yet). The walk over the compiled tree, with scopes (vars, element bindings, fragment bodies), passing children's failures up for every delivery mode (rule 3, conservatively) and applying fallbacks (rule 6), with today's timeout logic carried into the new shape. Every operator node gets one placeholder finding, `operator-failure`, may. A fragment call gets none, since it fails on nothing of its own: it reports its body's findings, the placeholders included, and its arguments' (see "Fragment calls"). The soundness test is added, and test/authoring\*.test.ts move to the new shape. Result: today's precision, reported per node, with `covered`.
2. **Types between nodes** (rules 1, 2 and 7 without declarations). The internal representation of what is known about a value. Inputs with defaults and the null rules in the engine's order; outputs from `returns`, null propagation and fallbacks; `$data` as `any`, `$element` from the input's elements, `$index` an integer, `$vars` from their definitions, `$params` from the fragment's declarations, analysed per call. The subset type check, giving real `type-check` findings. The placeholder finding stays.
3. **Declared rules** (rule 5). The rule types and their no/maybe/yes evaluation, the core table in `./authoring`, `external` for the I/O operators and undeclared host operators, the host field and its check in `defineOperator()`. The placeholder finding goes; the `numbers` option takes effect. The rule checker is added.
4. **Output declarations** (rule 7). The output types and the core output table.
5. **Running nodes** (rule 4). First, nodes whose inputs are all known: folding, certain failures, and the short-circuits. Then stand-ins for non-eager parameters, and one of a few known values, ruling out unused children.
6. **Timeouts.** The all-or-nothing rule and the no-I/O case.
7. **Close-out.** v3-authoring.md's `fallbackCoverage` section replaced by this spec, README, docs-dev/imports.md sizes, CHANGELOG, the cases page regenerated, #217 closed.

## To resolve

Raised by the rule checker at step 3, and left open until decided. Until then, the checker and the corpus's strict-numbers case fail on them.

1. **Strict numbers at the result boundary.** The engine refuses a non-finite number at every operator node's result boundary (`normalizeResult` in src/evaluate/operator.ts), so under `numbers: 'strict'`, where data can carry NaN or Infinity, any node that can return a number may fail `non-finite-result`. That includes arithmetic overflow, `floor`, `ceil` and `abs` of NaN, and every operator that passes a value through: `if`, `match`, `get`, `find`, `min` and `max` through `nullValueDefault`, `regex` through `noMatchDefault`, and `convert(NaN, 'number')`. Per-operator `overflow` rules cannot capture the pass-through cases. Recommended: under `strict`, any operator node whose output can include a number gets a `may` `non-finite-result` finding unless a rule already gives one, a generic check like the type checks. The `overflow` rules, and the `overflow` field of `FailureRule`, then add nothing and go. Step 4's output declarations make it precise, and step 5's runs drop it for nodes whose inputs are all known.
2. **`regex` declares the wrong `returns`.** Its `noMatchDefault` is typed `any` and returned as it is in `extract` mode, yet `regex` declares `returns: ['boolean', 'string', 'array', 'null']`, so `{ $regex: { …, mode: 'extract', noMatchDefault: 5 } }` returns a number its `returns` excludes. That breaks the trust in `returns` (see "Known limits") for a core operator, and point 1 cannot see NaN passing through `regex`. Recommended: `returns: 'any'`, with step 4's output declaration giving the precision back. It is an engine change: it widens what `validate()`'s feeding check accepts, since a `regex` feeding a number parameter is a static error today. The alternative, narrowing `noMatchDefault`'s type, breaks expressions that work today.
