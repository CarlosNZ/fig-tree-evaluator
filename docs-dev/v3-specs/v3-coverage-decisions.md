# FigTree v3 — Fallback coverage decisions

_Working document (Claude, October 2026): the decisions made with Carl while designing the more precise `fallbackCoverage` of [#217](https://github.com/CarlosNZ/fig-tree-evaluator/issues/217). The inventory they rest on is [v3-failure-inventory.md](v3-failure-inventory.md). Each entry records what was decided and why; what is still open is at the end._

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

## Open

- **Where the analysis's own options sit.** `fallbackCoverage`'s options hold only `timeout` today, which stands in for an option the host passes to `evaluate()`. The number setting is the first option belonging to the analysis itself. How the two kinds are kept apart is deferred.
- **The level names** for the number setting.
- **The declaration vocabulary**, the next step: failure conditions, narrowed output types, and the pure-and-deterministic flag, and where a host operator declares them.
- **A data shape**, floated and not taken up: a host passing the shape of its evaluation data, so that a `$data` reference has a type rather than `any`.
