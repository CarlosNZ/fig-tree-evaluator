/**
 * The coverage walk ("The walk" in docs-dev/v3-specs/v3-fallback-coverage.md):
 * post-order over the compiled tree, giving every node a verdict, the
 * failures that can leave it uncaught, and what it can return. A fallback
 * catches everything that escapes its node, and what it catches goes to
 * the sink as covered.
 *
 * A child's failure is passed up whatever its parameter's delivery mode,
 * unless a run of its node (rule 4, ./run.ts) shows which children the node
 * uses: one no run reaches reports nothing. A run is async, so the walk is
 * too, and it visits children one at a time, so no sibling ever reads a
 * cache's provisional entry.
 */
import { bindsReference, renamedBinding, splice } from '../compile/artifact'
import type {
  CompiledNode,
  ElementsNode,
  EntriesNode,
  FragmentCallNode,
  OperatorNode,
  ReferenceNode,
  SequencedIssue,
  SkeletonNode,
} from '../compile/artifact'
import type { FragmentEntry, FragmentParameter } from '../fragments'
import type { PathSegment } from '../primitives/path'
import { isDemand, liftCatcher, liftFailure } from './findings'
import type { Caught, Failure, Pending } from './findings'
import { argumentInput, checkElementResult, resolveInputs } from './inputs'
import { ownFailures, rulesOf } from './rules'
import { atBoundary, operatorOutput } from './outputs'
import { runNode } from './run'
import type { Child, Ran } from './run'
import type { RuleOptions } from './rules'
import { ANY, NOTHING, tupleOf, drill, elementsOf, exactly, keyOf, objectOf, union } from './known'
import type { Known } from './known'

export type Verdict = 'no' | 'may' | 'always'

/** What the walk knows of a node. */
export interface NodeResult {
  /** Whether the node can throw: never, for some inputs, or whenever reached */
  verdict: Verdict
  /** What can leave the node uncaught, each where it starts */
  escapes: Pending[]
  /** What the node can return; nothing, when it never does */
  output: Known
}

/** A vars block in force, linked to the scope it was declared in. */
type Scope = { vars: Record<string, CompiledNode>; parent: Scope } | null

const pushScope = (parent: Scope, vars: Record<string, CompiledNode> | undefined): Scope =>
  vars === undefined ? parent : { vars, parent }

/** An iterator's binding frame: the `as` name, and what an element can be. */
type Bindings = { as: string | null; element: Known; parent: Bindings } | null

/** The input, or one fragment body as one call binds its parameters. */
interface Frame {
  /** Each var definition walked here, with what its fallbacks caught */
  vars: Map<CompiledNode, Analysed>
  entry?: FragmentEntry
  params?: Record<string, Known>
}

/** Where a node is walked. */
interface Context {
  scope: Scope
  bindings: Bindings
  sink: Caught[]
  frame: Frame
}

/** A subtree walked on its own, with what its fallbacks caught. */
interface Analysed {
  result: NodeResult
  covered: Caught[]
}

/**
 * A child the body asks for, walked on its own: it counts only once a run
 * reaches it, or where the node is not run.
 */
interface Apart extends Child, Analysed {}

type Part = { result: NodeResult; eager: boolean }

const SAFE: NodeResult = { verdict: 'no', escapes: [], output: NOTHING }
const NONE: Analysed = { result: SAFE, covered: [] }
const INTEGER: Known = [{ type: 'integer' }]
const NULL = exactly(null)

/**
 * A node's failures from its own and its children's. Only an eager child,
 * or a check of its own, that always fails makes the node always fail, and
 * then it never returns; anything else that escapes makes it able to fail.
 */
const combine = (own: Pending[], parts: Part[], output: Known): NodeResult => {
  const escapes = [...own]
  for (const part of parts) escapes.push(...part.result.escapes)
  const always =
    parts.some((part) => part.eager && part.result.verdict === 'always') ||
    own.some((pending) => !isDemand(pending) && pending.certainty === 'always')
  if (always) return { verdict: 'always', escapes, output: NOTHING }
  return { verdict: escapes.length > 0 ? 'may' : 'no', escapes, output }
}

/**
 * A plain literal's shape, with each hole's output in its place: an exact
 * value where every hole's is, so the engine's own checks judge it.
 */
