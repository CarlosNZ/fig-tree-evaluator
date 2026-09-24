/**
 * Stage 2 of the v2 converter: canonical v2 to canonical v3 ("Stage 2:
 * convert", "Where rules sit" and "Rules that cut across operators" in
 * docs-dev/v3-specs/v3-converter.md). For each node it converts the
 * parameter values first, applies the operator's rule, then attaches the
 * modifiers around the result: `fallback` and `useCache` carry over, alias
 * definitions become `vars`, `outputType` wraps the result in `convert`, and
 * the keys v2 ignored go into a `//` comment. A result that is not a node
 * cannot carry them all, and takes what it can ("A result that is not a
 * node").
 *
 * Two things travel down the walk. The scope maps each alias in reach to its
 * var name, and v2 resolved a reference from the definitions on enclosing
 * nodes, as v3's lexical `vars` do. The path is each value's place in the
 * input, where every issue is reported, taken from stage 1's source records
 * wherever it moved a value.
 *
 * TO-DO: fragment calls (Phase 15.1, chunk 6).
 */
import type { V2Options } from '../migrationTypes'
import { issue, type Fill, type Issue, type IssueCode, type Path } from './issues'
import { normalizeV2, type NodeSource } from './normalize'
import { V3_RULES, applyRule, undecided, type Modifiers, type RuleContext } from './rules'
import { V2_BEHAVIOUR } from './v2/behaviour'
import { V2_PARAMETERS, type V2Operator } from './v2/operators.generated'
import {
  DATA_REFERENCE,
  V3_REFERENCE,
  hasComputed,
  isComputed,
  isLiteral,
  isNode,
  isPlainObject,
  literal,
  needsQuote,
  render,
  type PlainObject,
} from './v3Values'

export interface Conversion {
  expression: unknown
  issues: Issue[]
}

/** Each alias in reach, by its v2 key (`$a`), and every var name taken */
interface Scope {
  vars: ReadonlyMap<string, string>
  names: ReadonlySet<string>
}

/** What a node's result carries besides its defining key and parameters */
interface Carried {
  comment?: unknown
  fallback?: unknown
  useCache?: unknown
  vars?: PlainObject
}

