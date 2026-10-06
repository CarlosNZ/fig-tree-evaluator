# FigTree v3 — Fallback coverage decisions

_Working document (Claude, October 2026): the decisions made with Carl while designing the more precise `fallbackCoverage` of [#217](https://github.com/CarlosNZ/fig-tree-evaluator/issues/217). The inventory they rest on is [v3-failure-inventory.md](v3-failure-inventory.md), and the cases they are tested by are in [v3-coverage-cases.md](v3-coverage-cases.md). Each entry records what was decided and why; what is still open is at the end. The resulting design is specified in [v3-fallback-coverage.md](v3-fallback-coverage.md)._

## The walk (agreed 2026-10-05)

The analysis is a walk that gives every node a verdict (it can throw, or it cannot) and an output type.

1. **Post-order.** A node is decided after its children, so a recursive walk returns each child's verdict and type before its parent uses them.
2. **A child that can throw makes its node able to throw**, all the way up to the nearest fallback that cannot itself throw. That node is safe, and everything under it is covered. A covered child keeps its own verdict, so a tool can show both where a failure starts and where it is caught. The one exception is a failure the walk can prove never reaches the node: the untaken branch of an `if` with a constant condition, or an operand of `or` after a constant `true`.
3. **Subset, not exact match.** A child's output type must be a subset of what the parameter it feeds accepts. `integer` into `number`, `number` into `number | null` and anything into `any` are all safe.
4. **Null enters an output type only where the node can produce one**: by propagation, which the declarations give, or from a body that returns null (`get`, `firstOf`, `find`, `if` with no `else`). A parameter that uses a null, treats it as unset, or rejects it passes none on.
5. **A node with a fallback outputs its own type or the fallback's.** For its parent only that union matters.
6. **A node whose inputs are all known is evaluated,** by the engine, when its operator is safe to run at analysis time: pure and deterministic. That is every core operator except `http`, `graphQL` and `sql`, and a host operator only if it declares itself so. A node that reads the evaluation data (`get` without `from`) is not closed, whatever its parameters. A throw on known inputs is a certain failure.
7. **Output types are narrowed by the inputs** wherever the declared `returns` is wider than what a node can return ("Output types" in the inventory). That needs a richer type representation than `ExpectedType`: exact values for constants, element types for arrays, keys for objects.

## Number handling (decided 2026-10-05)

**Decision.** How strictly the analysis treats numbers is an option of the analysis, not of the evaluator: evaluation is unchanged, and only how strictly the analysis reads it varies. There are two levels, with names to settle:

- **Default: ordinary numbers.** Arithmetic stays in range, except where everyday inputs overflow, which means `power` (`10^400`, `1.05^15000`). Numbers in the evaluation data are finite, since JSON cannot carry NaN or Infinity.
- **Strict.** Any arithmetic node on numbers the walk cannot pin down may overflow: `plus`, `subtract`, `multiply`, `divide`, `modulo`, `round`. Any number from the data may be NaN or Infinity, so `floor`, `ceil` and `abs` may fail too.

The declarations do not depend on the setting. Each overflow condition is tagged by how reachable it is, from ordinary inputs (`power`'s) or only from extreme ones (`plus`'s), and the setting picks which count. Non-finite results that are not overflow count at both levels: `divide` or `modulo` by 0, `0^-1`, a negative base with a fractional exponent. So do constants, which are evaluated exactly.

**Why.** Counting every overflow would make every arithmetic node on unknown numbers one that may fail, so no arithmetic chain could prove safe without a fallback on each node. Every operator but `power` needs inputs near `1.8e308` to overflow, which real data almost never has. Some data does warrant the guarantee, though, and strict is there for a host that wants it. A string of named levels, rather than a boolean, leaves room for a third.

## Rules, not sampling (decided 2026-10-05)

**Decision.** The analysis uses declared rules for operators' own failures. Running a node over lists of sample values was considered and rejected for the analysis; sampling lives in the test suite instead, as the check that the declared rules are complete.

**Why.** For most nodes, a rule answers at once what sampling would need dozens of runs to find: `min` over 500 operands can only fail on its operands' types and on being empty, both static. Sampling's real strength is finding conditions nobody wrote down (it found `convert('Infinity')`, which the hand-written inventory missed), and that is a property of checking the rules, not of running the analysis. In CI its cost does not matter.

## Running a node when enough is known (decided 2026-10-05)

**Decision.** Beyond folding nodes whose inputs are all constant, the walk runs a node when its eager inputs are known, with stand-ins for its unknown lazy children, and once per value when an input is one of a few known values.

**Why.** It removes the one-off relations a rule vocabulary would otherwise need: `match`'s value against its branch keys, and `get`'s path against a literal `from`, are answered by running the node, so the rules only cover the unknown case. It also settles which lazy children a node can use, generically, from what the run asked for.

## The rules are generic (agreed 2026-10-05)

**Decision.** The walk applies seven rules to every operator node, none of them naming an operator ("The seven rules" in the spec). Per-operator knowledge is limited to two short declarations: failure rules (thirteen operators) and output types (fifteen).

**Why.** Behaviour that looks operator-specific, such as an `if` with a constant condition never using its other branch, comes from combining the generic rules with what the definition already declares: delivery modes, types, null policies, constraints.

## I/O is always external (agreed 2026-10-05)

**Decision.** `http`, `graphQL` and `sql` are never run and may always fail, whatever their parameters. Only a fallback covers them.

**Why.** Their verdict never depends on their parameters. Rules for their internal failures (a GET with a body, a missing endpoint) would only turn "may fail" into "always fails", which changes nothing about whether a node is covered.

**And their code (Carl, 2026-10-06, at step 3).** An external node gets one `operator-failure` finding, may, which stands for whatever code its own code throws. An I/O operator refuses some requests with `type-check` (a relative URL, a GET with a body, a composite query value, a row of the wrong shape), its own timeout with `request-timeout`, and a client or an undeclared host's body can throw any code at all, so no exact code could be promised. Rules for each would need test kinds for string prefixes and host options, and would still leave hosts needing the wildcard.

## Where the rules live (decided 2026-10-05)

**Decision.** Split by who writes them: the core operators' rules in a table in `./authoring`, keyed by the core definition; host operators' rules in an optional field on their definition, checked by `defineOperator()`. A host operator without the field is external.

**Why.** Definitions are shared by every instance, so the cost of carrying the rules on them is bundle size, not memory: about 0.6 kB brotli, paid by every consumer of the root whether or not it uses `./authoring`. Keeping that cost away from `evaluate()` is why the subpath exists. A host has nowhere more natural than its own definition, and the bytes are its own. The rule checker and a key test keep the separate core table from drifting.

## Fragment calls and their arguments (agreed 2026-10-05, at step 1)

**Decision.** A fragment call has no finding of its own: it reports its body's findings at itself, with `fragment` and `fragmentPath`, and its arguments' findings where the engine raises them. A static argument's failures, its declared type check included, keep the argument's own path and are caught by whatever catches the body's first read of `$params.x`. A dynamic call's arguments are checked before the body runs, at `parameters`, outside the body's fallbacks. A `$params` reference fails by itself only on a strict drill. The walk records each read of a parameter as a demand, which each call answers with its argument's findings, so a body is still walked once.

**Why.** It is what the engine does (src/evaluate/fragment.ts): an argument is a lazy, memoised thunk in the caller's frame, demanded by the body, so its failure travels up the body from the read. A placeholder at the call would be a finding at a place nothing fails, and the soundness test places every caught failure at its exact fallback, which only following the reads gets right: `safeRatio`'s root fallback catches its argument's type check.

## Strict numbers at the result boundary (decided 2026-10-06, at step 4)

**Decision.** The walk tracks, on each number it knows of, whether it may be NaN or infinite. Under `strict`, a number from the data may be; an operator returning a number may return one if a number it receives may be one; an output declaration carries one through an operator that hands a value on. A node whose result may be one may fail `non-finite-result` at the result boundary, unless a rule already says so, and what passes the boundary is finite. The `overflow` rules stay, for arithmetic on large finite numbers.

**Why.** The rule checker found that under `strict`, `if`, `match`, `get`, `find`, `min`, `max`, `regex`, `convert`, `floor`, `ceil` and `abs` all fail when handed NaN, because the engine refuses a non-finite result at every node. No per-operator rule describes that: it is the engine's check, like a type check. Of the options, flagging every number-returning node under `strict` was simpler but would have listed `{ $length: '$data.s' }`; dropping NaN from `strict` would have left a host passing JS data with no warning.

## Value ranges (taken up 2026-10-06, after step 4)

**Decision.** The walk gains value ranges, as step 6, after running nodes: bounds on numbers and minimum lengths, declared in the output declarations (the core table in `./authoring`, a host's `coverage.output`), with range arithmetic for the few operators that compute one. The failure rules read them through their existing tests.

**Why.** Without them the analysis lists failures that cannot happen whenever a value is known only by type: Carl's example, `{ $divide: [10, { $plus: [{ $length: '$data.s', fallback: 0 }, 1] }] }`, is reported as a possible division by zero. The spec had listed "no value ranges" as a known limit without the choice ever being put to Carl. Ranges were left out because they are a third kind of per-operator knowledge beside failure rules and output declarations; putting them inside the output declarations keeps it to two, and running nodes (step 5) already covers values known exactly, so ranges are what remains for values that are not.

## `fallbackCoverage` is async (Carl, 2026-10-06, at step 5)

**Decision.** `fallbackCoverage` returns a promise of the same `{ uncovered, covered }`.

**Why.** Running a node calls its own body, and eight pure core operators have async bodies: `firstOf`, `and`, `or`, `find`, `filter`, `map`, `some` and `every`, which read their children one at a time or as they settle. A synchronous analysis could run only the bodies that answer synchronously, so `or` with a constant `true`, `firstOf` stopping early and folding through an iterator would be lost, for a reason no author can see: `{ $if: [true, …] }` would be precise and `{ $or: [true, …] }` not. v3 is unreleased, so the signature is cheapest to change now.

## Running a node: the walk's own runner (agreed 2026-10-06, at step 5)

**Decision.** A run calls the operator's own body, on parameters `resolveInputs` resolves from exact values, through handles and streams the analysis owns, with a stand-in for each child whose value is not known. A child counts where a run reaches it, and its failure where a run's answer depended on it or the body handed it straight back. A body that waits on a stand-in makes the run inconclusive, and the node is then not run, except a synchronous body handing the stand-in's own promise straight back. A child that may fail is run failing as well as with its values. The details are in "Running a node" in the spec.

**Why.** The engine's node wrapper hides what a body does with each child, and its race delivery starts every operand, so "which stand-ins it asked for" would say `{ $or: [true, X] }` asks for X. A stand-in handing the body a placeholder value would be unsound wherever the body inspects it: `firstOf` would take a placeholder for a value that is not null and stop early. Running through the wrapper would also mean importing the engine's evaluator. The rule checker holds every run to the engine's evaluation, so the runner cannot drift from it.

## A child no run reaches reports nothing (Carl, 2026-10-06, at step 5)

**Decision.** A child that no run reaches reports neither its failures nor what its own fallbacks catch. A child a run reached, but whose failure no answer depended on (an operand a decider parked), reports only what its own fallbacks catch, since the engine did start it.

**Why.** `covered` shows where fallbacks do their work, and a fallback in a branch that never runs does none. Dropping only the uncovered findings would leave a branch never taken listed as protected.

## A body that does not settle (Carl, 2026-10-06, at step 5)

**Decision.** An async body still waiting 100 ms into a run is given up on: the node is analysed as if not run, by its rules and declared output, and its operator is not run again in that analysis. Declaring `coverage` also says the body settles from its parameters alone.

**Why.** A declared host body can wait on something the analysis never provides: a host's translation table loaded at startup, or a signal, which never aborts in a run. Without a limit, `fallbackCoverage` never resolves for any expression holding such a node, and an editor's coverage view stops updating with no error to say why. Giving up loses only precision, and remembering the operator keeps the cost to one wait per analysis. A synchronous body that never returns is beyond any guard, and would hang `evaluate()` the same way.

## Per-element walks as a step of their own (Carl, 2026-10-06, at step 5)

**Decision.** Walking an iterator's `each` once per element of a known `input` is step 7, after value ranges, not part of step 5.

**Why.** It is a mechanism the spec did not have, with a rule of its own for merging findings across elements: a finding certain for one element and absent for another is only possible at that node, since the node is reached for both. Its payoff is iterators over literal arrays, which are rare in real expressions; `{ $some: { input: [0, 1], each: { $divide: [1, '$element'] } } }` is the corpus case that needs it.

## Value ranges as built (Carl, 2026-10-06, at step 6)

**Decision.** Bounds sit on the walk's own members: a number's inclusive `min` and `max`, a string's or array's `minLength`; NaN and the infinities stay a member of their own. Members with different bounds stay apart in a union, and exact values past the limit widen to the range they span. The output vocabulary gains bounded fixed types, a `minLength` on `arrayOf`, an `otherwise` on `byParam`, and six arithmetic forms (`sum`, `product`, `difference`, `abs`, `min`, `max`) computed once in src/authoring/known.ts with the body's own operations in the body's order. `split` declares at least one piece except on an empty delimiter. `plus` with `expect` keeps `typeNamedBy`, and so loses its range. The test vocabulary gains no `{ above }`, and ranges do not answer `strict`'s overflow rules. The three range cases left "False positives the design accepts" for a "Value ranges" section of their own, with five more; two cases gained the `non-finite-result` a string of 618 characters gives, and the spread gained a string of 1100.

**Why.** Computing a bound with the same floating-point operations, in the same order, as the body is what makes the arithmetic sound without care for rounding: rounding never reverses an order. The spec's "split declares at least one element" was wrong for `split('', '')`, which is `[]`, hence `otherwise`. `expect` is rare, and answering the overflow rules from ranges would help only arithmetic on lengths, indexes and constants under `strict`. The rule checker's exact inputs test a range at single points only, so it also widens each value to a few ranges around it, and a test's answer on a range must be its answer on the value inside.

## An overflow is never certain (Carl, 2026-10-06, at step 6)

**Decision.** A rule marked `overflow` gives a `may` finding, never an `always` one, and so does `power`'s rule for a negative base with a fractional exponent. The rule checker checks that wherever the analysis says a node always fails, the engine fails.

**Why.** An overflow rule has no `when`, so under `strict` it answered yes, and on inputs that could not be null the finding was `always`. `always` tells the walk the node never returns, so its parent's own checks were skipped: under `strict`, `{ $divide: [1, { $subtract: [<a length never null>, 1] }] }` reported only `subtract`, while a length of 1 makes `divide` fail at the root. The check then found the same in `power`: its tests also pass an infinite base or exponent, and `(-2)^-Infinity` is 0, not NaN. Ranges made it reachable, since a base can now be known to be negative without being exact: `{ $divide: [1, { $power: [<a length never null, from -1 down>, -Infinity] }] }`, with `-Infinity` a constant a JS caller can write, reported only `power`, while a length of 1 makes `divide` fail at the root. A test cannot say "finite", so the rule is `may`. A `may` that should be `always` costs precision; an `always` that should be `may` costs soundness.

## Per-element walks as built (Carl, 2026-10-06, at step 7)

**Decision.** An `each` is walked once per element where its `over` parameter receives one exact array and the walks of one node stay within 16, counting the per-element walks it is nested in; otherwise it is walked once, with `$element` any of the elements. Each element's walk is a child of its own in a run: `each.evaluate(i)` and `each.settle()` deliver that element's outcomes, and `settle()` reaches every element at once, as the engine starts every one. A failure is `always` only where it is for every element a run reached, or every element where the node is not run. Vars are walked where their block is declared, with the bindings in force there, once for each walk of the block. `{ arrayOf: { param: 'each' } }` over an `each` walked per element is the elements' results in order. The corpus runner gains a certainty check from the trace, and the rule checker runs the iterators again per element.

**Why.** Only one exact array lines the walks up with the collection the body iterates. A literal with a computed element cannot be run, since its input is not exact, and walking it per position would almost never change a finding. 16 is the walk's exact-value limit, and multiplying through nesting bounds a nested walk's cost the same way. "Every element a run reached" rather than every element, since an element no run reaches reports nothing, so its missing finding says nothing about the node. It is the opposite of `report`'s "`always` if either": two rules on one node are two reasons it fails on one input, while two elements are two inputs. The tuple keeps what the walk already has: without it, a `max` over a `map` of a literal that is not run is listed as possibly empty. The certainty check is the only test a wrong merge fails: a wrong `always` on a node inside `each` changes only what is reported, which the soundness check does not read.

**Two soundness fixes, found while building it.** A fragment call took what escaped its body, and its arguments' failures, as its own, so a certain failure in a branch the body may skip made the call always fail, and its parents' checks were dropped: `{ $divide: [1, { $subtract: [{ $ratio: { a: { $if: ['$data.c', { $divide: [1, 0] }, 2] }, b: 2 } }, 1] }] }` missed the root's division by 0. And a var was walked with the bindings where it was read rather than where it was declared, so a var declared on an inner iterator, reading the outer element, read the inner one. Per-element walks needed the second fixed in any case, since a block inside `each` is walked per element.

## Timeouts as built (Carl, 2026-10-06, at step 8)

**Decision.** Whether a node can wait on something outside the evaluation travels up the walk beside its failures. An I/O operator can, and so can any host operator, declared or not. A node waits where such an operator is evaluated under it: through a var it reads, a fallback that can run, a fragment body, an argument the body reads. A child counts only where a run waited on it, not merely started it. Under a timeout, if anything can wait: where some top-level value lacks a constant fallback, each value lacking one is an uncovered `timeout` finding; where none does, each value that can wait is a covered `timeout` finding, covered by itself. If nothing can wait, a timeout adds nothing. The corpus runner evaluates every case with a timeout under it, checks the values it cuts off, and no longer lets an external finding stand for a timeout.

**Why.** The engine's deadline is a timer, which cannot fire while an evaluation is running on promises alone: a pure expression doing 33 ms of work finishes under a 1 ms timeout. So a host setting a timeout on its instance would otherwise see a `timeout` on nearly every value of every expression. A declared host body awaiting a timer was cut off in the same probe, so declaring `coverage` cannot exempt an operator: it says what a body fails on and returns, not how long it takes. A decider answers as soon as a known operand decides, and the engine does not wait for the operands it started (`{ $or: [true, { $http: 'https://x.test/a' }] }`, with a request taking 100 ms, returned in 2 ms), hence "waited on" rather than "reached", which needs one more set in a run. A covered `timeout` is a constant fallback doing its work, and the trace records it, so the runner could stop skipping those entries. That check found the runner's external wildcard matching a timeout at a request's own node, which hid a missing covered finding.

## Open

- **Where the analysis's own options sit.** `fallbackCoverage`'s options hold only `timeout` today, which stands in for an option the host passes to `evaluate()`. The number setting is the first option belonging to the analysis itself. How the two kinds are kept apart is deferred.
- **The level names** for the number setting.
- **A data shape**, floated and not taken up: a host passing the shape of its evaluation data, so that a `$data` reference has a type rather than `any`.
