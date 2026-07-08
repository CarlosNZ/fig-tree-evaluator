/**
 * The `FigTree` class ("The method surface at a glance" in
 * docs-dev/v3-specs/v3-evaluator-methods.md). Construction assembles the
 * instance registry via `buildRegistry()` and throws `FigTreeError` (code
 * `invalid-options`) on any bad input — the loud-at-registration posture.
 *
 * Phase 3 adds `validate()` — the parser's public face. No evaluation until
 * Phase 4; `updateOptions` and the full options merge semantics land in
 * Phase 8 (validate()'s per-call merge is a shallow spread until then); the
 * parse cache wraps the `parseExpression` call in Phase 8.2.
 */
import type { FigTreeOptions } from './options'
import type { ValidatedOperatorDefinition } from './operatorDefinition'
import type { Issue, ValidationResult } from './issues'
import { buildRegistry, type OperatorRegistry } from './registry'
import { parseExpression, runStaticChecks } from './parse'
import { FigTreeError } from './FigTreeError'
import { ErrorCodes } from './errorCodes'
import { resolvePath } from './primitives'

/**
 * The registry when `operators` is omitted. NOTE Phase 4: becomes
 * `coreOperators` — the spec default is "coreOperators only", which does not
 * exist until the first operator batch lands. This constant is the one swap
 * point.
 */
const DEFAULT_OPERATORS: ValidatedOperatorDefinition[] = []

export class FigTree {
  private readonly registry: OperatorRegistry
  private readonly options: FigTreeOptions

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

  /**
   * Full static-issue report ("validate() — the process" in
   * docs-dev/v3-specs/v3-evaluator-methods.md): synchronous, never throws
   * on expression content — even hard parse errors come back as
   * error-severity issues. Throws only on misuse of the method itself
   * (per-call `operators`/`fragments`, which are constructor-only).
   */
  validate(expression: unknown, options: FigTreeOptions = {}): ValidationResult {
    if ('operators' in options || 'fragments' in options)
      throw new FigTreeError({
        code: ErrorCodes.invalidOptions,
        message:
          "'operators' and 'fragments' are not per-call options — register them at construction or via updateOptions()",
        path: [],
      })

    // Uncached until Phase 8.2 — the parse cache wraps exactly this seam
    const artifact = parseExpression(expression, this.registry)
    runStaticChecks(artifact)

    const merged = { ...this.options, ...options }
    const issues: Issue[] = []

    // The two option-dependent checks — never stored in the artifact
    // (option-independence): limits compare against the stored counts…
    if (merged.maxDepth !== undefined && artifact.maxDepth > merged.maxDepth)
      issues.push({
        severity: 'error',
        code: ErrorCodes.maxDepthExceeded,
        message: `the expression nests ${artifact.maxDepth} levels deep — maxDepth is ${merged.maxDepth}`,
        path: [],
      })
    if (merged.maxNodes !== undefined && artifact.nodeCount > merged.maxNodes)
      issues.push({
        severity: 'error',
        code: ErrorCodes.maxNodesExceeded,
        message: `the expression holds ${artifact.nodeCount} nodes — maxNodes is ${merged.maxNodes}`,
        path: [],
      })

    issues.push(...artifact.issues.map((sequenced) => sequenced.issue))

    // …and the sample-data check walks the stored dependency list
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
}
