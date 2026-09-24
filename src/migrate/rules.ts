/**
 * What each canonical v2 node becomes in v3 ("The v2→v3 rules" in
 * docs-dev/v3-specs/v3-converter.md), one entry per v2 operator. A rule sees
 * its node with every parameter already converted, and never recurses: stage
 * 2 converts the values first and attaches the modifiers after
 * ("Where rules sit").
 */
import type { V2Options } from '../migrationTypes'
import type { Fill, IssueCode, Path } from './issues'
import { templateRewrite } from './templates'
import type { V2Operator } from './v2/operators.generated'
import { V3_NAMES } from './v3Names.generated'
import {
  DRILLABLE,
  dataReference,
  isComputed,
  isLiteral,
  isNode,
  isPlainObject,
  isV3Path,
  needsQuote,
  quoted,
  render,
  unquote,
  type PlainObject,
} from './v3Values'

/** What a rule may ask of stage 2 */
export interface RuleContext {
  options: V2Options
  /** The node's path in the input */
  path: Path
  /** Where a v2 parameter's value came from in the input */
  at: (key: string) => Path
  /**
   * Raises `code` at `at`: a v2 parameter, reported where its value came
   * from, a path below one (`['properties', 2]`), or the node itself when
   * `at` is undefined
   */
  issue: <C extends IssueCode>(code: C, at: string | Path | undefined, ...fill: Fill<C>) => void
  /** A var name nothing in reach uses, for a value the rule binds */
  freshVar: (base: string) => string
}

/**
 * The node's `fallback` and `outputType`, converted. A `build` may take one
 * over, deleting it, or supply one.
 */
export interface Modifiers {
  fallback?: unknown
  outputType?: unknown
  /** The v2 key the output type came from, where its issue is reported */
  outputTypeAt?: string
}

/**
 * What the fates and `add` make of a node: its v3 operator and parameters,
 * and every v2 parameter it had, by canonical name, each converted to v3
 */
export interface V3Draft {
  to: string | undefined
  params: PlainObject
  v2: PlainObject
  /**
   * The node's other keys v2 read, converted: MATCH's own branches beside a
   * computed `branches`, and SQL's computed `type`
   */
  extra: PlainObject
  modifiers: Modifiers
}

export type ParamFate =
  /** The v3 parameter it becomes, the same name if unchanged */
  | string
  /** Renamed and rewritten; `undefined` leaves the parameter out */
  | { to: string; value: (value: unknown, context: RuleContext) => unknown }
  /** Read by `build`, not carried over */
  | 'consumed'
  /** Not carried over, and nothing is lost: v3 has nothing for it to mean */
  | 'omitted'

export interface OperatorRule {
  /** The v3 operator the draft starts as; none when `build` writes it all */
  to?: string
  /** Every v2 parameter, by canonical name, apart from `useCache` */
  params: Record<string, ParamFate>
  /** Parameters the v3 node gains */
  add?: PlainObject
  /** What data can't say: the node's final v3 value */
  build?: (draft: V3Draft, context: RuleContext) => unknown
}

/** The draft as a node, under its own operator or another */
export const toNode = (draft: V3Draft, operator = draft.to): PlainObject => ({
  operator,
  ...draft.params,
})

/**
 * The reason a deciding value could not be read: computed, or a literal v2
 * did not accept ("The rule shape")
 */
export const undecided = (key: string, value: unknown) =>
  isComputed(value)
    ? `\`${key}\` is computed`
    : `\`${render(value)}\` is not a value v2 accepted for \`${key}\``

/** An object without the keys whose value is `undefined` */
const defined = (object: PlainObject) =>
  Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined))

// Batch 1

/**
 * v2's instance-wide `caseInsensitive` applied to a node that set none, and
 * v3's counterpart lives in the host's `operatorDefaults`
 */
const instanceCaseInsensitive = (draft: V3Draft, context: RuleContext) => {
  if (context.options.caseInsensitive === true && !Object.hasOwn(draft.v2, 'caseInsensitive'))
    context.issue('instance-case-insensitive', undefined, { operator: String(draft.to) })
  return toNode(draft)
}

/** v2 used the first two values and ignored the rest */
const firstTwo = (values: unknown[], context: RuleContext) => {
  if (values.length > 2)
    context.issue('values-cut', 'values', { removed: values.slice(2).map(render).join(', ') })
  return values.slice(0, 2)
}

/**
 * GREATER_THAN and LESS_THAN: `strict: false` is the inclusive operator, and
 * v2 compared only the first two values
 */
