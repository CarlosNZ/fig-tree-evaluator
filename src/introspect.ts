/**
 * The introspection snapshots ("Introspection & housekeeping methods" in
 * docs-dev/v3-specs/v3-evaluator-methods.md; "Introspection:
 * `getOperators()`" and "The snapshot shape" in
 * docs-dev/v3-specs/v3-operator-contract.md).
 *
 * Three reads of what earlier phases already computed, assembled here so
 * the FigTree methods stay one line each: the operator and fragment
 * snapshots, and the reshape of an artifact's dependency record into the
 * public `Dependencies` shape. All are plain data — nothing invocable,
 * nothing live, and nothing branded but for one carve-out: a parameter
 * `default` may be the public `EvaluationData` sentinel, which is a symbol
 * (see `ParameterInfo`).
 */
import type { ArtifactDependencies } from './parse'
import { WILDCARD, type PathSegment } from './primitives'
import {
  VALIDATED_OPERATOR,
  type ValidatedOperatorDefinition,
  type ValidatedParameter,
} from './operatorDefinition'
import type { OperatorRegistry } from './registry'
import type { FragmentParameter } from './fragments'
import type { Issue } from './issues'

/** What an expression reads and invokes ("getDependencies()" in the spec). */
export interface Dependencies {
  data: {
    /** Statically-known `$data` paths, deduplicated, traversal-sorted. */
    paths: string[]
    /**
     * True when the read-set is not statically enumerable: a computed
     * `get` path, a bare `$data`, or a dynamic-arguments fragment call.
     * Known paths are still listed beside it.
     */
    dynamic: boolean
  }
  /** Canonical operator names invoked, in discovery order. */
  operators: string[]
  /** Fragments called, in discovery order. */
  fragments: string[]
}

/**
 * Traversal order: a parent precedes its children and a subtree stays
 * contiguous. Alphabetical would coincide for simple keys — `.` sorts
 * below every letter — but breaks wherever the spelling is not a plain
 * key: `orders[10]` sorts before `orders[2]` as text, a sibling holding a
 * character below `.` (`user-id`) wedges itself inside the `user` subtree,
 * and `[*]` lands wherever `*` happens to fall. Comparing segments
 * sidesteps all three, and the record holds them, so nothing is re-parsed.
 */
const compareSegmentPaths = (a: PathSegment[], b: PathSegment[]): number => {
  const shared = Math.min(a.length, b.length)
  for (let i = 0; i < shared; i++) {
    const left = a[i]
    const right = b[i]
    if (left === right) continue
    const byClass = segmentClass(left) - segmentClass(right)
    if (byClass !== 0) return byClass
    if (typeof left === 'number' && typeof right === 'number') return left - right
    return (left as string) < (right as string) ? -1 : 1
  }
  // One is a prefix of the other: the parent comes first
  return a.length - b.length
}

/** Wildcard, then indices, then keys — the order within one position. */
const segmentClass = (segment: PathSegment): number =>
  segment === WILDCARD ? 0 : typeof segment === 'number' ? 1 : 2

/**
 * The artifact's record as the public shape. `paths` sorts the record's
 * entries by their segments and reports their keys, which are already the
 * canonical renders — nothing is rendered here. `operators` and
 * `fragments` keep the order the parse walk collected them in, which is
 * what the recording sets give — the asymmetry is deliberate (a path set
 * is what a host diffs between runs, the other two are for display and the
 * capability probe).
 */
export const toDependencies = (dependencies: ArtifactDependencies): Dependencies => ({
  data: {
    paths: [...dependencies.dataPaths]
      .sort(([, a], [, b]) => compareSegmentPaths(a, b))
      .map(([key]) => key),
    dynamic: dependencies.dynamic,
  },
  operators: [...dependencies.operators],
  fragments: [...dependencies.fragments],
})

/**
 * One parameter as `getOperators()` reports it: the validated declaration,
 * every documented default already filled by `defineOperator()`, plus the
 * instance override where `operatorDefaults` supplies one.
 *
 * `default` travels as authored, which includes the `EvaluationData`
 * sentinel (`get.from` declares it). That is a symbol: it survives a
 * structured clone and compares by identity against the package's export,
 * but JSON drops symbol-valued keys, so a consumer serializing the
 * snapshot must translate it first or the parameter reads as "optional,
 * no default" on the far side.
 */
export interface ParameterInfo extends ValidatedParameter {
  /**
   * What `operatorDefaults` set for this parameter. Present ONLY when
   * there is an override — `null` is a legitimate one, so a consumer must
   * read presence, not value. Never merged over `default`: a tool has to
   * be able to tell what the operator declares from what this host set.
   */
  instanceDefault?: unknown
}

/**
 * One operator as `getOperators()` reports it: the declarative half,
 * verbatim and total. Derived from the validated definition rather than
 * re-declared, so a field added there is a compile error here until the
 * snapshot carries it. The exclusions are the contract's own: the brand
 * (a snapshot must not satisfy `isValidatedOperator`), the two functions
 * (`validate` travels as a flag, `evaluate` not at all) and the two
 * engine-internal derivations, `deliversLazily` and `parameterEntries`.
 * `parameters` is re-declared only to widen its value to `ParameterInfo`.
 */
export interface OperatorInfo extends Omit<
  ValidatedOperatorDefinition,
  | typeof VALIDATED_OPERATOR
  | 'evaluate'
  | 'validate'
  | 'deliversLazily'
  | 'parameterEntries'
  | 'parameters'
