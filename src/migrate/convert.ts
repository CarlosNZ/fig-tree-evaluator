/**
 * Stage 2 of the v2 converter: canonical v2 to canonical v3 ("Stage 2:
 * convert", "Where rules sit" and "Rules that cut across operators" in
 * docs-dev/v3-specs/v3-converter.md). For each node it converts the
 * parameter values first, applies the operator's rule, then attaches the
 * modifiers around the result: `fallback` and `useCache` carry over, alias
 * definitions become `vars`, `outputType` wraps the result in `convert`, and
 * the keys v2 ignored go into a `//` comment.
 *
 * Two things travel down the walk. The scope maps each alias in reach to its
 * var name, and v2 resolved a reference from the definitions on enclosing
 * nodes, as v3's lexical `vars` do. The path is each value's place in the
 * input, where every issue is reported, taken from stage 1's source records
 * wherever it moved a value.
 *
 * TO-DO: fragment calls (Phase 15.1, chunk 6); with batches 2 to 5 (chunk 5),
 * the results that are not nodes ("A result that is not a node") and the
 * objects an operator evaluated itself (`evaluatesContents`).
 */
import type { V2Options } from '../migrationTypes'
import { issue, type Fill, type Issue, type IssueCode, type Path } from './issues'
import { normalizeV2, type NodeSource } from './normalize'
import { V3_RULES, applyRule, isComputed, render, undecided, type RuleContext } from './rules'
import { v2OperatorFor } from './v2/names'
import { V2_PARAMETERS, type V2Operator } from './v2/operators.generated'

type PlainObject = Record<string, unknown>

export interface Conversion {
  expression: unknown
  issues: Issue[]
}

/** Each alias in reach, by its v2 key (`$a`), and every var name taken */
interface Scope {
  vars: ReadonlyMap<string, string>
  names: ReadonlySet<string>
}