const skeletonOutput = (node: SkeletonNode, outputs: Known[]): Known => {
  if (outputs.every((output) => output.length === 1 && 'exact' in output[0]))
    return exactly(
      splice(
        node.skeleton,
        node.holes,
        outputs.map((output) => (output[0] as { exact: unknown }).exact)
      )
    )
  const holes = node.holes.map((hole, i) => ({ at: hole.at, output: outputs[i] }))
  const build = (value: unknown, depth: number, inner: typeof holes): Known => {
    const here = inner.find((hole) => hole.at.length === depth)
    if (here !== undefined) return here.output
    if (inner.length === 0) return exactly(value)
    const under = (key: string | number) => inner.filter((hole) => hole.at[depth] === key)
    // A skeleton leaves its holes' slots empty, which `map` would skip
    if (Array.isArray(value))
      return tupleOf(Array.from(value, (element, i) => build(element, depth + 1, under(i))))
    const source = value as Record<string, unknown>
    const keys = new Set([...Object.keys(source), ...inner.map((hole) => String(hole.at[depth]))])
    const known: Record<string, Known> = {}
    for (const key of keys) known[key] = build(source[key], depth + 1, under(key))
    return objectOf(known)
  }
  return build(node.skeleton, 0, holes)
}

/**
 * Var definitions are walked once each per frame, in the scope they were
 * declared in. A fragment body is walked once for each set of arguments it
 * is called with, with its parameters bound to what they receive; a body
 * reading a parameter leaves a demand, which the call answers with the
 * argument's own findings.
 */
export class Analysis {
  private readonly bodies = new Map<FragmentEntry, Map<string, Analysed>>()

  private readonly strict: boolean

  constructor(
    private readonly options: RuleOptions,
    private readonly issues: SequencedIssue[]
  ) {
    this.strict = options.evaluation.strictDataPaths === true
  }

  /** The expression's root, with its fallbacks' catches in `sink`. */
  root(node: CompiledNode, sink: Caught[]): Promise<NodeResult> {
    return this.walk(node, { scope: null, bindings: null, sink, frame: { vars: new Map() } })
  }

  private async walk(node: CompiledNode, ctx: Context): Promise<NodeResult> {
    switch (node.kind) {
      case 'constant':
        return { ...SAFE, output: exactly(node.value) }
      case 'invalid':
        return this.staticError(node, 'malformed-node')
      case 'reference':
        return this.reference(node, ctx)
      case 'skeleton': {
        // Every hole is evaluated
        const inner = { ...ctx, scope: pushScope(ctx.scope, node.vars) }
        const parts: Part[] = []
        for (const hole of node.holes)
          parts.push({ result: await this.walk(hole.node, inner), eager: true })
        const output = skeletonOutput(
          node,
          parts.map((part) => part.result.output)
        )
        return combine([], parts, output)
      }
      case 'elements':
      case 'entries': {
        const children: Apart[] = []
        const output = await this.container('', node, ctx, children)
        for (const child of children) ctx.sink.push(...child.covered)
        const parts = children.map(({ result }) => ({ result, eager: false }))
        return combine([], parts, output)
      }
      case 'operator':
        return this.operator(node, ctx)
      case 'fragmentCall':
        return this.call(node, ctx)
    }
    return node satisfies never
  }

