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
import {
  renderDataReference,
  toNodePath,
  type CompileArtifact,
  type DataRead,
  type LinkedPath,
  type SequencedIssue,
} from './compile'
import type { EvaluationOptions } from './options'
import type { Issue } from './issues'
import { ErrorCodes } from './errorCodes'
import { resolvePath, type PathSegment } from './primitives'

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

/**
 * What the static gate reads: the limit checks then the compile stream, in
 * `validate()`'s order, so the first error is the one `evaluate()` throws
 * and the whole list is what the thrown error carries. Empty, without
 * assembling anything, when it could hold no error: the compile set no
 * error flag and no limit is in force. `evaluate()` and `fallbackCoverage`
 * both read it, so they refuse the same expressions by construction.
 */
export const staticGate = (artifact: CompileArtifact, options: EvaluationOptions): Issue[] =>
  artifact.hasErrors || options.maxDepth !== undefined || options.maxNodes !== undefined
    ? [...limitIssues(artifact, options), ...artifact.issues.map((s) => s.issue)]
    : []

export const depthIssue = (measured: number, limit: number): Issue => ({
  severity: 'error',
  code: ErrorCodes.maxDepthExceeded,
  message: `the expression nests ${measured} levels deep — maxDepth is ${limit}`,
  path: [],
})

/**
 * `validate()`'s whole list, in its order: the limit checks, the compile
 * stream, then the sample-data warnings (`sampleDataIssues`), which are
 * not the compile stream's and so never carry an `order`. `entry` shapes
 * each compile-stream entry — the bare `Issue` for `validate()`, the issue
 * with its node's `order` for `inspect()` — which is the one way the two
 * lists may differ.
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
  if (options.data !== undefined) issues.push(...sampleDataIssues(artifact.dataReads, options.data))
  return issues
}

/**
 * One warning per reading node for each statically-known `$data` path the
 * sample lacks, in tree order: at the reference, `get` node or template
 * string that reads it, or at the fragment call whose body does, naming the
 * fragment. Each distinct path is resolved once however many nodes read
 * it, and a node reading one path twice (a template naming it twice) warns
 * once. The reads hold segments, the form `resolvePath` accepts, so nothing
 * is re-parsed.
 */
const sampleDataIssues = (reads: DataRead[], data: unknown): Issue[] => {
  const present = new Map<string, boolean>()
  const warned = new Map<LinkedPath, Set<string>>()
  const issues: Issue[] = []

  const check = (
    key: string,
    segments: PathSegment[],
    read: DataRead,
    fragment: string | undefined
  ) => {
    let found = present.get(key)
    if (found === undefined) {
      found = resolvePath(data, segments).found
      present.set(key, found)
    }
    if (found) return
    let keys = warned.get(read.path)
    if (keys === undefined) warned.set(read.path, (keys = new Set()))
    if (keys.has(key)) return
    keys.add(key)
    const readBy = fragment === undefined ? '' : ` (read by fragment '${fragment}')`
    issues.push({
      severity: 'warning',
      code: ErrorCodes.missingDataPath,
      message: `'${renderDataReference(segments)}' is absent from the supplied sample data${readBy}`,
      path: toNodePath(read.path),
    })
  }

  for (const read of reads)
    if (read.kind === 'path') check(read.key, read.segments, read, undefined)
    else
      for (const [key, segments] of read.fragment.dependencies.dataPaths)
        check(key, segments, read, read.fragment.name)
  return issues
}