const ordering = (inclusive: string) => (draft: V3Draft, context: RuleContext) => {
  const { strict } = draft.v2
  const operator = strict === false ? inclusive : draft.to
  if (strict !== undefined && typeof strict !== 'boolean')
    context.issue('deciding-value', 'strict', {
      reason: undecided('strict', strict),
      wrote: `\`${draft.to}\``,
      key: 'strict',
    })
  const { values } = draft.params
  if (Array.isArray(values)) draft.params.values = firstTwo(values, context)
  return toNode(draft, operator)
}

/**
 * v2 (from 2.23.1) turned `\n`, `\t` and `\r` typed as text in a delimiter
 * into the characters they name, and v3 splits on what it is given
 */
const unescapedDelimiter = (value: unknown, context: RuleContext) => {
  if (isComputed(value)) context.issue('computed-delimiter', 'delimiter')
  else if (typeof value === 'string')
    return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
  return value
}

/**
 * v2 dropped one trailing empty piece unless `excludeTrailing` was `false`,
 * and v3 keeps it
 */
const trailingEmpty = (draft: V3Draft, context: RuleContext) => {
  if (draft.v2.excludeTrailing !== false) context.issue('split-trailing-empty', undefined)
  return toNode(draft)
}

// Batch 2

/**
 * PLUS's `type` coerced the operands, and, since v2 read `outputType ??
 * type`, converted the result. For three of its values the operator chosen
 * already gives that type.
 */
const plusType = (draft: V3Draft, context: RuleContext) => {
  if (!Object.hasOwn(draft.v2, 'type')) return toNode(draft)
  const { type } = draft.v2
  const { values } = draft.params
  switch (type) {
    case 'string':
      // v2 concatenated each operand as text, numbers included
      return { operator: 'join', ...draft.params, delimiter: '' }
    case 'array':
      // v2 appended an operand that was not an array as one element
      if (Array.isArray(values))
        draft.params.values = values.map((value) =>
          Array.isArray(unquote(value)) || isComputed(value) ? value : [value]
        )
      return { ...toNode(draft), expect: 'array' }
    case 'number':
      return { ...toNode(draft), expect: 'number' }
    case 'boolean':
    case 'bool':
      if (!Object.hasOwn(draft.modifiers, 'outputType'))
        Object.assign(draft.modifiers, { outputType: 'boolean', outputTypeAt: 'type' })
      return toNode(draft)
  }
  context.issue('deciding-value', 'type', {
    reason: undecided('type', type),
    wrote: '`plus`',
    key: 'type',
  })
  return toNode(draft)
}

/**
 * SUBTRACT and DIVIDE took `values: [a, b]` or a named pair, and `values`
 * won. A computed `values` is bound once and indexed, unless it is a
 * reference, which can be indexed as it is.
 */
const binary =
  (first: string, second: string, infix: string) =>
  (draft: V3Draft, context: RuleContext): PlainObject => {
    const operands = (value: unknown, other: unknown) =>
      defined({ operator: draft.to, value, [infix]: other })
    const { values } = draft.v2
    if (values === undefined) return operands(draft.v2[first], draft.v2[second])

    const winner = String(context.at('values').at(-1))
    for (const name of [first, second])
      if (Object.hasOwn(draft.v2, name))
        context.issue('overridden-value', name, {
          key: String(context.at(name).at(-1)),
          winner,
        })
    if (Array.isArray(values)) {
      const [value, other] = firstTwo(values, context)
      return operands(value, other)
    }
    if (typeof values === 'string' && DRILLABLE.test(values))
      return operands(`${values}[0]`, `${values}[1]`)
    const name = context.freshVar('values')
    return {
      ...operands(`$vars.${name}[0]`, `$vars.${name}[1]`),
      vars: { [name]: values },
    }
  }

const subtraction = binary('from', 'subtract', 'minus')
const division = binary('dividend', 'divisor', 'by')

/** DIVIDE's `output`: v2's default was true division */
const divideOutput = (draft: V3Draft, context: RuleContext) => {
  const { vars, ...divide } = division(draft, context)
  const { output } = draft.v2
  const withVars = (node: PlainObject) => ({ ...node, ...(vars !== undefined && { vars }) })
  switch (output) {
    case undefined:
    case 'decimal':
      return withVars(divide)
    case 'quotient':
      return withVars({ operator: 'floor', value: divide })
    case 'remainder': {
      context.issue('remainder-sign', 'output')
      const { value, by } = divide
      return withVars(defined({ operator: 'modulo', value, mod: by }))
    }
  }
  context.issue('deciding-value', 'output', {
    reason: undecided('output', output),
    wrote: '`divide`',
    key: 'output',
  })
  return withVars(divide)
}