  /**
   * The node's vars are in scope for its parameters and its fallback. A
   * parameter the body asks for (a lazy one, the elements of a literal
   * container at a container-lazy one, an `each`) is walked apart, and
   * counts only where a run reaches it, or where the node is not run. A
   * `perElement` parameter is walked last, with `$element` bound to the
   * elements of what its `over` sibling receives.
   */
  private async operator(node: OperatorNode, ctx: Context): Promise<NodeResult> {
    const { definition } = node.entry
    const inner = { ...ctx, scope: pushScope(ctx.scope, node.vars) }
    const outputs: Record<string, Known> = {}
    const parts: Part[] = []
    const children: Apart[] = []
    for (const [name, child] of Object.entries(node.params)) {
      const mode = definition.parameters[name]?.evaluation
      if (mode === 'perElement') continue
      if (child.kind === 'elements' || child.kind === 'entries')
        outputs[name] = await this.container(name, child, inner, children)
      else if (mode === 'lazy') {
        const apart = await this.apart(name, child, inner)
        outputs[name] = apart.result.output
        children.push(apart)
      } else {
        // Evaluated before the body: an eager parameter, a container-lazy
        // one handed anything but its literal container, a structural one
        const result = await this.walk(child, inner)
        outputs[name] = result.output
        parts.push({ result, eager: true })
      }
    }
    const inputs = resolveInputs(node, outputs)

    const as = renamedBinding(node)
    const elements: Record<string, Known> = {}
    for (const [name, declared] of definition.resolution.perElement) {
      const child = node.params[name]
      if (child === undefined || declared.over === undefined) continue
      const element = elementsOf(inputs.received[declared.over] ?? NOTHING)
      const bindings = { as, element, parent: ctx.bindings }
      const apart = await this.apart(name, child, { ...inner, bindings })
      children.push(apart)
      elements[name] = apart.result.output
    }

    // An eager child that always fails means the body never runs: its own
    // checks are moot, and only a race's elements, started beside the eager
    // children, are reached
    const ran: Ran | undefined = parts.some((part) => part.result.verdict === 'always')
      ? {
          output: NOTHING,
          failures: [],
          reached: new Set(
            children.filter((child) => definition.parameters[child.param].evaluation === 'race')
          ),
          escaped: new Set(),
          passed: new Set(),
          fails: true,
        }
      : rulesOf(definition) === 'external'
        ? undefined
        : await runNode(node, outputs, children, this.options)
    const own: Pending[] = []
    if (ran === undefined) {
      own.push(...inputs.failures)
      // A null that must propagate means the body never runs
      if (inputs.propagates !== 'yes') own.push(...ownFailures(node, inputs, this.options))
    } else own.push(...ran.failures)
    for (const child of children) {
      if (ran !== undefined && !ran.passed.has(child)) continue
      // Vetted as the body asks for it: a lazy parameter's own check is in
      // the inputs' failures, an `each` is checked per element
      const declared = definition.parameters[child.param]
      if (declared.evaluation === 'perElement') {
        const failure = checkElementResult(node, child.param, declared, child.result.output)
        if (failure !== undefined) own.push(failure)
      } else if (ran !== undefined && child.at === undefined)
        own.push(...inputs.failures.filter((failure) => failure.parameter === child.param))
    }

    const { output, boundary } =
      ran === undefined
        ? operatorOutput(node, inputs, elements, this.options.numbers)
        : atBoundary(node, ran.output, this.options.numbers, false)
    // One `non-finite-result` finding a node, whether a rule or the result
    // boundary says so
    if (boundary !== undefined && !own.some((f) => !isDemand(f) && f.code === boundary.code))
      own.push(boundary)

    for (const child of children) {
      if (ran !== undefined && !ran.reached.has(child)) continue
      ctx.sink.push(...child.covered)
      // A child the node runs without its failure still reads what it reads
      const escapes =
        ran === undefined || ran.escaped.has(child)
          ? child.result.escapes
          : child.result.escapes.filter(isDemand)
      parts.push({ result: { ...child.result, escapes }, eager: false })
    }
    const attempt = combine(own, parts, output)
    // Every run failed: the node never returns
    if (ran?.fails === true) Object.assign(attempt, { verdict: 'always', output: NOTHING })
    return this.withFallback(node, attempt, inner)
  }

  /** A child walked with its own sink, until a run says whether it counts. */
  private async apart(
    param: string,
    node: CompiledNode,
    ctx: Context,
    at?: number | string
  ): Promise<Apart> {
    const covered: Caught[] = []
    const result = await this.walk(node, { ...ctx, sink: covered })
    return { param, ...(at !== undefined ? { at } : {}), result, covered }
  }

  /**
   * A literal container at a container-lazy parameter: each element or
   * entry walked apart, since the body asks for each on its own. A vars
   * block on an entries map scopes its entries.
   */
  private async container(
    param: string,
    node: ElementsNode | EntriesNode,
    ctx: Context,
    children: Apart[]
  ): Promise<Known> {
    if (node.kind === 'elements') {
      const items: Known[] = []
      for (const [index, element] of node.nodes.entries()) {
        const apart = await this.apart(param, element, ctx, index)
        children.push(apart)
        items.push(apart.result.output)
      }
      return tupleOf(items)
    }
    const inner = { ...ctx, scope: pushScope(ctx.scope, node.vars) }
    const keys: Record<string, Known> = {}
    for (const [key, value] of Object.entries(node.entries)) {
      const apart = await this.apart(param, value, inner, key)
      children.push(apart)
      keys[key] = apart.result.output
    }
    return objectOf(keys)
  }

