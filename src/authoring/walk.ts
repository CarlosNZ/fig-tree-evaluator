/**
 * The coverage walk ("The walk" in docs-dev/v3-specs/v3-fallback-coverage.md):
 * post-order over the compiled tree, giving every node a verdict and the
 * failures that can leave it uncaught. A fallback catches everything that
 * escapes its node, and what it catches goes to the sink as covered.
 *
 * Every operator node carries one placeholder finding, so a child's failure
 * is passed up whatever its parameter's delivery mode: what the operators
 * fail on, and which children they use, are not modelled.
 */
import type {
  CompiledNode,
  FragmentCallNode,
  OperatorNode,
  ReferenceNode,
  SequencedIssue,
} from '../compile/artifact'
import type { FragmentEntry } from '../fragments'
import { isDemand, liftCatcher, liftFailure } from './findings'
import type { Caught, Failure, Pending } from './findings'

export type Verdict = 'no' | 'may' | 'always'

/** What the walk knows of a node. */
export interface NodeResult {
  /** Whether the node can throw: never, for some inputs, or whenever reached */
  verdict: Verdict
  /** What can leave the node uncaught, each where it starts */
  escapes: Pending[]
}

/** A vars block in force, linked to the scope it was declared in. */
type Scope = { vars: Record<string, CompiledNode>; parent: Scope } | null

const pushScope = (parent: Scope, vars: Record<string, CompiledNode> | undefined): Scope =>
  vars === undefined ? parent : { vars, parent }

/** Where a node is walked: its scope, its frame's sink, its frame's body. */
interface Context {
  scope: Scope
  sink: Caught[]
  /** The fragment whose body this is; absent in the input itself */
  body?: FragmentEntry
}

/** A subtree walked on its own, with what its fallbacks caught. */
interface Analysed {
  result: NodeResult
  covered: Caught[]
}

const SAFE: NodeResult = { verdict: 'no', escapes: [] }

/**
 * A node's failures from its own and its children's. Only an eager child
 * that always fails makes the node always fail; anything else that escapes
 * makes it able to.
 */
const combine = (own: Pending[], parts: { result: NodeResult; eager: boolean }[]): NodeResult => {
  const escapes = [...own]
  for (const part of parts) escapes.push(...part.result.escapes)
  const always = parts.some((part) => part.eager && part.result.verdict === 'always')
  return { verdict: always ? 'always' : escapes.length > 0 ? 'may' : 'no', escapes }
}

/**
 * Whether a parameter's value is evaluated before the body runs. A
 * container-lazy mode handed anything but its literal container degenerates
 * to eager (`resolveParams` in src/evaluate/params.ts).
 */
const isEager = (node: OperatorNode, name: string, child: CompiledNode): boolean => {
  switch (node.entry.definition.parameters[name]?.evaluation) {
    case 'eager':
      return true
    case 'lazyElements':
    case 'race':
      return child.kind !== 'elements'
    case 'lazyEntries':
      return child.kind !== 'entries'
    default:
      return false
  }
}

const placeholder = (node: OperatorNode): Failure => ({
  path: node.path,
  code: 'operator-failure',
  message: `${node.name} – a placeholder: what this operator can fail on is not modelled, so it is taken to be able to fail`,
  certainty: 'may',
  operator: node.name,
  order: [node.order],
})

/**
 * Var definitions are walked once each, in the scope they were declared in,
 * and fragment bodies once each, apart from any call's arguments: a body
 * reading a parameter leaves a demand, which each call answers.
 */
export class Analysis {
  private readonly vars = new Map<CompiledNode, Analysed>()
  private readonly bodies = new Map<FragmentEntry, Analysed>()

  constructor(
    private readonly strict: boolean,
    private readonly issues: SequencedIssue[]
  ) {}

  /** The expression's root, with its fallbacks' catches in `sink`. */
  root(node: CompiledNode, sink: Caught[]): NodeResult {
    return this.walk(node, { scope: null, sink })
  }