// Batch 3

/** v2 read from its data with `additionalData` merged over it */
const mergedWithData = (value: unknown) => ({ operator: 'plus', values: ['$data', value] })

const IS_TYPE: Record<string, (value: unknown) => boolean> = {
  number: (value) => typeof value === 'number',
  string: (value) => typeof value === 'string',
  boolean: (value) => typeof value === 'boolean',
  array: Array.isArray,
}

/**
 * OBJECT_PROPERTIES' `fallback` becomes `missingPathDefault`, which the
 * `outputType` wrapper then converts, where v2 returned the fallback as it
 * was
 */
const convertedDefault = (fallback: unknown, outputType: unknown, context: RuleContext) => {
  const type = outputType === 'bool' ? 'boolean' : outputType
  const fits =
    !isComputed(fallback) &&
    typeof type === 'string' &&
    Object.hasOwn(IS_TYPE, type) &&
    IS_TYPE[type](unquote(fallback))
  if (!fits)
    context.issue('fallback-converted', 'fallback', {
      type: isComputed(type) ? 'the type `outputType` computes' : `\`${String(unquote(type))}\``,
    })
}

/**
 * OBJECT_PROPERTIES: a literal path and nothing else is a reference, and the
 * rest a `get`. A `fallback` caught the missing path in v2, which is `get`'s
 * `missingPathDefault`, so the rule takes it over.
 */
const preferReference = (draft: V3Draft, context: RuleContext) => {
  const { modifiers } = draft
  if (Object.hasOwn(modifiers, 'fallback')) {
    const { fallback } = modifiers
    delete modifiers.fallback
    if (Object.hasOwn(modifiers, 'outputType'))
      convertedDefault(fallback, modifiers.outputType, context)
    return { ...toNode(draft), missingPathDefault: fallback }
  }
  const { path } = draft.params
  if (Object.hasOwn(draft.params, 'from') || typeof path !== 'string' || !isV3Path(path))
    return toNode(draft)
  return dataReference(path)
}

/**
 * BUILD_OBJECT's entries: an alternating array is paired as v2 paired it,
 * and an entry missing its `key` or `value` goes, as v2 skipped it
 */
const literalEntries = (value: unknown, context: RuleContext) => {
  if (!Array.isArray(value)) return value
  const entries: unknown[] = []
  const isEntry = (element: unknown) =>
    isPlainObject(element) && (!isLiteral(element) || isPlainObject(element.value))
  if (!value.every(isEntry)) {
    for (let i = 0; i < value.length; i += 2)
      if (i + 1 < value.length) entries.push({ key: value[i], value: value[i + 1] })
      else context.issue('malformed-entry', ['properties', i])
    return entries
  }
  value.forEach((element, i) => {
    if (isNode(element) || (Object.hasOwn(element, 'key') && Object.hasOwn(element, 'value')))
      entries.push(element)
    else context.issue('malformed-entry', ['properties', i])
  })
  return entries
}

/** MATCH's alternating keys and values, as the object v3 takes */
const pairsToObject = (value: unknown) => {
  if (!Array.isArray(value)) return value
  const branches: PlainObject = {}
  for (let i = 0; i + 1 < value.length; i += 2) {
    const key = value[i]
    if (typeof key === 'string' || typeof key === 'number' || typeof key === 'boolean')
      branches[String(key)] = value[i + 1]
  }
  return branches
}

/**
 * MATCH: a `fallback` branch is the default. Beside a computed `branches`,
 * the node's own branches were reached when the computed object had neither
 * the key nor a `fallback`, so they are a second `match` in `default`, which
 * keeps them unevaluated until then.
 */
const matchBranches = (draft: V3Draft, context: RuleContext) => {
  const { value, branches = {} } = draft.params
  if (isPlainObject(branches) && !isNode(branches)) {
    if (!Object.hasOwn(branches, 'fallback')) return { ...toNode(draft), branches }
    const { fallback, ...rest } = branches
    return { ...toNode(draft), branches: rest, default: fallback }
  }

  context.issue('computed-branches', 'branches')
  if (Object.keys(draft.extra).length === 0) return toNode(draft)
  let matched = value
  let vars: PlainObject | undefined
  if (isNode(value) && !isLiteral(value)) {
    const name = context.freshVar('value')
    matched = `$vars.${name}`
    vars = { [name]: value }
  }
  return {
    ...toNode(draft),
    value: matched,
    default: { operator: 'match', value: matched, branches: draft.extra },
    ...(vars !== undefined && { vars }),
  }
}

// Batch 4

