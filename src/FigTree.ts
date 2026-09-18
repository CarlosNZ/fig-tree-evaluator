/**
 * The `FigTree` class ("The method surface at a glance" in
 * docs-dev/v3-specs/v3-evaluator-methods.md). Construction assembles the
 * instance registry via `buildRegistry()` and throws `FigTreeError` (code
 * `invalid-options`) on any bad input — the loud-at-registration posture.
 *
 * `validate()` and `evaluate()` share one spine: the same compile (parse +
 * static checks) and the same per-call limit checks; `validate()` returns
 * the issue stream, `evaluate()` refuses on the first error-severity issue
 * and evaluates the holes otherwise. `updateOptions`, `getOptions` and the
 * parse cache land in Phase 8 (the cache wraps `compile()`); `mode:
 * 'report'` and `trace` in Phase 12; `timeout` in Phase 10; the result
 * cache in Phase 9 — those options are accepted and inert until then.
 */
import type { FigTreeOptions } from './options'
import type { Issue, ValidationResult } from './issues'
import { buildRegistry, type OperatorRegistry } from './registry'
import { parseExpression, probeConstant, runStaticChecks, type ParseArtifact } from './parse'
import { createEvaluationContext, evaluateNode, mergeOptions } from './evaluate'
import { FigTreeError } from './FigTreeError'
import { ErrorCodes } from './errorCodes'
import { resolvePath } from './primitives'
import { coreOperators } from './operators'

/** No fragments are registrable until Phase 11. */
const NO_FRAGMENTS: ReadonlyMap<string, unknown> = new Map()

export class FigTree {
  private readonly registry: OperatorRegistry
  private readonly options: FigTreeOptions

  constructor(options: FigTreeOptions = {}) {
    this.registry = buildRegistry({
      // Omitted `operators` means the core set only — no HTTP, no SQL
      operators: options.operators ?? [coreOperators],
      ...(options.operatorDefaults !== undefined
        ? { operatorDefaults: options.operatorDefaults }
        : {}),
    })
    this.options = { ...options }
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
    const merged = mergeOptions(this.options, options)
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
    const merged = mergeOptions(this.options, options)

    if (merged.trace !== true) {
      const probe = probeConstant(expression, this.registry, NO_FRAGMENTS)
      if (probe.constant) {
        if (merged.maxDepth !== undefined && probe.depth > merged.maxDepth)
          throw staticError(depthIssue(probe.depth, merged.maxDepth), [])
        return expression
      }
    }

    const artifact = this.compile(expression)
    const issues = [...limitIssues(artifact, merged), ...artifact.issues.map((s) => s.issue)]
    const firstError = issues.find((issue) => issue.severity === 'error')
    if (firstError !== undefined) throw staticError(firstError, issues)

    return evaluateNode(artifact.root, createEvaluationContext(merged))
  }

  /**
   * The shared compile seam: parse + the metadata-driven static checks.
   * Uncached until Phase 8.2 — the parse cache wraps exactly this method.
   */
  private compile(expression: unknown): ParseArtifact {
    const artifact = parseExpression(expression, this.registry, NO_FRAGMENTS)
    runStaticChecks(artifact)
    return artifact
  }
}

const rejectPerCallRegistry = (options: FigTreeOptions) => {
  if ('operators' in options || 'fragments' in options)
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
