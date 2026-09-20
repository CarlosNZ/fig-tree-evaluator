/**
 * The `FigTree` class ("The method surface at a glance" in
 * docs-dev/v3-specs/v3-evaluator-methods.md). Construction assembles the
 * instance registry via `buildRegistry()` and throws `FigTreeError` (code
 * `invalid-options`) on any bad input — the loud-at-registration posture.
 *
 * `validate()` and `evaluate()` share one spine: the same compile (parse +
 * static checks) and the same per-call limit checks; `validate()` returns
 * the issue stream, `evaluate()` refuses on the first error-severity issue
 * and evaluates the holes otherwise. Only `evaluate()` goes through the
 * parse cache; `validate()` compiles fresh every time, so its report always
 * costs a parse and the cache holds only what evaluation asked for.
 * `mode: 'report'` and `trace` land in Phase 12,
 * `timeout` in Phase 10 and the result cache in Phase 9 — those options
 * are accepted and inert until then.
 *
 * An instance's whole mutable world is one `InstanceState` record, swapped
 * atomically. The registry, the options and (from 8.2) the parse cache are
 * derived from each other, so they may only change together: an artifact
 * bakes in registry resolution, and a cache built against one registry
 * must never answer against another.
 */
import type { EvaluationOptions, FigTreeOptions } from './options'
import type { Issue, ValidationResult } from './issues'
import { buildRegistry, type OperatorRegistry } from './registry'
import {
  ParseCache,
  parseExpression,
  probeConstant,
  runStaticChecks,
  type ParseArtifact,
} from './parse'
import { copyOptions, createEvaluationContext, evaluateNode, mergeOptions } from './evaluate'
import { FigTreeError } from './FigTreeError'
import { ErrorCodes } from './errorCodes'
import { resolvePath } from './primitives'
import { coreOperators } from './operators'

/** No fragments are registrable until Phase 11. */
const NO_FRAGMENTS: ReadonlyMap<string, unknown> = new Map()

/** Everything an instance may swap, and may only swap together. */
interface InstanceState {
  /**
   * The stored options, registry keys included. Those two keys are
   * stripped at the two points where options leave the instance —
   * `getOptions()` and the context an evaluation runs under — so the
   * definitions, and the clients closed inside them, never reach a body.
   */
  options: FigTreeOptions
  registry: OperatorRegistry
  /**
   * Built with the registry and discarded with it. An artifact bakes in
   * registry resolution, so a cache that outlived its registry would serve
   * stale classifications — which is exactly why `operators`, `fragments`
   * and `operatorDefaults` are the whole invalidation set, and why
   * invalidation is this field being replaced rather than a method call.
   */
  parseCache: ParseCache
}

/**
 * The three options the compile artifact consumes, and so the whole
 * invalidation set: an artifact bakes in registry resolution, and a
 * modifier default bakes into the precomputed shielding.
 *
 * Tested by presence, not by whether the value actually differs. Deciding
 * that would mean structurally comparing `operatorDefaults` for no
 * correctness gain, and a redundant rebuild costs a recompile, never a
 * wrong answer.
 */
const touchesRegistry = (update: FigTreeOptions): boolean =>
  update.operators !== undefined ||
  update.fragments !== undefined ||
  update.operatorDefaults !== undefined

/**
 * Build a whole state from the previous one and an update — the single
 * path shared by construction (from no previous state) and
 * `updateOptions`, so both validate identically.
 *
 * Validate-before-swap is structural rather than guarded: `buildRegistry`
 * throws from in here, so a caller that assigns the return value can only
 * ever assign a complete, valid record.
 *
 * An update naming none of the registry-affecting options carries the
 * registry and the parse cache across untouched. Nothing about either
 * could have changed, so rebuilding would only throw away artifacts.
 */