  private walk(node: CompiledNode, ctx: Context): NodeResult {
    switch (node.kind) {
      case 'constant':
        return SAFE
      case 'invalid':
        return this.staticError(node, 'malformed-node')
      case 'reference':
        return this.reference(node, ctx)
      case 'skeleton': {
        // Every hole is evaluated
        const inner = { ...ctx, scope: pushScope(ctx.scope, node.vars) }
        const parts = node.holes.map((hole) => ({
          result: this.walk(hole.node, inner),
          eager: true,
        }))
        return combine([], parts)
      }
      case 'elements':
        return combine(
          [],
          node.nodes.map((element) => ({ result: this.walk(element, ctx), eager: false }))
        )
      case 'entries': {
        const inner = { ...ctx, scope: pushScope(ctx.scope, node.vars) }
        const parts = Object.values(node.entries).map((value) => ({
          result: this.walk(value, inner),
          eager: false,
        }))
        return combine([], parts)
      }
      case 'operator':
        return this.operator(node, ctx)
      case 'fragmentCall':
        return this.call(node, ctx)
    }
    return node satisfies never
  }

  /** The node's vars are in scope for its parameters and its fallback. */
  private operator(node: OperatorNode, ctx: Context): NodeResult {
    const inner = { ...ctx, scope: pushScope(ctx.scope, node.vars) }
    const parts = Object.entries(node.params).map(([name, child]) => ({
      result: this.walk(child, inner),
      eager: isEager(node, name, child),
    }))
    return this.withFallback(node, combine([placeholder(node)], parts), inner)
  }

  /**
   * A fallback catches everything that escapes its node's attempt, and what
   * escapes the node is then the fallback's own. An `operatorDefaults`
   * fallback is returned as it is, never evaluated, so nothing escapes it.
   * A node that cannot fail never runs its fallback.
   */
  private withFallback(
    node: OperatorNode | FragmentCallNode,
    attempt: NodeResult,
    ctx: Context
  ): NodeResult {
    if (attempt.verdict === 'no') return attempt
    const defaults = node.kind === 'operator' ? node.entry.instanceDefaults : undefined
    const fromDefaults = defaults !== undefined && Object.hasOwn(defaults, 'fallback')
    if (node.fallback === undefined && !fromDefaults) return attempt
    const by = { path: node.path }
    for (const pending of attempt.escapes) ctx.sink.push({ pending, by })
    if (node.fallback === undefined) return SAFE
    const answer = this.walk(node.fallback, ctx)
    // The fallback runs only when the attempt fails
    const verdict =
      attempt.verdict === 'always' || answer.verdict !== 'always' ? answer.verdict : 'may'
    return { verdict, escapes: answer.escapes }
  }

  /**
   * A missing path throws only under `strictDataPaths`, and only where the
   * reference drills past what it names; `$index` never drills. A var
   * passes on whatever its definition can fail on, and a parameter leaves a
   * demand for its argument.
   */
  private reference(node: ReferenceNode, ctx: Context): NodeResult {
    const { namespace, segments } = node
    const named = namespace === 'vars' || namespace === 'params'
    const own: Pending[] = []
    if (this.strict && namespace !== 'index' && segments.length > (named ? 1 : 0))
      own.push({
        path: node.path,
        code: 'missing-data-path',
        message: `'${node.raw}' may be absent (strictDataPaths)`,
        certainty: 'may',
        order: [node.order],
      })
    if (namespace === 'vars') {
      const definition = this.varDefinition(segments[0], ctx)
      if (definition === undefined) return this.staticError(node, 'unresolved-var')
      ctx.sink.push(...definition.covered)
      return combine(own, [{ result: definition.result, eager: true }])
    }
    if (namespace === 'params') {
      if (ctx.body === undefined) return this.staticError(node, 'unresolved-param')
      // Bare `$params` reads every declared parameter
      const names = segments.length === 0 ? Object.keys(ctx.body.parameters) : [segments[0]]
      for (const name of names) if (typeof name === 'string') own.push({ demand: name })
    }
    return combine(own, [])
  }

  private varDefinition(name: unknown, ctx: Context): Analysed | undefined {
    for (let frame = ctx.scope; frame !== null; frame = frame.parent) {
      if (typeof name !== 'string' || !Object.hasOwn(frame.vars, name)) continue
      const definition = frame.vars[name]
      const known = this.vars.get(definition)
      if (known !== undefined) return known
      // Provisional, so a cycle (already a static error) ends here
      this.vars.set(definition, { result: SAFE, covered: [] })
      const covered: Caught[] = []
      const result = this.walk(definition, { ...ctx, scope: frame, sink: covered })
      const analysed = { result, covered }
      this.vars.set(definition, analysed)
      return analysed
    }
    return undefined
  }

