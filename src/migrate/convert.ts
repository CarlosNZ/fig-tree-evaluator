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
 * Two things travel down the walk. The scope maps each alias in reach to the
 * reference it becomes, and v2 resolved a reference from the definitions on
 * enclosing nodes, as v3's lexical `vars` do. The path is each value's place
 * in the input, where every issue is reported, taken from stage 1's source
 * records wherever it moved a value.
 *
 * A fragment's body walks the same way, with its parameters outermost in the
 * scope, and a fragment call converts against the catalogue of the fragments
 * ("Fragments"), which is itself found by walking the bodies.
 */
import type {
  FragmentMigrationResult,
  MigrationIssue,
  MigrationResult,
  V2Options,
} from '../migrationTypes'
import {
  definitionOf,
  fragmentCatalogue,
  legalName,
  type BodyWalk,
  type Catalogue,
  type ConvertedDefault,
  type FragmentInfo,
  type OnRead,
} from './fragments'
import { isUnder, issue, type Fill, type IssueCode, type Path } from './issues'
import { normalizeV2, type NodeSource } from './normalize'
import { V3_RULES, applyRule, undecided, type Modifiers, type RuleContext } from './rules'
import { V2_BEHAVIOUR } from './v2/behaviour'
import { V2_PARAMETERS, type V2Operator } from './v2/operators.generated'
import {
  DATA_REFERENCE,
  NOTE,
  V3_REFERENCE,
  constantOf,
  hasComputed,
  isComputed,
  isLiteral,
  isNode,
  isPlainObject,
  literal,
  needsQuote,
  quoted,
  render,
  uncaughtRead,
  type PlainObject,
} from './v3Values'

interface Scope {
  /** Each alias in reach, by its v2 key (`$a`), and the reference it reads */
  refs: ReadonlyMap<string, string>
  /** Every var name taken */
  names: ReadonlySet<string>
  /** In a fragment's body, the reference each of its parameters reads */
  params?: ReadonlyMap<string, string>
}

/** A value the output leaves out, and whether v2 evaluated it */
interface LeftOut {
  input: unknown
  path: Path
  evaluated: boolean
}

/** Where a var's value came from in the input */
type VarSources = ReadonlyMap<string, { input: unknown; path: Path }>

/** A rule's context as stage 2 keeps it, with what its node leaves out */
interface NodeContext extends RuleContext {
  /** Settled once the node is built */
  readonly leftOut: LeftOut[]
  /** Where the node's own issues start, after its values' */
  readonly start: number
  /** Leaves out the node's own vars of these names */
  discardVars: (names: string[]) => void
}

/** What a node's result carries besides its defining key and parameters */
interface Carried {
  comment?: unknown
  fallback?: unknown
  useCache?: unknown
  vars?: PlainObject
}

const MODIFIERS = ['fallback', 'useCache', 'outputType']
// The keys of a fragment call that its conversion reads, besides arguments
const CALL_KEYS = [
  'fragment',
  'parameters',
  'fallback',
  'useCache',
  'outputType',
  'type',
  'operator',
  '//',
]
// The `type` values SQL read as `flatten`
const SQL_RIDER = ['array', 'string', 'number']
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

/**
 * The var names for alias keys, and every name then taken. A name loses its
 * `$`, and `.`, `[` and `]`, which v3 rejects, become `_`. A name already
 * taken gets a numeric suffix, so no var shadows another. A name that needs
 * no change keeps it where nothing outside has it, and the rest take theirs
 * in sorted order, so the order of the keys changes no name.
 */
const varNames = (keys: string[], outside: ReadonlySet<string>) => {
  const taken = new Set(outside)
  const names = new Map<string, string>()
  const base = (key: string) => key.replace(/^\$+/, '').replace(/[.[\]]/g, '_') || '_'
  for (const key of keys)
    if (base(key) === key.slice(1) && !taken.has(key.slice(1))) names.set(key, key.slice(1))
  names.forEach((name) => taken.add(name))
  for (const key of keys.filter((k) => !names.has(k)).sort()) {
    let name = base(key)
    for (let n = 2; taken.has(name); n++) name = `${base(key)}_${n}`
    taken.add(name)
    names.set(key, name)
  }
  return { names, taken }
}

