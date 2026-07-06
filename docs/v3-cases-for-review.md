# FigTree v3 — cases for group review

*Register of ambiguous or controversial rulings encountered during the design passes — above all the **absence / failure / default gradient**: for each edge case, does it yield `null`, fire `fallback`, or error? Each case is recorded with its current provisional ruling so drafting can continue without re-litigating per pass; the whole set is adjudicated **together, at the end of the per-operator parameter passes** — interlocking calls like these are easier to judge as a group than one at a time.*

**Protocol**: a case listed here is **provisional even where its host section is marked Agreed** — listing here overrides the status marker for that specific ruling. At the group review each row is confirmed or flipped, outcomes flow back into the spec docs, and the row is marked resolved. A flip that contradicts one of the fixed points below must restate that rule, not silently except it.

## Fixed points the rulings derive from

The currently-agreed foundations. The group review may reopen them deliberately — but flipping one reshapes every row derived from it, so they're listed for visibility:

1. **Absence is not failure**: a missing `$data` path yields `null` (never throws, absent `strictDataPaths`); `fallback` triggers on node *failure* only. (References § Absence semantics; Node grammar § `fallback` semantics)
2. **Null policies are per-parameter metadata** from a fixed vocabulary — `propagate` / `value` / `reject` — with `propagate` the default for value inputs. (Type § Null policy)
3. **Null at an optional parameter means unset**, unless the declared type includes `null`. (Type § Optional parameters)
4. **Empty aggregate input is an error**, excepted only where the identity element is unique and type-stable (`and` / `or` / `firstOf`). (Type § Aggregates; the generating rule from the `and`/`or` pass, batch 1)

## The case matrix

`F` = the value of a `fallback` on the node (or an `operatorDefaults` default fallback).

| # | Case | No `fallback` | With `fallback: F` | Status |
|---|---|---|---|---|
| 1 | `{ $if: { condition: false, then: X } }` — no `else` | `null` | `null` — success; fallback ignored | provisional (batch 1) |
| 2 | `{ $plus: [] }` — empty aggregate, literal or dynamic | error | `F` | provisional (Type area agreed; batch 3 will restate) |
| 3 | `{ $plus: [null, 5] }` — null operand (e.g. a missing `$data` path) | `null` — propagate; success | `null` — fallback ignored | provisional (batch 3 pending) |
| 4 | `{ $and: [] }` / `{ $or: [] }` | `true` / `false` — vacuous identity | same — success | agreed in discussion (batch 1); listed for the group view |
| 5 | `firstOf` — all candidates `null`, or empty input | `null` | `null` — success | provisional (batch 1) |
| 6 | `firstOf` — a candidate **fails** (as opposed to yielding null) | node fails | `F` | provisional (batch 1) — leaning confirm |
| 7 | `match` — no branch matches, no `default` | error | `F` | provisional (batch 1) |
| 8 | `match` — `value` evaluates to `null` | matches no branch → `default`, else error | `F`, when no `default` | provisional (batch 1) |
| 9 | `{ $not: { $greaterThan: ['$data.age', 18] } }` — `age` missing, inner node propagates `null` | `true` — null is falsy, negation affirms | `true` — success throughout; fallback ignored | provisional (batch 2) — `not(null)` → `true` flagged for reconsideration |

Rows 2 vs 3 are the sharpest contrast in the set and the reason this register exists: an *empty* sum is a failure a fallback can catch, while a sum with a *null operand* succeeds as `null` and the same fallback does nothing. Both follow from the fixed points; whether the composed behaviour is the desirable one is exactly the group-review question.

## Notes & live alternatives, by row

