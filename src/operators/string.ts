/**
 * Batch 4 — string (docs-dev/v3-specs/v3-operator-parameters.md). The
 * batch has a deliberate split personality, mirroring the Type area's
 * cast-is-not-a-render line: the two RENDERERS (`buildString`, `join`)
 * accept anything wherever text is being produced and render it by the
 * stringification table, while the VALUE operators (`split`, `lower`,
 * `upper`, `trim`, `regex`) take strict strings — `{ $lower: 42 }` is a
 * type error, never `"42"`. One shared whitespace set, one code-point
 * segmentation and one renderer throughout (src/primitives).
 */
import { defineOperator } from '../defineOperator'
import type { ValidateFinding } from '../operatorDefinition'
import { OperatorFailure } from '../OperatorFailure'
import {
  renderText,
  stripLeadingRun,
  stripTrailingRun,
  toCodePoints,
  trim as trimText,
} from '../primitives'
import { scanTemplate } from '../templateTokens'
import { emptyAggregateWarning } from './shared'

const normalizer = (name: string, description: string, transform: (value: string) => string) =>
  defineOperator({
    name,
    category: 'string',
    description,
    parameters: { value: { type: ['string', 'null'] } },
    positionalParams: ['value'],
    returns: 'string',
    evaluate: ({ value }) => transform(value),
  })

export const lower = normalizer(
  'lower',
  'Lowercase a string — Unicode default case mapping, locale-independent',
  (value) => value.toLowerCase()
)
export const upper = normalizer(
  'upper',
  'Uppercase a string — Unicode default case mapping, locale-independent',
  (value) => value.toUpperCase()
)
export const trim = normalizer(
  'trim',
  'Strip whitespace (the JS trim set) from both ends of a string',
  trimText
)

export const split = defineOperator({
  name: 'split',
  category: 'string',
  description:
    'Divide a string on a delimiter into an array of pieces — empty pieces are kept; an empty delimiter splits into code points',
  parameters: {
    value: { type: ['string', 'null'], description: 'The string to divide' },
    delimiter: {
      type: 'string',
      default: ' ',
      description: 'Split on each occurrence; "" splits into code points',
    },
    trim: { type: 'boolean', default: true, description: 'Trim whitespace from each piece' },
  },
  positionalParams: ['value', 'delimiter'],
  returns: 'array',
  evaluate: ({ value, delimiter, trim }) => {
    const pieces = delimiter === '' ? toCodePoints(value) : value.split(delimiter)
    return trim ? pieces.map(trimText) : pieces
  },
})

// ── The renderers ───────────────────────────────────────────────────

/** A value that renders to a `<array>` / `<object>` placeholder. */
const isComposite = (value: unknown): boolean => value !== null && typeof value === 'object'

/**
 * A literal `values` element that is statically a composite: it can only
 * ever render as the placeholder, so unlike a data-driven composite it is
 * an authoring slip with no reading behind it.
 */
const compositeValuesErrors = (literalParams: Record<string, unknown>): ValidateFinding[] =>
  Array.isArray(literalParams.values) && literalParams.values.some(isComposite)
    ? [
        {
          severity: 'error',
          parameter: 'values',
          message:
            'a composite element renders as a placeholder, never as text — drill in, or join it explicitly',
        },
      ]
    : []

/**
 * One rendered piece of the output: template text, or a token site. A
 * site carries the token it rendered, for trace.
 */
type Part = { text: string; site: false } | { text: string; site: true; token: string }

/**
 * `closeGaps`: a token site that rendered `""` also consumes the maximal
 * whitespace run immediately BEFORE it — or, where there is none (the
 * token opens the template, or the preceding character isn't whitespace),
 * the run immediately after. Leading-preferred is what carries the
 * punctuation case without the operator knowing anything about
 * punctuation: 'My name is {{first}} {{last}}.' closes to 'My name is
 * Carl.', while 'one, {{two}}, three' keeps its doubled comma — this is a
 * whitespace rule, deliberately not a punctuation one.
 *
 * It runs over the parsed segment list, never as a pattern over the
 * finished output, so whitespace lying between two pieces of literal text
 * can never be touched and the operator can only ever DELETE template
 * text. Stripping in place is also what gives "each run is consumed at
 * most once": a text piece that was entirely whitespace is empty
 * afterwards, so the next site finds no run there.
 *
 * Returns the tokens whose gaps were closed, for the caller to report.
 */