const MODIFIERS = ['fallback', 'useCache', 'outputType']
// The start of every placeholder's note, so a search finds what is left
const NOTE = 'v2 conversion: '
// v3's reference token rule: a namespace, whole or followed by `.` or `[`
const V3_REFERENCE = /^\$(?:data|d|vars|v|params|p|element|e|index|i)(?:$|[.[])/
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

const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// v2's test for an alias: a `$` and at least one more character
const isAlias = (key: string) => /^\$.+/.test(key)

const literal = (value: unknown, note?: string) => ({
  ...(note !== undefined && { '//': note }),
  operator: 'literal',
  value,
})

/**
 * Whether v3 would read a value v2 took as data differently: it holds a node,
 * a `$` key, a `vars` or `//` key, or a reference ("The `literal` wrap")
 */
const needsQuote = (value: unknown): boolean => {
  if (typeof value === 'string') return V3_REFERENCE.test(value)
  if (Array.isArray(value)) return value.some(needsQuote)
  if (!isPlainObject(value)) return false
  return Object.entries(value).some(
    ([key, element]) =>
      key === 'operator' ||
      key === 'fragment' ||
      key.startsWith('$') ||
      key === 'vars' ||
      key === '//' ||
      needsQuote(element)
  )
}

/** A node in the fixed key order: `//`, `operator`, parameters, modifiers */
const assemble = (
  node: PlainObject,
  { comment, fallback, useCache, vars }: Record<string, unknown>
) => {
  const { operator, ...params } = node
  return {
    ...(comment !== undefined && { '//': comment }),
    operator,
    ...params,
    ...(fallback !== undefined && { fallback }),
    ...(useCache !== undefined && { useCache }),
    ...(vars !== undefined && { vars }),
  }
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
   * With the option on, v2 walked it: its `$` keys are definitions, which
   * become `vars`, and one holding `vars` or `//` as data can only be built.
   */
  private plain(input: PlainObject, path: Path, scope: Scope): unknown {
    if (!this.options.evaluateFullObject) return needsQuote(input) ? literal(input) : input
    const { vars, inner } = this.declare(input, path, scope)
    const entries = Object.entries(input)
      .filter(([key]) => !isAlias(key))
      .map(
        ([key, value]) => [key, this.value(value, this.pathOf(input, key, path), inner)] as const
      )
    if (entries.some(([key]) => key === 'vars' || key === '//'))
      return assemble(
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
    const vars = Object.fromEntries(
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
    const { operator } = input
    // Stage 1 left these as written, name and all, so they are quoted whole
    const resolved = typeof operator === 'string' ? v2OperatorFor(operator) : undefined
    if (resolved !== undefined && Object.hasOwn(input, 'children'))
      return this.placeholder(input, 'computed-children', this.pathOf(input, 'children', path), {
        operator: String(operator),
      })
    if (typeof operator !== 'string' || !Object.hasOwn(V2_PARAMETERS, operator)) {
      const name = typeof operator === 'string' ? operator : JSON.stringify(operator)
      return this.placeholder(input, 'unknown-operator', this.pathOf(input, 'operator', path), {
        name,
      })
    }

    const v2Operator = operator as V2Operator
    const rule = V3_RULES[v2Operator]
    if (rule === undefined) throw new Error(`TO-DO: the rule for ${operator} (chunk 5)`)
    const parameters = V2_PARAMETERS[v2Operator]
      .map(({ name }) => name)
      .filter((name) => name !== 'useCache')

    const { vars, inner } = this.declare(input, path, scope)
    const notes: string[] = []
    const context = this.context(input, path, notes)
    const converted = (key: string) => this.value(input[key], this.pathOf(input, key, path), inner)

    const v2: PlainObject = {}
    for (const name of parameters) if (Object.hasOwn(input, name)) v2[name] = converted(name)
    // TO-DO: a result that is not a node (chunk 5)
    const result = applyRule(rule, v2, context) as PlainObject

    const useCache = Object.hasOwn(input, 'useCache')
      ? this.useCache(input.useCache, v2Operator, context)
      : undefined
    const comment = this.comment(input, parameters, notes)
    const fallback = Object.hasOwn(input, 'fallback') ? converted('fallback') : undefined

    if (!Object.hasOwn(input, 'outputType'))
      return assemble(result, { comment, fallback, useCache, vars })

    // v2 never converted a fallback's result, and caught a failure of the
    // conversion, so `fallback` and `vars` go on the wrapper
    const to = converted('outputType')
    context.issue('output-type', 'outputType', { differences: differences(to) })
    return assemble(
      {
        operator: 'convert',
        value: assemble(result, { comment, useCache }),
        to: to === 'bool' ? 'boolean' : to,
      },
      { fallback, vars }
    )
  }

  /**
   * The context a rule is given: issues it raises are reported where their
   * value came from, and a `non-convertible` one is also noted on the node
   */
  private context(input: PlainObject, path: Path, notes: string[]): RuleContext {
    return {
      options: this.options,
      path,
      issue: <C extends IssueCode>(code: C, at: string | undefined, ...fill: Fill<C>) => {
        const raised = issue(code, at === undefined ? path : this.pathOf(input, at, path), ...fill)
        this.issues.push(raised)
        if (raised.tag === 'non-convertible') notes.push(`${NOTE}${raised.message}`)
      },
    }
  }

  /**
   * v3 takes a literal boolean only. Where v2 cached, anything else is a
   * deciding value, and v2's default is written; elsewhere v2 ignored it.
   */
  private useCache(value: unknown, operator: V2Operator, context: RuleContext) {
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
  private comment(input: PlainObject, parameters: string[], notes: string[]) {
    const known = ['operator', ...parameters, ...MODIFIERS, '//']
    const ignored = Object.fromEntries(
      Object.entries(input).filter(([key]) => !known.includes(key) && !isAlias(key))
    )
    Object.assign(ignored, this.sources.get(input)?.ignored)
    const parts = [
      ...notes,
      ...(Object.hasOwn(input, '//') ? [input['//']] : []),
      ...(Object.keys(ignored).length > 0 ? [ignored] : []),
    ]
    return parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : parts
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