/**
 * Whether an unprefixed argument `name` fills the placeholder of that name:
 * the body's own key of that name holds exactly it, and nothing else reads it
 */
const exact = (fragment: FragmentInfo | undefined, name: string) =>
  fragment?.parameters.get(`$${name}`)?.exact === true

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

class Converter {
  readonly issues: MigrationIssue[] = []
  /** The issues raised inside values the output does not keep */
  private readonly dropped = new Set<MigrationIssue>()
  /** Where those values were, so that stage 1's issues inside them go too */
  private readonly droppedPaths: Path[] = []
  /** What converting each input object raised, in `issues` */
  private readonly raised = new WeakMap<object, { from: number; to: number }>()

  constructor(
    private readonly sources: Map<object, NodeSource>,
    private readonly options: V2Options,
    private readonly fragments: Catalogue,
    /** Set while the catalogue is found: each placeholder a body reads */
    private readonly onRead?: OnRead
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

  /**
   * A value where v2 evaluated it, with a record of what converting it
   * raised, in case the output leaves it out
   */
  value(input: unknown, path: Path, scope: Scope): unknown {
    const from = this.issues.length
    const at = (isPlainObject(input) && this.sources.get(input)?.path) || path
    const output = this.convert(input, at, scope)
    if (typeof input === 'object' && input !== null)
      this.raised.set(input, { from, to: this.issues.length })
    return output
  }

  private convert(input: unknown, path: Path, scope: Scope): unknown {
    if (Array.isArray(input))
      return input.map((element, i) => this.value(element, this.pathOf(input, i, path), scope))
    if (typeof input === 'string') return this.string(input, path, scope)
    if (!isPlainObject(input)) return input
    // Stage 1 left these as written, name and all, so they are quoted whole
    const quoted = this.sources.get(input)?.quoted
    if (quoted !== undefined) {
      const { code, at, name = '' } = quoted
      if (code === 'unknown-operator') return this.placeholder(input, code, at, { name })
      if (code === 'computed-children') return this.placeholder(input, code, at, { operator: name })
      return this.placeholder(input, code, at)
    }
    if (Object.hasOwn(input, 'fragment')) return this.call(input, path, scope)
    if (Object.hasOwn(input, 'operator')) return this.node(input, path, scope)
    return this.plain(input, path, scope)
  }

  /** The issues that stand: none from inside a value the output left out */
  kept(earlier: MigrationIssue[]) {
    const inside = ({ path }: MigrationIssue) =>
      this.droppedPaths.some((dropped) => isUnder(path, dropped))
    return [
      ...earlier.filter((raised) => !inside(raised)),
      ...this.issues.filter((raised) => !this.dropped.has(raised)),
    ]
  }

  /** The issues raised in converting anything inside a value */
  private drop(input: unknown) {
    if (typeof input !== 'object' || input === null) return
    const raised = this.raised.get(input)
    if (raised === undefined) for (const element of Object.values(input)) this.drop(element)
    else for (let i = raised.from; i < raised.to; i++) this.dropped.add(this.issues[i])
  }

  /** Whether stage 1 left a node as written, which is quoted whole */
  private asWritten(value: PlainObject) {
    return this.sources.get(value)?.quoted !== undefined
  }

  /** Whether v2 evaluated anything in a canonical value */
  private evaluates(value: unknown): boolean {
    if (Array.isArray(value)) return value.some((element) => this.evaluates(element))
    if (!isPlainObject(value)) return false
    if (hasNodeKey(value) || this.asWritten(value)) return true
    return (
      this.options.evaluateFullObject === true &&
      Object.values(value).some((element) => this.evaluates(element))
    )
  }

  /**
   * What a node left out, once it is built. The issues raised inside each
   * value go with it, and stage 1's inside it too. A value v2 evaluated gets
   * a `discarded-expression`, since a failure in it failed v2's node, unless
   * a placeholder's note below the node covers the place already.
   */
  private settle({ leftOut, start }: NodeContext, node: Path) {
    for (const { input, path, evaluated } of leftOut) {
      this.drop(input)
      this.droppedPaths.push(path)
      if (!evaluated || !this.evaluates(input)) continue
      const covered = this.issues
        .slice(start)
        .some(
          (other) =>
            other.tag === 'non-convertible' &&
            !this.dropped.has(other) &&
            other.path.length > node.length &&
            isUnder(path, other.path)
        )
      if (!covered) this.issues.push(issue('discarded-expression', path))
    }
  }

  /**
   * A reference to an alias in reach reads its var, or in a body, its
   * parameter. Any other string was text to v2, so one v3 reads as a
   * reference is quoted, except in a body, where a `'$name'` nothing in reach
   * defines is a placeholder, and so a parameter too.
   */
  private string(input: string, path: Path, scope: Scope) {
    if (isAlias(input)) {
      const ref = scope.refs.get(input)
      if (ref !== undefined) {
        if (ref === scope.params?.get(input)) this.onRead?.(input, path, false)
        return ref
      }
      if (this.onRead !== undefined) {
        this.onRead(input, path, false)
        return `$params.${legalName(input)}`
      }
    }
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
   * The alias definitions on an object, as `vars`, and the scope they open,
   * named by `varNames`. v2 evaluated each definition in the enclosing
   * scope, where only a whole `'$name'` it could not resolve read a sibling.
   */
  private declare(
    container: PlainObject,
    path: Path,
    scope: Scope
  ): { vars?: PlainObject; inner: Scope; sources?: VarSources } {
    const keys = Object.keys(container).filter(isAlias)
    if (keys.length === 0) return { inner: scope }
    const { names, taken } = varNames(keys, scope.names)
    const vars: PlainObject = Object.fromEntries(
      keys.map((key) => {
        const value = container[key]
        const sibling =
          typeof value === 'string' && value !== key && !scope.refs.has(value)
            ? names.get(value)
            : undefined
        const converted =
          sibling !== undefined
            ? `$vars.${sibling}`
            : this.value(value, this.pathOf(container, key, path), scope)
        return [names.get(key)!, converted]
      })
    )
    const refs = new Map(scope.refs)
    for (const [key, name] of names) refs.set(key, `$vars.${name}`)
    const inner: Scope = { refs, names: taken, params: scope.params }
    const sources: VarSources = new Map(
      keys.map((key) => [
        names.get(key)!,
        { input: container[key], path: this.pathOf(container, key, path) },
      ])
    )
    return { vars, inner, sources }
  }

  /**
   * An operator node: its values, its rule, then its modifiers. A body's
   * root has no alias definitions of its own, since its `$` keys are
   * defaults, and brings the vars its computed defaults are bound in.
   */
  private node(
    input: PlainObject,
    path: Path,
    scope: Scope,
    own?: { vars?: PlainObject; inner: Scope; sources?: VarSources }
  ): unknown {
    const operator = input.operator as V2Operator
    const parameters = V2_PARAMETERS[operator]
      .map(({ name }) => name)
      .filter((name) => name !== 'useCache')

    const { vars, inner, sources } = own ?? this.declare(input, path, scope)
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
    const context = this.context(input, path, notes, taken, parameters, sources)
    const result = applyRule(V3_RULES[operator], { v2, extra, modifiers }, context)

    const useCache = this.useCache(input, operator, context)
    const comment = this.comment(input, [...parameters, ...Object.keys(extra)], notes)
    const output = this.attach(result, { comment, useCache, vars }, modifiers, context)
    this.settle(context, path)
    return output
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
    // BUILD_OBJECT evaluated the entries of an array alone
    if (operator === 'BUILD_OBJECT') return this.value(value, at, scope)
    // MATCH evaluated its `branches` whole only as an operator node
    if (
      !isPlainObject(value) ||
      this.asWritten(value) ||
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
      if (hasNodeKey(element) || this.asWritten(element)) return this.value(element, at, scope)
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
    taken: Set<string>,
    parameters: string[] = [],
    vars?: VarSources
  ): NodeContext {
    const leftOut: LeftOut[] = []
    return {
      leftOut,
      start: this.issues.length,
      // v2 evaluated each of an operator's parameters before it read them,
      // but its other keys only as it needed them
      discard: (where, from) => {
        const keys = typeof where === 'string' ? [where] : where
        let value: unknown = input
        for (const key of keys) {
          if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return
          value = (value as Record<string | number, unknown>)[key]
        }
        const at = this.pathIn(input, keys, path)
        const evaluated = parameters.includes(String(keys[0]))
        if (from === undefined) leftOut.push({ input: value, path: at, evaluated })
        else if (Array.isArray(value))
          for (let i = from; i < value.length; i++)
            leftOut.push({ input: value[i], path: this.pathOf(value, i, at), evaluated })
      },
      // v2 evaluated every alias definition, read or not
      discardVars: (names) => {
        for (const name of names) {
          const source = vars?.get(name)
          if (source !== undefined) leftOut.push({ ...source, evaluated: true })
        }
      },
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
    context: NodeContext
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
  private carry(result: unknown, carried: Carried, hasFallback: boolean, context: NodeContext) {
    const { comment, fallback, useCache, vars } = carried
    if (isNode(result) && !isLiteral(result)) {
      const { body, carried: own } = parts(result as PlainObject)
      let placed = own.fallback
      if (hasFallback)
        if (own.fallback !== undefined) placed = this.chain(own.fallback, fallback, context)
        else {
          if (this.beneath(body, own.vars)) context.issue('missing-data-fallback', 'fallback')
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
      if (hasFallback && !missable) context.discard('fallback')
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
      if (this.uncaught(built)) context.issue('missing-data-fallback', 'fallback')
      return layout(built, { comment, fallback, vars: allVars })
    }

    if (Array.isArray(result) && hasComputed(result) && (hasFallback || vars !== undefined)) {
      const array = { operator: 'convert', value: result, to: 'array' }
      if (hasFallback && this.uncaught(array)) context.issue('missing-data-fallback', 'fallback')
      return layout(array, { comment, fallback: hasFallback ? fallback : undefined, vars })
    }

    // A constant, a reference or data cannot fail, nor hold vars
    if (hasFallback) context.discard('fallback')
    if (vars !== undefined) context.discardVars(Object.keys(vars))
    if (!isLiteral(result) || comment === undefined) return result
    const { body, carried: own } = parts(result)
    return layout(body, { comment: joinComments(own.comment, comment) })
  }

  /**
   * `fallback` hung on the last node of a fallback chain, which is where v2's
   * outer fallback answered: when the inner ones failed too. At a constant
   * the chain cannot fail, and the outer fallback goes.
   */
  private chain(inner: unknown, fallback: unknown, context: NodeContext): unknown {
    if (!isNode(inner) || isLiteral(inner)) {
      context.discard('fallback')
      return inner
    }
    const { body, carried } = parts(inner as PlainObject)
    if (carried.fallback !== undefined)
      return layout(body, { ...carried, fallback: this.chain(carried.fallback, fallback, context) })
    if (this.beneath(body)) context.issue('missing-data-fallback', 'fallback')
    return layout(body, { ...carried, fallback })
  }

  private uncaught(value: unknown) {
    return uncaughtRead(value, this.fragments.bodyReads)
  }

  /**
   * Whether a node's own `fallback` answered in v2 for missing data beneath
   * it: for a fragment call, its body's, and not its arguments', which were
   * alias definitions ("Calls")
   */
  private beneath(body: PlainObject, vars?: unknown) {
    if (Object.hasOwn(body, 'fragment')) return this.fragments.bodyReads(String(body.fragment))
    return this.uncaught(body) || this.uncaught(vars)
  }

  /**
   * A fragment call ("Calls"): its arguments, read in the caller's scope,
   * then its modifiers. v2 spread the call node beneath the body, so a key
   * that is neither an argument nor a modifier set the body's own.
   */
  private call(input: PlainObject, path: Path, scope: Scope): unknown {
    const fragment = this.fragments.fragments.get(String(input.fragment))
    const notes: string[] = []
    const shared = this.sharedArguments(input, scope, fragment)
    // Nothing on the call reads its vars but its arguments, which v2
    // evaluated in the caller's scope, and no var inside may shadow them
    const inner: Scope = { ...scope, names: shared.taken }
    const context = this.context(input, path, notes, new Set(inner.names))

    const call: PlainObject = { fragment: fragment?.name ?? input.fragment }
    const { parameters, vars } = this.callArguments(
      input,
      path,
      inner,
      fragment,
      context,
      shared.names
    )
    if (parameters !== undefined) call.parameters = parameters
    const modifiers: Modifiers = {}
    if (Object.hasOwn(input, 'fallback'))
      modifiers.fallback = this.value(input.fallback, this.pathOf(input, 'fallback', path), inner)
    this.callOutput(input, path, inner, fragment, modifiers, context)
    if (Object.hasOwn(input, 'useCache')) {
      context.issue('fragment-use-cache', 'useCache')
      context.discard('useCache')
    }
    // The body's own `operator` always replaced the call's
    if (Object.hasOwn(input, 'operator')) {
      context.issue('overridden-value', 'operator', { key: 'operator', winner: 'fragment' })
      context.discard('operator')
    }
    for (const key of Object.keys(input))
      if (!CALL_KEYS.includes(key) && !isAlias(key)) {
        context.issue('body-override', key, { key })
        context.discard(key)
      }

    const all = [...notes, ...(Object.hasOwn(input, '//') ? [input['//']] : [])]
    const comment = all.length === 0 ? undefined : all.length === 1 ? all[0] : all
    const output = this.attach(call, { comment, vars }, modifiers, context)
    this.settle(context, path)
    return output
  }

  /**
   * The call's arguments that another of its arguments reads, and their var
   * names. v2 spread a call's arguments over the body as the alias
   * definitions of one node, so a whole `'$name'` the caller's scope could
   * not resolve read the argument of that name, as a sibling ("Calls"). The
   * readers are the arguments the call keeps, and the arguments they read,
   * in turn.
   */
  private sharedArguments(input: PlainObject, scope: Scope, fragment: FragmentInfo | undefined) {
    const given = input.parameters
    if (!isPlainObject(given) || hasNodeKey(given)) return varNames([], scope.names)
    // A `$` key that loses to its unprefixed spelling is no argument
    const keys = Object.keys(given).filter(
      (key) =>
        isAlias(key) && !(Object.hasOwn(given, key.slice(1)) && exact(fragment, key.slice(1)))
    )
    const reads = (key: string) => {
      const value = given[key]
      return typeof value === 'string' &&
        value !== key &&
        keys.includes(value) &&
        !scope.refs.has(value)
        ? value
        : undefined
    }
    const shared = new Set<string>()
    const readers = keys.filter((key) => fragment === undefined || fragment.parameters.has(key))
    while (readers.length > 0) {
      const read = reads(readers.pop()!)
      if (read === undefined || shared.has(read)) continue
      shared.add(read)
      readers.push(read)
    }
    return varNames(
      keys.filter((key) => shared.has(key)),
      scope.names
    )
  }

  /**
   * A call's arguments, named without their `$`, and the vars of the ones
   * another reads (`sharedArguments`), which each of its readers reads, and
   * which are arguments too only where the definition has them. Computed ones
   * are v3's dynamic arguments, whose `$` names fill nothing, and the
   * call-node arguments stage 1 left beside them go. An unprefixed key
   * replaced the body's own key of that name, which is the argument only
   * where it held exactly that placeholder.
   */
  private callArguments(
    input: PlainObject,
    path: Path,
    scope: Scope,
    fragment: FragmentInfo | undefined,
    context: NodeContext,
    shared: ReadonlyMap<string, string>
  ): { parameters?: unknown; vars?: PlainObject } {
    const given = input.parameters
    const at = this.pathOf(input, 'parameters', path)
    if (given !== undefined && given !== null && (!isPlainObject(given) || hasNodeKey(given))) {
      context.issue('computed-arguments', 'parameters')
      const computed = this.value(given, at, scope)
      if (isComputed(computed)) return { parameters: computed }
      context.leftOut.push({ input: given, path: at, evaluated: false })
      return {}
    }

    const args: PlainObject = {}
    const vars: PlainObject = {}
    const supplied = new Set<string>()
    const entries = isPlainObject(given) ? Object.entries(given) : []
    const own = (isPlainObject(given) && this.sources.get(given)?.path) || at
    const argument = (key: string, value: unknown, valueAt: Path) => {
      const read =
        typeof value === 'string' && value !== key && !scope.refs.has(value)
          ? shared.get(value)
          : undefined
      return read !== undefined ? `$vars.${read}` : this.value(value, valueAt, scope)
    }
    // v2 evaluated every argument, whether the body read it or not
    for (const [key, value] of entries) {
      const where: Path = ['parameters', key]
      const valueAt = this.pathOf(given as PlainObject, key, own)
      const bound = shared.get(key)
      if (bound !== undefined) vars[bound] = argument(key, value, valueAt)
      if (!isAlias(key) && !exact(fragment, key)) {
        context.issue('body-override', where, { key })
        context.leftOut.push({ input: value, path: valueAt, evaluated: false })
        continue
      }
      // v2 laid `parameters` over the body, where the unprefixed key won
      if (
        isAlias(key) &&
        Object.hasOwn(given as PlainObject, key.slice(1)) &&
        exact(fragment, key.slice(1))
      ) {
        context.issue('overridden-value', where, { key, winner: key.slice(1) })
        context.leftOut.push({ input: value, path: valueAt, evaluated: true })
        continue
      }
      const placeholder = isAlias(key) ? key : `$${key}`
      const parameter = fragment?.parameters.get(placeholder)
      if (fragment !== undefined && parameter === undefined) {
        // One another argument reads is its var, and nothing is lost
        if (bound !== undefined) continue
        context.issue('unknown-argument', where, { fragment: fragment.key, name: key })
        context.leftOut.push({ input: value, path: valueAt, evaluated: true })
        continue
      }
      const name = parameter?.name ?? legalName(placeholder)
      args[name] = bound !== undefined ? `$vars.${bound}` : argument(key, value, valueAt)
      supplied.add(placeholder)
    }
    if (fragment !== undefined) this.fill(fragment, supplied, args, path, scope)
    return {
      ...(Object.keys(args).length > 0 && { parameters: args }),
      ...(Object.keys(vars).length > 0 && { vars }),
    }
  }

  /**
   * The parameters a call leaves empty, with no default, which read the
   * caller's aliases of their names in v2 ("Names the body read from its
   * caller"). In a body, a name nothing in reach defines is a placeholder of
   * the body's own, which its caller fills.
   */
  private fill(
    fragment: FragmentInfo,
    supplied: Set<string>,
    args: PlainObject,
    path: Path,
    scope: Scope
  ) {
    for (const parameter of fragment.parameters.values()) {
      if (supplied.has(parameter.key) || parameter.default !== undefined) continue
      let ref = scope.refs.get(parameter.key)
      if (ref === undefined) {
        if (this.onRead === undefined) continue
        this.onRead(parameter.key, path, true)
        ref = `$params.${legalName(parameter.key)}`
      } else if (ref === scope.params?.get(parameter.key)) this.onRead?.(parameter.key, path, true)
      args[parameter.name] = ref
    }
  }

  /**
   * The call's output type, its `outputType` or else its `type`. The spread
   * made it the body's, which v2 read as `outputType ?? type`, so what it did
   * depends on the body ("Calls").
   */
  private callOutput(
    input: PlainObject,
    path: Path,
    scope: Scope,
    fragment: FragmentInfo | undefined,
    modifiers: Modifiers,
    context: NodeContext
  ) {
    const key = ['outputType', 'type'].find((k) => Object.hasOwn(input, k))
    if (key === undefined) return
    // v2 read neither spelling that it never applied
    if (key === 'outputType' && Object.hasOwn(input, 'type')) {
      context.issue('overridden-value', 'type', { key: 'type', winner: 'outputType' })
      context.discard('type')
    }
    if (fragment !== undefined) {
      const unused = (reason: string) => {
        context.issue('unused-output-type', key, {
          key,
          reason: `the body of \`${fragment.key}\` ${reason}`,
        })
        context.discard(key)
      }
      if (fragment.body === undefined)
        return unused('is not an operator node, which v2 returned as it was')
      if (fragment.ownOutput === 'outputType' || (fragment.ownOutput === 'type' && key === 'type'))
        return unused('sets its own output type')
      // PLUS's own parameter, or SQL's rider, which changed what it computed
      const type = input.type
      const rider =
        fragment.operator === 'SQL' &&
        ((typeof type === 'object' && type !== null) ||
          (typeof type === 'string' && (isAlias(type) || SQL_RIDER.includes(type))))
      if (key === 'type' && (fragment.operator === 'PLUS' || rider)) {
        context.issue('body-override', 'type', { key })
        return context.discard('type')
      }
      if (key === 'outputType' && fragment.convertsByType)
        context.issue('replaced-output-type', 'outputType', { fragment: fragment.key })
    }
    const value = this.value(input[key], this.pathOf(input, key, path), scope)
    Object.assign(modifiers, { outputType: value, outputTypeAt: key })
  }

  /**
   * A fragment's body ("Definitions"): each placeholder reads its parameter.
   * v3's defaults are constants, so a computed one is bound once at the root,
   * where the body reads it: v3's own recipe, with `firstOf` over the
   * argument.
   */
  body(fragment: FragmentInfo) {
    const params = new Map(
      [...fragment.parameters.values()].map(({ key, name }) => [key, `$params.${name}`])
    )
    const outer: Scope = { refs: params, names: new Set(), params }
    const refs = new Map(params)
    const defaults = new Map<string, ConvertedDefault>()
    const bound: PlainObject = {}
    const sources = new Map<string, { input: unknown; path: Path }>()
    for (const { key, name, default: given } of fragment.parameters.values()) {
      if (given === undefined) continue
      const value = this.value(given.value, given.path, outer)
      if (!hasComputed(value)) {
        defaults.set(key, { constant: constantOf(value) })
        continue
      }
      defaults.set(key, 'computed')
      bound[name] = { operator: 'firstOf', values: [`$params.${name}`, value] }
      sources.set(name, { input: given.value, path: given.path })
      refs.set(key, `$vars.${name}`)
    }
    const inner: Scope = { refs, names: new Set(Object.keys(bound)), params: refs }
    const vars = inner.names.size > 0 ? bound : undefined
    const top = fragment.body!
    const path = this.sources.get(top)?.path ?? [fragment.key]
    // A body left as written is quoted whole, and reads nothing
    if (this.sources.get(top)?.quoted !== undefined)
      return { expression: this.value(top, path, inner), defaults }
    return { expression: this.node(top, path, inner, { vars, inner, sources }), defaults }
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

/** Stage 2's walk of a body, as the catalogue is found */
const walk =
  (options: V2Options): BodyWalk =>
  (fragment, catalogue, onRead) =>
    new Converter(fragment.sources, options, catalogue, onRead).body(fragment).expression

/**
 * The options as v2 read them: its flags by truthiness, `caseInsensitive`
 * and `useCache` through `??`, and fragments and function names only in a
 * shape v2 could use, so that no stage meets a malformed one
 */
const readOptions = (given: unknown): V2Options => {
  const options: PlainObject = isPlainObject(given) ? given : {}
  const { fragments, functions, useCache } = options
  return {
    fragments: isPlainObject(fragments) ? fragments : {},
    functions: Array.isArray(functions)
      ? functions.filter((name) => typeof name === 'string')
      : isPlainObject(functions)
        ? Object.keys(functions)
        : [],
    evaluateFullObject: Boolean(options.evaluateFullObject),
    noShorthand: Boolean(options.noShorthand),
    caseInsensitive: Boolean(options.caseInsensitive),
    ...(useCache !== undefined && useCache !== null && { useCache: Boolean(useCache) }),
  }
}

// A plain object from any realm, and not a Date, a Map or a class's instance
const isJsonObject = (value: object) => {
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || Object.getPrototypeOf(prototype) === null
}

/**
 * The options as a key, which two options share only if they hold the same
 * JSON. Anything else in them, such as `undefined`, a Date, a function, a
 * number JSON has no form for or a cycle, gives no key.
 */
const keyOf = (options: V2Options): string | undefined => {
  try {
    return JSON.stringify(options, function (this: PlainObject, key: string, value: unknown) {
      const written = this[key]
      const json =
        written === null ||
        typeof written === 'string' ||
        typeof written === 'boolean' ||
        (typeof written === 'number' && Number.isFinite(written)) ||
        (typeof written === 'object' && (Array.isArray(written) || isJsonObject(written)))
      if (!json) throw new TypeError('not JSON')
      return value
    })
  } catch {
    return undefined
  }
}

// The last catalogue, and the options it came from. A script converts its
// expressions against one options object, and finding a catalogue walks
// every fragment's body.
let last: { key: string; catalogue: Catalogue } | undefined

/** The fragments' catalogue, found again only for options not seen last */
const catalogueFor = (options: V2Options) => {
  const key = keyOf(options)
  if (key !== undefined && key === last?.key) return last.catalogue
  const catalogue = fragmentCatalogue(options, walk(options))
  if (key !== undefined) last = { key, catalogue }
  return catalogue
}

/** A v2 expression as v3, with an issue for each difference it could see */
export const convertV2 = (expression: unknown, given?: V2Options): MigrationResult => {
  const options = readOptions(given)
  const normalized = normalizeV2(expression, options)
  const converter = new Converter(normalized.sources, options, catalogueFor(options))
  const root: Scope = { refs: new Map(), names: new Set() }
  const converted = converter.value(normalized.expression, [], root)
  return { expression: converted, issues: converter.kept(normalized.issues) }
}

/**
 * v2's fragment definitions (`V2Options.fragments`) as v3's, keyed by their
 * v3 names, with an issue for each difference it could see, at paths rooted
 * at the fragments object
 */
export const convertV2Fragments = (given: V2Options): FragmentMigrationResult => {
  const options = readOptions(given)
  // Found afresh, since what it quotes as data goes into the result
  const catalogue = fragmentCatalogue(options, walk(options))
  const fragments: FragmentMigrationResult['fragments'] = {}
  const issues: MigrationIssue[] = []
  for (const fragment of catalogue.fragments.values()) {
    // v2 returned a body that is not an operator node as it was
    if (fragment.body === undefined) {
      issues.push(...fragment.issues)
      fragments[fragment.name] = definitionOf(fragment, quoted(fragment.data), new Map(), issues)
      continue
    }
    const converter = new Converter(fragment.sources, options, catalogue)
    const { expression, defaults } = converter.body(fragment)
    issues.push(...converter.kept(fragment.issues))
    fragments[fragment.name] = definitionOf(fragment, expression, defaults, issues)
  }
  return { fragments, issues }
}