const buildState = (previous: InstanceState | null, update: FigTreeOptions): InstanceState => {
  // `mergeOptions` rebuilds every incoming block, so the result is already
  // instance-owned: `fragments` gets the two-level treatment and
  // `operators`, an array, replaces
  const options = mergeOptions(previous === null ? {} : previous.options, update)
  if (previous !== null && !touchesRegistry(update))
    return { options, registry: previous.registry, parseCache: previous.parseCache }

  const registry = buildRegistry({
    // Omitted `operators` means the core set only — no HTTP, no SQL
    operators: options.operators ?? [coreOperators],
    ...(options.operatorDefaults !== undefined
      ? { operatorDefaults: options.operatorDefaults }
      : {}),
  })
  return {
    options,
    registry,
    parseCache: new ParseCache({
      compile: (expression) => compile(expression, registry),
      probe: (expression) => probeConstant(expression, registry, NO_FRAGMENTS),
    }),
  }
}

/** The stored or merged options as they leave the instance. */
const withoutRegistryKeys = (options: FigTreeOptions): EvaluationOptions => {
  const stripped = { ...options }
  delete stripped.operators
  delete stripped.fragments
  return stripped
}

/**
 * The one compile: parse plus the metadata-driven static checks, against a
 * registry. `validate()` calls it directly; `evaluate()` reaches it through
 * the parse cache, which is what makes the two report identically.
 */
const compile = (expression: unknown, registry: OperatorRegistry): ParseArtifact => {
  const artifact = parseExpression(expression, registry, NO_FRAGMENTS)
  runStaticChecks(artifact)
  return artifact
}

export class FigTree {
  private state: InstanceState

  constructor(options: FigTreeOptions = {}) {
    this.state = buildState(null, options)
  }

  /**
   * The one sanctioned mutation path ("The method surface at a glance" in
   * docs-dev/v3-specs/v3-evaluator-methods.md). Merges by the same rule as
   * per-call options, rebuilds what the update can have changed, and swaps.
   *
   * The registry and the parse cache are rebuilt only when the update names
   * one of the three registry-affecting options (`touchesRegistry` is the
   * one place that set is defined), and the rebuild re-validates the whole
   * registry: a merged `operatorDefaults` has to be re-checked against a
   * new operator set — an entry naming an operator the new set no longer
   * registers is an error reachable no other way — and the converse holds
   * too. Any other update carries the registry and the cache across
   * untouched, since nothing about either could have changed.
   */
  updateOptions(options: FigTreeOptions = {}): void {
    this.state = buildState(this.state, options)
  }

  /**
   * A snapshot, never live internals: mutating what comes back cannot
   * reach the instance. The registry keys are excluded — `getOperators()`
   * and `getFragments()` are their richer home, and the closures inside a
   * definition do not snapshot meaningfully.
   *
   * Options are reported **as supplied**, not as effective: no default is
   * materialized into the result. That is deliberately the opposite of
   * `getOperators()`, which reports effective defaults, because the
   * question here is "what was I configured with".
   */
  getOptions(): EvaluationOptions {
    return copyOptions(withoutRegistryKeys(this.state.options))
  }

  /**
   * Full static-issue report ("validate() — the process" in
   * docs-dev/v3-specs/v3-evaluator-methods.md): synchronous, never throws
   * on expression content — even hard parse errors come back as
   * error-severity issues. Throws only on misuse of the method itself
   * (per-call `operators`/`fragments`, which are constructor-only).
   */
  validate(expression: unknown, options: FigTreeOptions = {}): ValidationResult {
    rejectPerCallRegistry(options)
    const artifact = compile(expression, this.state.registry)
    const merged = mergeOptions(this.state.options, options)
    const issues = [...limitIssues(artifact, merged), ...artifact.issues.map((s) => s.issue)]

    // The sample-data check walks the stored dependency list
    if (merged.data !== undefined) {
      for (const dataPath of artifact.dependencies.dataPaths) {
        if (!resolvePath(merged.data, dataPath).found)
          issues.push({
            severity: 'warning',
            code: ErrorCodes.missingDataPath,
            message: `'$data.${dataPath}' is absent from the supplied sample data`,
            path: [],
          })
      }
    }

    return {
      valid: !issues.some((issue) => issue.severity === 'error'),
      issues,
      timeoutShielded: artifact.shielded,
    }
  }

