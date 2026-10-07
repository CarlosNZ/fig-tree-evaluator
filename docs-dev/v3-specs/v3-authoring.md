# FigTree v3 — Authoring analyses (`./authoring`)

_Working document (Claude, October 2026), from the [#209](https://github.com/CarlosNZ/fig-tree-evaluator/issues/209) discussion with Carl. Built: this records what the subpath promises, and why it is shaped as it is. Packaging mechanics are in "`./authoring`" in [v3-packaging.md](v3-packaging.md)._

## Purpose

`fig-tree-evaluator/authoring` holds static analyses that answer an authoring question about an expression and have no bearing on evaluation. Nothing in the engine imports it, so `evaluate()` never pays for these checks, however thorough they become, and they can be refined without weighing runtime cost. A host uses them in CI over its stored expressions, and an editor uses them to mark what needs attention.

Its first analysis is `fallbackCoverage`. The engine's existing warnings also have no runtime role, but moving them here was measured and not worth it ([#214](https://github.com/CarlosNZ/fig-tree-evaluator/issues/214)): about 1.7 kB brotli and no meaningful compile time, against moving or splitting `validate()`. The placement rule from there: an authoring-only check that needs its own pass, or is expensive, starts here; a check that is a few lines on a walk the engine already does stays in the engine.

## `fallbackCoverage`

```ts
import { fallbackCoverage } from 'fig-tree-evaluator/authoring'

await fallbackCoverage(fig, expression) // → { uncovered, covered }
await fallbackCoverage(fig, expression, { strictNumbers: true })
```

The question it answers: **which failures can reject an evaluation, and which fallback catches each?** That is what a host relying on fallbacks for resilience needs to know (there is no report mode, [#208](https://github.com/CarlosNZ/fig-tree-evaluator/issues/208)): one uncaught failure anywhere rejects the whole `evaluate()`.

- **`uncovered`** lists the failures nothing catches, each where it starts, so each can reject `evaluate()`. CI checks that it is empty.
- **`covered`** lists the failures a fallback catches, each with the fallback that does, for tools that show where fallbacks do their work.
- **Options** are the instance's: it answers as the instance would evaluate the expression, under its `timeout` and `strictDataPaths`. Its one option of its own is `strictNumbers`.
- **An invalid expression reports its static errors.** It never runs: `evaluate()` refuses it before anything starts. So every static error is `uncovered`, with certainty `always`, nothing is `covered`, and nothing is walked ("Static errors" in [v3-fallback-coverage.md](v3-fallback-coverage.md), [#232](https://github.com/CarlosNZ/fig-tree-evaluator/issues/232)).
- The expression compiles through `fig.compile()`, so it shares the compile cache with `evaluate()`. Unlike `validate()`, which stays out of the cache, it is called once per committed edit rather than per keystroke, and a cache miss only ever costs a recompile.

How it works is specified in [v3-fallback-coverage.md](v3-fallback-coverage.md), built in [#217](https://github.com/CarlosNZ/fig-tree-evaluator/issues/217): which nodes can throw and why, the failure rules and output declarations operators carry, the nodes it runs, value ranges, per-element walks and timeouts. It replaced the version first specified here, which took every operator node to be able to throw and listed only top-level values.

## Why not `validate()`

`validate()` used to return `timeoutShielded`, surfaced for the editor as a badge. It answered only the timeout question, and only as one flag, so the badge could say an expression was unshielded but not which value made it so. The coverage question has no runtime role either, so rather than widen `validate()` it moved here, where it can grow without cost to evaluation. `validate()` returns `{ valid, issues }`. `timeoutShielded` stays as the compiled artifact's flag, which timeout assembly reads, and in `inspect()`'s report.
