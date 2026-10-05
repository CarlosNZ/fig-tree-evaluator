# FigTree v3 — Authoring analyses (`./authoring`)

_Working document (Claude, October 2026), from the [#209](https://github.com/CarlosNZ/fig-tree-evaluator/issues/209) discussion with Carl. Built: this records what the subpath promises, and why it is shaped as it is. Packaging mechanics are in "`./authoring`" in [v3-packaging.md](v3-packaging.md)._

## Purpose

`fig-tree-evaluator/authoring` holds static analyses that answer an authoring question about an expression and have no bearing on evaluation. Nothing in the engine imports it, so `evaluate()` never pays for these checks, however thorough they become, and they can be refined without weighing runtime cost. A host uses them in CI over its stored expressions, and an editor uses them to mark what needs attention.

Its first analysis is `fallbackCoverage`. The engine's existing warnings also have no runtime role, but moving them here was measured and not worth it ([#214](https://github.com/CarlosNZ/fig-tree-evaluator/issues/214)): about 1.7 kB brotli and no meaningful compile time, against moving or splitting `validate()`. The placement rule from there: an authoring-only check that needs its own pass, or is expensive, starts here; a check that is a few lines on a walk the engine already does stays in the engine.

## `fallbackCoverage`

```ts
import { fallbackCoverage } from 'fig-tree-evaluator/authoring'

fallbackCoverage(fig, expression) // → { uncovered: NodePath[] }
fallbackCoverage(fig, expression, { timeout: 50 })
```

The question it answers: **is each top-level value covered by a fallback that cannot itself throw?** That is what a host relying on fallbacks for resilience needs to know (there is no report mode, [#208](https://github.com/CarlosNZ/fig-tree-evaluator/issues/208)): one uncaught failure anywhere rejects the whole `evaluate()`.

- **`uncovered`** lists the top-level values that may throw with no fallback to catch them, in tree order. Each entry is a place a `fallback` belongs, and adding one there covers everything under it. An empty list means every top-level value is covered.
- **Options** are the instance's, with the call's laid over them and checked as `evaluate()` checks them. Two bear on the answer: `strictDataPaths`, and `timeout`. The optional `timeout` argument stands in for a timeout the host passes to `evaluate()` per call, which the instance cannot know of.
- **Meaningful for a valid expression only.** An invalid expression never runs: `evaluate()` throws its static error, which `validate()` reports. Invalid nodes are listed, but an error inside a covered value is not, so a host checks `valid` and `uncovered` together.
- The expression compiles through `fig.compile()`, so it shares the compile cache with `evaluate()`. Unlike `validate()`, which stays out of the cache, it is called once per committed edit rather than per keystroke, and a cache miss only ever costs a recompile.

## The rules

A **top-level value** is a hole of the compiled expression: a computed value at the root, or one inside the root's plain data. When the root is itself an operator node there is one, the root.

**Every operator node and fragment call is taken to be able to throw.** There is no model of which operators can fail on what (see "Deferred"), so the only thing that covers a node is a fallback on it or above it, and an inner fallback never covers the node above it: in `{ $plus: [{ $divide: […], fallback: 0 }, 1] }`, `plus` itself can still throw. That is why only top-level values are listed.

### Without a timeout

A plain object holds no fallback, so a nested plain object carrying `vars` is walked through, with its vars in scope, and each of its values is listed by its own path. Otherwise a value is listed when it may throw:

| Node                          | May throw when                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a constant                    | never                                                                                                                                                                                                                                                                                                                       |
| an invalid node               | always                                                                                                                                                                                                                                                                                                                      |
| a `$data` reference           | `strictDataPaths` is on and the reference drills (`$data.x`, not bare `$data`)                                                                                                                                                                                                                                              |
| a `$vars.x` reference         | x's definition may throw, in the scope it was declared in; or strict is on and the reference drills past x. An unresolved var always                                                                                                                                                                                        |
| a `$params` reference         | always: a fragment body is analysed once, apart from any call's arguments                                                                                                                                                                                                                                                   |
| `$element`, a renamed binding | strict is on and the reference drills. `$index` never                                                                                                                                                                                                                                                                       |
| plain data                    | any value in it may throw                                                                                                                                                                                                                                                                                                   |
| an operator node              | its fallback may throw; or it has none, and its operator has no `operatorDefaults` fallback (that value is returned as it is, never evaluated, so it cannot throw)                                                                                                                                                          |
| a fragment call               | its fallback may throw. With none: a call to an unknown fragment always; a static call when its body may throw, by these same rules (a body root covered by a safe fallback covers the call); a dynamic call always, since its arguments object is evaluated and checked before the body runs, outside the body's fallbacks |

So a fallback covers when it is a constant or a reference, or plain data holding only those, or an operator node with a covering fallback of its own. `fallback: { $get: 'backup' }` does not cover: `get` is an operator node, and taken to be able to throw.

Scopes follow the runtime: an operator node's or call's `vars` are in scope for its parameters, arguments and fallback, and a plain object's for its values. A var cycle is already a static error, and a guard ends the analysis there.

### Under a timeout

Nothing runs after the deadline, so a top-level value is covered only by a **constant** fallback, which a timeout splices in without running anything. That is exactly timeout shielding (fallback rule 3 in "fallback semantics" in [v3-api.md](v3-api.md)), reported value by value: a value is listed when the compiler found no constant fallback for it, its own, its operator's `operatorDefaults` one, or the one a fragment call lifts from its body's root. When nothing is listed, a timeout assembles the result rather than rejecting.

### Known consequences

- `{ $plus: [1, 2] }` is listed, although it cannot fail: there are no failure classes.
- Under a timeout, a reference at the top level is always listed, because timeout shielding never shields a reference (`timeoutFallbackFor` in src/compile/compile.ts) and so a timeout rejects such an expression. A reference has no fallback, so the fix is a `get` node with one. Whether shielding should treat a reference as finished is a separate question.
- A timeout is counted however quickly the expression would finish. A value doing no I/O settles before the deadline's timer can fire, so it cannot actually be cut off; the analysis does not look for I/O.

## Why not `validate()`

`validate()` used to return `timeoutShielded`, surfaced for the editor as a badge. It answered only the timeout question, and only as one flag, so the badge could say an expression was unshielded but not which value made it so. The coverage question has no runtime role either, so rather than widen `validate()` it moved here, where it can grow without cost to evaluation. `validate()` returns `{ valid, issues }`. `timeoutShielded` stays as the compiled artifact's flag, which timeout assembly reads, and in `inspect()`'s report.

## Deferred

From #209, until the false positives they would remove prove worth the complexity:

- **Failure classes.** Each operator would declare whether it never fails, fails only on bad input, or can fail whatever its input (`http`, `divide`). Then `{ $plus: [1, 2] }`, with constant arguments that pass the static checks, is safe, and an inner fallback can matter. An operator whose own code never fails can still fail the engine's type check on a typed parameter fed a computed value (`get.path`), so such a node would be safe only where every computed input lands in an `any` parameter. The classes would live in this subpath, as a table, rather than on the definitions.
- **Reasoning about children's types**: a computed input whose declared `returns` is a subset of the parameter's type cannot fail the type check, as `{ $multiply: [2, 3] }` feeding `plus`. Static, so still cheap.
- **The I/O refinement for timeouts**: only a value containing I/O (`http`, `sql`, `graphQL`, a host operator) needs a constant fallback.