1. **`if` with no `else`** — current rule: an unmet condition is success-with-null (fixed point 1); "value when unmet" is what `else` is for. Alternatives: (a) missing `else` + falsy condition = *failure*, so `fallback` fires — blurs fixed point 1; (b) `else` required (v2 behaviour) — kills the null-gradient convenience.
2. **`plus` empty** — alternatives: an identity value — but which? `plus` is mode-polymorphic (`0` / `""` / `{}`), the ambiguity behind v2's empty-aggregate roulette; this is why the vacuous-identity carve-out (fixed point 4) excludes it. Host remedy under the current rule: `operatorDefaults: { plus: { fallback: 0 } }` (Options § reserved-modifier extension).
3. **`plus` with a null operand** — current: `propagate` (fixed point 2's default for value inputs). Alternatives: (a) `reject` — a null operand is a *failure*, so a fallback **can** catch it (strict sums, one gradient tool instead of two); (b) skip-null — sum the present operands (→ `5`), SQL-aggregate style, but silently changes arity; (c) an explicit parameter (`nullValue: 0`-style) — pushes the choice to authors, grows every signature. Author remedy under the current rule: wrap operands — `{ $firstOf: ['$data.a', 0] }`.
4. **`and` / `or` empty** — vacuous identity per the quantifier reading ("all of these are true" holds over zero elements), agreeing with `every` / `some` (batch 5 constraint). Alternative: error — rejected in discussion; dynamic condition lists legitimately have zero elements.
5. **`firstOf` exhausted** — `null` is the contract: it's the absence tool, and "nothing was there" is a total answer. Alternative: error when exhausted — would collapse absence into failure and make `firstOf` + `fallback` the defaulting idiom.
6. **`firstOf` failing candidate** — current: skips nulls, *not* errors (fixed point 1's boundary); the demotion recipe is a per-candidate fallback: `{ $firstOf: [{ $http: …, fallback: null }, 'default'] }`. Alternative: failures count as absence and are skipped — the resilient-backup-chain reading, attractive for exactly the `firstOf` use case, but it makes `firstOf` a silent try/catch and swallows real errors. Worked example for the review: `{ $firstOf: [{ $http: '…/primary' }, { $http: '…/backup' }] }` with the primary *down* (error, not null) — current rule: the node fails and the backup never fires, unless the primary carries `fallback: null`; skip-errors alternative: the backup fires automatically. Carl leaning confirm on the current rule (July 2026); kept for the group pass.
7. **`match` no-match** — current: error, keeping typo-loudness (v2 parity — a missed branch is likelier an authoring error than a data condition); `default` is the sanctioned soft path. Alternative: `null` on no-match (soft by default, consistent with `find`'s expected no-match-→-null).
8. **`match` null value** — current: null matches *no* branch (deliberately not the `""` branch key, even though the stringification table renders null as `""` — that near-miss is worth a loud note somewhere). Alternatives: (a) runtime type error on a null match value; (b) let it match a literal `"null"` branch key (rejected out of hand — stringly spooky).
9. **`not` over a propagated null — absence becomes affirmative.** The composed behaviour of two agreed rules: ordering comparisons propagate a null operand (fixed point 2), and FigTree truthiness reads `null` as falsy (Type § Truthiness), so `not(null)` → `true`. The trap: `{ $not: { $greaterThan: ['$data.age', 18] } }` with `age` missing yields `true` — "age unknown" silently becomes "definitely not greater" — while the direct complement `{ $lessThanOrEqual: ['$data.age', 18] }` yields `null`, which stays falsy downstream. Current mitigation is doc guidance recorded in batch 2: *negate a comparison with its complement operator, never `$not`*. Live alternative, flagged by Carl (July 2026): flip `not.value` from truthiness (`value` policy) to `propagate`, making `not` absence-transparent — `not(null)` → `null` — which defuses the trap and makes `$not`-wrapping safe. Costs: `not` no longer always returns an actual boolean (the Type-area "actual booleans, never operands" rule gains an exception), and the blessed is-unset idiom `{ $not: '$data.x' }` breaks precisely on the missing-path case it exists for (null would propagate through as falsy instead of reading `true`, while `0`/`""`/`false` still read `true` — a half-working test, the worst kind) — presence testing would fall back to `{ $equal: ['$data.x', null] }`. Interlock: a flip also relaxes the negate-via-complement rule, removing the strongest structural argument for keeping `notEqual` (which would then rest on frequency and the `!=` idiom alone).

## Known future entries

Flagged in the Type area or earlier passes; each gets a row when its batch drafts:

- `join` — null elements: render `""` (delimiter kept) vs skip element-and-delimiter (batch 4).
- `find` — no match: `null` vs error (batch 5).
- `buildObject` — null-valued entries: keep the key vs drop it (batch 6).
- `get` — missing path vs stored `null`, and the `default` parameter's null opt-out (batch 6; largely settled in References, listed for the group view).
- `http` — null `body`: no body vs a literal JSON `null` payload (batch 8).
- `http` — null values in `query`: omit the parameter vs `?x=null` (batch 8).
