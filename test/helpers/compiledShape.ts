/**
 * What an expression compiles to, less where it was written: the comparator
 * for the format conversions' equivalence tests ("Testing" in
 * docs-dev/v3-specs/v3-format.md). A conversion moves nodes around (a
 * positional payload becomes named keys, a key changes its place), so the
 * compiled trees differ in source paths and walk order and must agree in
 * everything else.
 *
 * The projection is by node kind rather than a blanket strip of `path` and
 * `order` keys, which would also strip those keys from constant data.
 */
import {
  compileExpression,
  runStaticChecks,
  type CompiledNode,
  type CompileArtifact,
} from '../../src/compile'
import type { OperatorRegistry } from '../../src/registry'

export interface ShapeOptions {
  /** Drop each reference's spelling, for runs that respell references. */
  ignoreSpelling?: boolean
}

const mapValues = (
  record: Record<string, CompiledNode> | undefined,
  project: (node: CompiledNode) => unknown
): Record<string, unknown> | undefined =>
  record === undefined
    ? undefined
    : Object.fromEntries(Object.entries(record).map(([key, node]) => [key, project(node)]))

const nodeShape = (node: CompiledNode, options: ShapeOptions): unknown => {
  const project = (child: CompiledNode) => nodeShape(child, options)
  switch (node.kind) {
    case 'constant':
      return { kind: node.kind, value: node.value }
    case 'reference':
      return {
        kind: node.kind,
        namespace: node.namespace,
        segments: node.segments,
        binding: node.binding,
        raw: options.ignoreSpelling ? undefined : node.raw,
      }
    case 'operator':
      return {
        kind: node.kind,
        name: node.name,
        params: mapValues(node.params, project),
        fallback: node.fallback && project(node.fallback),
        fallbackReadsError: node.fallbackReadsError,
        noCache: node.noCache,
        vars: mapValues(node.vars, project),
        precomputed: node.precomputed,
      }
    case 'fragmentCall': {
      // `{ fragment: 'f' }` and `{ fragment: 'f', parameters: {} }` compile
      // alike in all but this: the shorthand's round trip turns the first
      // into the second ("Testing" in the spec)
      const { parameters } = node
      const empty =
        node.argumentsMode === 'static' &&
        (parameters === undefined || Object.keys(parameters).length === 0)
      return {
        kind: node.kind,
        name: node.name,
        argumentsMode: node.argumentsMode,
        parameters: empty
          ? undefined
          : node.argumentsMode === 'static'
            ? mapValues(parameters as Record<string, CompiledNode>, project)
            : project(parameters as CompiledNode),
        fallback: node.fallback && project(node.fallback),
        fallbackReadsError: node.fallbackReadsError,
        noCache: node.noCache,
        vars: mapValues(node.vars, project),
      }
    }
    case 'skeleton':
      return {
        kind: node.kind,
        skeleton: node.skeleton,
        holes: node.holes.map((hole) => ({ at: hole.at, node: project(hole.node) })),
        vars: mapValues(node.vars, project),
      }
    case 'elements':
      return { kind: node.kind, nodes: node.nodes.map(project) }
    case 'entries':
      return {
        kind: node.kind,
        entries: mapValues(node.entries, project),
        vars: mapValues(node.vars, project),
      }
    case 'invalid':
      return { kind: node.kind, raw: node.raw }
  }
}

export const artifactShape = (artifact: CompileArtifact, options: ShapeOptions = {}) => ({
  root: nodeShape(artifact.root, options),
  dependencies: {
    dataPaths: [...artifact.own.dependencies.dataPaths.keys()].sort(),
    dynamic: artifact.own.dependencies.dynamic,
    operators: [...artifact.own.dependencies.operators].sort(),
    fragments: [...artifact.own.dependencies.fragments].sort(),
  },
  hasErrors: artifact.hasErrors,
  timeoutShielded: artifact.timeoutShielded,
  // Each top-level hole's static fallback, which the holes' nodes in `root`
  // don't carry. Its value holds each `$error` read as written, so a run
  // that respells references compares the reads alone
  holes: artifact.holes.map(({ timeoutFallback }) =>
    timeoutFallback === undefined
      ? undefined
      : {
          value: options.ignoreSpelling ? undefined : timeoutFallback.value,
          reads: timeoutFallback.reads,
        }
  ),
})

/**
 * Compile as `FigTree` does, then project: the one call the equivalence
 * tests make. The static checks are part of the compile, since they mark
 * the fallbacks that read `$error` (`fallbackReadsError`) and can add
 * errors.
 */
export const compiledShape = (
  expression: unknown,
  registry: OperatorRegistry,
  options?: ShapeOptions
) => {
  const artifact = compileExpression(expression, registry)
  runStaticChecks(artifact)
  return artifactShape(artifact, options)
}
