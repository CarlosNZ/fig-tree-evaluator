/**
 * `inspect()` — the compiled-expression inspector (#156; the design record
 * is docs-dev/v3-specs/v3-inspect.md). A dev tool for seeing how the engine
 * sees an expression: what the compiler made of it, in the compiler's own
 * shapes, as one plain object that is JSON through and through. Pretty
 * printing is the host's — `JSON.stringify(inspect(x), null, 2)`.
 *
 * A standalone export over the handle, and a pure function of it: the
 * report is assembled from the source, the artifact and the effective
 * options, and nothing is written anywhere. Nothing in the engine imports
 * this module, so a bundle that never imports `inspect` never carries it.
 *
 * The report's shape follows the compiler, whose artifact types are free
 * to change, and so is outside semver: it may change in any release.
 * `version` says which release produced a report.
 */
import type { ArtifactDependencies } from '../compile'
import { viewHandle, type CompiledExpression } from '../FigTree'
import type { Issue } from '../issues'
import type { CallOptions, EvaluationOptions, FigTreeOptions } from '../options'
import { validationIssues } from '../validation'
import { version } from '../version'
import { renderTree, type InspectNode } from './nodes'
import { toJson, type Json } from './values'

export type { InspectNode } from './nodes'
export type { Json, Path } from './values'

/**
 * An entry of `validate()`'s list. `order` is present exactly on the
 * entries from the compile stream, and names the node the issue is about
 * where the tree has one; a computed entry (a limit check, the sample-data
 * check) concerns the whole expression, and has none.
 */
export type InspectIssue = Issue & { order?: number }

/** The artifact's dependency record, as it is rather than reshaped. */
export interface InspectDependencies {
  /**
   * Each statically known `$data` path in its canonical render, in the
   * order the compile met it.
   */
  dataPaths: string[]
  /** True when the read-set is not statically enumerable. */
  dynamic: boolean
  operators: string[]
  fragments: string[]
}

export interface InspectReport {
  /** The library release that produced the report. */
  version: string
  /** The source as provided. */
  expression: Json
  /** The effective options the report's checks ran under, only those set. */
  options: Record<string, Json>
  /** The compiled tree. */
  canonicalForm: InspectNode
  /** `validate()`'s list under the same options. */
  issues: InspectIssue[]
  /** Whether a timeout assembles rather than rejects. */
  timeoutShielded: boolean
  /** Evaluable nodes, composed through fragment calls. */
  nodeCount: number
  /** Nesting, containers included, composed through fragment calls. */
  maxDepth: number
  /** Composed through fragment calls. */
  dependencies: InspectDependencies
  /** The same three measurements of this expression alone. */
  own: { nodeCount: number; maxDepth: number; dependencies: InspectDependencies }
}

/**
 * Inspect a compiled expression. `options` is the per-call shape
 * `validate()` and `evaluate()` take, laid over the options the handle
 * pinned; as with `validate()`, only `data` bears on the report, driving
 * the sample-data check. A handle compiled before an `updateOptions()`
 * reports its own snapshot, as its `evaluate()` answers from it.
 */
export const inspect = <InstanceOpts extends FigTreeOptions>(
  compiled: CompiledExpression<InstanceOpts>,
  options?: CallOptions
): InspectReport => {
  const view = viewHandle(compiled, options)
  if (view === undefined)
    throw new TypeError('inspect() takes a CompiledExpression — the handle fig.compile() returns')
  const { expression, artifact, options: effective } = view
  return {
    version,
    expression: toJson(expression),
    options: renderOptions(effective),
    canonicalForm: renderTree(artifact),
    // Paths are copied: the artifact is the compile cache's, shared with
    // every other holder, and the report is the caller's to change
    issues: validationIssues(artifact, effective, ({ issue, order }) => ({
      order,
      ...issue,
      path: [...issue.path],
    })),
    timeoutShielded: artifact.timeoutShielded,
    nodeCount: artifact.nodeCount,
    maxDepth: artifact.maxDepth,
    dependencies: renderDependencies(artifact.dependencies),
    own: {
      nodeCount: artifact.own.nodeCount,
      maxDepth: artifact.own.maxDepth,
      dependencies: renderDependencies(artifact.own.dependencies),
    },
  }
}

const SUPPLIED = '[supplied]'
const REDACTED = '[redacted]'

/**
 * The options that are set, most as they are. Four are rendered instead:
 * `data`, which can be large and personal, as a count of its keys; header
 * values, which routinely carry credentials, redacted; and `signal` and
 * `cache.store`, which are machinery, as present or not.
 */
const renderOptions = (options: EvaluationOptions): Record<string, Json> =>
  Object.fromEntries(
    Object.entries(options)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, renderOption(key, value)])
  )

const renderOption = (key: string, value: unknown): Json => {
  switch (key) {
    case 'data': {
      const count = typeof value === 'object' && value !== null ? Object.keys(value).length : 0
      return `[supplied: ${count} top-level key${count === 1 ? '' : 's'}]`
    }
    case 'signal':
      return SUPPLIED
    case 'http':
    case 'graphQL':
      return renderBlock(value, 'headers', (headers) =>
        typeof headers === 'object' && headers !== null
          ? Object.fromEntries(Object.keys(headers).map((name) => [name, REDACTED]))
          : toJson(headers)
      )
    case 'cache':
      return renderBlock(value, 'store', () => SUPPLIED)
    default:
      return toJson(value)
  }
}

/** A block converted key by key, one key rendered its own way. */
const renderBlock = (block: unknown, special: string, render: (value: unknown) => Json): Json =>
  typeof block === 'object' && block !== null
    ? Object.fromEntries(
        Object.entries(block)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, key === special ? render(value) : toJson(value)])
      )
    : toJson(block)

/**
 * The record's content in the record's order — `getDependencies()` sorts
 * the paths, the report does not — made JSON. The `dataPaths` Map becomes
 * its keys: the canonical render the record deduplicates on, and the
 * spelling `getDependencies()` and the `missing-data-path` messages use.
 * The render is unambiguous where a segment array is not JSON — the `[*]`
 * projection is a symbol there — so `items[*].id` and a key literally named
 * `[*]` (`items["[*]"].id`) stay apart. The name lists are copied, because
 * the artifact is the compile cache's: a `push` on the report must not
 * change what `getDependencies()` answers for every other holder.
 */
const renderDependencies = (dependencies: ArtifactDependencies): InspectDependencies => ({
  dataPaths: [...dependencies.dataPaths.keys()],
  dynamic: dependencies.dynamic,
  operators: [...dependencies.operators],
  fragments: [...dependencies.fragments],
})