const closeTheGaps = (parts: Part[]): string[] => {
  const closed: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part.site || part.text !== '') continue
    const before = parts[i - 1]
    if (before !== undefined && !before.site) {
      const stripped = stripTrailingRun(before.text)
      if (stripped !== before.text) {
        before.text = stripped
        closed.push(part.token)
        continue
      }
    }
    const after = parts[i + 1]
    if (after !== undefined && !after.site) {
      const stripped = stripLeadingRun(after.text)
      if (stripped !== after.text) closed.push(part.token)
      after.text = stripped
    }
  }
  return closed
}

export const buildString = defineOperator({
  name: 'buildString',
  category: 'string',
  description: 'Render a template, filling its tokens — the result is always a string',
  parameters: {
    template: {
      type: ['string', 'null'],
      description:
        'The text, with %N or {{name}} tokens; in a literal template, {{$data.x}} is that reference',
    },
    substitutions: {
      type: ['array', 'object'],
      default: [],
      elementNullPolicy: 'value',
      description:
        'An array pairs with %N tokens, an object with {{name}} tokens; the mode dispatches on which arrives',
    },
    trim: {
      type: 'boolean',
      default: false,
      description: 'Trim whitespace from each rendered value, never from the template text',
    },
    closeGaps: {
      type: 'boolean',
      default: false,
      description: 'A value that renders empty also takes one run of adjacent template whitespace',
    },
    nullValueDefault: {
      type: ['string', 'number', 'boolean'],
      required: false,
      evaluation: 'lazy',
      replacesNullAt: ['substitutions'],
      description: 'Rendered in place of a null value, instead of ""',
    },
  },
  positionalParams: ['template', '...substitutions'],
  returns: 'string',
  evaluate: ({ template, substitutions, trim: trimValues, closeGaps }, context) => {
    // Mode dispatches on the resolved shape — the `plus` pattern: dispatch
    // is semantics, so it survives `runtimeTypeCheck: false`, and the
    // declared type has already refused anything that is neither
    const list = Array.isArray(substitutions) ? substitutions : undefined
    const named = list === undefined ? (substitutions as Record<string, unknown>) : undefined
    const parts: Part[] = []

    for (const segment of scanTemplate(template)) {
      if (segment.kind === 'text') {
        parts.push({ text: segment.text, site: false })
        continue
      }
      // Cross-style tokens are inert in the other mode — half of the
      // no-escape design, and what makes a percent-encoded URL safe in a
      // named template and a Mustache template safe in a positional one
      const bound =
        segment.kind === 'positional'
          ? list !== undefined && segment.index >= 1 && segment.index <= list.length
          : named !== undefined && Object.hasOwn(named, segment.body)

      if (!bound) {
        // An unbound token renders its own text, verbatim: the end user
        // sees slightly-odd output and keeps working, the admin they
        // report it to sees exactly what is wrong
        context.trace.note({ type: 'render', token: segment.raw, rendered: 'literal' })
        parts.push({ text: segment.raw, site: false })
        continue
      }

      const value =
        segment.kind === 'positional'
          ? (list as unknown[])[segment.index - 1]
          : (named as Record<string, unknown>)[segment.body]
      const rendered = renderText(value)
      if (isComposite(value))
        context.trace.note({ type: 'render', token: segment.raw, rendered: 'placeholder' })
      const text = trimValues ? trimText(rendered) : rendered
      if (text === '') context.trace.note({ type: 'render', token: segment.raw, rendered: 'empty' })
      parts.push({ text, site: true, token: segment.raw })
    }

    if (closeGaps)
      for (const token of closeTheGaps(parts))
        context.trace.note({ type: 'render', token, rendered: 'gap-closed' })
    return parts.map((part) => part.text).join('')
  },
})

export const join = defineOperator({
  name: 'join',
  category: 'string',
  description: 'Render array elements to text and concatenate them with a delimiter',
  parameters: {
    values: {
      type: 'array',
      elementNullPolicy: 'value',
      description:
        'Elements of any type, rendered by the stringification table; a null renders "" and still occupies its slot',
    },
    delimiter: {
      type: 'string',
      default: ' ',
      description: 'Placed between each adjacent pair — shares its contract with split',
    },
    nullValueDefault: {
      type: ['string', 'number', 'boolean'],
      required: false,
      evaluation: 'lazy',
      replacesNullAt: ['values'],
      description: 'Rendered in place of a null element, instead of ""',
    },
  },
  positionalParams: ['...values'],
  returns: 'string',
  validate: (literalParams) => [
    ...emptyAggregateWarning(literalParams),
    ...compositeValuesErrors(literalParams),
  ],
  // A null element renders "" and KEEPS its delimiter: a positional
  // record must not shift its later columns. The skip reading is one
  // `filter` away; under skip, keeping would be inexpressible
  evaluate: ({ values, delimiter }, context) =>
    values
      .map((value, index) => {
        const token = `[${index}]`
        if (value === null) context.trace.note({ type: 'render', token, rendered: 'empty' })
        else if (isComposite(value))
          context.trace.note({ type: 'render', token, rendered: 'placeholder' })
        return renderText(value)
      })
      .join(delimiter),
})