> {
  parameters: Record<string, ParameterInfo>
  /** The `validate` hook, as a flag — the function itself never travels. */
  hasValidate: boolean
  /**
   * What `operatorDefaults` set for this operator's `useCache` — that
   * modifier alone. The blanket `useCache` option is deliberately not
   * folded in: it is not a per-operator fact, and folding would make one
   * `instance*` key mean two sources where every other means one. The
   * full chain a consumer composes is
   * `node key ?? instanceUseCache ?? getOptions().useCache ?? useCache`.
   */
  instanceUseCache?: boolean
  /**
   * What `operatorDefaults` set as this operator's fallback. No
   * definition-level counterpart exists — `fallback` is a node grammar
   * key, not a declaration.
   */
  instanceFallback?: unknown
}

/** One fragment as `getFragments()` reports it. The body is withheld. */
export interface FragmentInfo {
  name: string
  description?: string
  metadata?: Record<string, unknown>
  parameters: Record<string, FragmentParameter>
  /**
   * The body's warning-severity issues, raised when it was registered.
   * Registration throws on errors, which leaves warnings with no other
   * channel, and a calling expression's `validate()` deliberately never
   * replays them.
   */
  warnings: Issue[]
  /**
   * What the body reads and invokes, rolled up at registration. Reported
   * because withholding the body otherwise makes the question
   * unanswerable from the public surface: `getDependencies()` takes an
   * expression, and the body is the one thing a host never gets back.
   */
  dependencies: Dependencies
}

/**
 * The operator snapshot, in registration order — stable and
 * author-controlled. No sorting: grouping a listing by `category` is the
 * consumer's job, done from data this hands it.
 *
 * Copy posture, three tiers. A fresh array and fresh operator/parameter
 * objects every call, so a caller may reassign any field with no effect on
 * the registry — they are synthesized anyway to carry the override keys.
 * Below that, the deep-frozen structures (`type`, compiled policy tables,
 * `constraints`, `replacesNullAt`, `positionalParams`, `returns`) are
 * shared safely, and `metadata` bags and `default` values knowingly: those
 * are host-owned and left unfrozen by `defineOperator()`, copying is
 * unavailable for data that may hold a function, and it would break an
 * identity comparison a host may rely on. So the rule is documented, not
 * enforced — don't mutate a metadata bag or a default value after
 * registering it.
 */
export const operatorSnapshot = (registry: OperatorRegistry): OperatorInfo[] =>
  [...registry.operators.values()].map((entry) => {
    const { definition, instanceDefaults } = entry
    const info: OperatorInfo = {
      name: definition.name,
      category: definition.category,
      description: definition.description,
      parameters: parameterSnapshot(definition.parameters, instanceDefaults),
      restParam: definition.restParam,
      timeoutParam: definition.timeoutParam,
      useCache: definition.useCache,
      cache: definition.cache,
      returns: definition.returns,
      hasValidate: definition.validate !== undefined,
    }
    if (definition.alias !== undefined) info.alias = definition.alias
    if (definition.metadata !== undefined) info.metadata = definition.metadata
    if (definition.positionalParams !== undefined)
      info.positionalParams = definition.positionalParams
    // Presence by `hasOwn`, never by value: an override OF null is a real
    // override, and "degrade to null" is the common fallback
    if (instanceDefaults !== undefined) {
      if (Object.hasOwn(instanceDefaults, 'useCache'))
        info.instanceUseCache = instanceDefaults.useCache as boolean
      if (Object.hasOwn(instanceDefaults, 'fallback'))
        info.instanceFallback = instanceDefaults.fallback
    }
    return info
  })

/**
 * Parameter targets and the two modifier pseudo-keys share one
 * `operatorDefaults` entry, and reading them apart needs no disambiguation:
 * `fallback` and `useCache` are reserved parameter names (src/names.ts), so
 * no declaration can collide with either.
 */
const parameterSnapshot = (
  parameters: Record<string, ValidatedParameter>,
  instanceDefaults: Readonly<Record<string, unknown>> | undefined
): Record<string, ParameterInfo> => {
  const snapshot: Record<string, ParameterInfo> = {}
  for (const [name, parameter] of Object.entries(parameters)) {
    const info: ParameterInfo = { ...parameter }
    if (instanceDefaults !== undefined && Object.hasOwn(instanceDefaults, name))
      info.instanceDefault = instanceDefaults[name]
    snapshot[name] = info
  }
  return snapshot
}

/**
 * The fragment snapshot, same posture and same order. The body
 * `expression` is deliberately absent — fragments are the host's own
 * registrations, and the editor consumes the declaration surface. The
 * `nodeCount` / `maxDepth` rollups are absent too: they exist to compose
 * limits through a call site, which the call site's own artifact already
 * answers.
 *
 * No `instance*` keys here, because `operatorDefaults` keys must name a
 * registered operator — a fragment name is an `unknown-operator` error at
 * construction.
 */
export const fragmentSnapshot = (registry: OperatorRegistry): FragmentInfo[] =>
  [...registry.fragments.values()].map((entry) => {
    const info: FragmentInfo = {
      name: entry.name,
      parameters: Object.fromEntries(
        Object.entries(entry.parameters).map(([name, parameter]) => [name, { ...parameter }])
      ),
      warnings: [...entry.warnings],
      dependencies: toDependencies(entry.dependencies),
    }
    if (entry.description !== undefined) info.description = entry.description
    if (entry.metadata !== undefined) info.metadata = entry.metadata
    return info
  })
