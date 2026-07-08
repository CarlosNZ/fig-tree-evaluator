/**
 * The `FigTree` class — Phase-2 shell ("new FigTree(options?) … construct;
 * registration-time validation throws here" in
 * docs-dev/v3-specs/v3-evaluator-methods.md).
 *
 * Construction assembles the instance registry via `buildRegistry()` and
 * throws `FigTreeError` (code `invalid-options`) on any bad input — the
 * loud-at-registration posture. No evaluation until Phase 4; `updateOptions`
 * and the full options merge semantics land in Phase 8 and re-run the same
 * registry assembly. Non-registry options are stored untouched — nothing in
 * the spec makes them construction errors yet.
 */
import type { FigTreeOptions } from './options'
import type { ValidatedOperatorDefinition } from './operatorDefinition'
import { buildRegistry, type OperatorRegistry } from './registry'

/**
 * The registry when `operators` is omitted. NOTE Phase 4: becomes
 * `coreOperators` — the spec default is "coreOperators only", which does not
 * exist until the first operator batch lands. This constant is the one swap
 * point.
 */
const DEFAULT_OPERATORS: ValidatedOperatorDefinition[] = []

export class FigTree {
  // `protected` (not private) only until Phase 3 gives the class its first
  // reader — noUnusedLocals rightly flags never-read private fields. Flip to
  // private when parse/validate land.
  protected readonly registry: OperatorRegistry
  protected readonly options: FigTreeOptions

  constructor(options: FigTreeOptions = {}) {
    this.registry = buildRegistry({
      operators: options.operators ?? [DEFAULT_OPERATORS],
      ...(options.operatorDefaults !== undefined
        ? { operatorDefaults: options.operatorDefaults }
        : {}),
    })
    // Per-key shallow snapshot; the two-level merge semantics are Phase 8
    this.options = { ...options }
  }
}