// ── regex ───────────────────────────────────────────────────────────

/**
 * The admitted flag letters. `g` and `y` are barred, and the ban is
 * load-bearing rather than squeamish: `g` is what makes a JS RegExp
 * stateful and what flips `String.match`'s return shape, and in v3 the
 * result shape is declared by `mode` — a literal union the engine and the
 * editor can read — never smuggled through the content of a string
 * parameter. The global scan `mode: 'match'` needs is the operator's own
 * business, on an instance it builds for the call.
 */
const ADMITTED_FLAGS = 'imsu'

export const checkFlags = (flags: string): string | undefined => {
  const seen = new Set<string>()
  const unknown: string[] = []
  for (const flag of flags) {
    if (!ADMITTED_FLAGS.includes(flag)) {
      if (!unknown.includes(flag)) unknown.push(flag)
      continue
    }
    if (seen.has(flag)) return `duplicate regex flag '${flag}'`
    seen.add(flag)
  }
  if (unknown.length === 0) return undefined
  const hint =
    unknown.includes('g') || unknown.includes('y') ? " — all matches is mode: 'match'" : ''
  return `unknown regex flag${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}${hint}`
}

export const regex = defineOperator({
  name: 'regex',
  category: 'string',
  description: 'Test, extract or match a string against a regular expression',
  parameters: {
    value: { type: ['string', 'null'], description: 'The subject string' },
    pattern: { type: ['string', 'null'], description: 'The regular expression source' },
    flags: { type: 'string', default: '', description: 'The admitted subset: i, m, s, u' },
    mode: {
      type: { literal: ['test', 'extract', 'match'] },
      default: 'test',
      description:
        'test gives a boolean, extract the first matching substring, match every one of them',
    },
    noMatchDefault: {
      type: 'any',
      required: false,
      default: null,
      nullPolicy: 'value',
      evaluation: 'lazy',
      description:
        'The extract answer when nothing matches — a matched empty string still passes through',
    },
  },
  positionalParams: ['value', 'pattern'],
  returns: ['boolean', 'string', 'array', 'null'],
  validate: ({ pattern, flags }) => {
    const findings = []
    const problem = typeof flags === 'string' ? checkFlags(flags) : undefined
    if (problem !== undefined)
      findings.push({ severity: 'error' as const, parameter: 'flags', message: problem })
    // A dynamic pattern simply isn't present, so the guard doubles as the
    // mode check: the overwhelming case is a literal, compiled here so a
    // malformed regex is an authoring error. Flags that failed their own
    // check are left out of the compile, so a flag problem is reported
    // once, as a flag problem
    if (typeof pattern === 'string') {
      try {
        new RegExp(pattern, typeof flags === 'string' && problem === undefined ? flags : '')
      } catch (error) {
        findings.push({
          severity: 'error' as const,
          parameter: 'pattern',
          message: `pattern does not compile: ${(error as Error).message}`,
        })
      }
    }
    return findings
  },
  evaluate: ({ value, pattern, flags, mode, noMatchDefault }) => {
    const problem = checkFlags(flags)
    if (problem !== undefined) throw new OperatorFailure(problem)
    // Constructed per use, so no global-scan `lastIndex` can ever leak
    // between evaluations
    const compile = (extra: string) => {
      try {
        return new RegExp(pattern, flags + extra)
      } catch (error) {
        throw new OperatorFailure(`pattern does not compile: ${(error as Error).message}`)
      }
    }
    switch (mode) {
      case 'test':
        return compile('').test(value)
      case 'extract': {
        const found = compile('').exec(value)
        // A matched empty string is a MATCH and passes through — which is
        // what splits "matched nothing" from "matched ''"
        return found === null ? noMatchDefault.evaluate() : found[0]
      }
      case 'match':
        return [...value.matchAll(compile('g'))].map((found) => found[0])
    }
  },
})