  /**
   * A fallback catches everything that escapes its node's attempt, and what
   * escapes the node is then the fallback's own. An `operatorDefaults`
   * fallback is returned as it is, never evaluated, so nothing escapes it.
   * A node that cannot fail never runs its fallback.
   */
  private async withFallback(
    node: OperatorNode | FragmentCallNode,
    attempt: NodeResult,
    ctx: Context
  ): Promise<NodeResult> {
    if (attempt.verdict === 'no') return attempt
    const defaults = node.kind === 'operator' ? node.entry.instanceDefaults : undefined
    const fromDefaults = defaults !== undefined && Object.hasOwn(defaults, 'fallback')
    if (node.fallback === undefined && !fromDefaults) return attempt
    const by = { path: node.path }
    for (const pending of attempt.escapes) ctx.sink.push({ pending, by })
    if (node.fallback === undefined)
      return { ...SAFE, output: union(attempt.output, exactly(defaults!.fallback)) }
    const answer = await this.walk(node.fallback, ctx)
    // The fallback runs only when the attempt fails
    const verdict =
      attempt.verdict === 'always' || answer.verdict !== 'always' ? answer.verdict : 'may'
    return {
      verdict,
      escapes: answer.escapes,
      output: union(attempt.output, answer.output),
    }
  }

  /**
   * A var passes on whatever its definition can fail on and return, and a
   * parameter leaves a demand for its argument. A missing path is null,
   * or under `strictDataPaths` a failure, where the reference drills past
   * what it names; `$index` never drills.
   */
  private async reference(node: ReferenceNode, ctx: Context): Promise<NodeResult> {
    const { segments } = node
    switch (node.namespace) {
      case 'index':
        return { ...SAFE, output: INTEGER }
      case 'data':
        return this.drilled(node, ANY, segments, [], [])
      case 'element': {
        for (let frame = ctx.bindings; frame !== null; frame = frame.parent)
          if (bindsReference(frame.as, 'element', node.binding))
            return this.drilled(node, frame.element, segments, [], [])
        return this.staticError(node, 'unresolved-binding')
      }
      case 'vars': {
        const definition = await this.varDefinition(segments[0], ctx)
        if (definition === undefined) return this.staticError(node, 'unresolved-var')
        ctx.sink.push(...definition.covered)
        const parts = [{ result: definition.result, eager: true }]
        return this.drilled(node, definition.result.output, segments.slice(1), parts, [])
      }
      case 'params': {
        const { entry, params = {} } = ctx.frame
        if (entry === undefined) return this.staticError(node, 'unresolved-param')
        const [name, ...rest] = segments
        // Bare `$params` reads every declared parameter
        if (name === undefined) {
          const demands = Object.keys(entry.parameters).map((declared) => ({ demand: declared }))
          return this.drilled(node, objectOf(params), [], [], demands)
        }
        const known = typeof name === 'string' ? (params[name] ?? ANY) : ANY
        return this.drilled(node, known, rest, [], [{ demand: String(name) }])
      }
    }
    return node.namespace satisfies never
  }

  private drilled(
    node: ReferenceNode,
    known: Known,
    segments: PathSegment[],
    parts: Part[],
    own: Pending[]
  ): NodeResult {
    const { value, found } = drill(known, segments)
    if (found === 'yes') return combine(own, parts, value)
    if (!this.strict) return combine(own, parts, union(value, NULL))
    const missing: Failure = {
      path: node.path,
      code: 'missing-data-path',
      message: `'${node.raw}' may be absent (strictDataPaths)`,
      certainty: found === 'no' ? 'always' : 'may',
      order: [node.order],
    }
    return combine([...own, missing], parts, value)
  }

