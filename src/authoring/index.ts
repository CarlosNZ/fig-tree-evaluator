/**
 * `fig-tree-evaluator/authoring` — static analyses for authoring tools (the
 * design record is docs-dev/v3-specs/v3-authoring.md). Nothing here has any
 * bearing on evaluation, so nothing in the engine imports it: `evaluate()`
 * never pays for these checks, however thorough they become.
 *
 * The subpath reads a compiled handle through `viewHandle`, the reader the
 * inspector uses, so its bundle shares the engine's chunk with the root. A
 * caller always holds a `FigTree` already, so that code is in its bundle
 * either way.
 */
import { FigTree, viewHandle } from '../FigTree'
import { toNodePath } from '../compile/artifact'
import type { CompiledNode, NodePath, ReferenceNode } from '../compile/artifact'
import type { FragmentEntry } from '../fragments'
import type { FallbackCoverage, FallbackCoverageOptions } from '../authoringTypes'

/**
 * Whether each top-level value of an expression is covered by a fallback
 * that cannot itself throw ("fallbackCoverage" in
 * docs-dev/v3-specs/v3-authoring.md). Every operator node and fragment call
 * is taken to be able to throw, so only a fallback on a top-level value
 * covers it, and an inner one never covers the node above it.
 *
 * Under a timeout nothing runs after the deadline, so a top-level value is
 * covered only by a constant fallback: the instance's `timeout`, or the one
 * passed here for a host that passes it to `evaluate()` per call. The
 * expression compiles through `compile()`, so it shares the compile cache
 * with `evaluate()`.
 */
export const fallbackCoverage = (
  fig: unknown,
  expression: unknown,
  options?: FallbackCoverageOptions
): FallbackCoverage => {
  if (!(fig instanceof FigTree)) throw new TypeError('fallbackCoverage() takes a FigTree instance')
  // The call's options laid over the instance's, and checked, as
  // `evaluate()` would; a handle from this copy is always readable
  const { artifact, options: effective } = viewHandle(fig.compile(expression), options)!
  const analysis = new Analysis(effective.strictDataPaths ?? false)

  // The runtime's shielding: a hole is spliced on a timeout only when its
  // fallback is constant (`timeoutFallback`). The rules without a timeout
  // apply too: a fragment call with dynamic arguments lifts its body's
  // constant fallback, yet its arguments fail outside the body's fallbacks
  if (effective.timeout !== undefined) {
    const scope = artifact.root.kind === 'skeleton' ? pushScope(null, artifact.root.vars) : null
    return {
      uncovered: artifact.holes
        .filter((hole) => hole.timeoutFallback === undefined || analysis.mayThrow(hole.node, scope))
        .map((hole) => toNodePath(hole.node.path)),
    }
  }

  const uncovered: NodePath[] = []
  // A plain object holds no fallback, so its holes are listed one by one,
  // with its vars in scope
  const list = (node: CompiledNode, scope: Scope) => {
    if (node.kind === 'skeleton') {
      const inner = pushScope(scope, node.vars)
      for (const hole of node.holes) list(hole.node, inner)
    } else if (analysis.mayThrow(node, scope)) uncovered.push(toNodePath(node.path))
  }
  list(artifact.root, null)
  return { uncovered }
}

/** A vars block in force, linked to the scope it was declared in. */
type Scope = { vars: Record<string, CompiledNode>; parent: Scope } | null

const pushScope = (parent: Scope, vars: Record<string, CompiledNode> | undefined): Scope =>
  vars === undefined ? parent : { vars, parent }

/**
 * Whether a node can throw, by the rules in docs-dev/v3-specs/v3-authoring.md.
 * A var definition is answered once, in the scope it was declared in, and a
 * fragment body once, apart from any call's arguments.
 */
class Analysis {
  private readonly vars = new Map<CompiledNode, boolean>()
  private readonly bodies = new Map<FragmentEntry, boolean>()

  constructor(private readonly strict: boolean) {}

  mayThrow(node: CompiledNode, scope: Scope): boolean {
    switch (node.kind) {
      case 'constant':
        return false
      case 'invalid':
        return true
      case 'reference':
        return this.referenceMayThrow(node, scope)
      case 'skeleton': {
        const inner = pushScope(scope, node.vars)
        return node.holes.some((hole) => this.mayThrow(hole.node, inner))
      }
      case 'operator': {
        // The node's vars are in scope for its fallback
        if (node.fallback !== undefined)
          return this.mayThrow(node.fallback, pushScope(scope, node.vars))
        // An `operatorDefaults` fallback is returned as it is, never
        // evaluated, so it cannot throw
        const defaults = node.entry.instanceDefaults
        return defaults === undefined || !Object.hasOwn(defaults, 'fallback')
      }
      case 'fragmentCall':
        if (node.fallback !== undefined)
          return this.mayThrow(node.fallback, pushScope(scope, node.vars))
        if (node.entry === undefined) return true
        // A dynamic arguments object is evaluated and checked before the
        // body runs, so its failures escape the body's fallbacks
        if (node.argumentsMode === 'dynamic') return true
        return this.bodyMayThrow(node.entry)
      // Parameter values only, never a top-level value or a fallback
      case 'elements':
      case 'entries':
        return true
    }
    return node satisfies never
  }

  /**
   * A missing path throws only under `strictDataPaths`, and only where the
   * reference drills; `$index` never drills. A var throws when its
   * definition does.
   */
  private referenceMayThrow(node: ReferenceNode, scope: Scope): boolean {
    switch (node.namespace) {
      case 'data':
      case 'element':
        return this.strict && node.segments.length > 0
      case 'index':
        return false
      // A body is analysed once for every call, so an argument is unknown
      case 'params':
        return true
      case 'vars':
        return (
          (this.strict && node.segments.length > 1) || this.varMayThrow(node.segments[0], scope)
        )
    }
    return node.namespace satisfies never
  }

  private varMayThrow(name: unknown, scope: Scope): boolean {
    for (let frame = scope; frame !== null; frame = frame.parent) {
      if (typeof name !== 'string' || !Object.hasOwn(frame.vars, name)) continue
      const definition = frame.vars[name]
      const known = this.vars.get(definition)
      if (known !== undefined) return known
      // Provisional, so a cycle (already a static error) ends here
      this.vars.set(definition, true)
      const answer = this.mayThrow(definition, frame)
      this.vars.set(definition, answer)
      return answer
    }
    return true
  }

  private bodyMayThrow(entry: FragmentEntry): boolean {
    const known = this.bodies.get(entry)
    if (known !== undefined) return known
    const answer = this.mayThrow(entry.body, null)
    this.bodies.set(entry, answer)
    return answer
  }
}