/**
 * v2 accepted `url: { url, headers }`, whose headers went beneath the
 * node's own. It was data, so each part stays quoted where v3 would read it.
 */
const splitUrl = (params: PlainObject) => {
  const given = unquote(params.url)
  if (isComputed(params.url) || !isPlainObject(given)) return
  const { url, headers } = given
  params.url = quoted(url)
  if (headers === undefined) return
  const over = params.headers
  params.headers =
    over === undefined
      ? quoted(headers)
      : isPlainObject(over) && !isNode(over) && isPlainObject(headers) && !needsQuote(headers)
        ? { ...headers, ...over }
        : { operator: 'plus', values: [quoted(headers), over] }
}

/**
 * GET and POST: every converted request gets the collapse issue, since
 * whether v2's collapse fired depends on the response. v2 always sent a
 * POST a JSON body.
 */
const httpRequest = (draft: V3Draft, context: RuleContext) => {
  splitUrl(draft.params)
  const { url, method, query, body, headers, returnPath } = draft.params
  context.issue('response-collapse', undefined)
  return defined({
    operator: 'http',
    url,
    method,
    query,
    body: method === 'post' ? (body ?? {}) : body,
    headers,
    returnPath,
  })
}

/**
 * GRAPHQL: an empty `url`, or v2's placeholder, meant the configured
 * endpoint, as an omitted `url` does in v3
 */
const graphQLRequest = (draft: V3Draft, context: RuleContext) => {
  splitUrl(draft.params)
  const { url } = draft.params
  if (url === '' || (typeof url === 'string' && url.toLowerCase() === 'graphqlendpoint'))
    delete draft.params.url
  else if (typeof url === 'string' && !/^https?:\/\/.+/.test(url))
    context.issue('graphql-relative-url', 'url')
  context.issue('response-collapse', undefined)
  return toNode(draft)
}

const SHAPES: Record<string, string> = {
  '00': 'rows',
  '10': 'firstRow',
  '01': 'column',
  '11': 'firstValue',
}

/**
 * SQL: `single` and `flatten` are one `shape`. A computed `type` was also
 * v2's `flatten` rider, so beside a `flatten` that is not `true` it decides
 * too.
 */
const sqlShape = (draft: V3Draft, context: RuleContext) => {
  const undecidedKeys: [string, unknown][] = []
  const flag = (key: string, value: unknown) => {
    if (value === undefined || typeof value === 'boolean') return value === true
    undecidedKeys.push([key, value])
    return false
  }
  const single = flag('single', draft.v2.single)
  let flatten = flag('flatten', draft.v2.flatten)
  if (!flatten && Object.hasOwn(draft.extra, 'type')) flatten = flag('type', draft.extra.type)
  const shape = SHAPES[`${Number(single)}${Number(flatten)}`]
  for (const [key, value] of undecidedKeys)
    context.issue('deciding-value', key, {
      reason: undecided(key, value),
      wrote: `\`shape: '${shape}'\``,
      key,
    })
  return { ...toNode(draft), ...(shape !== 'rows' && { shape }) }
}

// Batch 5

/** Why v3 cannot register an operator under a v2 function's name */
const unregistrable = (name: string) => {
  const illegal = name.startsWith('$') ? '$' : /[.[\]]/.exec(name)?.[0]
  if (illegal === '$') return `\`${name}\` starts with \`$\`, which a v3 name cannot`
  if (illegal !== undefined) return `\`${name}\` holds a \`${illegal}\`, which a v3 name cannot`
  if (Object.hasOwn(V3_NAMES, name)) return `\`${name}\` is already a v3 operator's name`
  return undefined
}

/**
 * A call on a v2 function, on the v3 operator the host registers under its
 * name. v2 called it as `f(input, ...args)`. Positional arguments are
 * written in shorthand, which binds to whatever positional parameters the
 * host's operator declares; `input` has no positional reading.
 */
const functionCall = (draft: V3Draft, context: RuleContext) => {
  const name = String(unquote(draft.v2.functionName))
  context.issue('custom-function-call', undefined, { name, rename: unregistrable(name) })
  const { args, input } = draft.v2
  if (!Object.hasOwn(draft.v2, 'input')) return { [`$${name}`]: args ?? [] }
  const listed = args === undefined || Array.isArray(args) || isComputed(args) ? args : [args]
  return defined({ operator: name, input, args: listed })
}