  /**
   * A call reports its body's failures at itself (`liftFailure`), and
   * answers the body's demands with its arguments. A static call's argument
   * is evaluated when the body first reads it, so whatever catches that
   * read catches the argument's failures, which keep their own path in the
   * caller. A dynamic call's arguments are evaluated and checked before the
   * body runs, outside its fallbacks, and the body reads values that can no
   * longer fail. The call's vars scope its arguments and its fallback.
   */
  private call(node: FragmentCallNode, ctx: Context): NodeResult {
    const { entry } = node
    if (entry === undefined) return this.staticError(node, 'unknown-fragment')
    const inner = { ...ctx, scope: pushScope(ctx.scope, node.vars) }
    const body = this.body(entry)
    const own: Pending[] = []
    const parts: { result: NodeResult; eager: boolean }[] = []
    const answers = new Map<string, Analysed>()
    // What a demand for `name` brings in: nothing for a dynamic call
    const answer = (name: string): Analysed => {
      let known = answers.get(name)
      if (known === undefined) {
        known = node.argumentsMode === 'static' ? this.argument(node, entry, name, inner) : NONE
        answers.set(name, known)
      }
      ctx.sink.push(...known.covered)
      return known
    }

    if (node.argumentsMode === 'dynamic') {
      const source = node.parameters as CompiledNode
      parts.push({ result: this.walk(source, inner), eager: true })
      const failure = (code: string, message: string): Failure => ({
        path: source.path,
        code,
        message: `fragment '${node.name}' – ${message}`,
        certainty: 'may',
        order: [source.order],
      })
      own.push(failure('type-check', "'parameters' may not match the declared parameters"))
      if (Object.values(entry.parameters).some((declared) => declared.required))
        own.push(failure('missing-required', "'parameters' may omit a required parameter"))
    }

    for (const { pending, by } of body.covered) {
      const lifted = liftCatcher(by, node)
      if (!isDemand(pending)) ctx.sink.push({ pending: liftFailure(pending, node), by: lifted })
      else
        for (const escaped of answer(pending.demand).result.escapes)
          ctx.sink.push({ pending: escaped, by: lifted })
    }
    for (const pending of body.result.escapes) {
      if (isDemand(pending)) own.push(...answer(pending.demand).result.escapes)
      else own.push(liftFailure(pending, node))
    }
    // A body that always fails fails every call
    parts.push({ result: { verdict: body.result.verdict, escapes: [] }, eager: true })
    return this.withFallback(node, combine(own, parts), inner)
  }

  /**
   * A static call's argument: its own failures, and the declaration's check
   * of what it returns. A literal argument was checked statically, and an
   * unsupplied one takes its default.
   */
  private argument(
    node: FragmentCallNode,
    entry: FragmentEntry,
    name: string,
    ctx: Context
  ): Analysed {
    const supplied = (node.parameters as Record<string, CompiledNode> | undefined)?.[name]
    const declared = entry.parameters[name]
    if (supplied === undefined || declared === undefined) return NONE
    const covered: Caught[] = []
    const result = this.walk(supplied, { ...ctx, sink: covered })
    const checked =
      supplied.kind !== 'constant' && !(declared.type === 'any' && !declared.constraints)
    if (!checked) return { result, covered }
    const check: Failure = {
      path: supplied.path,
      code: 'type-check',
      message: `fragment '${node.name}' – parameter '${name}': the argument may not fit the declared type`,
      certainty: 'may',
      parameter: name,
      order: [supplied.order],
    }
    return { result: combine([check], [{ result, eager: true }]), covered }
  }

  private body(entry: FragmentEntry): Analysed {
    const known = this.bodies.get(entry)
    if (known !== undefined) return known
    // Provisional, so a cycle (already refused at registration) ends here
    this.bodies.set(entry, NONE)
    const covered: Caught[] = []
    const result = this.walk(entry.body, { scope: null, sink: covered, body: entry })
    const analysed = { result, covered }
    this.bodies.set(entry, analysed)
    return analysed
  }

  /** A node the static checks refused, which never runs. */
  private staticError(node: CompiledNode, code: string): NodeResult {
    const issue = this.issues.find(
      (sequenced) => sequenced.order === node.order && sequenced.issue.severity === 'error'
    )?.issue
    const failure: Failure = {
      path: node.path,
      code: issue?.code ?? code,
      message: issue?.message ?? 'a static error',
      certainty: 'always',
      order: [node.order],
    }
    return { verdict: 'always', escapes: [failure] }
  }
}

const NONE: Analysed = { result: SAFE, covered: [] }