  private async varDefinition(name: unknown, ctx: Context): Promise<Analysed | undefined> {
    const known = ctx.frame.vars
    for (let frame = ctx.scope; frame !== null; frame = frame.parent) {
      if (typeof name !== 'string' || !Object.hasOwn(frame.vars, name)) continue
      const definition = frame.vars[name]
      const cached = known.get(definition)
      if (cached !== undefined) return cached
      // Provisional, so a cycle (already a static error) ends here
      known.set(definition, { result: { ...SAFE, output: ANY }, covered: [] })
      const covered: Caught[] = []
      const result = await this.walk(definition, { ...ctx, scope: frame, sink: covered })
      const analysed = { result, covered }
      known.set(definition, analysed)
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
  private async call(node: FragmentCallNode, ctx: Context): Promise<NodeResult> {
    const { entry } = node
    if (entry === undefined) return this.staticError(node, 'unknown-fragment')
    const inner = { ...ctx, scope: pushScope(ctx.scope, node.vars) }
    const own: Pending[] = []
    const parts: Part[] = []
    const bound: Record<string, Known> = {}
    const answers = new Map<string, Analysed>()

    if (node.argumentsMode === 'static')
      for (const [name, declared] of Object.entries(entry.parameters)) {
        const argument = await this.argument(node, name, declared, inner)
        answers.set(name, argument)
        bound[name] = argument.result.output
      }
    else {
      const source = node.parameters as CompiledNode
      const result = await this.walk(source, inner)
      parts.push({ result, eager: true })
      own.push(...dynamicArguments(node, entry, source, bound))
    }

    // What a demand for `name` brings in: nothing for a dynamic call
    const answer = (name: string): Analysed => {
      const known = answers.get(name) ?? NONE
      ctx.sink.push(...known.covered)
      return known
    }
    const body = await this.body(entry, bound)
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
    parts.push({ result: { ...body.result, escapes: [] }, eager: true })
    return this.withFallback(node, combine(own, parts, body.result.output), inner)
  }

  /**
   * A static call's argument: its own failures, and the declaration's check
   * of what it returns. An unsupplied one takes its default, else null.
   */
  private async argument(
    node: FragmentCallNode,
    name: string,
    declared: FragmentParameter,
    ctx: Context
  ): Promise<Analysed> {
    const supplied = (node.parameters as Record<string, CompiledNode> | undefined)?.[name]
    if (supplied === undefined)
      return { result: { ...SAFE, output: exactly(declared.default ?? null) }, covered: [] }
    const covered: Caught[] = []
    const result = await this.walk(supplied, { ...ctx, sink: covered })
    const { known, answer } = argumentInput(declared, result.output)
    const own: Failure[] =
      answer === 'yes' ? [] : [argumentCheck(node, name, supplied.path, supplied.order)]
    return { result: combine(own, [{ result, eager: true }], known), covered }
  }

  private async body(entry: FragmentEntry, params: Record<string, Known>): Promise<Analysed> {
    const key = Object.keys(params)
      .map((name) => `${name}=${keyOf(params[name])}`)
      .join(';')
    let calls = this.bodies.get(entry)
    if (calls === undefined) this.bodies.set(entry, (calls = new Map()))
    const known = calls.get(key)
    if (known !== undefined) return known
    // Provisional, so a cycle (already refused at registration) ends here
    calls.set(key, { result: { ...SAFE, output: ANY }, covered: [] })
    const covered: Caught[] = []
    const frame: Frame = { vars: new Map(), entry, params }
    const result = await this.walk(entry.body, {
      scope: null,
      bindings: null,
      sink: covered,
      frame,
    })
    const analysed = { result, covered }
    calls.set(key, analysed)
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
    return combine([failure], [], NOTHING)
  }
}

const argumentCheck = (
  node: FragmentCallNode,
  name: string,
  path: FragmentCallNode['path'],
  order: number
): Failure => ({
  path,
  code: 'type-check',
  message: `fragment '${node.name}' – parameter '${name}': the argument may not fit the declared type`,
  certainty: 'may',
  parameter: name,
  order: [order],
})

/**
 * A dynamic call's arguments object, checked whole before the body runs
 * (`dynamicFrame` in src/evaluate/fragment.ts): it must be an object, and
 * a required parameter must be in it. Its shape is not followed, so each
 * parameter is bound to whatever its declaration admits.
 */
const dynamicArguments = (
  node: FragmentCallNode,
  entry: FragmentEntry,
  source: CompiledNode,
  bound: Record<string, Known>
): Failure[] => {
  const failure = (code: string, message: string): Failure => ({
    path: source.path,
    code,
    message: `fragment '${node.name}' – ${message}`,
    certainty: 'may',
    order: [source.order],
  })
  const declared = Object.entries(entry.parameters)
  for (const [name, parameter] of declared) bound[name] = argumentInput(parameter, ANY).known
  const failures = [failure('type-check', "'parameters' may not match the declared parameters")]
  if (declared.some(([, parameter]) => parameter.required))
    failures.push(failure('missing-required', "'parameters' may omit a required parameter"))
  return failures
}