export const V3_RULES: Record<V2Operator, OperatorRule> = {
  // Batch 1
  AND: { to: 'and', params: { values: 'values' } },
  OR: { to: 'or', params: { values: 'values' } },
  MULTIPLY: { to: 'multiply', params: { values: 'values' } },
  EQUAL: {
    to: 'equal',
    params: {
      values: 'values',
      caseInsensitive: 'caseInsensitive',
      nullEqualsUndefined: 'omitted',
    },
    build: instanceCaseInsensitive,
  },
  NOT_EQUAL: {
    to: 'notEqual',
    params: {
      values: 'values',
      caseInsensitive: 'caseInsensitive',
      nullEqualsUndefined: 'omitted',
    },
    build: instanceCaseInsensitive,
  },
  GREATER_THAN: {
    to: 'greaterThan',
    params: { values: 'values', strict: 'consumed' },
    build: ordering('greaterThanOrEqual'),
  },
  LESS_THAN: {
    to: 'lessThan',
    params: { values: 'values', strict: 'consumed' },
    build: ordering('lessThanOrEqual'),
  },
  CONDITIONAL: {
    to: 'if',
    params: { condition: 'condition', valueIfTrue: 'then', valueIfFalse: 'else' },
  },
  REGEX: { to: 'regex', params: { testString: 'value', pattern: 'pattern' } },
  COUNT: { to: 'length', params: { values: 'value' } },
  SPLIT: {
    to: 'split',
    params: {
      value: 'value',
      delimiter: { to: 'delimiter', value: unescapedDelimiter },
      trimWhiteSpace: 'trim',
      excludeTrailing: 'consumed',
    },
    build: trailingEmpty,
  },

  // Batch 2
  PLUS: { to: 'plus', params: { values: 'values', type: 'consumed' }, build: plusType },
  SUBTRACT: {
    to: 'subtract',
    params: { values: 'consumed', from: 'consumed', subtract: 'consumed' },
    build: subtraction,
  },
  DIVIDE: {
    to: 'divide',
    params: { values: 'consumed', dividend: 'consumed', divisor: 'consumed', output: 'consumed' },
    build: divideOutput,
  },

  // Batch 3
  OBJECT_PROPERTIES: {
    to: 'get',
    params: { property: 'path', additionalData: { to: 'from', value: mergedWithData } },
    build: preferReference,
  },
  STRING_SUBSTITUTION: {
    to: 'buildString',
    params: {
      string: 'template',
      substitutions: 'substitutions',
      trimWhiteSpace: 'consumed',
      substitutionCharacter: 'consumed',
      numberMapping: 'consumed',
    },
    build: templateRewrite,
  },
  BUILD_OBJECT: {
    to: 'buildObject',
    params: { properties: { to: 'entries', value: literalEntries } },
  },
  MATCH: {
    to: 'match',
    params: { matchExpression: 'value', branches: { to: 'branches', value: pairsToObject } },
    build: matchBranches,
  },
  PASSTHRU: {
    params: { value: 'consumed' },
    build: ({ v2 }) => (Object.hasOwn(v2, 'value') ? v2.value : null),
  },

  // Batch 4
  GET: {
    to: 'http',
    params: { url: 'url', parameters: 'query', headers: 'headers', returnProperty: 'returnPath' },
    build: httpRequest,
  },
  POST: {
    to: 'http',
    add: { method: 'post' },
    params: { url: 'url', parameters: 'body', headers: 'headers', returnProperty: 'returnPath' },
    build: httpRequest,
  },
  GRAPHQL: {
    to: 'graphQL',
    params: {
      query: 'query',
      url: 'url',
      headers: 'headers',
      variables: 'variables',
      returnNode: 'returnPath',
    },
    build: graphQLRequest,
  },
  SQL: {
    to: 'sql',
    params: { query: 'query', values: 'values', single: 'consumed', flatten: 'consumed' },
    build: sqlShape,
  },

  // Batch 5
  CUSTOM_FUNCTIONS: {
    params: { functionName: 'consumed', args: 'consumed', input: 'consumed' },
    build: functionCall,
  },
}

/** A rule applied to its node's converted parameters and modifiers */
export const applyRule = (
  rule: OperatorRule,
  node: Pick<V3Draft, 'v2' | 'extra' | 'modifiers'>,
  context: RuleContext
): unknown => {
  const params: PlainObject = {}
  for (const [name, fate] of Object.entries(rule.params)) {
    if (!Object.hasOwn(node.v2, name) || fate === 'consumed' || fate === 'omitted') continue
    if (typeof fate === 'string') params[fate] = node.v2[name]
    else {
      const value = fate.value(node.v2[name], context)
      if (value !== undefined) params[fate.to] = value
    }
  }
  Object.assign(params, rule.add)
  const draft: V3Draft = { to: rule.to, params, ...node }
  return rule.build ? rule.build(draft, context) : toNode(draft)
}
