/**
 * The `FigTree` class ("The method surface at a glance" in
 * docs-dev/v3-specs/v3-evaluator-methods.md). Construction assembles the
 * instance registry via `buildRegistry()` and throws `FigTreeError` (code
 * `invalid-options`) on any bad input — the loud-at-registration posture.
 *
 * `validate()` and `evaluate()` share one spine: the same compile (parse +
 * static checks) and the same per-call limit checks; `validate()` returns
 * the issue stream, `evaluate()` refuses on the first error-severity issue
 * and evaluates the holes otherwise, with the parse cache wrapping that
 * shared compile. `mode: 'report'` and `trace` land in Phase 12,
 * `timeout` in Phase 10 and the result cache in Phase 9 — those options
 * are accepted and inert until then.
 *
 * An instance's whole mutable world is one `InstanceState` record, swapped
 * atomically. The registry, the options and (from 8.2) the parse cache are
 * derived from each other, so they may only change together: an artifact
 * bakes in registry resolution, and a cache built against one registry
 * must never answer against another.
 */
import type { FigTreeOptions, FragmentDefinition } from './options'
import type { Issue, ValidationResult } from './issues'
import { buildRegistry, type OperatorRegistry, type RegistryInput } from './registry'
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

/**
 * What the registry is built from. Held apart from the stored options so
 * that the definitions — and the clients closed inside them — are not
 * reachable through `context.options`, which every operator body
 * receives whole. `getOptions()` excludes the same two keys, so the
 * instance and its introspection agree.
 */
interface RegistrySource {
  operators: NonNullable<FigTreeOptions['operators']>
  fragments?: Record<string, FragmentDefinition>
}

/** Everything an instance may swap, and may only swap together. */
interface InstanceState {
  /** The stored options, registry keys removed. */
  options: FigTreeOptions
  source: RegistrySource
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
  // Merged with the registry keys present, so `fragments` gets the same
  // two-level treatment as any other block and `operators`, an array,
  // replaces. They are split back out immediately afterwards.
  const base = previous === null ? {} : withSource(previous.options, previous.source)
  const { operators, fragments, ...options } = copyOptions(mergeOptions(base, update))
  const source: RegistrySource = {
    // Omitted `operators` means the core set only — no HTTP, no SQL
    operators: operators ?? [coreOperators],
    ...(fragments !== undefined ? { fragments } : {}),
  }
  const registryInput: RegistryInput = {
    operators: source.operators,
    ...(options.operatorDefaults !== undefined
      ? { operatorDefaults: options.operatorDefaults }
      : {}),
  }
  if (previous !== null && !touchesRegistry(update))
    return { options, source, registry: previous.registry, parseCache: previous.parseCache }

  const registry = buildRegistry(registryInput)
  return {
    options,
    source,
    registry,
    parseCache: new ParseCache({
      compile: (expression) => {
        const artifact = parseExpression(expression, registry, NO_FRAGMENTS)
        runStaticChecks(artifact)
        return artifact
      },
      probe: (expression) => probeConstant(expression, registry, NO_FRAGMENTS),
    }),
  }
}

/** The stored options with the registry keys put back, for merging. */
const withSource = (options: FigTreeOptions, source: RegistrySource): FigTreeOptions => ({
  ...options,
  operators: source.operators,
  ...(source.fragments !== undefined ? { fragments: source.fragments } : {}),
})

export class FigTree {
  private state: InstanceState

  constructor(options: FigTreeOptions = {}) {
    this.state = buildState(null, options)
  }

  /**
   * The one sanctioned mutation path ("The method surface at a glance" in
   * docs-dev/v3-specs/v3-evaluator-methods.md). Merges by the same rule as
   * per-call options, re-validates the whole registry, and swaps.
   *
   * Re-validation is unconditional. A merged `operatorDefaults` has to be
   * re-checked against a new operator set in any case — an entry naming an
   * operator the new set no longer registers is an error reachable no
   * other way — and the converse holds too, so there is no update for
   * which skipping the check would be sound.
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
  getOptions(): FigTreeOptions {
    return copyOptions(this.state.options)
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
    const artifact = this.compile(expression)
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
        ? ({ kind: 'artifact', artifact: this.compile(expression) } as const)
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

    return evaluateNode(artifact.root, createEvaluationContext(merged))
  }

  /**
   * The shared compile seam: parse + the metadata-driven static checks,
   * behind the parse cache. `validate()` calls it directly and so warms
   * the cache for the next `evaluate()`, which is the only pre-warm the
   * surface offers.
   *
   * It always yields an artifact, never a probe verdict: an inert input
   * can still earn an unrecognized-`$` warning, and reporting is
   * `validate()`'s whole job.
   */
  private compile(expression: unknown): ParseArtifact {
    return this.state.parseCache.artifact(expression)
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