const MODIFIERS = ['fallback', 'useCache', 'outputType']
// The start of every placeholder's note, so a search finds what is left
const NOTE = 'v2 conversion: '
// A `$data` reference to a path, which can be missing
const DATA_READ = /^\$(?:data|d)[.[]/
// The v2 operators that cached, and their default when nothing said
const CACHE_DEFAULTS: Partial<Record<V2Operator, boolean>> = {
  GET: true,
  POST: false,
  GRAPHQL: true,
  SQL: true,
  CUSTOM_FUNCTIONS: false,
}

// What v2's `outputType` did that v3's `convert` does not, by target type
const DIFFERENCES: Record<string, string> = {
  number:
    "v2 took the first number in a text (`'abc4.5x'` was `4.5`), made a text with none `0`, and made `null` `0`, where v3 fails on a text that is not a number, and keeps `null`",
  string:
    "v2 wrote an array or object as text (`[1, 2]` was `'1,2'`) and `null` as `'null'`, where v3 fails on an array or object, which `join` or `buildString` render, and keeps `null`",
  boolean:
    "v2 made any text but `''` `true` (`'false'` was `true`), where v3 reads `'true'` and `'false'` as the booleans they name",
  array: 'v2 wrapped `null` as `[null]`, where v3 keeps `null`',
}

/** The `output-type` issue's account of what differs, for the target type */
const differences = (to: unknown) => {
  const type = to === 'bool' ? 'boolean' : to
  if (typeof type === 'string' && Object.hasOwn(DIFFERENCES, type)) return DIFFERENCES[type]
  const target = isComputed(to) ? 'is computed' : `\`${render(to)}\` is not one v2 had`
  return `the target type ${target}, and v2 guessed differently for each: ${Object.values(DIFFERENCES).join('; ')}`
}

// v2's test for an alias: a `$` and at least one more character
const isAlias = (key: string) => /^\$.+/.test(key)

const hasNodeKey = (value: PlainObject) =>
  Object.hasOwn(value, 'operator') || Object.hasOwn(value, 'fragment')

/**
 * A node in the fixed key order: `//`, the defining key and parameters as
 * they are, then `fallback`, `useCache` and `vars`
 */
const layout = (body: PlainObject, { comment, fallback, useCache, vars }: Carried) => ({
  ...(comment !== undefined && { '//': comment }),
  ...body,
  ...(fallback !== undefined && { fallback }),
  ...(useCache !== undefined && { useCache }),
  ...(vars !== undefined && { vars }),
})

/** A node split into what `layout` puts back together */
const parts = (node: PlainObject) => {
  const { '//': comment, fallback, useCache, vars, ...body } = node
  return { body, carried: { comment, fallback, useCache, vars: vars as PlainObject | undefined } }
}

/** Two nodes' `//` values as one, the inner first */
const joinComments = (inner: unknown, outer: unknown) => {
  if (inner === undefined) return outer
  if (outer === undefined) return inner
  return [...(Array.isArray(inner) ? inner : [inner]), ...(Array.isArray(outer) ? outer : [outer])]
}

/** Two `vars` blocks as one, the outer first; no name is in both */
const joinVars = (outer?: PlainObject, inner?: PlainObject) =>
  outer === undefined ? inner : inner === undefined ? outer : { ...outer, ...inner }

/** Whether a converted value reads the var `name` */
const reads = (value: unknown, name: string): boolean => {
  const reference = `$vars.${name}`
  if (typeof value === 'string')
    return (
      value === reference || value.startsWith(`${reference}.`) || value.startsWith(`${reference}[`)
    )
  if (Array.isArray(value)) return value.some((element) => reads(element, name))
  return (
    isPlainObject(value) && !isLiteral(value) && Object.values(value).some((v) => reads(v, name))
  )
}

/** Every var name declared in a converted value */
const declared = (value: unknown, names: Set<string>) => {
  if (Array.isArray(value)) value.forEach((element) => declared(element, names))
  if (!isPlainObject(value) || isLiteral(value)) return names
  for (const [key, element] of Object.entries(value)) {
    if (key === 'vars' && isPlainObject(element)) Object.keys(element).forEach((n) => names.add(n))
    declared(element, names)
  }
  return names
}

/**
 * Whether a converted value reads data that v2 failed on when it was
 * missing, with no `fallback` beneath to answer: a `$data` path, a `get`
 * with no default, or an `http` or `graphQL` node's `returnPath`
 * ("Fallbacks that caught missing data"). A node's `fallback` answers for
 * everything beneath it except itself and its alias definitions, which v2
 * evaluated outside the node's own `try`.
 */
const uncaughtRead = (value: unknown): boolean => {
  if (typeof value === 'string') return DATA_READ.test(value)
  if (Array.isArray(value)) return value.some(uncaughtRead)
  if (!isPlainObject(value) || isLiteral(value)) return false
  if (isNode(value) && Object.hasOwn(value, 'fallback'))
    return uncaughtRead(value.fallback) || uncaughtRead(value.vars)
  const { operator } = value
  if (operator === 'get' && !Object.hasOwn(value, 'missingPathDefault')) return true
  if ((operator === 'http' || operator === 'graphQL') && Object.hasOwn(value, 'returnPath'))
    return true
  return Object.entries(value).some(([key, element]) => key !== '//' && uncaughtRead(element))
}

class Converter {
  readonly issues: Issue[] = []

  constructor(
    private readonly sources: Map<object, NodeSource>,
    private readonly options: V2Options
  ) {}

  /** The input path of `key` in `container`, whose own path is `path` */
  private pathOf(container: object, key: string | number, path: Path): Path {
    return this.sources.get(container)?.keys[String(key)] ?? [...path, key]
  }

  /** The input path of a value below a node's parameter */
  private pathIn(node: PlainObject, [first, ...rest]: Path, path: Path): Path {
    let at = this.pathOf(node, first, path)
    let container: unknown = node[first]
    for (const key of rest)
      if (typeof container === 'object' && container !== null) {
        at = this.pathOf(container, key, at)
        container = (container as Record<string | number, unknown>)[key]
      } else at = [...at, key]
    return at
  }

  /** A value where v2 evaluated it */
  value(input: unknown, path: Path, scope: Scope): unknown {
    if (Array.isArray(input))
      return input.map((element, i) => this.value(element, this.pathOf(input, i, path), scope))
    if (typeof input === 'string') return this.string(input, scope)
    if (!isPlainObject(input)) return input
    const at = this.sources.get(input)?.path ?? path
    if (Object.hasOwn(input, 'fragment')) throw new Error('TO-DO: fragment calls (chunk 6)')
    if (Object.hasOwn(input, 'operator')) return this.node(input, at, scope)
    return this.plain(input, at, scope)
  }

  /**
   * A reference to an alias in reach reads its var. Any other string was
   * text to v2, so one v3 reads as a reference is quoted.
   */
  private string(input: string, scope: Scope) {
    const name = isAlias(input) ? scope.vars.get(input) : undefined
    if (name !== undefined) return `$vars.${name}`
    return V3_REFERENCE.test(input) ? literal(input) : input
  }

  /**
   * A plain object. With `evaluateFullObject` off, v2 took it as data, so
   * it stays as it is, or is quoted where v3 would read it differently.
   */
  private plain(input: PlainObject, path: Path, scope: Scope): unknown {
    if (!this.options.evaluateFullObject) return needsQuote(input) ? literal(input) : input
    return this.walked(input, path, scope)
  }

  /**
   * A plain object whose values v2 evaluated: its `$` keys are definitions,
   * which become `vars`, and one holding `vars` or `//` as data can only be
   * built
   */
  private walked(input: PlainObject, path: Path, scope: Scope): unknown {
    const { vars, inner } = this.declare(input, path, scope)
    const entries = Object.entries(input)
      .filter(([key]) => !isAlias(key))
      .map(
        ([key, value]) => [key, this.value(value, this.pathOf(input, key, path), inner)] as const
      )
    if (entries.some(([key]) => key === 'vars' || key === '//'))
      return layout(
        { operator: 'buildObject', entries: entries.map(([key, value]) => ({ key, value })) },
        { vars }
      )
    return { ...Object.fromEntries(entries), ...(vars !== undefined && { vars }) }
  }

  /**
   * The alias definitions on an object, as `vars`, and the scope they open.
   * A name loses its `$`, and `.`, `[` and `]`, which v3 rejects, become
   * `_`. A name already taken, on this object or by an enclosing one, gets a
   * numeric suffix, so no var shadows another. v2 evaluated each definition
   * in the enclosing scope, where only a whole `'$name'` it could not
   * resolve read a sibling.
   */
  private declare(container: PlainObject, path: Path, scope: Scope) {
    const keys = Object.keys(container).filter(isAlias)
    if (keys.length === 0) return { inner: scope }
    const taken = new Set(scope.names)
    const names = new Map<string, string>()
    for (const key of keys) {
      const base = key.replace(/^\$+/, '').replace(/[.[\]]/g, '_') || '_'
      let name = base
      for (let n = 2; taken.has(name); n++) name = `${base}_${n}`
      taken.add(name)
      names.set(key, name)
    }
    const vars: PlainObject = Object.fromEntries(
      keys.map((key) => {
        const value = container[key]
        const sibling =
          typeof value === 'string' && value !== key && !scope.vars.has(value)
            ? names.get(value)
            : undefined
        const converted =
          sibling !== undefined
            ? `$vars.${sibling}`
            : this.value(value, this.pathOf(container, key, path), scope)
        return [names.get(key)!, converted]
      })
    )
    const inner: Scope = { vars: new Map([...scope.vars, ...names]), names: taken }
    return { vars, inner }
  }

  /** An operator node: its values, its rule, then its modifiers */
  private node(input: PlainObject, path: Path, scope: Scope): unknown {
    // Stage 1 left these as written, name and all, so they are quoted whole
    const quoted = this.sources.get(input)?.quoted
    if (quoted !== undefined) {
      const { operator } = input
      const name = typeof operator === 'string' ? operator : JSON.stringify(operator)
      if (quoted.code === 'unknown-operator')
        return this.placeholder(input, quoted.code, quoted.at, { name })
      if (quoted.code === 'computed-children')
        return this.placeholder(input, quoted.code, quoted.at, { operator: name })
      return this.placeholder(input, quoted.code, quoted.at)
    }

    const operator = input.operator as V2Operator
    const parameters = V2_PARAMETERS[operator]
      .map(({ name }) => name)
      .filter((name) => name !== 'useCache')

    const { vars, inner } = this.declare(input, path, scope)
    const notes: string[] = []
    const v2: PlainObject = {}
    for (const name of parameters)
      if (Object.hasOwn(input, name)) v2[name] = this.parameter(operator, name, input, path, inner)
    const converted = (key: string) => this.value(input[key], this.pathOf(input, key, path), inner)
    const extra = Object.fromEntries(
      this.extraKeys(input, operator, parameters).map((key) => [key, converted(key)])
    )
    const modifiers: Modifiers = {}
    if (Object.hasOwn(input, 'fallback')) modifiers.fallback = converted('fallback')
    if (Object.hasOwn(input, 'outputType'))
      Object.assign(modifiers, { outputType: converted('outputType'), outputTypeAt: 'outputType' })

    const taken = new Set([...inner.names, ...declared([v2, extra, modifiers], new Set())])
    const context = this.context(input, path, notes, taken)
    const result = applyRule(V3_RULES[operator], { v2, extra, modifiers }, context)

    const useCache = this.useCache(input, operator, context)
    const comment = this.comment(input, [...parameters, ...Object.keys(extra)], notes)
    return this.attach(result, { comment, useCache, vars }, modifiers, context)
  }

  /** A parameter's value, walking the objects the operator evaluated itself */
  private parameter(
    operator: V2Operator,
    key: string,
    input: PlainObject,
    path: Path,
    scope: Scope
  ): unknown {
    const value = input[key]
    const at = this.pathOf(input, key, path)
    if (!V2_BEHAVIOUR[operator]?.evaluatesContents?.includes(key))
      return this.value(value, at, scope)
    if (Array.isArray(value)) {
      if (operator === 'MATCH') return this.branchList(value, at, scope)
      if (operator === 'BUILD_OBJECT') return this.entries(value, at, scope)
    }
    // MATCH evaluated its `branches` whole only as an operator node
    if (
      !isPlainObject(value) ||
      (operator === 'MATCH' ? Object.hasOwn(value, 'operator') : hasNodeKey(value))
    )
      return this.value(value, at, scope)
    const own = this.sources.get(value)?.path ?? at
    const each = (skip: (key: string) => boolean = () => false) => {
      const output: PlainObject = {}
      const ignored: PlainObject = {}
      for (const [k, v] of Object.entries(value))
        if (skip(k)) ignored[k] = v
        else output[k] = this.value(v, this.pathOf(value, k, own), scope)
      return Object.keys(ignored).length > 0 ? { '//': ignored, ...output } : output
    }
    switch (operator) {
      // Branch keys are data, and v2 evaluated the branch that matched
      case 'MATCH':
        return each()
      // No token could read a substitution under a `$` key
      case 'STRING_SUBSTITUTION':
        return this.options.evaluateFullObject ? this.walked(value, own, scope) : each(isAlias)
      // `evaluateObject`, whose `$` keys are definitions
      default:
        return this.walked(value, own, scope)
    }
  }

  /** MATCH's alternating branches: the keys are data, each value a branch */
  private branchList(value: unknown[], path: Path, scope: Scope) {
    return value.map((element, i) =>
      i % 2 === 0 ? element : this.value(element, this.pathOf(value, i, path), scope)
    )
  }

  /**
   * BUILD_OBJECT's entries, whose `key` and `value` v2 evaluated. An array
   * that is not all objects alternates keys and values, each evaluated.
   */
  private entries(value: unknown[], path: Path, scope: Scope) {
    if (this.options.evaluateFullObject || !value.every(isPlainObject))
      return this.value(value, path, scope)
    return value.map((element, i) => {
      const at = this.pathOf(value, i, path)
      if (hasNodeKey(element)) return this.value(element, at, scope)
      const own = this.sources.get(element)?.path ?? at
      const entry: PlainObject = {}
      // v2 ignored an entry's other keys
      for (const key of ['key', 'value'])
        if (Object.hasOwn(element, key))
          entry[key] = this.value(element[key], this.pathOf(element, key, own), scope)
      return entry
    })
  }

  /**
   * The keys a rule reads beside its parameters: MATCH's own branches, left
   * on the node beside a computed `branches`, and SQL's computed `type`
   */
  private extraKeys(input: PlainObject, operator: V2Operator, parameters: string[]) {
    if (operator === 'SQL') return Object.hasOwn(input, 'type') ? ['type'] : []
    if (operator !== 'MATCH') return []
    const known = ['operator', ...parameters, ...MODIFIERS, '//']
    return Object.keys(input).filter((key) => !known.includes(key) && !isAlias(key))
  }

  /**
   * The context a rule is given: issues it raises are reported where their
   * value came from, and a `non-convertible` one is also noted on the node
   */
  private context(
    input: PlainObject,
    path: Path,
    notes: string[],
    taken: Set<string>
  ): RuleContext {
    return {
      options: this.options,
      path,
      at: (key) => this.pathOf(input, key, path),
      issue: <C extends IssueCode>(code: C, at: string | Path | undefined, ...fill: Fill<C>) => {
        const where =
          at === undefined
            ? path
            : typeof at === 'string'
              ? this.pathOf(input, at, path)
              : this.pathIn(input, at, path)
        const raised = issue(code, where, ...fill)
        this.issues.push(raised)
        if (raised.tag === 'non-convertible') notes.push(`${NOTE}${raised.message}`)
      },
      freshVar: (base) => {
        let name = base
        for (let n = 2; taken.has(name); n++) name = `${base}_${n}`
        taken.add(name)
        return name
      },
    }
  }

  /**
   * v3 takes a literal boolean only. Where v2 cached, anything else is a
   * deciding value, and v2's default is written; elsewhere v2 ignored it,
   * PASSTHRU included, whose result may be a node that does cache. v2 left
   * POST uncached unless told otherwise, where v3's `http` caches.
   */
  private useCache(input: PlainObject, operator: V2Operator, context: RuleContext) {
    if (operator === 'PASSTHRU') return undefined
    if (!Object.hasOwn(input, 'useCache'))
      return operator === 'POST' && this.options.useCache !== true ? false : undefined
    const value = input.useCache
    if (typeof value === 'boolean') return value
    const fallback = CACHE_DEFAULTS[operator]
    if (fallback === undefined) return undefined
    const wrote = this.options.useCache ?? fallback
    context.issue('deciding-value', 'useCache', {
      reason: undecided('useCache', value),
      wrote: `\`useCache: ${wrote}\``,
      key: 'useCache',
    })
    return wrote
  }

  /**
   * The node's `//`: the placeholder notes, the author's own `//`, then the
   * keys v2 ignored, as one value or, when there are several, an array
   */
  private comment(input: PlainObject, read: string[], notes: string[]) {
    const known = ['operator', ...read, ...MODIFIERS, '//']
    const ignored = Object.fromEntries(
      Object.entries(input).filter(([key]) => !known.includes(key) && !isAlias(key))
    )
    Object.assign(ignored, this.sources.get(input)?.ignored)
    const all = [
      ...notes,
      ...(Object.hasOwn(input, '//') ? [input['//']] : []),
      ...(Object.keys(ignored).length > 0 ? [ignored] : []),
    ]
    return all.length === 0 ? undefined : all.length === 1 ? all[0] : all
  }

  /**
   * The modifiers around a rule's result. `outputType` wraps it in
   * `convert`, which then carries `fallback` and `vars`, since v2 never
   * converted a fallback's result, while `useCache` stays on the node that
   * does the work.
   */
  private attach(
    result: unknown,
    carried: Carried,
    modifiers: Modifiers,
    context: RuleContext
  ): unknown {
    let { vars } = carried
    const { fallback } = modifiers
    ;({ result, vars } = this.ownVar(result, vars, fallback))
    if (!Object.hasOwn(modifiers, 'outputType'))
      return this.carry(
        result,
        { ...carried, fallback, vars },
        Object.hasOwn(modifiers, 'fallback'),
        context
      )

    const to = modifiers.outputType
    context.issue('output-type', modifiers.outputTypeAt ?? 'outputType', {
      differences: differences(to),
    })
    const worker = isNode(result) && !isLiteral(result)
    const value = worker
      ? this.carry(result, { comment: carried.comment, useCache: carried.useCache }, false, context)
      : result
    return this.carry(
      { operator: 'convert', value, to: to === 'bool' ? 'boolean' : to },
      { comment: worker ? undefined : carried.comment, fallback, vars },
      Object.hasOwn(modifiers, 'fallback'),
      context
    )
  }

  /**
   * A reference to one of the node's own vars is that var's value, since the
   * result is that value. A var nothing else reads then goes.
   */
  private ownVar(result: unknown, vars: PlainObject | undefined, fallback: unknown) {
    const own = { ...vars }
    let name = typeof result === 'string' ? /^\$vars\.([^.[]+)$/.exec(result)?.[1] : undefined
    while (name !== undefined && Object.hasOwn(own, name)) {
      const { [name]: value, ...rest } = own
      result = value
      if (![result, fallback, ...Object.values(rest)].some((v) => reads(v, name!))) delete own[name]
      name = typeof result === 'string' ? /^\$vars\.([^.[]+)$/.exec(result)?.[1] : undefined
    }
    return { result, vars: Object.keys(own).length > 0 ? own : undefined }
  }

  /**
   * What a result carries, by what it is ("A result that is not a node"). A
   * node takes everything; where it has its own `fallback`, the node's goes
   * at the end of that chain, the only place v2's could still answer. A
   * constant or a reference cannot fail and has nothing to cache, so it drops
   * `fallback` and `useCache`, except that a `$data` read that must carry one
   * becomes the equivalent `get`. An object or array holding nodes takes
   * what v3 lets it.
   */
  private carry(result: unknown, carried: Carried, hasFallback: boolean, context: RuleContext) {
    const { comment, fallback, useCache, vars } = carried
    if (isNode(result) && !isLiteral(result)) {
      const { body, carried: own } = parts(result as PlainObject)
      let placed = own.fallback
      if (hasFallback)
        if (own.fallback !== undefined) placed = this.chain(own.fallback, fallback, context)
        else {
          if (uncaughtRead(body) || uncaughtRead(own.vars))
            context.issue('missing-data-fallback', 'fallback')
          placed = fallback
        }
      return layout(body, {
        comment: joinComments(own.comment, comment),
        fallback: placed,
        useCache: own.useCache ?? useCache,
        vars: joinVars(vars, own.vars),
      })
    }

    if (typeof result === 'string' && DATA_REFERENCE.test(result)) {
      const path = result.replace(/^\$(?:data|d)\.?/, '')
      const missable = path !== ''
      if (!(hasFallback && missable) && vars === undefined) return result
      const get = {
        operator: 'get',
        path,
        ...(hasFallback && missable && { missingPathDefault: fallback }),
      }
      return layout(get, { comment, vars })
    }

    if (isPlainObject(result) && !isLiteral(result) && hasComputed(result)) {
      const { vars: own, ...object } = result
      const allVars = joinVars(vars, own as PlainObject | undefined)
      if (!hasFallback) return layout(object, { comment, vars: allVars })
      const built = {
        operator: 'buildObject',
        entries: Object.entries(object).map(([key, value]) => ({ key, value })),
      }
      if (uncaughtRead(built)) context.issue('missing-data-fallback', 'fallback')
      return layout(built, { comment, fallback, vars: allVars })
    }

    if (Array.isArray(result) && hasComputed(result) && (hasFallback || vars !== undefined)) {
      const array = { operator: 'convert', value: result, to: 'array' }
      if (hasFallback && uncaughtRead(array)) context.issue('missing-data-fallback', 'fallback')
      return layout(array, { comment, fallback: hasFallback ? fallback : undefined, vars })
    }

    if (!isLiteral(result) || comment === undefined) return result
    const { body, carried: own } = parts(result)
    return layout(body, { comment: joinComments(own.comment, comment) })
  }

  /**
   * `fallback` hung on the last node of a fallback chain, which is where v2's
   * outer fallback answered: when the inner ones failed too. At a constant
   * the chain cannot fail, and the outer fallback goes.
   */
  private chain(inner: unknown, fallback: unknown, context: RuleContext): unknown {
    if (!isNode(inner) || isLiteral(inner)) return inner
    const { body, carried } = parts(inner as PlainObject)
    if (carried.fallback !== undefined)
      return layout(body, { ...carried, fallback: this.chain(carried.fallback, fallback, context) })
    if (uncaughtRead(body)) context.issue('missing-data-fallback', 'fallback')
    return layout(body, { ...carried, fallback })
  }

  /** The input subtree, quoted whole, with its issue noted on the `literal` */
  private placeholder<C extends IssueCode>(
    input: PlainObject,
    code: C,
    path: Path,
    ...fill: Fill<C>
  ) {
    const raised = issue(code, path, ...fill)
    this.issues.push(raised)
    return literal(input, `${NOTE}${raised.message}`)
  }
}

/** A v2 expression as v3, with an issue for each difference it could see */
export const convertV2 = (expression: unknown, options: V2Options = {}): Conversion => {
  const normalized = normalizeV2(expression, options)
  const converter = new Converter(normalized.sources, options)
  const root: Scope = { vars: new Map(), names: new Set() }
  const converted = converter.value(normalized.expression, [], root)
  return { expression: converted, issues: [...normalized.issues, ...converter.issues] }
}
