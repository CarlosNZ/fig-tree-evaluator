/**
 * The option-dependent checks ("validate() — the process" in
 * docs-dev/v3-specs/v3-evaluator-methods.md): the two limit checks and the
 * sample-data check. They run per call against what the artifact stored
 * and are never stored themselves — the artifact is option-independent
 * (obligation C1).
 *
 * One module so that `validate()` and `inspect()` report the same list by
 * construction: both assemble it through `validationIssues`, so neither
 * can reorder or omit a check the other runs. `evaluate()`'s static gate
 * reads the limit checks alone, the sample-data check being a warning,
 * which never gates.
 */
import { renderDataReference, type CompileArtifact, type SequencedIssue } from './compile'
import type { EvaluationOptions } from './options'
import type { Issue } from './issues'
import { ErrorCodes } from './errorCodes'
import { resolvePath } from './primitives'

/** The limit checks, against the artifact's composed counts. */
export const limitIssues = (artifact: CompileArtifact, options: EvaluationOptions): Issue[] => {
  const issues: Issue[] = []
  if (options.maxDepth !== undefined && artifact.maxDepth > options.maxDepth)
    issues.push(depthIssue(artifact.maxDepth, options.maxDepth))
  if (options.maxNodes !== undefined && artifact.nodeCount > options.maxNodes)
    issues.push({
      severity: 'error',
      code: ErrorCodes.maxNodesExceeded,
      message: `the expression holds ${artifact.nodeCount} evaluable nodes — maxNodes is ${options.maxNodes}`,
      path: [],
    })
  return issues
}

export const depthIssue = (measured: number, limit: number): Issue => ({
  severity: 'error',
  code: ErrorCodes.maxDepthExceeded,
  message: `the expression nests ${measured} levels deep — maxDepth is ${limit}`,
  path: [],
})

/**
 * `validate()`'s whole list, in its order: the limit checks, the compile
 * stream, then one warning per statically-known `$data` path the options'
 * `data` lacks. `entry` shapes each compile-stream entry — the bare `Issue`
 * for `validate()`, the issue with its node's `order` for `inspect()` —
 * which is the one way the two lists may differ.
 */
export const validationIssues = <Entry>(
  artifact: CompileArtifact,
  options: EvaluationOptions,
  entry: (sequenced: SequencedIssue) => Entry
): (Issue | Entry)[] => {
  const issues: (Issue | Entry)[] = [
    ...limitIssues(artifact, options),
    ...artifact.issues.map(entry),
  ]
  // The sample-data check walks the stored dependency list, which holds
  // segments — the form `resolvePath` accepts, so nothing is re-parsed
  if (options.data !== undefined)
    for (const dataPath of artifact.dependencies.dataPaths.values())
      if (!resolvePath(options.data, dataPath).found)
        issues.push({
          severity: 'warning',
          code: ErrorCodes.missingDataPath,
          message: `'${renderDataReference(dataPath)}' is absent from the supplied sample data`,
          path: [],
        })
  return issues
}