  /**
   * The one evaluation method ("evaluate() return shapes" in
   * docs-dev/v3-specs/v3-evaluator-methods.md). Throw mode: the first
   * static error, or the first uncaught runtime failure, rejects the call
   * with a `FigTreeError`; otherwise the bare result value.
   *
   * Inert input skips the parse entirely: the constancy probe recognizes a
   * value with nothing to evaluate or normalize and returns it by identity
   * (the user's `maxDepth` still applies to its measured depth). The skip is
   * off when `trace` is requested — a skipped parse has no nodes for the
   * trace to echo.
   */
  async evaluate(expression: unknown, options: FigTreeOptions = {}): Promise<unknown> {
    rejectPerCallRegistry(options)
    const merged = mergeOptions(this.state.options, options)

    // An inert input is returned by identity without being parsed. The
    // verdict is memoized in the cache's identity layer, so a repeated
    // constant container costs a pointer lookup rather than another walk.
    // Under `trace` the skip is off: a skipped parse has no nodes to echo.
    const resolved =
      merged.trace === true
        ? ({ kind: 'artifact', artifact: compile(expression, this.state.registry) } as const)
        : this.state.parseCache.resolve(expression)
    if (resolved.kind === 'inert') {
      if (merged.maxDepth !== undefined && resolved.depth > merged.maxDepth)
        throw staticError(depthIssue(resolved.depth, merged.maxDepth), [])
      return expression
    }

    const { artifact } = resolved
    const issues = [...limitIssues(artifact, merged), ...artifact.issues.map((s) => s.issue)]
    const firstError = issues.find((issue) => issue.severity === 'error')
    if (firstError !== undefined) throw staticError(firstError, issues)

    return evaluateNode(artifact.root, createEvaluationContext(withoutRegistryKeys(merged)))
  }
}

/**
 * Registry keys are constructor/`updateOptions` only. Tested by value, not
 * by key presence, because the merge rule ignores an `undefined` value —
 * so `{ operators: config.operators }` with nothing configured means "not
 * supplied", exactly as it would for any other option.
 */
const rejectPerCallRegistry = (options: FigTreeOptions) => {
  if (options.operators !== undefined || options.fragments !== undefined)
    throw new FigTreeError({
      code: ErrorCodes.invalidOptions,
      message:
        "'operators' and 'fragments' are not per-call options — register them at construction or via updateOptions()",
      path: [],
    })
}

/**
 * The two option-dependent checks, run per call against the artifact's
 * stored counts — never stored in the artifact (option-independence).
 */
const limitIssues = (artifact: ParseArtifact, merged: FigTreeOptions): Issue[] => {
  const issues: Issue[] = []
  if (merged.maxDepth !== undefined && artifact.maxDepth > merged.maxDepth)
    issues.push(depthIssue(artifact.maxDepth, merged.maxDepth))
  if (merged.maxNodes !== undefined && artifact.nodeCount > merged.maxNodes)
    issues.push({
      severity: 'error',
      code: ErrorCodes.maxNodesExceeded,
      message: `the expression holds ${artifact.nodeCount} evaluable nodes — maxNodes is ${merged.maxNodes}`,
      path: [],
    })
  return issues
}

const depthIssue = (measured: number, limit: number): Issue => ({
  severity: 'error',
  code: ErrorCodes.maxDepthExceeded,
  message: `the expression nests ${measured} levels deep — maxDepth is ${limit}`,
  path: [],
})

/**
 * The static-error gate's throw: the first error-severity issue in tree
 * order, the full stream attached as `issues` so nothing is hidden.
 */
const staticError = (issue: Issue, issues: Issue[]): FigTreeError =>
  new FigTreeError({
    code: issue.code,
    message: issue.message,
    path: issue.path,
    ...(issue.operator !== undefined ? { operator: issue.operator } : {}),
    issues,
  })
