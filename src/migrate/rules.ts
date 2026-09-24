/**
 * What each canonical v2 node becomes in v3 ("The v2→v3 rules" in
 * docs-dev/v3-specs/v3-converter.md), one entry per v2 operator. A rule sees
 * its node with every parameter already converted, and never recurses: stage
 * 2 converts the values first and attaches the modifiers after
 * ("Where rules sit").
 *
 * TO-DO: batches 2 to 5 (Phase 15.1, chunk 5).
 */
import type { V2Options } from '../migrationTypes'
import type { Fill, IssueCode, Path } from './issues'
import type { V2Operator } from './v2/operators.generated'

type PlainObject = Record<string, unknown>

/** What a rule may ask of stage 2 */
export interface RuleContext {
  options: V2Options
  /** The node's path in the input */
  path: Path
  /**
   * Raises `code` at the v2 parameter `at`, reported where its value came
   * from, or at the node when `at` is undefined
   */
  issue: <C extends IssueCode>(code: C, at: string | undefined, ...fill: Fill<C>) => void
}

/**
 * What the fates and `add` make of a node: its v3 operator and parameters,
 * and every v2 parameter it had, by canonical name, each converted to v3
 */
export interface V3Draft {
  to: string | undefined
  params: PlainObject
  v2: PlainObject
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
  /** The v3 operator the draft starts as */
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
 * Whether v2 worked a value out at evaluation: an expression or a reference.
 * A `literal` wraps what v2 read as a constant.
 */
export const isComputed = (value: unknown): boolean => {
  if (typeof value === 'string') return /^\$./.test(value)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  if (Object.hasOwn(value, 'operator')) return (value as PlainObject).operator !== 'literal'
  return Object.hasOwn(value, 'fragment')
}

/** A value as a message shows it: `'text'`, `[1,2]` */
export const render = (value: unknown): string => {
  const constant =
    typeof value === 'object' && value !== null && (value as PlainObject).operator === 'literal'
      ? (value as PlainObject).value
      : value
  const text = typeof constant === 'string' ? `'${constant}'` : JSON.stringify(constant)
  return text.length > 60 ? `${text.slice(0, 57)}...` : text
}

/**
 * The reason a deciding value could not be read: computed, or a literal v2
 * did not accept ("The rule shape")
 */
export const undecided = (key: string, value: unknown) =>
  isComputed(value)
    ? `\`${key}\` is computed`
    : `\`${render(value)}\` is not a value v2 accepted for \`${key}\``

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
  if (Array.isArray(values) && values.length > 2) {
    context.issue('values-cut', 'values', { removed: values.slice(2).map(render).join(', ') })
    draft.params.values = values.slice(0, 2)
  }
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

export const V3_RULES: Partial<Record<V2Operator, OperatorRule>> = {
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
}

/** A rule applied to its node's converted parameters */
export const applyRule = (rule: OperatorRule, v2: PlainObject, context: RuleContext): unknown => {
  const params: PlainObject = {}
  for (const [name, fate] of Object.entries(rule.params)) {
    if (!Object.hasOwn(v2, name) || fate === 'consumed' || fate === 'omitted') continue
    if (typeof fate === 'string') params[fate] = v2[name]
    else {
      const value = fate.value(v2[name], context)
      if (value !== undefined) params[fate.to] = value
    }
  }
  Object.assign(params, rule.add)
  const draft: V3Draft = { to: rule.to, params, v2 }
  return rule.build ? rule.build(draft, context) : toNode(draft)
}
